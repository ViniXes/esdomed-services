"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  ESTABLECIMIENTOS,
  normalizarBusqueda,
  etiquetaEstablecimiento,
} from "@/lib/establecimientos";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

// Combobox buscable sobre el catálogo nacional de establecimientos.
export function EstablecimientoSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const busqueda = normalizarBusqueda(value.trim());
  const filtrados = busqueda
    ? ESTABLECIMIENTOS.filter(e => normalizarBusqueda(e).includes(busqueda))
    : ESTABLECIMIENTOS;

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        placeholder="Buscar hospital o establecimiento..."
        className={inputCls + " pr-9"}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setOpen(o => !o)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
      >
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          {filtrados.length > 0 ? (
            filtrados.map(e => (
              <button
                key={e}
                type="button"
                onMouseDown={ev => ev.preventDefault()}
                onClick={() => { onChange(e); setOpen(false); }}
                className={`block w-full text-left px-3 py-2 text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700/60 ${
                  value === e ? "bg-slate-50 dark:bg-slate-700/40 font-medium text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-200"
                }`}
              >
                {etiquetaEstablecimiento(e)}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-slate-400">Sin coincidencias</p>
          )}
        </div>
      )}
    </div>
  );
}
