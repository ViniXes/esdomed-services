// Catálogo CERRADO de tipos de gestión de Trabajo Social (UTS).
//
// Reemplaza el campo de texto libre del Google Form "INTERVENCIONES PRESENCIALES",
// donde 6,446 respuestas habían generado 1,258 "tipos" distintos que en realidad
// son ~24 canónicos (p. ej. RASTREO / PAX DE RASTREO / GESTION DE RASTREO / DATOS
// DE RASTREO son todos el mismo tipo). Sin catálogo cerrado no hay reporte de
// productividad confiable. Este es el origen de verdad de los tipos; ampliarlo o
// renombrarlo se hace AQUÍ — los ids no deben cambiar una vez en uso (rompería el
// histórico). Definido con TS; pendiente de validación final con el equipo de UTS.

export interface TipoGestionTS {
  id: string;     // estable — se guarda en el documento; NO renombrar en uso
  label: string;  // etiqueta visible
  grupo: GrupoGestionTS;
}

export type GrupoGestionTS =
  | "Visitas"
  | "Consentimientos y responsables"
  | "Pertenencias"
  | "Rastreo"
  | "Altas"
  | "Defunción"
  | "Documentos"
  | "Otras";

// Orden en que se muestran los grupos en el selector.
export const GRUPOS_GESTION_TS: GrupoGestionTS[] = [
  "Visitas",
  "Consentimientos y responsables",
  "Pertenencias",
  "Rastreo",
  "Altas",
  "Defunción",
  "Documentos",
  "Otras",
];

export const TIPOS_GESTION_TS: TipoGestionTS[] = [
  // ── Visitas ──
  { id: "toma_datos_visita",        label: "Toma de datos de visita",                          grupo: "Visitas" },
  { id: "entrega_tarjeta_visita",   label: "Entrega de tarjeta de visita",                     grupo: "Visitas" },
  { id: "autorizacion_visita",      label: "Autorización de visita",                           grupo: "Visitas" },

  // ── Consentimientos y responsables ──
  { id: "consentimiento_denegatoria", label: "Recepción y firma de consentimiento / denegatoria", grupo: "Consentimientos y responsables" },
  { id: "relevo_menor",             label: "Relevo (menor de edad)",                           grupo: "Consentimientos y responsables" },
  { id: "relevo_mayor",             label: "Relevo (mayor de edad)",                           grupo: "Consentimientos y responsables" },
  { id: "cambio_responsable",       label: "Cambio de responsable",                            grupo: "Consentimientos y responsables" },

  // ── Pertenencias ──
  { id: "recepcion_pertenencias_familia",  label: "Recepción de pertenencias (de familiares)",          grupo: "Pertenencias" },
  { id: "devolucion_pertenencias",         label: "Devolución de pertenencias (a familiares)",          grupo: "Pertenencias" },
  { id: "recepcion_pertenencias_interna",  label: "Recepción de pertenencias (área interna / emergencia)", grupo: "Pertenencias" },
  { id: "busqueda_pertenencias_bodega",    label: "Búsqueda de pertenencias en bodega",                 grupo: "Pertenencias" },
  { id: "recepcion_medicamentos",          label: "Recepción de medicamentos",                          grupo: "Pertenencias" },

  // ── Rastreo ──
  { id: "rastreo",                  label: "Rastreo de paciente",                              grupo: "Rastreo" },

  // ── Altas ──
  { id: "alta",                     label: "Gestión de alta",                                  grupo: "Altas" },
  { id: "alta_voluntaria",          label: "Alta voluntaria",                                  grupo: "Altas" },

  // ── Defunción ──
  { id: "proceso_defuncion",        label: "Proceso de defunción",                             grupo: "Defunción" },
  { id: "certificado_defuncion",    label: "Certificado de defunción",                         grupo: "Defunción" },

  // ── Documentos ──
  { id: "solicitud_resumen",        label: "Solicitud de resumen médico",                      grupo: "Documentos" },
  { id: "entrega_resumen",          label: "Entrega de resumen médico",                        grupo: "Documentos" },
  { id: "constancia",               label: "Constancia (permanencia / paciente ingresado)",    grupo: "Documentos" },
  { id: "certificado",              label: "Certificado",                                      grupo: "Documentos" },

  // ── Otras ──
  { id: "informacion_familia",      label: "Información a familiares",                          grupo: "Otras" },
  { id: "capacitacion",             label: "Capacitación",                                     grupo: "Otras" },
  { id: "consulta",                 label: "Consulta",                                         grupo: "Otras" },
  { id: "otra",                     label: "Otra (especificar en notas)",                      grupo: "Otras" },
];

export const TIPO_GESTION_TS_LABEL: Record<string, string> = Object.fromEntries(
  TIPOS_GESTION_TS.map((t) => [t.id, t.label]),
);

/** Etiqueta visible de un tipo; cae al id crudo si el tipo ya no existe en el catálogo. */
export function labelTipoGestion(id: string): string {
  return TIPO_GESTION_TS_LABEL[id] ?? id;
}

// Estado vital del paciente al momento de la gestión. Espeja el "Estado de paciente"
// del Google Form (Paciente actual / Alta / Defunción / N/A).
export type EstadoPacienteGestion = "actual" | "alta" | "defuncion" | "na";

export const ESTADO_PACIENTE_GESTION_LABEL: Record<EstadoPacienteGestion, string> = {
  actual:    "Paciente actual",
  alta:      "Alta",
  defuncion: "Defunción",
  na:        "N/A",
};

// Modalidad de la intervención — la BITACORA DE EXP distingue presencial / llamada /
// videollamada. Por defecto presencial (el origen es el formulario de intervenciones
// PRESENCIALES); las otras dan visibilidad al seguimiento a distancia (ISBM, familias).
export type ModalidadGestion = "presencial" | "llamada" | "videollamada";

export const MODALIDAD_GESTION_LABEL: Record<ModalidadGestion, string> = {
  presencial:   "Presencial",
  llamada:      "Llamada",
  videollamada: "Videollamada",
};

// Resultado de una gestión del grupo "Visitas" (realizada / suspendida /
// autorizada / no procede). Solo aplica cuando el tipo pertenece a ese grupo.
export type ResultadoVisita = "realizada" | "suspendida" | "autorizada" | "no_procede";

export const RESULTADO_VISITA_LABEL: Record<ResultadoVisita, string> = {
  realizada:  "Realizada",
  suspendida: "Suspendida",
  autorizada: "Autorizada",
  no_procede: "No procede",
};

export const RESULTADO_VISITA_COLOR: Record<ResultadoVisita, string> = {
  realizada:  "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900",
  autorizada: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900",
  suspendida: "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-900",
  no_procede: "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
};

/** ¿El tipo de gestión pertenece al grupo de Visitas? Habilita el campo de resultado. */
export function esTipoVisita(id: string): boolean {
  return TIPOS_GESTION_TS.find((t) => t.id === id)?.grupo === "Visitas";
}
