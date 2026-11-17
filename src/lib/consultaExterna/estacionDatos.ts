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
  destinoEstacion,
  ETIQUETA_ESTADO,
  idLlamadoManual,
  limpiarExpediente,
  nombreParaLlamado,
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
 * veces al mismo paciente, y si es un llamado lo publica (expediente, nombre y
 * su estación como destino) en el documento de las pantallas en el mismo paso.
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
        paciente: nombreParaLlamado(cita.paciente),
        expediente: cita.expediente,
        destino: destinoEstacion(cita.estacionId),
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

// ─── Llamado manual ─────────────────────────────────────────────────────────

export interface DatosLlamadoManual {
  expediente: string;
  paciente: string;
  estacionId: EstacionCEId;
}

/** Lee la lista de la pantalla del día y la reemplaza con lo que devuelva `cambiar`. */
async function cambiarLlamados(
  fechaISO: string,
  cambiar: (ultimos: LlamadoPantalla[]) => LlamadoPantalla[] | null,
): Promise<void> {
  const ref = doc(db, COL_LLAMADOS_CE, fechaISO);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const ultimos: LlamadoPantalla[] = snap.exists() ? ((snap.data() as LlamadosCE).ultimos ?? []) : [];
    const nuevos = cambiar(ultimos);
    if (nuevos) tx.set(ref, { fecha: fechaISO, ultimos: nuevos, actualizadoEn: serverTimestamp() }, { merge: true });
  });
}

/**
 * Llamado que la enfermera escribe a mano (expediente y nombre): un
 * paciente que no está en la agenda del día, o un día sin agenda cargada. Solo
 * toca el documento de las pantallas; no hay cita que mover. Volver a llamar
 * al mismo expediente reemplaza su entrada en la lista.
 */
export async function publicarLlamadoManual(
  fechaISO: string,
  datos: DatosLlamadoManual,
  porNombre: string,
): Promise<LlamadoPantalla> {
  const ahora = Date.now();
  const citaId = idLlamadoManual(datos.estacionId, datos.expediente);
  const nuevo: LlamadoPantalla = {
    id: `${citaId}#${ahora}`,
    citaId,
    paciente: nombreParaLlamado(datos.paciente),
    expediente: limpiarExpediente(datos.expediente),
    destino: destinoEstacion(datos.estacionId),
    estacionId: datos.estacionId,
    enMs: ahora,
    manual: true,
    porNombre,
  };
  await cambiarLlamados(fechaISO, (ultimos) => agregarLlamado(ultimos, nuevo));
  return nuevo;
}

/** Saca de las pantallas un llamado manual (p. ej. el nombre se escribió mal). */
export async function quitarLlamadoDePantalla(fechaISO: string, citaId: string): Promise<void> {
  await cambiarLlamados(fechaISO, (ultimos) => {
    const quedan = quitarLlamadosDeCita(ultimos, citaId);
    return quedan.length === ultimos.length ? null : quedan;
  });
}
