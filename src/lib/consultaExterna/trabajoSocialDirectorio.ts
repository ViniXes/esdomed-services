// Directorio de Trabajo Social de Consulta Externa: los datos personales y de
// contacto que el reporte de citas no deja en services (teléfono, nacimiento,
// documento, domicilio, responsable). Los completan las trabajadoras, por
// paciente, y los comparten entre las dos.
//
// consulta_externa_ts_directorio/{idDirectorio(clave)}: una ficha por paciente,
// con la misma clave del índice de pacientes. El nombre, el expediente y el DUI
// de la cita no se editan aquí: mandan los del SIS.
//
// Pura: la usan la API, la pantalla y scripts/test-trabajo-social-ce.mjs.

import { DEPARTAMENTOS_SV } from "@/lib/divisionPolitica";
import { esFecha, normalizarDui, type Opcion, type Resultado } from "./trabajoSocial";

export const COL_TS_DIRECTORIO = "consulta_externa_ts_directorio";

/** Id del documento: la clave puede traer comas, espacios o dos puntos ("nom:PEREZ, JOSE"). */
export const idDirectorio = (clave: string): string => encodeURIComponent(clave);

export const TIPOS_DOCUMENTO: Opcion[] = [
  { id: "dui", label: "DUI" },
  { id: "pasaporte", label: "Pasaporte" },
  { id: "carne_residencia", label: "Carné de residencia" },
  { id: "carne_minoridad", label: "Carné de minoridad" },
  { id: "partida_nacimiento", label: "Partida de nacimiento" },
  { id: "otro", label: "Otro" },
];
export const SEXOS: Opcion[] = [{ id: "femenino", label: "Femenino" }, { id: "masculino", label: "Masculino" }];
export const ZONAS: Opcion[] = [{ id: "urbana", label: "Urbana" }, { id: "rural", label: "Rural" }];

export const NACIONALIDAD_SV = "Salvadoreña";
/** Sugerencias al escribir; se acepta cualquier otra. */
export const NACIONALIDADES = [
  "Guatemalteca", "Hondureña", "Nicaragüense", "Costarricense", "Panameña", "Beliceña", "Mexicana", "Estadounidense",
  "Colombiana", "Venezolana", "Cubana", "Española",
];
export const PAISES = [
  "Guatemala", "Honduras", "Nicaragua", "Costa Rica", "Panamá", "Belice", "México", "Estados Unidos", "Canadá",
  "Colombia", "Venezuela", "España", "Italia",
];

const labelDe = (lista: Opcion[], id: string) => lista.find((o) => o.id === id)?.label ?? id;
export const labelDocumento = (id: string): string => labelDe(TIPOS_DOCUMENTO, id);
export const labelSexo = (id: string): string => labelDe(SEXOS, id);
export const labelZona = (id: string): string => labelDe(ZONAS, id);

export interface ResponsableDirectorio { nombre: string; parentesco: string; telefono: string }

export interface FichaDirectorio {
  documentoTipo: string;
  documentoNumero: string;
  sexo: string;
  /** "YYYY-MM-DD"; vacía si solo se sabe la edad. */
  fechaNacimiento: string;
  /** Solo si no hay fecha de nacimiento: la edad dicha y el día en que se anotó. */
  edad: number | null;
  edadAl: string;
  nacionalidad: string;
  telefono: string;
  telefono2: string;
  correo: string;
  /** "sv": vive en El Salvador (zona, departamento, municipio). "exterior": país y dirección en una línea. */
  residencia: "sv" | "exterior";
  zona: string;
  departamento: string;
  municipio: string;
  /** El antiguo municipio (Soyapango); el municipio es el nuevo (San Salvador Este). */
  distrito: string;
  direccion: string;
  pais: string;
  responsable: ResponsableDirectorio;
}

/** La ficha como la devuelve la API: con quién la tocó por última vez. */
export type FichaGuardada = FichaDirectorio & { actualizadoPorNombre: string; actualizadoEnMs: number };

export const fichaVacia = (): FichaDirectorio => ({
  documentoTipo: "", documentoNumero: "", sexo: "", fechaNacimiento: "", edad: null, edadAl: "", nacionalidad: NACIONALIDAD_SV,
  telefono: "", telefono2: "", correo: "", residencia: "sv", zona: "", departamento: "", municipio: "", distrito: "",
  direccion: "", pais: "", responsable: { nombre: "", parentesco: "", telefono: "" },
});

/** Ficha nueva: lo único que la cita ya sabe es el DUI. */
export function fichaSugerida(paciente: { dui?: string }): FichaDirectorio {
  const dui = normalizarDui(paciente.dui);
  return { ...fichaVacia(), ...(dui ? { documentoTipo: "dui", documentoNumero: dui } : {}) };
}

// ── Formato ─────────────────────────────────────────────────────────────────

const texto = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * "71234567" → "7123-4567". Con código de país se conserva ("+50212345678");
 * el de El Salvador se quita. Vacío si no se escribió; null si no es un teléfono.
 */
export function normalizarTelefono(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const conMas = s.startsWith("+");
  let d = s.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("503")) d = d.slice(3);
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  if (d.length >= 7 && d.length <= 15) return `${conMas ? "+" : ""}${d}`;
  return null;
}

/** Años cumplidos entre dos fechas "YYYY-MM-DD". */
function aniosEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split("-").map(Number);
  const [a2, m2, d2] = hasta.split("-").map(Number);
  return a2 - a1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

/**
 * Edad de hoy. Con fecha de nacimiento es exacta; con solo la edad anotada se
 * le suman los años que han pasado desde ese día (`aproximada`).
 */
export function edadDe(f: Pick<FichaDirectorio, "fechaNacimiento" | "edad" | "edadAl">, hoy: string): { anios: number; aproximada: boolean } | null {
  if (f.fechaNacimiento) return { anios: Math.max(0, aniosEntre(f.fechaNacimiento, hoy)), aproximada: false };
  if (f.edad === null || f.edad === undefined) return null;
  return { anios: f.edad + (f.edadAl ? Math.max(0, aniosEntre(f.edadAl, hoy)) : 0), aproximada: true };
}

/** El domicilio en una línea, de lo más cercano a lo más amplio. */
export function domicilioTexto(f: Pick<FichaDirectorio, "residencia" | "direccion" | "distrito" | "municipio" | "departamento" | "pais">): string {
  const partes = f.residencia === "exterior" ? [f.direccion, f.pais] : [f.direccion, f.distrito, f.municipio, f.departamento];
  return partes.filter(Boolean).join(", ");
}

/** Dónde queda un distrito dentro de su departamento (el municipio sale solo). */
export function municipioDeDistrito(departamento: string, distrito: string): string {
  return DEPARTAMENTOS_SV.find((d) => d.nombre === departamento)?.municipios.find((m) => m.distritos.includes(distrito))?.nombre ?? "";
}

/**
 * Tiene algo más que lo que viene puesto de entrada: la nacionalidad, el país
 * de residencia y el DUI que ya trae la cita (`duiDeCita`).
 */
export function tieneDatos(f: FichaDirectorio, duiDeCita = ""): boolean {
  const documento = f.documentoNumero && !(f.documentoTipo === "dui" && f.documentoNumero === normalizarDui(duiDeCita));
  return !!(documento || f.sexo || f.fechaNacimiento || f.edad !== null || f.telefono || f.telefono2 || f.correo
    || f.zona || f.departamento || f.direccion || f.pais || f.responsable.nombre || f.responsable.telefono
    || (f.nacionalidad && f.nacionalidad !== NACIONALIDAD_SV));
}

// ── Qué cambió (para la gestión que deja cada actualización) ────────────────

const GRUPOS: { nombre: string; campos: (f: FichaDirectorio) => unknown[] }[] = [
  { nombre: "teléfono", campos: (f) => [f.telefono, f.telefono2] },
  { nombre: "correo", campos: (f) => [f.correo] },
  { nombre: "documento", campos: (f) => [f.documentoTipo, f.documentoNumero] },
  // El día en que se anotó la edad no es un dato: se pone solo.
  { nombre: "nacimiento", campos: (f) => [f.fechaNacimiento, f.edad] },
  { nombre: "sexo", campos: (f) => [f.sexo] },
  // Sin anotar se entiende salvadoreña, igual que en tieneDatos().
  { nombre: "nacionalidad", campos: (f) => [f.nacionalidad || NACIONALIDAD_SV] },
  { nombre: "domicilio", campos: (f) => [f.residencia, f.zona, f.departamento, f.municipio, f.distrito, f.direccion, f.pais] },
  { nombre: "responsable", campos: (f) => [f.responsable.nombre, f.responsable.parentesco, f.responsable.telefono] },
];

/**
 * Qué datos cambian al guardar, por grupo ("teléfono", "domicilio"…). Sin ficha
 * previa se compara con lo que ya se sabía (el DUI de la cita y lo que viene
 * marcado de entrada): repetirlo no es un cambio.
 */
export function camposCambiados(previa: FichaDirectorio | null | undefined, nueva: FichaDirectorio, duiDeCita = ""): string[] {
  const base = previa ?? fichaSugerida({ dui: duiDeCita });
  return GRUPOS.filter((g) => JSON.stringify(g.campos(base)) !== JSON.stringify(g.campos(nueva))).map((g) => g.nombre);
}

/** "Completó en el directorio: teléfono, domicilio y responsable." */
export function textoActualizacion(campos: string[], primera: boolean): string {
  const orden = GRUPOS.map((g) => g.nombre).filter((n) => campos.includes(n));
  const lista = orden.length > 1 ? `${orden.slice(0, -1).join(", ")} y ${orden[orden.length - 1]}` : orden[0] ?? "datos del paciente";
  return `${primera ? "Completó" : "Actualizó"} en el directorio: ${lista}.`;
}

// ── Validación (la misma en la pantalla y en la API) ────────────────────────

const falla = (error: string): { ok: false; error: string } => ({ ok: false, error });
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const esCorreo = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/**
 * Todo es opcional, pero lo que se escriba tiene que estar bien y algo hay que
 * escribir. `previa` es la ficha ya guardada: si la edad anotada no cambió,
 * conserva el día en que se anotó. `duiDeCita` es el DUI que ya se conoce del
 * paciente: repetirlo no cuenta como haber completado algo.
 */
export function validarFicha(
  v: unknown, hoy: string, ya: { previa?: Pick<FichaDirectorio, "edad" | "edadAl"> | null; duiDeCita?: string } = {},
): Resultado<FichaDirectorio> {
  const { previa, duiDeCita } = ya;
  const o = obj(v);
  const f = fichaVacia();

  // Documento
  const numero = texto(o.documentoNumero, 30).toUpperCase();
  f.documentoTipo = TIPOS_DOCUMENTO.some((t) => t.id === o.documentoTipo) ? String(o.documentoTipo) : "";
  if (numero && !f.documentoTipo) return falla("Elija el tipo de documento.");
  if (f.documentoTipo === "dui" && numero) {
    f.documentoNumero = normalizarDui(numero);
    if (!f.documentoNumero) return falla("El DUI debe tener 9 dígitos.");
  } else {
    f.documentoNumero = numero;
  }
  // Sin número, el tipo solo no dice nada.
  if (!f.documentoNumero) f.documentoTipo = "";

  f.sexo = SEXOS.some((s) => s.id === o.sexo) ? String(o.sexo) : "";

  // Nacimiento o edad
  const nacimiento = texto(o.fechaNacimiento, 10);
  if (nacimiento) {
    if (!esFecha(nacimiento) || nacimiento > hoy || nacimiento < "1900-01-01") return falla("La fecha de nacimiento no es válida.");
    f.fechaNacimiento = nacimiento;
  } else if (o.edad !== null && o.edad !== undefined && o.edad !== "") {
    const edad = Number(o.edad);
    if (!Number.isInteger(edad) || edad < 0 || edad > 120) return falla("La edad no es válida.");
    f.edad = edad;
    f.edadAl = previa && previa.edad === edad && esFecha(previa.edadAl) && previa.edadAl <= hoy ? previa.edadAl : hoy;
  }

  f.nacionalidad = texto(o.nacionalidad, 60);

  // Contacto
  const tel = normalizarTelefono(o.telefono);
  const tel2 = normalizarTelefono(o.telefono2);
  if (tel === null || tel2 === null) return falla("El teléfono debe tener 8 dígitos (o el código de país con +).");
  f.telefono = tel || tel2;
  f.telefono2 = tel && tel2 !== tel ? tel2 : "";
  f.correo = texto(o.correo, 120).toLowerCase();
  if (f.correo && !esCorreo(f.correo)) return falla("El correo electrónico no es válido.");

  // Domicilio
  f.residencia = o.residencia === "exterior" ? "exterior" : "sv";
  f.direccion = texto(o.direccion, 240);
  if (f.residencia === "exterior") {
    f.pais = texto(o.pais, 60);
  } else {
    f.zona = ZONAS.some((z) => z.id === o.zona) ? String(o.zona) : "";
    const departamento = DEPARTAMENTOS_SV.find((d) => d.nombre === o.departamento);
    if (departamento) {
      f.departamento = departamento.nombre;
      const distrito = texto(o.distrito, 80);
      const municipio = departamento.municipios.find((m) => m.distritos.includes(distrito)) ?? departamento.municipios.find((m) => m.nombre === o.municipio);
      if (municipio) {
        f.municipio = municipio.nombre;
        f.distrito = municipio.distritos.includes(distrito) ? distrito : "";
      }
    }
  }

  // Responsable
  const r = obj(o.responsable);
  const telR = normalizarTelefono(r.telefono);
  if (telR === null) return falla("El teléfono del responsable debe tener 8 dígitos (o el código de país con +).");
  f.responsable = { nombre: texto(r.nombre, 160), parentesco: texto(r.parentesco, 40), telefono: telR };
  if (!f.responsable.nombre && (f.responsable.telefono || f.responsable.parentesco)) return falla("Escriba el nombre del responsable.");

  if (!tieneDatos(f, duiDeCita)) return falla("Complete al menos un dato del paciente.");
  return { ok: true, datos: f };
}
