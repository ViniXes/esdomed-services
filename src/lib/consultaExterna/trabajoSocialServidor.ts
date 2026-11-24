import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp, type DocumentData, type Query } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { consultaGestionesTSCE, registraGestionesTSCE } from "@/lib/accesoConsultaExterna";
import type { UserProfile } from "@/types";
import { coincideCita } from "./busqueda";
import {
  COL_TS_PACIENTES, citasPorFragmento, claveDePaciente, fragmentoPaciente, fusionarCita,
  type ActividadTSCE, type AreaTSCE, type CierreTS, type CitaParaIndice, type DatosDeCita, type DatosPacienteManual,
  type EstadoGestionTS, type GestionTSCE, type NotaTSCE, type PacienteIndice, type PacienteTSCE,
} from "./trabajoSocial";

// Servidor de Trabajo Social de Consulta Externa: sesión, índice de pacientes y
// lectura de documentos. Sus colecciones no tienen reglas (el navegador no las
// lee ni escribe); todo pasa por /api/consulta-externa/trabajo-social/*.

export const SIN_CACHE = { "Cache-Control": "private, no-store" };
export const ok = (datos: unknown) => NextResponse.json(datos, { headers: SIN_CACHE });
export const fallo = (mensaje: string, status = 400) => NextResponse.json({ error: mensaje }, { status, headers: SIN_CACHE });

export interface Sesion { uid: string; nombre: string; area?: string; esAdmin: boolean }

/** "registrar": las trabajadoras de Consulta Externa. "consultar": además, quien supervisa. */
export async function sesionTS(req: NextRequest, permiso: "registrar" | "consultar"): Promise<Sesion | NextResponse> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return fallo("No autorizado", 401);
  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    return fallo("Sesión inválida", 401);
  }
  const perfil = (await adminDb.collection("usuarios").doc(uid).get()).data() as UserProfile | undefined;
  const permitido = permiso === "registrar" ? registraGestionesTSCE(perfil) : consultaGestionesTSCE(perfil);
  if (!perfil || perfil.activo === false || !permitido) return fallo("No autorizado", 403);
  return { uid, nombre: String(perfil.nombre ?? ""), area: perfil.areaTSCE, esAdmin: perfil.role === "admin" };
}

export async function cuerpo(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ── Lectura de documentos ───────────────────────────────────────────────────

const ms = (v: unknown): number => (v instanceof Timestamp ? v.toMillis() : 0);
const s = (v: unknown): string => String(v ?? "");

export function leerGestion(id: string, d: DocumentData): GestionTSCE {
  return {
    id,
    clave: s(d.clave), expediente: s(d.expediente), dui: s(d.dui), paciente: s(d.paciente),
    especialidadId: s(d.especialidadId), origen: d.origen === "manual" ? "manual" : "cita",
    tipo: s(d.tipo), detalle: s(d.detalle), area: s(d.area) as AreaTSCE,
    procedencia: d.procedencia === "red" || d.procedencia === "propia" ? d.procedencia : "",
    establecimiento: s(d.establecimiento), medico: s(d.medico),
    poblacion: Array.isArray(d.poblacion) ? d.poblacion.map(String) : [],
    estado: (s(d.estado) || "en_proceso") as EstadoGestionTS, motivoNoProcede: s(d.motivoNoProcede),
    fecha: s(d.fecha), fechaCierre: s(d.fechaCierre),
    creadoPor: s(d.creadoPor), creadoPorNombre: s(d.creadoPorNombre), creadoEnMs: ms(d.creadoEn),
    totalNotas: Number(d.totalNotas ?? 0), ultimaNotaFecha: s(d.ultimaNotaFecha),
    historial: Array.isArray(d.historial)
      ? d.historial.map((h: DocumentData): CierreTS => ({
          accion: h.accion, enMs: ms(h.en), porNombre: s(h.porNombre), ...(h.motivo ? { motivo: s(h.motivo) } : {}),
        }))
      : [],
  };
}

export function leerNota(id: string, d: DocumentData): NotaTSCE {
  return {
    id, gestionId: s(d.gestionId), clave: s(d.clave), fecha: s(d.fecha), paso: s(d.paso), conQuien: s(d.conQuien),
    medio: s(d.medio), texto: s(d.texto), autor: s(d.autor), autorNombre: s(d.autorNombre),
    creadoEnMs: ms(d.creadoEn), editadoEnMs: ms(d.editadoEn),
  };
}

export function leerActividad(id: string, d: DocumentData): ActividadTSCE {
  return {
    id, tipo: s(d.tipo), detalle: s(d.detalle), asistentes: Number(d.asistentes ?? 0), area: s(d.area) as AreaTSCE,
    fecha: s(d.fecha), autor: s(d.autor), autorNombre: s(d.autorNombre), creadoEnMs: ms(d.creadoEn),
  };
}

export async function traer<T>(q: Query, leer: (id: string, d: DocumentData) => T): Promise<T[]> {
  return (await q.get()).docs.map((d) => leer(d.id, d.data()));
}

// ── Índice de pacientes ─────────────────────────────────────────────────────
//
// consulta_externa_ts_pacientes/{f00…f19}  { pacientes: { [clave]: PacienteIndice } }
// consulta_externa_ts_pacientes/_sync      { hasta } última cita ya sumada
//
// Se pone al día solo: antes de buscar, suma las citas cargadas después de
// `hasta`. Cuesta 20 lecturas más las citas nuevas (una sola vez cada una), no
// toca la carga de agendas y cubre a todos los citados, con o sin DUI.

const COL_CITAS = "consulta_externa_citas";
const VIGENTE_MS = 5 * 60_000;
let memoria: { pacientes: PacienteTSCE[]; ms: number } | null = null;
const enMemoria = () => !!memoria && Date.now() - memoria.ms < VIGENTE_MS;

const refIndice = (id: string) => adminDb.collection(COL_TS_PACIENTES).doc(id);

/** Suma al índice las citas cargadas desde la última vez. Devuelve cuántas eran. */
async function sincronizarCitados(): Promise<number> {
  const refSync = refIndice("_sync");
  const previo = (await refSync.get()).data()?.hasta as Timestamp | undefined;
  let q: Query = adminDb.collection(COL_CITAS).orderBy("cargadaEn");
  if (previo) q = q.where("cargadaEn", ">", previo);
  const snap = await q.select("fecha", "expediente", "dui", "paciente", "especialidadId", "medico", "cargadaEn").get();
  if (snap.empty) return 0;

  const citas: CitaParaIndice[] = snap.docs.map((d) => {
    const c = d.data();
    return { fecha: s(c.fecha), expediente: s(c.expediente), dui: s(c.dui), paciente: s(c.paciente), especialidadId: s(c.especialidadId), medico: s(c.medico) };
  });
  const hasta = snap.docs[snap.docs.length - 1].data().cargadaEn as Timestamp;
  const grupos = citasPorFragmento(citas);

  // Las citas se leen fuera de la transacción: leerlas dentro las bloquearía y
  // frenaría los llamados de las estaciones.
  await adminDb.runTransaction(async (tx) => {
    const ids = [...grupos.keys()];
    const [sync, ...frags] = await tx.getAll(refSync, ...ids.map(refIndice));
    const actual = sync.data()?.hasta as Timestamp | undefined;
    // Otra instancia ya las sumó.
    if ((actual?.toMillis() ?? 0) !== (previo?.toMillis() ?? 0)) return;
    ids.forEach((id, i) => {
      const guardados = (frags[i].data()?.pacientes ?? {}) as Record<string, PacienteIndice>;
      const cambios: Record<string, DatosDeCita> = {};
      for (const c of grupos.get(id)!) {
        cambios[c.expediente] = fusionarCita(cambios[c.expediente] ?? guardados[c.expediente], c);
      }
      tx.set(refIndice(id), { pacientes: cambios }, { merge: true });
    });
    tx.set(refSync, { hasta, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
  });
  return citas.length;
}

/** Todo el índice. `fresco` lo relee aunque haya copia en memoria. */
export async function leerPacientes(fresco = false): Promise<PacienteTSCE[]> {
  if (!fresco && enMemoria()) return memoria!.pacientes;
  await sincronizarCitados();
  const snap = await adminDb.collection(COL_TS_PACIENTES).get();
  const pacientes = snap.docs
    .filter((d) => d.id !== "_sync")
    .flatMap((d) => Object.entries((d.data().pacientes ?? {}) as Record<string, PacienteIndice>).map(([clave, p]) => ({ ...p, clave })));
  memoria = { pacientes, ms: Date.now() };
  return pacientes;
}

const MAX_RESULTADOS = 12;

/** Busca por expediente, DUI o nombre; los de cita más reciente, primero. */
export async function buscarPacientes(consulta: string): Promise<PacienteTSCE[]> {
  const buscar = (lista: PacienteTSCE[]) => lista
    .filter((p) => coincideCita({ codigo: "", expediente: p.expediente ?? "", dui: p.dui ?? "", paciente: p.paciente ?? "" }, consulta))
    .sort((a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? "") || a.paciente.localeCompare(b.paciente, "es"))
    .slice(0, MAX_RESULTADOS);
  const deMemoria = enMemoria();
  const r = buscar(await leerPacientes());
  // Sin resultados: puede ser una agenda cargada hace un momento.
  return r.length || !deMemoria ? r : buscar(await leerPacientes(true));
}

/** Un paciente del índice, por su clave (1 lectura). */
export async function pacientePorClave(clave: string): Promise<PacienteTSCE | null> {
  if (!clave) return null;
  const p = ((await refIndice(fragmentoPaciente(clave)).get()).data()?.pacientes ?? {})[clave] as PacienteIndice | undefined;
  return p ? { ...p, clave } : null;
}

/** Cambio del índice al registrar (+1) o borrar (−1) una gestión. Va en el mismo lote. */
export function cambioIndice(
  clave: string, suma: 1 | -1, manual?: DatosPacienteManual,
): { ref: FirebaseFirestore.DocumentReference; datos: DocumentData } {
  return {
    ref: refIndice(fragmentoPaciente(clave)),
    datos: {
      pacientes: {
        [clave]: {
          ...(manual
            ? { ...manual, primera: "", ultima: "", especialidades: [], especialidadId: "", medico: "", manual: true }
            : {}),
          gestiones: FieldValue.increment(suma),
          ...(suma > 0 ? { ultimaGestionMs: Date.now() } : {}),
        },
      },
    },
  };
}

/** Tras registrar, la copia en memoria ya no sirve para la bitácora. */
export const olvidarPacientes = () => { memoria = null; };

/**
 * El paciente de una gestión nueva. Si es citado, sus datos salen del índice y
 * no de lo que mandó el navegador. Si se escribió a mano pero su expediente sí
 * está citado, también manda el índice.
 */
export async function resolverPaciente(
  clave: string, manual: DatosPacienteManual | null,
): Promise<{ paciente: PacienteTSCE; nuevoManual?: DatosPacienteManual } | null> {
  const buscada = manual ? claveDePaciente(manual) : clave;
  const existente = await pacientePorClave(buscada);
  if (existente) return { paciente: existente };
  if (!manual) return null;
  return {
    paciente: { ...manual, clave: buscada, primera: "", ultima: "", especialidades: [], especialidadId: "", medico: "", manual: true },
    nuevoManual: manual,
  };
}
