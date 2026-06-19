"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPersona } from "@/lib/pacientes/persona";
import {
  ESTADO_PACIENTE_GESTION_LABEL, labelTipoGestion, MODALIDAD_GESTION_LABEL,
  type EstadoPacienteGestion,
} from "@/lib/trabajosocial/catalogos";
import type { GestionTS, Persona } from "@/types";
import { FileClock, Loader2, Search, User } from "lucide-react";
import { GestionesTabs } from "../_components/GestionesTabs";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  return (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
}
function fmtHora(ts: unknown): string {
  const d = toDate(ts);
  return d ? d.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
}
function fmtFechaStr(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("es-HN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

const ESTADO_COLOR: Record<EstadoPacienteGestion, string> = {
  actual:    "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900",
  alta:      "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900",
  defuncion: "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
  na:        "text-slate-500 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700",
};

export default function BitacoraPage() {
  const [expediente, setExpediente] = useState("");
  const [buscado, setBuscado] = useState("");        // expediente efectivamente consultado
  const [persona, setPersona] = useState<Persona | null>(null);
  const [gestiones, setGestiones] = useState<GestionTS[]>([]);
  const [loading, setLoading] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  // Buscar al escribir el expediente (debounce 450 ms).
  useEffect(() => {
    const exp = expediente.trim();
    if (!exp) { setBuscado(""); setPersona(null); setGestiones([]); return; }
    let cancel = false;
    setLoading(true);
    const id = window.setTimeout(async () => {
      try {
        const [p, snap] = await Promise.all([
          getPersona(exp).catch(() => null),
          getDocs(query(collection(db, "gestiones_ts"), where("expediente", "==", exp))),
        ]);
        if (cancel) return;
        setPermissionError(false);
        setPersona(p);
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GestionTS));
        docs.sort((a, b) =>
          b.fecha.localeCompare(a.fecha) ||
          (toDate(b.creadoEn)?.getTime() ?? 0) - (toDate(a.creadoEn)?.getTime() ?? 0),
        );
        setGestiones(docs);
        setBuscado(exp);
      } catch (err) {
        if (!cancel) {
          if ((err as { code?: string }).code === "permission-denied") setPermissionError(true);
          setGestiones([]);
          setPersona(null);
          setBuscado(exp);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    }, 450);
    return () => { cancel = true; window.clearTimeout(id); };
  }, [expediente]);

  // Agrupar por fecha (ya vienen ordenadas desc por fecha + hora).
  const porFecha = useMemo(() => {
    const grupos: { fecha: string; items: GestionTS[] }[] = [];
    for (const g of gestiones) {
      const ult = grupos[grupos.length - 1];
      if (ult && ult.fecha === g.fecha) ult.items.push(g);
      else grupos.push({ fecha: g.fecha, items: [g] });
    }
    return grupos;
  }, [gestiones]);

  // Datos del paciente derivados de la gestión más reciente (sirve si no está en el padrón).
  const ultima = gestiones[0];
  const nombre = persona ? `${persona.apellidos}, ${persona.nombres}` : ultima?.pacienteNombre;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
          <FileClock size={13} /> Trabajo Social
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Bitácora del paciente</h1>
        <p className="text-xs text-slate-500 mt-0.5">Historial de todas las gestiones de un expediente</p>
      </div>

      <GestionesTabs />

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer las gestiones. Pide al administrador que despliegue la regla de la colección <strong>gestiones_ts</strong>.
        </div>
      )}

      {/* Buscador */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={expediente}
          onChange={(e) => setExpediente(e.target.value)}
          placeholder="Número de expediente (ej. 1-26)"
          className={inputCls + " pl-9 pr-9 font-mono"}
          autoFocus
        />
        {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
      </div>

      {/* Resultado */}
      {!buscado ? (
        <div className="text-center py-16 text-slate-400">
          <FileClock size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Escribe un expediente para ver su bitácora.</p>
        </div>
      ) : loading ? null : (
        <>
          {/* Ficha del paciente */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="font-mono text-xs text-slate-500">{buscado}</p>
                <p className="font-bold text-lg text-slate-900 dark:text-slate-100">{nombre ?? "—"}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {persona
                    ? [persona.telefono && `Tel. ${persona.telefono}`, persona.responsable?.nombre && `Resp. ${persona.responsable.nombre}`]
                        .filter(Boolean).join(" · ") || "Vinculado al padrón"
                    : "Expediente fuera del padrón de pacientes"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold font-heading text-blue-600 dark:text-blue-400">{gestiones.length}</p>
                <p className="text-xs text-slate-500">gestión(es)</p>
              </div>
            </div>
          </div>

          {gestiones.length === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center">Este expediente no tiene gestiones registradas.</p>
          ) : (
            <div className="space-y-6">
              {porFecha.map(({ fecha, items }) => (
                <div key={fecha}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2.5 capitalize">{fmtFechaStr(fecha)}</p>
                  <div className="space-y-2 border-l-2 border-slate-200 dark:border-slate-800 pl-4 ml-1">
                    {items.map((g) => (
                      <div key={g.id} className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                        <span className="absolute -left-[21px] top-4 w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-950" />
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 dark:text-slate-200 break-words">{labelTipoGestion(g.tipo)}</p>
                            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1"><User size={11} className="text-slate-400" /> {g.trabajadoraNombre}</span>
                              <span className="text-slate-300 dark:text-slate-600">·</span>
                              <span>{fmtHora(g.creadoEn)}</span>
                              <span className="text-slate-300 dark:text-slate-600">·</span>
                              <span>{g.modalidad ? MODALIDAD_GESTION_LABEL[g.modalidad] : "Presencial"}{g.duracionMin ? ` · ${g.duracionMin} min` : ""}</span>
                              {g.servicio && <><span className="text-slate-300 dark:text-slate-600">·</span><span>{g.servicio}</span></>}
                            </p>
                          </div>
                          <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-1 rounded-lg border ${ESTADO_COLOR[g.estadoPaciente]}`}>
                            {ESTADO_PACIENTE_GESTION_LABEL[g.estadoPaciente]}
                          </span>
                        </div>
                        {g.notas && <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 break-words whitespace-pre-wrap">{g.notas}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
