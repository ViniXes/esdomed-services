import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const PENDIENTES = "registros_medicos_pendientes";
const HISTORIAL = "registros_medicos_historial";

async function getCaller(req: NextRequest): Promise<{ uid: string; role: string; nombre: string } | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const data = (await adminDb.collection("usuarios").doc(decoded.uid).get()).data();
    if (typeof data?.role !== "string") return null;
    return { uid: decoded.uid, role: data.role, nombre: data.nombre ?? "" };
  } catch {
    return null;
  }
}

// Guarda en el historial el resultado de la resolución (aprobado/rechazado) para
// poder consultarlo después. Usa id autogenerado: una misma persona puede
// reaparecer (p. ej. rechazada y luego re-registrada).
function registrarHistorial(
  p: FirebaseFirestore.DocumentData,
  estado: "aprobado" | "rechazado",
  resolvedor: { uid: string; nombre: string },
  motivo?: string,
) {
  return adminDb.collection(HISTORIAL).add({
    uid: p.uid ?? "",
    nombre: p.nombre ?? "",
    dui: p.dui ?? "",
    jvpm: p.jvpm ?? "",
    username: p.username ?? "",
    email: p.email ?? "",
    ...(p.tipoMedico ? { tipoMedico: p.tipoMedico } : {}),
    servicios: Array.isArray(p.servicios) ? p.servicios : [],
    estado,
    ...(motivo ? { motivo } : {}),
    solicitadoEn: p.creadoEn ?? null,
    resueltoEn: FieldValue.serverTimestamp(),
    resueltoPorId: resolvedor.uid,
    resueltoPorNombre: resolvedor.nombre,
  });
}

// POST — APROBAR la solicitud: habilita el usuario de Auth, crea su documento en
// `usuarios` con rol medico, registra el historial y borra el pendiente. Solo admin.
export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const caller = await getCaller(req);
  if (caller?.role !== "admin") {
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

  await registrarHistorial(p, "aprobado", caller);
  await pendRef.delete();
  return NextResponse.json({ ok: true });
}

// DELETE — RECHAZAR la solicitud: elimina el usuario de Auth deshabilitado,
// registra el historial (con motivo opcional) y borra el pendiente. Solo admin.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const caller = await getCaller(req);
  if (caller?.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { uid } = await params;

  let motivo: string | undefined;
  try {
    motivo = (await req.json())?.motivo;
  } catch {
    motivo = undefined;
  }

  const pendRef = adminDb.collection(PENDIENTES).doc(uid);
  const pendSnap = await pendRef.get();
  const p = pendSnap.exists ? pendSnap.data()! : { uid };

  try {
    await adminAuth.deleteUser(uid);
  } catch (err) {
    // Si el usuario de Auth ya no existe, seguimos para limpiar el pendiente.
    if ((err as { code?: string })?.code !== "auth/user-not-found") throw err;
  }

  if (pendSnap.exists) {
    await registrarHistorial(p, "rechazado", caller, typeof motivo === "string" ? motivo.trim() || undefined : undefined);
  }
  await pendRef.delete();
  return NextResponse.json({ ok: true });
}
