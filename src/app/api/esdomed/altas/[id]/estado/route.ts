import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { MotivoObservacionAlta } from "@/types";

const MOTIVOS = new Set<MotivoObservacionAlta>([
  "cama_expediente",
  "expediente_duplicado",
  "no_subido_sis",
  "otro",
]);

const TIPOS_SOLO_RECIBIDO = new Set(["deposito", "suspendida"]);

type Caller = {
  uid: string;
  nombre: string;
  role: string;
};

type Body =
  | { action: "procesar" }
  | { action: "observar"; motivo: MotivoObservacionAlta; detalle: string }
  | { action: "quitar_observacion" };

async function getCaller(req: NextRequest): Promise<Caller | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("usuarios").doc(decoded.uid).get();
    const data = snap.data();
    const role = data?.role;
    if (role !== "esdomed" && role !== "admin") return null;

    return {
      uid: decoded.uid,
      nombre: String(data?.nombre ?? decoded.name ?? decoded.email ?? "ESDOMED"),
      role,
    };
  } catch {
    return null;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller(req);
  if (!caller) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json()) as Body;
  const ref = adminDb.collection("notificaciones_altas").doc(id);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: "Notificacion no encontrada" }, { status: 404 });
  }

  const actual = snap.data()!;
  if (actual.estado !== "pendiente" && actual.estado !== "observada") {
    return NextResponse.json({ error: "La notificacion ya esta cerrada" }, { status: 409 });
  }

  if (body.action === "procesar") {
    const estadoCierre = TIPOS_SOLO_RECIBIDO.has(String(actual.tipoAlta)) ? "recibida" : "procesada";

    await ref.update({
      estado: estadoCierre,
      procesadoPorId: caller.uid,
      procesadoPorNombre: caller.nombre,
      procesadoEn: FieldValue.serverTimestamp(),
      modificadoPorId: caller.uid,
      modificadoPorNombre: caller.nombre,
      modificadoPorRol: caller.role,
      modificadoEn: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "observar") {
    if (TIPOS_SOLO_RECIBIDO.has(String(actual.tipoAlta))) {
      return NextResponse.json({ error: "Esta notificacion no requiere observacion de ESDOMED" }, { status: 409 });
    }

    if (!MOTIVOS.has(body.motivo) || !body.detalle.trim()) {
      return NextResponse.json({ error: "Observacion invalida" }, { status: 400 });
    }

    await ref.update({
      estado: "observada",
      observacionEsdomedMotivo: body.motivo,
      observacionEsdomedDetalle: body.detalle.trim(),
      observadoPorId: caller.uid,
      observadoPorNombre: caller.nombre,
      observadoEn: FieldValue.serverTimestamp(),
      modificadoPorId: caller.uid,
      modificadoPorNombre: caller.nombre,
      modificadoPorRol: caller.role,
      modificadoEn: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "quitar_observacion") {
    await ref.update({
      estado: "pendiente",
      observacionEsdomedMotivo: FieldValue.delete(),
      observacionEsdomedDetalle: FieldValue.delete(),
      observadoPorId: FieldValue.delete(),
      observadoPorNombre: FieldValue.delete(),
      observadoEn: FieldValue.delete(),
      modificadoPorId: caller.uid,
      modificadoPorNombre: caller.nombre,
      modificadoPorRol: caller.role,
      modificadoEn: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Accion invalida" }, { status: 400 });
}
