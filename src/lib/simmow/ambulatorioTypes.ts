// Tipos del flujo "Atención Ambulatoria" de SIMMOW (consulta curativa /
// atención preventiva de Emergencia). A diferencia del flujo hospitalario
// (un FIEH por paciente), acá la fuente son dos reportes del SIS con un
// paciente por fila — por eso los campos van directo en snake_case como los
// espera SIMMOW (sin la capa MAYUS_SNAKE que sí tiene sentido en types.ts
// para mirror 1:1 con la herramienta de Apps Script original del flujo
// hospitalario, que acá no existe).
//
// Solo cubre los campos visibles en la captura de pantalla que el usuario
// compartió del formulario real de SIMMOW — no las secciones de odontología,
// planificación familiar, nutrición ni tamizaje de cáncer.

export interface DatosSimmowAmbulatorio {
  expediente: string;
  dui: string;
  paciente: string;
  fecha: string; // DD/MM/YYYY

  sexoValor: string; // "1" Masculino | "2" Femenino | "3" Intersexual
  edadAnios: string;
  edadMeses: string;
  edadDias: string;

  departamento: string;
  municipio: string;
  areaValor: string; // "1" Urbana | "2" Rural

  diagPrincipalCodigo: string;
  diagPrincipalTexto: string;
  diagSecundarioCodigo: string;
  diagSecundarioTexto: string;
  causaExternaCodigo: string;
  causaExternaTexto: string;

  medicoNombre: string;
  /** Código interno que SIMMOW le asigna al médico — mismo problema/solución que el flujo hospitalario. */
  medicoCodigoSimmow: string;

  ingresoHospitalario: boolean;

  tipoAfiliacionTexto: string; // texto crudo del reporte, ej. "ISSS Cotizante"
  isss: boolean;
  tipoIsssValor: string; // "1" Cotizante | "2" Beneficiario | ""
  numeroAfiliacion: string;

  establecimientoReferidoTexto: string;
  /** Código del catálogo real de SIMMOW (refdeest es un campo de texto plano de máx. 4 caracteres, no un combobox). */
  establecimientoReferidoCodigo: string;
  refdeValor: string; // "1" Sin Ref | "2" Priv | "3" Establec | "4" Interconsulta

  privadoLibertadTexto: string;
  amenorreaSemanas: string;

  // Campos sin dato de origen en los reportes del SIS — se muestran en la
  // misma posición visual que SIMMOW para que el personal los complete a
  // mano ahí mismo (y el generador los manda si vienen con valor).
  modalidadValor: string;
  semanaEpidemiologica: string;
  soloPreventivo: boolean;
  tipoAtencionValor: string;
  especialidadValor: string;
  escuelaPromotora: boolean;
  discapacidadValor: string;
  violenciaTipoValor: string;
  violenciaCondicionValor: string;
  violenciaAmbitoValor: string;
  procSaludMentalValor: string;
  derechohabienteOtrosValor: string;
  derechohabienteOtrosNumero: string;
  victimaDH: boolean;
  victimaDHValor: string;
  dptconValor: string; // "1" Primera vez | "2" Subsecuente (Diagnóstico Principal)
  dpstMarcado: boolean; // Sospecha?
  dstconValor: string; // "1" Primera vez | "2" Subsecuente (Diagnóstico Secundario)
  especialistaValor: string; // "0" N/A | "1" 1a. Vez | "2" Subsecuente
  refAValor: string;
  refAEstablecimientoCodigo: string;
  referidoAFisioterapia: boolean;
  ucsf: string;
  ucsfNombre: string;
}

export function datosAmbulatorioVacios(): DatosSimmowAmbulatorio {
  return {
    expediente: "",
    dui: "",
    paciente: "",
    fecha: "",
    sexoValor: "",
    edadAnios: "",
    edadMeses: "",
    edadDias: "",
    departamento: "",
    municipio: "",
    areaValor: "",
    diagPrincipalCodigo: "",
    diagPrincipalTexto: "",
    diagSecundarioCodigo: "",
    diagSecundarioTexto: "",
    causaExternaCodigo: "",
    causaExternaTexto: "",
    medicoNombre: "",
    medicoCodigoSimmow: "",
    ingresoHospitalario: false,
    tipoAfiliacionTexto: "",
    isss: false,
    tipoIsssValor: "",
    numeroAfiliacion: "",
    establecimientoReferidoTexto: "",
    establecimientoReferidoCodigo: "",
    refdeValor: "",
    privadoLibertadTexto: "",
    amenorreaSemanas: "",
    modalidadValor: "",
    semanaEpidemiologica: "",
    soloPreventivo: false,
    tipoAtencionValor: "",
    // Todo este flujo es de Emergencia — igual que "Servicio: Emergencia" ya
    // es fijo, Especialidad también se preselecciona así por defecto.
    especialidadValor: "Emergencia",
    escuelaPromotora: false,
    discapacidadValor: "",
    violenciaTipoValor: "",
    violenciaCondicionValor: "",
    violenciaAmbitoValor: "",
    procSaludMentalValor: "",
    derechohabienteOtrosValor: "",
    derechohabienteOtrosNumero: "",
    victimaDH: false,
    victimaDHValor: "",
    dptconValor: "",
    dpstMarcado: false,
    dstconValor: "",
    especialistaValor: "0",
    refAValor: "",
    refAEstablecimientoCodigo: "",
    referidoAFisioterapia: false,
    ucsf: "",
    ucsfNombre: "",
  };
}

export interface PacienteAmbulatorio {
  expediente: string;
  datos: DatosSimmowAmbulatorio;
  /** De cuál(es) de los dos reportes vino este paciente — para avisar si faltó uno. */
  enPacientesAtendidos: boolean;
  enRegistroDiario: boolean;
  /** Suposiciones que el cruce tuvo que hacer por datos incompletos del reporte — a revisar antes de copiar. */
  advertencias: string[];
}
