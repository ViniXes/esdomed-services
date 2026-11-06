// Lectura y escritura del resumen mensual de los censos (colección censo_resumen,
// id "{demanda|referidos}-YYYY-MM"). Los cálculos están en resumenCenso.ts.

import {
  collection, doc, documentId, getCountFromServer, getDoc, getDocs, increment, limit, query,
  setDoc, Timestamp, updateDoc, where, writeBatch, type FieldValue,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import type { ResumenCensoMes, TipoCenso } from "@/types";
import {
  construirResumen, deltaResumen, inicioDeMes, mesSiguiente, type DeltaMes,
} from "@/lib/emergencia/resumenCenso";

const RESUMEN = "censo_resumen";

export const COLECCION_CENSO: Record<TipoCenso, string> = {
  demanda: "censo_demanda_espontanea",
  referidos: "censo_referidos",
};

const refResumen = (tipo: TipoCenso, mes: string) => doc(db, RESUMEN, `${tipo}-${mes}`);

function conIncrementos(tipo: TipoCenso, mes: string, delta: DeltaMes) {
  const conteos: Record<string, Record<string, FieldValue>> = {};
  for (const [dimension, conteo] of Object.entries(delta.conteos)) {
    conteos[dimension] = Object.fromEntries(Object.entries(conteo).map(([k, n]) => [k, increment(n)]));
  }
  return { tipo, mes, total: increment(delta.total), conteos, actualizadoEn: Timestamp.now() };
}

/**
 * Guarda un censo y su aporte al resumen en un solo lote. Si no se puede escribir
 * el resumen, el censo se guarda igual: un registro clínico nunca se pierde por
 * el tablero, y este avisa del desajuste para recalcular.
 */
export async function guardarCenso(
  tipo: TipoCenso,
  id: string | null,
  datos: Record<string, unknown>,
  extras: Record<string, unknown>,
) {
  const coleccion = collection(db, COLECCION_CENSO[tipo]);
  const ref = id ? doc(coleccion, id) : doc(coleccion);
  const anterior = id ? (await getDoc(ref)).data() ?? null : null;
  const registro = { ...datos, ...extras };
  const deltas = Object.entries(deltaResumen(tipo, anterior, datos));

  const batch = writeBatch(db);
  if (id) batch.update(ref, registro);
  else batch.set(ref, registro);
  for (const [mes, delta] of deltas) batch.set(refResumen(tipo, mes), conIncrementos(tipo, mes, delta), { merge: true });

  try {
    await batch.commit();
  } catch (e) {
    if ((e as { code?: string }).code !== "permission-denied" || deltas.length === 0) throw e;
    console.warn("Censo guardado sin actualizar el resumen del tablero:", e);
    if (id) await updateDoc(ref, registro);
    else await setDoc(ref, registro);
  }
}

/** Todos los meses de un censo: un documento por mes, sin índice compuesto. */
export async function cargarResumenes(tipo: TipoCenso): Promise<ResumenCensoMes[]> {
  const snap = await getDocs(query(
    collection(db, RESUMEN),
    where(documentId(), ">=", `${tipo}-`),
    where(documentId(), "<=", `${tipo}-`),
    limit(120),
  ));
  return snap.docs.map((d) => d.data() as ResumenCensoMes);
}

const censosDelMes = (tipo: TipoCenso, mes: string) => query(
  collection(db, COLECCION_CENSO[tipo]),
  where("fecha", ">=", Timestamp.fromDate(inicioDeMes(mes))),
  where("fecha", "<", Timestamp.fromDate(inicioDeMes(mesSiguiente(mes)))),
);

export interface DesajusteResumen {
  mes: string;
  enResumen: number;
  enCensos: number;
}

/** Compara el resumen con los censos reales; contar cuesta 1 lectura por cada 1000. */
export async function buscarDesajustes(
  tipo: TipoCenso,
  meses: string[],
  resumenes: ResumenCensoMes[],
): Promise<DesajusteResumen[]> {
  const revisados = await Promise.all(meses.map(async (mes) => ({
    mes,
    enResumen: resumenes.find((r) => r.mes === mes)?.total ?? 0,
    enCensos: (await getCountFromServer(censosDelMes(tipo, mes))).data().count,
  })));
  return revisados.filter((r) => r.enResumen !== r.enCensos);
}

/** Red de seguridad: rehace un mes leyendo sus censos. */
export async function reconstruirMes(tipo: TipoCenso, mes: string) {
  const snap = await getDocs(censosDelMes(tipo, mes));
  const resumen = construirResumen(tipo, mes, snap.docs.map((d) => d.data()));
  await setDoc(refResumen(tipo, mes), { ...resumen, actualizadoEn: Timestamp.now() });
}
