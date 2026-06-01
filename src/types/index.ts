export type UserRole = "medico" | "esdomed" | "trabajo_social" | "psicologia" | "admin" | "enfermeria";

export interface UserProfile {
  uid: string;
  email: string;
  nombre: string;
  role: UserRole;
  servicio?: string;    // solo médicos — campo legacy (un servicio)
  servicios?: string[]; // solo médicos — multi-servicio (campo nuevo)
  jvpm?: string;        // solo médicos — sello/firma
  createdAt: Date;
}

export type EstadoTraslado = "pendiente" | "en_revision" | "aprobado" | "rechazado";

export interface SolicitudTraslado {
  id?: string;
  medicoId: string;
  medicoNombre: string;
  medicoServicio: string;
  
  tipoTraslado?: "servicio_cama" | "interno" | "intercambio";
  
  pacienteNombre?: string;
  pacienteExpediente: string;
  
  pacienteBNombre?: string;
  pacienteBExpediente?: string;

  servicioOrigen: string;
  servicioDestino?: string;
  camaOrigen: string;
  camaDestino: string;
  motivoTraslado: string;
  estado: EstadoTraslado;
  creadoEn: Date;
  actualizadoEn: Date;
  revisadoPor?: string;       // uid del personal esdomed
  revisadoPorNombre?: string;
  notasEsdomed?: string;
}

export type EstadoFallecido = "pendiente" | "confirmado";

export interface NotificacionFallecido {
  id?: string;
  medicoId: string;
  medicoNombre: string;
  medicoJvpm?: string;
  medicoServicio: string;
  pacienteNombre: string;
  pacienteExpediente: string;
  servicio: string;
  cama: string;
  fechaDefuncion: Date;
  causaMuerte?: string;
  estado: EstadoFallecido;
  creadoEn: Date;
  confirmadoEn?: Date;
  confirmadoPor?: string;
  confirmadoPorNombre?: string;
  // Seguimiento de productividad ESDOMED
  digitaSimmow?: string;
  digitaSimmowEn?: Date;
  entregaCertificado?: string;
  entregaCertificadoEn?: Date;
  recibeDePs?: string;          // psicología / trabajo social
  recibeDePsEn?: Date;
  recibeDePsUid?: string;       // uid del usuario asignado (set by ESDOMED)
  recibeDePsConfirmado?: boolean;
  recibeDePsConfirmadoEn?: Date;
  tramitaDefuncion?: string;
  tramitaDefuncionEn?: Date;
  estadoEntregaCertificado?: "pendiente" | "entregado";
  tipoCertificado?: "digital" | "manual";
  actualizoFieh?: boolean | string;
  familiarNombre?: string;
  familiarDui?: string;
  familiarTelefono?: string;
  familiarParentesco?: string;
  // Cierre de trámite
  tramiteCerrado?: boolean;
  tramiteCerradoPor?: string;
  tramiteCerradoEn?: Date;
  tramiteDesbloqueado?: boolean;
  tramiteDesbloqueadoPor?: string;
  tramiteDesbloqueadoEn?: Date;
  tramiteJustificacion?: string;
}

export type EstadoImpresion = "pendiente" | "impreso";

export interface SolicitudImpresion {
  id?: string;
  medicoId: string;
  medicoNombre: string;
  medicoServicio: string;
  pacienteExpediente?: string;
  descripcion: string;
  copias: number;

  pdfUrl?: string; // Legacy
  pdfNombre?: string; // Legacy
  archivos?: { url: string; nombre: string }[];

  estado: EstadoImpresion;
  creadoEn: Date;
  impresoPor?: string;
  impresoPorNombre?: string;
  impresoEn?: Date;
}

// ============================================================================
// Anexo 5 — Comprobante para el paciente referido en el SIS
// ============================================================================

export type EstadoAnexo5 = "pendiente" | "emitido";

export interface SolicitudAnexo5 {
  id?: string;
  medicoId: string;
  medicoNombre: string;
  
  expediente?: string; // Solo referencia interna, no aparece en el impreso

  fecha: string; // formato YYYY-MM-DD
  nombrePaciente: string;
  referidoDe: string;
  establecimientoReferencia: string;
  fechaHoraCita?: string; // Opcional
  especialidad: string;
  medicoRefiere: string;
  establecimientoQueRefiere: string;
  telefonoEstablecimiento: string;

  estado: EstadoAnexo5;
  creadoEn: Date;

  emitidoPor?: string;
  emitidoPorNombre?: string;
  emitidoEn?: Date;
}

// ============================================================================
// Incapacidades — constancias de hospitalización / incapacidad
// ============================================================================

export type EstadoIncapacidad = "pendiente" | "emitida";
export type CondicionEgresoIncapacidad = "vivo" | "muerto";
export type InstitucionProvisional = "CRECER" | "CONFIA" | "INPEP" | "IPSFA" | "ISSS";
export type BancoDeposito = "Promerica" | "Atlantida";

export interface SolicitudIncapacidad {
  id?: string;

  // ── Datos del médico solicitante (snapshot al crear) ──
  medicoId: string;
  medicoNombre: string;
  medicoJvpm?: string;       // "Número de Junta" → viene del UserProfile.jvpm
  medicoServicio: string;

  // ── Paciente (referencia + snapshot al crear) ──
  pacienteId: string;        // doc id en /pacientes
  pacienteExpediente: string;
  pacienteNombre: string;

  // ── Datos del ingreso/cama (snapshot del paciente al crear) ──
  servicioPaciente: string;
  camaPaciente?: string;

  // ── Campos que llena el médico ──
  fechaAlta: Date;
  diasIncapacidad: number;
  fechaDesde: Date;          // primer día de incapacidad (default = fechaAlta)
  fechaHasta: Date;          // se calcula: fechaDesde + (diasIncapacidad - 1) días
  diagnosticoEgreso: string;
  tratamientoAlta: string;
  condicionEgreso: CondicionEgresoIncapacidad;
  recomendaciones?: string;
  seguimiento?: string;

  // ── Opcionales (raros) ──
  correoElectronico?: string;
  nombrePatrono?: string;
  pasaporte?: string;
  partidaNacimiento?: string;
  otroDocumento?: string;

  // ── Estado y emisión ──
  estado: EstadoIncapacidad;
  creadoEn: Date;

  // ── Llenado por ESDOMED al emitir ──
  institucionProvisional?: InstitucionProvisional;
  bancoDeposito?: BancoDeposito;
  emitidaPor?: string;        // uid ESDOMED
  emitidaPorNombre?: string;
  emitidaEn?: Date;
  fechaExpedicion?: Date;     // = emitidaEn pero como fecha solo (para el PDF)
}

// ============================================================================
// Altas Vivos — notificaciones de egreso de pacientes vivos
// ============================================================================

export type TipoAltaVivo = "domicilio" | "exigida" | "referido" | "fuga" | "in_extremis";
export type EstadoNotificacionAlta = "pendiente" | "deposito" | "suspendida" | "procesada";

export interface NotificacionAltaVivo {
  id?: string;

  notificadoPorId: string;
  notificadoPorNombre: string;
  notificadoPorRol: string;

  pacienteId: string;
  pacienteExpediente: string;
  pacienteNombre: string;
  servicio: string;
  cama: string;

  tipoAlta: TipoAltaVivo;
  notas?: string;

  estado: EstadoNotificacionAlta;
  creadoEn: Date;

  // Modificado por TS
  modificadoPorId?: string;
  modificadoPorNombre?: string;
  modificadoEn?: Date;

  // Procesado por ESDOMED
  procesadoPorId?: string;
  procesadoPorNombre?: string;
  procesadoEn?: Date;
}

// ============================================================================
// Pacientes — gestión de pacientes hospitalizados
// ============================================================================

export type EstadoPaciente =
  | "activo"            // hospitalizado actualmente
  | "alta_vivo"         // egreso vivo a domicilio o referido
  | "alta_fallecido"    // egreso por defunción
  | "alta_voluntaria"
  | "fuga"
  | "in_extremis"       // egreso a domicilio a solicitud familiar/paciente
  | "referido";         // referido a otro hospital

export type CircunstanciaIngreso = "demanda_espontanea" | "emergencia" | "referido";
export type Genero = "masculino" | "femenino" | "otro";
export type AreaGeografica = "urbana" | "rural";

export interface DiagnosticoCIE {
  codigo: string;       // ej. "N18.5"
  descripcion: string;  // ej. "Enfermedad renal cronica etapa 5"
}

export interface ResponsablePaciente {
  nombre: string;
  parentesco?: string;
  documento?: string;
  telefono?: string;
  direccion?: string;
}

export interface MovimientoPaciente {
  fecha: Date;
  servicioOrigen: string;
  servicioDestino: string;
  camaOrigen?: string;
  camaDestino?: string;
  medicoMovimiento?: string;
  trasladoId?: string;  // ref a SolicitudTraslado si vino del módulo de traslados
  registradoPorNombre?: string;
}

// Datos personales del paciente — fuente de verdad en personas/{expediente}.
// El expediente es la llave estable de persona (único por paciente, nunca cambia).
// Estos mismos campos se replican como snapshot dentro de cada ingreso (Paciente)
// para que listados y búsquedas funcionen sin joins; la propagación de cambios se
// hace desde guardarPersona() en src/lib/pacientes/persona.ts.
export interface Persona {
  id?: string;              // == expediente (id del documento en personas)

  // Identidad
  expediente: string;       // llave estable de persona (único por paciente, nunca cambia)
  apellidos: string;
  nombres: string;
  fechaNacimiento?: Date;
  genero: Genero;
  estadoFamiliar?: string;
  dui?: string;
  numeroAfiliacion?: string;
  ocupacion?: string;
  nacionalidad?: string;

  // Domicilio
  direccion?: string;
  municipio?: string;
  departamento?: string;
  canton?: string;
  area?: AreaGeografica;
  telefono?: string;
  otrosNumeros?: string;

  // Responsable
  responsable?: ResponsablePaciente;

  // Metadata
  creadoEn?: Date;
  actualizadoEn?: Date;
  actualizadoPor?: string;
}

// Documento de un INGRESO (colección pacientes/{id}). Contiene un snapshot de los
// datos personales (ver Persona) + los datos clínicos/del ingreso y movimientos,
// que sí pertenecen a este ingreso concreto.
export interface Paciente {
  id?: string;

  // Identidad — snapshot de personas/{expediente}
  expediente: string;       // llave estable de persona (único por paciente, nunca cambia)
  apellidos: string;
  nombres: string;
  fechaNacimiento?: Date;
  genero: Genero;
  estadoFamiliar?: string;
  dui?: string;
  numeroAfiliacion?: string;
  ocupacion?: string;
  nacionalidad?: string;

  // Domicilio
  direccion?: string;
  municipio?: string;
  departamento?: string;
  canton?: string;
  area?: AreaGeografica;
  telefono?: string;
  otrosNumeros?: string;

  // Responsable
  responsable?: ResponsablePaciente;

  // Ingreso
  establecimientoProcedencia?: string;
  circunstanciaIngreso?: CircunstanciaIngreso;
  fechaIngreso: Date;
  servicioIngreso: string;
  medicoIngresoNombre?: string;
  diagnosticoIngreso?: DiagnosticoCIE;

  // Ubicación actual
  servicioActual: string;
  camaActual?: string;

  // Movimientos (ruta de traslados)
  movimientos?: MovimientoPaciente[];

  // Estado vital / egreso
  estado: EstadoPaciente;
  fechaEgreso?: Date;
  diasEstancia?: number;
  diagnosticoEgreso?: DiagnosticoCIE;
  diagnosticosComplementarios?: DiagnosticoCIE[];
  causaExterna?: DiagnosticoCIE;
  procedimientos?: string[];
  medicoEgresoNombre?: string;
  medicoEgresoJvpm?: string;

  // COVID (legado del CSV)
  fechaPruebaCovid?: Date;
  estadoVacunaCovid?: string;

  // Certificado de defunción — Parte I (cadena causal)
  causaMuerteA?: DiagnosticoCIE;  // Causa directa / inmediata
  causaMuerteB?: DiagnosticoCIE;  // Causa intermedia
  causaMuerteC?: DiagnosticoCIE;  // Causa antecedente
  causaMuerteD?: DiagnosticoCIE;  // Causa básica (subyacente)

  // Certificado de defunción — Parte II (otros estados patológicos)
  estadoPatologicoI?: DiagnosticoCIE;
  estadoPatologicoII?: DiagnosticoCIE;

  // Cierre vital — enlace con módulo Fallecidos si aplica
  fallecidoId?: string;

  // Metadata
  creadoEn: Date;
  creadoPor: string;        // uid ESDOMED
  creadoPorNombre: string;
  actualizadoEn?: Date;
  actualizadoPor?: string;
}

// ============================================================================
// Busqueda de telefono — auditoria de consultas hechas por medicos
// ============================================================================

export interface BusquedaTelefono {
  id?: string;

  usuarioUid: string;
  usuarioNombre: string;
  usuarioEmail?: string;
  usuarioRole: "medico" | "admin";
  usuarioJvpm?: string;

  expedienteBuscado: string;
  expedienteNormalizado: string;

  encontrado: boolean;
  pacienteId?: string;
  pacienteExpediente?: string;
  pacienteNombre?: string;
  pacienteEstado?: EstadoPaciente;
  pacienteServicio?: string;
  pacienteCama?: string;

  creadoEn: Date;
}
