import type { ExpedienteProgramado } from "@/types";

// Expedientes que ESDOMED crea antes de que el paciente llegue (Código Infarto,
// Chat Marcapasos). Viven aparte de control_ingresos porque de esa colección sale
// la cola que ven los médicos. Cuando el paciente llega se registra el ingreso
// normal con su servicio real, y recién entonces entra a la cola.

export const COLECCION_PROGRAMADOS = "expedientes_programados";

// No son servicios del hospital: no van en el catálogo, que también define camas
// y ocupación. Solo se ofrecen en el selector del control de ingresos.
export const SOLICITUDES_PROGRAMADAS = [
  "Solicitud CODIGO DE INFARTO HNES",
  "Solicitud CHAT MARCAPASOS HNES",
] as const;

export const esSolicitudProgramada = (servicio: string): boolean =>
  (SOLICITUDES_PROGRAMADAS as readonly string[]).includes(servicio);

/** Hoy en formato "YYYY-MM-DD", en hora local. */
export function hoyLocalISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Primer día que se puede elegir: "se presentará" siempre es a futuro. */
export function primerDiaFuturo(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d;
}

/** "2026-11-12" → "12 nov 2026". */
export const fechaPresentacionCorta = (fecha: string): string =>
  new Date(`${fecha}T12:00:00`).toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });

/** Días que faltan para la fecha; negativo si ya pasó. */
export const diasParaPresentacion = (fecha: string, hoy = hoyLocalISO()): number =>
  Math.round((Date.parse(`${fecha}T12:00:00`) - Date.parse(`${hoy}T12:00:00`)) / 86_400_000);

export function textoCuando(dias: number): string {
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  if (dias > 1) return `En ${dias} días`;
  return dias === -1 ? "Ayer" : `Hace ${-dias} días`;
}

/** Los más próximos primero; los atrasados quedan arriba. */
export const porFechaPresentacion = (a: ExpedienteProgramado, b: ExpedienteProgramado): number =>
  a.fechaPresentacion.localeCompare(b.fechaPresentacion);
