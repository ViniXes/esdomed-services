import type { CategoriaArchivoPersonal, EvaluacionPersonal } from "@/types";

// Archivero de personal ESDOMED (colección evaluaciones_personal, ver
// EvaluacionPersonal en src/types/index.ts), repartido en una pestaña por
// categoría de la ficha del empleado. Los tipos son un catálogo abierto: el
// admin puede escribir uno nuevo al registrar, son solo sugerencias.
export const CATEGORIAS_ARCHIVO_PERSONAL: Record<CategoriaArchivoPersonal, {
  pestana: string;
  tipos: readonly string[];
  ejemploTipo: string;
  /** Solo las evaluaciones llevan nota 0–10. */
  conNota: boolean;
  vacio: string;
  vacioAdmin: string;
  vacioEmpleado: string;
}> = {
  evaluacion: {
    pestana: "Evaluaciones",
    tipos: ["Norma Técnica de Hechos Vitales"],
    ejemploTipo: "Ej. Norma Técnica de Hechos Vitales",
    conNota: true,
    vacio: "Sin evaluaciones registradas",
    vacioAdmin: "Las evaluaciones que registres aquí quedan permanentes en el expediente.",
    vacioEmpleado: "Aquí verás las evaluaciones que ESDOMED registre en tu expediente.",
  },
  amonestacion: {
    pestana: "Amonestaciones",
    tipos: ["Amonestación verbal", "Amonestación escrita"],
    ejemploTipo: "Ej. Amonestación escrita",
    conNota: false,
    vacio: "Sin amonestaciones registradas",
    vacioAdmin: "Las amonestaciones que registres aquí quedan permanentes en el expediente.",
    vacioEmpleado: "Aquí verás las amonestaciones que ESDOMED registre en tu expediente.",
  },
  diploma: {
    pestana: "Diplomas y certificados",
    tipos: ["Diploma", "Certificado", "Constancia de participación"],
    ejemploTipo: "Ej. Diploma de participación",
    conNota: false,
    vacio: "Sin diplomas ni certificados",
    vacioAdmin: "Los diplomas y certificados que subas aquí quedan permanentes en el expediente.",
    vacioEmpleado: "Aquí verás los diplomas y certificados que ESDOMED suba a tu expediente.",
  },
};

/**
 * Pestaña de una entrada. Las registradas antes de las pestañas no traen
 * `categoria`: si el tipo dice "amonestación" va a Amonestaciones y si no, a
 * Evaluaciones (eran las únicas dos opciones).
 */
export function categoriaDeEntrada(e: Pick<EvaluacionPersonal, "categoria" | "tipo">): CategoriaArchivoPersonal {
  if (e.categoria) return e.categoria;
  return /amonestaci[oó]n/i.test(e.tipo ?? "") ? "amonestacion" : "evaluacion";
}

/** Nota mínima para aprobar una evaluación del archivero (escala 0–10). */
export const NOTA_MINIMA_EVALUACION = 7;

export const aproboEvaluacion = (nota: number) => nota >= NOTA_MINIMA_EVALUACION;

/** "8.5" → 8.5; vacío o fuera de 0–10 → null. */
export function leerNota(texto: string): number | null {
  const n = Number(texto.replace(",", ".").trim());
  if (!texto.trim() || !Number.isFinite(n) || n < 0 || n > 10) return null;
  return Math.round(n * 100) / 100;
}
