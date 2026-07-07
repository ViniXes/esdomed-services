function normalizar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

function palabras(nombre: string): string[] {
  return normalizar(nombre).split(" ").filter(Boolean);
}

/**
 * Empareja un nombre libre (ej. de una hoja de Drive) contra el roster del sistema.
 * Coincide si todas las palabras de un nombre del roster aparecen dentro del nombre
 * a emparejar (ej. roster "ALFONSO MONTES" coincide con "ALFONSO MONTES GUTIERREZ").
 * Si varios candidatos califican, se prefiere el de mas palabras (match mas especifico).
 * Si ninguno califica, se devuelve el nombre original tal cual vino.
 */
export function emparejarNombre(nombreLibre: string, roster: string[]): string {
  const palabrasLibre = new Set(palabras(nombreLibre));
  if (palabrasLibre.size === 0) return nombreLibre.trim();

  let mejor: { nombre: string; puntaje: number } | null = null;
  for (const candidato of roster) {
    const palabrasCandidato = palabras(candidato);
    if (palabrasCandidato.length === 0) continue;
    const todasPresentes = palabrasCandidato.every(p => palabrasLibre.has(p));
    if (!todasPresentes) continue;
    if (!mejor || palabrasCandidato.length > mejor.puntaje) {
      mejor = { nombre: candidato, puntaje: palabrasCandidato.length };
    }
  }
  return mejor?.nombre ?? nombreLibre.trim();
}
