import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { SERVICIOS_UCI, SERVICIOS_UCIN } from "@/lib/cuidadosCriticos";

// Traslados salientes de una unidad UCI/UCIN cierran automáticamente la ficha
// abierta en el servicio de ORIGEN (alta = "TRASLADO"), igual que un egreso
// vivo/fallecido. Solo aplica cuando el servicio realmente cambia — un traslado
// "interno" (cambio de cama dentro del mismo servicio) nunca debe cerrar nada,
// y tampoco un "servicio_cama"/"intercambio" cuyo destino coincide con el
// origen (el médico pudo elegir el mismo servicio por error). No cubre
// "intercambio" cuando involucra a un segundo paciente en otra unidad crítica:
// eso queda fuera de este primer alcance.
const SERVICIOS_CRITICOS = new Set<string>([...SERVICIOS_UCI, ...SERVICIOS_UCIN]);

function fechaInputHoy() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
}

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("usuarios").doc(decoded.uid).get();
    const data = snap.data();
    const role = data?.role;
    if (role !== "esdomed" && role !== "asistente_esdomed" && role !== "admin") return null;
    return { uid: decoded.uid, nombre: String(data?.nombre ?? decoded.name ?? decoded.email ?? "ESDOMED") };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller(req);
  if (!caller) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const trasladoSnap = await adminDb.collection("traslados").doc(id).get();
  if (!trasladoSnap.exists) {
    return NextResponse.json({ error: "Traslado no encontrado" }, { status: 404 });
  }
  const t = trasladoSnap.data()!;

  if (t.estado !== "aprobado") {
    return NextResponse.json({ error: "El traslado no esta aprobado" }, { status: 409 });
  }

  // Solo aplica a traslados creados a partir de agosto 2026: los anteriores son de
  // cuando esta automatizacion todavia no existia, no se deben cerrar en retroactivo.
  const CORTE_INICIO = new Date("2026-08-01T00:00:00");
  const creadoEn = (t.creadoEn as { toDate?: () => Date })?.toDate?.() ?? new Date(t.creadoEn as string);
  if (Number.isNaN(creadoEn.getTime()) || creadoEn < CORTE_INICIO) {
    return NextResponse.json({ ok: true, cerrada: false, motivo: "traslado_anterior_al_corte" });
  }

  const servicioOrigen = String(t.servicioOrigen ?? "");
  const servicioDestino = t.tipoTraslado === "interno"
    ? servicioOrigen
    : String(t.servicioDestino ?? servicioOrigen);

  if (!servicioOrigen || servicioOrigen === servicioDestino) {
    return NextResponse.json({ ok: true, cerrada: false, motivo: "mismo_servicio" });
  }
  if (!SERVICIOS_CRITICOS.has(servicioOrigen)) {
    return NextResponse.json({ ok: true, cerrada: false, motivo: "origen_no_critico" });
  }

  const expediente = String(t.pacienteExpediente ?? "");
  if (!expediente) {
    return NextResponse.json({ ok: true, cerrada: false, motivo: "sin_expediente" });
  }

  const fichaQuery = await adminDb.collection("fichas_cuidados_criticos")
    .where("pacienteExpediente", "==", expediente)
    .where("servicio", "==", servicioOrigen)
    .where("estadoEstancia", "==", "activa")
    .limit(1)
    .get();

  if (fichaQuery.empty) {
    return NextResponse.json({ ok: true, cerrada: false, motivo: "sin_ficha_activa" });
  }

  const fichaRef = fichaQuery.docs[0].ref;
  await fichaRef.update({
    "datos.alta": "TRASLADO",
    "datos.fecha_egreso_del_servicio": fechaInputHoy(),
    estadoEstancia: "egresada",
    actualizadoPorId: caller.uid,
    actualizadoPorNombre: caller.nombre,
    actualizadoEn: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, cerrada: true, fichaId: fichaRef.id });
}
