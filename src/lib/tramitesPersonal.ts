import type { CategoriaTramitePersonal, EstadoTramitePersonal, TramitePersonal } from "@/types";

// Catálogo y utilidades de los trámites de personal (colección tramites_personal).

export const CATEGORIAS_TRAMITE: Record<CategoriaTramitePersonal, string> = {
  "A1_permiso_con_goce": "A.1 - Permisos con goce de sueldo",
  "A2_permiso_sin_goce": "A.2 - Permisos sin goce de sueldo",
  "A3_enfermedad": "A.3 - Enfermedad (Incapacidad)",
  "A4_compensatorio": "A.4 - Compensatorio",
  "A5_consulta_isss": "A.5 - Consulta ISSS",
  "A6_paternidad": "A.6 - Paternidad",
  "A7_enfermedad_pariente": "A.7 - Enfermedad de pariente",
  "A8_duelo": "A.8 - Duelo",
  "A9_otros": "A.9 - Otros",
  "B_cambio_turno_individual": "B. Cambio de turno individual",
  "C_cambio_turno_2personas": "C. Cambio de turno (2 personas)",
  "D_licencia_o_acciones": "D. Licencia o Acciones de Personal",
  "E_inconsistencias_marcacion": "E. Inconsistencias de Marcación",
  "F_tiempo_extra": "F. Informe mensual de tiempo extra",
  "G_misiones_oficiales": "G. Misiones oficiales",
};

/** "A.1 - Permisos con goce de sueldo" → { codigo: "A.1", nombre: "Permisos con goce de sueldo" }. */
export function partesCategoria(categoria: CategoriaTramitePersonal): { codigo: string; nombre: string } {
  const etiqueta = CATEGORIAS_TRAMITE[categoria] ?? categoria;
  const m = etiqueta.match(/^([A-Z](?:\.\d+)?)\.?\s*-?\s*(.+)$/);
  return m ? { codigo: m[1], nombre: m[2] } : { codigo: "·", nombre: etiqueta };
}

export const ESTADO_TRAMITE_LABEL: Record<EstadoTramitePersonal, string> = {
  subido: "Documento subido",
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

// Semánticos del design system: ámbar = pendiente, esmeralda = aprobado, rose = rechazado.
export const ESTADO_TRAMITE_PILL: Record<EstadoTramitePersonal, string> = {
  subido: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  pendiente: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900",
  aprobado: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900",
  rechazado: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900",
};

/** "2026-10-12" → "12 de octubre de 2026". */
export const fechaLegible = (fecha: string) =>
  new Date(`${fecha}T12:00:00`).toLocaleDateString("es-SV", { day: "2-digit", month: "long", year: "numeric" });

/** Otro permiso personal del mismo grupo operativo el mismo día (regla: uno por grupo y día). */
export type ConflictoPermisoGrupo = {
  fecha: string;
  grupo: string;
  empleadoNombre: string;
};

/** Lista de adjuntos, compatible con el campo legado de un solo archivo. */
export const docsDeTramite = (t: TramitePersonal): { url: string; nombre: string }[] =>
  t.documentos?.length
    ? t.documentos
    : t.documentoUrl
      ? [{ url: t.documentoUrl, nombre: t.documentoNombre ?? "Documento" }]
      : [];
