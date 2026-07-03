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
        .map(d => d.ref.update({ estado: "anulada", anuladaPorAltaId: notificacionId, actualizadoEn: FieldValue.serverTimestamp() })),
    );
  }
}

// Revertir un alta efectiva: el paciente notificado en realidad no se fue. Deshace
// la desactivación devolviendo el ingreso a "activo" y limpiando las banderas de
// egreso. Solo reactiva el paciente si sigue ligado a ESTA notificación
// (notificacionAltaId), para no pisar un reingreso posterior.
async function reactivarPacienteDelAlta(
  noti: FirebaseFirestore.DocumentData,
  notificacionId: string,
  caller: Caller,
) {
  let ref: FirebaseFirestore.DocumentReference | null = null;

  if (noti.pacienteId) {
    const snap = await adminDb.collection("pacientes").doc(String(noti.pacienteId)).get();
    if (snap.exists && snap.data()?.notificacionAltaId === notificacionId) ref = snap.ref;
  }
  if (!ref && noti.pacienteExpediente) {
    const q = await adminDb.collection("pacientes")
      .where("expediente", "==", String(noti.pacienteExpediente))
      .get();
    const match = q.docs.find(d => d.data().notificacionAltaId === notificacionId);
    if (match) ref = match.ref;
  }

  if (ref) {
    await ref.update({
      estado: "activo",
      egresoPendiente: FieldValue.delete(),
      egresadoAutoEn: FieldValue.delete(),
      notificacionAltaId: FieldValue.delete(),
      reactivadoEn: FieldValue.serverTimestamp(),
      reactivadoPor: caller.uid,
      actualizadoEn: FieldValue.serverTimestamp(),
      actualizadoPor: caller.uid,
    });
  }

  // Restaurar las tarjetas de visita que ESTA alta anuló (marcadas con
  // anuladaPorAltaId). Corre aunque el ingreso ya no exista/esté ligado.
  const expediente = String(noti.pacienteExpediente ?? "");
  if (expediente) {
    const tv = await adminDb.collection("tarjetas_visita").where("expediente", "==", expediente).get();
    await Promise.all(
      tv.docs
        .filter(d => d.data().estado === "anulada" && d.data().anuladaPorAltaId === notificacionId)
        .map(d => d.ref.update({
          estado: "activa",
          anuladaPorAltaId: FieldValue.delete(),
          actualizadoEn: FieldValue.serverTimestamp(),
        })),
    );
  }
}

type Body =
  | { action: "procesar" }
  | { action: "revertir"; nota?: string }
  | { action: "rechazar"; nota: string }
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

  // Revertir un alta efectiva ya procesada: reactiva al paciente y cierra la
  // notificación como "revertida". Es la única acción válida sobre una procesada.
  if (body.action === "revertir") {
    if (actual.estado !== "procesada") {
      return NextResponse.json({ error: "Solo se puede revertir un alta efectiva ya procesada." }, { status: 409 });
    }
    await ref.update({
      estado: "revertida",
      revertidoPorId: caller.uid,
      revertidoPorNombre: caller.nombre,
      revertidoEn: FieldValue.serverTimestamp(),
      revertidoNota: body.nota?.trim() || null,
    });
    try {
      await reactivarPacienteDelAlta(actual, id, caller);
    } catch (e) {
      // No bloqueamos la reversión de la notificación si la reactivación falla.
      console.error("No se pudo reactivar al paciente tras revertir el alta:", e);
    }
    return NextResponse.json({ ok: true });
  }

  // Una revertida NO es terminal: ESDOMED puede reincorporarla al flujo —
  // marcarla efectiva de nuevo (procesar) o dejarla en espera con observación
  // (observar) mientras se resuelve lo que motivó la reversión.
  if (actual.estado !== "pendiente" && actual.estado !== "observada" && actual.estado !== "revertida") {
    return NextResponse.json({ error: "La notificacion ya esta cerrada" }, { status: 409 });
  }

  // Rechazar: cierre terminal — la notificación no procede (error de enfermería,
  // paciente que no corresponde, etc.). No toca al paciente: en estos estados
  // nunca se desactivó (y si venía de revertida, ya fue reactivado). La nota
  // del porqué es obligatoria y queda visible para quien notificó.
  if (body.action === "rechazar") {
    const nota = body.nota?.trim();
    if (!nota) {
      return NextResponse.json({ error: "La nota del rechazo es obligatoria" }, { status: 400 });
    }
    await ref.update({
      estado: "rechazada",
      rechazadoPorId: caller.uid,
      rechazadoPorNombre: caller.nombre,
      rechazadoEn: FieldValue.serverTimestamp(),
      rechazoNota: nota,
      // Es una intervención de ESDOMED sobre la notificación, como observar.
      modificadoPorId: caller.uid,
      modificadoPorNombre: caller.nombre,
      modificadoPorRol: caller.role,
      modificadoEn: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "procesar") {
    const estadoCierre = TIPOS_SOLO_RECIBIDO.has(String(actual.tipoAlta)) ? "recibida" : "procesada";

    // Procesar NO es una "modificación": es el cierre normal (alta efectiva /
    // acuse de recibido). Solo se registra el procesadoPor*; el "Modificado por"
    // se reserva para cuando ESDOMED interviene con una observación.
    await ref.update({
      estado: estadoCierre,
      procesadoPorId: caller.uid,
      procesadoPorNombre: caller.nombre,
      procesadoEn: FieldValue.serverTimestamp(),
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
    if (actual.estado !== "observada") {
      return NextResponse.json({ error: "La notificacion no tiene observacion activa" }, { status: 409 });
    }
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
