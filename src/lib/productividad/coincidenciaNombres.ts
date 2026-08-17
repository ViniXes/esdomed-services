function normalizar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Empareja un nombre libre (ej. de una hoja de Drive) contra el roster del sistema.
 * Solo admite una coincidencia completa, tolerando mayúsculas, tildes y espacios.
 * Las abreviaturas o nombres incompletos se descartan para no atribuir actividad
 * a una persona distinta de la elegida en la hoja.
 */
export function emparejarNombre(nombreLibre: string, roster: string[]): string | null {
  const nombreNormalizado = normalizar(nombreLibre);
  if (!nombreNormalizado) return null;
  return roster.find(candidato => normalizar(candidato) === nombreNormalizado) ?? null;
}
