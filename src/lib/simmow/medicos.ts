// Catálogo real de médicos registrados en SIMMOW (el campo "Médico
// Responsable" del formulario de Ingreso/Edición de Egreso), extraído
// directamente de la página real por el usuario — código interno + nombre +
// JVPM. SIMMOW autocompleta el nombre del médico buscando por su CÓDIGO
// INTERNO (no por el número de JVPM del SIS, que no coincide entre ambos
// sistemas) — por eso el FIEH nunca precargaba el nombre en SIMMOW. Este
// catálogo permite hacer el match por NOMBRE (que sí es el mismo en ambos
// sistemas) para resolver el código correcto.

import { sinAcentos } from "./texto";

export interface MedicoSimmow {
  codigo: string;
  nombre: string;
  jvpm: string;
}

let _cache: MedicoSimmow[] | null = null;

export async function cargarMedicos(): Promise<MedicoSimmow[]> {
  if (_cache) return _cache;
  const mod = await import("./medicosSimmow.json");
  _cache = mod.default as MedicoSimmow[];
  return _cache;
}

/** Búsqueda para el combobox: todas las palabras de la consulta deben aparecer en el nombre. */
export function buscarMedicos(
  entradas: MedicoSimmow[],
  query: string,
  max = 30
): MedicoSimmow[] {
  const q = sinAcentos(query.trim().toLowerCase());
  if (!q) return [];

  const palabras = q.split(/\s+/).filter(Boolean);
  const resultados: MedicoSimmow[] = [];

  for (const e of entradas) {
    if (resultados.length >= max) break;
    const nombre = sinAcentos(e.nombre.toLowerCase());
    if (palabras.every((p) => nombre.includes(p))) resultados.push(e);
  }

  return resultados;
}

/**
 * Mejor coincidencia automática por solapamiento de tokens — para sugerir un
 * código por defecto al extraer el FIEH. A diferencia de establecimientos,
 * aquí se exige que coincidan TODAS las palabras del nombre (nombres de
 * persona son más propensos a falsos positivos parciales — "Jose Garcia"
 * podría calzar con cualquiera de varios médicos distintos) y que la
 * coincidencia sea única; si hay ambigüedad o no hay certeza total, no
 * sugiere nada (mejor vacío, que el personal lo busque/confirme a mano).
 */
/** Busca un médico por su código interno exacto (para cuando se escribe directo el código). */
export function buscarMedicoPorCodigo(
  entradas: MedicoSimmow[],
  codigo: string
): MedicoSimmow | null {
  const c = codigo.trim();
  if (!c) return null;
  return entradas.find((e) => e.codigo === c) ?? null;
}

export function mejorCoincidenciaMedico(
  entradas: MedicoSimmow[],
  nombreFieh: string
): MedicoSimmow | null {
  const nombreNorm = sinAcentos(nombreFieh.toLowerCase()).trim();
  if (!nombreNorm) return null;

  const exactas = entradas.filter((e) => sinAcentos(e.nombre.toLowerCase()) === nombreNorm);
  if (exactas.length === 1) return exactas[0];
  if (exactas.length > 1) return null;

  const tokens = nombreNorm.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  if (!tokens.length) return null;

  const candidatos = entradas.filter((e) => {
    const nombreEntrada = sinAcentos(e.nombre.toLowerCase());
    return tokens.every((t) => nombreEntrada.includes(t));
  });

  return candidatos.length === 1 ? candidatos[0] : null;
}
