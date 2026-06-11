import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { Paciente, TipoAltaVivo } from "@/types";

const TIPOS_ALTA = new Set<TipoAltaVivo>([
  "domicilio",
  "exigida",
  "referido",
  "fuga",
  "in_extremis",
]);

type Caller = {
  uid: string;
  nombre: string;
  role: string;
};

type RectificarBody = {
  paciente?: Pick<Paciente, "id" | "expediente" | "apellidos" | "nombres" | "servicioActual" | "camaActual"> | null;
  tipoAlta?: TipoAltaVivo;
  notas?: string | null;
};

async function getCaller(req: NextRequest): Promise<Caller | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("usuarios").doc(decoded.uid).get();
    const data = snap.data();
    if (data?.role !== "enfermeria") return null;

    return {
      uid: decoded.uid,
      nombre: String(data.nombre ?? decoded.name ?? decoded.email ?? "Enfermeria"),
      role: data.role,
    };
  } catch {
    return null;
  }
}

function nombrePaciente(paciente: NonNullable<RectificarBody["paciente"]>) {
  return `${paciente.apellidos}, ${paciente.nombres}`;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller(req);
  if (!caller) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json()) as RectificarBody;
  const tipoAlta = body.tipoAlta;

  if (!tipoAlta || !TIPOS_ALTA.has(tipoAlta)) {
    return NextResponse.json({ error: "Tipo de alta invalido" }, { status: 400 });
  }

  const ref = adminDb.collection("notificaciones_altas").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Notificacion no encontrada" }, { status: 404 });
  }

  const actual = snap.data()!;
  const puedeRectificar = actual.estado === "pendiente" || actual.estado === "observada";
  if (actual.notificadoPorId !== caller.uid || actual.notificadoPorRol !== "enfermeria" || !puedeRectificar) {
    return NextResponse.json({ error: "Esta notificacion ya no puede rectificarse" }, { status: 403 });
  }

  if (actual.rectificacionUsada === true) {
    return NextResponse.json({ error: "La rectificacion unica ya fue utilizada" }, { status: 409 });
  }

  const update: Record<string, unknown> = {
    estado: "pendiente",
    tipoAlta,
    notas: typeof body.notas === "string" && body.notas.trim() ? body.notas.trim() : null,
    rectificacionUsada: true,
    rectificadoPorId: caller.uid,
    rectificadoPorNombre: caller.nombre,
    rectificadoEn: FieldValue.serverTimestamp(),
    rectificacionAnterior: {
      pacienteId: actual.pacienteId,
      pacienteExpediente: actual.pacienteExpediente,
      pacienteNombre: actual.pacienteNombre,
      servicio: actual.servicio,
      cama: actual.cama,
      tipoAlta: actual.tipoAlta,
      notas: actual.notas ?? null,
    },
    modificadoPorId: caller.uid,
    modificadoPorNombre: caller.nombre,
    modificadoPorRol: caller.role,
    modificadoEn: FieldValue.serverTimestamp(),
  };

  if (actual.estado === "observada") {
    update.observacionAtendidaPorId = caller.uid;
    update.observacionAtendidaPorNombre = caller.nombre;
    update.observacionAtendidaEn = FieldValue.serverTimestamp();
  }

  const paciente = body.paciente;
  if (paciente?.id && paciente.expediente && paciente.apellidos && paciente.nombres && paciente.servicioActual) {
    update.pacienteId = paciente.id;
    update.pacienteExpediente = paciente.expediente;
    update.pacienteNombre = nombrePaciente(paciente);
    update.servicio = paciente.servicioActual;
    update.cama = paciente.camaActual ?? "";
  }

  await ref.update(update);
  return NextResponse.json({ ok: true });
}
