// Nombres de pacientes escritos a mano en Citas 2027 (pedido del usuario,
// 2026-11-18): se guardan con mayúscula inicial como manda la ortografía, sin
// importar si se digitaron en mayúsculas o en minúsculas, y antes de guardar se
// avisa (sin bloquear) de una palabra que parece mal escrita ("alejndro").
// Sin imports, para que scripts/test-citas-programadas.mjs lo pruebe solo.

/** Partículas que van en minúscula dentro del nombre ("Romero de Jesús"). */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "van", "von", "da", "das", "do", "dos", "di"]);

function claveNombre(s: string): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function capitalizar(palabra: string): string {
  // "o'neil" → "O'Neil", "lopez-garcia" → "Lopez-Garcia".
  return palabra.replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase("es"));
}

/**
 * "ALEJANDRO JOSE  pineda DE la o" → "Alejandro Jose Pineda de la O".
 * La primera palabra de cada parte (antes y después de la coma) siempre va con
 * mayúscula, también si es partícula ("De la Cruz, Ana").
 */
export function nombrePropio(texto: string): string {
  const limpio = String(texto ?? "").replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
  if (!limpio) return "";
  return limpio
    .split(", ")
    .map((parte) =>
      parte
        .split(" ")
        .map((p, i) => {
          const min = p.toLocaleLowerCase("es");
          return i > 0 && PARTICULAS.has(claveNombre(min)) ? min : capitalizar(min);
        })
        .join(" "),
    )
    .join(", ");
}

export type DiccionarioNombres = Record<string, number>;

export interface PalabraDudosa {
  palabra: string;
  sugerencia: string;
}

/** Distancia de edición con transposición (Damerau, versión restringida). */
export function distanciaEdicion(a: string, b: string, tope = 3): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Palabras del nombre que parecen mal escritas: no están en el diccionario de
 * nombres que services conoce y se parecen mucho a uno frecuente. Un nombre
 * raro que no se parece a ninguno no se marca (no todo lo desconocido es error).
 */
export function palabrasDudosas(texto: string, dic: DiccionarioNombres): PalabraDudosa[] {
  const vistas = new Set<string>();
  const dudosas: PalabraDudosa[] = [];
  const entradas = Object.entries(dic);
  for (const original of String(texto ?? "").split(/[\s,]+/)) {
    const k = claveNombre(original).replace(/[^a-zñ]/g, "");
    if (k.length < 4 || vistas.has(k) || PARTICULAS.has(k)) continue;
    vistas.add(k);
    if ((dic[k] ?? 0) >= 2) continue;
    // Palabras cortas: un solo cambio; largas (7+ letras): hasta dos.
    const tope = k.length >= 7 ? 2 : 1;
    let mejor: { palabra: string; dist: number; veces: number } | null = null;
    for (const [w, veces] of entradas) {
      if (veces < 3 || Math.abs(w.length - k.length) > tope || w[0] !== k[0] && tope === 1) continue;
      const dist = distanciaEdicion(k, w, tope);
      if (dist > tope) continue;
      if (!mejor || dist < mejor.dist || (dist === mejor.dist && veces > mejor.veces)) mejor = { palabra: w, dist, veces };
    }
    if (mejor) dudosas.push({ palabra: original, sugerencia: capitalizar(mejor.palabra) });
  }
  return dudosas;
}

/** Cambia en el texto cada palabra dudosa por su sugerencia. */
export function aplicarSugerencias(texto: string, dudosas: PalabraDudosa[]): string {
  let r = texto;
  for (const d of dudosas) {
    const re = new RegExp(`(^|[\\s,])${d.palabra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s,])`, "g");
    r = r.replace(re, (_, sep: string) => sep + d.sugerencia);
  }
  return nombrePropio(r);
}
