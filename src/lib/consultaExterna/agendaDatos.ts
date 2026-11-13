import {
  arrayUnion,
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type FieldValue,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { idCita, numerarNuevas, type CargaPreparada, type CitaNumerada } from "./agenda";
import type { AgendaCE, CitaCE } from "./tipos";

export const COL_AGENDAS_CE = "consulta_externa_agendas";
export const COL_CITAS_CE = "consulta_externa_citas";

// Una carga va en una sola transacción (lee cada cita para saber si ya estaba
// y la escribe). Un día completo de las seis especialidades queda muy por
// debajo; si algún día se pasa, hay que partir la carga.
const MAX_CITAS_POR_CARGA = 450;

/** Resumen del día: un solo documento (1 lectura). */
export async function leerAgendaCE(fechaISO: string): Promise<AgendaCE | null> {
  const snap = await getDoc(doc(db, COL_AGENDAS_CE, fechaISO));
  return snap.exists() ? (snap.data() as AgendaCE) : null;
}

export interface ResultadoCargaCE {
  nuevas: CitaNumerada[];
  yaCargadas: number;
}

/**
 * Guarda las citas del reporte que aún no estén cargadas y les asigna su
 * código. Lo ya cargado no se toca: conserva su código y su estado. Todo va en
 * una transacción, así dos cargas simultáneas no repiten números.
 */
export async function guardarAgendaCE(
  carga: CargaPreparada,
  usuario: { uid: string; nombre: string },
  archivo: string,
): Promise<ResultadoCargaCE> {
  if (!carga.fechaISO) throw new Error("El reporte no trae una fecha única.");
  if (carga.citas.length > MAX_CITAS_POR_CARGA) {
    throw new Error(`El reporte trae ${carga.citas.length} citas; el máximo por carga es ${MAX_CITAS_POR_CARGA}.`);
  }

  return runTransaction(db, async (tx) => {
    const refAgenda = doc(db, COL_AGENDAS_CE, carga.fechaISO);
    const refCita = (c: { especialidadId: string; expediente: string }) =>
      doc(db, COL_CITAS_CE, idCita(carga.fechaISO, c.especialidadId, c.expediente));

    const snapAgenda = await tx.get(refAgenda);
    const snaps = await Promise.all(carga.citas.map((c) => tx.get(refCita(c))));
    const faltan = carga.citas.filter((_, i) => !snaps[i].exists());
    const yaCargadas = carga.citas.length - faltan.length;
    if (!faltan.length) return { nuevas: [], yaCargadas };

    const previo = snapAgenda.exists() ? ((snapAgenda.data() as AgendaCE).ultimoNumero ?? {}) : {};
    const { numeradas, ultimoNumero } = numerarNuevas(faltan, previo);

    const porEspecialidad: Record<string, FieldValue> = {};
    const conteo = new Map<string, number>();
    for (const c of numeradas) {
      const cita: Omit<CitaCE, "cargadaEn"> & { cargadaEn: FieldValue } = {
        fecha: carga.fechaISO,
        codigo: c.codigo,
        numero: c.numero,
        especialidadId: c.especialidadId,
        especialidad: c.especialidadNombre,
        estacionId: c.estacionId,
        expediente: c.expediente,
        dui: c.dui,
        paciente: c.paciente,
        tipoCita: c.tipoCita,
        primeraVez: c.primeraVez,
        fechaOtorgamiento: c.fechaOtorgamiento,
        medico: c.medico,
        consultorio: c.consultorio,
        franjaInicio: c.franjaInicio,
        franjaFin: c.franjaFin,
        estado: "citado",
        cargadaPor: usuario.uid,
        cargadaPorNombre: usuario.nombre,
        cargadaEn: serverTimestamp(),
      };
      tx.set(refCita(c), cita);
      conteo.set(c.especialidadId, (conteo.get(c.especialidadId) ?? 0) + 1);
    }
    for (const [id, n] of conteo) porEspecialidad[id] = increment(n);

    tx.set(
      refAgenda,
      {
        fecha: carga.fechaISO,
        totalCitas: increment(numeradas.length),
        porEspecialidad,
        ultimoNumero,
        cargas: arrayUnion({
          en: Timestamp.now(),
          porUid: usuario.uid,
          porNombre: usuario.nombre,
          archivo,
          nuevas: numeradas.length,
          yaCargadas,
        }),
        actualizadoEn: serverTimestamp(),
        ...(snapAgenda.exists() ? {} : { creadoEn: serverTimestamp() }),
      },
      { merge: true },
    );

    return { nuevas: numeradas, yaCargadas };
  });
}
