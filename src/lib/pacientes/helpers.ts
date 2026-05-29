import {
  AreaGeografica,
  CircunstanciaIngreso,
  EstadoPaciente,
  Genero,
} from "@/types";

// ── Cálculos ────────────────────────────────────────────────────────────────

export function calcularEdad(fechaNacimiento?: Date | null): number | null {
  if (!fechaNacimiento) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
  const m = hoy.getMonth() - fechaNacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < fechaNacimiento.getDate())) edad--;
  return edad >= 0 ? edad : null;
}

export function diasEstancia(fechaIngreso: Date, fechaEgreso?: Date | null): number {
  const fin = fechaEgreso ?? new Date();
  const ms = fin.getTime() - fechaIngreso.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// ── Parseo de fechas (formato es-SV: dd/mm/yyyy) ────────────────────────────

export function parseFechaEs(input?: string | null): Date | null {
  if (!input) return null;
  const limpio = input.trim();
  if (!limpio) return null;
  const m = limpio.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, dStr, mStr, yStr] = m;
  let year = parseInt(yStr, 10);
  if (year < 100) year += year < 50 ? 2000 : 1900;
  const day = parseInt(dStr, 10);
  const month = parseInt(mStr, 10) - 1;
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return null;
  return d;
}

export function parseHoraEs(hora?: string | null): { h: number; m: number } | null {
  if (!hora) return null;
  const limpio = hora.trim();
  const m = limpio.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

export function combinarFechaHora(fecha: Date, hora?: string | null): Date {
  const t = parseHoraEs(hora);
  const d = new Date(fecha);
  if (t) {
    d.setHours(t.h, t.m, 0, 0);
  }
  return d;
}

// ── Normalizadores ──────────────────────────────────────────────────────────

export function normalizarGenero(v?: string | null): Genero {
  const s = (v ?? "").toLowerCase().trim();
  if (s.startsWith("m") || s.startsWith("h")) return "masculino";
  if (s.startsWith("f")) return "femenino";
  return "otro";
}

export function normalizarArea(v?: string | null): AreaGeografica | undefined {
  const s = (v ?? "").toLowerCase().trim();
  if (s.startsWith("u")) return "urbana";
  if (s.startsWith("r")) return "rural";
  return undefined;
}

export function normalizarCircunstancia(v?: string | null): CircunstanciaIngreso | undefined {
  const s = (v ?? "").toLowerCase().trim();
  if (s.includes("espont")) return "demanda_espontanea";
  if (s.includes("emerg")) return "emergencia";
  if (s.includes("refer")) return "referido";
  return undefined;
}

// ── Etiquetas y estilos por estado ──────────────────────────────────────────

export const ESTADO_LABEL: Record<EstadoPaciente, string> = {
  activo:            "Activo",
  alta_vivo:         "Alta vivo",
  alta_fallecido:    "Fallecido",
  alta_voluntaria:   "Alta voluntaria",
  fuga:              "Fuga",
  in_extremis:       "In extremis",
  referido:          "Referido",
};

export const ESTADO_BADGE: Record<EstadoPaciente, string> = {
  activo:          "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900",
  alta_vivo:       "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900",
  alta_fallecido:  "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900",
  alta_voluntaria: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900",
  fuga:            "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900",
  in_extremis:     "bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900",
  referido:        "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700",
};

export const CIRCUNSTANCIA_LABEL: Record<CircunstanciaIngreso, string> = {
  demanda_espontanea: "Demanda espontánea",
  emergencia:         "Emergencia",
  referido:           "Referido",
};

export const GENERO_LABEL: Record<Genero, string> = {
  masculino: "Masculino",
  femenino:  "Femenino",
  otro:      "Otro",
};

// ── Formato visual ──────────────────────────────────────────────────────────

export function formatFecha(date?: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatFechaHora(date?: Date | null): string {
  if (!date) return "—";
  return date.toLocaleString("es-SV", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function nombreCompleto(p: { apellidos: string; nombres: string }): string {
  return `${p.nombres} ${p.apellidos}`.replace(/\s+/g, " ").trim();
}

// ── Conversión Firestore Timestamp ↔ Date ───────────────────────────────────

export function toDate(ts: unknown): Date | undefined {
  if (!ts) return undefined;
  if (ts instanceof Date) return ts;
  const maybe = ts as { toDate?: () => Date };
  if (typeof maybe.toDate === "function") return maybe.toDate();
  const parsed = new Date(ts as string);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}
