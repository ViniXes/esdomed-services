// PROVISIONAL. Pacientes sin DUI en el SIS (pedido del usuario, 2026-11-24). La
// mayoría se crearon con la fecha de nacimiento genérica 10/10/2000 porque el
// reporte que se recibió en su momento solo traía nombres: su edad en el SIS es
// falsa. Ya están en services, en las agendas cargadas (consulta_externa_citas),
// pero el Catálogo de tarjetas no los muestra porque no tienen DUI.
//
// La pestaña "Fecha genérica" de Consulta Externa los lista como el Catálogo de
// tarjetas, señala a los que tienen cita hoy y lleva la cuenta de cuántos faltan,
// para que nadie les cree otro expediente ni los atrase. Salen de los pendientes
// solos cuando vuelven a aparecer con DUI en una agenda (entran al Catálogo de
// tarjetas) o cuando alguien los marca como corregidos o unificados. El reporte
// del SIS de fecha genérica, si se cargó, dice quiénes tienen la 10/10/2000 (solo
// eso y sus citas: sin teléfonos, madre ni responsable, que no hacen falta).
// Cuando no queden, se quita (ver CLAUDE.md).
//
// Lógica pura, sin imports: la prueba es scripts/test-fecha-generica.mjs.

export const COLECCION_FECHA_GENERICA = "consulta_externa_fecha_generica";
/**
 * Un solo documento: `reporte` (lo que trajo el reporte del SIS, por
 * expediente) y `marcas` (lo que se marcó en services, por expediente).
 */
export const DOC_FECHA_GENERICA = "lista";

/** La fecha que se les puso al crearlos. */
export const FECHA_GENERICA_ISO = "2000-10-10";
export const FECHA_GENERICA_TEXTO = "10/10/2000";

/** con_dui: volvió a aparecer con DUI en una agenda cargada (está en el Catálogo de tarjetas). */
export type EstadoFechaGenerica = "pendiente" | "corregido" | "unificado" | "con_dui";

export const NOMBRE_ESTADO_FG: Record<EstadoFechaGenerica, string> = {
  pendiente: "Pendiente",
  corregido: "Datos corregidos",
  unificado: "Unificado",
  con_dui: "Ya tiene DUI",
};

export interface CitaAgendaFG {
  /** YYYY-MM-DD */
  fecha: string;
  especialidad: string;
  /** Id del catálogo de especialidades (vacío si no se reconoció). */
  especialidadId: string;
  medico?: string;
  /** Estado en el circuito de la estación (solo las de la agenda cargada). */
  estado?: string;
  /** "agenda": cita cargada en services; "reporte": la trae el reporte del SIS. */
  origen: "agenda" | "reporte";
}

export interface ResolucionFG {
  porNombre: string;
  /** uid de quien lo marcó; vacío si viene del reporte del SIS. */
  por: string;
  /** Milisegundos. */
  en: number;
  origen: "sis" | "services";
  nota?: string;
}

/** Lo que trae el reporte del SIS de fecha genérica, por expediente. */
export interface EntradaReporteFG {
  paciente: string;
  citasAgenda: { fecha: string; especialidad: string; especialidadId: string }[];
  /** Si el reporte ya lo traía corregido o unificado. */
  estadoSis?: "corregido" | "unificado";
  unificadoCon?: string;
}

/** Lo que se marcó en services, por expediente. */
export interface MarcaFG {
  estado: "pendiente" | "corregido" | "unificado";
  unificadoCon?: string;
  resuelto?: ResolucionFG;
}

export interface PacienteFechaGenerica {
  expediente: string;
  /** "Apellidos, Nombres", como lo escribe el SIS. */
  paciente: string;
  /** Está en el reporte del SIS de fecha genérica (10/10/2000). */
  fechaGenerica: boolean;
  citas: CitaAgendaFG[];
  estado: EstadoFechaGenerica;
  unificadoCon?: string;
  resuelto?: ResolucionFG;
}

export interface CitaSinDui {
  expediente: string;
  paciente: string;
  fecha: string;
  especialidad: string;
  especialidadId: string;
  medico: string;
  estado: string;
}

/**
 * Arma la lista: los pacientes sin DUI de las agendas cargadas más los del
 * reporte del SIS. Manda lo marcado en services; si no hay marca, el que ya
 * aparece con DUI sale como "con_dui", y si no, lo que diga el reporte.
 */
export function armarListaFG(fuentes: {
  citasSinDui: CitaSinDui[];
  conDui: Set<string>;
  reporte: Record<string, EntradaReporteFG>;
  marcas: Record<string, MarcaFG>;
}): PacienteFechaGenerica[] {
  const { citasSinDui, conDui, reporte, marcas } = fuentes;
  const porExp = new Map<string, { paciente: string; ultimaFecha: string; citas: CitaAgendaFG[] }>();
  for (const c of citasSinDui) {
    const exp = normalizarExpedienteFG(c.expediente);
    if (!exp) continue;
    const p = porExp.get(exp) ?? { paciente: "", ultimaFecha: "", citas: [] };
    // Manda el nombre de la cita más reciente.
    if (c.fecha >= p.ultimaFecha) { p.paciente = c.paciente; p.ultimaFecha = c.fecha; }
    p.citas.push({ fecha: c.fecha, especialidad: c.especialidad, especialidadId: c.especialidadId, medico: c.medico, estado: c.estado, origen: "agenda" });
    porExp.set(exp, p);
  }
  const expedientes = new Set([...porExp.keys(), ...Object.keys(reporte)]);
  return [...expedientes].map((expediente) => {
    const deAgenda = porExp.get(expediente);
    const rep = reporte[expediente];
    // Citas de la agenda cargada; del reporte, las que no estén ya (misma fecha y especialidad).
    const citas = [...(deAgenda?.citas ?? [])];
    for (const c of rep?.citasAgenda ?? []) {
      if (!citas.some((x) => x.fecha === c.fecha && x.especialidadId === c.especialidadId)) citas.push({ ...c, origen: "reporte" });
    }
    citas.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const marca = marcas[expediente];
    let estado: EstadoFechaGenerica = "pendiente";
    let unificadoCon: string | undefined;
    let resuelto: ResolucionFG | undefined;
    if (marca) {
      estado = marca.estado;
      unificadoCon = marca.unificadoCon;
      resuelto = marca.resuelto;
    } else if (conDui.has(expediente)) {
      estado = "con_dui";
    } else if (rep?.estadoSis) {
      estado = rep.estadoSis;
      unificadoCon = rep.unificadoCon;
      resuelto = { porNombre: "", por: "", en: 0, origen: "sis" };
    }
    return {
      expediente,
      paciente: deAgenda?.paciente || rep?.paciente || "",
      fechaGenerica: !!rep,
      citas,
      estado,
      ...(unificadoCon ? { unificadoCon } : {}),
      ...(resuelto ? { resuelto } : {}),
    };
  });
}

// ── Lectura del reporte del SIS ─────────────────────────────────────────────

/** Sin tildes, minúsculas y espacios simples. */
export function claveTextoFG(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "  9113 - 26 " → "9113-26". */
export function normalizarExpedienteFG(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, "").replace(/[‐-―]/g, "-").toUpperCase();
}

/** El SIS escribe "NO PROPORCIONADO NO PROPORCIONADO" cuando no hay dato. */
export function limpiarDatoSis(s: unknown): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return /^(no proporcionado\s*)+$/i.test(t) || t === "-" ? "" : t;
}

/** "08/10/2026 Hematología; 17/11/2026 Hematología" → citas (sin resolver la especialidad). */
export function leerCitasAgenda(texto: unknown): { fecha: string; especialidad: string }[] {
  return String(texto ?? "")
    .split(";")
    .map((p) => p.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(.+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ fecha: `${m[3]}-${m[2]}-${m[1]}`, especialidad: m[4].trim() }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Hoja "Unificados o ya actualizados": "Expediente Unificado Con 15062-26" o "Fecha de nacimiento ya cambiada". */
export function estadoSegunSis(texto: unknown): { estado: "corregido" | "unificado"; unificadoCon?: string } | null {
  const t = String(texto ?? "").trim();
  const unificado = t.match(/unificado\s+con\s+(\S+)/i);
  if (unificado) return { estado: "unificado", unificadoCon: normalizarExpedienteFG(unificado[1]) };
  if (/fecha de nacimiento ya cambiada/i.test(t)) return { estado: "corregido" };
  return null;
}

// ── Pantalla ────────────────────────────────────────────────────────────────

/** Años cumplidos entre dos fechas YYYY-MM-DD. */
export function edadEnAnios(nacimientoISO: string, hoyISO: string): number {
  const [an, mn, dn] = nacimientoISO.split("-").map(Number);
  const [ah, mh, dh] = hoyISO.split("-").map(Number);
  return ah - an - (mh < mn || (mh === mn && dh < dn) ? 1 : 0);
}

/** La primera cita de la agenda desde hoy (inclusive), si tiene. */
export function proximaCitaFG(p: { citas: CitaAgendaFG[] }, hoyISO: string): CitaAgendaFG | null {
  return p.citas.find((c) => c.fecha >= hoyISO) ?? null;
}

/** Tiene cita hoy, en la agenda cargada o en el reporte. */
export function citaDeHoyFG(p: { citas: CitaAgendaFG[] }, hoyISO: string): CitaAgendaFG | null {
  return p.citas.find((c) => c.fecha === hoyISO && c.origen === "agenda") ?? p.citas.find((c) => c.fecha === hoyISO) ?? null;
}

export function resumenFechaGenerica(lista: { estado: EstadoFechaGenerica }[]) {
  const r = { total: lista.length, pendiente: 0, corregido: 0, unificado: 0, con_dui: 0 };
  for (const p of lista) r[p.estado] += 1;
  return r;
}

export type OrdenFG = "nombre" | "proxima";
/** cita_hoy: pendientes con cita hoy (lo que más urge). */
export type FiltroEstadoFG = EstadoFechaGenerica | "cita_hoy" | "resueltos" | "todos";

export function coincideFiltroEstadoFG(p: PacienteFechaGenerica, filtro: FiltroEstadoFG, hoyISO: string): boolean {
  if (filtro === "todos") return true;
  if (filtro === "resueltos") return p.estado !== "pendiente";
  if (filtro === "cita_hoy") return p.estado === "pendiente" && !!citaDeHoyFG(p, hoyISO);
  return p.estado === filtro;
}

/**
 * Buscador: por expediente (lo escrito está dentro del expediente) o por
 * nombre (cada palabra en cualquier
 * orden, sin tildes ni mayúsculas).
 */
export function coincideFG(p: PacienteFechaGenerica, consulta: string): boolean {
  const q = claveTextoFG(consulta);
  if (q.length < 2) return true;
  const exp = normalizarExpedienteFG(consulta);
  if (/^\d[\d-]*$/.test(exp)) return p.expediente.includes(exp);
  const texto = claveTextoFG(`${p.paciente} ${p.expediente}`);
  return q.split(" ").every((palabra) => texto.includes(palabra));
}

export function filtrarFechaGenerica(
  lista: PacienteFechaGenerica[],
  consulta: string,
  opciones: { estado: FiltroEstadoFG; especialidadId: string; orden: OrdenFG; hoyISO: string },
): PacienteFechaGenerica[] {
  const { estado, especialidadId, orden, hoyISO } = opciones;
  const salida = lista.filter((p) =>
    coincideFiltroEstadoFG(p, estado, hoyISO)
    && (!especialidadId || p.citas.some((c) => c.especialidadId === especialidadId))
    && coincideFG(p, consulta));
  const porNombre = (a: PacienteFechaGenerica, b: PacienteFechaGenerica) =>
    a.paciente.localeCompare(b.paciente, "es");
  if (orden === "proxima") {
    // Primero los que tienen cita más pronto; los que ya no tienen cita, al final.
    const clave = (p: PacienteFechaGenerica) => proximaCitaFG(p, hoyISO)?.fecha ?? "9999-99-99";
    return salida.sort((a, b) => clave(a).localeCompare(clave(b)) || porNombre(a, b));
  }
  return salida.sort(porNombre);
}

/** Al marcar como unificado: el expediente destino es obligatorio y no puede ser el mismo. */
export function validarUnificacion(expediente: string, destinoCrudo: string): string | null {
  const destino = normalizarExpedienteFG(destinoCrudo);
  if (!destino) return "Escriba el expediente con el que se unificó.";
  if (!/^\d{1,6}-\d{2}$/.test(destino)) return "El expediente debe tener la forma 12345-26.";
  if (destino === normalizarExpedienteFG(expediente)) return "No puede unificarse consigo mismo.";
  return null;
}
