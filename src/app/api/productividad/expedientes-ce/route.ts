import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { COLECCION_ACTUALIZACIONES_CE } from "@/lib/consultaExterna/actualizaciones";
import { COLECCION_EXPEDIENTES_CE, ROLES_LEEN_PRODUCTIVIDAD_CE, rangoMesISO } from "@/lib/consultaExterna/expedientesCreados";
import type { ActualizacionCE, RegistroExpedienteCE } from "@/lib/consultaExterna/productividad";

// Productividad de Consulta Externa: expedientes creados del mes (por fecha de
// creación del SIS) y actualizaciones de datos registradas en el mes. Solo desde
// el servidor. La usan la pestaña Consulta Externa (admin) y la de
// Administrativos (admin y asistente): ROLES_LEEN_PRODUCTIVIDAD_CE. Devuelve
// solo quién y cuándo, sin expediente ni nombre del paciente.

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
    const [snap, actSnap] = await Promise.all([
      adminDb.collection(COLECCION_EXPEDIENTES_CE).where("fechaCreacion", ">=", rango[0]).where("fechaCreacion", "<=", rango[1])
        .select("creadoPorUid", "creadoPorNombre", "creadoPorSis", "fechaCreacion", "personaNueva").get(),
      adminDb.collection(COLECCION_ACTUALIZACIONES_CE).where("fecha", ">=", rango[0]).where("fecha", "<=", rango[1])
        .select("hechoPor", "hechoPorNombre", "fecha", "tipos").get(),
    ]);
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
    return NextResponse.json({ registros, actualizaciones }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("No se pudo leer la productividad de Consulta Externa", error);
    return NextResponse.json({ error: "No se pudo cargar la productividad de Consulta Externa." }, { status: 500 });
  }
}
