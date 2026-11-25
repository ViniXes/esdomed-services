import type { UserProfile } from "@/types";
import { configPersonalPlan } from "@/lib/esdomed/catalogo-plan";
import { esPersonalEvaluable } from "@/lib/productividad/personasNoEvaluables";

// Evaluación en línea del personal operativo de ESDOMED (pedido del usuario,
// 2026-11-25): 3 claves de 10 preguntas, una al azar por persona. El admin la
// abre y la cierra. Al abrir services con la evaluación en marcha (si ya estaba
// conectada, desde que se abrió) cada persona tiene 5 minutos para prepararse;
// luego se habilita la prueba y tiene 15 minutos para responderla. Al entregar se califica en el servidor (las respuestas correctas
// nunca salen al navegador) y el resultado queda como PDF con nota en la
// pestaña Evaluaciones de su ficha.
//
// Este archivo lo usan navegador y servidor: aquí no van las preguntas ni las
// respuestas (están en evaluacionEnLineaClaves.ts, solo servidor).

export const EVALUACION_EN_LINEA = {
  id: "lineamientos-2026",
  titulo: "Evaluación de conocimientos",
  tema: "Lineamientos internos de control disciplinarios 2026",
  /**
   * Se cierra sola a esta hora aunque el admin no le dé "Cerrar" (pedido del
   * usuario: medianoche del 25/11/2026, hora de El Salvador = 06:00 UTC del 26).
   * Para una prueba nueva, cambiar junto con `id`.
   */
  cierreAutomaticoMs: Date.UTC(2026, 10, 26, 6, 0, 0),
};

/** Abierta = el admin la abrió y aún no llega la hora del cierre automático. */
export const estaAbierta = (estado: { activa?: unknown } | undefined, ahoraMs = Date.now()) =>
  estado?.activa === true && ahoraMs < EVALUACION_EN_LINEA.cierreAutomaticoMs;

/** Abierta/cerrada. `configuracion` es de lectura pública: aquí no va nada personal. */
export const DOC_ESTADO_EVALUACION = { coleccion: "configuracion", id: "evaluacion_en_linea" } as const;
/** Un documento por persona: `{evaluación}_{uid}`. Sin reglas: todo pasa por la API. */
export const COL_PARTICIPANTES_EVALUACION = "evaluacion_en_linea_participantes";
export const idParticipante = (uid: string) => `${EVALUACION_EN_LINEA.id}_${uid}`;
/** Recorrido de prueba del admin: documento aparte que no sale en el panel. */
export const idParticipantePrueba = (uid: string) => `prueba_${EVALUACION_EN_LINEA.id}_${uid}`;

/** Preparación: la prueba se habilita a los 5 minutos de abrir services y ahí arrancan sus 15. */
export const MINUTOS_PARA_INICIAR = 5;
export const MS_PARA_INICIAR = MINUTOS_PARA_INICIAR * 60 * 1000;
/** Tiempo para responderla; al acabarse se entrega sola con lo marcado. */
export const MINUTOS_DURACION = 15;
export const MS_DURACION = MINUTOS_DURACION * 60 * 1000;
/** Margen para la red: una entrega que llega hasta 1 min tarde aún vale tal cual. */
export const MS_GRACIA_ENTREGA = 60 * 1000;
export const RUTA_EVALUACION_EN_LINEA = "/dashboard/personal/evaluacion";
export const LETRAS_OPCIONES = ["A", "B", "C"] as const;

/**
 * Administrativos que sí la hacen porque en la práctica son operativos
 * (pedido del usuario: Andre, administrativo destacado en Emergencia).
 */
export const UIDS_INCLUIDOS_EVALUACION: Record<string, string> = {
  DdrwgkBxCtSm7bRFNlIOJTQjAr92: "Boris Andree Quintanilla",
};

export type EstadoEvaluacion = "por_iniciar" | "en_curso" | "entregada" | "vencida";

export interface PreguntaEvaluacion {
  texto: string;
  opciones: string[];
}

/** Lo que la API le devuelve a cada persona. Nunca trae las respuestas correctas. */
export interface MiEvaluacion {
  activa: boolean;
  elegible: boolean;
  ahoraMs: number;
  estado?: EstadoEvaluacion;
  clave?: number;
  /** A esta hora se habilita la prueba (fin de los 5 minutos de preparación). */
  limiteMs?: number;
  /** Fin de sus 15 minutos (por iniciar y en curso). */
  finMs?: number;
  /** Lo marcado que ya guardó el servidor (−1 = sin responder). */
  guardadas?: number[];
  preguntas?: PreguntaEvaluacion[];
  puntaje?: number | null;
  total?: number;
  entregadaEnMs?: number | null;
  /** Recorrido de prueba del admin (no cuenta). */
  prueba?: boolean;
}

/** Fila del panel del admin. */
export interface FilaPanelEvaluacion {
  uid: string;
  nombre: string;
  grupo: string;
  estado: EstadoEvaluacion | "sin_abrir";
  clave: number | null;
  vistaEnMs: number | null;
  iniciadaEnMs: number | null;
  entregadaEnMs: number | null;
  puntaje: number | null;
  total: number;
  enFicha: boolean;
}

/**
 * Los mismos que salen en Productividad → Operativos (pedido del usuario):
 * cuentas ESDOMED vigentes y evaluables (sin jefatura ni cuentas técnicas:
 * `esPersonalEvaluable`), menos los de la pestaña Administrativos (jornada
 * administrativa del catálogo del plan), salvo UIDS_INCLUIDOS_EVALUACION.
 * Las digitadoras de Consulta Externa (`agenda_ce`: Paola y Kathya) no entran
 * porque su rol no es de ESDOMED; el admin tampoco (él ve el panel).
 */
export function esElegibleEvaluacion(
  perfil: Pick<UserProfile, "uid" | "role" | "activo" | "nombre" | "codigoMarcacion">,
): boolean {
  if (perfil.activo === false) return false;
  if (perfil.role !== "esdomed" && perfil.role !== "asistente_esdomed") return false;
  if (!esPersonalEvaluable(perfil.nombre ?? "")) return false;
  if (perfil.uid in UIDS_INCLUIDOS_EVALUACION) return true;
  return configPersonalPlan(perfil.codigoMarcacion)?.tipoJornada !== "Administrativo";
}

type TiemposParticipante = { iniciadaEnMs?: number | null; entregadaEnMs?: number | null; vistaEnMs?: number | null };

/**
 * Pedido del usuario: los primeros 5 minutos después de abrir services son para
 * prepararse (la prueba no se puede iniciar antes). A los 5 minutos se habilita
 * y corren sus 15, entre cuando entre: quien entra tarde tiene menos.
 */
export const habilitadaDesde = (p: TiemposParticipante) => (p.vistaEnMs ?? 0) + MS_PARA_INICIAR;
export const finDeEvaluacion = (p: TiemposParticipante) => habilitadaDesde(p) + MS_DURACION;

/** `vencida` = nunca entró y ya se le acabaron los 15 minutos (no la presentó). */
export function estadoDeParticipante(p: TiemposParticipante, ahoraMs: number): EstadoEvaluacion {
  if (p.entregadaEnMs) return "entregada";
  if (p.iniciadaEnMs) return "en_curso";
  if (p.vistaEnMs && ahoraMs > finDeEvaluacion(p)) return "vencida";
  return "por_iniciar";
}

/** "YYYY-MM" del mes en curso en El Salvador (UTC-6, sin horario de verano). */
export function periodoSV(ahora = Date.now()): string {
  const d = new Date(ahora - 6 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
