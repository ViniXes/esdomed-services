// Tipos del flujo "Consulta Externa" de SIMMOW (formulario "Ingreso/Edición
// Consulta Curativa / Atención Preventiva", conrec.php). Es una instancia
// aislada de Atención Ambulatoria a propósito: los valores fijos de aquel
// flujo (Especialidad "Emergencia", Primera vez) no aplican aquí — en consulta
// externa cada dato sale del reporte.
//
// Fuentes: el "Censo diario de consulta externa" del SIS (reporte base: de
// ahí sale casi todo) y la "Programación de citas por día" (apoyo: solo
// aporta DUI y nombre, que el censo no trae). Los campos "...Valor" guardan
// el valor que espera el select/radio de SIMMOW; cuando el reporte trae el
// dato como código (sexo, área, departamento...) coincide con el del reporte.

export interface DatosSimmowConsultaExterna {
  expediente: string;
  dui: string;
  paciente: string;
  fecha: string; // DD/MM/YYYY — viene del encabezado del censo, no de cada fila

  sexoValor: string; // "1" Masculino | "2" Femenino | "3" Intersexual
  edadAnios: string;
  edadMeses: string;
  edadDias: string;

  /** Código 1–21 del reporte; es el mismo número que el value del select p_dept de SIMMOW. */
  departamentoValor: string;
  /** Texto del reporte con sufijo de departamento (p. ej. "Colón LI"); el script lo resuelve contra p_muni. */
  municipio: string;
  areaValor: string; // "1" Urbana | "2" Rural

  // Atenciones preventivas
  tabaquismoTexto: string;
  tabaquismoValor: string; // "1" activo | "2" pasivo | "3" exfumador
  inscripcionValor: string;
  controlValor: string;
  evaluacionInfantilValor: string; // "1" adecuado | "2" riesgo
  perimetroCefalico: string;
  pesoEdadValor: string;
  tallaEdadValor: string;
  pesoTallaValor: string;
  imcTexto: string;
  imcValor: string; // value de m_est_nut_mc
  lactanciaValor: string;
  pfInscripcionControlValor: string;
  pfMetodoValor: string;
  pfUsuariaValor: string;
  deteccionCancerValor: string;
  amenorreaSemanas: string;

  // Diagnósticos
  dptconValor: string; // tipo de consulta del Dx principal: "1" primera vez | "2" subsecuente
  especialistaValor: string; // "0" N/A | "1" 1a. vez | "2" subsecuente
  dpstMarcado: boolean; // Sospecha
  diagPrincipalCodigo: string;
  diagPrincipalTexto: string;
  dstconValor: string; // tipo de consulta del Dx secundario
  diagSecundarioCodigo: string;
  diagSecundarioTexto: string;
  causaExternaCodigo: string;
  causaExternaTexto: string;

  // Otros
  discapacidadValor: string;
  violenciaCondicionValor: string;
  violenciaAmbitoValor: string;
  procSaludMentalValor: string;
  ingresoHospitalario: boolean;

  /** "1" Referencia | "2" Interconsulta (columna "Tipo" del reporte). */
  refTipoValor: string;
  refATexto: string;
  refAEstablecimientoCodigo: string;
  refAValor: string; // radio refa: "2" Priv | "3" Establec
  refDeTexto: string;
  refDeEstablecimientoCodigo: string;
  refDeValor: string; // radio refde: "2" Priv | "3" Establec

  // Afiliación
  isss: boolean;
  tipoIsssValor: string; // "1" Cotizante | "2" Beneficiario
  numeroAfiliacion: string; // número del ISSS
  derechohabienteOtrosValor: string; // 3..8 (Veterano, ISBM, IPSFA, Beneficiario VG)
  derechohabienteOtrosNumero: string;
  victimaDHValor: string; // "1" Sentencia CIDH | "2" Mozote | "3" Decreto 204
  privadoLibertadValor: string;

  medicoNombre: string;
  medicoCodigoSimmow: string;
  /** Especialidad tal cual la trae el reporte; aún no hay equivalencia con el select de SIMMOW. */
  especialidadTexto: string;
}

export function datosConsultaExternaVacios(): DatosSimmowConsultaExterna {
  return {
    expediente: "",
    dui: "",
    paciente: "",
    fecha: "",
    sexoValor: "",
    edadAnios: "",
    edadMeses: "",
    edadDias: "",
    departamentoValor: "",
    municipio: "",
    areaValor: "",
    tabaquismoTexto: "",
    tabaquismoValor: "",
    inscripcionValor: "",
    controlValor: "",
    evaluacionInfantilValor: "",
    perimetroCefalico: "",
    pesoEdadValor: "",
    tallaEdadValor: "",
    pesoTallaValor: "",
    imcTexto: "",
    imcValor: "",
    lactanciaValor: "",
    pfInscripcionControlValor: "",
    pfMetodoValor: "",
    pfUsuariaValor: "",
    deteccionCancerValor: "",
    amenorreaSemanas: "",
    dptconValor: "",
    especialistaValor: "",
    dpstMarcado: false,
    diagPrincipalCodigo: "",
    diagPrincipalTexto: "",
    dstconValor: "",
    diagSecundarioCodigo: "",
    diagSecundarioTexto: "",
    causaExternaCodigo: "",
    causaExternaTexto: "",
    discapacidadValor: "",
    violenciaCondicionValor: "",
    violenciaAmbitoValor: "",
    procSaludMentalValor: "",
    ingresoHospitalario: false,
    refTipoValor: "",
    refATexto: "",
    refAEstablecimientoCodigo: "",
    refAValor: "",
    refDeTexto: "",
    refDeEstablecimientoCodigo: "",
    refDeValor: "",
    isss: false,
    tipoIsssValor: "",
    numeroAfiliacion: "",
    derechohabienteOtrosValor: "",
    derechohabienteOtrosNumero: "",
    victimaDHValor: "",
    privadoLibertadValor: "",
    medicoNombre: "",
    medicoCodigoSimmow: "",
    especialidadTexto: "",
  };
}

export interface PacienteConsultaExterna {
  /** Único por fila del censo: un mismo expediente puede tener dos consultas el mismo día. */
  clave: string;
  numero: string; // N° de la fila en el censo
  expediente: string;
  datos: DatosSimmowConsultaExterna;
  enProgramacion: boolean;
  /** Suposiciones o faltantes a revisar antes de copiar el código. */
  advertencias: string[];
  /** Date.now() de la última vez que se copió el código de este paciente. */
  codigoCopiadoEn?: number;
}
