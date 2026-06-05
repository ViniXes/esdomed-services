import type { TipoAtencionCuidadosCriticos, TipoMedicoCuidadosCriticos } from "@/types";

export const SERVICIOS_UCI = [
  "Unidad de cuidados intensivos aislados Adultos",
  "Unidad de Cuidados Intensivos Quirúrgicos Adultos",
  "Unidad de cuidados intensivos General 1 Adultos",
  "Unidad de Cuidados Coronarios y Posquirúrgicos Cardiovasculares",
  "Unidad de Cuidados Intensivos Extracorpórea Adultos",
  "Unidad de Cuidados Neurointensivos Adultos",
  "Unidad de cuidados intensivos cardiovascular Adultos",
] as const;

export const SERVICIOS_UCIN = [
  "Unidad de Cuidados Intermedios Adultos MINSAL",
  "Unidad de Cuidados Intermedios Crónicos Adultos",
  "Unidad de Cuidados Intermedios Aislados Adultos",
] as const;

export const TIPO_MEDICO_CRITICO_LABEL: Record<TipoMedicoCuidadosCriticos, string> = {
  uci: "Médico UCI",
  ucin: "Médico UCIN",
};

export const TIPO_ATENCION_CRITICA_LABEL: Record<TipoAtencionCuidadosCriticos, string> = {
  evaluacion_ingreso: "Evaluación de ingreso",
  seguimiento_clinico: "Seguimiento clínico",
  procedimiento: "Procedimiento",
  dispositivo: "Dispositivo",
  ventilacion: "Ventilación",
  infeccion_cultivo: "Infección o cultivo",
  medicamento: "Medicamento",
  estudio: "Estudio",
  evento_adverso: "Evento adverso",
  egreso: "Egreso",
};

export const TIPOS_ATENCION_CRITICA = Object.entries(TIPO_ATENCION_CRITICA_LABEL).map(
  ([value, label]) => ({ value: value as TipoAtencionCuidadosCriticos, label })
);

export function serviciosPorTipoMedico(tipo?: TipoMedicoCuidadosCriticos | null): string[] {
  if (tipo === "uci") return [...SERVICIOS_UCI];
  if (tipo === "ucin") return [...SERVICIOS_UCIN];
  return [];
}
