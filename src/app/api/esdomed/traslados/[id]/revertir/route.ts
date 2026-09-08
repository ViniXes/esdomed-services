import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { mismoServicio, mismaCama } from "@/lib/servicios";

// Reversión administrativa de un traslado APROBADO por error (el recurso dio
// "Aprobar" cuando debía "Rechazar"). Solo el rol admin. Deshace, en un solo
// batch, todo lo que la aprobación propagó:
//
//   1. traslados/{id}  → estado "rechazado" (o "pendiente" para reprocesarlo),
//                        con bloque `reversion{}` de auditoría.
//   2. pacientes       → quita la entrada de `movimientos` con trasladoId == id
//                        y devuelve servicioActual/camaActual al origen SOLO si
//                        el paciente sigue exactamente en el destino de ese
//                        traslado (si ya se movió después, se conserva su
//                        ubicación actual y se reporta).
//   3. fichas UCI/UCIN → reabre la ficha que cerrar-ficha-critica cerró por este
//                        traslado (cierreAutomaticoHospitalario.referenciaId).
//
// Todo con adminDb: no depende de reglas y el gate de rol se hace aquí.

type EstadoRevertido = "rechazado" | "pendiente";

type MovimientoDoc = {
  servicioOrigen?: string;
  servicioDestino?: string;
  camaOrigen?: string;
  camaDestino?: string;
  trasladoId?: string;
};

function texto(value: unknown) {
  return String(value ?? "").trim();
}

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("usuarios").doc(decoded.uid).get();
    const data = snap.data();
    if (data?.role !== "admin" || data?.activo === false) return null;
    return { uid: decoded.uid, nombre: String(data?.nombre ?? decoded.name ?? decoded.email ?? "Administración") };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller(req);
  if (!caller) {
    return NextResponse.json({ error: "Solo un administrador puede revertir un traslado." }, { status: 403 });
  }

  let body: { motivo?: unknown; estadoNuevo?: unknown } = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  const motivo = texto(body.motivo);
  const estadoNuevo: EstadoRevertido = body.estadoNuevo === "pendiente" ? "pendiente" : "rechazado";
  if (motivo.length < 5) {
    return NextResponse.json({ error: "Escribe la justificación de la reversión." }, { status: 400 });
  }

  const { id } = await params;
  const trasladoRef = adminDb.collection("traslados").doc(id);
  const trasladoSnap = await trasladoRef.get();
  if (!trasladoSnap.exists) {
    return NextResponse.json({ error: "Traslado no encontrado" }, { status: 404 });
  }
  const t = trasladoSnap.data()!;
  if (t.estado !== "aprobado") {
    return NextResponse.json({ error: "Solo se puede revertir un traslado aprobado." }, { status: 409 });
  }

  const batch = adminDb.batch();
  const pacientesRestaurados: { expediente: string; pacienteId: string; ubicacionRestaurada: boolean }[] = [];
  const fichasReabiertas: string[] = [];
  const fichasNoReabiertas: { id: string; motivo: string }[] = [];

  // ── 2. Pacientes: quitar el movimiento y devolver la ubicación ──────────────
  const expedientes = [texto(t.pacienteExpediente), texto(t.pacienteBExpediente)].filter(Boolean);
  for (const expediente of expedientes) {
    const snap = await adminDb.collection("pacientes").where("expediente", "==", expediente).limit(10).get();
    for (const pacDoc of snap.docs) {
      const pac = pacDoc.data();
      const movimientos = Array.isArray(pac.movimientos) ? (pac.movimientos as MovimientoDoc[]) : [];
      const delTraslado = movimientos.filter(m => m?.trasladoId === id);
      if (delTraslado.length === 0) continue;

      // El movimiento que registró la aprobación (el último, si por alguna razón hubiera más de uno).
      const mov = delTraslado[delTraslado.length - 1];
      const restantes = movimientos.filter(m => m?.trasladoId !== id);

      // Solo devolvemos la ubicación si el paciente sigue donde lo dejó ESTE traslado.
      const sigueEnDestino = pac.estado === "activo"
        && mismoServicio(pac.servicioActual, mov.servicioDestino)
        && mismaCama(pac.camaActual, mov.camaDestino);

      const update: Record<string, unknown> = {
        movimientos: restantes,
        actualizadoEn: FieldValue.serverTimestamp(),
      };
      if (sigueEnDestino) {
        update.servicioActual = mov.servicioOrigen ?? pac.servicioActual;
        update.camaActual = mov.camaOrigen ?? pac.camaActual;
      }
      batch.update(pacDoc.ref, update);
      pacientesRestaurados.push({ expediente, pacienteId: pacDoc.id, ubicacionRestaurada: sigueEnDestino });
    }
  }

  // ── 3. Fichas UCI/UCIN cerradas automáticamente por este traslado ──────────
  const fichasSnap = await adminDb.collection("fichas_cuidados_criticos")
    .where("cierreAutomaticoHospitalario.referenciaId", "==", id)
    .get();
  for (const fichaDoc of fichasSnap.docs) {
    const ficha = fichaDoc.data();
    const cierre = ficha.cierreAutomaticoHospitalario ?? {};
    if (cierre.fuente !== "traslado_aprobado" || ficha.estadoEstancia !== "egresada") {
      fichasNoReabiertas.push({ id: fichaDoc.id, motivo: "cierre_no_es_de_este_traslado" });
      continue;
    }
    // Si ya se abrió otra ficha activa del mismo paciente en ese servicio, no duplicamos.
    const activasSnap = await adminDb.collection("fichas_cuidados_criticos")
      .where("pacienteExpediente", "==", texto(ficha.pacienteExpediente))
      .where("estadoEstancia", "==", "activa")
      .get();
    const yaHayActiva = activasSnap.docs.some(d => mismoServicio(d.data().servicio, ficha.servicio));
    if (yaHayActiva) {
      fichasNoReabiertas.push({ id: fichaDoc.id, motivo: "ya_existe_ficha_activa" });
      continue;
    }

    const datos = { ...(ficha.datos ?? {}) };
    datos.alta = "";
    datos.fecha_egreso_del_servicio = "";
    datos.dias_en_servicio = "";

    batch.update(fichaDoc.ref, {
      datos,
      estadoEstancia: "activa",
      actualizadoPorId: caller.uid,
      actualizadoPorNombre: caller.nombre,
      actualizadoEn: FieldValue.serverTimestamp(),
      cierreAutomaticoHospitalario: FieldValue.delete(),
      reaperturaAutomatica: {
        fuente: "traslado_revertido",
        referenciaId: id,
        cierreAnterior: cierre,
        aplicadoPorId: caller.uid,
        aplicadoPorNombre: caller.nombre,
        aplicadoEn: FieldValue.serverTimestamp(),
      },
    });
    fichasReabiertas.push(fichaDoc.id);
  }

  // ── 1. El traslado ──────────────────────────────────────────────────────────
  const reversion = {
    estadoAnterior: "aprobado",
    estadoNuevo,
    motivo,
    aprobadoPorId: t.revisadoPor ?? null,
    aprobadoPorNombre: t.revisadoPorNombre ?? null,
    aprobadoEn: t.actualizadoEn ?? null,
    porId: caller.uid,
    porNombre: caller.nombre,
    en: FieldValue.serverTimestamp(),
    pacientesRestaurados,
    fichasReabiertas,
    fichasNoReabiertas,
  };
  const trasladoUpdate: Record<string, unknown> = {
    estado: estadoNuevo,
    notasEsdomed: motivo,
    reversion,
    actualizadoEn: FieldValue.serverTimestamp(),
  };
  if (estadoNuevo === "rechazado") {
    trasladoUpdate.revisadoPor = caller.uid;
    trasladoUpdate.revisadoPorNombre = caller.nombre;
  } else {
    // Vuelve a la bandeja como si no se hubiera procesado.
    trasladoUpdate.revisadoPor = FieldValue.delete();
    trasladoUpdate.revisadoPorNombre = FieldValue.delete();
  }
  batch.update(trasladoRef, trasladoUpdate);

  await batch.commit();

  return NextResponse.json({
    ok: true,
    estadoNuevo,
    pacientesRestaurados,
    fichasReabiertas,
    fichasNoReabiertas,
  });
}
