"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { Search, Loader2, CalendarDays, Ambulance } from "lucide-react";
import { toDate, ESTADO_LABEL, ESTADO_BADGE } from "@/lib/pacientes/helpers";
import { condicionEgreso, CONDICION_LABEL, CONDICION_BADGE } from "@/lib/emergencia/helpers";
import type { AtencionEmergencia, Paciente } from "@/types";

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
//
// Emergencia (opcional, 2026-09-07): quien fue atendido en emergencia y NO llegó
// a ingresar —egresó o falleció ahí— no existe en `pacientes`, así que antes no
// se podía notificar. Con `onSelectAtencion` el buscador lista también esas
// atenciones (colección atenciones_emergencia, importada del SIS). Las que sí
// ingresaron a hospitalización ya salen como ingreso y no se repiten.

interface Props {
  value: Paciente | null;
  onSelect: (p: Paciente | null) => void;
  // Texto inicial de búsqueda: la bandeja de solicitudes del comité llega con
  // el expediente ya puesto para que el médico solo elija el ingreso.
  initialTexto?: string;
  atencionValue?: AtencionEmergencia | null;
  onSelectAtencion?: (a: AtencionEmergencia | null) => void;
}

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 transition";

const formatDia = (d?: Date | null) =>
  d ? d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const formatFechaHora = (d?: Date | null) =>
  d
    ? d.toLocaleString("es-SV", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : "—";

export function BuscadorIngresoPorExpediente({ value, onSelect, initialTexto, atencionValue, onSelectAtencion }: Props) {
  const [texto, setTexto] = useState(initialTexto ?? "");
  const [resultados, setResultados] = useState<Paciente[]>([]);
  const [atenciones, setAtenciones] = useState<AtencionEmergencia[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const conEmergencia = !!onSelectAtencion;

  useEffect(() => {
    let cancel = false;
    const correr = async () => {
      const t = texto.trim();
      if (!t) { setResultados([]); setAtenciones([]); setBuscado(false); return; }
      setLoading(true);
      try {
        // Igualdad sobre un solo campo en cada colección: no requiere índice compuesto.
        const [snap, snapAtenciones] = await Promise.all([
          getDocs(query(collection(db, "pacientes"), where("expediente", "==", t))),
          conEmergencia
            ? getDocs(query(collection(db, "atenciones_emergencia"), where("expediente", "==", t)))
            : Promise.resolve(null),
        ]);
        if (cancel) return;
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Paciente));
        // El ingreso más reciente primero: casi siempre es el que se notifica.
        docs.sort((a, b) => (toDate(b.fechaIngreso)?.getTime() ?? 0) - (toDate(a.fechaIngreso)?.getTime() ?? 0));
        const ats = (snapAtenciones?.docs ?? [])
          .map(d => {
            const data = d.data();
            return {
              id: d.id, ...data,
              fechaHoraIngreso: toDate(data.fechaHoraIngreso) ?? new Date(0),
              fechaHoraAltaIngreso: toDate(data.fechaHoraAltaIngreso),
            } as AtencionEmergencia;
          })
          // Las que ingresaron a hospitalización ya están arriba como ingreso.
          .filter(a => a.ingresoHospitalizacion !== "si")
          .sort((a, b) => b.fechaHoraIngreso.getTime() - a.fechaHoraIngreso.getTime());
        setResultados(docs);
        setAtenciones(ats);
        setBuscado(true);
      } catch {
        if (!cancel) { setResultados([]); setAtenciones([]); setBuscado(true); }
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    const id = window.setTimeout(correr, 400);
    return () => { cancel = true; window.clearTimeout(id); };
  }, [texto, conEmergencia]);

  const t = texto.trim();
  const hayResultados = resultados.length > 0 || atenciones.length > 0;

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
      ) : hayResultados ? (
        <div className="space-y-3">
          {resultados.length > 0 && (
            <div className="space-y-1.5">
              {(resultados.length > 1 || atenciones.length > 0) && (
                <p className="px-1 text-xs text-slate-500">
                  {resultados.length > 1
                    ? `Este expediente tiene ${resultados.length} ingresos. Elija aquel al que corresponde el hecho:`
                    : "Ingreso hospitalario del expediente:"}
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
          )}

          {atenciones.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 px-1 text-xs text-slate-500">
                <Ambulance size={13} className="shrink-0 text-rose-500" />
                {atenciones.length === 1
                  ? "Atención de emergencia sin ingreso a hospitalización:"
                  : `${atenciones.length} atenciones de emergencia sin ingreso a hospitalización:`}
              </p>
              {atenciones.map(a => {
                const seleccionado = atencionValue?.id === a.id;
                const condicion = condicionEgreso(a.tipoEgreso);
                return (
                  <button key={a.id} type="button" onClick={() => onSelectAtencion?.(a)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                      seleccionado
                        ? "border-amber-500 bg-amber-50 ring-1 ring-amber-500/30 dark:border-amber-600 dark:bg-amber-950/40"
                        : "border-slate-200 hover:border-amber-300 hover:bg-amber-50/40 dark:border-slate-700 dark:hover:border-amber-800 dark:hover:bg-amber-950/20"
                    }`}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{a.pacienteNombre}</span>
                      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400">
                        Emergencia
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CONDICION_BADGE[condicion]}`}>
                        {CONDICION_LABEL[condicion]}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <CalendarDays size={12} className="shrink-0 text-slate-400" />
                      Atendido el {formatFechaHora(a.fechaHoraIngreso)}
                    </span>
                    {a.diagnostico && (
                      <span className="mt-0.5 block truncate text-xs text-slate-500" title={a.diagnostico}>
                        {a.diagnostico}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : buscado ? (
        <p className="px-1 py-2 text-sm text-slate-500">
          No hay ningún ingreso{conEmergencia ? " ni atención de emergencia" : ""} con el expediente{" "}
          <strong className="font-mono">{t}</strong>. Revise el número — lleva guion y los dos dígitos del año, como 6576-26.
          {conEmergencia && " Si fue atendido en emergencia, verifique que el reporte de emergencia ya se haya importado."}
        </p>
      ) : (
        <p className="px-1 text-xs text-slate-400">
          {conEmergencia
            ? "Se puede notificar a un paciente ingresado, a uno que ya egresó y también a quien fue atendido en emergencia sin llegar a ingresar."
            : "Se puede notificar tanto a un paciente ingresado como a uno que ya egresó."}
        </p>
      )}
    </div>
  );
}
