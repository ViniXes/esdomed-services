export interface EntradaCIE10 {
  code: string;
  description: string;
}

let _cache: EntradaCIE10[] | null = null;

function dotFormat(raw: string): string {
  return raw.length > 3 ? `${raw.slice(0, 3)}.${raw.slice(3)}` : raw;
}

export async function cargarCIE10(): Promise<EntradaCIE10[]> {
  if (_cache) return _cache;
  const mod = await import("../../cie-10/codes.json");
  const raw = mod.default as Array<{ level: number; code: string; description: string }>;
  _cache = raw
    .filter((e) => e.level >= 2)
    .map((e) => ({
      code: dotFormat(e.code),
      description: e.description.trim(),
    }));
  return _cache;
}

export function buscarCIE10(
  entradas: EntradaCIE10[],
  query: string,
  max = 30
): EntradaCIE10[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const byCode: EntradaCIE10[] = [];
  const byDesc: EntradaCIE10[] = [];
  const words = q.split(/\s+/).filter(Boolean);

  for (const e of entradas) {
    if (byCode.length + byDesc.length >= max * 2) break;
    const code = e.code.toLowerCase();
    const desc = e.description.toLowerCase();
    if (code.startsWith(q)) {
      byCode.push(e);
    } else if (words.every((w) => desc.includes(w))) {
      byDesc.push(e);
    }
  }

  return [...byCode, ...byDesc].slice(0, max);
}
