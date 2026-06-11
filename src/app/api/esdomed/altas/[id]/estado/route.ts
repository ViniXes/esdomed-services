import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { MotivoObservacionAlta } from "@/types";

const MOTIVOS = new Set<MotivoObservacionAlta>([
  "cama_expediente",
  "no_subido_sis",
  "otro",
]);

const TIPOS_SOLO_RECIBIDO = new Set(["deposito", "suspendida"]);

// Al procesar un alta efectiva, el tipo de notificación define con qué estado de
// egreso se desactiva al paciente. ESDOMED completará luego el resto del egreso.
const ESTADO_PACIENTE_POR_TIPO: Record<string, string> = {
  domicilio: "alta_vivo",
  exigida: "alta_voluntaria",
  referido: "referido",
  fuga: "fuga",
  in_extremis: "in_extremis",
};

type Caller = {
  uid: string;
  nombre: string;
  role: string;
};

// Saca al paciente de los activos en cuanto ESDOMED procesa el alta, para que el
// buscador de pacientes activos (que usa enfermería) deje de mostrarlo y no se
// reenvíen notificaciones duplicadas. Solo marca el estado; ESDOMED completa el
// egreso después. Si el paciente no existe o ya no está activo, no hace nada.
async function desactivarPacienteDelAlta(
  noti: FirebaseFirestore.DocumentData,
  notificacionId: string,
  caller: Caller,
) {
  const nuevoEstado = ESTADO_PACIENTE_POR_TIPO[String(noti.tipoAlta)] ?? "alta_vivo";

  // Localizar el ingreso activo: por pacienteId y, si no, por expediente.
  let ref: FirebaseFirestore.DocumentReference | null = null;
  let data: FirebaseFirestore.DocumentData | null = null;

  if (noti.pacienteId) {
    const snap = await adminDb.collection("pacientes").doc(String(noti.pacienteId)).get();
    if (snap.exists && snap.data()?.estado === "activo") { ref = snap.ref; data = snap.data()!; }
  }
  if (!ref && noti.pacienteExpediente) {
    const q = await adminDb.collection("pacientes")
      .where("expediente", "==", String(noti.pacienteExpediente))
      .where("estado", "==", "activo")
      .limit(1)
      .get();
    if (!q.empty) { ref = q.docs[0].ref; data = q.docs[0].data(); }
  }
  if (!ref) return; // ya egresado o no existe en la base de pacientes

  await ref.update({
    estado: nuevoEstado,
    egresoPendiente: true, // bandera: el egreso aún debe completarlo ESDOMED
    egresadoAutoEn: FieldValue.serverTimestamp(),
    notificacionAltaId: notificacionId,
    actualizadoEn: FieldValue.serverTimestamp(),
    actualizadoPor: caller.uid,
  });

  // Anular las tarjetas de visita activas del expediente (igual que en el egreso
  // normal), ya que el paciente deja de estar internado.
  const expediente = String(data?.expediente ?? noti.pacienteExpediente ?? "");
  if (expediente) {
    const tv = await adminDb.collection("tarjetas_visita").where("expediente", "==", expediente).get();
    await Promise.all(
      tv.docs
        .filter(d => d.data().estado === "activa")
        .map(d => d.ref.update({ estado: "anulada", actualizadoEn: FieldValue.serverTimestamp() })),
    );
  }
}

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
    if (role !== "esdomed" && role !== "asistente_esdomed" && role !== "admin") return null;

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

    // Alta efectiva → sacar al paciente de activos de una. (Depósito/suspendida solo
    // se acusan de recibido; el paciente sigue internado y no se desactiva.)
    if (estadoCierre === "procesada") {
      try {
        await desactivarPacienteDelAlta(actual, id, caller);
      } catch (e) {
        // No bloqueamos el cierre del alta si la desactivación falla.
        console.error("No se pudo desactivar al paciente tras procesar el alta:", e);
      }
    }
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
