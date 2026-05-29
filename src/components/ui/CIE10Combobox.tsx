"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { DiagnosticoCIE } from "@/types";
import { cargarCIE10, buscarCIE10, type EntradaCIE10 } from "@/lib/cie10";

interface Props {
  value: DiagnosticoCIE;
  onChange: (v: DiagnosticoCIE) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function CIE10Combobox({
  value,
  onChange,
  placeholder = "Buscar diagnóstico o código CIE-10...",
  disabled,
}: Props) {
  const [query, setQuery]         = useState(value.descripcion);
  const [entradas, setEntradas]   = useState<EntradaCIE10[]>([]);
  const [resultados, setResultados] = useState<EntradaCIE10[]>([]);
  const [open, setOpen]           = useState(false);
  const [cargando, setCargando]   = useState(false);
  const [cursorIdx, setCursorIdx] = useState(-1);

  const inputRef   = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const valueRef   = useRef(value);
  valueRef.current = value;

  // Lazy-load the catalog on first interaction
  const cargarSiNecesario = async () => {
    if (entradas.length > 0) return;
    setCargando(true);
    const data = await cargarCIE10();
    setEntradas(data);
    setCargando(false);
  };

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (query.trim() && entradas.length > 0) {
        setResultados(buscarCIE10(entradas, query));
        setCursorIdx(-1);
      } else {
        setResultados([]);
      }
    }, 180);
    return () => clearTimeout(debounceRef.current);
  }, [query, entradas]);

  // Sync when external value changes
  useEffect(() => {
    setQuery(value.descripcion);
  }, [value.descripcion]);

  const seleccionar = (e: EntradaCIE10) => {
    onChange({ codigo: e.code, descripcion: e.description });
    setQuery(e.description);
    setOpen(false);
    setResultados([]);
    setCursorIdx(-1);
  };

  const limpiar = (ev: React.MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    onChange({ codigo: "", descripcion: "" });
    setQuery("");
    setResultados([]);
    inputRef.current?.focus();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    // Reset code if user edits after a catalog selection
    if (valueRef.current.codigo) {
      onChange({ codigo: "", descripcion: val });
    }
    setOpen(true);
    cargarSiNecesario();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursorIdx((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursorIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && cursorIdx >= 0) {
      e.preventDefault();
      seleccionar(resultados[cursorIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false);
      // Save free text if user didn't pick from catalog
      const cur = valueRef.current;
      if (!cur.codigo && query.trim() !== cur.descripcion) {
        onChange({ codigo: "", descripcion: query.trim() });
      }
    }, 150);
  };

  const hasCode = !!value.codigo;
  const hasValue = !!(query || value.codigo);

  return (
    <div className="relative">
      {/* Input row */}
      <div className="relative">
        <Search
          size={13}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onChange={handleChange}
          onFocus={() => { setOpen(true); cargarSiNecesario(); }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`w-full pl-9 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-[padding] ${
            hasCode ? "pr-28" : hasValue ? "pr-8" : "pr-3"
          }`}
        />

        {/* CIE code chip — shown when a catalog entry is selected */}
        {hasCode && (
          <span className="absolute right-8 top-1/2 -translate-y-1/2 font-mono text-[11px] font-semibold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded pointer-events-none select-none">
            {value.codigo}
          </span>
        )}

        {/* Clear button */}
        {hasValue && !disabled && (
          <button
            type="button"
            onMouseDown={limpiar}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors"
            tabIndex={-1}
            aria-label="Limpiar"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && query.trim() && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          {cargando ? (
            <div className="px-4 py-3 text-xs text-slate-400">
              Cargando catálogo CIE-10...
            </div>
          ) : resultados.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-400 italic">
              Sin coincidencias — se guardará como texto libre.
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {resultados.map((e, i) => (
                <li key={e.code}>
                  <button
                    type="button"
                    onMouseDown={() => seleccionar(e)}
                    className={`w-full text-left px-3 py-2.5 flex items-baseline gap-2.5 transition-colors ${
                      i === cursorIdx
                        ? "bg-blue-50 dark:bg-blue-900/30"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0 w-14">
                      {e.code}
                    </span>
                    <span className="text-sm text-slate-800 dark:text-slate-200 leading-snug">
                      {e.description}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
