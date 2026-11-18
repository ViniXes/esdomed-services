"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { fechaEscritaAISO, isoADdMmAaaa } from "@/lib/consultaExterna/citasProgramadas";

// Fecha en números, como se escribe en el hospital: 18/12/2027 (también
// 18-12-27, 18122027 o 18/12). El calendario del navegador sigue disponible
// con el botón, pero no hace falta escribir el nombre del mes.

interface Props {
  id: string;
  /** "YYYY-MM-DD" o "" */
  valor: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
}

export function CampoFecha({ id, valor, onChange, min, max, disabled, className }: Props) {
  // Lo escrito se conserva mientras corresponda al valor actual; si el valor
  // cambia desde fuera (calendario, limpiar), se muestra el nuevo.
  const [escrito, setEscrito] = useState<{ para: string; texto: string } | null>(null);
  const calendario = useRef<HTMLInputElement>(null);
  const texto = escrito && escrito.para === valor ? escrito.texto : isoADdMmAaaa(valor);
  const invalida = !!texto.trim() && !valor;

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        disabled={disabled}
        value={texto}
        onChange={(e) => {
          const t = e.target.value;
          const iso = fechaEscritaAISO(t) ?? "";
          setEscrito({ para: iso, texto: t });
          if (iso !== valor) onChange(iso);
        }}
        onBlur={() => {
          if (valor) setEscrito(null); // muestra la fecha completa: 6/1 → 06/01/2027
        }}
        aria-invalid={invalida}
        className={`${className ?? ""} pr-10`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Abrir calendario"
        disabled={disabled}
        className="absolute inset-y-0 right-1 my-auto h-8 rounded p-1 text-slate-500 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400"
        onClick={() => {
          const el = calendario.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
      >
        <CalendarDays size={18} />
      </button>
      <input
        ref={calendario}
        type="date"
        tabIndex={-1}
        aria-hidden
        min={min}
        max={max}
        value={valor}
        onChange={(e) => {
          setEscrito(null);
          onChange(e.target.value);
        }}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
      />
      {invalida && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Escriba día/mes/año, por ejemplo 18/01/2027.</p>}
    </div>
  );
}
