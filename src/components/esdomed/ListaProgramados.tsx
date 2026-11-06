"use client";

import { Icon } from "@iconify/react";
import pen from "@iconify-icons/solar/pen-2-linear";
import { CalendarClock, LogIn } from "lucide-react";
import type { ExpedienteProgramado } from "@/types";
import {
  diasParaPresentacion, fechaPresentacionCorta, textoCuando,
} from "@/lib/esdomed/expedientesProgramados";

// Pacientes que ESDOMED ya dejó listos y todavía no llegan. Estos no están en la
// cola de los médicos: entran a ella cuando alguien marca que el paciente llegó.

export function ListaProgramados({
  items, error, editandoId, presentandoId, onLlego, onEditar,
}: {
  items: ExpedienteProgramado[];
  error: boolean;
  /** Registro abierto en el formulario; la fila toma el color de ese modo. */
  editandoId: string | null;
  presentandoId: string | null;
  onLlego: (p: ExpedienteProgramado) => void;
  onEditar: (p: ExpedienteProgramado) => void;
}) {
  if (error) {
    return (
      <p className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
        No se pudieron cargar los expedientes programados.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <CalendarClock size={24} />
        </span>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sin expedientes programados</p>
        <p className="max-w-xs text-xs text-slate-500 dark:text-slate-400">
          Elige una solicitud en el campo Servicio para dejar listo el expediente de un paciente que todavía no llega.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((p) => {
        const dias = diasParaPresentacion(p.fechaPresentacion);
        return (
          <li
            key={p.id}
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors ${
              p.id === editandoId
                ? "bg-amber-50 shadow-[inset_4px_0_0_0_var(--color-amber-500)] dark:bg-amber-950/30"
                : p.id === presentandoId
                  ? "bg-cyan-50 shadow-[inset_4px_0_0_0_var(--color-cyan-500)] dark:bg-cyan-950/30"
                  : ""
            }`}
          >
            <div className="w-24 shrink-0">
              <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{fechaPresentacionCorta(p.fechaPresentacion)}</p>
              <span className={`mt-1 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                dias <= 0
                  ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                  : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}>
                {textoCuando(dias)}
              </span>
            </div>

            <div className="min-w-0 flex-1 basis-48">
              <p className="truncate font-medium text-slate-900 dark:text-slate-100" title={`${p.apellidos}, ${p.nombres}`}>{p.apellidos}, {p.nombres}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono font-semibold text-blue-700 dark:text-blue-300">{p.expediente}</span>
                {p.edad != null && ` · ${p.edad} años`}
              </p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{p.solicitud}</p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onLlego(p)}
                title="Registrar su ingreso para que pase a la cola de los médicos"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600"
              >
                <LogIn size={14} /> Llegó
              </button>
              <button
                type="button"
                onClick={() => onEditar(p)}
                title="Editar expediente programado"
                aria-label={`Editar expediente programado ${p.expediente}`}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-300"
              >
                <Icon icon={pen} width={16} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
