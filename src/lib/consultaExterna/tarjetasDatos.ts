import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COL_CITAS_CE } from "./agendaDatos";
import {
  aplanarTarjetas,
  cambiosTarjetas,
  fragmentosDeCitas,
  type CitaParaTarjeta,
  type EntradaTarjeta,
  type TarjetaCE,
} from "./tarjetas";
import type { CitaCEConId } from "./tipos";

// Catálogo de tarjetas en Firestore (la lógica está en tarjetas.ts):
//   consulta_externa_tarjetas/{f00…f19}  { pacientes: { [expediente]: EntradaTarjeta }, actualizadoEn }

export const COL_TARJETAS_CE = "consulta_externa_tarjetas";

interface FragmentoTarjetas {
  pacientes?: Record<string, EntradaTarjeta>;
  actualizadoEn?: Timestamp | null;
}

/**
 * Suma al catálogo los pacientes con DUI de una carga. Se llama después de
 * guardar la agenda, con TODAS las citas del reporte (también las que ya
 * estaban): es idempotente, así volver a subir el mismo archivo completa el
 * catálogo si la vez anterior falló. Lee y escribe solo los fragmentos que
 * tocan esas citas, en una transacción (dos cargas a la vez no se pisan).
 */
export async function actualizarCatalogoTarjetas(fechaISO: string, citas: Omit<CitaParaTarjeta, "fecha">[]): Promise<{ nuevas: number }> {
  const conFecha: CitaParaTarjeta[] = citas.map((c) => ({
    fecha: fechaISO,
    expediente: c.expediente,
    dui: c.dui,
    paciente: c.paciente,
    especialidadId: c.especialidadId,
  }));
  const fragmentos = fragmentosDeCitas(conFecha);
  if (!fragmentos.length) return { nuevas: 0 };

  return runTransaction(db, async (tx) => {
    const snaps = await Promise.all(fragmentos.map((f) => tx.get(doc(db, COL_TARJETAS_CE, f))));
    const guardados = new Map(fragmentos.map((f, i) => [f, (snaps[i].data() as FragmentoTarjetas | undefined)?.pacientes]));
    const { cambios, nuevas } = cambiosTarjetas(conFecha, (f) => guardados.get(f));
    for (const [f, pacientes] of cambios) {
      // merge: solo cambian estas entradas; el resto del mapa queda igual.
      tx.set(doc(db, COL_TARJETAS_CE, f), { pacientes, actualizadoEn: serverTimestamp() }, { merge: true });
    }
    return { nuevas };
  });
}

/** Todo el catálogo: una lectura por fragmento (a lo más 20). */
export async function leerCatalogoTarjetas(): Promise<{ tarjetas: TarjetaCE[]; actualizadoEn: Date | null }> {
  const snap = await getDocs(collection(db, COL_TARJETAS_CE));
  const datos = snap.docs.map((d) => d.data() as FragmentoTarjetas);
  const fechas = datos.map((d) => d.actualizadoEn?.toDate?.()?.getTime() ?? 0).filter(Boolean);
  return {
    tarjetas: aplanarTarjetas(datos.map((d) => d.pacientes ?? {})),
    actualizadoEn: fechas.length ? new Date(Math.max(...fechas)) : null,
  };
}

/** Citas cargadas de un paciente, la más reciente primero (se lee al abrir su ficha). */
export async function leerCitasDeExpediente(expediente: string): Promise<CitaCEConId[]> {
  const snap = await getDocs(query(collection(db, COL_CITAS_CE), where("expediente", "==", expediente)));
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<CitaCEConId, "id">), id: d.id }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.especialidad.localeCompare(b.especialidad, "es"));
}
