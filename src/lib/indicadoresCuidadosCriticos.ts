import type { ConfigIndicadoresCuidadosCriticos, FichaCuidadosCriticos, TipoMedicoCuidadosCriticos } from "@/types";
import { esValorRegistrado, valorComoTexto } from "@/lib/matrizCuidadosCriticos";

export const MESES_INDICADORES = [
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
] as const;

export const DIAS_HABILES_OFICIALES_POR_ANIO: Record<number, number[]> = {
  // Horas Laborales 2026 - Oficial.pdf, tabla de personal operativo.
  2026: [21, 20, 22, 21, 20, 21, 23, 19, 21, 22, 20, 22],
};

export type EstadoIndicadorCuidadosCriticos = "calculado" | "sin_configuracion" | "sin_denominador" | "pendiente_formula";

export interface IndicadorCuidadosCriticos {
  id: number;
  nombre: string;
  formato: "numero" | "porcentaje" | "tasa";
  valor: number | null;
  numerador?: number;
  denominador?: number;
  estado: EstadoIndicadorCuidadosCriticos;
  nota?: string;
}

export const FORMULAS_INDICADORES: Record<number, string> = {
  1: "Total de egresos / Numero de camas asignadas",
  2: "Dias cama ocupados / Dias cama disponibles x 100",
  3: "Dias estancia de pacientes egresados / Total de egresos",
  4: "(Dias cama disponibles - Dias cama ocupados) / Total de egresos",
  5: "Reingresos a UCI <= 72 horas / Total de pacientes ingresados en UCI x 100",
  6: "Egresos con ulcera por presion / Total de egresos x 100",
  7: "Pacientes reintubados precozmente / Total de pacientes extubados x 100",
  8: "Pacientes con extubacion exitosa / Total de pacientes extubados x 100",
  9: "Pacientes con extubacion fallida / Total de pacientes extubados x 100",
  10: "Pacientes evaluados con escala de severidad / Total de pacientes ingresados en UCI x 100",
  11: "Pacientes con extubacion accidental / Total de pacientes con VM x 100",
  12: "Complicaciones pleuro/pulmonares por CVC / Total de pacientes con CVC x 100",
  13: "Infecciones asociadas a CVC / Total de pacientes con CVC x 100",
  14: "Retiros accidentales de CVC / Total de pacientes con CVC x 100",
  15: "Complicaciones pleuro/pulmonares por VM / Total de pacientes con VM x 100",
  16: "Neumonias asociadas a VM / Total de pacientes con VM x 100",
  17: "Infecciones asociadas a la atencion sanitaria / Total de egresos x 100",
  18: "Caidas de pacientes / Dias cama ocupados x 1,000",
  19: "Infecciones asociadas a STU / Total de pacientes con STU x 100",
  20: "Retiros accidentales de STU / Total de pacientes con STU x 100",
  21: "Retiros accidentales de SNG / Total de pacientes con SNG x 100",
  22: "Retiros accidentales de traqueostomia / Total de pacientes con traqueostomia x 100",
  23: "Retiros accidentales de gastrostomia / Total de pacientes con gastrostomia x 100",
  24: "Pacientes no admitidos oportunamente / (Pacientes ingresados + Pacientes no admitidos oportunamente) x 100",
  25: "Muertes hospitalarias del servicio / Total de egresos x 100",
  26: "Muertes hospitalarias despues de 48 horas / Total de egresos x 100",
  27: "Muertes observadas / Muertes esperadas segun MORTALIDAD II",
  28: "Muertes de pacientes con VM egresados en el mes / Pacientes con VM egresados en el mes x 100",
  29: "Muertes asociadas a neumonia / Egresos por neumonia x 100",
  30: "Neumonias asociadas a VM / Total de egresos x 100",
  31: "Muertes asociadas a COVID-19 / Egresos por COVID-19 x 100",
  32: "Episodios de neumonia asociada a VM / Dias de ventilacion mecanica invasiva x 1,000",
  33: "Muertes asociadas a diarrea / Egresos por diarrea x 100",
  34: "Muertes asociadas a enfermedad renal / Egresos por enfermedad renal x 100",
  35: "Muertes asociadas a diabetes mellitus / Egresos por diabetes mellitus x 100",
  36: "Muertes asociadas a trastornos hipertensivos / Egresos por trastornos hipertensivos x 100",
};

export interface DatoBaseCuidadosCriticos {
  descriptor: string;
  valores: Array<number | string>;
  nota?: string;
}

interface ParametrosIndicadores {
  anio: number;
  mes: number;
  servicio: string;
  tipo?: TipoMedicoCuidadosCriticos | "todos";
  config?: ConfigIndicadoresCuidadosCriticos | null;
}

interface ParametrosDatosBase {
  anio: number;
  servicio: string;
  tipo?: TipoMedicoCuidadosCriticos | "todos";
  camasAsignadas: number;
  configs?: ConfigIndicadoresCuidadosCriticos[];
}

type DatosFicha = FichaCuidadosCriticos["datos"];

interface ConteosMensuales {
  totalEgresos: number;
  totalIngresos: number;
  diasEstancia: number;
  diasCamaOcupados: number;
  diasCamaDisponibles: number;
  reingresos: number;
  egresosUlcera: number;
  reintubados: number;
  extubados: number;
  extubacionExitosa: number;
  extubacionFallida: number;
  pacientesEscala: number;
  extubacionAccidental: number;
  pacientesVm: number;
  pacientesVmEgresados: number;
  complicacionesCvc: number;
  pacientesCvc: number;
  infeccionesCvc: number;
  retirosCvc: number;
  complicacionesVm: number;
  neumoniaVm: number;
  iaas: number;
  caidas: number;
  pacientesStu: number;
  infeccionesStu: number;
  retirosStu: number;
  pacientesSng: number;
  retirosSng: number;
  pacientesTraqueostomia: number;
  retirosTraqueostomia: number;
  pacientesGastrostomia: number;
  retirosGastrostomia: number;
  noAdmitidos: number;
  fallecidos: number;
  fallecidos48: number;
  esperadoApache: number;
  muertesVm: number;
  neumonia: { egresos: number; muertes: number };
  covid: { egresos: number; muertes: number };
  diarrea: { egresos: number; muertes: number };
  renal: { egresos: number; muertes: number };
  diabetes: { egresos: number; muertes: number };
  hipertension: { egresos: number; muertes: number };
  episodiosNavm: number;
  diasVmi: number;
}

const INDICADORES_BASE = [
  "Giro Cama",
  "Porcentaje de ocupacion",
  "Promedio de dias estancias",
  "Indice de sustitucion",
  "Porcentaje de reingreso de pacientes a la UCI <= a 72 horas",
  "Porcentaje de pacientes con ulceras por presion en UCI",
  "Porcentaje Re-intubacion precoz de paciente con ventilacion mecanica en la UCI.",
  "Porcentaje de extubaciones exitosas",
  "Porcentaje de extubaciones fallidas",
  "Porcentaje de pacientes segun condicion de severidad de la enfermedad al ingreso en UCI.",
  "Porcentaje de extubacion accidental en pacientes con ventilacion mecanica en UCI.",
  "Porcentaje de complicaciones pleuro/pulmonares secundarios a colocacion de CVC",
  "Porcentaje de infecciones asociadas a CVC",
  "Porcentaje de retiros accidentales de CVC",
  "Porcentaje de complicaciones pleuro/pulmonares secundarios a colocacion de VM",
  "Porcentaje de Neumonias asociadas a VM",
  "Tasa de infecciones asociadas a la atencion sanitaria",
  "Incidencia de caidas de pacientes",
  "Porcentaje de infecciones asociadas a STU",
  "Porcentaje de retiros accidentales de STU",
  "Porcentaje de retiros accidentales de SNG",
  "Porcentaje de retiros accidentales de Traqueostomias",
  "Porcentaje de retiros accidentales de Gastrostomia",
  "Demanda insatisfecha en UCI",
  "Tasa bruta de mortalidad del Servicio",
  "Tasa neta de mortalidad del Servicio",
  "Indice estandarizado de Mortalidad",
  "Tasa de letalidad de pacientes con VM",
  "Tasa de letalidad por neumonia",
  "Tasa de incidencia de neumonia asociada a IASS",
  "Tasa de letalidad por COVID-19 (Sospechoso, Confirmado)",
  "Tasa de Neumonia asociada a ventilacion mecanica en UCI.",
  "Tasa de letalidad por diarrea",
  "Tasa de letalidad por ERC",
  "Tasa de letalidad por Diabetes Mellitus",
  "Tasa de letalidad por Trastornos Hipertensivos",
] as const;

export function configIndicadoresId(anio: number, mes: number, servicio: string) {
  const servicioKey = servicio
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `${anio}-${String(mes).padStart(2, "0")}-${servicioKey}`;
}

export function configDiasHabilesIndicadoresId(anio: number, mes: number) {
  return `${anio}-${String(mes).padStart(2, "0")}-dias_habiles`;
}

export function diasHabilesOficiales(anio: number, mes: number) {
  return DIAS_HABILES_OFICIALES_POR_ANIO[anio]?.[mes - 1] ?? null;
}

export function calcularIndicadoresCuidadosCriticos(
  fichas: FichaCuidadosCriticos[],
  parametros: ParametrosIndicadores
): IndicadorCuidadosCriticos[] {
  const { anio, mes, servicio, tipo, config } = parametros;
  const camas = numeroConfig(config?.camasAsignadas);
  const diasHabiles = numeroConfig(config?.diasHabiles);
  const faltaConfig = !camas || !diasHabiles;
  const conteos = conteosMensuales(fichas, { anio, mes, servicio, tipo, camasAsignadas: camas });

  return [
    indicador(1, razon(conteos.totalEgresos, camas), conteos.totalEgresos, camas, faltaConfig ? "sin_configuracion" : undefined),
    indicador(2, porcentaje(conteos.diasCamaOcupados, conteos.diasCamaDisponibles), conteos.diasCamaOcupados, conteos.diasCamaDisponibles, faltaConfig ? "sin_configuracion" : undefined),
    indicador(3, razon(conteos.diasEstancia, conteos.totalEgresos), conteos.diasEstancia, conteos.totalEgresos),
    indicador(4, razon(conteos.diasCamaDisponibles - conteos.diasCamaOcupados, conteos.totalEgresos), conteos.diasCamaDisponibles - conteos.diasCamaOcupados, conteos.totalEgresos, faltaConfig ? "sin_configuracion" : undefined),
    indicador(5, porcentaje(conteos.reingresos, conteos.totalIngresos), conteos.reingresos, conteos.totalIngresos),
    indicador(6, porcentaje(conteos.egresosUlcera, conteos.totalEgresos), conteos.egresosUlcera, conteos.totalEgresos),
    indicador(7, porcentaje(conteos.reintubados, conteos.extubados), conteos.reintubados, conteos.extubados),
    indicador(8, porcentaje(conteos.extubacionExitosa, conteos.extubados), conteos.extubacionExitosa, conteos.extubados),
    indicador(9, porcentaje(conteos.extubacionFallida, conteos.extubados), conteos.extubacionFallida, conteos.extubados),
    indicador(10, porcentaje(conteos.pacientesEscala, conteos.totalIngresos), conteos.pacientesEscala, conteos.totalIngresos),
    indicador(11, porcentaje(conteos.extubacionAccidental, conteos.pacientesVm), conteos.extubacionAccidental, conteos.pacientesVm),
    indicador(12, porcentaje(conteos.complicacionesCvc, conteos.pacientesCvc), conteos.complicacionesCvc, conteos.pacientesCvc),
    indicador(13, porcentaje(conteos.infeccionesCvc, conteos.pacientesCvc), conteos.infeccionesCvc, conteos.pacientesCvc),
    indicador(14, porcentaje(conteos.retirosCvc, conteos.pacientesCvc), conteos.retirosCvc, conteos.pacientesCvc),
    indicador(15, porcentaje(conteos.complicacionesVm, conteos.pacientesVm), conteos.complicacionesVm, conteos.pacientesVm),
    indicador(16, porcentaje(conteos.neumoniaVm, conteos.pacientesVm), conteos.neumoniaVm, conteos.pacientesVm),
    indicador(17, porcentaje(conteos.iaas, conteos.totalEgresos), conteos.iaas, conteos.totalEgresos),
    indicador(18, tasa(conteos.caidas, conteos.diasCamaOcupados, 1000), conteos.caidas, conteos.diasCamaOcupados),
    indicador(19, porcentaje(conteos.infeccionesStu, conteos.pacientesStu), conteos.infeccionesStu, conteos.pacientesStu),
    indicador(20, porcentaje(conteos.retirosStu, conteos.pacientesStu), conteos.retirosStu, conteos.pacientesStu),
    indicador(21, porcentaje(conteos.retirosSng, conteos.pacientesSng), conteos.retirosSng, conteos.pacientesSng),
    indicador(22, porcentaje(conteos.retirosTraqueostomia, conteos.pacientesTraqueostomia), conteos.retirosTraqueostomia, conteos.pacientesTraqueostomia),
    indicador(23, porcentaje(conteos.retirosGastrostomia, conteos.pacientesGastrostomia), conteos.retirosGastrostomia, conteos.pacientesGastrostomia),
    indicador(24, porcentaje(conteos.noAdmitidos, conteos.totalIngresos + conteos.noAdmitidos), conteos.noAdmitidos, conteos.totalIngresos + conteos.noAdmitidos),
    indicador(25, porcentaje(conteos.fallecidos, conteos.totalEgresos), conteos.fallecidos, conteos.totalEgresos),
    indicador(26, porcentaje(conteos.fallecidos48, conteos.totalEgresos), conteos.fallecidos48, conteos.totalEgresos),
    indicador(27, conteos.esperadoApache > 0 ? razon(conteos.fallecidos, conteos.esperadoApache) : null, conteos.fallecidos, conteos.esperadoApache),
    indicador(28, porcentaje(conteos.muertesVm, conteos.pacientesVmEgresados), conteos.muertesVm, conteos.pacientesVmEgresados),
    indicador(29, porcentaje(conteos.neumonia.muertes, conteos.neumonia.egresos), conteos.neumonia.muertes, conteos.neumonia.egresos),
    indicador(30, porcentaje(conteos.neumoniaVm, conteos.totalEgresos), conteos.neumoniaVm, conteos.totalEgresos),
    indicador(31, porcentaje(conteos.covid.muertes, conteos.covid.egresos), conteos.covid.muertes, conteos.covid.egresos),
    indicador(32, tasa(conteos.episodiosNavm, conteos.diasVmi, 1000), conteos.episodiosNavm, conteos.diasVmi),
    indicador(33, porcentaje(conteos.diarrea.muertes, conteos.diarrea.egresos), conteos.diarrea.muertes, conteos.diarrea.egresos),
    indicador(34, porcentaje(conteos.renal.muertes, conteos.renal.egresos), conteos.renal.muertes, conteos.renal.egresos),
    indicador(35, porcentaje(conteos.diabetes.muertes, conteos.diabetes.egresos), conteos.diabetes.muertes, conteos.diabetes.egresos),
    indicador(36, porcentaje(conteos.hipertension.muertes, conteos.hipertension.egresos), conteos.hipertension.muertes, conteos.hipertension.egresos),
  ];
}

export function calcularDatosBaseCuidadosCriticos(
  fichas: FichaCuidadosCriticos[],
  parametros: ParametrosDatosBase
): DatoBaseCuidadosCriticos[] {
  const { anio, servicio, tipo, camasAsignadas, configs = [] } = parametros;
  const meses = MESES_INDICADORES.map((_, index) => index + 1);
  const conteos = meses.map(mes => conteosMensuales(fichas, { anio, mes, servicio, tipo, camasAsignadas }));
  const diasPeriodo = meses.map(mes => new Date(anio, mes, 0).getDate());
  const diasHabiles = meses.map(mes => diasHabilesOficiales(anio, mes) ?? configs.find(item => item.anio === anio && item.mes === mes && item.servicio === "__periodo__")?.diasHabiles ?? "-");
  const row = (descriptor: string, valores: Array<number | string>, nota?: string): DatoBaseCuidadosCriticos => ({ descriptor, valores, nota });

  return [
    row("Total de dias del periodo", diasPeriodo),
    row("Total de dias habiles del periodo", diasHabiles),
    row("Total de egresos", conteos.map(item => item.totalEgresos)),
    row("Numero de camas asignadas", meses.map(() => camasAsignadas)),
    row("Dias estancia de los pacientes egresados", conteos.map(item => item.diasEstancia)),
    row("Dias cama ocupados de los pacientes egresados", conteos.map(item => item.diasCamaOcupados)),
    row("Dias cama disponibles del servicio", conteos.map(item => item.diasCamaDisponibles)),
    row("Total reingresos a UCI <= 72 hrs", conteos.map(item => item.reingresos)),
    row("Total de pacientes ingresados en UCI", conteos.map(item => item.totalIngresos)),
    row("Total de egresos de UCI con diagnostico ulcera por presion", conteos.map(item => item.egresosUlcera)),
    row("Total de pacientes re-intubados dentro de las 48 horas despues de la extubacion", conteos.map(item => item.reintubados)),
    row("Total de pacientes extubados", conteos.map(item => item.extubados)),
    row("Total de pacientes con extubacion exitosa", conteos.map(item => item.extubacionExitosa)),
    row("Total de pacientes con extubacion fallida", conteos.map(item => item.extubacionFallida)),
    row("Total de pacientes criticos evaluados con alguna escala de severidad al ingreso en UCI", conteos.map(item => item.pacientesEscala)),
    row("Total de pacientes con extubacion accidental en UCI", conteos.map(item => item.extubacionAccidental)),
    row("Total de pacientes con VM", conteos.map(item => item.pacientesVm)),
    row("Total de pacientes con complicaciones pleuro/pulmonares producidos por CVC", conteos.map(item => item.complicacionesCvc)),
    row("Total de pacientes con CVC", conteos.map(item => item.pacientesCvc)),
    row("Total de infecciones asociadas a CVC", conteos.map(item => item.infeccionesCvc)),
    row("Total de casos de retiro accidental de CVC", conteos.map(item => item.retirosCvc)),
    row("Total de pacientes con complicaciones pleuro/pulmonares producidos por VM (neumotorax iatrogenico)", conteos.map(item => item.complicacionesVm)),
    row("Total de pacientes con Neumonia asociada a VM", conteos.map(item => item.neumoniaVm)),
    row("Total de pacientes con infeccion asociada a la atencion sanitaria", conteos.map(item => item.iaas)),
    row("Total de caidas de cama en el Servicio", conteos.map(item => item.caidas)),
    row("Total de pacientes con STU", conteos.map(item => item.pacientesStu)),
    row("Total de infecciones asociadas a STU", conteos.map(item => item.infeccionesStu)),
    row("Total de retiros accidentales de STU", conteos.map(item => item.retirosStu)),
    row("Total de pacientes con SNG", conteos.map(item => item.pacientesSng)),
    row("Total de retiros accidentales de SNG", conteos.map(item => item.retirosSng)),
    row("Total de pacientes con Traqueostomias", conteos.map(item => item.pacientesTraqueostomia)),
    row("Total de retiros accidentales de Traqueostomias", conteos.map(item => item.retirosTraqueostomia)),
    row("Total de pacientes con gastrostomia", conteos.map(item => item.pacientesGastrostomia)),
    row("Total de retiros accidentales de Gastrostomia", conteos.map(item => item.retirosGastrostomia)),
    row("Total de pacientes que ameritan ingreso a UCI y no fueron admitidos oportunamente", conteos.map(item => item.noAdmitidos)),
    row("Total de pacientes ingresados + no admitidos a UCI", conteos.map(item => item.totalIngresos + item.noAdmitidos)),
    row("N. muertes hospitalarias del Servicio", conteos.map(item => item.fallecidos)),
    row("N. muertes hospitalarias despues de 48 horas de estancia en el Servicio", conteos.map(item => item.fallecidos48)),
    row("N. de muertes hospitalarias esperadas de acuerdo a escala de severidad de pacientes", conteos.map(item => numeroVista(item.esperadoApache))),
    row("N. de muertes con VM", conteos.map(item => item.muertesVm)),
    row("N. muertes asociadas a Neumonia (Diagnostico principal o secundario)", conteos.map(item => item.neumonia.muertes)),
    row("N. egresos por Neumonia (Diagnostico principal o secundario)", conteos.map(item => item.neumonia.egresos)),
    row("N. de Neumonias asociadas a IASS", conteos.map(item => item.neumoniaVm)),
    row("N. muertes asociadas a COVID-19 (Diagnostico principal o secundario)", conteos.map(item => item.covid.muertes)),
    row("N. egresos por COVID-19 (Diagnostico principal o secundario)", conteos.map(item => item.covid.egresos)),
    row("N. de episodios de Neumonia Asociada a Ventilacion Mecanica", conteos.map(item => item.episodiosNavm)),
    row("Total de dias de ventilacion mecanica invasiva", conteos.map(item => item.diasVmi)),
    row("N. muertes asociadas a Diarrea (Diagnostico principal o secundario)", conteos.map(item => item.diarrea.muertes)),
    row("N. egresos por Diarrea (Diagnostico principal o secundario)", conteos.map(item => item.diarrea.egresos)),
    row("N. muertes asociadas a Enfermedad Renal (Diagnostico principal o secundario)", conteos.map(item => item.renal.muertes)),
    row("N. egresos por Enfermedad Renal (Diagnostico principal o secundario)", conteos.map(item => item.renal.egresos)),
    row("N. muertes asociadas a Diabetes Mellitus (Diagnostico principal o secundario)", conteos.map(item => item.diabetes.muertes)),
    row("N. egresos por Diabetes Mellitus (Diagnostico principal o secundario)", conteos.map(item => item.diabetes.egresos)),
    row("N. muertes asociadas a Hipertension Arterial (Diagnostico principal o secundario)", conteos.map(item => item.hipertension.muertes)),
    row("N. egresos por Hipertension Arterial (Diagnostico principal o secundario)", conteos.map(item => item.hipertension.egresos)),
  ];
}

function indicador(
  id: number,
  valor: number | null,
  numerador?: number,
  denominador?: number,
  estado?: EstadoIndicadorCuidadosCriticos,
  nota?: string
): IndicadorCuidadosCriticos {
  const formato = id === 18 || id === 32 ? "tasa" : [1, 3, 4, 27].includes(id) ? "numero" : "porcentaje";
  return {
    id,
    nombre: INDICADORES_BASE[id - 1],
    formato,
    valor,
    numerador,
    denominador,
    estado: estado ?? (valor === null ? "sin_denominador" : "calculado"),
    nota,
  };
}

function conteosMensuales(
  fichas: FichaCuidadosCriticos[],
  parametros: { anio: number; mes: number; servicio: string; tipo?: TipoMedicoCuidadosCriticos | "todos"; camasAsignadas: number }
): ConteosMensuales {
  const { anio, mes, servicio, tipo, camasAsignadas } = parametros;
  const fichasServicio = fichas.filter(ficha => {
    if (servicio !== "todos" && ficha.servicio !== servicio) return false;
    if (tipo && tipo !== "todos" && ficha.tipoUnidad !== tipo) return false;
    return true;
  });
  const fichasIngresoMes = fichasServicio.filter(ficha => fechaEnMes(ficha.datos?.fecha_ingreso_al_servicio, anio, mes));
  const fichasEgresoMes = fichasServicio.filter(ficha => fechaEnMes(ficha.datos?.fecha_egreso_del_servicio, anio, mes));
  const fichasMes = fichasIngresoMes;

  const totalEgresos = fichasEgresoMes.length;
  const totalIngresos = fichasIngresoMes.length;
  const diasEstancia = fichasEgresoMes.reduce((total, ficha) => (
    total + diasEntre(ficha.datos?.fecha_ingreso_al_servicio, ficha.datos?.fecha_egreso_del_servicio)
  ), 0);
  const diasCamaOcupados = fichasServicio.reduce((total, ficha) => (
    total + diasCamaOcupadosEnMes(ficha, anio, mes)
  ), 0);
  const recibioVm = (ficha: FichaCuidadosCriticos) => (
    numero(ficha.datos?.vmi_dias) > 0
    || si(ficha.datos?.intubacion_en_uci)
    || si(ficha.datos?.intubacion_en_centro_referente)
  );
  const pacientesVm = fichasMes.filter(recibioVm).length;
  const fichasEgresoVm = fichasEgresoMes.filter(recibioVm);
  const pacientesCvc = fichasMes.filter(ficha => si(ficha.datos?.colocacion_cvc_antes_de_uci) || si(ficha.datos?.colocacion_cvc_en_uci)).length;
  const pacientesStu = fichasMes.filter(ficha => si(ficha.datos?.coloc_stu_previo_uci) || si(ficha.datos?.coloc_stu_en_uci)).length;

  return {
    totalEgresos,
    totalIngresos,
    diasEstancia,
    diasCamaOcupados,
    diasCamaDisponibles: camasAsignadas * new Date(anio, mes, 0).getDate(),
    reingresos: cuentaSi(fichasMes, "reingreso_72_horas"),
    egresosUlcera: cuentaSi(fichasEgresoMes, "ulceras_ppor_decubito_desarrolladas_en_uci") + cuentaSi(fichasEgresoMes, "alta_con_ulcera"),
    reintubados: cuentaSi(fichasMes, "reintubacion"),
    extubados: cuentaSi(fichasMes, "extubacion_exitosa") + cuentaSi(fichasMes, "extubacion_programada_fallida") + cuentaSi(fichasMes, "extubacion_accidental"),
    extubacionExitosa: cuentaSi(fichasMes, "extubacion_exitosa"),
    extubacionFallida: cuentaSi(fichasMes, "extubacion_programada_fallida"),
    pacientesEscala: fichasMes.filter(ficha => numero(ficha.datos?.apache_ii_ingreso) > 0 || numero(ficha.datos?.apache_iv) > 0 || numero(ficha.datos?.sofa) > 0).length,
    extubacionAccidental: cuentaSi(fichasMes, "extubacion_accidental"),
    pacientesVm,
    pacientesVmEgresados: fichasEgresoVm.length,
    complicacionesCvc: cuentaSi(fichasMes, "complicaciones_por_colocacion_cvc"),
    pacientesCvc,
    infeccionesCvc: cuentaSi(fichasMes, "infeccion_sitio_cvc"),
    retirosCvc: cuentaSi(fichasMes, "retiro_accidental_de_cvc"),
    complicacionesVm: cuentaSi(fichasMes, "complicaciones_pleuro_pulmonares_por_vm"),
    neumoniaVm: cuentaSi(fichasMes, "neum_asoci_a_vm"),
    iaas: cuentaSi(fichasMes, "otras_infecciones_uci") + cuentaSi(fichasMes, "neumonia_nosocom") + cuentaSi(fichasMes, "neum_asoci_a_vm") + cuentaSi(fichasMes, "ivu_asociada_a_stu") + cuentaSi(fichasMes, "infeccion_sitio_cvc"),
    caidas: cuentaSi(fichasMes, "caidas_de_cama"),
    pacientesStu,
    infeccionesStu: cuentaSi(fichasMes, "ivu_asociada_a_stu"),
    retirosStu: cuentaSi(fichasMes, "retiro_accidental_stu"),
    pacientesSng: cuentaSi(fichasMes, "coloc_sng_en_uci"),
    retirosSng: cuentaSi(fichasMes, "retiro_accidental_de_sng"),
    pacientesTraqueostomia: cuentaSi(fichasMes, "traqueostomia_percutanea") + cuentaSi(fichasMes, "alta_con_traqueostomia"),
    retirosTraqueostomia: cuentaSi(fichasMes, "retiro_accidental_traqueostomia"),
    pacientesGastrostomia: cuentaSi(fichasMes, "paciente_con_gastrostomia") + cuentaSi(fichasMes, "alta_con_gastrostomia"),
    retirosGastrostomia: cuentaSi(fichasMes, "retiro_accidental_gastrostomia"),
    noAdmitidos: cuentaSi(fichasMes, "paciente_amerito_ingreso_a_uci_y_no_fue_admitido_oportunamente"),
    fallecidos: fichasEgresoMes.filter(ficha => valorComoTexto(ficha.datos?.alta).toUpperCase() === "FALLECIDO").length,
    fallecidos48: cuentaSi(fichasEgresoMes, "muerte_48_horas"),
    esperadoApache: suma(fichasEgresoMes, "mortalidad_ii") / 100,
    muertesVm: fichasEgresoVm.filter(ficha => valorComoTexto(ficha.datos?.alta).toUpperCase() === "FALLECIDO").length,
    neumonia: diagnosticoGrupo(fichasEgresoMes, ["neumonia", "neumon"]),
    covid: diagnosticoGrupo(fichasEgresoMes, ["covid"]),
    diarrea: diagnosticoGrupo(fichasEgresoMes, ["diarrea"]),
    renal: diagnosticoGrupo(fichasEgresoMes, ["renal", "erc"]),
    diabetes: diagnosticoGrupo(fichasEgresoMes, ["diabetes"]),
    hipertension: diagnosticoGrupo(fichasEgresoMes, ["hipertension", "hipertens"]),
    episodiosNavm: cuentaSi(fichasMes, "neum_asoci_a_vm"),
    diasVmi: suma(fichasMes, "vmi_dias"),
  };
}

function fechaEnMes(value: unknown, anio: number, mes: number) {
  const fecha = fechaDato(value);
  return Boolean(fecha && fecha.getFullYear() === anio && fecha.getMonth() + 1 === mes);
}

function diasCamaOcupadosEnMes(ficha: FichaCuidadosCriticos, anio: number, mes: number) {
  const ingreso = fechaDato(ficha.datos?.fecha_ingreso_al_servicio);
  if (!ingreso) return 0;

  const inicioPeriodo = new Date(anio, mes - 1, 1);
  const finPeriodo = new Date(anio, mes, 0);
  const hoy = new Date();
  const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const finSinEgreso = hoySinHora < finPeriodo ? hoySinHora : finPeriodo;
  const egreso = fechaDato(ficha.datos?.fecha_egreso_del_servicio) ?? finSinEgreso;
  const inicio = new Date(Math.max(ingreso.getTime(), inicioPeriodo.getTime()));
  const fin = new Date(Math.min(egreso.getTime(), finPeriodo.getTime()));

  return diasEntreFechasInclusivo(inicio, fin);
}

function diasEntre(inicio: unknown, fin: unknown) {
  const fechaInicio = fechaDato(inicio);
  const fechaFin = fechaDato(fin);
  if (!fechaInicio || !fechaFin) return 0;
  return diasEntreFechasInclusivo(fechaInicio, fechaFin);
}

function diasEntreFechasInclusivo(inicio: Date, fin: Date) {
  const diferencia = Math.round((fin.getTime() - inicio.getTime()) / 86_400_000);
  return diferencia >= 0 ? diferencia + 1 : 0;
}

function fechaDato(value: unknown) {
  const texto = valorComoTexto(value);
  if (!texto) return null;
  const fecha = new Date(`${texto}T00:00:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function numeroConfig(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function numero(value: unknown) {
  const texto = valorComoTexto(value).replace("%", "").replace(",", ".").trim();
  const parsed = Number(texto);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numeroVista(value: number) {
  return Number.isInteger(value) ? value : Number(value.toFixed(2));
}

function si(value: unknown) {
  return valorComoTexto(value).trim().toUpperCase() === "SI";
}

function cuentaSi(fichas: FichaCuidadosCriticos[], key: string) {
  return fichas.filter(ficha => si(ficha.datos?.[key])).length;
}

function suma(fichas: FichaCuidadosCriticos[], key: string) {
  return fichas.reduce((total, ficha) => total + numero(ficha.datos?.[key]), 0);
}

function razon(numerador: number, denominador: number) {
  return denominador > 0 ? numerador / denominador : null;
}

function porcentaje(numerador: number, denominador: number) {
  return denominador > 0 ? (numerador / denominador) * 100 : null;
}

function tasa(numerador: number, denominador: number, factor: number) {
  return denominador > 0 ? (numerador / denominador) * factor : null;
}

function diagnosticoGrupo(fichas: FichaCuidadosCriticos[], terminos: string[]) {
  const egresos = fichas.filter(ficha => diagnosticosTexto(ficha.datos).some(texto => terminos.some(term => texto.includes(term))));
  const muertes = egresos.filter(ficha => valorComoTexto(ficha.datos?.alta).toUpperCase() === "FALLECIDO");
  return { egresos: egresos.length, muertes: muertes.length };
}

function diagnosticosTexto(datos: DatosFicha) {
  return Object.entries(datos ?? {})
    .filter(([key, value]) => key.includes("diagnostico") && esValorRegistrado(value))
    .map(([, value]) => valorComoTexto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
}
