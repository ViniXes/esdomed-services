import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
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
const SERVICIOS_CRITICOS_NORMALIZADOS = new Set([...SERVICIOS_CRITICOS].map(normalizar));

function texto(value: unknown) {
  return String(value ?? "").trim();
}

function normalizar(value: unknown) {
  return texto(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function parseDate(value: unknown) {
  if (!value) return null;
  const date = typeof (value as { toDate?: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : value instanceof Date
      ? value
      : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function fechaInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function diasInclusivos(desde: unknown, hasta: Date) {
  const inicio = parseDate(desde);
  if (!inicio) return null;
  const a = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const b = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  if (b < a) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
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
  const creadoEn = parseDate(t.creadoEn);
  if (!creadoEn || creadoEn < CORTE_INICIO) {
    return NextResponse.json({ ok: true, cerrada: false, motivo: "traslado_anterior_al_corte" });
  }

  const servicioOrigen = texto(t.servicioOrigen);
  const servicioDestino = t.tipoTraslado === "interno"
    ? servicioOrigen
    : texto(t.servicioDestino ?? servicioOrigen);
  const servicioOrigenNormalizado = normalizar(servicioOrigen);

  if (!servicioOrigen || servicioOrigenNormalizado === normalizar(servicioDestino)) {
    return NextResponse.json({ ok: true, cerrada: false, motivo: "mismo_servicio" });
  }
  if (!SERVICIOS_CRITICOS_NORMALIZADOS.has(servicioOrigenNormalizado)) {
    return NextResponse.json({ ok: true, cerrada: false, motivo: "origen_no_critico" });
  }

  const expediente = texto(t.pacienteExpediente);
  if (!expediente) {
    return NextResponse.json({ ok: true, cerrada: false, motivo: "sin_expediente" });
  }

  const fichaQuery = await adminDb.collection("fichas_cuidados_criticos")
    .where("pacienteExpediente", "==", expediente)
    .where("estadoEstancia", "==", "activa")
    .get();
  const fichasCerrables = fichaQuery.docs.filter(doc => normalizar(doc.data().servicio) === servicioOrigenNormalizado);

  if (fichasCerrables.length === 0) {
    return NextResponse.json({ ok: true, cerrada: false, motivo: "sin_ficha_activa" });
  }

  const fechaTraslado = parseDate(t.actualizadoEn) ?? parseDate(t.creadoEn) ?? new Date();
  const fechaEgresoServicio = fechaInput(fechaTraslado);
  const batch = adminDb.batch();

  for (const fichaDoc of fichasCerrables) {
    const ficha = fichaDoc.data();
    const datos = { ...(ficha.datos ?? {}) };
    datos.alta = "TRASLADO";
    datos.fecha_egreso_del_servicio = fechaEgresoServicio;

    const dias = diasInclusivos(datos.fecha_ingreso_al_servicio, fechaTraslado);
    if (dias !== null) datos.dias_en_servicio = dias;

    batch.update(fichaDoc.ref, {
      datos,
      estadoEstancia: "egresada",
      actualizadoPorId: caller.uid,
      actualizadoPorNombre: caller.nombre,
      actualizadoEn: FieldValue.serverTimestamp(),
      cierreAutomaticoHospitalario: {
        fuente: "traslado_aprobado",
        referenciaId: id,
        pacienteId: texto(ficha.pacienteId) || null,
        expediente,
        pacienteEstado: "traslado",
        fechaEgresoHospitalario: Timestamp.fromDate(fechaTraslado),
        servicioOrigen,
        servicioDestino,
        aplicadoEn: FieldValue.serverTimestamp(),
      },
    });
  }

  await batch.commit();

  return NextResponse.json({ ok: true, cerrada: true, fichas: fichasCerrables.map(doc => doc.id) });
}
