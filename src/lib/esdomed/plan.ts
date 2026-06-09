import type { FilaPlanTrabajo, PlanTrabajo, UserProfile } from "@/types";

// Helpers de calendario y armado de planes de trabajo ESDOMED.

// ── Grupos de trabajo ────────────────────────────────────────────────────────
// Cada empleado se asigna a un grupo dentro del mes (puede variar mes a mes).
export const GRUPOS_ESDOMED = [
  "Administrativo",
  "Grupo 1",
  "Grupo 2",
  "Grupo 3",
  "Grupo 4",
  "Equipo de emergencia",
] as const;

export type GrupoEsdomed = (typeof GRUPOS_ESDOMED)[number];

// Estilos por grupo para badges/encabezados (colores distintos para identificar).
export const COLOR_GRUPO: Record<string, { badge: string; dot: string; barra: string; corto: string }> = {
  "Administrativo": {
    badge: "bg-[#1c1e4d]/10 text-[#1c1e4d] dark:bg-[var(--color-institutional-navy)] dark:text-[#c9a892]",
    dot: "bg-[#1c1e4d] dark:bg-[#c9a892]",
    barra: "bg-[#1c1e4d]/10 text-[#1c1e4d] dark:bg-[var(--color-institutional-navy)] dark:text-[#c9a892]",
    corto: "Adm",
  },
  "Grupo 1": {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    dot: "bg-blue-500",
    barra: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    corto: "G1",
  },
  "Grupo 2": {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    dot: "bg-amber-500",
    barra: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    corto: "G2",
  },
  "Grupo 3": {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    dot: "bg-emerald-500",
    barra: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    corto: "G3",
  },
  "Grupo 4": {
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
    dot: "bg-teal-500",
    barra: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
    corto: "G4",
  },
  "Equipo de emergencia": {
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    dot: "bg-rose-500",
    barra: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    corto: "Emerg.",
  },
};

/** Orden de un grupo para ordenar filas (los sin grupo van al final). */
export function ordenGrupo(grupo: string | undefined | null): number {
  const i = GRUPOS_ESDOMED.indexOf((grupo ?? "") as GrupoEsdomed);
  return i === -1 ? 99 : i;
}

export const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Iniciales de día como en el formato oficial: D L M Mi J V S
const INICIALES_DIA = ["D", "L", "M", "Mi", "J", "V", "S"];

/** "YYYY-MM" → { anio, mes }. */
export function parsePeriodo(periodo: string): { anio: number; mes: number } {
  const [a, m] = periodo.split("-").map(Number);
  return { anio: a, mes: m };
}

/** { anio, mes(1-12) } → "YYYY-MM". */
export function formatPeriodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

/** Etiqueta legible, ej. "Junio 2026". */
export function labelPeriodo(periodo: string): string {
  const { anio, mes } = parsePeriodo(periodo);
  return `${NOMBRES_MES[mes - 1]} ${anio}`;
}

/** Cantidad de días del mes (mes 1-12). */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

/** Lista de números de día [1..n] del mes. */
export function diasDelMesArray(anio: number, mes: number): number[] {
  return Array.from({ length: diasDelMes(anio, mes) }, (_, i) => i + 1);
}

/** Inicial del día de la semana para cada día del mes (alineado a diasDelMesArray). */
export function inicialesDeMes(anio: number, mes: number): string[] {
  return diasDelMesArray(anio, mes).map((dia) => {
    const dow = new Date(anio, mes - 1, dia).getDay(); // 0=Domingo
    return INICIALES_DIA[dow];
  });
}

/** True si el día (1-based) cae en sábado o domingo. */
export function esFinDeSemana(anio: number, mes: number, dia: number): boolean {
  const dow = new Date(anio, mes - 1, dia).getDay();
  return dow === 0 || dow === 6;
}

export const PERIODO_ACTUAL = (() => {
  const hoy = new Date();
  return formatPeriodo(hoy.getFullYear(), hoy.getMonth() + 1);
})();

/** Genera los últimos N y próximos M periodos alrededor del actual (para selectores). */
export function periodosCercanos(atras = 12, adelante = 2): string[] {
  const hoy = new Date();
  const out: string[] = [];
  for (let i = atras; i >= -adelante; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    out.push(formatPeriodo(d.getFullYear(), d.getMonth() + 1));
  }
  return out;
}

/** Roster: usuarios que deben aparecer en el plan (personal ESDOMED). */
export function esPersonalPlan(role: string): boolean {
  return role === "esdomed" || role === "asistente_esdomed";
}

/**
 * Construye una fila en blanco para un usuario, con `n` días sin asignar.
 * Si ya existía una fila previa (otro mes), se reutilizan nombre/puesto.
 */
export function filaDesdeUsuario(u: Pick<UserProfile, "uid" | "nombre" | "codigoMarcacion" | "puesto">, dias: number): FilaPlanTrabajo {
  return {
    uid: u.uid,
    codigoMarcacion: u.codigoMarcacion?.trim() || "",
    nombre: u.nombre,
    puesto: u.puesto?.trim() || "",
    asignaciones: Array(dias).fill(""),
    observaciones: "",
  };
}

/**
 * Mezcla el roster actual de usuarios con un plan existente: conserva las
 * asignaciones ya guardadas y agrega filas nuevas para usuarios sin fila.
 * Empareja por uid, y como respaldo por código de marcación.
 */
export function sincronizarFilas(
  usuarios: Pick<UserProfile, "uid" | "nombre" | "codigoMarcacion" | "puesto">[],
  filasPrevias: FilaPlanTrabajo[],
  dias: number,
): FilaPlanTrabajo[] {
  const porUid = new Map(filasPrevias.filter((f) => f.uid).map((f) => [f.uid, f]));
  const porCodigo = new Map(
    filasPrevias.filter((f) => f.codigoMarcacion).map((f) => [f.codigoMarcacion, f]),
  );

  return usuarios.map((u) => {
    const previa =
      (u.uid && porUid.get(u.uid)) ||
      (u.codigoMarcacion && porCodigo.get(u.codigoMarcacion.trim())) ||
      null;
    if (previa) {
      // Ajusta el largo de asignaciones al mes (por si cambió de febrero a marzo).
      const asignaciones = Array(dias)
        .fill("")
        .map((_, i) => previa.asignaciones[i] ?? "");
      return {
        ...previa,
        uid: u.uid,
        nombre: u.nombre,
        puesto: u.puesto?.trim() || previa.puesto || "",
        codigoMarcacion: u.codigoMarcacion?.trim() || previa.codigoMarcacion || "",
        asignaciones,
      };
    }
    return filaDesdeUsuario(u, dias);
  });
}

/** Encuentra la fila de un usuario dentro de un plan (por uid o código). */
export function filaDeUsuario(plan: PlanTrabajo, u: Pick<UserProfile, "uid" | "codigoMarcacion">): FilaPlanTrabajo | undefined {
  return (
    plan.filas.find((f) => f.uid && f.uid === u.uid) ||
    (u.codigoMarcacion
      ? plan.filas.find((f) => f.codigoMarcacion?.trim() === u.codigoMarcacion?.trim())
      : undefined)
  );
}
