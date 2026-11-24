import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import { COL_TS_ACTIVIDADES, esMes, finDeMes, validarActividad } from "@/lib/consultaExterna/trabajoSocial";
import { cuerpo, fallo, leerActividad, ok, sesionTS, traer } from "@/lib/consultaExterna/trabajoSocialServidor";

// Actividades que no son de un paciente (charlas, reuniones, correspondencia).
// - GET ?mes=YYYY-MM  - POST { actividad }
export async function GET(req: NextRequest) {
  const sesion = await sesionTS(req, "consultar");
  if (sesion instanceof NextResponse) return sesion;
  const mes = new URL(req.url).searchParams.get("mes") ?? "";
  if (!esMes(mes)) return fallo("Mes inválido.");
  try {
    const lista = await traer(
      adminDb.collection(COL_TS_ACTIVIDADES).where("fecha", ">=", `${mes}-01`).where("fecha", "<=", finDeMes(mes)),
      leerActividad,
    );
    return ok({ hoy: hoySV(), actividades: lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEnMs - a.creadoEnMs) });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudieron leer las actividades", e);
    return fallo("No se pudieron leer las actividades.", 500);
  }
}

export async function POST(req: NextRequest) {
  const sesion = await sesionTS(req, "registrar");
  if (sesion instanceof NextResponse) return sesion;
  const a = validarActividad((await cuerpo(req)).actividad, hoySV());
  if (!a.ok) return fallo(a.error);
  try {
    const ref = await adminDb.collection(COL_TS_ACTIVIDADES).add({
      ...a.datos, autor: sesion.uid, autorNombre: sesion.nombre, creadoEn: FieldValue.serverTimestamp(),
    });
    return ok({ actividad: leerActividad(ref.id, (await ref.get()).data()!) });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo registrar la actividad", e);
    return fallo("No se pudo registrar la actividad.", 500);
  }
}
