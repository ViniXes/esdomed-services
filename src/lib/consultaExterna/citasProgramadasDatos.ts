import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  compararCitas,
  limpiarTexto,
  normalizarExpediente,
  rangoDelMes,
  validarCatalogo,
  validarCita,
  type CatalogoCitas,
  type DatosCitaProgramada,
  type EstadoCitaProgramada,
} from "./citasProgramadas";

// Firestore de la programación de citas 2027.
//
//   consulta_externa_catalogo/programacion          catálogo completo (1 lectura)
//   consulta_externa_citas_programadas/{auto}       una cita por documento
//
// El catálogo es un solo documento (≈50 KB) porque se lee entero en cada
// pantalla y se edita poco. La primera vez se siembra del libro de agendas
// redistribuidas (catalogoCitasSemilla.json).

export const COL_CATALOGO_CE = "consulta_externa_catalogo";
export const DOC_CATALOGO_PROGRAMACION = "programacion";
export const COL_CITAS_PROGRAMADAS = "consulta_externa_citas_programadas";

export interface CatalogoGuardado extends CatalogoCitas {
  actualizadoEn?: Timestamp | null;
  actualizadoPor?: string;
  actualizadoPorNombre?: string;
}

export interface CitaProgramada extends DatosCitaProgramada {
  estado: EstadoCitaProgramada;
  creadaPor: string;
  creadaPorNombre: string;
  creadaEn: Timestamp | null;
  /** De dónde salió el nombre: lo encontró el sistema o se escribió a mano. */
  origenNombre: "services" | "manual";
  registradaSisPor?: string;
  registradaSisPorNombre?: string;
  registradaSisEn?: Timestamp | null;
  anuladaPor?: string;
  anuladaPorNombre?: string;
  anuladaEn?: Timestamp | null;
  motivoAnulacion?: string;
  actualizadoPor?: string;
  actualizadoEn?: Timestamp | null;
}

export type CitaProgramadaConId = CitaProgramada & { id: string };

interface Usuario {
  uid: string;
  nombre: string;
}

const refCatalogo = () => doc(db, COL_CATALOGO_CE, DOC_CATALOGO_PROGRAMACION);

// ── Catálogo ────────────────────────────────────────────────────────────────

export async function leerCatalogoCitas(): Promise<CatalogoGuardado | null> {
  const snap = await getDoc(refCatalogo());
  return snap.exists() ? (snap.data() as CatalogoGuardado) : null;
}

export async function catalogoSemilla(): Promise<CatalogoCitas> {
  const mod = await import("./catalogoCitasSemilla.json");
  return JSON.parse(JSON.stringify(mod.default)) as CatalogoCitas;
}

export async function guardarCatalogoCitas(cat: CatalogoCitas, usuario: Usuario): Promise<void> {
  const errores = validarCatalogo(cat);
  if (errores.length) throw new Error(errores.join(" "));
  await setDoc(refCatalogo(), {
    medicos: cat.medicos,
    consultorios: cat.consultorios,
    franjas: cat.franjas,
    fuente: cat.fuente ?? "",
    actualizadoEn: serverTimestamp(),
    actualizadoPor: usuario.uid,
    actualizadoPorNombre: usuario.nombre,
  });
}

// ── Pacientes ya registrados en services ────────────────────────────────────

export interface PacienteEncontrado {
  expediente: string;
  /** "Apellidos, Nombres", como lo escribe el SIS. */
  nombre: string;
  fuente: string;
}

/**
 * Busca el nombre del paciente por expediente donde services ya lo tiene:
 * las citas 2027 ya registradas, las agendas diarias de consulta externa y
 * los datos personales de hospitalización. Hasta 3 lecturas; para en la primera.
 */
export async function buscarPacientePorExpediente(expedienteCrudo: string): Promise<PacienteEncontrado | null> {
  const expediente = normalizarExpediente(expedienteCrudo);
  if (!expediente) return null;

  // Cada fuente por separado: si una falla (sin permiso o sin red), se sigue con la siguiente.
  const intentar = async <T,>(f: () => Promise<T>): Promise<T | null> => {
    try {
      return await f();
    } catch (e) {
      console.warn("Búsqueda de paciente: una fuente no respondió", e);
      return null;
    }
  };

  const prog = await intentar(() =>
    getDocs(query(collection(db, COL_CITAS_PROGRAMADAS), where("expediente", "==", expediente), limit(1))),
  );
  if (prog && !prog.empty) {
    return { expediente, nombre: String(prog.docs[0].data().paciente ?? ""), fuente: "citas 2027" };
  }

  const ce = await intentar(() =>
    getDocs(query(collection(db, "consulta_externa_citas"), where("expediente", "==", expediente), limit(1))),
  );
  if (ce && !ce.empty) {
    return { expediente, nombre: String(ce.docs[0].data().paciente ?? ""), fuente: "agenda de consulta externa" };
  }

  const persona = await intentar(() => getDoc(doc(db, "personas", expediente)));
  if (persona?.exists()) {
    const p = persona.data() as { apellidos?: string; nombres?: string };
    const apellidos = limpiarTexto(p.apellidos ?? "");
    const nombres = limpiarTexto(p.nombres ?? "");
    if (apellidos || nombres) {
      return { expediente, nombre: apellidos && nombres ? `${apellidos}, ${nombres}` : apellidos || nombres, fuente: "hospitalización" };
    }
  }
  return null;
}

// ── Citas ───────────────────────────────────────────────────────────────────

/** Citas de un médico en una fecha (para el cupo). Igualdades: no pide índice compuesto. */
export async function citasDeMedicoEnFecha(medicoId: string, fecha: string): Promise<CitaProgramadaConId[]> {
  const snap = await getDocs(
    query(collection(db, COL_CITAS_PROGRAMADAS), where("medicoId", "==", medicoId), where("fecha", "==", fecha)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as CitaProgramada) }));
}

/** Citas del mes ("2027-03"), en el orden en que se pasarán al SIS. */
export async function citasDelMes(mes: string): Promise<CitaProgramadaConId[]> {
  const [desde, hasta] = rangoDelMes(mes);
  const snap = await getDocs(
    query(collection(db, COL_CITAS_PROGRAMADAS), where("fecha", ">=", desde), where("fecha", "<=", hasta)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as CitaProgramada) })).sort(compararCitas);
}

export const MAX_RECIENTES = 300;

/** Las últimas citas registradas en services, la más nueva primero (como la cola de ingresos). */
export async function ultimasCitasRegistradas(n = MAX_RECIENTES): Promise<CitaProgramadaConId[]> {
  const snap = await getDocs(query(collection(db, COL_CITAS_PROGRAMADAS), orderBy("creadaEn", "desc"), limit(n)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as CitaProgramada) }));
}

/** Citas vigentes del mismo expediente (para avisar duplicados). */
export async function citasDelExpediente(expediente: string): Promise<CitaProgramadaConId[]> {
  const snap = await getDocs(query(collection(db, COL_CITAS_PROGRAMADAS), where("expediente", "==", expediente)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as CitaProgramada) }))
    .filter((c) => c.estado !== "anulada")
    .sort(compararCitas);
}

export async function crearCitaProgramada(
  datos: DatosCitaProgramada,
  origenNombre: "services" | "manual",
  usuario: Usuario,
): Promise<string> {
  const limpio: DatosCitaProgramada = {
    ...datos,
    expediente: normalizarExpediente(datos.expediente),
    paciente: limpiarTexto(datos.paciente),
    observaciones: limpiarTexto(datos.observaciones),
  };
  const errores = validarCita(limpio);
  if (errores.length) throw new Error(errores.join(" "));
  const ref = await addDoc(collection(db, COL_CITAS_PROGRAMADAS), {
    ...limpio,
    origenNombre,
    estado: "pendiente" satisfies EstadoCitaProgramada,
    creadaPor: usuario.uid,
    creadaPorNombre: usuario.nombre,
    creadaEn: serverTimestamp(),
  });
  return ref.id;
}

/** Marca varias citas como ya ingresadas en el SIS (lotes de 400). */
export async function marcarRegistradasSis(ids: string[], usuario: Usuario): Promise<void> {
  for (let i = 0; i < ids.length; i += 400) {
    const lote = writeBatch(db);
    for (const id of ids.slice(i, i + 400)) {
      lote.update(doc(db, COL_CITAS_PROGRAMADAS, id), {
        estado: "registrada_sis",
        registradaSisPor: usuario.uid,
        registradaSisPorNombre: usuario.nombre,
        registradaSisEn: serverTimestamp(),
        actualizadoPor: usuario.uid,
        actualizadoEn: serverTimestamp(),
      });
    }
    await lote.commit();
  }
}

/** Devuelve una cita a "pendiente" (marcada por error como registrada, o anulada por error). */
export async function volverAPendiente(id: string, usuario: Usuario): Promise<void> {
  await updateDoc(doc(db, COL_CITAS_PROGRAMADAS, id), {
    estado: "pendiente",
    actualizadoPor: usuario.uid,
    actualizadoEn: serverTimestamp(),
  });
}

export async function anularCitaProgramada(id: string, motivo: string, usuario: Usuario): Promise<void> {
  const m = limpiarTexto(motivo);
  if (!m) throw new Error("Escriba el motivo de la anulación.");
  await updateDoc(doc(db, COL_CITAS_PROGRAMADAS, id), {
    estado: "anulada",
    motivoAnulacion: m,
    anuladaPor: usuario.uid,
    anuladaPorNombre: usuario.nombre,
    anuladaEn: serverTimestamp(),
    actualizadoPor: usuario.uid,
    actualizadoEn: serverTimestamp(),
  });
}

/**
 * Borra citas para siempre. Solo admin (las reglas lo exigen): es para
 * deshacer cargas de prueba o una migración. Lo normal es anular, que deja
 * rastro.
 */
export async function eliminarCitasProgramadas(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 400) {
    const lote = writeBatch(db);
    for (const id of ids.slice(i, i + 400)) lote.delete(doc(db, COL_CITAS_PROGRAMADAS, id));
    await lote.commit();
  }
}
