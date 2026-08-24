export const SERVICIOS_HOSPITALARIOS = [
  // Nombres exactos según CamasOficialesSIS.xlsx
  "Emergencia",                                                          // no figura en SIS pero se conserva
  "Bienestar Magisterial",
  "Unidad de Cuidados Intensivos Adultos BM",                           // antes: Convenios (ISBM)
  "Unidad de Cuidados Intermedios Adultos BM",                          // antes: Convenios (ISBM)
  "Cirugía Hombres 1",
  "Cirugía Mujeres 1",
  "Cirugía Cardiovascular",
  "Neurocirugia",                                                        // SIS: sin tilde
  "Dolor y cuidados Paliativos",                                         // SIS: "cuidados" en minúscula
  "Unidad de Cuidados Intermedios Adultos MINSAL",
  "Unidad de Cuidados Intermedios Aislados Adultos",
  "Unidad de Cuidados Intermedios Crónicos Adultos",
  "Unidad de Cuidados Intermedios",                                      // nuevo en SIS
  "Medicina Interna Hombres 1",
  "Medicina Interna Hombres 2",
  "Medicina Interna Hombres 3",
  "Medicina Interna Mujeres 1",
  "Medicina Interna Mujeres 2",
  "Medicina Interna Mujeres 3",
  "Servicio de Cardiologia",                                             // SIS: sin tilde
  "Servicio de Hematologia",                                             // SIS: sin tilde
  "Servicio de Aislados",
  "Servicio de Oncologia",                                               // SIS: sin tilde
  "Obstetricia",                                                         // nuevo en SIS
  "Unidad de cuidados intensivos General 1 Adultos",                    // SIS: "1" (dígito), no "I" romano
  "Unidad de cuidados intensivos aislados Adultos",                     // SIS: minúsculas
  "Unidad de cuidados intensivos cardiovascular Adultos",               // SIS: minúsculas
  "Unidad de Cuidados Intensivos Extracorpórea Adultos",
  "Unidad de Cuidados Intensivos Quirúrgicos Adultos",
  "Unidad de Cuidados Neurointensivos Adultos",
  "Unidad de Cuidados Coronarios y Posquirúrgicos Cardiovasculares",
  "Unidad de Cuidados Intensivos",                                       // nuevo en SIS (genérico)
  "Unidad de Evaluacion y Observación Medica",                          // SIS: sin tildes en "Evaluacion" y "Medica"
  "Quimioterapia Ambulatoria",
  "Unidad de Terapia Intervencionista Endovascular",
  "Dialisis Peritoneal",                                                 // SIS: sin tilde
  "Terapias Sanguíneas Extracorpórea",
  "Centro Quirúrgico",
] as const;

export type ServicioHospitalario = (typeof SERVICIOS_HOSPITALARIOS)[number];

// ── Helpers de generación de camas ────────────────────────────────────────────

/** PREFIX-01, PREFIX-02, ...  (guión + 2 dígitos) */
function beds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`);
}

/** 1A, 2A, 3A, ...  (número + sufijo, formato UCI) */
function bedsNS(count: number, suffix: string): string[] {
  return Array.from({ length: count }, (_, i) => `${i + 1}${suffix}`);
}

/** CR01, CR02, ...  (prefijo + número, sin guión, 2 dígitos) */
function bedsPN(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`);
}

/** 01, 02, ..., 30  (números solos con cero inicial) */
function bedsZP(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(i + 1).padStart(2, "0"));
}

/** 1, 2, ..., 60  (números solos sin cero inicial) */
function bedsN(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

// ── Camas por servicio ────────────────────────────────────────────────────────

export const CAMAS_POR_SERVICIO: Record<ServicioHospitalario, string[]> = {
  // Sin camas fijas
  "Emergencia":                                                        [],
  "Obstetricia":                                                       [],
  "Unidad de Cuidados Intensivos":                                     [],
  "Unidad de Cuidados Intermedios":                                    [],

  // Bienestar Magisterial
  "Bienestar Magisterial":                                             bedsN(2),
  "Unidad de Cuidados Intensivos Adultos BM":                         bedsN(10),
  "Unidad de Cuidados Intermedios Adultos BM":                        bedsN(10),

  // Cirugía
  "Cirugía Hombres 1":                                                bedsZP(12),
  "Cirugía Mujeres 1":                                                bedsZP(12),
  "Cirugía Cardiovascular":                                           beds("CCV", 8),
  "Neurocirugia":                                                     beds("NEU", 10),

  // Dolor / Paliativos  (1P, 2P, …)
  "Dolor y cuidados Paliativos":                                      bedsNS(10, "P"),

  // Cuidados Intermedios
  "Unidad de Cuidados Intermedios Adultos MINSAL":                    bedsZP(30),
  "Unidad de Cuidados Intermedios Aislados Adultos":                  bedsPN("AI", 5),
  "Unidad de Cuidados Intermedios Crónicos Adultos":                  bedsPN("CR", 21),

  // Medicina Interna
  "Medicina Interna Hombres 1":                                       beds("MH1", 45),
  "Medicina Interna Hombres 2":                                       beds("MH2", 25),
  "Medicina Interna Hombres 3":                                       beds("MH3", 20),
  "Medicina Interna Mujeres 1":                                       beds("MM1", 50),
  "Medicina Interna Mujeres 2":                                       beds("MM2", 30),
  "Medicina Interna Mujeres 3":                                       beds("MM3", 32),
  "Servicio de Cardiologia":                                          beds("CAR", 8),
  "Servicio de Hematologia":                                          beds("HEM", 50),
  "Servicio de Aislados":                                             beds("MAI", 12),
  "Servicio de Oncologia":                                            beds("ONC", 15),

  // UCI — Cuidados Intensivos
  "Unidad de cuidados intensivos General 1 Adultos":                  bedsNS(10, "G1"),
  "Unidad de cuidados intensivos aislados Adultos":                   bedsNS(8,  "A"),
  "Unidad de cuidados intensivos cardiovascular Adultos":             bedsNS(12, "C"),
  "Unidad de Cuidados Intensivos Extracorpórea Adultos":              bedsNS(9,  "E"),
  "Unidad de Cuidados Intensivos Quirúrgicos Adultos":                bedsNS(9,  "Q"),
  "Unidad de Cuidados Neurointensivos Adultos":                       bedsNS(10, "N"),
  "Unidad de Cuidados Coronarios y Posquirúrgicos Cardiovasculares":  bedsNS(7,  "CPC"),

  // Servicios ambulatorios y especiales
  "Unidad de Evaluacion y Observación Medica":                        beds("EOM", 10),
  "Quimioterapia Ambulatoria":                                        bedsPN("QTA", 20),
  "Unidad de Terapia Intervencionista Endovascular":                  ["UTE-1", "UTE-2", "UTE-3"],
  "Dialisis Peritoneal":                                              bedsN(60),
  "Terapias Sanguíneas Extracorpórea":                                bedsN(10),

  // Centro Quirúrgico
  "Centro Quirúrgico": [
    ...bedsPN("Q", 5),
    ...Array.from({ length: 12 }, (_, i) => `R${i + 1}`),
  ],
};

// ── Abreviaturas de servicio ────────────────────────────────────────────────────
// Sigla corta por servicio. Se antepone a la cama SOLO cuando la cama es un número
// "pelón" (sin letras) que no identifica el servicio — ej. "17" → "CH-17", "3" → "BM-3".
// Las camas que ya traen letras (MH1-04, 1P, 10N) se muestran tal cual.
// EDITABLE: corregir/agregar siglas aquí. (A futuro podría moverse a configuracion/servicios.)
export const ABREVIATURA_SERVICIO: Partial<Record<string, string>> = {
  // Servicios con cama NUMÉRICA (aquí la sigla es indispensable):
  "Bienestar Magisterial": "BM",
  "Cirugía Hombres 1": "CH",
  "Cirugía Mujeres 1": "CM",
  "Unidad de Cuidados Intensivos Adultos BM": "UCI-BM",
  "Unidad de Cuidados Intermedios Adultos BM": "UCIM-BM",
  "Unidad de Cuidados Intermedios Adultos MINSAL": "UCIM",
  "Dialisis Peritoneal": "DP",
  "Terapias Sanguíneas Extracorpórea": "TSE",
  // Servicios con cama codificada (no se usa salvo que llegue una cama numérica suelta):
  "Cirugía Cardiovascular": "CCV",
  "Neurocirugia": "NEU",
  "Unidad de Cuidados Intermedios Aislados Adultos": "AI",
  "Unidad de Cuidados Intermedios Crónicos Adultos": "CR",
  "Medicina Interna Hombres 1": "MH1",
  "Medicina Interna Hombres 2": "MH2",
  "Medicina Interna Hombres 3": "MH3",
  "Medicina Interna Mujeres 1": "MM1",
  "Medicina Interna Mujeres 2": "MM2",
  "Medicina Interna Mujeres 3": "MM3",
  "Servicio de Cardiologia": "CAR",
  "Servicio de Hematologia": "HEM",
  "Servicio de Aislados": "MAI",
  "Servicio de Oncologia": "ONC",
  "Unidad de Evaluacion y Observación Medica": "EOM",
  "Quimioterapia Ambulatoria": "QTA",
  "Unidad de Terapia Intervencionista Endovascular": "UTE",
};

/** Etiqueta de ubicación inequívoca para mostrar/imprimir.
 *  - Cama con letras (MH1-04, 1P, 10N) → se muestra tal cual (ya identifica el servicio).
 *  - Cama solo numérica (17, 04) → se antepone la sigla del servicio: "CH-04".
 *  - Sin sigla mapeada → cae al nombre del servicio + cama para no perder contexto. */
export function ubicacionLabel(servicio?: string, cama?: string): string {
  const s = (servicio ?? "").trim();
  const c = (cama ?? "").trim();
  if (!c) return s || "—";
  if (/[a-zA-Z]/.test(c)) return c;
  const abbr = servicio ? ABREVIATURA_SERVICIO[servicio] : undefined;
  return abbr ? `${abbr}-${c}` : s ? `${s} ${c}` : c;
}

// ── Normalización canónica de nombres ─────────────────────────────────────────
// El SIS escribe los mismos servicios con variaciones inofensivas: mayúsculas vs.
// minúsculas ("Unidad de Cuidados Intensivos" / "Unidad de cuidados intensivos"),
// tildes, dobles espacios ("Intensivos␣␣Adultos BM"), numeral romano vs. dígito.
// Todas esas variantes se colapsan en una CLAVE de comparación; el nombre que se
// GUARDA es siempre el del catálogo vivo (Firestore) — nunca el crudo del reporte.
//
// Regla de oro: comparar por clave, escribir el canónico.

const ROMANOS: Record<string, string> = {
  i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10",
};

/** Clave de comparación de servicios: sin tildes, sin puntuación, minúsculas,
 *  espacios colapsados y numerales romanos sueltos convertidos a dígito. */
export function claveServicio(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // quita tildes/diacríticos (ñ → n)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")       // puntuación y símbolos → espacio
    .trim()
    .split(/\s+/)
    .map((t) => ROMANOS[t] ?? t)
    .join(" ");
}

/** Clave de comparación de camas: sin espacios, mayúsculas y sin ceros a la
 *  izquierda ("02" ≡ "2", "MH1-04" ≡ "MH1-4"). */
export function claveCama(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/(^|[^0-9])0+(\d)/g, "$1$2");
}

/** ¿Dos nombres de servicio designan el mismo servicio? (ignora mayúsculas,
 *  tildes, espacios de más y romanos). Úsalo SIEMPRE en vez de `a !== b`. */
export const mismoServicio = (a: unknown, b: unknown): boolean =>
  claveServicio(a) === claveServicio(b);

/** ¿Dos camas son la misma? (ignora ceros a la izquierda y espacios). */
export const mismaCama = (a: unknown, b: unknown): boolean =>
  claveCama(a) === claveCama(b);

// ── Alias: cómo se escribe fuera → cómo se llama aquí ─────────────────────────
// EDITABLE. La izquierda es la forma que puede venir en un reporte del SIS o en
// datos viejos; la derecha DEBE ser un nombre del catálogo canónico de arriba.
// No hace falta registrar variantes de mayúsculas, tildes, dobles espacios ni
// romanos: esas ya las absorbe claveServicio(). Aquí solo van los nombres
// realmente distintos (siglas, formas cortas, nombres históricos).
const ALIAS_CRUDOS: Record<string, ServicioHospitalario> = {
  // Siglas de cuidados intensivos
  "UCI General 1 Adultos":        "Unidad de cuidados intensivos General 1 Adultos",
  "UCI Aislados Adultos":         "Unidad de cuidados intensivos aislados Adultos",
  "UCI Cardiovascular Adultos":   "Unidad de cuidados intensivos cardiovascular Adultos",
  "UCI Quirúrgicos Adultos":      "Unidad de Cuidados Intensivos Quirúrgicos Adultos",
  "UCI Extracorpórea Adultos":    "Unidad de Cuidados Intensivos Extracorpórea Adultos",
  "UCI Adultos BM":               "Unidad de Cuidados Intensivos Adultos BM",
  "UCI Neurointensivos Adultos":  "Unidad de Cuidados Neurointensivos Adultos",
  "Unidad de Cuidados Neurointensivos": "Unidad de Cuidados Neurointensivos Adultos",
  // Siglas de cuidados intermedios
  "UCIM Adultos BM":              "Unidad de Cuidados Intermedios Adultos BM",
  "UCIM Adultos MINSAL":          "Unidad de Cuidados Intermedios Adultos MINSAL",
  "UCIM Aislados Adultos":        "Unidad de Cuidados Intermedios Aislados Adultos",
  "UCIM Crónicos Adultos":        "Unidad de Cuidados Intermedios Crónicos Adultos",
  // Formas cortas de los servicios de medicina
  "Hematologia":                  "Servicio de Hematologia",
  "Oncologia":                    "Servicio de Oncologia",
  "Cardiologia":                  "Servicio de Cardiologia",
  "Aislados":                     "Servicio de Aislados",
  "Medicina Aislados":            "Servicio de Aislados",
  "Cuidados Paliativos":          "Dolor y cuidados Paliativos",
};

/** Alias indexados por clave (se construye una sola vez). */
export const ALIAS_SERVICIO: Record<string, string> = Object.fromEntries(
  Object.entries(ALIAS_CRUDOS).map(([alias, canonico]) => [claveServicio(alias), canonico])
);

/**
 * Resuelve cualquier forma de escribir un servicio al nombre EXACTO del catálogo.
 * 1) calce directo por clave contra el catálogo vivo;
 * 2) si no, tabla de alias → y ese canónico se busca otra vez en el catálogo.
 * Devuelve null si el servicio no existe en el catálogo (para reportarlo, nunca
 * para guardar el nombre crudo).
 */
export function resolverServicioCanonico(
  nombre: unknown,
  catalogo: readonly string[] = SERVICIOS_HOSPITALARIOS,
): string | null {
  const k = claveServicio(nombre);
  if (!k) return null;
  const directo = catalogo.find((s) => claveServicio(s) === k);
  if (directo) return directo;
  const canonicoAlias = ALIAS_SERVICIO[k];
  if (!canonicoAlias) return null;
  const kAlias = claveServicio(canonicoAlias);
  return catalogo.find((s) => claveServicio(s) === kAlias) ?? null;
}
