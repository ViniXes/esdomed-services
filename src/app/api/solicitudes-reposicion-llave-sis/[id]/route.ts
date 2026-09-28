import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { EstadoSolicitudLlaveSis } from "@/types";

const SOLICITUDES = "solicitudes_reposicion_llave_sis";
const estados = new Set<EstadoSolicitudLlaveSis>(["pendiente", "en_proceso", "llave_generada", "entregada", "rechazada"]);

async function administrador(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const perfil = (await adminDb.collection("usuarios").doc(decoded.uid).get()).data();
    return perfil?.role === "admin" ? { uid: decoded.uid, nombre: String(perfil.nombre ?? "") } : null;
  } catch { return null; }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await administrador(req);
  if (!admin) return NextResponse.json({ error: "Solo administración puede atender reposiciones de llave." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Actualización inválida." }, { status: 400 }); }
  const estado = String(body.estado ?? "") as EstadoSolicitudLlaveSis;
  const notaAdmin = String(body.notaAdmin ?? "").trim().slice(0, 500);
  if (!estados.has(estado)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });

  const { id } = await params;
  const ref = adminDb.collection(SOLICITUDES).doc(id);
  const actual = await ref.get();
  if (!actual.exists) return NextResponse.json({ error: "La solicitud ya no existe." }, { status: 404 });
  const data = actual.data();
  const update: Record<string, unknown> = {
    estado,
    notaAdmin: notaAdmin || null,
    estadoActualizadoPorId: admin.uid,
    estadoActualizadoPorNombre: admin.nombre,
    estadoActualizadoEn: FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
  };
  // Si se marca directamente como entregada, se conserva igualmente quién
  // generó/atendió la llave para no perder esa productividad.
  if ((estado === "llave_generada" || estado === "entregada") && !data?.llaveGeneradaEn) {
    update.llaveGeneradaPorId = admin.uid;
    update.llaveGeneradaPorNombre = admin.nombre;
    update.llaveGeneradaEn = FieldValue.serverTimestamp();
  }
  if (estado === "entregada" && !data?.llaveSisEntregadaEn) {
    update.llaveSisEntregadaPorId = admin.uid;
    update.llaveSisEntregadaPorNombre = admin.nombre;
    update.llaveSisEntregadaEn = FieldValue.serverTimestamp();
  }
  await ref.update(update);
  return NextResponse.json({ ok: true });
}
