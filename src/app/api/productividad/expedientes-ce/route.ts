import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { COLECCION_ACTUALIZACIONES_CE } from "@/lib/consultaExterna/actualizaciones";
import { COLECCION_EXPEDIENTES_CE, ROLES_LEEN_PRODUCTIVIDAD_CE, rangoMesISO } from "@/lib/consultaExterna/expedientesCreados";
import { Timestamp } from "firebase-admin/firestore";
import type { ActualizacionCE, CitaRegistradaCE, RegistroExpedienteCE } from "@/lib/consultaExterna/productividad";

// Productividad de Consulta Externa: expedientes creados del mes (por fecha de
// creación del SIS), actualizaciones de datos y citas 2027 registradas en el mes
// (por el día en que se registraron). Solo desde el servidor. La usan la pestaña Consulta Externa (admin) y la de
// Administrativos (admin y asistente): ROLES_LEEN_PRODUCTIVIDAD_CE. Devuelve
// solo quién y cuándo, sin expediente ni nombre del paciente.

/** = COL_CITAS_PROGRAMADAS (citasProgramadasDatos.ts usa el SDK del navegador; aquí va el Admin SDK). */
const COLECCION_CITAS_PROGRAMADAS = "consulta_externa_citas_programadas";

/** Medianoche de El Salvador (UTC-6) del día YYYY-MM-DD. */
const medianocheSV = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return Timestamp.fromDate(new Date(Date.UTC(a, m - 1, d, 6)));
};

/** YYYY-MM-DD del instante en hora de El Salvador. */
const fechaSV = (ts: unknown): string => {
  const f = (ts as { toDate?: () => Date } | null)?.toDate?.();
  return f ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(f) : "";
};

export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { uid } = await adminAuth.verifyIdToken(token);
    const perfil = (await adminDb.collection("usuarios").doc(uid).get()).data();
    if (!perfil || perfil.activo === false || !ROLES_LEEN_PRODUCTIVIDAD_CE.includes(perfil.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }

  const rango = rangoMesISO(new URL(req.url).searchParams.get("mes") ?? "");
  if (!rango) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });

  try {
    // Fin exclusivo: medianoche del día siguiente al último del mes.
    const finCitas = new Date(medianocheSV(rango[1]).toMillis() + 86400000);
    const [snap, actSnap, citasSnap] = await Promise.all([
      adminDb.collection(COLECCION_EXPEDIENTES_CE).where("fechaCreacion", ">=", rango[0]).where("fechaCreacion", "<=", rango[1])
        .select("creadoPorUid", "creadoPorNombre", "creadoPorSis", "fechaCreacion", "personaNueva").get(),
      adminDb.collection(COLECCION_ACTUALIZACIONES_CE).where("fecha", ">=", rango[0]).where("fecha", "<=", rango[1])
        .select("hechoPor", "hechoPorNombre", "fecha", "tipos").get(),
      adminDb.collection(COLECCION_CITAS_PROGRAMADAS)
        .where("creadaEn", ">=", medianocheSV(rango[0])).where("creadaEn", "<", Timestamp.fromDate(finCitas))
        .select("creadaPor", "creadaPorNombre", "creadaEn", "estado").get(),
    ]);
    const citas: CitaRegistradaCE[] = citasSnap.docs.map((d) => {
      const x = d.data();
      return {
        creadaPor: String(x.creadaPor ?? ""),
        creadaPorNombre: String(x.creadaPorNombre ?? ""),
        fecha: fechaSV(x.creadaEn),
        anulada: x.estado === "anulada",
      };
    });
    const actualizaciones: ActualizacionCE[] = actSnap.docs.map((d) => {
      const x = d.data();
      return {
        hechoPor: String(x.hechoPor ?? ""),
        hechoPorNombre: String(x.hechoPorNombre ?? ""),
        fecha: String(x.fecha ?? ""),
        tipos: Array.isArray(x.tipos) ? x.tipos.map(String) : [],
      };
    });
    const registros: RegistroExpedienteCE[] = snap.docs.map((d) => {
      const x = d.data();
      return {
        creadoPorUid: (x.creadoPorUid as string | null) ?? null,
        creadoPorNombre: (x.creadoPorNombre as string | null) ?? null,
        creadoPorSis: String(x.creadoPorSis ?? ""),
        fechaCreacion: String(x.fechaCreacion ?? ""),
        personaNueva: x.personaNueva === true,
      };
    });
    return NextResponse.json({ registros, actualizaciones, citas }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("No se pudo leer la productividad de Consulta Externa", error);
    return NextResponse.json({ error: "No se pudo cargar la productividad de Consulta Externa." }, { status: 500 });
  }
}
