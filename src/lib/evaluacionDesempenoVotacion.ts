// Votación de supervisores en la evaluación del desempeño: SOLO una sugerencia más.
//
// Mientras una evaluación está en curso (nueva, o guardada sin las 7 letras),
// Alfonso, Daniel y Vinicio marcan desde su Services la letra que proponen en cada
// factor. Cada voto se guarda aparte, en `votos.{uid}` de la misma evaluación, y
// NUNCA asigna letras: a quien evalúa (Benjamín) le sale como otra sugerencia, con
// marco propio y un globito con quién votó qué; las letras las sigue marcando él.
//  - Nadie vota su propia evaluación.
//  - Cada supervisor ve solo su voto (voto secreto entre ellos).
//  - Ya completa la evaluación, la votación deja de mostrarse y de recibir votos.

import type { Timestamp } from "firebase/firestore";
import { OPCIONES, type Opcion, type RespuestasFactores } from "@/lib/evaluacionDesempeno";

/** Supervisores que votan, con el nombre corto que sale en el globito. */
export const VOTANTES_EVALUACION: Record<string, { nombre: string; corto: string }> = {
  B42a1rJzJ5SX92x7DJ6Iee9TiD22: { nombre: "Alfonso Montes Gutierrez", corto: "Alfonso" },
  TRWy5sy5WTMa11HxIgWB3rriNBm1: { nombre: "José Daniel Hernández Zepeda", corto: "Daniel" },
  bH6gkfXIlHMDK29aiTdPcmKt52n1: { nombre: "Vinicio Alexander Hernandez Quijano", corto: "Vinicio" },
};

export interface VotoEvaluacion {
  nombre: string;
  respuestas: RespuestasFactores;
  votadoEn: Timestamp;
}

export type VotosEvaluacion = Record<string, VotoEvaluacion>;

export const esVotante = (uid?: string | null): boolean => !!uid && uid in VOTANTES_EVALUACION;

/** Quienes votan en la evaluación de esta persona: los supervisores menos ella misma. */
export const votantesDe = (empleadoId: string) => Object.keys(VOTANTES_EVALUACION).filter((u) => u !== empleadoId);

export const puedeVotar = (uid: string | null | undefined, empleadoId: string) => esVotante(uid) && uid !== empleadoId;

export interface ResultadoFactor {
  /** Letra con más votos; null sin votos o con empate. */
  letra: Opcion | null;
  /** Votos de esa letra. */
  votosLetra: number;
  empate: boolean;
  /** Qué votó cada supervisor habilitado (null = aún no vota ese factor). */
  porVotante: { uid: string; corto: string; letra: Opcion | null }[];
  votaron: number;
}

export function resultadoFactor(votos: VotosEvaluacion | undefined, factor: number, empleadoId: string): ResultadoFactor {
  const porVotante = votantesDe(empleadoId).map((uid) => ({
    uid,
    corto: VOTANTES_EVALUACION[uid].corto,
    letra: votos?.[uid]?.respuestas?.[factor] ?? null,
  }));
  const conteo = new Map<Opcion, number>();
  for (const v of porVotante) if (v.letra) conteo.set(v.letra, (conteo.get(v.letra) ?? 0) + 1);
  const max = Math.max(0, ...conteo.values());
  const top = OPCIONES.filter((o) => max > 0 && conteo.get(o) === max);
  return {
    letra: top.length === 1 ? top[0] : null,
    votosLetra: max,
    empate: top.length > 1,
    porVotante,
    votaron: porVotante.filter((v) => v.letra).length,
  };
}

/** Supervisores habilitados que ya guardaron su voto (aunque sea en un solo factor). */
export const quienesVotaron = (votos: VotosEvaluacion | undefined, empleadoId: string) =>
  votantesDe(empleadoId).filter((uid) => Object.values(votos?.[uid]?.respuestas ?? {}).some(Boolean));
