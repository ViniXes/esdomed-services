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

// ── Vista del equipo (admin) ──────────────────────────────────────────────────

/** Quién ve lo que registró cada persona (pedido del usuario, 2026-11-23). */
export const ROLES_VEN_ACTUALIZACIONES_EQUIPO: readonly string[] = ["admin"];
/** Rango máximo de la vista del equipo, en días. */
export const MAX_DIAS_EQUIPO = 93;

export interface RegistroActualizacionEquipo {
  fecha: string;
  hechoPor: string;
  hechoPorNombre: string;
  expediente: string;
  pacienteNombre: string;
  tipos: TipoActualizacion[];
  /** Milisegundos; null si aún no se resolvió la hora del servidor. */
  hechoEn: number | null;
}

export interface PersonaActualizaciones {
  uid: string;
  nombre: string;
  total: number;
  identificacion: number;
  responsable: number;
  /** Días del rango en que registró al menos una. */
  dias: number;
  ultimaEn: number | null;
}

export interface DiaActualizaciones {
  fecha: string;
  total: number;
  porPersona: Record<string, number>;
}

/** Días entre dos fechas YYYY-MM-DD, contando ambas (0 si el rango no es válido). */
export function diasDelRango(desde: string, hasta: string): number {
  if (!esFechaISO(desde) || !esFechaISO(hasta) || desde > hasta) return 0;
  const ms = (iso: string) => { const [a, m, d] = iso.split("-").map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((ms(hasta) - ms(desde)) / 86400000) + 1;
}

/** Por persona (más registros primero) y por día (más reciente primero). */
export function resumenActualizacionesEquipo(registros: RegistroActualizacionEquipo[]): {
  personas: PersonaActualizaciones[];
  dias: DiaActualizaciones[];
} {
  const personas = new Map<string, PersonaActualizaciones & { fechas: Set<string> }>();
  const dias = new Map<string, DiaActualizaciones>();
  for (const r of registros) {
    if (!r.hechoPor) continue;
    let p = personas.get(r.hechoPor);
    if (!p) {
      p = { uid: r.hechoPor, nombre: r.hechoPorNombre || "Sin nombre", total: 0, identificacion: 0, responsable: 0, dias: 0, ultimaEn: null, fechas: new Set() };
      personas.set(r.hechoPor, p);
    }
    p.total += 1;
    if (r.tipos.includes("identificacion")) p.identificacion += 1;
    if (r.tipos.includes("responsable")) p.responsable += 1;
    p.fechas.add(r.fecha);
    if (r.hechoEn !== null && (p.ultimaEn === null || r.hechoEn > p.ultimaEn)) p.ultimaEn = r.hechoEn;
    if (!p.nombre || p.nombre === "Sin nombre") p.nombre = r.hechoPorNombre || p.nombre;

    let d = dias.get(r.fecha);
    if (!d) { d = { fecha: r.fecha, total: 0, porPersona: {} }; dias.set(r.fecha, d); }
    d.total += 1;
    d.porPersona[r.hechoPor] = (d.porPersona[r.hechoPor] ?? 0) + 1;
  }
  return {
    personas: Array.from(personas.values())
      .map(({ fechas, ...p }) => ({ ...p, dias: fechas.size }))
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es")),
    dias: Array.from(dias.values()).sort((a, b) => b.fecha.localeCompare(a.fecha)),
  };
}
