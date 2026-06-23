import type { IngresoHospitalizacion } from "@/types";

// Etiquetas y estilos del módulo Atendidos en Emergencia.

export const INGRESO_LABEL: Record<IngresoHospitalizacion, string> = {
  no:       "No ingresó",
  si:       "Ingresó a hospitalización",
  sin_dato: "Sin dato",
};

export const INGRESO_BADGE: Record<IngresoHospitalizacion, string> = {
  // No ingresó = la población central del módulo → se resalta en azul.
  no:       "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900",
  // Sí ingresó = pasó por emergencia y además entró como activo (trazabilidad).
  si:       "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900",
  sin_dato: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700",
};

/**
 * Color de triage según el texto de "Categorización" ("3 - Verde", "2 - Amarillo"…).
 * Devuelve clases tailwind para un punto/badge; null si no se reconoce.
 */
export function triageBadge(categorizacion?: string): string | null {
  const s = (categorizacion ?? "").toLowerCase();
  if (s.includes("rojo"))     return "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900";
  if (s.includes("naranja"))  return "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-900";
  if (s.includes("amarillo")) return "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900";
  if (s.includes("verde"))    return "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900";
  if (s.includes("azul"))     return "bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-900";
  return null;
}
