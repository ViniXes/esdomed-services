// Tipos del módulo SIMMOW (extracción FIEH + Certificado de Defunción y
// generación del script de consola que llena el formulario de SIMMOW).
//
// Los nombres de campo en MAYUS_SNAKE se conservan idénticos a la herramienta
// original de Apps Script (FIEH_SIMMOW_HNES) para que el port de los
// extractores y del generador sea 1:1 y se pueda comparar salida contra salida.

// ─── Motor PDF ───────────────────────────────────────────────────────────────

/** Item de texto con coordenadas en el espacio de la página (origen abajo-izquierda). */
export interface ItemTexto {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontName: string;
}

/** Casilla detectada (imagen bitmap ~10pt clasificada por píxeles oscuros). */
export interface CheckboxDetectado {
  x: number;
  y: number;
  w: number;
  h: number;
  objId: string;
  marcado: boolean;
  ratioOscuro: number;
  /** Texto de la opción asociada (item más cercano a la izquierda en la misma línea). */
  opcion: string;
}

export interface PaginaExtraida {
  numero: number;
  items: ItemTexto[];
  checkboxes: CheckboxDetectado[];
  /** Texto reconstruido en orden de lectura (líneas por Y desc, items por X asc). */
  textoPlano: string;
}

export interface DocumentoExtraido {
  paginas: PaginaExtraida[];
  /** Texto plano de todas las páginas unidas con salto de línea. */
  textoCompleto: string;
  numPaginas: number;
}

// ─── Datos SIMMOW ────────────────────────────────────────────────────────────

export type CondicionEgresoSimmow = "" | "VIVO" | "MUERTO";

export interface DatosSimmow {
  // Identidad y documento
  NEC: string;
  TIPO_DOCUMENTO: string;
  TIPO_DOCUMENTO_VALOR: string; // 1=DUI paciente, 2=Pasaporte, 3=DUI responsable
  NUM_DOCUMENTO: string;
  TIPO_AFILIACION: string;
  TIPO_AFILIACION_VALOR: string; // 1..7 según catálogo SIMMOW
  NUM_AFILIACION: string;
  APELLIDOS: string;
  NOMBRES: string;
  PRIMER_APELLIDO: string;
  SEGUNDO_APELLIDO: string;
  TERCER_APELLIDO: string;
  PRIMER_NOMBRE: string;
  SEGUNDO_NOMBRE: string;
  TERCER_NOMBRE: string;
  FECHA_NACIMIENTO: string;
  EDAD_ANIOS: string;
  EDAD_MESES: string;
  EDAD_DIAS: string;
  SEXO: string; // Masculino | Femenino | Intersexual
  DIRECCION: string;
  DEPARTAMENTO: string;
  DISTRITO: string;
  CANTON: string;
  AREA: string; // Urbana | Rural

  // Ingreso
  FECHA_INGRESO: string;
  HORA_INGRESO: string;
  DIAG_INGRESO_TEXTO: string;
  DIAG_INGRESO_CODIGO: string;
  ACCIDENTE_TRANSITO: string; // SI | NO
  ACCIDENTE_LABORAL: string; // SI | NO
  TIPO_ACCIDENTE_VALOR: string; // 1=tránsito, 2=laboral

  // Servicio hospitalario (último traslado del literal C o servicio de ingreso)
  SERVICIO_HOSPITALARIO_ORIGEN: string;
  SERVICIO_HOSPITALARIO_VALOR: string;
  SERVICIO_HOSPITALARIO_FUENTE: string;
  SERVICIO_HOSPITALARIO_DETALLE: string;
  REFERIDO_A_ESTABLECIMIENTO: string;
  REFERIDO_DEL_ESTABLECIMIENTO: string;
  RETORNO_HACIA: string;

  // Diagnósticos de egreso
  DIAG_PRINCIPAL_TEXTO: string;
  DIAG_PRINCIPAL_CODIGO: string;
  // Complementarios según orden visual del FIEH: c) b) a) II) II)
  DIAG_C_TEXTO: string;
  DIAG_C_CODIGO: string;
  DIAG_B_TEXTO: string;
  DIAG_B_CODIGO: string;
  DIAG_A_TEXTO: string;
  DIAG_A_CODIGO: string;
  DIAG_II1_TEXTO: string;
  DIAG_II1_CODIGO: string;
  DIAG_II2_TEXTO: string;
  DIAG_II2_CODIGO: string;
  CAUSA_EXTERNA_TEXTO: string;
  CAUSA_EXTERNA_CODIGO: string;
  DISCAPACIDAD_PRINCIPAL_TEXTO: string;
  DISCAPACIDAD_PRINCIPAL_CODIGO: string;

  // Cirugías (SIMMOW muestra 4 filas)
  CIRUGIA_1_TEXTO: string;
  CIRUGIA_1_CODIGO: string;
  CIRUGIA_1_FECHA: string;
  CIRUGIA_1_CIRUJANO: string;
  CIRUGIA_1_TIPO: string; // 1 | 3 | 5
  CIRUGIA_2_TEXTO: string;
  CIRUGIA_2_CODIGO: string;
  CIRUGIA_2_FECHA: string;
  CIRUGIA_2_CIRUJANO: string;
  CIRUGIA_2_TIPO: string;
  CIRUGIA_3_TEXTO: string;
  CIRUGIA_3_CODIGO: string;
  CIRUGIA_3_FECHA: string;
  CIRUGIA_3_CIRUJANO: string;
  CIRUGIA_3_TIPO: string;
  CIRUGIA_4_TEXTO: string;
  CIRUGIA_4_CODIGO: string;
  CIRUGIA_4_FECHA: string;
  CIRUGIA_4_CIRUJANO: string;
  CIRUGIA_4_TIPO: string;
  CIRUGIA_SUSPENDIDA_VALOR: string; // "SI" | ""

  // Egreso
  CONDICION_EGRESO: CondicionEgresoSimmow;
  FECHA_EGRESO: string;
  HORA_EGRESO: string; // 00-23
  MINUTO_EGRESO: string; // 00-59
  MOTIVO_ALTA_VALOR: string; // circunstancia de alta 1..6
  RECOMENDACIONES: string;
  MEDICO_RESPONSABLE_ALTA: string;
  JVPM_MEDICO: string;
  JVPM_MEDICO_NUMERO: string;
  ESDOMED_DIGITA: string;
  FECHA_DIGITACION: string;

  // Certificado de Defunción (solo fallecidos)
  CERT_CAUSA_A_TEXTO: string;
  CERT_CAUSA_A_CODIGO: string;
  CERT_CAUSA_A_INTERVALO: string;
  CERT_CAUSA_A_TIEMPO: string; // años | meses | dias | horas | minutos
  CERT_CAUSA_B_TEXTO: string;
  CERT_CAUSA_B_CODIGO: string;
  CERT_CAUSA_B_INTERVALO: string;
  CERT_CAUSA_B_TIEMPO: string;
  CERT_CAUSA_C_TEXTO: string;
  CERT_CAUSA_C_CODIGO: string;
  CERT_CAUSA_C_INTERVALO: string;
  CERT_CAUSA_C_TIEMPO: string;
  CERT_CAUSA_BASICA_D_TEXTO: string;
  CERT_CAUSA_BASICA_D_CODIGO: string;
  CERT_CAUSA_BASICA_D_INTERVALO: string;
  CERT_CAUSA_BASICA_D_TIEMPO: string;
  CERT_OTRO_ESTADO_1_TEXTO: string;
  CERT_OTRO_ESTADO_1_CODIGO: string;
  CERT_OTRO_ESTADO_1_INTERVALO: string;
  CERT_OTRO_ESTADO_1_TIEMPO: string;
  CERT_OTRO_ESTADO_2_TEXTO: string;
  CERT_OTRO_ESTADO_2_CODIGO: string;
  CERT_OTRO_ESTADO_2_INTERVALO: string;
  CERT_OTRO_ESTADO_2_TIEMPO: string;
}

export type CampoSimmow = keyof DatosSimmow;

export interface ResultadoExtraccion {
  datos: DatosSimmow;
  advertencias: string[];
  /** Campos que la extracción no pudo hallar (la revisión los resalta). */
  camposNoEncontrados: CampoSimmow[];
}

export function datosVacios(): DatosSimmow {
  return {
    NEC: "",
    TIPO_DOCUMENTO: "",
    TIPO_DOCUMENTO_VALOR: "",
    NUM_DOCUMENTO: "",
    TIPO_AFILIACION: "",
    TIPO_AFILIACION_VALOR: "",
    NUM_AFILIACION: "",
    APELLIDOS: "",
    NOMBRES: "",
    PRIMER_APELLIDO: "",
    SEGUNDO_APELLIDO: "",
    TERCER_APELLIDO: "",
    PRIMER_NOMBRE: "",
    SEGUNDO_NOMBRE: "",
    TERCER_NOMBRE: "",
    FECHA_NACIMIENTO: "",
    EDAD_ANIOS: "",
    EDAD_MESES: "",
    EDAD_DIAS: "",
    SEXO: "",
    DIRECCION: "",
    DEPARTAMENTO: "",
    DISTRITO: "",
    CANTON: "",
    AREA: "",
    FECHA_INGRESO: "",
    HORA_INGRESO: "",
    DIAG_INGRESO_TEXTO: "",
    DIAG_INGRESO_CODIGO: "",
    ACCIDENTE_TRANSITO: "",
    ACCIDENTE_LABORAL: "",
    TIPO_ACCIDENTE_VALOR: "",
    SERVICIO_HOSPITALARIO_ORIGEN: "",
    SERVICIO_HOSPITALARIO_VALOR: "",
    SERVICIO_HOSPITALARIO_FUENTE: "",
    SERVICIO_HOSPITALARIO_DETALLE: "",
    REFERIDO_A_ESTABLECIMIENTO: "",
    REFERIDO_DEL_ESTABLECIMIENTO: "",
    RETORNO_HACIA: "",
    DIAG_PRINCIPAL_TEXTO: "",
    DIAG_PRINCIPAL_CODIGO: "",
    DIAG_C_TEXTO: "",
    DIAG_C_CODIGO: "",
    DIAG_B_TEXTO: "",
    DIAG_B_CODIGO: "",
    DIAG_A_TEXTO: "",
    DIAG_A_CODIGO: "",
    DIAG_II1_TEXTO: "",
    DIAG_II1_CODIGO: "",
    DIAG_II2_TEXTO: "",
    DIAG_II2_CODIGO: "",
    CAUSA_EXTERNA_TEXTO: "",
    CAUSA_EXTERNA_CODIGO: "",
    DISCAPACIDAD_PRINCIPAL_TEXTO: "",
    DISCAPACIDAD_PRINCIPAL_CODIGO: "",
    CIRUGIA_1_TEXTO: "",
    CIRUGIA_1_CODIGO: "",
    CIRUGIA_1_FECHA: "",
    CIRUGIA_1_CIRUJANO: "",
    CIRUGIA_1_TIPO: "",
    CIRUGIA_2_TEXTO: "",
    CIRUGIA_2_CODIGO: "",
    CIRUGIA_2_FECHA: "",
    CIRUGIA_2_CIRUJANO: "",
    CIRUGIA_2_TIPO: "",
    CIRUGIA_3_TEXTO: "",
    CIRUGIA_3_CODIGO: "",
    CIRUGIA_3_FECHA: "",
    CIRUGIA_3_CIRUJANO: "",
    CIRUGIA_3_TIPO: "",
    CIRUGIA_4_TEXTO: "",
    CIRUGIA_4_CODIGO: "",
    CIRUGIA_4_FECHA: "",
    CIRUGIA_4_CIRUJANO: "",
    CIRUGIA_4_TIPO: "",
    CIRUGIA_SUSPENDIDA_VALOR: "",
    CONDICION_EGRESO: "",
    FECHA_EGRESO: "",
    HORA_EGRESO: "",
    MINUTO_EGRESO: "",
    MOTIVO_ALTA_VALOR: "",
    RECOMENDACIONES: "",
    MEDICO_RESPONSABLE_ALTA: "",
    JVPM_MEDICO: "",
    JVPM_MEDICO_NUMERO: "",
    ESDOMED_DIGITA: "",
    FECHA_DIGITACION: "",
    CERT_CAUSA_A_TEXTO: "",
    CERT_CAUSA_A_CODIGO: "",
    CERT_CAUSA_A_INTERVALO: "",
    CERT_CAUSA_A_TIEMPO: "",
    CERT_CAUSA_B_TEXTO: "",
    CERT_CAUSA_B_CODIGO: "",
    CERT_CAUSA_B_INTERVALO: "",
    CERT_CAUSA_B_TIEMPO: "",
    CERT_CAUSA_C_TEXTO: "",
    CERT_CAUSA_C_CODIGO: "",
    CERT_CAUSA_C_INTERVALO: "",
    CERT_CAUSA_C_TIEMPO: "",
    CERT_CAUSA_BASICA_D_TEXTO: "",
    CERT_CAUSA_BASICA_D_CODIGO: "",
    CERT_CAUSA_BASICA_D_INTERVALO: "",
    CERT_CAUSA_BASICA_D_TIEMPO: "",
    CERT_OTRO_ESTADO_1_TEXTO: "",
    CERT_OTRO_ESTADO_1_CODIGO: "",
    CERT_OTRO_ESTADO_1_INTERVALO: "",
    CERT_OTRO_ESTADO_1_TIEMPO: "",
    CERT_OTRO_ESTADO_2_TEXTO: "",
    CERT_OTRO_ESTADO_2_CODIGO: "",
    CERT_OTRO_ESTADO_2_INTERVALO: "",
    CERT_OTRO_ESTADO_2_TIEMPO: "",
  };
}

/** Versión del template del generador; se guarda en la auditoría. */
export const VERSION_GENERADOR = 1;
