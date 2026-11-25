"use client";

import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Check, CheckCircle2, Loader2 } from "lucide-react";
import { ESTADO_GESTION_LABEL, type EstadoGestionTS, type Opcion } from "@/lib/consultaExterna/trabajoSocial";

// Piezas comunes de las pantallas de Trabajo Social de Consulta Externa.

export const tarjeta = "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";
export const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500";
export const etiquetaCls = "mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300";
/** Pregunta de un paso: más visible que la etiqueta de un campo. */
export const preguntaCls = "mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100";
export const botonPrimario =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50";
export const botonSecundario =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
export const botonTexto =
  "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800";
/** Botón principal sobre el encabezado institucional. */
export const botonHero =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-cyan-800 shadow-sm transition-colors hover:bg-cyan-50";
export const botonHeroSuave =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/25 transition-colors hover:bg-white/20";
/** Entrada de un paso o un panel: sube apenas, sin rebote. */
export const entrada = "animate-[dialogo-panel-in_220ms_cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none";

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

/**
 * Encabezado institucional de las pantallas donde se trabaja (nueva gestión y
 * seguimiento). `children` es la acción de la derecha; `pie`, el recorrido de pasos.
 */
export function Hero({ icono: Icono, titulo, detalle, children, pie }: {
  icono: LucideIcon; titulo: string; detalle: string; children?: React.ReactNode; pie?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-5 shadow-lg shadow-cyan-950/15 md:px-7 md:py-6">
      <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" aria-hidden="true" />
      <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" aria-hidden="true" />
      <div className="relative">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
              <Icono size={24} className="text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="font-heading text-xl font-bold text-white md:text-2xl">{titulo}</h1>
              <p className="mt-0.5 text-sm text-cyan-50/90">{detalle}</p>
            </div>
          </div>
          {children}
        </div>
        {pie}
      </div>
    </section>
  );
}

/** Recorrido del asistente: dónde va y cuánto falta. Un paso ya hecho sirve para volver a él. */
export function Pasos({ pasos, actual, onIr }: { pasos: string[]; actual: number; onIr: (n: number) => void }) {
  return (
    <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {pasos.map((nombre, i) => {
        const n = i + 1;
        const hecho = n < actual;
        const cls = `flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
          n === actual ? "bg-white/20 text-white ring-1 ring-white/25" : hecho ? "bg-white/10 text-cyan-50 hover:bg-white/20" : "text-cyan-100/75"
        }`;
        const contenido = (
          <>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              hecho ? "bg-emerald-400 text-emerald-950" : n === actual ? "bg-white text-blue-900" : "bg-white/15 text-white"
            }`}>
              {hecho ? <Check size={14} aria-hidden="true" /> : n}
            </span>
            <span className="text-xs font-semibold">{nombre}</span>
          </>
        );
        return (
          <li key={nombre} aria-current={n === actual ? "step" : undefined}>
            {hecho
              ? <button type="button" onClick={() => onIr(n)} aria-label={`Volver al paso ${n}: ${nombre}`} className={cls}>{contenido}</button>
              : <div className={cls}>{contenido}</div>}
          </li>
        );
      })}
    </ol>
  );
}

const TONO_OPCION = {
  azul: {
    activo: "border-blue-300 bg-blue-50 text-blue-900 shadow-sm shadow-blue-950/5 dark:border-blue-700 dark:bg-blue-950/35 dark:text-blue-100",
    icono: "bg-blue-800 text-white",
    marca: "text-blue-600 dark:text-blue-300",
    detalle: "text-blue-800/80 dark:text-blue-200/80",
  },
  ambar: {
    activo: "border-amber-300 bg-amber-50 text-amber-900 shadow-sm shadow-amber-950/5 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100",
    // En oscuro la rampa ámbar del tema es clara: el ícono va en tinta, no en blanco.
    icono: "bg-amber-500 text-white dark:text-amber-950",
    marca: "text-amber-600 dark:text-amber-300",
    detalle: "text-amber-900/80 dark:text-amber-100/80",
  },
  verde: {
    activo: "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm shadow-emerald-950/5 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100",
    icono: "bg-emerald-600 text-white",
    marca: "text-emerald-600 dark:text-emerald-300",
    detalle: "text-emerald-900/80 dark:text-emerald-100/80",
  },
};

/** Opción grande de un toque, con ícono. El tono solo cambia cuando la opción significa un estado. */
export function OpcionTarjeta({ activo, onClick, icono: Icono, titulo, detalle, tono = "azul" }: {
  activo: boolean; onClick: () => void; icono: LucideIcon; titulo: string; detalle?: string; tono?: keyof typeof TONO_OPCION;
}) {
  const t = TONO_OPCION[tono];
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
        activo
          ? t.activo
          : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-800 dark:hover:bg-blue-950/20"
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
        activo ? t.icono : "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
      }`}>
        <Icono size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug">{titulo}</span>
        {/* Sobre la tarjeta marcada el detalle toma su color: gris sobre color se ve lavado. */}
        {detalle && <span className={`mt-0.5 block text-xs leading-4 ${activo ? t.detalle : "text-slate-500 dark:text-slate-400"}`}>{detalle}</span>}
      </span>
      {activo && <CheckCircle2 size={16} className={`shrink-0 ${t.marca}`} aria-hidden="true" />}
    </button>
  );
}

/** Lo que ya se eligió en un paso (el paciente, la gestión), con la salida para cambiarlo. */
export function TarjetaElegida({ icono: Icono, cintillo, titulo, children, onCambiar, textoCambiar = "Cambiar" }: {
  icono: LucideIcon; cintillo: string; titulo: string; children?: React.ReactNode; onCambiar?: () => void; textoCambiar?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-blue-50/80 to-white p-4 dark:border-cyan-800 dark:from-cyan-950/40 dark:via-blue-950/20 dark:to-slate-900">
      <span className="absolute bottom-0 left-0 top-0 w-1 bg-gradient-to-b from-cyan-500 to-blue-600" aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-3 pl-1">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm shadow-cyan-600/25">
          <Icono size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300">{cintillo}</p>
          <p className="font-semibold leading-snug text-slate-900 dark:text-slate-100">{titulo}</p>
          {children}
        </div>
        {onCambiar && (
          <button type="button" onClick={onCambiar} className={`${botonSecundario} bg-white/70 dark:bg-slate-900/60`}>{textoCambiar}</button>
        )}
      </div>
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
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              valor === o.id
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {o.label}
            {o.n !== undefined && o.n > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">{o.n}</span>
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
    <div className="flex flex-wrap gap-2" role="group" aria-label={etiqueta}>
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
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-left text-[13px] font-semibold transition-colors ${
        activo
          ? "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-500"
          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600"
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
    <span className={`flex-shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONO_ESTADO[estado]}`}>
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

export function Vacio({ icono: Icono, titulo, detalle, children }: { icono: LucideIcon; titulo: string; detalle?: string; children?: React.ReactNode }) {
  return (
    <div className={`${tarjeta} px-6 py-12 text-center`}>
      <Icono size={28} className="mx-auto text-slate-300 dark:text-slate-600" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{titulo}</p>
      {detalle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{detalle}</p>}
      {children && <div className="mt-4 flex justify-center">{children}</div>}
    </div>
  );
}

/** Diálogo centrado (en celular sube desde abajo). Escape lo cierra si se pasa `onCerrar`. */
export function Dialogo({ etiqueta, onCerrar, children }: { etiqueta: string; onCerrar?: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!onCerrar) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={etiqueta}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-[2px] animate-[dialogo-fondo-in_160ms_ease-out] motion-reduce:animate-none sm:items-center sm:p-4"
    >
      <div className={`w-full max-w-sm rounded-t-3xl border border-slate-200 bg-white p-6 text-center shadow-2xl shadow-slate-950/20 dark:border-slate-700 dark:bg-slate-900 sm:rounded-3xl ${entrada}`}>
        {children}
      </div>
    </div>
  );
}
