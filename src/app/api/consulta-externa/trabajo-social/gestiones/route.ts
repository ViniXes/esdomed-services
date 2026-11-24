import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import {
  COL_TS_ACTIVIDADES, COL_TS_GESTIONES, COL_TS_NOTAS, esFecha, esMes, finDeMes, validarGestion, validarNota, validarPacienteManual,
  type GestionTSCE, type NotaTSCE,
} from "@/lib/consultaExterna/trabajoSocial";
import {
  cambioIndice, cuerpo, fallo, leerActividad, leerGestion, leerNota, ok, olvidarPacientes, resolverPaciente, sesionTS, traer,
} from "@/lib/consultaExterna/trabajoSocialServidor";

// Gestiones de Trabajo Social de Consulta Externa.
// - GET ?estado=en_proceso   → todas las abiertas
// - GET ?fecha=YYYY-MM-DD    → lo hecho ese día (gestiones nuevas y notas)
// - GET ?paciente=clave      → bitácora del paciente (gestiones y notas)
// - GET ?mes=YYYY-MM         → el mes para el tablero (abiertas, del mes, notas y actividades)
// - POST                     → gestión nueva con su primera nota
// Consultas por un solo campo: no piden índices compuestos.

const gestiones = () => adminDb.collection(COL_TS_GESTIONES);
const notas = () => adminDb.collection(COL_TS_NOTAS);

const sinRepetir = (lista: GestionTSCE[]): GestionTSCE[] => [...new Map(lista.map((g) => [g.id, g])).values()];

/** Las gestiones de estas notas que aún no están en la lista (abiertas en otro mes u otro día). */
async function conSusGestiones(lista: GestionTSCE[], deNotas: NotaTSCE[]): Promise<GestionTSCE[]> {
  const tengo = new Set(lista.map((g) => g.id));
  const faltan = [...new Set(deNotas.map((n) => n.gestionId))].filter((id) => id && !tengo.has(id));
  if (!faltan.length) return lista;
  const snaps = await adminDb.getAll(...faltan.map((id) => gestiones().doc(id)));
  return [...lista, ...snaps.filter((x) => x.exists).map((x) => leerGestion(x.id, x.data()!))];
}

export async function GET(req: NextRequest) {
  const sesion = await sesionTS(req, "consultar");
  if (sesion instanceof NextResponse) return sesion;
  const params = new URL(req.url).searchParams;
  const mes = params.get("mes");
  const fecha = params.get("fecha");
  const paciente = params.get("paciente");
  try {
    if (mes) {
      if (!esMes(mes)) return fallo("Mes inválido.");
      const ini = `${mes}-01`;
      const fin = finDeMes(mes);
      const enRango = (col: FirebaseFirestore.CollectionReference, campo: string) => col.where(campo, ">=", ini).where(campo, "<=", fin);
      const [nuevas, cerradas, abiertas, deNotas, actividades] = await Promise.all([
        traer(enRango(gestiones(), "fecha"), leerGestion),
        traer(enRango(gestiones(), "fechaCierre"), leerGestion),
        traer(gestiones().where("estado", "==", "en_proceso"), leerGestion),
        traer(enRango(notas(), "fecha"), leerNota),
        traer(enRango(adminDb.collection(COL_TS_ACTIVIDADES), "fecha"), leerActividad),
      ]);
      return ok({
        hoy: hoySV(),
        gestiones: await conSusGestiones(sinRepetir([...nuevas, ...cerradas, ...abiertas]), deNotas),
        notas: deNotas,
        actividades,
      });
    }
    if (fecha) {
      if (!esFecha(fecha)) return fallo("Fecha inválida.");
      const [delDia, deNotas] = await Promise.all([
        traer(gestiones().where("fecha", "==", fecha), leerGestion),
        traer(notas().where("fecha", "==", fecha), leerNota),
      ]);
      const todas = await conSusGestiones(delDia, deNotas);
      return ok({ hoy: hoySV(), gestiones: todas.sort((a, b) => b.creadoEnMs - a.creadoEnMs), notas: deNotas });
    }
    if (paciente) {
      const [suyas, susNotas] = await Promise.all([
        traer(gestiones().where("clave", "==", paciente), leerGestion),
        traer(notas().where("clave", "==", paciente), leerNota),
      ]);
      suyas.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEnMs - a.creadoEnMs);
      return ok({ hoy: hoySV(), gestiones: suyas, notas: susNotas });
    }
    if (params.get("estado") === "en_proceso") {
      const abiertas = await traer(gestiones().where("estado", "==", "en_proceso"), leerGestion);
      // Primero las que llevan más tiempo sin una nota.
      abiertas.sort((a, b) => (a.ultimaNotaFecha || a.fecha).localeCompare(b.ultimaNotaFecha || b.fecha) || a.creadoEnMs - b.creadoEnMs);
      return ok({ hoy: hoySV(), gestiones: abiertas });
    }
    return fallo("Consulta inválida.");
  } catch (e) {
    console.error("Trabajo Social CE: no se pudieron leer las gestiones", e);
    return fallo("No se pudieron leer las gestiones.", 500);
  }
}

export async function POST(req: NextRequest) {
  const sesion = await sesionTS(req, "registrar");
  if (sesion instanceof NextResponse) return sesion;
  const datos = await cuerpo(req);

  const g = validarGestion(datos.gestion);
  if (!g.ok) return fallo(g.error);
  const n = validarNota(datos.nota, g.datos.tipo, hoySV());
  if (!n.ok) return fallo(n.error);
  const manual = datos.manual ? validarPacienteManual(datos.manual) : null;
  if (manual && !manual.ok) return fallo(manual.error);

  try {
    const resuelto = await resolverPaciente(String(datos.clave ?? ""), manual?.ok ? manual.datos : null);
    if (!resuelto) return fallo("Elija el paciente de la lista o escríbalo a mano.");
    const { paciente, nuevoManual } = resuelto;

    const finalizada = datos.finalizada === true;
    const refG = gestiones().doc();
    const lote = adminDb.batch();
    lote.create(refG, {
      ...g.datos,
      clave: paciente.clave,
      expediente: paciente.expediente,
      dui: paciente.dui,
      paciente: paciente.paciente,
      especialidadId: paciente.especialidadId,
      origen: paciente.manual ? "manual" : "cita",
      estado: finalizada ? "finalizada" : "en_proceso",
      motivoNoProcede: "",
      fecha: n.datos.fecha,
      fechaCierre: finalizada ? n.datos.fecha : "",
      creadoPor: sesion.uid,
      creadoPorNombre: sesion.nombre,
      creadoEn: FieldValue.serverTimestamp(),
      totalNotas: 1,
      ultimaNotaFecha: n.datos.fecha,
      historial: [],
    });
    lote.create(notas().doc(), {
      ...n.datos,
      gestionId: refG.id,
      clave: paciente.clave,
      autor: sesion.uid,
      autorNombre: sesion.nombre,
      creadoEn: FieldValue.serverTimestamp(),
    });
    const indice = cambioIndice(paciente.clave, 1, nuevoManual);
    lote.set(indice.ref, indice.datos, { merge: true });
    await lote.commit();
    olvidarPacientes();
    return ok({ id: refG.id, clave: paciente.clave, paciente: paciente.paciente });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo registrar la gestión", e);
    return fallo("No se pudo registrar la gestión. Lo escrito sigue en la pantalla.", 500);
  }
}
