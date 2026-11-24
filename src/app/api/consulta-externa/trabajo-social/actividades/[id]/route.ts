import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { COL_TS_ACTIVIDADES } from "@/lib/consultaExterna/trabajoSocial";
import { fallo, ok, sesionTS } from "@/lib/consultaExterna/trabajoSocialServidor";

// Solo la borra quien la registró (o el admin).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionTS(req, "registrar");
  if (sesion instanceof NextResponse) return sesion;
  const ref = adminDb.collection(COL_TS_ACTIVIDADES).doc((await params).id);
  try {
    const snap = await ref.get();
    if (!snap.exists) return fallo("La actividad ya no existe.", 404);
    if (snap.data()!.autor !== sesion.uid && !sesion.esAdmin) return fallo("Solo la borra quien la registró.", 403);
    await ref.delete();
    return ok({ ok: true });
  } catch (e) {
    console.error("Trabajo Social CE: no se pudo borrar la actividad", e);
    return fallo("No se pudo borrar.", 500);
  }
}
