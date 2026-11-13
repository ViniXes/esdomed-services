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
// La enfermera llama al paciente directo al consultorio de su médico. La
// preconsulta (signos vitales) se coordina de palabra con enfermería y no pasa
// por el sistema (decisión del usuario, 2026-11-13). "Volver a llamar" repite
// el llamado (y el anuncio) sin cambiar de estado. La cola solo sugiere el
// orden: la enfermera elige a quién llamar.

import { especialidadPorId, resolverEspecialidad, type EstacionCEId } from "./especialidades";

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
  llamar: "Llamar a consultorio",
  volver_a_llamar: "Volver a llamar",
  paso_a_consulta: "Pasó a consulta",
  no_respondio: "No respondió",
  regreso: "Regresó",
  devolver_a_espera: "Devolver a la espera",
};

export const ETIQUETA_ESTADO: Record<EstadoCitaCE, string> = {
  citado: "Citado",
  espera: "En espera",
  llamado: "Llamado a consultorio",
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

export interface LlamadoPantalla {
  /** Identifica cada anuncio; un "Volver a llamar" genera uno nuevo. */
  id: string;
  citaId: string;
  codigo: string;
  destino: string;
  estacionId: EstacionCEId;
  /** Milisegundos (Date.now()); en un arreglo no cabe serverTimestamp. */
  enMs: number;
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
