// Catálogo real de establecimientos de SIMMOW (los combos "Referido al
// Establecimiento", "Referido del Establecimiento" y "Retorno hacia"),
// extraído directamente de la página real por el usuario — 1743 nombres con
// su código interno. Se usa para (a) sugerir automáticamente la mejor
// coincidencia al extraer el FIEH y (b) dejar buscar/confirmar manualmente
// en el formulario de revisión, en vez de depender a ciegas del fuzzy-match
// que corre dentro de la consola de SIMMOW.

import { sinAcentos } from "./texto";

export interface EstablecimientoSimmow {
  codigo: string;
  nombre: string;
}

let _cache: EstablecimientoSimmow[] | null = null;

export async function cargarEstablecimientos(): Promise<EstablecimientoSimmow[]> {
  if (_cache) return _cache;
  const mod = await import("./establecimientosSimmow.json");
  _cache = mod.default as EstablecimientoSimmow[];
  return _cache;
}

/** Búsqueda para el combobox: todas las palabras de la consulta deben aparecer en el nombre. */
export function buscarEstablecimientos(
  entradas: EstablecimientoSimmow[],
  query: string,
  max = 30
): EstablecimientoSimmow[] {
  const q = sinAcentos(query.trim().toLowerCase());
  if (!q) return [];

  const palabras = q.split(/\s+/).filter(Boolean);
  const resultados: EstablecimientoSimmow[] = [];

  for (const e of entradas) {
    if (resultados.length >= max) break;
    const nombre = sinAcentos(e.nombre.toLowerCase());
    if (palabras.every((p) => nombre.includes(p))) resultados.push(e);
  }

  return resultados;
}

/**
 * Mejor coincidencia automática por solapamiento de tokens — para sugerir un
 * valor por defecto al extraer el FIEH (el nombre ahí puede venir en otro
 * orden o con leves diferencias de redacción respecto al catálogo real).
 * Exige que la mayoría de las palabras distintivas coincidan; si no hay
 * suficiente certeza, no sugiere nada (mejor vacío que un mal.
 */
export function mejorCoincidenciaEstablecimiento(
  entradas: EstablecimientoSimmow[],
  nombreFieh: string
): EstablecimientoSimmow | null {
  const nombreNorm = sinAcentos(nombreFieh.toLowerCase()).trim();
  if (!nombreNorm) return null;

  const exacta = entradas.find((e) => sinAcentos(e.nombre.toLowerCase()) === nombreNorm);
  if (exacta) return exacta;

  const tokens = nombreNorm.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  if (!tokens.length) return null;

  let mejor: EstablecimientoSimmow | null = null;
  let mejorScore = 0;

  for (const e of entradas) {
    const nombreEntrada = sinAcentos(e.nombre.toLowerCase());
    let score = 0;
    for (const t of tokens) {
      if (nombreEntrada.includes(t)) score++;
    }
    if (score > mejorScore) {
      mejorScore = score;
      mejor = e;
    }
  }

  const umbral = Math.max(2, Math.ceil(tokens.length * 0.6));
  return mejorScore >= umbral ? mejor : null;
}
