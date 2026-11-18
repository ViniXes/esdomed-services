"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Eraser, Loader2 } from "lucide-react";
import { tituloLlamado, type LlamadoPantalla } from "@/lib/consultaExterna/circuito";
import { escucharLlamados, limpiarPantallas } from "@/lib/consultaExterna/estacionDatos";
import { hoyLocalISO } from "@/lib/esdomed/expedientesProgramados";

// Solo el admin (limpiaPantallasCE): deja todas las TVs en "Esperando
// llamados". Vacía la lista de las pantallas, nada más: las colas de las
// estaciones y el historial de cada cita no cambian. Escucha el mismo
// documento que las pantallas (1 lectura y sus cambios).

const horaCorta = (ms: number) => new Date(ms).toLocaleTimeString("es-SV", { hour: "numeric", minute: "2-digit" });

const btnBorde =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

export function LimpiarPantallas({ porNombre }: { porNombre: string }) {
  const [fecha] = useState(() => hoyLocalISO());
  const [ultimos, setUltimos] = useState<LlamadoPantalla[] | null>(null);
  const [limpiado, setLimpiado] = useState<{ ms: number; por: string } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");

  useEffect(
    () =>
      escucharLlamados(
        fecha,
        (lista, datos) => {
          setUltimos(lista);
          const ms = datos?.limpiadoEn?.toMillis?.();
          setLimpiado(ms ? { ms, por: datos?.limpiadoPorNombre ?? "" } : null);
        },
        (e) => {
          console.error("No se pudieron leer los llamados de las pantallas", e);
          setError("No se pudo leer lo que muestran las pantallas. Revise la conexión y recargue la página.");
        },
      ),
    [fecha],
  );

  const limpiar = async () => {
    setError("");
    setLimpiando(true);
    try {
      await limpiarPantallas(fecha, porNombre);
      setConfirmando(false);
      setListo(true);
    } catch (e) {
      console.error("No se pudieron limpiar las pantallas", e);
      setError("No se pudieron limpiar las pantallas. Revise la conexión e intente de nuevo.");
    } finally {
      setLimpiando(false);
    }
  };

  const cantidad = ultimos?.length ?? 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-6">
      <div className="flex items-center gap-2">
        <Eraser size={18} className="text-blue-600 dark:text-cyan-300" aria-hidden="true" />
        <h2 className="font-heading text-base font-bold text-slate-900 dark:text-slate-100">Limpiar pantallas</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Deja todas las TVs en «Esperando llamados». Solo quita lo que muestran: las colas de las estaciones no cambian y los
        pacientes llamados siguen como llamados.
      </p>

      {ultimos === null && !error ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Leyendo lo que muestran las pantallas…</p>
      ) : cantidad === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Las pantallas no muestran llamados de hoy.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {ultimos!.map((l) => (
            <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">{tituloLlamado(l)}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {l.expediente ? `Exp. ${l.expediente} · ` : ""}
                {l.destino} · {horaCorta(l.enMs)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {listo && cantidad === 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 size={16} aria-hidden="true" />
          Listo: las pantallas quedaron en «Esperando llamados».
        </p>
      )}

      {error && (
        <p className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {confirmando ? (
          <div className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="min-w-0 flex-1 text-sm text-amber-900 dark:text-amber-100">
              ¿Quitar {cantidad === 1 ? "el llamado" : `los ${cantidad} llamados`} de todas las pantallas?
            </p>
            <button
              type="button"
              onClick={limpiar}
              disabled={limpiando}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
            >
              {limpiando && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              Sí, limpiar
            </button>
            <button type="button" onClick={() => setConfirmando(false)} disabled={limpiando} className={`${btnBorde} py-2`}>
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setListo(false); setConfirmando(true); }}
            disabled={cantidad === 0}
            className={`${btnBorde} py-2.5`}
          >
            <Eraser size={16} aria-hidden="true" />
            Limpiar pantallas
          </button>
        )}
        {limpiado && !confirmando && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Última limpieza hoy: {horaCorta(limpiado.ms)}
            {limpiado.por ? `, por ${limpiado.por}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
