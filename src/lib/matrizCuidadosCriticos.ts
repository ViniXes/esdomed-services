import type { FichaCuidadosCriticos, Paciente, TipoMedicoCuidadosCriticos } from "@/types";

export type TipoCampoMatriz = "text" | "textarea" | "number" | "date" | "time" | "yesno" | "select" | "cie10" | "servicioCritico" | "servicioHospitalario" | "catalogoCritico";

export interface CampoMatrizCuidadosCriticos {
  key: string;
  label: string;
  tipo: TipoCampoMatriz;
  opciones?: string[];
  solo?: TipoMedicoCuidadosCriticos;
  automatico?: boolean;
}

export interface GrupoMatrizCuidadosCriticos {
  id: string;
  titulo: string;
  descripcion: string;
  campos: CampoMatrizCuidadosCriticos[];
}

type ValorMatriz = string | number;
export type DatosMatrizCuidadosCriticos = Record<string, ValorMatriz>;
export const VALOR_NO_REGISTRADO = "No registrado";
export const CAMPOS_CIERRE_CUIDADOS_CRITICOS = new Set(["fecha_egreso_del_servicio", "alta", "fecha_de_muerte", "hora_de_muerte"]);

const LABELS_CIERRE_CUIDADOS_CRITICOS: Record<string, string> = {
  fecha_egreso_del_servicio: "FECHA EGRESO DEL SERVICIO",
  alta: "ALTA",
  fecha_de_muerte: "FECHA DE MUERTE",
  hora_de_muerte: "HORA DE MUERTE",
};

const CAMPOS_SI_NO = new Set([
  "REINGRESO ≤ 72 HORAS",
  "MUERTE > 48 HORAS",
  "INTERVENCION QX",
  "REINTERVENCION QX",
  "INTERVENCION PREVIO UCI",
  "COLOCACION CVC ANTES DE UCI",
  "COLOCACION CVC EN UCI",
  "COMPLICACIONES POR COLOCACION CVC",
  "CAMBIO CATETER CVC",
  "RETIRO ACCIDENTAL DE CVC",
  "COLOC. SNG EN UCI",
  "CAMBIO SNG",
  "RETIRO ACCIDENTAL DE SNG",
  "COLOC. STU PREVIO UCI",
  "COLOC. STU EN UCI",
  "CAMBIO STU EN UCI",
  "RETIRO ACCIDENTAL STU",
  "INTUBACIÓN EN CENTRO REFERENTE",
  "INTUBACION EN UCI",
  "EXTUBACION PROGRAMADA FALLIDA",
  "REINTUBACION",
  "COMPLICACIONES PLEURO/PULMONARES POR VM",
  "NEUMONIA NOSOCOM",
  "NEUM. ASOCI. A VM",
  "IVU ASOCIADA A STU",
  "INFECCION SITIO CVC",
  "OTRAS INFECCIONES UCI",
  "PRESENTÓ SHOCK SI/NO",
  "SE USO AMINAS SI/NO",
  "SE UTILIZÓ COLOIDE SI/NO",
  "SE NECESITO SEDACION SI/NO",
  "SE NECESITO OPIODE SI/NO",
  "SE NECESITO RELAJANTE SI/NO",
  "TRAQUEOSTOMÍA PERCUTANEA",
  "RETIRO ACCIDENTAL TRAQUEOSTOMIA",
  "COLOCACION TT",
  "PERICARDIOCENTESIS",
  "TORACOCENTESIS",
  "PARACENTESIS",
  "CAIDAS DE CAMA",
  "PACIENTE AMERITO INGRESO A UCI Y NO FUE ADMITIDO OPORTUNAMENTE",
  "LESION GRAVE POR STU",
  "ULCERAS POR DECUBITO PREVIO INGRESO A UCI",
  "ULCERAS PPOR DECUBITO DESARROLLADAS EN UCI",
  "AUTOEXTUBACION",
  "EXTUBACION ACCIDENTAL",
  "EXTUBACION EXITOSA",
  "PACIENTE CON GASTROSTOMIA",
  "RETIRO ACCIDENTAL GASTROSTOMIA",
  "SEPARACION DE LA VENTILACION",
  "ALTA CON ULCERA",
  "ALTA DECANULADO",
  "ALTA CON TRAQUEOSTOMIA",
  "PACIENTE EN PROGRAMA",
  "ALTA CON GASTROSTOMIA",
]);

const CAMPOS_NUMERICOS = new Set([
  "EDAD",
  "DIAS EN SERVICIO PROVENIENTE",
  "DIAS EN SERVICIO",
  "APACHE II INGRESO",
  "MORTALIDAD II (%)",
  "APACHE IV",
  "MORTALIDAD IV (%)",
  "DIAS PROBABLES DE INGRESO",
  "SOFA",
  "MORTALIDAD (%)",
  "CANTIDAD DE CAMBIOS",
  "VNI (DIAS)",
  "VMI (DIAS)",
  "DIAS APARICION IAAS POST INGRESO A UCI",
  "CUANTOS DÍAS UTILIZO AMINAS",
  "DIAS DE ANTIBIOTICO 1",
  "DIAS DE ANTIBIOTICO 2",
  "DIAS DE ANTIBIOTICO 3",
  "TAC CEREBRAL (CANTIDAD DE ESTUDIOS)",
  "TAC TORAX (CANTIDAD DE ESTUDIOS)",
  "TAC ABD. (CANTIDAD DE ESTUDIOS)",
  "TAC CERVICAL (CANTIDAD DE ESTUDIOS)",
  "TAC DE COLUMNA (CANTIDAD DE ESTUDIOS)",
  "TAC OTROS (CANTIDAD DE ESTUDIOS)",
  "RESONANCIA",
  "ECO HECHO POR UCI (CANTIDADES)",
  "USG RENAL EN UCI (CANTIDADES)",
  "USG ABD EN UCI (CANTIDADES)",
  "USG TEJ. BLAN POR UCI (CANTIDADES)",
  "ECO VNO POR UCI (CANTIDADES)",
  "DOPPLER CEREBRAL POR UCI (CANTIDADES)",
  "DOPLER MIS POR UCI (CANTIDADES)",
  "TRANS. GR",
  "T.PLASMA",
  "T. PLAQUETAS",
  "FISIOTERAPIA",
  "COLOCACION CVC GUIADA POR USG (CANTIDAD)",
  "COLOCACION CATETER 2 (CANTIDAD)",
  "COLOCACION CATETER 3 (CANTIDAD)",
  "FBB POR UCI (CANTIDAD)",
  "DIAS CON TT",
  "EEG",
  "ENDOSCOPIA",
  "COLONOSCOPIA",
  "GRADO DE ULCERA",
]);

const CAMPOS_TEXTO_LARGO = new Set<string>();

const CAMPOS_DIAGNOSTICO_CIE10 = new Set<string>([
  "DIAGNOSTICOS DE INGRESO 1",
  "DIAGNOSTICOS DE INGRESO 2",
  "DIAGNOSTICOS DE INGRESO 3",
  "DIAGNOSTICOS DE INGRESO 4",
  "DIAGNOSTICOS DE INGRESO 5",
  "DIAGNOSTICO DE EGRESO 1",
  "DIAGNOSTICO DE EGRESO 2",
  "DIAGNOSTICO DE EGRESO 3",
  "DIAGNOSTICO DE EGRESO 4",
  "DIAGNOSTICO DE EGRESO 5",
]);

const CAMPOS_CATALOGO_CRITICO = new Set<string>([
  "PANEL 1",
  "PANEL 2",
  "PANEL 3",
  "TIPO DE SHOCK",
  "QUE TIPO DE AMINA",
  "QUE TIPO DE AMINA 2",
  "QUE TIPO DE SEDANTE 1",
  "QUE TIPO DE SEDANTE 2",
  "QUE TIPO DE OPIODE 1",
  "QUE TIPO DE OPIODE 2",
  "QUE TIPO DE RELAJANTE",
  "TIPO DE ANTIBIOTICO 1",
  "TIPO DE ANTIBIOTICO 2",
  "TIPO DE ANTIBIOTICO 3",
  "MICROORGANISMO (PANEL 1)",
  "MICROORGANISMO (PANEL 2)",
  "MICROORGANISMO (PANEL 3)",
  "MICROORGANISMO 1",
  "MICROORGANISMO 2",
  "MICROORGANISMO 3",
  "MICROORGANISMO 4",
]);

const ETIQUETAS_VISIBLES: Record<string, string> = {
  REGISTRO: "Expediente clínico",
};

const MESES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

function slug(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function inferirTipo(label: string): Pick<CampoMatrizCuidadosCriticos, "tipo" | "opciones"> {
  if (label === "ESPECIALIDAD") return { tipo: "servicioCritico" };
  if (label === "SERVICIO PROVENIENTE") return { tipo: "servicioHospitalario" };
  if (CAMPOS_DIAGNOSTICO_CIE10.has(label)) return { tipo: "cie10" };
  if (CAMPOS_CATALOGO_CRITICO.has(label)) return { tipo: "catalogoCritico" };
  if (CAMPOS_SI_NO.has(label) || label.includes("MULTIRESISTENTE: SI/NO")) return { tipo: "yesno" };
  if (CAMPOS_NUMERICOS.has(label)) return { tipo: "number" };
  if (label.startsWith("FECHA")) return { tipo: "date" };
  if (label.startsWith("HORA")) return { tipo: "time" };
  if (CAMPOS_TEXTO_LARGO.has(label)) return { tipo: "textarea" };
  if (label === "MES") return { tipo: "select", opciones: MESES };
  if (label === "SEXO") return { tipo: "select", opciones: ["Femenino", "Masculino", "Otro"] };
  if (label === "ALTA") return { tipo: "select", opciones: ["ALTA", "TRASLADO", "FALLECIDO", "FUGA", "OTRO"] };
  return { tipo: "text" };
}

function construirCampos(labels: string[], solo?: TipoMedicoCuidadosCriticos): CampoMatrizCuidadosCriticos[] {
  const repeticiones = new Map<string, number>();
  return labels.map(label => {
    const base = slug(label);
    const numero = (repeticiones.get(base) ?? 0) + 1;
    repeticiones.set(base, numero);
    const key = numero === 1 ? base : `${base}_${numero}`;
    return {
      key,
      label: ETIQUETAS_VISIBLES[label] ?? label,
      ...inferirTipo(label),
      solo,
      automatico: ["REGISTRO", "NOMBRES", "APELLIDOS", "SEXO", "EDAD", "CENTRO DE PROCEDENCIA", "DIAS EN SERVICIO", "MUERTE > 48 HORAS"].includes(label),
    };
  });
}

export const GRUPOS_MATRIZ_CUIDADOS_CRITICOS: GrupoMatrizCuidadosCriticos[] = [
  {
    id: "ingreso",
    titulo: "1. Identificación, ingreso, egreso y escalas",
    descripcion: "Datos generales del ingreso, diagnósticos y escalas pronósticas.",
    campos: construirCampos([
      "MES",
      "ESPECIALIDAD",
      "REGISTRO",
      "NOMBRES",
      "APELLIDOS",
      "SEXO",
      "EDAD",
      "CENTRO DE PROCEDENCIA",
      "SERVICIO PROVENIENTE",
      "DIAS EN SERVICIO PROVENIENTE",
      "FECHA INGRESO AL SERVICIO",
      "HORA INGRESO AL SERVICIO",
      "REINGRESO ≤ 72 HORAS",
      "FECHA EGRESO DEL SERVICIO",
      "DIAS EN SERVICIO",
      "FECHA DE MUERTE",
      "HORA DE MUERTE",
      "MUERTE > 48 HORAS",
      "ALTA",
      "DIAGNOSTICOS DE INGRESO 1",
      "DIAGNOSTICOS DE INGRESO 2",
      "DIAGNOSTICOS DE INGRESO 3",
      "DIAGNOSTICOS DE INGRESO 4",
      "DIAGNOSTICOS DE INGRESO 5",
      "DIAGNOSTICO DE EGRESO 1",
      "DIAGNOSTICO DE EGRESO 2",
      "DIAGNOSTICO DE EGRESO 3",
      "DIAGNOSTICO DE EGRESO 4",
      "DIAGNOSTICO DE EGRESO 5",
      "APACHE II INGRESO",
      "MORTALIDAD II (%)",
      "APACHE IV",
      "MORTALIDAD IV (%)",
      "DIAS PROBABLES DE INGRESO",
      "SOFA",
      "MORTALIDAD (%)",
    ]),
  },
  {
    id: "soporte",
    titulo: "2. Intervenciones, dispositivos y ventilación",
    descripcion: "Procedimientos quirúrgicos, catéteres, sondas y soporte ventilatorio.",
    campos: construirCampos([
      "INTERVENCION QX",
      "REINTERVENCION QX",
      "INTERVENCION PREVIO UCI",
      "COLOCACION CVC ANTES DE UCI",
      "COLOCACION CVC EN UCI",
      "COMPLICACIONES POR COLOCACION CVC",
      "CAMBIO CATETER CVC",
      "CANTIDAD DE CAMBIOS",
      "RETIRO ACCIDENTAL DE CVC",
      "COLOC. SNG EN UCI",
      "CAMBIO SNG",
      "RETIRO ACCIDENTAL DE SNG",
      "COLOC. STU PREVIO UCI",
      "COLOC. STU EN UCI",
      "CAMBIO STU EN UCI",
      "RETIRO ACCIDENTAL STU",
      "INTUBACIÓN EN CENTRO REFERENTE",
      "INTUBACION EN UCI",
      "EXTUBACION PROGRAMADA FALLIDA",
      "REINTUBACION",
      "VNI (DIAS)",
      "VMI (DIAS)",
      "COMPLICACIONES PLEURO/PULMONARES POR VM",
    ]),
  },
  {
    id: "infecciones",
    titulo: "3. Infecciones, cultivos y tratamiento",
    descripcion: "IAAS, microorganismos, shock, sedación, aminas y antibióticos.",
    campos: construirCampos([
      "NEUMONIA NOSOCOM",
      "NEUM. ASOCI. A VM",
      "IVU ASOCIADA A STU",
      "INFECCION SITIO CVC",
      "OTRAS INFECCIONES UCI",
      "DIAS APARICION IAAS POST INGRESO A UCI",
      "PANEL 1",
      "PANEL 2",
      "PANEL 3",
      "MICROORGANISMO (PANEL 1)",
      "MICROORGANISMO (PANEL 2)",
      "MICROORGANISMO (PANEL 3)",
      "CULTIVO (+) (PEDIR A LAB)",
      "MICROORGANISMO 1",
      "SITIO DE AISLAMIENTO",
      "MULTIRESISTENTE: SI/NO",
      "FECHA DE REPORTE",
      "MICROORGANISMO 2",
      "SITIO DE AISLAMIENTO",
      "MULTIRESISTENTE: SI/NO",
      "FECHA DE REPORTE",
      "MICROORGANISMO 3",
      "SITIO DE AISLAMIENTO",
      "MULTIRESISTENTE: SI/NO",
      "FECHA DE REPORTE",
      "MICROORGANISMO 4",
      "SITIO DE AISLAMIENTO",
      "MULTIRESISTENTE: SI/NO",
      "FECHA DE REPORTE",
      "PRESENTÓ SHOCK SI/NO",
      "TIPO DE SHOCK",
      "SE USO AMINAS SI/NO",
      "QUE TIPO DE AMINA",
      "CUANTOS DÍAS UTILIZO AMINAS",
      "QUE TIPO DE AMINA 2",
      "CUANTOS DÍAS UTILIZO AMINAS",
      "SE UTILIZÓ COLOIDE SI/NO",
      "SE NECESITO SEDACION SI/NO",
      "QUE TIPO DE SEDANTE 1",
      "QUE TIPO DE SEDANTE 2",
      "SE NECESITO OPIODE SI/NO",
      "QUE TIPO DE OPIODE 1",
      "QUE TIPO DE OPIODE 2",
      "SE NECESITO RELAJANTE SI/NO",
      "QUE TIPO DE RELAJANTE",
      "TIPO DE ANTIBIOTICO 1",
      "TIPO DE ANTIBIOTICO 2",
      "TIPO DE ANTIBIOTICO 3",
      "DIAS DE ANTIBIOTICO 1",
      "DIAS DE ANTIBIOTICO 2",
      "DIAS DE ANTIBIOTICO 3",
    ]),
  },
  {
    id: "resultados",
    titulo: "4. Estudios, procedimientos, eventos y resultados",
    descripcion: "Estudios, transfusiones, procedimientos, eventos adversos y condiciones de alta.",
    campos: [
      ...construirCampos([
        "TAC CEREBRAL (CANTIDAD DE ESTUDIOS)",
        "TAC TORAX (CANTIDAD DE ESTUDIOS)",
        "TAC ABD. (CANTIDAD DE ESTUDIOS)",
        "TAC CERVICAL (CANTIDAD DE ESTUDIOS)",
        "TAC DE COLUMNA (CANTIDAD DE ESTUDIOS)",
        "TAC OTROS (CANTIDAD DE ESTUDIOS)",
        "RESONANCIA",
        "ECO HECHO POR UCI (CANTIDADES)",
        "USG RENAL EN UCI (CANTIDADES)",
        "USG ABD EN UCI (CANTIDADES)",
        "USG TEJ. BLAN POR UCI (CANTIDADES)",
        "ECO VNO POR UCI (CANTIDADES)",
        "DOPPLER CEREBRAL POR UCI (CANTIDADES)",
        "DOPLER MIS POR UCI (CANTIDADES)",
        "TRANS. GR",
        "T.PLASMA",
        "T. PLAQUETAS",
        "FISIOTERAPIA",
        "COLOCACION CVC GUIADA POR USG (CANTIDAD)",
        "COLOCACION CATETER 2 (CANTIDAD)",
        "COLOCACION CATETER 3 (CANTIDAD)",
        "TRAQUEOSTOMÍA PERCUTANEA",
        "RETIRO ACCIDENTAL TRAQUEOSTOMIA",
        "FBB POR UCI (CANTIDAD)",
        "COLOCACION TT",
        "DIAS CON TT",
        "PERICARDIOCENTESIS",
        "TORACOCENTESIS",
        "PARACENTESIS",
        "CAIDAS DE CAMA",
        "PACIENTE AMERITO INGRESO A UCI Y NO FUE ADMITIDO OPORTUNAMENTE",
        "LESION GRAVE POR STU",
        "ULCERAS POR DECUBITO PREVIO INGRESO A UCI",
        "ULCERAS PPOR DECUBITO DESARROLLADAS EN UCI",
        "REGION",
        "AUTOEXTUBACION",
        "EXTUBACION ACCIDENTAL",
        "EXTUBACION EXITOSA",
        "FECHA DE EXTUBACION",
        "PACIENTE CON GASTROSTOMIA",
        "RETIRO ACCIDENTAL GASTROSTOMIA",
        "SEPARACION DE LA VENTILACION",
      ]),
      ...construirCampos([
        "EEG",
        "ENDOSCOPIA",
        "COLONOSCOPIA",
        "GRADO DE ULCERA",
        "ALTA CON ULCERA",
        "ALTA DECANULADO",
        "ALTA CON TRAQUEOSTOMIA",
        "PACIENTE EN PROGRAMA",
        "ALTA CON GASTROSTOMIA",
      ], "ucin"),
    ],
  },
];

export function camposMatrizPorTipo(tipo: TipoMedicoCuidadosCriticos) {
  return GRUPOS_MATRIZ_CUIDADOS_CRITICOS.flatMap(grupo => grupo.campos).filter(campo => tipo === "uci_ucin" || !campo.solo || campo.solo === tipo);
}

export function gruposMatrizPorTipo(tipo: TipoMedicoCuidadosCriticos) {
  return GRUPOS_MATRIZ_CUIDADOS_CRITICOS.map(grupo => ({
    ...grupo,
    campos: grupo.campos.filter(campo => tipo === "uci_ucin" || !campo.solo || campo.solo === tipo),
  }));
}

export function esValorRegistrado(value: unknown) {
  const texto = valorComoTexto(value).trim();
  return texto !== "" && texto !== VALOR_NO_REGISTRADO;
}

function fechaComoInput(value: unknown) {
  if (!value) return "";
  const date = (value as { toDate?: () => Date }).toDate?.() ?? new Date(value as string);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function horaComoInput(value: unknown) {
  if (!value) return "";
  const date = (value as { toDate?: () => Date }).toDate?.() ?? new Date(value as string);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function calcularEdad(value: unknown) {
  if (!value) return "";
  const nacimiento = (value as { toDate?: () => Date }).toDate?.() ?? new Date(value as string);
  if (Number.isNaN(nacimiento.getTime())) return "";
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;
  return edad;
}

function mesActual() {
  return MESES[new Date().getMonth()];
}

export function datosAutomaticosPaciente(paciente: Paciente): DatosMatrizCuidadosCriticos {
  const sexo = paciente.genero === "femenino" ? "Femenino" : paciente.genero === "masculino" ? "Masculino" : "Otro";
  const fallecido = paciente.estado === "alta_fallecido";

  return {
    mes: mesActual(),
    registro: paciente.expediente,
    nombres: paciente.nombres,
    apellidos: paciente.apellidos,
    sexo,
    edad: calcularEdad(paciente.fechaNacimiento),
    centro_de_procedencia: paciente.establecimientoProcedencia ?? "",
    ...(fallecido ? {
      fecha_de_muerte: fechaComoInput(paciente.fechaEgreso),
      hora_de_muerte: horaComoInput(paciente.fechaEgreso),
      alta: "FALLECIDO",
    } : {}),
  };
}

export function camposBloqueadosPorPaciente(paciente: Paciente) {
  return paciente.estado === "alta_fallecido"
    ? new Set(["fecha_de_muerte", "hora_de_muerte", "alta"])
    : new Set<string>();
}

function diferenciaDias(desde: string, hasta: string) {
  const inicio = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin < inicio) return "";
  return Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1;
}

export function aplicarCalculosBasicos(datos: DatosMatrizCuidadosCriticos): DatosMatrizCuidadosCriticos {
  const resultado = { ...datos };
  const ingreso = esValorRegistrado(resultado.fecha_ingreso_al_servicio) ? valorComoTexto(resultado.fecha_ingreso_al_servicio) : "";
  const egreso = esValorRegistrado(resultado.fecha_egreso_del_servicio) ? valorComoTexto(resultado.fecha_egreso_del_servicio) : "";
  const muerte = esValorRegistrado(resultado.fecha_de_muerte) ? valorComoTexto(resultado.fecha_de_muerte) : "";
  const horaIngreso = esValorRegistrado(resultado.hora_ingreso_al_servicio) ? valorComoTexto(resultado.hora_ingreso_al_servicio) : "";
  const horaMuerte = esValorRegistrado(resultado.hora_de_muerte) ? valorComoTexto(resultado.hora_de_muerte) : "";

  resultado.dias_en_servicio = ingreso ? diferenciaDias(ingreso, egreso || fechaActualInput()) : "";
  if (ingreso && horaIngreso && muerte && horaMuerte) {
    const fechaIngreso = new Date(`${ingreso}T${horaIngreso}:00`);
    const fechaMuerte = new Date(`${muerte}T${horaMuerte}:00`);
    resultado.muerte_48_horas = fechaMuerte.getTime() - fechaIngreso.getTime() > 172_800_000 ? "SI" : "NO";
  } else {
    resultado.muerte_48_horas = "";
  }

  return resultado;
}

function fechaActualInput() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

export function aplicarValoresPorDefectoMatriz(datos: DatosMatrizCuidadosCriticos, tipo: TipoMedicoCuidadosCriticos): DatosMatrizCuidadosCriticos {
  const resultado = { ...datos };
  for (const campo of camposMatrizPorTipo(tipo)) {
    if (esValorRegistrado(resultado[campo.key])) continue;
    resultado[campo.key] = campo.tipo === "number" ? 0 : VALOR_NO_REGISTRADO;
  }
  return resultado;
}

export function camposPendientesCierreCuidadosCriticos(datos?: DatosMatrizCuidadosCriticos) {
  const pendientes = ["fecha_egreso_del_servicio", "alta"].filter(key => !esValorRegistrado(datos?.[key]));
  const alta = valorComoTexto(datos?.alta).trim().toUpperCase();
  if (alta === "FALLECIDO") {
    if (!esValorRegistrado(datos?.fecha_de_muerte)) pendientes.push("fecha_de_muerte");
    if (!esValorRegistrado(datos?.hora_de_muerte)) pendientes.push("hora_de_muerte");
  }
  return pendientes.map(key => ({ key, label: LABELS_CIERRE_CUIDADOS_CRITICOS[key] ?? key }));
}

export function fichaPendienteCierreCuidadosCriticos(ficha: FichaCuidadosCriticos) {
  return camposPendientesCierreCuidadosCriticos(ficha.datos).length > 0;
}

export function valorComoTexto(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}
