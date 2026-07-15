// Tipos del módulo Convenio ISBM — espejo de las tablas PostgreSQL de
// Supabase (supabase/isbm_schema.sql). Los nombres de campo van en
// snake_case porque así viajan por la API REST de Supabase; no convertir.
// Montos: number en dólares (NUMERIC en Postgres — la aritmética sensible
// vive en la base, no en el cliente).

export type TipoFacturacionIsbm =
  | "HOSPITALARIO"
  | "CUIDADOS_INTERMEDIOS"
  | "UCI"
  | "UCI_ECMO"
  | "CRONICOS"
  | "PALIATIVOS";

export interface ServicioHospitalarioIsbm {
  id: number;
  codigo: string; // HOSPI | INTERM | UCI | UCI_ECMO | CRON | PALIT
  nombre: string;
  tipo_facturacion: TipoFacturacionIsbm;
  precio_dia_cama: number;
  tope_diario_examenes: number;
  activo: boolean;
}

export type TipoBeneficiarioIsbm = "COTIZANTE" | "CONYUGUE" | "HIJO" | "PADRE_MADRE";

export interface AfiliacionIsbm {
  expediente: string; // PK — la misma llave de personas/{expediente} en Firestore
  paciente_nombre: string;
  fecha_nacimiento: string | null; // "YYYY-MM-DD"
  genero: "masculino" | "femenino" | "otro" | null;
  dui: string | null;
  numero_afiliacion_isbm: string | null; // campo abierto, lo agrega el técnico
  tipo_beneficiario: TipoBeneficiarioIsbm | null;
  observaciones: string | null;
  activo: boolean;
  creado_por_uid: string;
  creado_por_nombre: string;
  created_at: string;
  actualizado_por_nombre: string | null;
  updated_at: string;
}

export type CondicionEgresoIsbm =
  | "PENDIENTE" // ingreso activo
  | "MEJORADO"
  | "FALLECIDO"
  | "TRASLADO"
  | "ALTA_VOLUNTARIA";

export interface IngresoIsbm {
  id: string; // doc id de Firestore pacientes/{id} (el ingreso de la plataforma)
  expediente: string;
  paciente_nombre: string;
  fecha_ingreso: string; // "YYYY-MM-DD"
  fecha_egreso: string | null;
  condicion_egreso: CondicionEgresoIsbm;
  servicio_actual: string | null; // snapshot ESDOMED (texto libre)
  cama_actual: string | null;
  medico_tratante_nombre: string | null;
  creado_por_uid: string;
  creado_por_nombre: string;
  created_at: string;
  updated_at: string;
}

export interface CensoDiarioIsbm {
  id: number;
  ingreso_id: string;
  expediente: string;
  fecha: string; // "YYYY-MM-DD"
  servicio_fisico_id: number;
  servicio_facturacion_id: number;
  motivo_diferencia_servicio: string | null;
  cama: string | null;
  medico_tratante_nombre: string | null;
  visita_am_registrada: boolean;
  visita_am_medico: string | null;
  visita_am_hora: string | null; // "HH:MM:SS"
  visita_pm_registrada: boolean;
  visita_pm_medico: string | null;
  visita_pm_hora: string | null;
  dia_cerrado: boolean;
  cerrado_en: string | null;
  cerrado_por_uid: string | null;
  cerrado_por_nombre: string | null;
  total_servicio_dia: number | null; // snapshot fijado por el cierre
  total_cobrable_dia: number | null;
  registrado_por_uid: string;
  registrado_por_nombre: string;
  created_at: string;
  updated_at: string;
}

// Censo con los joins que usa la UI (sintaxis embed de Supabase).
export interface CensoDiarioConRelaciones extends CensoDiarioIsbm {
  ingreso: IngresoIsbm;
  servicio_fisico: ServicioHospitalarioIsbm;
  servicio_facturacion: ServicioHospitalarioIsbm;
}

// Semáforo del censo (misma semántica del proyecto ISBM original):
// VERDE    = cerrado con ambas visitas
// ROJO     = cerrado sin ambas visitas
// AMARILLO = abierto con visita AM registrada
// AZUL     = abierto sin visitas
export type EstadoCenso = "VERDE" | "AMARILLO" | "AZUL" | "ROJO";

export function estadoCenso(c: CensoDiarioIsbm): EstadoCenso {
  if (c.dia_cerrado) {
    return c.visita_am_registrada && c.visita_pm_registrada ? "VERDE" : "ROJO";
  }
  return c.visita_am_registrada && !c.visita_pm_registrada ? "AMARILLO" : "AZUL";
}

export type RubroArancelIsbm =
  | "DIA_CAMA"
  | "RX_BASICO"
  | "LABORATORIO_BASICO"
  | "LABORATORIO_ADICIONAL"
  | "LABORATORIO_BIOLOGIA_MOLECULAR"
  | "QUIRURGICO"
  | "MEDICAMENTOS_CUADRO"
  | "MEDICAMENTOS_ADICIONALES"
  | "OTROS"
  | "ESTUDIOS_NEUROFISIOLOGICOS"
  | "MISCELANEOS"
  | "BANCO_SANGRE";

export interface ArancelIsbm {
  id: number;
  codigo: string;
  rubro: RubroArancelIsbm;
  descripcion: string;
  precio_hnes: number;
  es_cuadro_basico: boolean;
  es_bolson: boolean;
  es_controlado: boolean;
  requiere_autorizacion: boolean;
  monto_umbral_supervisor: number | null;
  monto_umbral_gerente: number | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
}

export type MotivoNoFacturableIsbm =
  | "EXCEDE_TOPE_DIARIO_RUBRO"
  | "EXCEDE_TOPE_MENSUAL"
  | "SIN_AUTORIZACION"
  | "INTERCONSULTA_DENTRO_48H"
  | "EXCLUIDO_ART_25"
  | "INCLUIDO_EN_DIA_CAMA"
  | "DUPLICADO"
  | "SIN_DOCUMENTO_RESPALDO"
  | "ANULADO"
  | "DECISION_ISBM";

export interface CargoIsbm {
  id: number;
  censo_id: number;
  ingreso_id: string;
  expediente: string;
  fecha: string;
  arancel_id: number;
  cantidad: number;
  precio_unitario: number;
  costo_total: number;
  monto_facturable: number;
  motivo_no_facturable: MotivoNoFacturableIsbm | null;
  justificacion_no_facturable: string | null;
  tipo_documento_respaldo: string | null;
  documento_respaldo_ref: string | null;
  comentarios: string | null;
  tipo_cirugia: "AMBULATORIA" | "EMERGENCIA" | "ELECTIVA" | null;
  especialidad_interconsulta: string | null;
  pendiente_revision: boolean;
  anulado: boolean;
  capturado_por_uid: string;
  capturado_por_nombre: string;
  capturado_en: string;
  modificado_por_nombre: string | null;
  modificado_en: string | null;
}

export interface CargoConArancel extends CargoIsbm {
  arancel: ArancelIsbm;
}

export type EstadoAutorizacionIsbm = "PENDIENTE" | "APROBADA" | "RECHAZADA";

export interface AutorizacionIsbm {
  id: number;
  cargo_id: number;
  tipo: "LABORATORIO_RADIOLOGIA" | "PAQUETE_QUIRURGICO" | "MEDICAMENTO" | "INTERCONSULTA" | "OTRO";
  nivel_requerido: "SUPERVISOR" | "JEFE";
  monto_solicitado: number;
  estado: EstadoAutorizacionIsbm;
  solicitado_por_uid: string;
  solicitado_por_nombre: string;
  solicitado_en: string;
  resuelto_por_uid: string | null;
  resuelto_por_nombre: string | null;
  resuelto_por_rol: string | null;
  resuelto_en: string | null;
  comentario: string | null;
}

// ── Etiquetas para la UI ─────────────────────────────────────────────────────

export const RUBRO_LABEL: Record<RubroArancelIsbm, string> = {
  DIA_CAMA: "Día Cama",
  RX_BASICO: "RX / Imágenes",
  LABORATORIO_BASICO: "Laboratorio Básico",
  LABORATORIO_ADICIONAL: "Laboratorio Adicional",
  LABORATORIO_BIOLOGIA_MOLECULAR: "Biología Molecular",
  QUIRURGICO: "Paquete Quirúrgico",
  MEDICAMENTOS_CUADRO: "Medicamentos Cuadro Básico",
  MEDICAMENTOS_ADICIONALES: "Medicamentos Adicionales (Bolsón)",
  OTROS: "Otros / Interconsultas",
  ESTUDIOS_NEUROFISIOLOGICOS: "Neurofisiología",
  MISCELANEOS: "Misceláneos",
  BANCO_SANGRE: "Banco de Sangre",
};

export const TIPO_BENEFICIARIO_LABEL: Record<TipoBeneficiarioIsbm, string> = {
  COTIZANTE: "Cotizante",
  CONYUGUE: "Cónyuge",
  HIJO: "Hijo/a",
  PADRE_MADRE: "Padre / Madre",
};

export const formatoDolares = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// Cargo con los joins que usa la UI de listados (arancel + nombre del paciente).
export interface CargoListado extends CargoIsbm {
  arancel: ArancelIsbm;
  afiliacion?: { paciente_nombre: string } | null;
}

export interface AutorizacionConCargo extends AutorizacionIsbm {
  cargo: CargoListado;
}

// Renglón de la vista v_tabulador_ingresos (un ingreso con sus agregados).
export interface TabuladorRow {
  id: string;
  expediente: string;
  paciente_nombre: string;
  numero_afiliacion_isbm: string | null;
  fecha_ingreso: string;
  fecha_egreso: string | null;
  condicion_egreso: CondicionEgresoIsbm;
  servicio_actual: string | null;
  dias_estancia: number;
  dias_censados: number;
  dias_cerrados: number;
  total_servicio: number;
  total_cobrable: number;
}

export const MOTIVO_NO_FACTURABLE_LABEL: Record<MotivoNoFacturableIsbm, string> = {
  EXCEDE_TOPE_DIARIO_RUBRO: "Excede tope diario de exámenes",
  EXCEDE_TOPE_MENSUAL: "Excede tope mensual",
  SIN_AUTORIZACION: "Sin autorización",
  INTERCONSULTA_DENTRO_48H: "Interconsulta dentro de 48 h",
  EXCLUIDO_ART_25: "Excluido por Art. 25",
  INCLUIDO_EN_DIA_CAMA: "Incluido en día-cama",
  DUPLICADO: "Duplicado",
  SIN_DOCUMENTO_RESPALDO: "Sin documento de respaldo",
  ANULADO: "Anulado",
  DECISION_ISBM: "Decisión ISBM",
};

export const CONDICION_EGRESO_LABEL: Record<CondicionEgresoIsbm, string> = {
  PENDIENTE: "Activo",
  MEJORADO: "Mejorado / alta",
  FALLECIDO: "Fallecido",
  TRASLADO: "Traslado",
  ALTA_VOLUNTARIA: "Alta voluntaria",
};

// Rubros que consumen el tope diario de exámenes del servicio.
export const RUBROS_EXAMENES: RubroArancelIsbm[] = [
  "LABORATORIO_BASICO",
  "LABORATORIO_ADICIONAL",
  "LABORATORIO_BIOLOGIA_MOLECULAR",
  "RX_BASICO",
  "ESTUDIOS_NEUROFISIOLOGICOS",
  "BANCO_SANGRE",
];

// Rubros de interconsulta (aplica la regla de 48 h por especialidad).
export const RUBROS_INTERCONSULTA: RubroArancelIsbm[] = ["OTROS", "MISCELANEOS"];

export const ESPECIALIDADES_INTERCONSULTA = [
  "MEDICINA_INTERNA", "CIRUGIA", "GINECO_OBSTETRICIA", "PEDIATRIA",
  "PSIQUIATRIA", "NEONATOS", "MEDICINA_INTENSIVA", "NEUROLOGIA",
  "CARDIOLOGIA", "DERMATOLOGIA", "OFTALMOLOGIA", "ORTOPEDIA", "OTRA",
] as const;
