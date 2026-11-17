// Diccionario de pronunciación de los llamados de Consulta Externa.
//
// Las voces "Natural" de Edge reconocen los nombres de origen inglés (Kevin,
// Jennifer, Walter…) y los dicen en inglés. La Web Speech API no deja marcar
// el idioma de una palabra (no acepta SSML), así que se reescribe cómo debe
// sonar: "Jennifer" → "Yénifer". Solo cambia lo que se LEE; la pantalla
// muestra el nombre como está escrito. Lo edita gestión en Pantallas y lo usan
// todas las pantallas (configuracion/pronunciacion_ce).
//
// Pura y sin imports: la prueba scripts/test-consulta-externa.mjs.

export interface ReglaPronunciacion {
  /** Una palabra, como aparece en el nombre ("Jennifer"). */
  escrito: string;
  /** Cómo debe sonar, escrito a la española ("Yénifer"). */
  leido: string;
}

/** Clave de comparación: sin tildes ni mayúsculas, así "JENNIFER" y "Jénnifer" son la misma palabra. */
export function clavePalabra(palabra: string): string {
  return String(palabra ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Una sola palabra, sin espacios ni signos: es lo que se busca en el texto. */
export function palabraValida(escrito: string): boolean {
  return /^[A-Za-zÀ-ÖØ-öø-ÿ'’]{2,}$/.test(String(escrito ?? "").trim());
}

/** Reemplaza cada palabra del texto que esté en el diccionario por cómo debe sonar. */
export function aplicarPronunciacion(texto: string, reglas: ReglaPronunciacion[]): string {
  if (!reglas.length) return texto;
  const mapa = new Map(reglas.filter((r) => r.leido?.trim()).map((r) => [clavePalabra(r.escrito), r.leido.trim()]));
  return texto.replace(/[A-Za-zÀ-ÖØ-öø-ÿ'’]+/g, (palabra) => mapa.get(clavePalabra(palabra)) ?? palabra);
}

/** Documento → lista ordenada (en Firestore es un mapa por clave, para editar una regla sin pisar las demás). */
export function reglasDeMapa(mapa: Record<string, ReglaPronunciacion> | undefined): ReglaPronunciacion[] {
  return Object.values(mapa ?? {})
    .filter((r) => r?.escrito && r?.leido)
    .sort((a, b) => a.escrito.localeCompare(b.escrito, "es"));
}
