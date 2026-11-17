// Circuito de una cita en la estación de Consulta Externa: qué acción lleva a
// qué estado, el orden de las colas y el texto del destino en la pantalla.
// Puro (sin Firestore) para poder probarlo: scripts/test-consulta-externa.mjs.
//
//   citado ──Llegó──▶ espera ──Llamar──▶ llamado ──Pasó a consulta──▶ atendido
//                       ▲  ▲                │
//                       │  └─Devolver───────┤
//                       │                   │ No respondió
//                       └──Regresó── no_respondio
//
// La enfermera llama al paciente a su estación por expediente y nombre; de
// ahí lo pasa al consultorio de su médico (desde el 2026-11-17 la pantalla ya
// no anuncia el consultorio, decisión del usuario). La preconsulta (signos
// vitales) se coordina de palabra con enfermería y no pasa por el sistema
// (2026-11-13). "Volver a llamar" repite el llamado (y el anuncio) sin cambiar
// de estado. La cola solo sugiere el orden: la enfermera elige a quién llamar.

import { especialidadPorId, estacionPorId, resolverEspecialidad, type EstacionCEId } from "./especialidades";

export type EstadoCitaCE = "citado" | "espera" | "llamado" | "atendido" | "no_respondio";

export type AccionCE =
  | "llego"
  | "quitar_llegada"
  | "llamar"
  | "volver_a_llamar"
  | "paso_a_consulta"
  | "no_respondio"
  | "regreso"
  | "devolver_a_espera";

export const ETIQUETA_ACCION: Record<AccionCE, string> = {
  llego: "Llegó",
  quitar_llegada: "Quitar llegada",
  llamar: "Llamar",
  volver_a_llamar: "Volver a llamar",
  paso_a_consulta: "Pasó a consulta",
  no_respondio: "No respondió",
  regreso: "Regresó",
  devolver_a_espera: "Devolver a la espera",
};

export const ETIQUETA_ESTADO: Record<EstadoCitaCE, string> = {
  citado: "Citado",
  espera: "En espera",
  llamado: "Llamado",
  atendido: "Pasó a consulta",
  no_respondio: "No respondió",
};

/**
 * Estados de la primera versión, que tenía preconsulta (solo los usó la
 * prueba del 13/11/2026). Se leen como su equivalente actual.
 */
const ESTADOS_ANTERIORES: Record<string, EstadoCitaCE> = {
  espera_preconsulta: "espera",
  espera_consultorio: "espera",
  llamado_preconsulta: "llamado",
  llamado_consultorio: "llamado",
};

export function normalizarEstado(estado: string): EstadoCitaCE {
  return ESTADOS_ANTERIORES[estado] ?? (estado as EstadoCitaCE);
}

export interface Transicion {
  estado: EstadoCitaCE;
  /** La acción anuncia un llamado en las pantallas. */
  anuncia?: boolean;
}

/**
 * Estado al que lleva una acción, o null si no aplica en el estado actual
 * (p. ej. alguien ya movió la cita desde otra computadora).
 */
export function aplicarAccion(estadoGuardado: string, accion: AccionCE): Transicion | null {
  const estado = normalizarEstado(estadoGuardado);
  switch (accion) {
    case "llego":
      return estado === "citado" ? { estado: "espera" } : null;
    case "quitar_llegada":
      return estado === "espera" ? { estado: "citado" } : null;
    case "llamar":
      return estado === "espera" ? { estado: "llamado", anuncia: true } : null;
    case "volver_a_llamar":
      return estado === "llamado" ? { estado: "llamado", anuncia: true } : null;
    case "paso_a_consulta":
      return estado === "llamado" ? { estado: "atendido" } : null;
    case "no_respondio":
      return estado === "llamado" ? { estado: "no_respondio" } : null;
    case "regreso":
      return estado === "no_respondio" ? { estado: "espera" } : null;
    case "devolver_a_espera":
      return estado === "llamado" ? { estado: "espera" } : null;
  }
}

/** Acciones que se ofrecen en cada estado; la primera es la principal. */
export function accionesDe(estadoGuardado: string): AccionCE[] {
  switch (normalizarEstado(estadoGuardado)) {
    case "citado":
      return ["llego"];
    case "espera":
      return ["llamar", "quitar_llegada"];
    case "llamado":
      return ["paso_a_consulta", "volver_a_llamar", "no_respondio", "devolver_a_espera"];
    case "no_respondio":
      return ["regreso"];
    case "atendido":
      return [];
  }
}

// ─── Colas ──────────────────────────────────────────────────────────────────

export interface CitaEnCola {
  franjaInicio: string;
  numero: number;
  /** Milisegundos de la llegada; null si aún no llegó. */
  llegadaMs: number | null;
}

/**
 * Orden sugerido: primero la franja de la cita (la agenda manda), dentro de la
 * franja quien llegó antes, y si no hay hora de llegada, el número del código.
 */
export function compararCola(a: CitaEnCola, b: CitaEnCola): number {
  return (
    a.franjaInicio.localeCompare(b.franjaInicio) ||
    (a.llegadaMs ?? Infinity) - (b.llegadaMs ?? Infinity) ||
    a.numero - b.numero
  );
}

// ─── Destino en pantalla ────────────────────────────────────────────────────

/** "Cardiologia - 3" → "Consultorio 3 de Cardiología" (con el nombre del catálogo). */
export function nombreConsultorio(consultorio: string, especialidadId?: string): string {
  const m = String(consultorio ?? "").trim().match(/^(.*?)\s*-\s*(\d+)$/);
  if (!m) return consultorio ? `Consultorio ${consultorio}` : "Consultorio";
  const esp = resolverEspecialidad(m[1]) ?? (especialidadId ? especialidadPorId(especialidadId) : undefined);
  return `Consultorio ${m[2]} de ${esp?.nombre ?? m[1]}`;
}

// ─── Documento de llamados (lo que escuchan las pantallas) ──────────────────
//
// Desde el 2026-11-17 se llama por expediente y nombre, a la estación de
// enfermería (decisión del usuario); antes, por código ("HE-12", para no
// mostrar nombres) y al consultorio. Los llamados anteriores solo traen
// `codigo` y la pantalla los sigue mostrando así.

export interface LlamadoPantalla {
  /** Identifica cada anuncio; un "Volver a llamar" genera uno nuevo. */
  id: string;
  /**
   * Agrupa los llamados de una misma persona: el id de su cita, o
   * idLlamadoManual() si la enfermera escribió los datos a mano.
   */
  citaId: string;
  /** En orden natural, listo para mostrar y leer (ver nombreParaLlamado). */
  paciente?: string;
  expediente?: string;
  /** Solo en los llamados anteriores al 2026-11-17. */
  codigo?: string;
  /** "Estación Cardiología" (ver destinoEstacion); antes, el consultorio. */
  destino: string;
  estacionId: EstacionCEId;
  /** Milisegundos (Date.now()); en un arreglo no cabe serverTimestamp. */
  enMs: number;
  /** Escrito a mano en la estación: paciente que no está en la agenda del día. */
  manual?: boolean;
  /** Quién lo escribió (solo en los manuales, que no tienen cita con historial). */
  porNombre?: string;
}

export const MAX_LLAMADOS_PANTALLA = 8;

/**
 * Pone el llamado nuevo arriba. Si la misma cita ya estaba en la lista (un
 * "Volver a llamar"), se quita la entrada anterior para no repetirla.
 */
export function agregarLlamado(
  ultimos: LlamadoPantalla[],
  nuevo: LlamadoPantalla,
  max = MAX_LLAMADOS_PANTALLA,
): LlamadoPantalla[] {
  return [nuevo, ...ultimos.filter((l) => l.citaId !== nuevo.citaId)].slice(0, max);
}

/** Quita de la pantalla los llamados de una cita (al devolverla a la espera por error). */
export function quitarLlamadosDeCita(ultimos: LlamadoPantalla[], citaId: string): LlamadoPantalla[] {
  return ultimos.filter((l) => l.citaId !== citaId);
}

// ─── Nombre y expediente para el llamado ────────────────────────────────────

/** Partículas que van en minúscula dentro de un nombre ("José de León"). */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "vda.", "viuda"]);

const mayusculaInicial = (palabra: string) =>
  palabra.replace(/(^|[-'’])([a-záéíóúüñ])/g, (_, sep: string, letra: string) => sep + letra.toUpperCase());

/**
 * Nombre como se muestra y se lee en la pantalla. El SIS lo escribe
 * "Apellidos, Nombres"; aquí va en orden natural ("María Pilar López
 * Gonzales"). Si viene todo en mayúsculas (o todo en minúsculas) se pasa a
 * nombre propio: se lee mejor de lejos y la voz no deletrea palabras cortas
 * como si fueran siglas.
 */
export function nombreParaLlamado(nombre: string): string {
  let n = String(nombre ?? "").replace(/\s+/g, " ").trim();
  const coma = n.indexOf(",");
  if (coma >= 0) {
    const apellidos = n.slice(0, coma).trim();
    const nombres = n.slice(coma + 1).replace(/,/g, " ").replace(/\s+/g, " ").trim();
    n = [nombres, apellidos].filter(Boolean).join(" ");
  }
  if (n === n.toUpperCase() || n === n.toLowerCase()) {
    n = n
      .toLowerCase()
      .split(" ")
      .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : mayusculaInicial(p)))
      .join(" ");
  }
  return n;
}

/** Expediente escrito a mano, sin espacios: " 11431 - 26 " → "11431-26". */
export function limpiarExpediente(expediente: string): string {
  return String(expediente ?? "").replace(/\s+/g, "").toUpperCase();
}

/**
 * citaId de un llamado manual. Volver a llamar al mismo expediente desde la
 * misma estación reemplaza su entrada en la pantalla en vez de repetirla.
 */
export function idLlamadoManual(estacionId: EstacionCEId, expediente: string): string {
  return `manual:${estacionId}:${limpiarExpediente(expediente)}`;
}

/** Destino de todo llamado: la estación de enfermería que llama ("Estación Cardiología"). */
export function destinoEstacion(estacionId: EstacionCEId): string {
  return `Estación ${estacionPorId(estacionId)?.nombre ?? estacionId}`;
}

/** Lo que la pantalla muestra en grande: el nombre, o el código en los llamados anteriores. */
export function tituloLlamado(l: Pick<LlamadoPantalla, "paciente" | "codigo">): string {
  return l.paciente || l.codigo || "";
}
