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

const SERVICIOS_CRITICOS = [...SERVICIOS_UCI, ...SERVICIOS_UCIN] as const;

const ALIAS_SERVICIOS_CRITICOS: Record<string, readonly string[]> = {
  "Unidad de cuidados intensivos aislados Adultos": [
    "Unidad de Cuidados Intensivos Aislados Adultos",
  ],
  "Unidad de cuidados intensivos General 1 Adultos": [
    "Unidad de Cuidados Intensivos General 1 Adultos",
    "Unidad de Cuidados Intensivos General I Adultos",
  ],
  "Unidad de cuidados intensivos cardiovascular Adultos": [
    "Unidad de Cuidados Intensivos Cardiovascular Adultos",
  ],
};

function claveServicioCritico(servicio?: string | null) {
  return (servicio ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\bgeneral\s+i\b/g, "general 1")
    .replace(/\s+/g, " ");
}

const SERVICIO_CANONICO_POR_CLAVE = new Map<string, string>();
const ALIAS_POR_SERVICIO_CANONICO = new Map<string, string[]>();

for (const servicio of SERVICIOS_CRITICOS) {
  const alias = [servicio, ...(ALIAS_SERVICIOS_CRITICOS[servicio] ?? [])];
  ALIAS_POR_SERVICIO_CANONICO.set(servicio, alias);
  for (const nombre of alias) {
    SERVICIO_CANONICO_POR_CLAVE.set(claveServicioCritico(nombre), servicio);
  }
}

export const TIPO_MEDICO_CRITICO_LABEL: Record<TipoMedicoCuidadosCriticos, string> = {
  uci: "Médico UCI",
  ucin: "Médico UCIN",
  uci_ucin: "Médico UCI/UCIN",
  jefe_uci_ucin: "Jefe UCI/UCIN",
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
  if (tipoMedicoCubreUciYUcin(tipo)) return [...SERVICIOS_UCI, ...SERVICIOS_UCIN];
  return [];
}

export function servicioCanonicoCuidadosCriticos(servicio?: string | null) {
  const valor = (servicio ?? "").trim();
  return SERVICIO_CANONICO_POR_CLAVE.get(claveServicioCritico(valor)) ?? valor;
}

export function serviciosConsultaCuidadosCriticos(servicios: string[]) {
  const consulta = new Set<string>();
  for (const servicio of servicios) {
    const canonico = servicioCanonicoCuidadosCriticos(servicio);
    const alias = ALIAS_POR_SERVICIO_CANONICO.get(canonico) ?? [servicio];
    alias.forEach(nombre => consulta.add(nombre));
  }
  return [...consulta].filter(Boolean);
}

export function serviciosCanonicosCuidadosCriticos(servicios: string[]) {
  const consulta = new Set<string>();
  for (const servicio of servicios) {
    const canonico = servicioCanonicoCuidadosCriticos(servicio);
    if (canonico) consulta.add(canonico);
  }
  return [...consulta].filter(Boolean);
}

export function servicioCoincideCuidadosCriticos(servicio?: string | null, esperado?: string | null) {
  if (!servicio || !esperado) return false;
  return servicioCanonicoCuidadosCriticos(servicio) === servicioCanonicoCuidadosCriticos(esperado);
}

export function tipoMedicoCubreUciYUcin(tipo?: TipoMedicoCuidadosCriticos | null) {
  return tipo === "uci_ucin" || tipo === "jefe_uci_ucin";
}

export function tipoUnidadPorServicio(servicio?: string | null): "uci" | "ucin" | null {
  if (!servicio) return null;
  const canonico = servicioCanonicoCuidadosCriticos(servicio);
  if ((SERVICIOS_UCI as readonly string[]).includes(canonico)) return "uci";
  if ((SERVICIOS_UCIN as readonly string[]).includes(canonico)) return "ucin";
  return null;
}
