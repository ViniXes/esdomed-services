import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { type EstadoSolicitudSis } from "@/lib/solicitudesUsuarioSis";

const SOLICITUDES = "solicitudes_usuarios_sis";
const estadosValidos = new Set<EstadoSolicitudSis>(["pendiente", "en_proceso", "creado", "rechazado"]);

async function getAdmin(req: NextRequest): Promise<{ uid: string; nombre: string } | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const data = (await adminDb.collection("usuarios").doc(decoded.uid).get()).data();
    if (data?.role !== "admin") return null;
    return { uid: decoded.uid, nombre: String(data.nombre ?? "") };
  } catch {
    return null;
  }
}

// PATCH — registra el avance administrativo. La creación del usuario se hace
// fuera de ESDOMED, por eso aquí solo se anota el usuario SIS resultante.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin(req);
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Actualización inválida" }, { status: 400 });
  }

  const estado = String(body.estado ?? "") as EstadoSolicitudSis;
  const usuarioSis = String(body.usuarioSis ?? "").trim().slice(0, 80);
  const notaAdmin = String(body.notaAdmin ?? "").trim().slice(0, 500);
  if (!estadosValidos.has(estado)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  if (estado === "creado" && !usuarioSis) {
    return NextResponse.json({ error: "Escribe el usuario creado en SIS antes de marcar la solicitud como creada." }, { status: 400 });
  }

  const { id } = await params;
  const ref = adminDb.collection(SOLICITUDES).doc(id);
  if (!(await ref.get()).exists) return NextResponse.json({ error: "La solicitud ya no existe." }, { status: 404 });

  await ref.update({
    estado,
    usuarioSis: usuarioSis || null,
    notaAdmin: notaAdmin || null,
    estadoActualizadoPorId: admin.uid,
    estadoActualizadoPorNombre: admin.nombre,
    estadoActualizadoEn: FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true });
}
