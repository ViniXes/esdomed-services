// Catálogo de Consulta Externa: especialidades con su prefijo de llamado y la
// estación de enfermería que las atiende. Hay una estación por especialidad,
// salvo Cardiología, que atiende también Cirugía Cardiovascular y Cirugía de
// Tórax (definido por el usuario, 2026-11-13).
//
// Sin imports a propósito: lo prueba scripts/test-consulta-externa.mjs.

export type EspecialidadCEId =
  | "hematologia"
  | "oncologia"
  | "cardiologia"
  | "infectologia"
  | "cirugia_cardiovascular"
  | "cirugia_torax";

export type EstacionCEId = "hematologia" | "oncologia" | "cardiologia" | "infectologia";

export interface EspecialidadCE {
  id: EspecialidadCEId;
  nombre: string;
  /** Prefijo del código de llamado (HE-12). Único en todo el catálogo. */
  prefijo: string;
  estacion: EstacionCEId;
  /** Otras formas en que el SIS podría escribirla (se comparan sin tildes ni caja). */
  alias?: string[];
}

export interface EstacionCE {
  id: EstacionCEId;
  nombre: string;
}

export const ESPECIALIDADES_CE: EspecialidadCE[] = [
  { id: "hematologia", nombre: "Hematología", prefijo: "HE", estacion: "hematologia" },
  { id: "oncologia", nombre: "Oncología", prefijo: "ON", estacion: "oncologia" },
  { id: "cardiologia", nombre: "Cardiología", prefijo: "CA", estacion: "cardiologia" },
  { id: "infectologia", nombre: "Infectología", prefijo: "IN", estacion: "infectologia" },
  {
    id: "cirugia_cardiovascular",
    nombre: "Cirugía Cardiovascular",
    prefijo: "CV",
    estacion: "cardiologia",
    alias: ["Cirugía Cardio Vascular", "Cirugía Cardíaca", "Cirugía Cardiaca"],
  },
  {
    id: "cirugia_torax",
    nombre: "Cirugía de Tórax",
    prefijo: "CT",
    estacion: "cardiologia",
    alias: ["Cirugía Torácica", "Cirugía Toráxica", "Cirugía Tórax"],
  },
];

export const ESTACIONES_CE: EstacionCE[] = [
  { id: "hematologia", nombre: "Hematología" },
  { id: "oncologia", nombre: "Oncología" },
  { id: "cardiologia", nombre: "Cardiología" },
  { id: "infectologia", nombre: "Infectología" },
];

/** Clave de comparación: sin tildes, minúsculas, espacios simples. */
export function claveEspecialidad(nombre: string): string {
  return String(nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const POR_CLAVE = new Map<string, EspecialidadCE>();
for (const e of ESPECIALIDADES_CE) {
  for (const nombre of [e.nombre, ...(e.alias ?? [])]) POR_CLAVE.set(claveEspecialidad(nombre), e);
}

/** La especialidad del catálogo que corresponde al nombre del reporte, o null si no está. */
export function resolverEspecialidad(nombreReporte: string): EspecialidadCE | null {
  return POR_CLAVE.get(claveEspecialidad(nombreReporte)) ?? null;
}

export function especialidadPorId(id: string): EspecialidadCE | undefined {
  return ESPECIALIDADES_CE.find((e) => e.id === id);
}

export function estacionPorId(id: string): EstacionCE | undefined {
  return ESTACIONES_CE.find((e) => e.id === id);
}

export function especialidadesDeEstacion(id: EstacionCEId): EspecialidadCE[] {
  return ESPECIALIDADES_CE.filter((e) => e.estacion === id);
}

/** "CA" + 7 → "CA-07". Con más de 99 citas crece solo: "CA-104". */
export function formatearCodigo(prefijo: string, numero: number): string {
  return `${prefijo}-${String(numero).padStart(2, "0")}`;
}
