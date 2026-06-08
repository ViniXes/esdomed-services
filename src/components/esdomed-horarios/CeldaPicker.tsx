"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Search, Sun } from "lucide-react";
import { HORARIOS, MARCAS_ESPECIALES, type Horario } from "@/lib/esdomed/horarios";

interface Props {
  // Texto contextual del encabezado (ej. "JUAN PÉREZ · Día 12").
  titulo: string;
  subtitulo?: string;
  valorActual: string;
  onSelect: (codigo: string) => void;
  onClose: () => void;
}

/**
 * Selector de código de horario para una celda del plan. Bottom-sheet en móvil,
 * modal centrado en desktop. Permite buscar por código/hora, elegir una marca
 * especial (VAC/INC/PER) o marcar Descanso (vaciar la celda).
 */
export function CeldaPicker({ titulo, subtitulo, valorActual, onSelect, onClose }: Props) {
  const [buscar, setBuscar] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = buscar.trim().toLowerCase();
  const filtrados = useMemo<Horario[]>(() => {
    if (!q) return HORARIOS;
    return HORARIOS.filter(
      (h) =>
        h.codigo.toLowerCase().includes(q) ||
        h.tipo.toLowerCase().includes(q) ||
        h.entrada.toLowerCase().includes(q) ||
        h.salida.toLowerCase().includes(q),
    );
  }, [q]);

  const actual = valorActual.trim().toUpperCase();

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{titulo}</p>
            {subtitulo && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitulo}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        {/* Acciones rápidas: Descanso + marcas */}
        <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => onSelect("")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              actual === ""
                ? "bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            <Sun size={13} /> Descanso
          </button>
          {MARCAS_ESPECIALES.map((m) => (
            <button
              key={m.codigo}
              onClick={() => onSelect(m.codigo)}
              title={m.descripcion}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                actual === m.codigo
                  ? "bg-amber-500 text-white"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
              }`}
            >
              {m.codigo} · {m.label}
            </button>
          ))}
        </div>

        {/* Buscador */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar código u hora (ej. TH34, 7:00)"
              className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
          </div>
        </div>

        {/* Lista de códigos */}
        <div className="overflow-y-auto px-2 py-2">
          {filtrados.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">Sin resultados para “{buscar}”.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {filtrados.map((h) => {
                const activo = h.codigo === actual;
                return (
                  <button
                    key={h.codigo}
                    onClick={() => onSelect(h.codigo)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                      activo
                        ? "bg-fuchsia-600 text-white"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span className={`shrink-0 w-14 text-xs font-bold tabular-nums ${activo ? "text-white" : "text-fuchsia-600 dark:text-fuchsia-400"}`}>
                      {h.codigo}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-xs font-medium ${activo ? "text-white" : "text-slate-700 dark:text-slate-200"}`}>
                        {h.entrada} – {h.salida}
                      </span>
                      <span className={`block text-[10px] ${activo ? "text-fuchsia-100" : "text-slate-400"}`}>
                        {h.horas} h · {h.tipo}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
