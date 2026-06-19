export type UserRole = "medico" | "esdomed" | "asistente_esdomed" | "trabajo_social" | "psicologia" | "admin" | "enfermeria" | "rrhh";
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
  codigoMarcacion?: string; // solo personal ESDOMED — llave para vincular su fila en el plan de horarios (ej. "C-043")
  puesto?: string;          // solo personal ESDOMED — cargo que aparece en el plan (ej. "TECNICO EN ...")
  createdAt: Date;
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
  entregadoA?: string; // Quién retiró la impresión (texto libre; puede no tener usuario, ej. internos)
}

// ============================================================================
// Registro de Altas — bitácora interna de egresos de ESDOMED (control SIMMOW)
// ============================================================================
// Reemplaza la hoja de cálculo "_ALTAS REGISTRO ESDO3". Cada documento es una
// alta/egreso que ESDOMED procesó para digitar en SIMMOW. Es solo para control.

// Tipos de alta (columna "ESTADO" de la hoja, normalizada a un catálogo cerrado).
export type TipoAlta =
  | "alta_efectiva"
  | "alta_exigida"
  | "alta_voluntaria"
  | "alta_suspendida"
  | "alta_dengue"
  | "alta_jornada_cirugia"
  | "deposito"
  | "traslado_otro_hospital";

export interface RegistroAlta {
  id?: string;
  fecha: string;                 // YYYY-MM-DD — fecha del alta
  expediente: string;
  pacienteNombre: string;
  servicio: string;
  cama?: string;
  genero?: Genero;
  tipoAlta: TipoAlta;

  responsableEsdomed: string;    // quién de ESDOMED procesó (default: usuario actual)
  digitadorSimmow?: string;      // quién lo digitó en SIMMOW
  medicoRetira?: string;         // médico/persona que retiró la documentación (texto libre)

  // Estado de la documentación — reemplaza el texto libre de la columna "NOTAS".
  documentacionCompleta: boolean;
  documentacionEntregada: boolean;
  notas?: string;

  creadoEn: Date;
  creadoPorId: string;
  creadoPorNombre: string;
  actualizadoEn?: Date;
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

export type TipoAltaVivo = "domicilio" | "exigida" | "referido" | "fuga" | "in_extremis" | "deposito" | "suspendida";
export type EstadoNotificacionAlta = "pendiente" | "observada" | "deposito" | "suspendida" | "procesada" | "recibida" | "duplicada";
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
  documentoUrl?: string;
  documentoNombre?: string;
  notas?: string;

  // Solicitudes (A1, A2)
  fechaInicio?: Date;
  fechaFin?: Date;
  horas?: number;
  
  estado: EstadoTramitePersonal;
  
  creadoEn: Date;
  actualizadoEn?: Date;
  
  // Aprobación
  revisadoPorId?: string;
  revisadoPorNombre?: string;
  revisadoEn?: Date;
  comentariosRevision?: string;
}
