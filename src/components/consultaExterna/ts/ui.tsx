"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { ESTADO_GESTION_LABEL, type EstadoGestionTS, type Opcion } from "@/lib/consultaExterna/trabajoSocial";

// Piezas comunes de las pantallas de Trabajo Social de Consulta Externa.

export const tarjeta = "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";
export const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500";
export const etiquetaCls = "mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300";
export const botonPrimario =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50";
export const botonSecundario =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
export const botonTexto =
  "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800";

/** "2026-11-24" → "24 nov 2026". */
export function fechaCorta(iso: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-SV", { day: "numeric", month: "short", year: "numeric" });
}

export const haceDias = (n: number): string => (n <= 0 ? "hoy" : n === 1 ? "hace 1 día" : `hace ${n} días`);

export function Encabezado({ icono: Icono, titulo, detalle, children }: {
  icono: LucideIcon; titulo: string; detalle: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <Icono size={17} className="text-blue-600 dark:text-cyan-300" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">{titulo}</h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detalle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function Segmentos<T extends string>({ valor, onChange, opciones, etiqueta }: {
  valor: T; onChange: (v: T) => void; opciones: { id: T; label: string; n?: number }[]; etiqueta: string;
}) {
  return (
    <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex rounded-xl bg-slate-200/60 p-1 dark:bg-slate-800" role="group" aria-label={etiqueta}>
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={valor === o.id}
            onClick={() => onChange(o.id)}
            className={`whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold sm:px-3 sm:text-sm transition-colors ${
              valor === o.id
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {o.label}
            {o.n !== undefined && o.n > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">{o.n}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Opciones de un toque; con `limpiar`, tocar la marcada la quita. */
export function Chips({ opciones, valor, onChange, etiqueta, limpiar = false }: {
  opciones: Opcion[]; valor: string; onChange: (id: string) => void; etiqueta: string; limpiar?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <Chip key={o.id} activo={valor === o.id} onClick={() => onChange(limpiar && valor === o.id ? "" : o.id)}>{o.label}</Chip>
      ))}
    </div>
  );
}

export function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-left text-xs font-semibold transition-colors ${
        activo
          ? "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-500"
          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

const TONO_ESTADO: Record<EstadoGestionTS, string> = {
  en_proceso: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  finalizada: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  no_procede: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function Estado({ estado }: { estado: EstadoGestionTS }) {
  return (
    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${TONO_ESTADO[estado]}`}>
      {ESTADO_GESTION_LABEL[estado]}
    </span>
  );
}

export function Aviso({ tipo, children }: { tipo: "error" | "exito" | "alerta"; children: React.ReactNode }) {
  const tono = {
    error: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
    exito: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    alerta: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  }[tipo];
  const Icono = tipo === "exito" ? Check : AlertTriangle;
  return (
    <div role={tipo === "error" ? "alert" : "status"} className={`flex gap-2.5 rounded-xl border px-4 py-3 text-sm ${tono}`}>
      <Icono size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <p className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
      {texto}
    </p>
  );
}

export function Vacio({ icono: Icono, titulo, detalle }: { icono: LucideIcon; titulo: string; detalle?: string }) {
  return (
    <div className={`${tarjeta} px-6 py-12 text-center`}>
      <Icono size={28} className="mx-auto text-slate-300 dark:text-slate-600" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{titulo}</p>
      {detalle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{detalle}</p>}
    </div>
  );
}
