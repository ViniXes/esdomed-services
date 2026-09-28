import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminStorage } from "@/lib/firebase-admin";

// GET /api/evaluaciones-personal/{id}/descargar?i={índice del adjunto}
//
// Devuelve una URL firmada de corta duración que fuerza la descarga
// (Content-Disposition: attachment) del adjunto. Hace falta porque la URL de
// descarga de Storage abre el PDF en el navegador y, sin CORS en el bucket, el
// cliente no puede bajarlo como blob. Se devuelve URL (no el archivo) para no
// chocar con el límite de tamaño de respuesta de Vercel: los adjuntos llegan a
// 20 MB.
//
// Mismo acceso que la lectura en firestore.rules: el admin o el empleado dueño.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const snap = await adminDb.collection("evaluaciones_personal").doc(id).get();
  const data = snap.data();
  if (!data) return NextResponse.json({ error: "No existe" }, { status: 404 });

  if (data.empleadoId !== uid) {
    const role = (await adminDb.collection("usuarios").doc(uid).get()).data()?.role;
    if (role !== "admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const i = Number(req.nextUrl.searchParams.get("i") ?? 0);
  const adjunto = Array.isArray(data.archivos) ? data.archivos[i] : undefined;
  if (!adjunto?.storagePath) return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });

  const nombre = String(adjunto.nombre || "evaluacion.pdf").replace(/["\\\r\n]/g, "_");
  const [url] = await adminStorage.bucket().file(adjunto.storagePath).getSignedUrl({
    action: "read",
    expires: Date.now() + 5 * 60 * 1000,
    responseDisposition: `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
  });

  return NextResponse.json({ url }, { headers: { "Cache-Control": "private, no-store" } });
}
