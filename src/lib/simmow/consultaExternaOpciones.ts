// Opciones de los selects/radios de conrec.php, leídas en vivo del formulario
// real de SIMMOW. El value de cada una es el mismo número que trae el censo.

export interface OpcionSimmow {
  valor: string;
  etiqueta: string;
}

const lista = (...etiquetas: string[]): OpcionSimmow[] =>
  etiquetas.map((etiqueta) => ({ valor: etiqueta.match(/^\d+/)![0], etiqueta }));

export const OP_SEXO = lista("1 - Masculino", "2 - Femenino", "3 - Intersexual");
export const OP_AREA = lista("1 - Urbana", "2 - Rural");
export const OP_TABAQUISMO = lista("1 - Fumador Activo", "2 - Fumador Pasivo", "3 - Exfumador");
export const OP_INSCRIPCION = lista(
  "1 - Infantil / Adolescente / Adulto",
  "2 - Materna menos de 12 semanas",
  "3 - Materna más de 12 semanas",
  "4 - Climaterio y Menopausia",
  "5 - Preconcepcional",
  "6 - Alto Riesgo Reproductivo",
  "7 - Prematuro (menor 2000 grs al nacer)"
);
export const OP_CONTROL = lista(
  "1 - Infantil / Adolescente / Adulto",
  "2 - Materno",
  "3 - Puerperal",
  "4 - Climaterio y Menopausia",
  "5 - Puerperal Precoz",
  "6 - Preconcepcional",
  "7 - Puerperal Tardio",
  "8 - Alto Riesgo Reproductivo",
  "9 - Prematuro (menor 2000 grs al nacer)"
);
export const OP_EVALUACION_INFANTIL = lista("1 - Adecuado", "2 - Riesgo");
export const OP_PESO_EDAD = lista("1 - Normal", "2 - Desnutrición", "3 - Desnutrición Severa");
export const OP_TALLA_EDAD = lista("1 - Normal", "2 - Talla Alta", "3 - Retardo Crecimiento", "4 - Retardo Severo Crecimiento");
export const OP_PESO_TALLA = lista("1 - Normal", "2 - Desnutrición", "3 - Desnutrición Severa", "4 - Sobrepeso", "5 - Obesidad");
export const OP_IMC = lista("1 - Normal", "2 - Bajo Peso", "3 - Desnutrición", "4 - Sobrepeso", "5 - Obesidad", "6 - Desnutrición Severa");
export const OP_LACTANCIA = lista("1 - Exclusiva", "2 - Predominante / Complementaria", "3 - Sin lactancia");
export const OP_PF_IN_CON = lista("1 - Inscripción", "2 - Control Normal", "3 - Control por Morbilidad", "4 - Control por Falla");
export const OP_PF_METODO = lista(
  "1 - Inyectable",
  "2 - Oral",
  "3 - Barrera",
  "4 - Dispositivo Intrauterino",
  "5 - Natural",
  "6 - Intradermico",
  "7 - Otros"
);
export const OP_DETECCION_CANCER = lista(
  "1 - Toma de Citología Vaginal 1a. vez en la vida",
  "2 - Toma de Citología Vaginal Subsecuente",
  "3 - De Próstata",
  "4 - Inspección Visual con Acido Acético (IVAA)",
  "5 - VPH",
  "6 - Citología Cérvico-vaginal de Tamizaje",
  "7 - Citología Cérvico-vaginal de seguimiento",
  "8 - Prueba de VPH de Tamizaje",
  "9 - Prueba de VPH de Seguimiento"
);
export const OP_TIPO_CONSULTA = lista("1 - Primera vez", "2 - Subsecuente");
export const OP_ESPECIALISTA = [
  { valor: "0", etiqueta: "0 - N/A" },
  { valor: "1", etiqueta: "1 - 1a. vez" },
  { valor: "2", etiqueta: "2 - Subsecuente" },
];
export const OP_DISCAPACIDAD = lista("1 - Fisica", "2 - Auditiva", "3 - Visual", "4 - Mental", "5 - Mas de una", "6 - Intelectual");
export const OP_VIOLENCIA_CONDICION = lista(
  "1 - NNA Situac Calle",
  "2 - NNA Trabajo Infantil",
  "3 - Trata Personas",
  "4 - Explotacion Sexual",
  "5 - Desp. Forzado"
);
export const OP_VIOLENCIA_AMBITO = lista("1 - Intrafamiliar", "2 - Comunidad", "3 - Educativo", "4 - Laboral");
export const OP_PROC_SALUD_MENTAL = lista(
  "1 - Prueba Psicosometrica",
  "2 - Psicoterapia Individual",
  "3 - Intervención en Crisis",
  "4 - Primeros Aux. Psicologicos",
  "5 - Int. Breve Cesación Tabaco"
);
export const OP_TIPO_ISSS = lista("1 - Cotizante", "2 - Beneficiario");
export const OP_DERECHOHABIENTE_OTROS = lista(
  "3 - Veterano de Guerra",
  "4 - Cotizante ISBM",
  "5 - Beneficiario ISBM",
  "6 - Cotizante IPSFA",
  "7 - Beneficiario IPSFA",
  "8 - Beneficiario VG"
);
export const OP_VICTIMA_DH = lista("1 - Sentencia CIDH", "2 - Mozote", "3 - Decreto 204");
export const OP_PRIVADO_LIBERTAD = lista(
  "1 - Centro penal",
  "2 - Centro intermedio",
  "3 - Bartolina",
  "4 - Centro Integracion Social",
  "5 - Primera infancia (CDI)",
  "6 - Primera infancia (CBI)",
  "7 - Acogimiento emergencia e institucional"
);
export const OP_REF_TIPO = lista("1 - Referencia", "2 - Interconsulta");
export const OP_REF_RADIO = lista("2 - Privado", "3 - Establecimiento");

// Orden del select p_dept de SIMMOW (alfabético); el value es el código del reporte.
export const OP_DEPARTAMENTO: OpcionSimmow[] = [
  ["1", "Ahuachapán"], ["9", "Cabañas"], ["4", "Chalatenango"], ["18", "Costa Rica"], ["7", "Cuscatlán"],
  ["15", "Guatemala"], ["16", "Honduras"], ["5", "La Libertad"], ["8", "La Paz"], ["14", "La Unión"],
  ["13", "Morazán"], ["17", "Nicaragua"], ["20", "Otros Países"], ["19", "Panamá"],
  ["21", "Salvadoreño Residente Exterior"], ["12", "San Miguel"], ["6", "San Salvador"], ["10", "San Vicente"],
  ["2", "Santa Ana"], ["3", "Sonsonate"], ["11", "Usulután"],
].map(([valor, nombre]) => ({ valor, etiqueta: `${valor} - ${nombre}` }));
