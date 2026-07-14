"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { getPersona } from "@/lib/pacientes/persona";
import {
  ESTADO_PACIENTE_GESTION_LABEL, labelTipoGestion, MODALIDAD_GESTION_LABEL,
  RESULTADO_VISITA_COLOR, RESULTADO_VISITA_LABEL,
  type EstadoPacienteGestion,
} from "@/lib/trabajosocial/catalogos";
import type { GestionTS, IntentoContactoTS, Persona } from "@/types";
import { FileClock, History, Loader2, Search, User } from "lucide-react";

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

// Entrada unificada de la línea de tiempo: gestiones + intentos de contacto
// del rastreo (heredados de rastreos_ts.intentosContacto).
type ItemBitacora =
  | { kind: "gestion"; fecha: string; orden: number; g: GestionTS }
  | { kind: "intento"; fecha: string; orden: number; it: IntentoContactoTS };

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
  const [intentos, setIntentos] = useState<IntentoContactoTS[]>([]);
  const [loading, setLoading] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  // Al escribir: resetea o enciende el spinner AQUÍ (handler, no en el efecto —
  // regla react-hooks); el efecto de abajo solo ejecuta la búsqueda con debounce.
  const onExpediente = (v: string) => {
    setExpediente(v);
    if (!v.trim()) {
      setBuscado("");
      setPersona(null);
      setGestiones([]);
      setIntentos([]);
      setLoading(false);
    } else {
      setLoading(true);
    }
  };

  // Buscar al escribir el expediente (debounce 450 ms).
  useEffect(() => {
    const exp = expediente.trim();
    if (!exp) return;
    let cancel = false;
    const id = window.setTimeout(async () => {
      try {
        const [p, snap, rastreoSnap] = await Promise.all([
          getPersona(exp).catch(() => null),
          getDocs(query(collection(db, "gestiones_ts"), where("expediente", "==", exp))),
          // Intentos de contacto del rastreo — heredados a la bitácora.
          getDoc(doc(db, "rastreos_ts", exp)).catch(() => null),
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
        setIntentos((rastreoSnap?.exists() ? rastreoSnap.data().intentosContacto ?? [] : []) as IntentoContactoTS[]);
        setBuscado(exp);
      } catch (err) {
        if (!cancel) {
          if ((err as { code?: string }).code === "permission-denied") setPermissionError(true);
          setGestiones([]);
          setIntentos([]);
          setPersona(null);
          setBuscado(exp);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    }, 450);
    return () => { cancel = true; window.clearTimeout(id); };
  }, [expediente]);

  // Línea de tiempo unificada: gestiones + intentos de contacto del rastreo,
  // ordenada desc por fecha + hora y agrupada por fecha.
  const porFecha = useMemo(() => {
    const items: ItemBitacora[] = [
      ...gestiones.map((g) => ({
        kind: "gestion" as const, fecha: g.fecha, orden: toDate(g.creadoEn)?.getTime() ?? 0, g,
      })),
      ...intentos.map((it) => ({
        kind: "intento" as const, fecha: it.fecha, orden: toDate(it.creadoEn)?.getTime() ?? 0, it,
      })),
    ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.orden - a.orden);

    const grupos: { fecha: string; items: ItemBitacora[] }[] = [];
    for (const item of items) {
      const ult = grupos[grupos.length - 1];
      if (ult && ult.fecha === item.fecha) ult.items.push(item);
      else grupos.push({ fecha: item.fecha, items: [item] });
    }
    return grupos;
  }, [gestiones, intentos]);

  // Totales por mes × tipo (los "TOTAL MENSUAL DE…" por paciente de los libros
  // de seguimiento del Excel, ahora derivados en vez de contados a mano).
  const totalesPorMes = useMemo(() => {
    const meses = new Map<string, Map<string, number>>();
    for (const g of gestiones) {
      const mes = g.fecha.slice(0, 7); // "YYYY-MM"
      const sub = meses.get(mes) ?? new Map<string, number>();
      sub.set(g.tipo, (sub.get(g.tipo) ?? 0) + 1);
      meses.set(mes, sub);
    }
    return [...meses.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mes, tipos]) => ({
        mes,
        total: [...tipos.values()].reduce((n, x) => n + x, 0),
        tipos: [...tipos.entries()].sort((a, b) => b[1] - a[1]),
      }));
  }, [gestiones]);

  // Datos del paciente derivados de la gestión más reciente (sirve si no está en el padrón).
  const ultima = gestiones[0];
  const nombre = persona ? `${persona.apellidos}, ${persona.nombres}` : ultima?.pacienteNombre;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
          <FileClock size={13} /> Trabajo Social
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Bitácora del paciente</h1>
        <p className="text-xs text-slate-500 mt-0.5">Historial de todas las gestiones de un expediente</p>
      </div>


      {/* La bitácora es una vista de lectura: chrome a lo ancho (alineado con las
          demás tabs), pero el contenido en una columna angosta y legible. */}
      <div className="max-w-3xl space-y-5">
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
          onChange={(e) => onExpediente(e.target.value)}
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
                {intentos.length > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                    + {intentos.length} intento{intentos.length === 1 ? "" : "s"} de contacto
                  </p>
                )}
              </div>
            </div>
          </div>

          {gestiones.length === 0 && intentos.length === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center">Este expediente no tiene gestiones registradas.</p>
          ) : (
            <>
            {/* Totales por mes (los "TOTAL MENSUAL" de los libros de seguimiento) */}
            {gestiones.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2.5">Totales por mes</p>
              <div className="space-y-2">
                {totalesPorMes.map(({ mes, total, tipos }) => {
                  const [y, m] = mes.split("-").map(Number);
                  const etiqueta = new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("es-HN", { month: "long", year: "numeric" });
                  return (
                    <div key={mes} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 capitalize w-32 shrink-0">{etiqueta}</span>
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tabular-nums">{total}</span>
                      <span className="text-xs text-slate-500 min-w-0">
                        {tipos.map(([tipo, n], i) => (
                          <span key={tipo}>{i > 0 && " · "}{labelTipoGestion(tipo)} ×{n}</span>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            )}
            <div className="space-y-6">
              {porFecha.map(({ fecha, items }) => (
                <div key={fecha}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2.5 capitalize">{fmtFechaStr(fecha)}</p>
                  <div className="space-y-2 border-l-2 border-slate-200 dark:border-slate-800 pl-4 ml-1">
                    {items.map((item, idx) => item.kind === "intento" ? (
                      /* Intento de contacto heredado del rastreo */
                      <div key={`int-${idx}`} className="relative bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50 rounded-xl p-3">
                        <span className="absolute -left-[21px] top-4 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-950" />
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-amber-800 dark:text-amber-300 inline-flex items-center gap-1.5">
                            <History size={13} /> Intento de contacto
                          </p>
                          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-md">
                            Rastreo
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1">
                          <User size={11} className="text-slate-400" /> {item.it.trabajadoraNombre}
                        </p>
                        {item.it.nota && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 break-words whitespace-pre-wrap">{item.it.nota}</p>}
                      </div>
                    ) : (
                      <div key={item.g.id} className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                        <span className="absolute -left-[21px] top-4 w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-950" />
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-slate-800 dark:text-slate-200 break-words">{labelTipoGestion(item.g.tipo)}</p>
                              {item.g.resultadoVisita && (
                                <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${RESULTADO_VISITA_COLOR[item.g.resultadoVisita]}`}>
                                  {RESULTADO_VISITA_LABEL[item.g.resultadoVisita]}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1"><User size={11} className="text-slate-400" /> {item.g.trabajadoraNombre}</span>
                              <span className="text-slate-300 dark:text-slate-600">·</span>
                              <span>{fmtHora(item.g.creadoEn)}</span>
                              <span className="text-slate-300 dark:text-slate-600">·</span>
                              <span>{item.g.modalidad ? MODALIDAD_GESTION_LABEL[item.g.modalidad] : "Presencial"}{item.g.duracionMin ? ` · ${item.g.duracionMin} min` : ""}</span>
                              {item.g.servicio && <><span className="text-slate-300 dark:text-slate-600">·</span><span>{item.g.servicio}</span></>}
                            </p>
                          </div>
                          <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-1 rounded-lg border ${ESTADO_COLOR[item.g.estadoPaciente]}`}>
                            {ESTADO_PACIENTE_GESTION_LABEL[item.g.estadoPaciente]}
                          </span>
                        </div>
                        {item.g.notas && <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 break-words whitespace-pre-wrap">{item.g.notas}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </>
      )}
      </div>
    </div>
  );
}
