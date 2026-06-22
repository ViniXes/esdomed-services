import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const PENDIENTES = "registros_medicos_pendientes";

async function getCallerRole(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("usuarios").doc(decoded.uid).get();
    return snap.data()?.role ?? null;
  } catch {
    return null;
  }
}

// POST — APROBAR la solicitud: habilita el usuario de Auth, crea su documento en
// `usuarios` con rol medico y borra el pendiente. Solo admin.
export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  if ((await getCallerRole(req)) !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { uid } = await params;

  const pendRef = adminDb.collection(PENDIENTES).doc(uid);
  const pendSnap = await pendRef.get();
  if (!pendSnap.exists) {
    return NextResponse.json({ error: "La solicitud ya no existe" }, { status: 404 });
  }
  const p = pendSnap.data()!;

  await adminAuth.updateUser(uid, { disabled: false });

  await adminDb.collection("usuarios").doc(uid).set({
    nombre: p.nombre,
    email: p.email,
    username: p.username,
    role: "medico",
    dui: p.dui,
    jvpm: p.jvpm,
    servicios: Array.isArray(p.servicios) ? p.servicios : [],
    servicio: Array.isArray(p.servicios) ? (p.servicios[0] ?? "") : "",
    ...(p.tipoMedico ? { tipoMedico: p.tipoMedico } : {}),
    createdAt: FieldValue.serverTimestamp(),
  });

  await pendRef.delete();
  return NextResponse.json({ ok: true });
}

// DELETE — RECHAZAR la solicitud: elimina el usuario de Auth deshabilitado y el
// documento pendiente. Solo admin.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  if ((await getCallerRole(req)) !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { uid } = await params;

  try {
    await adminAuth.deleteUser(uid);
  } catch (err) {
    // Si el usuario de Auth ya no existe, seguimos para limpiar el pendiente.
    if ((err as { code?: string })?.code !== "auth/user-not-found") throw err;
  }
  await adminDb.collection(PENDIENTES).doc(uid).delete();
  return NextResponse.json({ ok: true });
}
