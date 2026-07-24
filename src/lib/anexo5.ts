const ZONA_HORARIA_HOSPITAL = "America/El_Salvador";

export function formatearFechaGeneracionAnexo5(value: unknown): string {
  if (!value) return "—";

  const timestamp = value as { toDate?: () => Date };
  const fecha = timestamp.toDate?.() ?? (value instanceof Date ? value : new Date(value as string | number));
  if (Number.isNaN(fecha.getTime())) return "—";

  return new Intl.DateTimeFormat("es-SV", {
    timeZone: ZONA_HORARIA_HOSPITAL,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(fecha);
}
