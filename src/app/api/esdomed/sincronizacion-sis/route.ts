import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// Se llama después de completar TODOS los lotes de la importación. La hora
// viene del servidor; no depende del reloj del equipo que subió el reporte.
export async function POST(req: NextRequest) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(authorization.slice(7), true)).uid;
  } catch {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }
  try {
    const perfil = (await adminDb.collection("usuarios").doc(uid).get()).data();
    // Mismos roles que pueden crear/actualizar pacientes en Firestore.
    if (!perfil || perfil.activo === false || !["esdomed", "asistente_esdomed", "admin"].includes(perfil.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    // Solo contiene la hora global; las reglas existentes de configuración
    // permiten leerla. La escritura usa Admin para no ampliar permisos cliente.
    const resultado = await adminDb.collection("configuracion").doc("sincronizacion_pacientes_sis").set({
      sincronizadoEn: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ sincronizadoEn: resultado.writeTime.toDate().toISOString() });
  } catch (error) {
    console.error("No se pudo registrar la sincronización de pacientes SIS", error);
    return NextResponse.json({ error: "No se pudo registrar la hora de sincronización" }, { status: 500 });
  }
}
