import { claveServicio } from "@/lib/servicios";

export type ServicioAfiliacion = "bienestar" | "intensivos" | "intermedios";

/** Servicios elegibles para el buscador de nuevas afiliaciones ISBM. */
export function servicioParaAfiliacion(nombre: string): ServicioAfiliacion | null {
  const clave = claveServicio(nombre);
  const esBienestar = /\bbienestar magisterial\b/.test(clave);
  const esBM = /\bbm\b/.test(clave) || esBienestar;
  if (!esBM) return null;
  if (/\bcuidados intensivos\b|\buci\b/.test(clave)) return "intensivos";
  if (/\bcuidados intermedios\b|\bucim\b/.test(clave)) return "intermedios";
  return esBienestar ? "bienestar" : null;
}
