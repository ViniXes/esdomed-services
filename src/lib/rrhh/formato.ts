import type { UnidadLicencia } from "@/types";

// ── Horas en intervalos de 30 minutos ────────────────────────────────────────
// Los permisos por hora solo permiten medias horas: 30 min, 1 h, 1 h 30 min…
// (nunca 15 ni 45 min). Las opciones de hora van de 00:00 a 23:30 cada 30 min.

export const OPCIONES_HORA: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

/** Minutos desde medianoche de un "HH:MM". */
export function minutosDeHora(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Horas (decimal, múltiplo de 0.5) entre dos "HH:MM". Negativo si fin < inicio. */
export function horasEntre(inicio: string, fin: string): number {
  return (minutosDeHora(fin) - minutosDeHora(inicio)) / 60;
}

// ── Formato legible ──────────────────────────────────────────────────────────

/** 1.5 → "1 h 30 min" · 2 → "2 h" · 0.5 → "30 min". */
export function formatHoras(h: number): string {
  const totalMin = Math.round(h * 60);
  const horas = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (horas && min) return `${horas} h ${min} min`;
  if (horas) return `${horas} h`;
  return `${min} min`;
}

/** Formatea una cantidad según su unidad: "5 días" o "1 h 30 min". */
export function formatCantidad(cantidad: number, unidad: UnidadLicencia): string {
  if (unidad === "horas") return formatHoras(cantidad);
  return `${cantidad} día${cantidad === 1 ? "" : "s"}`;
}

/** Abreviado para tablas: "5 d" o "1.5 h". */
export function formatCantidadCorto(cantidad: number, unidad: UnidadLicencia): string {
  if (unidad === "horas") return formatHoras(cantidad);
  return `${cantidad} d`;
}
