/**
 * Catálogo CIE-10 de la app. Se genera desde el catálogo del SIS con
 * `node scripts/actualizar-cie10.mjs` (cie-10/codes.json): mismo código y mismo
 * texto que eligen los médicos en el SIS y que llegan en cada importación.
 */
export interface EntradaCIE10 {
  code: string;
  description: string;
  /**
   * Inactivo en el SIS, o ya no existe allí (`fueraDelSis`). Se reconoce por
   * código —los registros que lo guardaron siguen siendo válidos— pero el
   * buscador no lo ofrece. Ej.: A90/A91, reemplazados por A97.x.
   */
  inactivo?: boolean;
  fueraDelSis?: boolean;
  causaExterna?: boolean;
  odontologia?: boolean;
  /** Solo si el SIS lo restringe; sin valor = ambos. */
  sexo?: "Hombre" | "Mujer";
}

interface ArchivoCIE10 {
  fuente: string;
  extraido: string;
  total: number;
  codigos: EntradaCIE10[];
}

let _cache: EntradaCIE10[] | null = null;
/** Texto de búsqueda sin tildes ni mayúsculas (el SIS escribe unas con tilde y otras sin ella). */
const _claves = new WeakMap<EntradaCIE10, { code: string; desc: string }>();

function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function claveDe(e: EntradaCIE10) {
  let k = _claves.get(e);
  if (!k) {
    k = { code: e.code.toLowerCase().replace(".", ""), desc: sinTildes(e.description) };
    _claves.set(e, k);
  }
  return k;
}

/** Todo el catálogo, incluidos los inactivos (para reconocer códigos ya guardados). */
export async function cargarCIE10(): Promise<EntradaCIE10[]> {
  if (_cache) return _cache;
  const mod = await import("../../cie-10/codes.json");
  _cache = (mod.default as unknown as ArchivoCIE10).codigos;
  return _cache;
}

/** Busca por inicio de código (con o sin punto) o por palabras de la descripción. Omite inactivos. */
export function buscarCIE10(
  entradas: EntradaCIE10[],
  query: string,
  max = 30
): EntradaCIE10[] {
  const q = sinTildes(query.trim());
  if (!q) return [];
  const qCodigo = q.replace(".", "");

  const byCode: EntradaCIE10[] = [];
  const byDesc: EntradaCIE10[] = [];
  const words = q.split(/\s+/).filter(Boolean);

  for (const e of entradas) {
    if (byCode.length + byDesc.length >= max * 2) break;
    if (e.inactivo) continue;
    const k = claveDe(e);
    if (k.code.startsWith(qCodigo)) {
      byCode.push(e);
    } else if (words.every((w) => k.desc.includes(w))) {
      byDesc.push(e);
    }
  }

  return [...byCode, ...byDesc].slice(0, max);
}
