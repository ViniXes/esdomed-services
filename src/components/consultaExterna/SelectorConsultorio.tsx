"use client";

import { useId, useState } from "react";
import { destinoConsultorio, nombreConsultorio } from "@/lib/consultaExterna/circuito";

// "Llamar a": la estación (como siempre) o el consultorio que elija la
// enfermera. La agenda del SIS dice un consultorio, pero el médico a veces
// atiende en otro; por eso nunca se elige solo y hay "Otro consultorio…" para
// escribirlo. `valor` vacío = la estación.

const OTRO = "__otro__";

interface Props {
  valor: string;
  onCambiar: (valor: string) => void;
  /** Consultorios de la agenda de hoy, como los escribe el SIS ("Cardiologia - 3"). */
  opciones: string[];
  /** "Estación Cardiología". */
  estacion: string;
  /** El consultorio de este médico según la agenda, para señalarlo en la lista. */
  segunAgenda?: string;
}

export function SelectorConsultorio({ valor, onCambiar, opciones, estacion, segunAgenda }: Props) {
  const id = useId();
  const enLista = valor === "" || opciones.includes(valor);
  const [escribiendo, setEscribiendo] = useState(!enLista);
  const otro = escribiendo || !enLista;
  const elegido = valor.trim() !== "";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="flex-shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">
          Llamar a
        </label>
        <select
          id={id}
          value={otro ? OTRO : valor}
          onChange={(e) => {
            const v = e.target.value;
            setEscribiendo(v === OTRO);
            onCambiar(v === OTRO ? "" : v);
          }}
          // w-0: sin esto, la opción más larga ensancha la columna en el celular.
          className={`w-0 min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            elegido
              ? "border-cyan-400 bg-cyan-50 font-semibold text-cyan-900 dark:border-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-100"
              : "border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          }`}
        >
          <option value="">{estacion} (como siempre)</option>
          {opciones.map((o) => (
            <option key={o} value={o}>
              {nombreConsultorio(o)}
              {o === segunAgenda ? " · según agenda" : ""}
            </option>
          ))}
          <option value={OTRO}>Otro consultorio…</option>
        </select>
      </div>
      {otro && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-[3.75rem]">
          <input
            value={enLista ? "" : valor}
            onChange={(e) => onCambiar(e.target.value)}
            placeholder="Número o nombre del consultorio"
            maxLength={40}
            autoComplete="off"
            aria-label="Consultorio"
            autoFocus={escribiendo && !valor}
            className="w-0 min-w-[8rem] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {elegido ? `Dirá: «${destinoConsultorio(valor)}»` : `Mientras esté vacío, llama a la ${estacion.replace(/^E/, "e")}.`}
          </span>
        </div>
      )}
    </div>
  );
}
