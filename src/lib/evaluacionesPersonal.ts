// Catálogo abierto de tipos de evaluación/amonestación para el archivero de
// personal ESDOMED (ver EvaluacionPersonal en src/types/index.ts). Arranca con
// estos dos, pero el admin puede escribir uno nuevo al registrar una entrada:
// no es una lista cerrada, solo una sugerencia inicial.
export const TIPOS_EVALUACION_PERSONAL = [
  "Norma Técnica de Hechos Vitales",
  "Amonestación",
] as const;
