// Circuito de una cita en la estación de Consulta Externa: qué acción lleva a
// qué estado, el orden de las colas y el texto del destino en la pantalla.
// Puro (sin Firestore) para poder probarlo: scripts/test-consulta-externa.mjs.
//
//   citado ──Llegó──▶ espera_preconsulta ──Llamar──▶ llamado_preconsulta
//                       ▲                              │ Preconsulta lista
//                       │ Regresó                      ▼
//                 no_respondio ◀──No respondió── espera_consultorio ──Llamar──▶ llamado_consultorio
//                       │ Regresó                      ▲                        │ Pasó a consulta
//                       └──────────────────────────────┘                        ▼
//                                                                            atendido
//
// "Volver a llamar" repite el llamado (y el anuncio) sin cambiar de estado.
// "No respondió" sale de un llamado; "Regresó" lo devuelve a la espera de la
// etapa en la que estaba. La enfermera elige a quién llamar: las colas solo
// sugieren el orden.

import { especialidadPorId, estacionPorId, resolverEspecialidad, type EstacionCEId } from "./especialidades";

export type EstadoCitaCE =
  | "citado"
  | "espera_preconsulta"
  | "llamado_preconsulta"
  | "espera_consultorio"
  | "llamado_consultorio"
  | "atendido"
  | "no_respondio";

export type EtapaCE = "preconsulta" | "consultorio";

export type AccionCE =
  | "llego"
  | "quitar_llegada"
  | "llamar"
  | "volver_a_llamar"
  | "preconsulta_lista"
  | "paso_a_consulta"
  | "no_respondio"
  | "regreso"
  | "devolver_a_espera";

export const ETIQUETA_ACCION: Record<AccionCE, string> = {
  llego: "Llegó",
  quitar_llegada: "Quitar llegada",
  llamar: "Llamar",
  volver_a_llamar: "Volver a llamar",
  preconsulta_lista: "Preconsulta lista",
  paso_a_consulta: "Pasó a consulta",
  no_respondio: "No respondió",
  regreso: "Regresó",
  devolver_a_espera: "Devolver a la espera",
};

export const ETIQUETA_ESTADO: Record<EstadoCitaCE, string> = {
  citado: "Citado",
  espera_preconsulta: "Espera preconsulta",
  llamado_preconsulta: "Llamado a preconsulta",
  espera_consultorio: "Espera consultorio",
  llamado_consultorio: "Llamado a consultorio",
  atendido: "Pasó a consulta",
  no_respondio: "No respondió",
};

export interface Transicion {
  estado: EstadoCitaCE;
  /** Etapa en la que quedó un "No respondió" (para devolverlo con "Regresó"). */
  etapaNoRespondio?: EtapaCE | null;
  /** Si la acción anuncia un llamado en las pantallas, a qué destino. */
  llamado?: EtapaCE;
}

/**
 * Estado al que lleva una acción, o null si no aplica en el estado actual
 * (p. ej. alguien ya la movió desde otra computadora).
 */
export function aplicarAccion(
  estado: EstadoCitaCE,
  accion: AccionCE,
  etapaNoRespondio?: EtapaCE | null,
): Transicion | null {
  switch (accion) {
    case "llego":
      return estado === "citado" ? { estado: "espera_preconsulta" } : null;
    case "quitar_llegada":
      return estado === "espera_preconsulta" ? { estado: "citado" } : null;
    case "llamar":
      if (estado === "espera_preconsulta") return { estado: "llamado_preconsulta", llamado: "preconsulta" };
      if (estado === "espera_consultorio") return { estado: "llamado_consultorio", llamado: "consultorio" };
      return null;
    case "volver_a_llamar":
      if (estado === "llamado_preconsulta") return { estado, llamado: "preconsulta" };
      if (estado === "llamado_consultorio") return { estado, llamado: "consultorio" };
      return null;
    case "preconsulta_lista":
      return estado === "llamado_preconsulta" ? { estado: "espera_consultorio" } : null;
    case "paso_a_consulta":
      return estado === "llamado_consultorio" ? { estado: "atendido" } : null;
    case "no_respondio":
      if (estado === "llamado_preconsulta") return { estado: "no_respondio", etapaNoRespondio: "preconsulta" };
      if (estado === "llamado_consultorio") return { estado: "no_respondio", etapaNoRespondio: "consultorio" };
      return null;
    case "regreso":
      if (estado !== "no_respondio") return null;
      return {
        estado: etapaNoRespondio === "consultorio" ? "espera_consultorio" : "espera_preconsulta",
        etapaNoRespondio: null,
      };
    case "devolver_a_espera":
      if (estado === "llamado_preconsulta") return { estado: "espera_preconsulta" };
      if (estado === "llamado_consultorio") return { estado: "espera_consultorio" };
      return null;
  }
}

/** Acciones que se ofrecen en cada estado; la primera es la principal. */
export function accionesDe(estado: EstadoCitaCE): AccionCE[] {
  switch (estado) {
    case "citado":
      return ["llego"];
    case "espera_preconsulta":
      return ["llamar", "quitar_llegada"];
    case "llamado_preconsulta":
      return ["preconsulta_lista", "volver_a_llamar", "no_respondio", "devolver_a_espera"];
    case "espera_consultorio":
      return ["llamar"];
    case "llamado_consultorio":
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

/** Texto del destino que muestra la pantalla y lee la voz. */
export function destinoLlamado(
  etapa: EtapaCE,
  cita: { estacionId: EstacionCEId; consultorio: string; especialidadId?: string },
): string {
  if (etapa === "preconsulta") return `Preconsulta de ${estacionPorId(cita.estacionId)?.nombre ?? "la estación"}`;
  return nombreConsultorio(cita.consultorio, cita.especialidadId);
}

// ─── Documento de llamados (lo que escuchan las pantallas) ──────────────────

export interface LlamadoPantalla {
  /** Identifica cada anuncio; un "Volver a llamar" genera uno nuevo. */
  id: string;
  citaId: string;
  codigo: string;
  destino: string;
  etapa: EtapaCE;
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
