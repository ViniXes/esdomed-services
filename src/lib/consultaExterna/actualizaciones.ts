// Actualizaciones de datos de pacientes en el SIS que registran las digitadoras
// de Consulta Externa (agenda_ce). En services solo queda el registro de que se
// hizo (quién, cuándo, qué), para su productividad: los datos del paciente no se
// cambian aquí. Lógica pura, sin Firebase.

export const COLECCION_ACTUALIZACIONES_CE = "consulta_externa_actualizaciones";
/** Contador por persona y día (id `${fecha}_${uid}`), para hacer cumplir el tope. */
export const COLECCION_ACTUALIZACIONES_DIA_CE = "consulta_externa_actualizaciones_dia";

/** Tope fijo de actualizaciones por persona y por día (pedido del usuario, 2026-11-20). */
export const TOPE_ACTUALIZACIONES_DIA = 100;

export const TIPOS_ACTUALIZACION = [
  { id: "identificacion", label: "Datos personales (documento de identificación)", corto: "Identificación" },
  { id: "responsable", label: "Datos del responsable", corto: "Responsable" },
] as const;
export type TipoActualizacion = (typeof TIPOS_ACTUALIZACION)[number]["id"];

export function sanearTipos(v: unknown): TipoActualizacion[] {
  if (!Array.isArray(v)) return [];
  const validos = new Set<string>(TIPOS_ACTUALIZACION.map((t) => t.id));
  return TIPOS_ACTUALIZACION.map((t) => t.id).filter((id) => v.includes(id) && validos.has(id));
}

/** Hoy en El Salvador, YYYY-MM-DD. */
export function hoySV(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(ahora);
}

/** Una actualización por persona, paciente y día: marcarla otra vez no cuenta doble. */
export function idActualizacion(fecha: string, uid: string, expediente: string): string {
  return `${fecha}_${uid}_${expediente}`;
}

export function idContadorDia(fecha: string, uid: string): string {
  return `${fecha}_${uid}`;
}

export function esFechaISO(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCDate() === Number(m[3]) && d.getUTCMonth() === Number(m[2]) - 1;
}

export interface PacientePool {
  expediente: string;
  nombre: string;
  /** De dónde salió: cita del día (con su especialidad) o expediente creado ese día. */
  origen: string;
}

/** Une citados y creados del día, sin repetir expediente; la cita manda. */
export function unirPool(citados: PacientePool[], creados: PacientePool[]): PacientePool[] {
  const mapa = new Map<string, PacientePool>();
  for (const p of [...citados, ...creados]) {
    const previo = mapa.get(p.expediente);
    if (!previo) mapa.set(p.expediente, { ...p });
    else if (!previo.origen.includes(p.origen)) previo.origen = `${previo.origen} · ${p.origen}`;
  }
  return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
