// Trabajo Social de Consulta Externa: catálogo, validaciones y resúmenes.
//
// Dos trabajadoras (rol trabajo_social_ce) registran GESTIONES por paciente y,
// en cada gestión, las NOTAS que haga falta. El paciente sale de los citados
// (consulta_externa_citas); si no está citado, se escribe a mano. No usa nada
// de hospitalización: ni el padrón, ni gestiones_ts, ni las citas 2027 (estas
// son solo un control interno de agenda).
//
// El catálogo sale de "Actividades de Trabajo Social consulta externa"
// (2026-11-24). Los ids no cambian una vez en uso: partirían el histórico.
//
// Pura y sin imports: la usan la API, las pantallas y
// scripts/test-trabajo-social-ce.mjs.

export const COL_TS_GESTIONES = "consulta_externa_ts_gestiones";
export const COL_TS_NOTAS = "consulta_externa_ts_notas";
export const COL_TS_ACTIVIDADES = "consulta_externa_ts_actividades";
/** Índice de pacientes: los citados y los que ya tienen gestiones, en 20 documentos. */
export const COL_TS_PACIENTES = "consulta_externa_ts_pacientes";

// ── Áreas ───────────────────────────────────────────────────────────────────

export type AreaTSCE = "cardiologia" | "hemato_onco" | "otra";

export const AREAS_TS_CE: { id: AreaTSCE; nombre: string; especialidades: string[] }[] = [
  { id: "cardiologia", nombre: "Cardiología", especialidades: ["cardiologia", "cirugia_cardiovascular", "cirugia_torax"] },
  { id: "hemato_onco", nombre: "Hematología, Oncología y QTA", especialidades: ["hematologia", "oncologia"] },
  // Infectología no tiene trabajadora social, pero se le puede gestionar a cualquier paciente.
  { id: "otra", nombre: "Otra especialidad", especialidades: [] },
];

/** Áreas que se le asignan a una cuenta (decide qué catálogo sale primero, no bloquea). */
export const AREAS_DE_CUENTA = AREAS_TS_CE.filter((a) => a.id !== "otra");

export const esAreaTSCE = (v: unknown): v is AreaTSCE => AREAS_TS_CE.some((a) => a.id === v);
export const esAreaDeCuenta = (v: unknown): v is Exclude<AreaTSCE, "otra"> => AREAS_DE_CUENTA.some((a) => a.id === v);
export const nombreArea = (id: string): string => AREAS_TS_CE.find((a) => a.id === id)?.nombre ?? id;

export function areaDeEspecialidad(especialidadId: string): AreaTSCE | null {
  if (!especialidadId) return null;
  return AREAS_TS_CE.find((a) => a.especialidades.includes(especialidadId))?.id ?? "otra";
}

// ── Catálogo de gestiones ───────────────────────────────────────────────────

export interface Opcion { id: string; label: string }

export interface TipoGestionTSCE {
  id: string;
  label: string;
  /** "comun" = de cualquiera de las dos áreas. */
  grupo: "comun" | "cardiologia" | "hemato_onco";
  /** Pasos sugeridos para las notas. */
  pasos: Opcion[];
  /** Qué se gestionó (obligatorio si el tipo lo trae). */
  detalles?: Opcion[];
  /** Pregunta si el paciente es de aquí o de un hospital de la red. */
  pideProcedencia?: boolean;
  /** Pregunta el médico (se sugiere el de su última cita). */
  pideMedico?: boolean;
}

const ENTREVISTAS: Opcion[] = [
  { id: "entrevista_paciente", label: "Entrevista con el paciente" },
  { id: "entrevista_familiar", label: "Entrevista con familiar" },
];
const LLAMADA: Opcion = { id: "llamada", label: "Llamada telefónica" };

export const TIPOS_GESTION_TS_CE: TipoGestionTSCE[] = [
  // ── Comunes ──
  {
    id: "atencion_caso", label: "Atención de caso", grupo: "comun",
    pasos: [
      ...ENTREVISTAS,
      { id: "llamada_realizada", label: "Llamada realizada" },
      { id: "llamada_recibida", label: "Llamada recibida" },
      { id: "charla_educativa", label: "Charla educativa al paciente o familiar" },
    ],
  },
  {
    id: "cita_estudio", label: "Cita o estudio", grupo: "comun", pideProcedencia: true,
    detalles: [
      { id: "cita_alta", label: "Cita de paciente de alta" },
      { id: "cita_olvidada", label: "Cita olvidada" },
      { id: "cita_prioritaria", label: "Cita prioritaria" },
      { id: "ekg_prioritario", label: "EKG prioritario" },
      { id: "ecocardiograma", label: "Ecocardiograma" },
      { id: "eco_transesofagico", label: "Ecocardiograma transesofágico" },
      { id: "prueba_esfuerzo", label: "Prueba de esfuerzo" },
      { id: "holter", label: "Holter" },
      { id: "rx", label: "Rayos X" },
      { id: "resonancia", label: "Resonancia magnética" },
      { id: "usg", label: "Ultrasonografía (USG)" },
      { id: "otra_cita", label: "Otra cita o estudio" },
    ],
    pasos: [
      LLAMADA,
      { id: "cita_otorgada", label: "Cita otorgada" },
      { id: "entrega_comprobante", label: "Entrega de comprobante de cita" },
    ],
  },
  {
    id: "reprogramacion", label: "Reprogramación de cita médica", grupo: "comun", pideMedico: true,
    pasos: [LLAMADA, { id: "nueva_fecha", label: "Nueva fecha informada" }],
  },
  {
    id: "expediente", label: "Gestión de expediente", grupo: "comun",
    detalles: [
      { id: "paciente_alta", label: "Paciente de alta" },
      { id: "primera_vez", label: "Primera vez" },
    ],
    pasos: [{ id: "solicitud", label: "Solicitud del expediente" }, { id: "entrega", label: "Expediente listo" }],
  },
  {
    id: "receta", label: "Trámite de receta", grupo: "comun", pideMedico: true,
    pasos: [
      ...ENTREVISTAS,
      { id: "gestion_medico", label: "Gestión de receta con el médico" },
      { id: "coordinacion_farmacia", label: "Coordinación con farmacia" },
    ],
  },
  {
    id: "resumen_clinico", label: "Resumen clínico", grupo: "comun", pideProcedencia: true,
    pasos: [{ id: "solicitud", label: "Solicitud del resumen" }, { id: "entrega", label: "Entrega del resumen" }],
  },
  {
    id: "constancia_medica", label: "Constancia médica", grupo: "comun",
    pasos: [{ id: "solicitud", label: "Solicitud" }, { id: "entrega", label: "Entrega" }],
  },
  {
    id: "constancia_permanencia", label: "Constancia de permanencia", grupo: "comun",
    detalles: [{ id: "paciente", label: "Para el paciente" }, { id: "familiar", label: "Para familiar" }],
    pasos: [{ id: "elaboracion", label: "Elaboración" }, { id: "entrega", label: "Entrega" }],
  },
  {
    id: "rastreo", label: "Rastreo de paciente", grupo: "comun",
    pasos: [
      LLAMADA,
      { id: "pnc", label: "PNC" },
      { id: "alcaldia", label: "Alcaldía" },
      { id: "unidad_salud", label: "Unidad de salud" },
      { id: "hospital_periferico", label: "Hospital periférico" },
    ],
  },
  {
    id: "informe_social", label: "Informe social", grupo: "comun",
    pasos: [{ id: "elaboracion", label: "Elaboración" }, { id: "entrega", label: "Entrega" }],
  },
  { id: "orientacion_referencia", label: "Orientación por referencia", grupo: "comun", pasos: [] },
  {
    id: "cambio_medico", label: "Solicitud de cambio de médico", grupo: "comun", pideMedico: true,
    pasos: [
      ...ENTREVISTAS,
      { id: "llenado_solicitud", label: "Llenado de solicitud" },
      { id: "presentacion_jefatura", label: "Presentación del caso a jefatura" },
      { id: "orientacion", label: "Orientación al paciente o familiar" },
    ],
  },
  { id: "otra", label: "Otra gestión (especificar en la nota)", grupo: "comun", pasos: [] },

  // ── Cardiología ──
  {
    id: "marcapaso", label: "Trámite de marcapaso", grupo: "cardiologia",
    pasos: [
      ...ENTREVISTAS,
      { id: "orientacion", label: "Orientación del trámite de colocación" },
      { id: "gestion_hemodinamia", label: "Gestión con responsable de sala de hemodinamia" },
    ],
  },
  {
    id: "cambio_generador", label: "Cambio de generador", grupo: "cardiologia",
    pasos: [
      ...ENTREVISTAS,
      { id: "entrevista_tecnico", label: "Entrevista con técnico de revisión de marcapaso" },
      { id: "gestion_hemodinamia", label: "Gestión con responsable de sala de hemodinamia" },
    ],
  },
  {
    id: "cupo_demanda", label: "Cupo de demanda espontánea", grupo: "cardiologia", pideProcedencia: true,
    pasos: [LLAMADA, { id: "cupo_otorgado", label: "Cupo otorgado" }],
  },

  // ── Hematología, Oncología y QTA ──
  {
    id: "programa_mas", label: "Programa MAS: inscripción", grupo: "hemato_onco",
    pasos: [
      { id: "revision_referencia", label: "Revisión de referencia" },
      ...ENTREVISTAS,
      { id: "llenado_formulario", label: "Llenado de formulario (declaración financiera y consentimiento)" },
      { id: "ingreso_solicitud", label: "Ingreso de solicitud al programa" },
      { id: "rastreo_previo", label: "Rastreo previo a la cita" },
      { id: "aviso_aprobacion", label: "Información de aprobación por llamada" },
      { id: "revision_documentos", label: "Revisión de documentos requisito" },
      { id: "envio_documentos", label: "Envío de documentos al programa" },
      { id: "retiro_medicamento", label: "Control de retiro de medicamento" },
    ],
  },
  {
    id: "cambio_tratamiento", label: "Cambio de tratamiento o dosis", grupo: "hemato_onco",
    pasos: [
      { id: "llenado_formulario", label: "Llenado de formulario" },
      { id: "envio_documentos", label: "Envío de documentos al programa" },
      LLAMADA,
    ],
  },
  { id: "programa_tfr", label: "Programa TFR: seguimiento", grupo: "hemato_onco", pasos: [LLAMADA] },
  {
    id: "disfruto_mi_salud", label: "Disfruto mi Salud", grupo: "hemato_onco",
    pasos: [
      { id: "seguimiento", label: "Seguimiento de caso" },
      { id: "retiro_medicamento", label: "Control de retiro de medicamento" },
      { id: "actualizacion", label: "Actualización de paciente activo" },
    ],
  },
  {
    id: "resultado_laboratorio", label: "Resultado de laboratorio", grupo: "hemato_onco",
    pasos: [
      { id: "seguimiento_resultado", label: "Seguimiento de resultado" },
      { id: "examen_no_realizado", label: "Control de examen no realizado" },
    ],
  },
  {
    id: "bcr", label: "Calendarización para BCR", grupo: "hemato_onco",
    pasos: [LLAMADA, { id: "envio_programacion", label: "Envío de programación HES" }],
  },
  { id: "paciente_reprobado", label: "Actualización de paciente reprobado", grupo: "hemato_onco", pasos: [LLAMADA] },
];

export const tipoGestion = (id: string): TipoGestionTSCE | undefined => TIPOS_GESTION_TS_CE.find((t) => t.id === id);
export const labelTipo = (id: string): string => tipoGestion(id)?.label ?? id;
export const labelDetalle = (tipo: string, detalle: string): string =>
  tipoGestion(tipo)?.detalles?.find((d) => d.id === detalle)?.label ?? detalle;
export const labelPaso = (tipo: string, paso: string): string =>
  tipoGestion(tipo)?.pasos.find((p) => p.id === paso)?.label
  // Si se corrigió el tipo de la gestión, el paso puede ser de otro tipo.
  ?? TIPOS_GESTION_TS_CE.flatMap((t) => t.pasos).find((p) => p.id === paso)?.label
  ?? paso;

/** Grupos del selector: primero los del área de la cuenta, luego comunes y el otro. */
export function gruposDeTipos(areaCuenta?: string): { id: TipoGestionTSCE["grupo"]; titulo: string; tipos: TipoGestionTSCE[] }[] {
  const titulos: Record<TipoGestionTSCE["grupo"], string> = {
    comun: "Comunes",
    cardiologia: "Cardiología",
    hemato_onco: "Hematología, Oncología y QTA",
  };
  const orden: TipoGestionTSCE["grupo"][] = areaCuenta === "hemato_onco"
    ? ["hemato_onco", "comun", "cardiologia"]
    : areaCuenta === "cardiologia"
      ? ["cardiologia", "comun", "hemato_onco"]
      : ["comun", "cardiologia", "hemato_onco"];
  return orden.map((id) => ({ id, titulo: titulos[id], tipos: TIPOS_GESTION_TS_CE.filter((t) => t.grupo === id) }));
}

/**
 * Área en que cuenta una gestión: la del tipo si es propio de un área; si es
 * común, la de la especialidad del paciente; si no se sabe, la de la cuenta.
 * No es la de quien la hace: así se ve cuando una cubre a la otra.
 */
export function areaSugerida(tipo: string, especialidadId: string, areaCuenta?: string): AreaTSCE {
  const grupo = tipoGestion(tipo)?.grupo;
  if (grupo && grupo !== "comun") return grupo;
  return areaDeEspecialidad(especialidadId) ?? (esAreaTSCE(areaCuenta) ? areaCuenta : "otra");
}

/** Lo que el paso ya dice, para no marcarlo dos veces (se puede cambiar). */
export function sugeridoPorPaso(paso: string): { conQuien?: string; medio?: string } {
  if (paso.startsWith("llamada")) return { medio: "llamada" };
  const conQuien: Record<string, string> = { entrevista_paciente: "paciente", entrevista_familiar: "familiar", gestion_medico: "medico" };
  return conQuien[paso] ? { conQuien: conQuien[paso] } : {};
}

export const CON_QUIEN: Opcion[] = [
  { id: "paciente", label: "Paciente" },
  { id: "familiar", label: "Familiar" },
  { id: "medico", label: "Médico" },
  { id: "enfermeria", label: "Enfermería" },
  { id: "institucion", label: "Otro hospital o institución" },
  { id: "otro", label: "Otro" },
];
export const MEDIOS: Opcion[] = [
  { id: "presencial", label: "Presencial" },
  { id: "llamada", label: "Llamada" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "tramite", label: "Trámite o documento" },
];
export const POBLACIONES: Opcion[] = [
  { id: "adulto_mayor", label: "Adulto mayor" },
  { id: "privado_libertad", label: "Privado de libertad" },
];
export type ProcedenciaTS = "propia" | "red";
export type EstadoGestionTS = "en_proceso" | "finalizada" | "no_procede";
export const ESTADO_GESTION_LABEL: Record<EstadoGestionTS, string> = {
  en_proceso: "En proceso",
  finalizada: "Finalizada",
  no_procede: "No procede",
};

const labelDe = (lista: Opcion[], id: string) => lista.find((o) => o.id === id)?.label ?? id;
export const labelConQuien = (id: string): string => labelDe(CON_QUIEN, id);
export const labelMedio = (id: string): string => labelDe(MEDIOS, id);
export const labelPoblacion = (id: string): string => labelDe(POBLACIONES, id);

/** Actividades que no son de un paciente. */
export const TIPOS_ACTIVIDAD: (Opcion & { pregunta: string; asistentes?: boolean })[] = [
  { id: "charla", label: "Charla orientativa o informativa", pregunta: "Tema de la charla", asistentes: true },
  { id: "temas_educativos", label: "Gestión de temas educativos", pregunta: "Tema y con quién se gestionó" },
  { id: "reunion_virtual", label: "Reunión virtual", pregunta: "Asunto de la reunión" },
  { id: "correspondencia", label: "Entrega de correspondencia a médicos", pregunta: "Qué se entregó y a quién" },
  { id: "otra", label: "Otra actividad", pregunta: "Descripción" },
];
export const labelActividad = (id: string): string => labelDe(TIPOS_ACTIVIDAD, id);

// ── Documentos (como los devuelve la API) ───────────────────────────────────

export interface CierreTS { accion: "finalizada" | "no_procede" | "reabierta"; enMs: number; porNombre: string; motivo?: string }

export interface GestionTSCE {
  id: string;
  clave: string;
  expediente: string;
  dui: string;
  paciente: string;
  /** Especialidad de su última cita ("" si se escribió a mano). */
  especialidadId: string;
  origen: "cita" | "manual";
  tipo: string;
  detalle: string;
  area: AreaTSCE;
  procedencia: ProcedenciaTS | "";
  establecimiento: string;
  medico: string;
  poblacion: string[];
  estado: EstadoGestionTS;
  motivoNoProcede: string;
  fecha: string;
  fechaCierre: string;
  creadoPor: string;
  creadoPorNombre: string;
  creadoEnMs: number;
  totalNotas: number;
  ultimaNotaFecha: string;
  historial: CierreTS[];
}

export interface NotaTSCE {
  id: string;
  gestionId: string;
  clave: string;
  fecha: string;
  paso: string;
  conQuien: string;
  medio: string;
  texto: string;
  autor: string;
  autorNombre: string;
  creadoEnMs: number;
  editadoEnMs: number;
}

export interface ActividadTSCE {
  id: string;
  tipo: string;
  detalle: string;
  asistentes: number;
  area: AreaTSCE;
  fecha: string;
  autor: string;
  autorNombre: string;
  creadoEnMs: number;
}

/** Entrada del índice de pacientes (por clave). */
export interface PacienteIndice {
  expediente: string;
  dui: string;
  paciente: string;
  /** Primera y última fecha con cita ("" si se escribió a mano). */
  primera: string;
  ultima: string;
  especialidades: string[];
  /** De su cita más reciente. */
  especialidadId: string;
  medico: string;
  manual?: boolean;
  /** Gestiones registradas; las de la bitácora son las que tienen al menos una. */
  gestiones?: number;
  ultimaGestionMs?: number;
}
export type PacienteTSCE = PacienteIndice & { clave: string };

// ── Utilidades ──────────────────────────────────────────────────────────────

const texto = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/** Conserva los saltos de línea de una nota. */
const parrafo = (v: unknown, max: number): string =>
  String(v ?? "").replace(/\r/g, "").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

export function claveTexto(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

export function normalizarExpedienteTS(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, "").replace(/[‐-―]/g, "-").toUpperCase();
}

/** "004188606" → "00418860-6"; lo que no tiene 9 dígitos no es un DUI. */
export function normalizarDui(s: unknown): string {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length === 9 ? `${d.slice(0, 8)}-${d.slice(8)}` : "";
}

/** Identidad del paciente en la bitácora: expediente; si no tiene, DUI; si no, el nombre. */
export function claveDePaciente(p: { expediente: string; dui: string; paciente: string }): string {
  if (p.expediente) return p.expediente;
  if (p.dui) return `dui:${p.dui}`;
  return `nom:${claveTexto(p.paciente)}`;
}

export const FRAGMENTOS_PACIENTES = 20;

/** Documento del índice que guarda a un paciente. Siempre cae en el mismo. */
export function fragmentoPaciente(clave: string): string {
  let h = 0;
  for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) >>> 0;
  return `f${String(h % FRAGMENTOS_PACIENTES).padStart(2, "0")}`;
}

export function esFecha(s: unknown): s is string {
  const m = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCDate() === Number(m[3]) && d.getUTCMonth() === Number(m[2]) - 1;
}

export const esMes = (s: unknown): s is string => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s ?? ""));

const diasUTC = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);
export const diasEntre = (desde: string, hasta: string): number => diasUTC(hasta) - diasUTC(desde);

/** Último día del mes "YYYY-MM". */
export function finDeMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Cuántos días atrás se puede fechar un registro. */
export const DIAS_ATRAS = 60;

function fechaValida(v: unknown, hoy: string): string | null {
  const f = v == null || v === "" ? hoy : String(v);
  if (!esFecha(f) || f > hoy || diasEntre(f, hoy) > DIAS_ATRAS) return null;
  return f;
}

// ── Validaciones (las mismas en la pantalla y en la API) ────────────────────

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };
const falla = (error: string): { ok: false; error: string } => ({ ok: false, error });
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export interface DatosPacienteManual { expediente: string; dui: string; paciente: string }

export function validarPacienteManual(v: unknown): Resultado<DatosPacienteManual> {
  const o = obj(v);
  const paciente = texto(o.paciente, 160);
  const expediente = normalizarExpedienteTS(o.expediente);
  const duiEscrito = texto(o.dui, 20);
  const dui = normalizarDui(duiEscrito);
  if (claveTexto(paciente).replace(/[^A-Z]/g, "").length < 5 || !/[\s,]/.test(paciente)) {
    return falla("Escriba el nombre y el apellido del paciente.");
  }
  if (expediente && (expediente.includes("/") || expediente.length > 30)) return falla("El expediente no es válido.");
  if (duiEscrito && !dui) return falla("El DUI debe tener 9 dígitos.");
  return { ok: true, datos: { expediente, dui, paciente } };
}

export interface DatosGestion {
  tipo: string;
  detalle: string;
  area: AreaTSCE;
  procedencia: ProcedenciaTS | "";
  establecimiento: string;
  medico: string;
  poblacion: string[];
}

export function validarGestion(v: unknown): Resultado<DatosGestion> {
  const o = obj(v);
  const t = tipoGestion(String(o.tipo ?? ""));
  if (!t) return falla("Elija el tipo de gestión.");
  const detalle = t.detalles?.some((d) => d.id === o.detalle) ? String(o.detalle) : "";
  if (t.detalles && !detalle) return falla("Elija qué se gestionó.");
  if (!esAreaTSCE(o.area)) return falla("Elija el área.");
  let procedencia: ProcedenciaTS | "" = "";
  let establecimiento = "";
  if (t.pideProcedencia) {
    procedencia = o.procedencia === "red" ? "red" : "propia";
    establecimiento = procedencia === "red" ? texto(o.establecimiento, 160) : "";
    if (procedencia === "red" && !establecimiento) return falla("Elija el hospital o establecimiento de la red.");
  }
  return {
    ok: true,
    datos: {
      tipo: t.id,
      detalle,
      // Un tipo propio de un área siempre cuenta en ella.
      area: t.grupo === "comun" ? o.area : t.grupo,
      procedencia,
      establecimiento,
      medico: t.pideMedico ? texto(o.medico, 120) : "",
      poblacion: Array.isArray(o.poblacion) ? POBLACIONES.map((p) => p.id).filter((id) => (o.poblacion as unknown[]).includes(id)) : [],
    },
  };
}

export interface DatosNota { fecha: string; paso: string; conQuien: string; medio: string; texto: string }

export function validarNota(v: unknown, tipo: string, hoy: string): Resultado<DatosNota> {
  const o = obj(v);
  const fecha = fechaValida(o.fecha, hoy);
  if (!fecha) return falla(`La fecha no puede ser futura ni de hace más de ${DIAS_ATRAS} días.`);
  const paso = tipoGestion(tipo)?.pasos.some((p) => p.id === o.paso) ? String(o.paso) : "";
  const medio = MEDIOS.some((m) => m.id === o.medio) ? String(o.medio) : "";
  const contenido = parrafo(o.texto, 2000);
  if (!medio) return falla("Elija el medio (presencial, llamada, WhatsApp o trámite).");
  if (tipo === "otra" && contenido.length < 5) return falla("Escriba en la nota de qué gestión se trata.");
  if (!paso && contenido.length < 3) return falla("Elija un paso o escriba la nota.");
  return {
    ok: true,
    datos: { fecha, paso, conQuien: CON_QUIEN.some((c) => c.id === o.conQuien) ? String(o.conQuien) : "", medio, texto: contenido },
  };
}

/** Motivo obligatorio para cerrar como "no procede" (pedido del usuario, 2026-11-24). */
export function validarMotivo(v: unknown): Resultado<string> {
  const motivo = parrafo(v, 500);
  return motivo.length < 5 ? falla("Justifique por qué no procede.") : { ok: true, datos: motivo };
}

export interface DatosActividad { tipo: string; detalle: string; asistentes: number; area: AreaTSCE; fecha: string }

export function validarActividad(v: unknown, hoy: string): Resultado<DatosActividad> {
  const o = obj(v);
  const t = TIPOS_ACTIVIDAD.find((x) => x.id === o.tipo);
  if (!t) return falla("Elija el tipo de actividad.");
  const detalle = parrafo(o.detalle, 500);
  if (detalle.length < 3) return falla(`Complete: ${t.pregunta.toLowerCase()}.`);
  const fecha = fechaValida(o.fecha, hoy);
  if (!fecha) return falla(`La fecha no puede ser futura ni de hace más de ${DIAS_ATRAS} días.`);
  const n = Number(o.asistentes ?? 0);
  if (t.asistentes && (!Number.isInteger(n) || n < 0 || n > 1000)) return falla("La cantidad de asistentes no es válida.");
  return { ok: true, datos: { tipo: t.id, detalle, asistentes: t.asistentes ? n : 0, area: esAreaTSCE(o.area) ? o.area : "otra", fecha } };
}

// ── Índice de citados ───────────────────────────────────────────────────────

export interface CitaParaIndice {
  fecha: string;
  expediente: string;
  dui: string;
  paciente: string;
  especialidadId: string;
  medico: string;
}

/** Lo que las citas saben del paciente (los contadores de gestiones van aparte). */
export type DatosDeCita = Omit<PacienteIndice, "gestiones" | "ultimaGestionMs">;

/** Suma una cita al paciente. Idempotente; manda la cita más reciente. */
export function fusionarCita(previa: DatosDeCita | undefined, c: CitaParaIndice): DatosDeCita {
  const dui = texto(c.dui, 20);
  const paciente = texto(c.paciente, 200);
  const medico = texto(c.medico, 160);
  if (!previa || !previa.ultima) {
    return {
      expediente: c.expediente,
      dui: dui || previa?.dui || "",
      paciente: paciente || previa?.paciente || "",
      primera: c.fecha,
      ultima: c.fecha,
      especialidades: c.especialidadId ? [c.especialidadId] : [],
      especialidadId: c.especialidadId,
      medico,
      manual: false,
    };
  }
  const masReciente = c.fecha >= previa.ultima;
  return {
    expediente: c.expediente,
    dui: (masReciente && dui) || previa.dui || dui,
    paciente: (masReciente && paciente) || previa.paciente || paciente,
    primera: c.fecha < previa.primera ? c.fecha : previa.primera,
    ultima: masReciente ? c.fecha : previa.ultima,
    especialidades: c.especialidadId && !previa.especialidades.includes(c.especialidadId)
      ? [...previa.especialidades, c.especialidadId]
      : previa.especialidades,
    especialidadId: masReciente ? c.especialidadId || previa.especialidadId : previa.especialidadId,
    medico: masReciente ? medico || previa.medico : previa.medico,
    manual: false,
  };
}

/** Citas agrupadas por documento del índice (las que no traen expediente no entran). */
export function citasPorFragmento(citas: CitaParaIndice[]): Map<string, CitaParaIndice[]> {
  const mapa = new Map<string, CitaParaIndice[]>();
  for (const c of citas) {
    const expediente = normalizarExpedienteTS(c.expediente);
    if (!expediente) continue;
    const f = fragmentoPaciente(expediente);
    const lista = mapa.get(f) ?? [];
    lista.push({ ...c, expediente });
    mapa.set(f, lista);
  }
  return mapa;
}

// ── Tablero ─────────────────────────────────────────────────────────────────

/** Días sin notas para que un caso abierto salga como "sin movimiento". */
export const DIAS_SIN_MOVIMIENTO = 7;

export const diasSinMovimiento = (g: GestionTSCE, hoy: string): number => diasEntre(g.ultimaNotaFecha || g.fecha, hoy);

export interface FiltroTablero { persona?: string; area?: string }

export interface FilaConteo { id: string; label: string; nuevas: number; finalizadas: number; noProcede: number; enProceso: number; notas: number; diasCierre: number | null }
export interface FilaPersona { uid: string; nombre: string; gestiones: number; notas: number; pacientes: number; actividades: number; areas: { area: AreaTSCE; gestiones: number; notas: number }[] }

export interface ResumenTS {
  nuevas: number;
  finalizadas: number;
  noProcede: number;
  enProceso: number;
  notas: number;
  pacientes: number;
  actividades: number;
  asistentes: number;
  porTipo: FilaConteo[];
  porArea: FilaConteo[];
  porPersona: FilaPersona[];
  porDia: { fecha: string; gestiones: number; notas: number }[];
  porMedio: { id: string; label: string; n: number }[];
  porConQuien: { id: string; label: string; n: number }[];
  porDetalle: { id: string; label: string; n: number }[];
  red: { establecimiento: string; n: number }[];
  poblacion: { id: string; label: string; n: number }[];
  sinMovimiento: GestionTSCE[];
  noProceden: GestionTSCE[];
}

/**
 * Resumen de un mes. "Nuevas" y notas son del mes; "finalizadas" y "no procede",
 * las cerradas en el mes aunque se abrieran antes; "en proceso", lo abierto hoy.
 * Una gestión y sus notas se cuentan aparte: sumarlas premiaría partir notas.
 */
export function resumirTS(
  mes: string,
  datos: { gestiones: GestionTSCE[]; notas: NotaTSCE[]; actividades: ActividadTSCE[] },
  hoy: string,
  filtro: FiltroTablero = {},
): ResumenTS {
  const delMes = (f: string) => !!f && f.slice(0, 7) === mes;
  const porId = new Map(datos.gestiones.map((g) => [g.id, g]));
  const areaOk = (a: string | undefined) => !filtro.area || a === filtro.area;

  const gestiones = datos.gestiones.filter((g) => areaOk(g.area));
  const notas = datos.notas.filter((n) =>
    delMes(n.fecha) && areaOk(porId.get(n.gestionId)?.area) && (!filtro.persona || n.autor === filtro.persona));
  const actividades = datos.actividades.filter((a) =>
    delMes(a.fecha) && areaOk(a.area) && (!filtro.persona || a.autor === filtro.persona));

  const mias = gestiones.filter((g) => !filtro.persona || g.creadoPor === filtro.persona);
  const nuevas = mias.filter((g) => delMes(g.fecha));
  const cerradas = mias.filter((g) => g.estado !== "en_proceso" && delMes(g.fechaCierre));
  const abiertas = mias.filter((g) => g.estado === "en_proceso");

  const filas = (clave: (g: GestionTSCE) => string, label: (id: string) => string): FilaConteo[] => {
    const mapa = new Map<string, FilaConteo & { dias: number[] }>();
    const fila = (id: string) => {
      let f = mapa.get(id);
      if (!f) mapa.set(id, (f = { id, label: label(id), nuevas: 0, finalizadas: 0, noProcede: 0, enProceso: 0, notas: 0, diasCierre: null, dias: [] }));
      return f;
    };
    nuevas.forEach((g) => { fila(clave(g)).nuevas += 1; });
    abiertas.forEach((g) => { fila(clave(g)).enProceso += 1; });
    cerradas.forEach((g) => {
      const f = fila(clave(g));
      if (g.estado === "finalizada") { f.finalizadas += 1; f.dias.push(Math.max(0, diasEntre(g.fecha, g.fechaCierre))); }
      else f.noProcede += 1;
    });
    notas.forEach((n) => { const g = porId.get(n.gestionId); if (g) fila(clave(g)).notas += 1; });
    return [...mapa.values()]
      .map(({ dias, ...f }) => ({ ...f, diasCierre: dias.length ? dias.reduce((a, b) => a + b, 0) / dias.length : null }))
      .sort((a, b) => b.nuevas - a.nuevas || b.notas - a.notas || a.label.localeCompare(b.label, "es"));
  };

  const personas = new Map<string, FilaPersona & { claves: Set<string> }>();
  const persona = (uid: string, nombre: string) => {
    let p = personas.get(uid);
    if (!p) personas.set(uid, (p = { uid, nombre, gestiones: 0, notas: 0, pacientes: 0, actividades: 0, areas: [], claves: new Set() }));
    return p;
  };
  const areaDe = (p: FilaPersona, area: AreaTSCE) => {
    let a = p.areas.find((x) => x.area === area);
    if (!a) p.areas.push((a = { area, gestiones: 0, notas: 0 }));
    return a;
  };
  nuevas.forEach((g) => {
    const p = persona(g.creadoPor, g.creadoPorNombre);
    p.gestiones += 1; p.claves.add(g.clave); areaDe(p, g.area).gestiones += 1;
  });
  notas.forEach((n) => {
    const p = persona(n.autor, n.autorNombre);
    p.notas += 1; p.claves.add(n.clave);
    const g = porId.get(n.gestionId);
    if (g) areaDe(p, g.area).notas += 1;
  });
  actividades.forEach((a) => { persona(a.autor, a.autorNombre).actividades += 1; });

  const dias = new Map<string, { fecha: string; gestiones: number; notas: number }>();
  const ultimo = Number(finDeMes(mes).slice(8));
  for (let d = 1; d <= ultimo; d++) {
    const fecha = `${mes}-${String(d).padStart(2, "0")}`;
    dias.set(fecha, { fecha, gestiones: 0, notas: 0 });
  }
  nuevas.forEach((g) => { const d = dias.get(g.fecha); if (d) d.gestiones += 1; });
  notas.forEach((n) => { const d = dias.get(n.fecha); if (d) d.notas += 1; });

  const contar = (ids: string[], label: (id: string) => string) => {
    const m = new Map<string, number>();
    ids.filter(Boolean).forEach((id) => m.set(id, (m.get(id) ?? 0) + 1));
    return [...m].map(([id, n]) => ({ id, label: label(id), n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "es"));
  };

  const pacientes = new Set([...nuevas.map((g) => g.clave), ...notas.map((n) => n.clave)]);
  return {
    nuevas: nuevas.length,
    finalizadas: cerradas.filter((g) => g.estado === "finalizada").length,
    noProcede: cerradas.filter((g) => g.estado === "no_procede").length,
    enProceso: abiertas.length,
    notas: notas.length,
    pacientes: pacientes.size,
    actividades: actividades.length,
    asistentes: actividades.reduce((s, a) => s + a.asistentes, 0),
    porTipo: filas((g) => g.tipo, labelTipo),
    porArea: filas((g) => g.area, nombreArea),
    porPersona: [...personas.values()]
      .map(({ claves, ...p }) => ({ ...p, pacientes: claves.size, areas: p.areas.sort((a, b) => b.gestiones + b.notas - a.gestiones - a.notas) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    porDia: [...dias.values()],
    porMedio: contar(notas.map((n) => n.medio), labelMedio),
    porConQuien: contar(notas.map((n) => n.conQuien), labelConQuien),
    porDetalle: contar(nuevas.filter((g) => g.tipo === "cita_estudio").map((g) => g.detalle), (id) => labelDetalle("cita_estudio", id)),
    red: contar(nuevas.filter((g) => g.procedencia === "red").map((g) => g.establecimiento), (id) => id).map((x) => ({ establecimiento: x.id, n: x.n })),
    poblacion: contar(nuevas.flatMap((g) => g.poblacion), labelPoblacion),
    sinMovimiento: abiertas
      .filter((g) => diasSinMovimiento(g, hoy) >= DIAS_SIN_MOVIMIENTO)
      .sort((a, b) => diasSinMovimiento(b, hoy) - diasSinMovimiento(a, hoy)),
    noProceden: cerradas.filter((g) => g.estado === "no_procede").sort((a, b) => b.fechaCierre.localeCompare(a.fechaCierre)),
  };
}
