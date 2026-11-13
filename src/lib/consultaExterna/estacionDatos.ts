import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COL_CITAS_CE } from "./agendaDatos";
import {
  agregarLlamado,
  aplicarAccion,
  ETIQUETA_ESTADO,
  nombreConsultorio,
  normalizarEstado,
  quitarLlamadosDeCita,
  type AccionCE,
  type LlamadoPantalla,
} from "./circuito";
import type { EstacionCEId } from "./especialidades";
import type { CitaCE, CitaCEConId, LlamadosCE } from "./tipos";

export const COL_LLAMADOS_CE = "consulta_externa_llamados";

/** Documento → cita, con el estado ya en su forma actual (ver normalizarEstado). */
function aCita(id: string, datos: CitaCE): CitaCEConId {
  return { id, ...datos, estado: normalizarEstado(datos.estado) };
}

/**
 * Citas del día de una estación, en vivo. Dos igualdades: no necesita índice
 * compuesto. Cada cambio cuesta 1 lectura por estación abierta.
 */
export function escucharCitasEstacion(
  fechaISO: string,
  estacionId: EstacionCEId,
  alCambiar: (citas: CitaCEConId[]) => void,
  alFallar: (e: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL_CITAS_CE), where("fecha", "==", fechaISO), where("estacionId", "==", estacionId));
  return onSnapshot(
    q,
    // "estimate": la hora de llegada recién marcada se ve al instante, sin
    // esperar a que el servidor confirme el serverTimestamp.
    (snap) => alCambiar(snap.docs.map((d) => aCita(d.id, d.data({ serverTimestamps: "estimate" }) as CitaCE))),
    alFallar,
  );
}

/** Todas las citas del día, una sola vez (recepción de primera vez). */
export async function leerCitasDelDia(fechaISO: string): Promise<CitaCEConId[]> {
  const snap = await getDocs(query(collection(db, COL_CITAS_CE), where("fecha", "==", fechaISO)));
  return snap.docs.map((d) => aCita(d.id, d.data() as CitaCE));
}

/** Últimos llamados del día: un solo documento, lo único que escuchan las pantallas. */
export function escucharLlamados(
  fechaISO: string,
  alCambiar: (ultimos: LlamadoPantalla[]) => void,
  alFallar: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, COL_LLAMADOS_CE, fechaISO),
    (snap) => alCambiar(snap.exists() ? ((snap.data() as LlamadosCE).ultimos ?? []) : []),
    alFallar,
  );
}

/** La cita cambió en otra computadora y la acción ya no aplica. */
export class AccionNoAplica extends Error {
  constructor(public estadoActual: CitaCE["estado"]) {
    super(`La cita ya está en «${ETIQUETA_ESTADO[normalizarEstado(estadoActual)]}»: otra persona la movió.`);
    this.name = "AccionNoAplica";
  }
}

/**
 * Aplica una acción de la estación (o de la recepción) a una cita. Va en una
 * transacción: verifica el estado actual, así dos computadoras no llaman dos
 * veces al mismo paciente, y si es un llamado lo publica (con el consultorio
 * de su médico como destino) en el documento de las pantallas en el mismo paso.
 */
export async function ejecutarAccion(
  citaId: string,
  accion: AccionCE,
  por: { uid: string; nombre: string },
): Promise<void> {
  // El id de la cita empieza con su fecha ("2026-11-13_cardiologia_360-23"):
  // así el documento de llamados se lee a la vez que la cita, en un solo viaje
  // al servidor en vez de dos seguidos.
  const fechaDelId = citaId.match(/^(\d{4}-\d{2}-\d{2})_/)?.[1];
  const tocaPantalla = accion === "llamar" || accion === "volver_a_llamar" || accion === "devolver_a_espera";

  await runTransaction(db, async (tx) => {
    const ref = doc(db, COL_CITAS_CE, citaId);
    const [snap, snapLlamadosAnticipado] = await Promise.all([
      tx.get(ref),
      tocaPantalla && fechaDelId ? tx.get(doc(db, COL_LLAMADOS_CE, fechaDelId)) : Promise.resolve(null),
    ]);
    if (!snap.exists()) throw new Error("La cita ya no existe.");
    const cita = snap.data() as CitaCE;

    const t = aplicarAccion(cita.estado, accion);
    if (!t) throw new AccionNoAplica(cita.estado);

    // Todas las lecturas antes de escribir (si el id no traía la fecha, se lee ahora).
    const refLlamados = doc(db, COL_LLAMADOS_CE, cita.fecha);
    const snapLlamados =
      tocaPantalla && cita.fecha === fechaDelId ? snapLlamadosAnticipado : tocaPantalla ? await tx.get(refLlamados) : null;
    const ultimos: LlamadoPantalla[] = snapLlamados?.exists() ? ((snapLlamados.data() as LlamadosCE).ultimos ?? []) : [];

    const update: Record<string, unknown> = {
      estado: t.estado,
      historial: arrayUnion({ accion, en: Timestamp.now(), por: por.nombre, porUid: por.uid }),
      actualizadoEn: serverTimestamp(),
      actualizadoPor: por.uid,
      actualizadoPorNombre: por.nombre,
    };
    if (accion === "llego") {
      update.llegadaEn = serverTimestamp();
      update.llegadaPor = por.nombre;
      update.llegadaPorUid = por.uid;
    }
    if (accion === "quitar_llegada") {
      update.llegadaEn = deleteField();
      update.llegadaPor = deleteField();
      update.llegadaPorUid = deleteField();
    }
    if (t.anuncia) {
      update.llamadas = increment(1);
      update.ultimoLlamadoEn = serverTimestamp();
    }
    tx.update(ref, update);

    if (t.anuncia) {
      const ahora = Date.now();
      const nuevo: LlamadoPantalla = {
        id: `${citaId}#${ahora}`,
        citaId,
        codigo: cita.codigo,
        destino: nombreConsultorio(cita.consultorio, cita.especialidadId),
        estacionId: cita.estacionId,
        enMs: ahora,
      };
      tx.set(
        refLlamados,
        { fecha: cita.fecha, ultimos: agregarLlamado(ultimos, nuevo), actualizadoEn: serverTimestamp() },
        { merge: true },
      );
    } else if (accion === "devolver_a_espera" && snapLlamados?.exists()) {
      // Llamado por error: sale de la lista de las pantallas.
      tx.set(refLlamados, { ultimos: quitarLlamadosDeCita(ultimos, citaId), actualizadoEn: serverTimestamp() }, { merge: true });
    }
  });
}
