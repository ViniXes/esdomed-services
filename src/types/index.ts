export type UserRole = "medico" | "esdomed" | "asistente_esdomed" | "trabajo_social" | "psicologia" | "admin" | "enfermeria" | "rrhh" | "transporte" | "motorista" | "isbm_tecnico" | "isbm_supervisor" | "isbm_jefe";

// Roles del módulo Convenio ISBM (los datos del módulo viven en Supabase;
// ver src/lib/isbm/). El jefe tiene todos los permisos del módulo.
export const ISBM_ROLES: UserRole[] = ["isbm_tecnico", "isbm_supervisor", "isbm_jefe"];
export const esRolIsbm = (role?: UserRole) => !!role && ISBM_ROLES.includes(role);
export type TipoMedicoCuidadosCriticos = "uci" | "ucin" | "uci_ucin";

export interface UserProfile {
  uid: string;
  email: string;
  username?: string;    // alias corto para iniciar sesión (único, en minúsculas)
  nombre: string;
  role: UserRole;
  servicio?: string;    // solo médicos — campo legacy (un servicio)
  servicios?: string[]; // solo médicos — multi-servicio (campo nuevo)
  tipoMedico?: TipoMedicoCuidadosCriticos; // médicos de cuidados críticos
  jvpm?: string;        // solo médicos — sello/firma
  dui?: string;         // solo médicos — documento único de identidad (########-#)
  codigoMarcacion?: string; // solo personal ESDOMED — llave para vincular su fila en el plan de horarios (ej. "C-043")
  puesto?: string;          // solo personal ESDOMED — cargo que aparece en el plan (ej. "TECNICO EN ...")
  generico?: boolean;       // cuenta compartida (ej. enfermería por servicio): pide el nombre real de quien actúa
  // Aceptación de los términos y condiciones de uso. Si la versión no coincide con
  // la vigente (TERMINOS_VERSION), se vuelve a pedir la aceptación al ingresar.
  terminosAceptados?: { version: string; fecha: Date };
  createdAt: Date;
}

// ============================================================================
// Autoregistro de médicos — solicitud pendiente de aprobación del admin
// ============================================================================
// Un médico se registra solo desde /registro-medico. Mientras no lo apruebe el
// admin, NO existe su documento en `usuarios` (sin rol = sin acceso) y su usuario
// de Firebase Auth queda deshabilitado. Los datos de la solicitud viven aquí
// (docId = uid del Auth user deshabilitado) hasta que se aprueba o se rechaza.
export interface RegistroMedicoPendiente {
  uid: string;          // = uid del usuario de Auth (deshabilitado) y docId
  nombre: string;       // NOMBRE COMPLETO EN MAYÚSCULAS
  dui: string;          // ########-#
  jvpm: string;         // número de junta — también se usa como username de login
  username: string;     // = jvpm normalizado (login)
  email: string;        // correo sintético {username}@medico.esdomed.local
  tipoMedico?: TipoMedicoCuidadosCriticos; // UCI/UCIN/ambos; ausente = médico general
  servicios: string[];  // servicios asignados
  creadoEn: Date;
}

// Resolución de una solicitud de autoregistro (aprobada o rechazada). Se guarda
// en `registros_medicos_historial` con id autogenerado para poder consultar el
// histórico de aceptaciones y rechazos.
export interface RegistroMedicoResuelto {
  id?: string;
  uid: string;          // uid original de la solicitud
  nombre: string;
  dui: string;
  jvpm: string;
  username: string;
  email: string;
  tipoMedico?: TipoMedicoCuidadosCriticos;
  servicios: string[];
  estado: "aprobado" | "rechazado";
  motivo?: string;      // solo en rechazos
  solicitadoEn?: Date;  // cuándo se registró el médico
  resueltoEn: Date;     // cuándo se resolvió
  resueltoPorId: string;
  resueltoPorNombre: string;
}

export type TipoAtencionCuidadosCriticos =
  | "evaluacion_ingreso"
  | "seguimiento_clinico"
  | "procedimiento"
  | "dispositivo"
  | "ventilacion"
  | "infeccion_cultivo"
  | "medicamento"
  | "estudio"
  | "evento_adverso"
  | "egreso";

export interface AtencionCuidadosCriticos {
  id?: string;
  tipoUnidad: TipoMedicoCuidadosCriticos;
  tipoAtencion: TipoAtencionCuidadosCriticos;
  pacienteId: string;
  pacienteExpediente: string;
  pacienteNombre: string;
  servicio: string;
  cama?: string;
  fechaAtencion: Date;
  resumen: string;
  detalle?: string;
  medicoId: string;
  medicoNombre: string;
  medicoJvpm?: string;
  creadoEn: Date;
}

export interface FichaCuidadosCriticos {
  id?: string;
  tipoUnidad: TipoMedicoCuidadosCriticos;
  estadoEstancia?: "activa" | "egresada";
  pacienteId: string;
  pacienteExpediente: string;
  pacienteNombre: string;
  servicio: string;
  cama?: string;
  datos: Record<string, string | number>;
  creadoPorId: string;
  creadoPorNombre: string;
  creadoEn: Date;
  actualizadoPorId: string;
  actualizadoPorNombre: string;
  actualizadoEn: Date;
}

export interface ConfigIndicadoresCuidadosCriticos {
  id?: string;
  servicio: string;
  anio: number;
  mes: number;
  camasAsignadas: number;
  diasHabiles: number;
  actualizadoPorId?: string;
  actualizadoPorNombre?: string;
  actualizadoEn?: Date;
}

export type EstadoTraslado = "pendiente" | "en_revision" | "aprobado" | "rechazado";

export interface SolicitudTraslado {
  id?: string;
  medicoId: string;
  medicoNombre: string;
  medicoServicio: string;
  medicoJvpm?: string;        // sello/firma del médico solicitante

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
  respuestaMedico?: string;   // respuesta del médico a una observación (estado en_revision)
}

// ============================================================================
// Traslado a otro hospital — referencia externa (no es movimiento de cama interno)
// ============================================================================
// El médico solo elige el establecimiento destino + comentario opcional; ESDOMED
// recibe la notificación y confirma de recibido. Colección: traslados_externos.

export type EstadoTrasladoExterno = "pendiente" | "confirmado";

export interface TrasladoExterno {
  id?: string;
  medicoId: string;
  medicoNombre: string;
  medicoServicio: string;
  medicoJvpm?: string;

  pacienteId?: string;            // doc id en /pacientes (si venía de un ingreso activo)
  pacienteNombre?: string;
  pacienteExpediente: string;
  servicioOrigen?: string;        // snapshot del ingreso al crear
  camaOrigen?: string;

  establecimientoDestino: string; // hospital al que se envía
  comentario?: string;            // opcional

  estado: EstadoTrasladoExterno;
  creadoEn: Date;
  actualizadoEn?: Date;

  revisadoPor?: string;           // uid del personal esdomed que confirmó
  revisadoPorNombre?: string;
  notasEsdomed?: string;          // observación opcional al confirmar
}

export type EstadoFallecido = "pendiente" | "confirmado";

export interface NotificacionFallecido {
  id?: string;
  medicoId: string;
  medicoNombre: string;
  medicoJvpm?: string;
  medicoServicio: string;
  pacienteId?: string;          // doc id en /pacientes (solo si venía de un ingreso activo)
  // Origen del fallecido: "activo" = paciente hospitalizado; "emergencia" = falleció
  // en emergencia sin haber ingresado a un servicio (se toma de atenciones_emergencia).
  origen?: "activo" | "emergencia";
  atencionEmergenciaId?: string; // ref a la atención de emergencia (si origen=emergencia)
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
  // ESDOMED marca al confirmar si hay foto de DUI validada (vigente o vencido <1 año).
  duiValidado?: boolean;
  // Seguimiento de productividad ESDOMED
  digitaSimmow?: string;
  digitaSimmowEn?: Date;
  entregaCertificado?: string;
  entregaCertificadoEn?: Date;

  // ── Confirmación de LECTURA por Psicología / Trabajo Social ──
  // La registra el propio personal de esas áreas (FallecidosRevisionView).
  // El área (lecturaPorRol) sale del rol REAL del usuario que confirma, no de la
  // ruta, para que el badge nunca quede desfasado del nombre.
  lecturaPor?: string;          // nombre de quien confirmó haber leído
  lecturaPorUid?: string;
  lecturaPorRol?: UserRole;     // rol real del que confirmó (se muestra ts/psicología)
  lecturaEn?: Date;

  // ── Asignación / entrega del certificado por ESDOMED (NO es la lectura) ──
  // recibeDePs* son escritos por ESDOMED al asignar a quién de Psic./T.S. se le
  // entrega el certificado. Históricamente compartían sentido con la lectura;
  // ya están separados (recibeDePsRol es legacy: solo lo escribía el flujo viejo
  // de lectura, por eso sirve de respaldo para datos antiguos).
  recibeDePs?: string;          // nombre del receptor asignado por ESDOMED
  recibeDePsEn?: Date;
  recibeDePsRol?: "psicologia" | "trabajo_social";   // LEGACY: área de la lectura vieja
  recibeDePsUid?: string;       // uid del usuario asignado (set by ESDOMED)
  recibeDePsEntregadoPor?: string;   // nombre del ESDOMED que hizo la entrega
  recibeDePsEntregadoPorUid?: string;
  recibeDePsConfirmado?: boolean;
  recibeDePsConfirmadoEn?: Date;
  tramitaDefuncion?: string;
  tramitaDefuncionEn?: Date;
  estadoEntregaCertificado?: "pendiente" | "entregado";
  // Fallecido privado de libertad: el certificado queda en custodia interna de
  // ESDOMED (no se entrega a nadie salvo requerimiento de la Fiscalía). Suprime
  // la alerta de certificado vencido y el conteo de pendientes.
  privadoDeLibertad?: boolean;
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
  medicoJvpm?: string;
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
  entregadoA?: string; // Quién retiró la impresión (texto libre; puede no tener usuario, ej. internos)
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

  fecha?: string; // formato YYYY-MM-DD — opcional, a veces se llena a mano en el impreso
  nombrePaciente: string;
  referidoDe: string;
  establecimientoReferencia: string;
  fechaHoraCita?: string; // Opcional
  especialidad: string;
  medicoRefiere?: string; // Opcional — libre, no se ata al usuario logueado
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

// Datos personales para la constancia que se completan AL IMPRIMIR subiendo la
// Hoja de Identificación. NO se guardan en `personas` (el padrón queda intacto);
// viven solo en la incapacidad para que el documento salga completo.
export interface DatosConstancia {
  apellidos?: string;
  nombres?: string;
  genero?: Genero;
  dui?: string;
  numeroAfiliacion?: string;
  telefono?: string;
  otrosNumeros?: string;
  direccion?: string;
  municipio?: string;
  departamento?: string;
  ocupacion?: string;
  responsable?: ResponsablePaciente;
}

export interface SolicitudIncapacidad {
  id?: string;

  // ── Datos del médico solicitante (snapshot al crear) ──
  medicoId: string;
  medicoNombre: string;
  medicoJvpm?: string;       // "Número de Junta" → viene del UserProfile.jvpm
  medicoServicio: string;

  // ── Paciente (referencia + snapshot al crear) ──
  pacienteId?: string;       // doc id en /pacientes (ausente si origen = emergencia)
  pacienteExpediente: string;
  pacienteNombre: string;
  pacienteDui?: string;      // snapshot (emergencia trae DUI en la atención)
  pacienteGenero?: Genero;   // snapshot (para el recuadro de sexo de la constancia)

  // ── Origen: hospitalización (ingreso en /pacientes) o emergencia (atención) ──
  origen?: "hospitalizacion" | "emergencia";
  atencionEmergenciaId?: string;
  // Datos personales completados al imprimir (Hoja de Identificación, ver arriba).
  datosConstancia?: DatosConstancia;

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

export type TipoAltaVivo = "domicilio" | "exigida" | "referido" | "fuga" | "in_extremis" | "deposito" | "suspendida";
export type EstadoNotificacionAlta = "pendiente" | "observada" | "deposito" | "suspendida" | "procesada" | "recibida" | "duplicada" | "revertida" | "rechazada";
export type MotivoObservacionAlta =
  | "cama_expediente"
  | "expediente_duplicado"
  | "no_subido_sis"
  | "otro";

export interface NotificacionAltaVivo {
  id?: string;

  notificadoPorId: string;
  notificadoPorNombre: string;
  notificadoPorRol: string;
  notificadoPorPersona?: string;  // nombre real escrito a mano cuando la cuenta es genérica (compartida)

  pacienteId: string;
  pacienteExpediente: string;
  pacienteNombre: string;
  servicio: string;
  cama: string;

  tipoAlta: TipoAltaVivo;
  notas?: string;

  estado: EstadoNotificacionAlta;
  creadoEn: Date;

  // Observacion de ESDOMED para correccion por Enfermeria/TS
  observacionEsdomedMotivo?: MotivoObservacionAlta;
  observacionEsdomedDetalle?: string | null;
  observadoPorId?: string;
  observadoPorNombre?: string;
  observadoEn?: Date;
  observacionAtendidaPorId?: string;
  observacionAtendidaPorNombre?: string;
  observacionAtendidaEn?: Date;

  // Modificado por TS
  modificadoPorId?: string;
  modificadoPorNombre?: string;
  modificadoPorRol?: UserRole | string;
  modificadoEn?: Date;

  // Rectificacion por Enfermeria antes del alta efectiva
  rectificacionUsada?: boolean;
  rectificadoPorId?: string;
  rectificadoPorNombre?: string;
  rectificadoEn?: Date;
  rectificacionAnterior?: {
    pacienteId: string;
    pacienteExpediente: string;
    pacienteNombre: string;
    servicio: string;
    cama: string;
    tipoAlta: TipoAltaVivo;
    notas?: string | null;
  };

  // Procesado por ESDOMED
  procesadoPorId?: string;
  procesadoPorNombre?: string;
  procesadoEn?: Date;

  // Digitación del egreso en SIMMOW (solo altas efectivas, estado "procesada").
  // Default al procesar: quien marca el alta efectiva; se puede indicar otra
  // persona en el modal o corregirse después (action "asignar_simmow" de la API).
  // Mismos nombres que en NotificacionFallecido para que productividad cuente igual.
  digitaSimmow?: string;
  digitaSimmowEn?: Date;

  // Reversión de un alta efectiva por ESDOMED (el paciente no se fue tras todo)
  revertidoPorId?: string;
  revertidoPorNombre?: string;
  revertidoEn?: Date;
  revertidoNota?: string | null;

  // Rechazo de la notificación por ESDOMED (cierre terminal: la notificación no
  // procede — nunca hubo alta que procesar). La nota del porqué es obligatoria.
  rechazadoPorId?: string;
  rechazadoPorNombre?: string;
  rechazadoEn?: Date;
  rechazoNota?: string;

  // Cierre administrativo por duplicidad
  duplicadoPorId?: string;
  duplicadoPorNombre?: string;
  duplicadoEn?: Date;
}

// ── Notificación de Altas (pre-alta) — log interno de Trabajo Social ──────────
// Registro diario de pacientes activos cuyo familiar fue notificado de que se
// irán de alta. Control interno de TS; no involucra a otros roles.

// Estado de la NOTIFICACIÓN (fase 1): ¿se logró avisar a la familia?
export type EstadoPrealta =
  | "notificado"
  | "pendiente"
  | "no_responde";  // N/R

// Resultado de la CONFIRMACIÓN (fase 2, el día del alta): ¿qué pasó realmente?
// Es una fase distinta de la notificación; se registra en el módulo Confirmación de Alta.
export type ResultadoConfirmacion =
  | "por_confirmar"
  | "confirmada"
  | "suspendida"   // se descompensó / el médico decide que no está apto; sin nueva fecha
  | "deposito";    // de alta pero sin quién lo retire; se reprograma a otra fecha

export interface NotificacionPrealta {
  id?: string;
  fecha: string;                  // YYYY-MM-DD (día del reporte)

  // Paciente (snapshot del paciente activo)
  pacienteId: string;
  pacienteExpediente: string;
  pacienteNombre: string;         // "apellidos, nombres"
  genero: Genero;
  servicio: string;
  cama?: string;
  edad?: number;                  // calculada de fechaNacimiento o capturada
  observacionesPaciente?: string; // notas tipo "8° reingreso", "cuenta con teléfono"

  // Familiar notificado
  familiarNombre?: string;
  observacionesFamiliar?: string; // autorizaciones, contactos de emergencia, etc.

  estado: EstadoPrealta;
  horaNotificacion?: Date;        // hora a la que se notificó (default: creadoEn)

  // Confirmación (fase 2 — el día del alta). undefined ⇒ aún "por_confirmar".
  confirmacion?: ResultadoConfirmacion;
  motivoConfirmacion?: string;
  reprogramadaA?: string;         // YYYY-MM-DD — nueva fecha cuando el resultado es "deposito"
  reprogramadaDe?: string;        // id de la prealta origen (en la copia reprogramada)
  confirmadoEn?: Date;
  confirmadoPorId?: string;
  confirmadoPorNombre?: string;

  creadoEn: Date;
  creadoPorId: string;
  creadoPorNombre: string;
  actualizadoEn?: Date;
  actualizadoPorId?: string;
  actualizadoPorNombre?: string;
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
  // Último diagnóstico conocido del reporte (se actualiza en cada importación;
  // puede diferir del de ingreso a medida que avanza la estancia).
  ultimoDiagnostico?: DiagnosticoCIE;

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

  // Egreso provisional: ESDOMED procesó la notificación de alta y el paciente
  // salió de activos, pero aún faltan los datos completos del egreso por capturar.
  egresoPendiente?: boolean;
  egresadoAutoEn?: Date;
  notificacionAltaId?: string;

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
// Atendidos en Emergencia — pacientes que pasaron por emergencia
// ============================================================================
// Módulo APARTE de pacientes/activos. Cada documento es una atención (visita) en
// emergencia, importada del reporte del SIS "Pacientes Atendidos En Emergencia".
// Se importa TODO el reporte (haya o no ingresado a hospitalización) para tener la
// trazabilidad de quien pasó por emergencia y además ingresó como activo. La ruta
// consulta por defecto a los que NO ingresaron.
//
// La identidad se comparte con el padrón por `expediente` (misma persona estable),
// pero este módulo SOLO LEE personas/pacientes para enriquecer/enlazar — nunca los
// escribe (el reporte trae muy pocos datos personales y ensuciaría el padrón).

// ¿Ingresó a hospitalización? — columna del reporte. "sin_dato" = celda vacía.
export type IngresoHospitalizacion = "si" | "no" | "sin_dato";

export interface AtencionEmergencia {
  id?: string;                  // == dedup determinista: `${expediente}__${YYYYMMDDHHmmss}`

  // ── Identidad (snapshot del reporte; referencia a personas por expediente) ──
  expediente: string;           // llave estable de persona (la misma del padrón)
  pacienteNombre: string;       // nombre completo tal como viene del reporte
  dui?: string;
  genero: Genero;
  edadTexto?: string;           // "30 años 11 meses 2 días" — texto crudo del reporte
  edadAnios?: number;           // años extraídos del texto (si se pudo)

  // ── Atención ──
  fechaHoraIngreso: Date;                  // llave temporal de la visita
  ingresoHospitalizacion: IngresoHospitalizacion; // ← filtro principal de la ruta
  tipoEgreso?: string;          // "Vivo" | "" | ...
  diagnostico?: string;         // texto libre (el reporte no trae CIE)
  categorizacion?: string;      // triage: "3 - Verde", "2 - Amarillo", ...
  llegaReferido: boolean;
  veteranoGuerra: boolean;
  medicoTriage?: string;
  especialidadTriage?: string;
  medicoAtiende?: string;
  especialidadAtiende?: string;
  fechaHoraEntradaTriage?: Date;  // "Fecha hora entrada triage"
  fechaHoraAltaIngreso?: Date;  // "Fecha hora alta o ingreso"
  // Tiempos del proceso de emergencia (texto crudo del reporte, ej. "00:03:03 hrs")
  tiempoLlegadaEstablecimiento?: string;
  tiempoDuracionTriage?: string;
  tiempoEsperaConsulta?: string;
  tiempoConsulta?: string;
  tiempoEvaluacion?: string;
  tiempoTotalEmergencia?: string; // "01:26:15"
  establecimientoProcedencia?: string;
  distanciaEntreEstablecimientos?: string;

  // ── Metadata de importación ──
  importadoEn: Date;
  importadoPorId: string;
  importadoPorNombre: string;
  archivoOrigen?: string;
}

// ============================================================================
// Hospital Día — pacientes crónicos que solo vienen a procedimientos
// ============================================================================
// Pacientes crónicos (hemodiálisis, quimioterapia, etc.) a los que SOLO se les
// crea el expediente: no ingresan a hospitalización ni ocupan cama. Se registran
// desde la Hoja de Identificación (reusa el parser/formulario de pacientes).
//
// Modelo: este registro (docId = expediente, uno por persona) es el marcador de
// "Hospital Día" + la lista del módulo. Al guardar también se crea/actualiza
// personas/{expediente} (el expediente canónico, vía guardarPersona). No escribe
// en `pacientes` (no hay ingreso). El snapshot de identidad permite listar sin joins.

export interface RegistroHospitalDia {
  id?: string;              // == expediente (id del documento)

  // ── Identidad (snapshot; la fuente de verdad es personas/{expediente}) ──
  expediente: string;
  apellidos: string;
  nombres: string;
  dui?: string;
  genero: Genero;
  fechaNacimiento?: Date;
  telefono?: string;

  // ── Trazabilidad ──
  creadoEn: Date;
  creadoPorId: string;
  creadoPorNombre: string;
  actualizadoEn?: Date;
  actualizadoPorId?: string;
  actualizadoPorNombre?: string;
}

// ============================================================================
// Gestiones de Trabajo Social (UTS) — registro transversal de intervenciones
// Reemplaza el Google Form "INTERVENCIONES PRESENCIALES". Un documento por
// intervención, ligado al paciente por expediente. De aquí salen como vistas las
// hojas diarias, la productividad (trabajadora × día) y la bitácora del paciente.
// El catálogo de `tipo` y `estadoPaciente` vive en src/lib/trabajosocial/catalogos.ts.
// ============================================================================

export interface GestionTS {
  id?: string;

  // Paciente — snapshot por expediente. El expediente puede NO existir en el
  // padrón (personas) cuando es un paciente ISBM / de rastreo / ya egresado;
  // por eso el nombre se guarda como texto y `vinculadoPadron` marca si calzó.
  expediente: string;
  pacienteNombre: string;
  servicio?: string;           // último servicio conocido del paciente
  estadoPaciente: import("@/lib/trabajosocial/catalogos").EstadoPacienteGestion;
  vinculadoPadron: boolean;    // true si el expediente existía en personas al registrar

  // Intervención
  tipo: string;                // id del catálogo TIPOS_GESTION_TS
  resultadoVisita?: import("@/lib/trabajosocial/catalogos").ResultadoVisita; // solo para tipos del grupo "Visitas"
  modalidad: import("@/lib/trabajosocial/catalogos").ModalidadGestion; // presencial | llamada | videollamada
  duracionMin?: number;        // duración de la intervención en minutos (opcional)
  notas?: string;
  fecha: string;               // "YYYY-MM-DD" — día de la gestión (llave de las hojas diarias)

  // Autoría (la trabajadora que la realizó = quien la registra)
  trabajadoraId: string;
  trabajadoraNombre: string;   // p. ej. "Licda. Villatoro"

  // Metadata
  creadoEn: Date;
}

// ============================================================================
// Rastreo de pacientes (Trabajo Social) — paso 0 del flujo
// ============================================================================
// Un documento por expediente (docId = expediente). Se deriva de los pacientes
// activos creados por ESDOMED. Regla: sin `estado === "contactado"` el paciente
// NO puede pasar a seguimiento/visita.

// Un intento de contacto anotado en la bitácora del rastreo ("se llamó tal
// día y pasó esto"). Se agregan con arrayUnion — el historial nunca se pisa.
export interface IntentoContactoTS {
  fecha: string;               // "YYYY-MM-DD" del intento
  nota: string;                // qué pasó ("no contesta", "número equivocado"…)
  trabajadoraId: string;
  trabajadoraNombre: string;
  creadoEn: Date;              // Timestamp de cuándo se anotó
}

export interface RastreoTS {
  id?: string;                 // = expediente

  // Identidad — snapshot del paciente activo
  expediente: string;
  pacienteId?: string;         // id del ingreso en `pacientes`
  pacienteNombre: string;
  genero?: string;
  servicio?: string;
  cama?: string;
  vinculadoPadron: boolean;    // true si el expediente existe en el padrón

  // Datos de contacto que se rastrean (prellenados desde el paciente, editables)
  familiarNombre?: string;
  parentesco?: string;
  telefono?: string;
  direccionActual?: string;
  duiPaciente?: "menor" | "no_dui" | null; // motivo si el paciente no tiene DUI

  // Proceso
  estado: import("@/lib/trabajosocial/catalogos").EstadoRastreo;
  canalesIntentados?: import("@/lib/trabajosocial/catalogos").CanalRastreo[];
  intentos?: number;           // nº de intentos de contacto
  intentosContacto?: IntentoContactoTS[]; // bitácora por fecha de los intentos
  fechaContacto?: string;      // "YYYY-MM-DD" del contacto efectivo
  horaContacto?: string;
  duracionMin?: number;
  notas?: string;

  // Autoría (último que registró/actualizó el rastreo)
  trabajadoraId: string;
  trabajadoraNombre: string;
  creadoEn: Date;
  actualizadoEn?: Date;
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

// ============================================================================
// Consulta de Ficha de Paciente — auditoría del módulo "Buscar Paciente"
// Queda constancia de quién abrió la ficha rápida de un paciente (médicos,
// trabajo social y psicología), con qué criterio buscó y a quién consultó.
// ============================================================================

export type CriterioConsultaPaciente = "expediente" | "dui" | "nombre";

export interface ConsultaPaciente {
  id?: string;

  usuarioUid: string;
  usuarioNombre: string;
  usuarioEmail?: string;
  usuarioRole: UserRole;
  usuarioJvpm?: string;

  criterio: CriterioConsultaPaciente;
  termino: string;             // texto que se buscó (tal cual lo escribió el usuario)

  expedienteConsultado: string;
  pacienteNombre: string;
  tieneIngresoActivo: boolean;
  servicioActual?: string;
  camaActual?: string;
  totalEstancias: number;      // cuántos ingresos tiene registrados la persona

  creadoEn: Date;
}

// ============================================================================
// Visitas de familiares — gestión por Trabajo Social
// ============================================================================
// Modelo centrado en la TARJETA de visita: cada paciente internado tiene una
// tarjeta (un titular) que puede prestarse a otros familiares. La lista blanca
// es el roster de personas autorizadas/recordadas y SOLO acelera el registro
// (no bloquea). Las visitas del día se arman como una lista diaria por TS.

export interface VisitanteInfo {
  nombre: string;
  parentesco: string;
  dui?: string;
  telefono?: string;
}

export type EstadoTarjetaVisita = "activa" | "anulada";

export interface TarjetaVisita {
  id?: string;
  codigo: string;                 // identificador único de la tarjeta
  pacienteId: string;
  expediente: string;             // llave del paciente; también localiza la tarjeta
  pacienteNombre: string;
  servicio: string;
  cama?: string;

  titular: VisitanteInfo;         // responsable principal que recibe la tarjeta
  listaBlanca: VisitanteInfo[];   // autorizados/recordados (incluye al titular)

  estado: EstadoTarjetaVisita;
  anuladaPorAltaId?: string;      // id de la notificación de alta que la anuló (permite restaurarla si se revierte)
  creadoEn: Date;
  creadoPor: string;              // uid TS
  creadoPorNombre: string;
  actualizadoEn?: Date;
}

export type EstadoVisita = "programada" | "en_curso" | "finalizada" | "cancelada";

export interface Visita {
  id?: string;
  fecha: string;                  // YYYY-MM-DD (día de la visita)

  tarjetaId: string;
  pacienteId: string;
  expediente: string;
  pacienteNombre: string;
  servicio: string;
  cama?: string;

  // Quién visita — se llena en el check-in.
  visitante?: VisitanteInfo;
  esTitular?: boolean;

  estado: EstadoVisita;
  programada: boolean;            // true = vino de la lista diaria; false = espontánea
  entradaEn?: Date;
  salidaEn?: Date;

  comentarios?: string;           // notas de Trabajo Social sobre la visita
  cierreAutomatico?: boolean;     // salida marcada por el cierre automático de fin de día

  // Responsables de cada movimiento (pueden ser TS distintos entre turnos).
  entradaPorId?: string;          // uid TS que registró la entrada (check-in)
  entradaPorNombre?: string;
  salidaPorId?: string;           // uid TS que registró la salida (check-out); "Sistema" si fue cierre automático
  salidaPorNombre?: string;

  registradoPorId: string;        // uid TS que creó el registro (compat. registros previos)
  registradoPorNombre: string;
  creadoEn: Date;
}

// ============================================================================
// Recursos Humanos — Incapacidades y licencias del personal del hospital
// ============================================================================
// Sistema de gestión de licencias del personal acoplado a la Ley de Servicio
// Civil. NO confundir con SolicitudIncapacidad (constancias médicas que los
// médicos emiten a PACIENTES). Aquí el sujeto es el EMPLEADO del hospital.
// Solo el rol "rrhh" (y "admin") usa este módulo. Las reglas legales (topes por
// antigüedad, comportamiento al exceder) viven en src/lib/rrhh/.

export type GeneroEmpleado = "masculino" | "femenino";

// Padrón de empleados — espejo de la hoja CONSULTA (export del sistema de
// gobierno). Se importa, NO se teclea a mano. La llave es el código de plaza.
export interface Empleado {
  id?: string;              // == codigo (id del documento en /empleados)

  codigo: string;           // código de plaza, ej. "A-002" — llave estable
  nombre: string;           // "NOMBRES APELLIDOS"
  dui?: string;
  nit?: string;
  isss?: string;
  nup?: string;
  afp?: string;             // CONFIA | CRECER | ...
  genero?: GeneroEmpleado;

  cargo?: string;           // puesto funcional
  departamento?: string;    // unidad organizativa (deuniorg)
  fechaIngreso?: Date;      // feingreso — base para antigüedad

  // Datos presupuestarios / contractuales (snapshot del padrón)
  sueldoBasico?: number;
  partidaPresupuestaria?: string;
  unidadPresupuestaria?: string;
  lineaTrabajo?: string;
  codigoPresupuestario?: string;
  estadoPlaza?: string;     // "Ocupada" | ...

  email?: string;
  celular?: string;

  activo: boolean;          // false = plaza desocupada / empleado retirado

  // Metadata de importación
  importadoEn?: Date;
  actualizadoEn?: Date;
}

// Bolsas de saldo (la lógica de topes vive en src/lib/rrhh/saldos.ts).
// Cada bolsa se mide en su propia UNIDAD (días u horas):
//  - incapacidad:       DÍAS · enfermedad/accidente — tope 15×años, máx 90 (con goce)
//  - duelo_cuido:       DÍAS · duelo / cuido de pariente — tope 20
//  - personal_congoce:  HORAS · permiso personal con goce — tope 40 h (= 5 días de 8 h)
//  - permiso_singoce:   HORAS · permiso sin goce — tope 480 h (= 60 días de 8 h)
//  - maternidad:        DÍAS · 112 días por evento (no es bolsa anual)
//  - ninguna:           lactancia/decreto — no descuenta saldo (informativo)
export type BolsaLicencia =
  | "incapacidad"
  | "duelo_cuido"
  | "personal_congoce"
  | "permiso_singoce"
  | "maternidad"
  | "ninguna";

// Unidad en la que se mide y captura una licencia.
//  - "dias":  rango de fechas (días totales, inclusivo).
//  - "horas": un día con hora inicio→fin, en intervalos de 30 min.
export type UnidadLicencia = "dias" | "horas";

// Catálogo CERRADO de categorías (reemplaza el caos de texto libre del Excel).
export type CategoriaLicencia =
  | "enfermedad_comun"
  | "enfermedad_profesional"
  | "accidente_comun"
  | "accidente_trabajo"
  | "maternidad"
  | "duelo"
  | "cuido_pariente"
  | "personal"
  | "sin_goce"
  | "lactancia"
  | "decreto";

export type TipoDocumentoLicencia = "resolucion" | "acuerdo";

export interface Licencia {
  id?: string;

  // ── Empleado (referencia + snapshot al crear) ──
  empleadoCodigo: string;
  empleadoNombre: string;
  empleadoCargo?: string;
  empleadoDepartamento?: string;
  empleadoGenero?: GeneroEmpleado;

  // ── Clasificación ──
  categoria: CategoriaLicencia;
  bolsa: BolsaLicencia;            // derivada de la categoría (snapshot)
  unidad: UnidadLicencia;         // "dias" | "horas" — según la bolsa
  tipoDocumento: TipoDocumentoLicencia;
  esProrroga: boolean;
  conGoce: boolean;               // false = el documento completo es sin goce

  // ── Diagnóstico (solo médicas) ──
  diagnostico?: DiagnosticoCIE;

  // ── Periodo ──
  // Día-base: [fechaInicial, fechaFinal] como rango.
  // Hora-base: fechaInicial = fechaFinal = el día; horaInicio/horaFin "HH:MM".
  fechaInicial: Date;
  fechaFinal: Date;
  horaInicio?: string;            // "HH:MM" — solo licencias por horas
  horaFin?: string;               // "HH:MM" — solo licencias por horas
  cantidad: number;               // total en la unidad de la bolsa (días u horas)
  anio: number;                   // año calendario de fechaInicial (para saldos)

  // ── Desglose con/sin goce (cuando el exceso del tope se reclasifica) ──
  cantidadConGoce: number;
  cantidadSinGoce: number;

  // ── Control de tope ──
  excedeTope: boolean;            // true si superó el tope de su bolsa al emitirse
  justificacion?: string;         // obligatoria cuando excedeTope

  // ── Estado y trazabilidad ──
  creadoEn: Date;
  registradoPorId: string;        // uid RRHH
  registradoPorNombre: string;
  actualizadoEn?: Date;
  actualizadoPorId?: string;
  actualizadoPorNombre?: string;

  observaciones?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLANES DE TRABAJO ESDOMED (horarios mensuales)
//
// El asistente administrativo de ESDOMED arma un plan por mes: a cada empleado
// le asigna un código de horario (ver src/lib/esdomed/horarios.ts) por cada día
// del mes. El PDF resultante se presenta a RH con el formato oficial del Excel.
// Los empleados con rol esdomed consultan su propia fila en "Mi horario".
// ─────────────────────────────────────────────────────────────────────────────

// Una fila del plan = un empleado y sus asignaciones día por día.
export interface FilaPlanTrabajo {
  uid?: string;            // uid del usuario si está vinculado (para "Mi horario")
  codigoMarcacion: string; // "C-043" — llave que vincula con el usuario
  nombre: string;          // NOMBRE COMPLETO (snapshot)
  puesto: string;          // PUESTO (snapshot)
  tipoJornada?: "Administrativo" | "Operativo"; // clasificación exclusiva del plan
  grupo?: string;          // grupo del mes: Administrativo / Grupo 1-4 / Equipo de emergencia
  orden?: number;          // orden manual dentro del grupo (menor primero); si falta, alfabético
  // Asignación por día del mes. Índice 0 = día 1. Valor: código de horario
  // ("MA2", "TH34"), marca especial ("VAC"|"INC"|"PER") o "" (descanso).
  asignaciones: string[];
  observaciones?: string;  // nota libre por persona (columna final del Excel)
}

export interface PlanTrabajo {
  id?: string;             // == periodo, ej. "2026-06"
  periodo: string;         // "YYYY-MM"
  anio: number;
  mes: number;             // 1-12
  numeroHoras?: string;    // texto libre del encabezado, ej. "168 Administrativo / 168 operativo"
  metaHorasAdmin?: number; // Metas numéricas para validación
  metaHorasOperativas?: number;
  filas: FilaPlanTrabajo[];

  // Trazabilidad
  creadoEn: Date;
  creadoPorId: string;
  creadoPorNombre: string;
  actualizadoEn?: Date;
  actualizadoPorId?: string;
  actualizadoPorNombre?: string;
}

// ============================================================================
// Trámites de Personal (ESDOMED)
// ============================================================================

export type CategoriaTramitePersonal = 
  | "A1_permiso_con_goce"
  | "A2_permiso_sin_goce"
  | "A3_enfermedad"
  | "A4_compensatorio"
  | "A5_consulta_isss"
  | "A6_paternidad"
  | "A7_enfermedad_pariente"
  | "A8_duelo"
  | "A9_otros"
  | "B_cambio_turno_individual"
  | "C_cambio_turno_2personas"
  | "D_licencia_o_acciones"
  | "E_inconsistencias_marcacion"
  | "F_tiempo_extra"
  | "G_misiones_oficiales";

export type EstadoTramitePersonal = "subido" | "pendiente" | "aprobado" | "rechazado";

export interface TramitePersonal {
  id?: string;
  categoria: CategoriaTramitePersonal;
  empleadoId: string;
  empleadoNombre: string;
  
  // Documentos
  documentoUrl?: string;    // legado: un solo adjunto
  documentoNombre?: string; // legado
  documentos?: { url: string; nombre: string }[]; // hasta 5 adjuntos
  notas?: string;

  // Solicitudes (A1, A2)
  fechaInicio?: Date;
  fechaFin?: Date;
  horas?: number;
  // "ordinario" si se solicita en o antes de la fecha del permiso;
  // "diferido" si se solicita después (permiso retroactivo).
  tipoSolicitud?: "ordinario" | "diferido";
  
  estado: EstadoTramitePersonal;

  creadoEn: Date;
  actualizadoEn?: Date;

  // Aprobación
  revisadoPorId?: string;
  revisadoPorNombre?: string;
  revisadoEn?: Date;
  comentariosRevision?: string;
}

// ============================================================================
// Censos de Emergencia (demanda espontánea y referidos)
// ============================================================================
// Digitación en vivo por los médicos de emergencia; reemplaza los libros de
// Excel "DEMANDAS ESPONTANEAS" y "REFERIDOS A HES" (una hoja por mes). Los
// catálogos normalizados viven en src/lib/emergencia/censos.ts. Solo se
// prellena la identidad del paciente (padrón personas + registro diario del
// SIS); todo lo clínico es criterio del médico que digita.

// Rangos de turno fijos del censo (columna HORARIO del Excel).
export type TurnoEmergencia = "t00_07" | "t07_15" | "t15_19" | "t19_24";

export type TriageEmergencia = "rojo" | "amarillo" | "verde";

// Destino del paciente en demanda espontánea (columna DESTINO DE PACIENTE).
// "alta_voluntaria" cubre también el alta exigida (misma figura en el censo).
export type DestinoEmergencia =
  | "alta"
  | "alta_voluntaria"
  | "ingreso"
  | "referencia"
  | "fuga";

// Estado de digitación de un registro de censo. Es DERIVADO al guardar:
// "abierto" mientras falte algún campo obligatorio (el médico registra al
// paciente al entrar y completa durante/al final del turno), "cerrado"
// automáticamente cuando todo está digitado.
export type EstadoRegistroCenso = "abierto" | "cerrado";

// Quién hizo la atención: DERIVADO al guardar según a qué lista oficial
// (STAFF_EMERGENCIA / MEDICOS_GENERALES_EMERGENCIA) pertenece el nombre en
// staffEvalua. Separa las atenciones del staff de las de médicos generales.
// null = nombre fuera de las listas (registros antiguos de texto libre).
export type TipoEvaluadorEmergencia = "staff" | "medico_general";

export interface CensoDemandaEspontanea {
  id?: string;

  // ── Digitación ──
  estadoRegistro: EstadoRegistroCenso;
  camposFaltantes?: string[];     // qué falta para cerrar (snapshot al guardar)

  // ── Atención ──
  fecha: Date;                    // estampa de la atención (auto al crear)
  turno: TurnoEmergencia;         // lo elige el médico (chips)

  // ── Identidad (prellenada de personas / registro diario; editable) ──
  expediente: string;
  pacienteNombre: string;
  edad?: number;
  genero: Genero | null;          // null mientras el registro está abierto

  // ── Evaluación (criterio del médico) ──
  triage: TriageEmergencia | null;
  condicion: "vivo" | "fallecido";
  diagnosticos: DiagnosticoCIE[]; // impresión diagnóstica, restringida a CIE-10
  especialidad: string;           // catálogo ESPECIALIDADES_EMERGENCIA

  // ── Referencia de entrada ──
  traeReferencia: boolean;
  lugarReferencia?: string;       // solo si traeReferencia

  // ── Destino ──
  destino: DestinoEmergencia | null;
  servicioIngresar?: string;      // solo si destino == "ingreso"
  centroRefiere?: string;         // solo si destino == "referencia"

  // ── Médicos ──
  staffEvalua: string;            // nombre del médico que evalúa (staff o general)
  evaluadoPor: TipoEvaluadorEmergencia | null; // derivado de staffEvalua
  reevaluacion?: string;          // vacío/undefined = no aplica
  medicosGenerales?: string;      // los del turno (se copia a cada registro)
  ventilacionMecanica: boolean;

  // ── Administrativo ──
  consulta48h: boolean;           // derivado: mismo expediente en las últimas 48 h
  aseguradoIsss: boolean;
  empleadoHes: boolean;
  dependencia?: string;           // solo si empleadoHes

  // ── Procedimientos (catálogo, chips) ──
  procedimientosMaxima: string[]; // vacío = "NO"
  procedimientosUE: string[];

  plan?: string;                  // PLAN / OBSERVACIONES — único texto libre

  // ── Trazabilidad ──
  creadoEn: Date;
  creadoPorId: string;
  creadoPorNombre: string;
  actualizadoEn?: Date;
}

// Clasificación derivada de la columna "REFERENCIA EN SIS (no modificar)":
// se calcula de hospitalReferencia + referenciaSis, nunca se digita.
export type ClasificacionSisReferido =
  | "HNSR CON REF SIS"
  | "HNSR SIN REF SIS"
  | "OTROS HOSP CON REF SIS"
  | "OTROS HOSP SIN REF SIS"
  | "DR SV";

export interface CensoReferido {
  id?: string;

  // ── Digitación ──
  estadoRegistro: EstadoRegistroCenso;
  camposFaltantes?: string[];     // qué falta para cerrar (snapshot al guardar)

  // ── Atención ──
  fecha: Date;
  turno: TurnoEmergencia;

  // ── Identidad (prellenada; editable) ──
  expediente: string;
  pacienteNombre: string;
  edad?: number;
  genero: Genero | null;          // null mientras el registro está abierto

  // ── Referencia ──
  hospitalReferencia: string;     // catálogo HOSPITALES_REFERENCIA
  referenciaSis: boolean;         // ¿trae referencia registrada en SIS?
  clasificacionSis: ClasificacionSisReferido | null; // derivada (null sin hospital)

  // ── Evaluación ──
  condicion: "estable" | "inestable" | null;
  dispositivoO2: string;          // catálogo DISPOSITIVOS_O2
  diagnosticos: DiagnosticoCIE[];
  discrepanciaDiagnostico: "si" | "no" | "no_aplica";
  modificacionServicio: "si" | "no" | "no_aplica";
  servicioIngreso: string;        // catálogo SERVICIOS_INGRESO_REFERIDO

  // ── Médicos ──
  staffEvalua: string;            // nombre del médico que evalúa (staff o general)
  evaluadoPor: TipoEvaluadorEmergencia | null; // derivado de staffEvalua
  reevaluacion?: string;          // vacío/undefined = no aplica
  medicosGenerales?: string;

  // ── Tiempos ──
  tiempoPermanencia: string;      // catálogo TIEMPOS_PERMANENCIA
  razonDemora?: string;           // catálogo RAZONES_DEMORA — solo si > 1 hora

  // ── Procedimientos ──
  procedimientosMaxima: string[];
  otrosProcedimientos: string[];

  observaciones?: string;

  // ── Trazabilidad ──
  creadoEn: Date;
  creadoPorId: string;
  creadoPorNombre: string;
  actualizadoEn?: Date;
}

// ── Registro Diario de Emergencia (reporte del SIS, importado por ESDOMED) ──
// Los pacientes aparecen aquí apenas entran a emergencia (antes que en
// atenciones_emergencia, que llega hasta cerrar triage). Fuente de identidad
// (edad/sexo) para el prellenado de los censos. No trae nombre ni hora.
export interface RegistroDiarioEmergencia {
  id?: string;                    // dedup determinista: `${expediente}__${YYYY-MM-DD}`

  expediente: string;
  fechaReporte: Date;             // día del reporte (lo elige ESDOMED al importar)
  genero: Genero;                 // sexo 1/2 del SIS → masculino/femenino
  edadTexto?: string;             // "64 años 7 meses 18 días" — crudo del reporte
  edadAnios?: number;             // años extraídos del texto

  departamento?: string;
  municipio?: string;
  area?: AreaGeografica;          // 1 = urbana, 2 = rural

  medico?: string;                // quien registró en el SIS
  subservicio?: string;           // "Máxima Emergencia" | "Medicina Interna" | ...

  diagnosticoPrincipal?: DiagnosticoCIE;
  diagnosticoSecundario?: DiagnosticoCIE;
  causaExterna?: DiagnosticoCIE;

  ingresoHospitalario: boolean;   // 1 = sí, 2 = no
  tipoAfiliacion?: string;        // "ISSS Cotizante" | "ISSS Beneficiario" | ...
  numeroAfiliacion?: string;
  establecimientoReferido?: string;

  // Metadata de importación
  importadoEn: Date;
  importadoPorId: string;
  importadoPorNombre: string;
  archivoOrigen?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transporte institucional
// ─────────────────────────────────────────────────────────────────────────────

// Vehículo o equipo de la flota. Colección: vehiculos_transporte
export interface VehiculoTransporte {
  id?: string;
  placa: string;               // "N-17895" (los equipos sin placa usan un alias, ej. "PODADORA")
  nombre: string;              // "TOYOTA HILUX 2BLE CABINA"
  tipo: import("@/lib/transporte/catalogos").TipoVehiculo;
  combustible: "diesel" | "gasolina";
  kmActual?: number;           // último odómetro conocido (lo actualiza cada viaje finalizado)
  estado: "activo" | "taller" | "baja";
  notas?: string;
  creadoEn: Date;
  actualizadoEn?: Date;
}

// Un viaje/misión: la solicitud pública y todo su ciclo de vida en UN doc.
// Colección: viajes_transporte — docId = folio (código no adivinable: conocerlo
// equivale a poder consultar esa solicitud sin cuenta).
export interface ViajeTransporte {
  id?: string;
  folio: string;
  estado: import("@/lib/transporte/catalogos").EstadoViaje;

  // Solicitud (formulario público — identidad autodeclarada, la valida el jefe)
  solicitanteUid: string;      // uid (normalmente anónimo) que creó la solicitud
  solicitanteNombre: string;
  solicitanteDui: string;
  solicitanteCodigoEmpleado: string;
  telefono?: string;           // teléfono o extensión de contacto
  area: string;                // código+nombre del centro de costos ("659-Lavandería")
  mision: string;
  personal?: string;           // nombres del personal que participa en la misión
  destinoTexto: string;
  destinoLat?: number;         // pin opcional del mapa
  destinoLng?: number;
  fechaNecesita: string;       // "YYYY-MM-DD"
  horaNecesita: string;        // "HH:MM"

  // Gestión (jefe de transporte)
  vehiculoId?: string;
  vehiculoNombre?: string;     // snapshot "placa · nombre"
  motoristaId?: string;
  motoristaNombre?: string;
  autorizadoPorId?: string;
  autorizadoPorNombre?: string;
  motivoRechazo?: string;      // obligatorio al rechazar
  esTraslado?: boolean;        // clasificación PERC (664_1) — la marca el jefe

  // Ejecución (motorista)
  horaSalida?: string;         // "HH:MM"
  kmSalida?: number;
  horaEntrada?: string;
  kmEntrada?: number;
  kmRecorrido?: number;        // kmEntrada - kmSalida (calculado al finalizar)

  creadoEn: Date;
  actualizadoEn?: Date;
}

// Checklist diario del vehículo (requisito para iniciar ruta).
// Colección: checklists_vehiculo — docId = `${vehiculoId}_${fecha}_${motoristaId}`
export interface ChecklistVehiculo {
  id?: string;
  vehiculoId: string;
  vehiculoNombre: string;
  fecha: string;               // "YYYY-MM-DD"
  motoristaId: string;
  motoristaNombre: string;
  items: Record<string, boolean>; // id del ítem del catálogo → Sí/No
  nivelCombustible: import("@/lib/transporte/catalogos").NivelCombustible;
  kilometraje?: number;
  observaciones?: string;
  creadoEn: Date;
}
