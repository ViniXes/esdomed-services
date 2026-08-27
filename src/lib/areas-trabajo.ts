// Catálogo de ÁREAS del hospital con plan de trabajo mensual en la app.
//
// Ingeniería a largo plazo: cualquier área del Hospital El Salvador puede tener
// su rol mensual aquí. El plan de cada área vive en la colección
// `planes_trabajo_areas` con doc id `{areaId}_{YYYY-MM}` y usa el MISMO formato
// que el plan de ESDOMED (tipo PlanTrabajo + FilaPlanTrabajo): mismo catálogo
// hospitalario de códigos de horario (src/lib/esdomed/horarios.ts) y filas
// ancladas al código de marcación (único en todo el hospital), con `uid`
// opcional. Cuando en el futuro se creen usuarios para el personal de un área,
// sus filas se vinculan automáticamente por código de marcación — sin migrar
// datos.
//
// ESDOMED es el caso fundador y conserva su módulo propio (/esdomed-horarios,
// colección `planes_trabajo` con doc id == periodo). No se migra: aquí solo se
// referencia para que aparezca en el selector de áreas.
//
// Para incorporar un área nueva: agregar su entrada aquí e importar su Excel
// con `node scripts/importar-plan-area.mjs` (o crear el plan vacío en la app).

export interface AreaTrabajo {
  id: string;          // slug estable, usado en doc ids y rutas — NO cambiar
  nombre: string;      // nombre oficial del área (encabezado del rol impreso)
  corto: string;       // etiqueta corta para tarjetas y migas
  descripcion: string; // una línea para el selector de áreas
  /** El área usa un módulo propio en vez de las rutas genéricas /horarios/[area]. */
  hrefPropio?: string;
}

export const AREAS_TRABAJO: readonly AreaTrabajo[] = [
  {
    id: "esdomed",
    nombre: "Estadística y Documentos Médicos (ESDOMED)",
    corto: "ESDOMED",
    descripcion: "Rol mensual del personal de ESDOMED, con grupos de trabajo y PDF para RH.",
    hrefPropio: "/esdomed-horarios",
  },
  {
    id: "terapia-respiratoria",
    nombre: "Unidad de Terapia Respiratoria",
    corto: "Terapia Respiratoria",
    descripcion: "Rol mensual de tecnólogos, coordinadores y auxiliares de terapia respiratoria.",
  },
];

const POR_ID = new Map(AREAS_TRABAJO.map((a) => [a.id, a]));

export function getAreaTrabajo(id: string | null | undefined): AreaTrabajo | undefined {
  return id ? POR_ID.get(id) : undefined;
}

/** Doc id del plan de un área en `planes_trabajo_areas`. */
export function planAreaDocId(areaId: string, periodo: string): string {
  return `${areaId}_${periodo}`;
}
