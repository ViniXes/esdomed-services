// Lectura y escritura del resumen mensual de los censos (colección censo_resumen,
// id "{demanda|referidos}-YYYY-MM"). Los cálculos están en resumenCenso.ts.

import {
  collection, doc, documentId, getCountFromServer, getDoc, getDocs, increment, limit, query,
  runTransaction, setDoc, Timestamp, where, writeBatch, type DocumentData, type FieldValue,
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

const TIPOS_CENSO = Object.keys(COLECCION_CENSO) as TipoCenso[];

const refResumen = (tipo: TipoCenso, mes: string) => doc(db, RESUMEN, `${tipo}-${mes}`);

function conIncrementos(tipo: TipoCenso, mes: string, delta: DeltaMes) {
  const conteos: Record<string, Record<string, FieldValue>> = {};
  for (const [dimension, conteo] of Object.entries(delta.conteos)) {
    conteos[dimension] = Object.fromEntries(Object.entries(conteo).map(([k, n]) => [k, increment(n)]));
  }
  return { tipo, mes, total: increment(delta.total), conteos, actualizadoEn: Timestamp.now() };
}

export interface CensoGuardado {
  tipo: TipoCenso;
  id: string;
  registro: DocumentData;
}

/** Guardar duplicaría la atención o pisaría lo que otra persona acaba de cambiar. */
export class CensoYaRegistrado extends Error {
  constructor(readonly existente: CensoGuardado) {
    super("Esta atención ya tiene censo.");
  }
}

/** Marca de la última escritura, para notar si otra persona cambió el registro. */
export const versionCenso = (r: DocumentData): number =>
  (r.actualizadoEn ?? r.creadoEn)?.toMillis?.() ?? 0;

/** El censo de una fila de la cola, en cualquiera de los dos libros. */
export async function buscarCensoDeAtencion(controlIngresoId: string): Promise<CensoGuardado | null> {
  for (const tipo of TIPOS_CENSO) {
    const snap = await getDocs(query(
      collection(db, COLECCION_CENSO[tipo]),
      where("controlIngresoId", "==", controlIngresoId),
      limit(1),
    ));
    if (!snap.empty) return { tipo, id: snap.docs[0].id, registro: snap.docs[0].data() };
  }
  return null;
}

/**
 * Los censos de varias filas de la cola a la vez (id de la fila → censo), para
 * el Histórico, que no entra en la vista en vivo. "in" admite hasta 30 valores.
 */
export async function censosDeAtenciones(controlIngresoIds: string[]): Promise<Map<string, CensoGuardado>> {
  const ids = [...new Set(controlIngresoIds)];
  const grupos: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) grupos.push(ids.slice(i, i + 30));
  const encontrados = new Map<string, CensoGuardado>();
  await Promise.all(TIPOS_CENSO.flatMap((tipo) => grupos.map(async (grupo) => {
    const snap = await getDocs(query(collection(db, COLECCION_CENSO[tipo]), where("controlIngresoId", "in", grupo)));
    snap.docs.forEach((d) => {
      const ci = d.data().controlIngresoId as string;
      if (!encontrados.has(ci)) encontrados.set(ci, { tipo, id: d.id, registro: d.data() });
    });
  })));
  return encontrados;
}

/**
 * Si no se puede escribir el resumen, el censo se guarda igual: un registro
 * clínico nunca se pierde por el tablero, y este avisa del desajuste para recalcular.
 */
async function conResumenOpcional(hayResumen: boolean, escribir: (conResumen: boolean) => Promise<void>) {
  try {
    await escribir(hayResumen);
  } catch (e) {
    if ((e as { code?: string }).code !== "permission-denied" || !hayResumen) throw e;
    console.warn("Censo guardado sin actualizar el resumen del tablero:", e);
    await escribir(false);
  }
}

/**
 * Una fila de la cola tiene un solo censo. Su id es el del documento y la
 * transacción exige que no exista en ninguno de los dos libros, así que ni dos
 * guardados simultáneos la duplican. Los censos anteriores a este candado tienen
 * id automático, por eso se buscan antes por el campo.
 */
async function crearCensoDeAtencion(
  tipo: TipoCenso,
  controlIngresoId: string,
  registro: DocumentData,
  deltas: [string, DeltaMes][],
) {
  const existente = await buscarCensoDeAtencion(controlIngresoId);
  if (existente) throw new CensoYaRegistrado(existente);

  await conResumenOpcional(deltas.length > 0, (conResumen) => runTransaction(db, async (tx) => {
    for (const t of TIPOS_CENSO) {
      const snap = await tx.get(doc(db, COLECCION_CENSO[t], controlIngresoId));
      if (snap.exists()) throw new CensoYaRegistrado({ tipo: t, id: snap.id, registro: snap.data() });
    }
    tx.set(doc(db, COLECCION_CENSO[tipo], controlIngresoId), registro);
    if (conResumen) {
      for (const [mes, delta] of deltas) tx.set(refResumen(tipo, mes), conIncrementos(tipo, mes, delta), { merge: true });
    }
  }));
  return controlIngresoId;
}

/**
 * Guarda un censo y su aporte al resumen en una sola escritura. `versionLeida` es
 * la versión que se abrió para editar: si cambió, no se pisa y se lanza
 * CensoYaRegistrado para unir lo escrito.
 */
export async function guardarCenso(
  tipo: TipoCenso,
  id: string | null,
  datos: Record<string, unknown>,
  extras: Record<string, unknown>,
  versionLeida?: number,
) {
  const coleccion = collection(db, COLECCION_CENSO[tipo]);
  const registro = { ...datos, ...extras };
  const version = versionCenso(registro);

  if (!id && typeof datos.controlIngresoId === "string" && datos.controlIngresoId) {
    const deltas = Object.entries(deltaResumen(tipo, null, datos));
    return { id: await crearCensoDeAtencion(tipo, datos.controlIngresoId, registro, deltas), version };
  }

  const ref = id ? doc(coleccion, id) : doc(coleccion);
  const anterior = id ? (await getDoc(ref)).data() ?? null : null;
  if (anterior && versionLeida !== undefined && versionCenso(anterior) !== versionLeida) {
    throw new CensoYaRegistrado({ tipo, id: ref.id, registro: anterior });
  }
  const deltas = Object.entries(deltaResumen(tipo, anterior, datos));

  await conResumenOpcional(deltas.length > 0, async (conResumen) => {
    const batch = writeBatch(db);
    if (id) batch.update(ref, registro);
    else batch.set(ref, registro);
    if (conResumen) {
      for (const [mes, delta] of deltas) batch.set(refResumen(tipo, mes), conIncrementos(tipo, mes, delta), { merge: true });
    }
    await batch.commit();
  });
  return { id: ref.id, version };
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
