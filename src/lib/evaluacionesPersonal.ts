// Catálogo abierto de tipos de evaluación/amonestación para el archivero de
// personal ESDOMED (ver EvaluacionPersonal en src/types/index.ts). Arranca con
// estos dos, pero el admin puede escribir uno nuevo al registrar una entrada:
// no es una lista cerrada, solo una sugerencia inicial.
export const TIPOS_EVALUACION_PERSONAL = [
  "Norma Técnica de Hechos Vitales",
  "Amonestación",
] as const;

/** Nota mínima para aprobar una evaluación del archivero (escala 0–10). */
export const NOTA_MINIMA_EVALUACION = 7;

export const aproboEvaluacion = (nota: number) => nota >= NOTA_MINIMA_EVALUACION;

/** "8.5" → 8.5; vacío o fuera de 0–10 → null. */
export function leerNota(texto: string): number | null {
  const n = Number(texto.replace(",", ".").trim());
  if (!texto.trim() || !Number.isFinite(n) || n < 0 || n > 10) return null;
  return Math.round(n * 100) / 100;
}
