"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { Search, Loader2, CalendarDays } from "lucide-react";
import { toDate, ESTADO_LABEL, ESTADO_BADGE } from "@/lib/pacientes/helpers";
import type { Paciente } from "@/types";

// Buscador de INGRESOS por número de expediente, esté el paciente activo o no.
//
// Existe aparte de BuscadorPacienteActivo (que solo ofrece ingresos activos y lo
// comparten seis pantallas) porque aquí hace falta lo contrario: una lesión
// intencional se detecta muchas veces DESPUÉS del egreso — el caso sale en el
// tamizaje del comité, o el propio médico cae en cuenta días después— y sin
// poder llegar al expediente egresado no habría forma de notificar en diferido.
//
// La unidad de búsqueda es el ingreso y no el paciente: un mismo expediente
// puede tener varios, y la notificación pertenece a uno en concreto. Por eso se
// listan todos con su fecha y su estado, en vez de resolver "el activo".
// No se muestran servicio ni cama: en un ingreso ya cerrado no significan nada.

interface Props {
  value: Paciente | null;
  onSelect: (p: Paciente | null) => void;
}

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 transition";

const formatDia = (d?: Date | null) =>
  d ? d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function BuscadorIngresoPorExpediente({ value, onSelect }: Props) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);

  useEffect(() => {
    let cancel = false;
    const correr = async () => {
      const t = texto.trim();
      if (!t) { setResultados([]); setBuscado(false); return; }
      setLoading(true);
      try {
        // Igualdad sobre un solo campo: no requiere índice compuesto.
        const snap = await getDocs(query(collection(db, "pacientes"), where("expediente", "==", t)));
        if (cancel) return;
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Paciente));
        // El ingreso más reciente primero: casi siempre es el que se notifica.
        docs.sort((a, b) => (toDate(b.fechaIngreso)?.getTime() ?? 0) - (toDate(a.fechaIngreso)?.getTime() ?? 0));
        setResultados(docs);
        setBuscado(true);
      } catch {
        if (!cancel) { setResultados([]); setBuscado(true); }
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    const id = window.setTimeout(correr, 400);
    return () => { cancel = true; window.clearTimeout(id); };
  }, [texto]);

  const t = texto.trim();

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" value={texto} onChange={e => setTexto(e.target.value)}
          placeholder="Número de expediente (ej. 6576-26)"
          aria-label="Número de expediente"
          className={inputCls} />
      </div>

      {loading ? (
        <p className="flex items-center gap-2 px-1 py-2 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin text-amber-600" /> Buscando el expediente...
        </p>
      ) : resultados.length > 0 ? (
        <div className="space-y-1.5">
          {resultados.length > 1 && (
            <p className="px-1 text-xs text-slate-500">
              Este expediente tiene {resultados.length} ingresos. Elija aquel al que corresponde el hecho:
            </p>
          )}
          {resultados.map(p => {
            const ingreso = toDate(p.fechaIngreso);
            const egreso = toDate(p.fechaEgreso);
            const seleccionado = value?.id === p.id;
            return (
              <button key={p.id} type="button" onClick={() => onSelect(p)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                  seleccionado
                    ? "border-amber-500 bg-amber-50 ring-1 ring-amber-500/30 dark:border-amber-600 dark:bg-amber-950/40"
                    : "border-slate-200 hover:border-amber-300 hover:bg-amber-50/40 dark:border-slate-700 dark:hover:border-amber-800 dark:hover:bg-amber-950/20"
                }`}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {p.apellidos}, {p.nombres}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${ESTADO_BADGE[p.estado] ?? ""}`}>
                    {ESTADO_LABEL[p.estado] ?? p.estado}
                  </span>
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <CalendarDays size={12} className="shrink-0 text-slate-400" />
                  Ingresó el {formatDia(ingreso)}
                  {egreso && ` · egresó el ${formatDia(egreso)}`}
                </span>
              </button>
            );
          })}
        </div>
      ) : buscado ? (
        <p className="px-1 py-2 text-sm text-slate-500">
          No hay ningún ingreso con el expediente <strong className="font-mono">{t}</strong>. Revise el número —
          lleva guion y los dos dígitos del año, como 6576-26.
        </p>
      ) : (
        <p className="px-1 text-xs text-slate-400">
          Se puede notificar tanto a un paciente ingresado como a uno que ya egresó.
        </p>
      )}
    </div>
  );
}
