import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cerrarFichasCriticasActivasPorEgresoPaciente } from "@/lib/server/cerrarFichaCritica";

const ROLES_PERMITIDOS = new Set(["admin", "esdomed", "asistente_esdomed"]);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("usuarios").doc(decoded.uid).get();
    const data = snap.data();
    const role = String(data?.role ?? "");
    if (!ROLES_PERMITIDOS.has(role)) return null;
    return {
      uid: decoded.uid,
      nombre: String(data?.nombre ?? decoded.name ?? decoded.email ?? "ESDOMED"),
      role,
    };
  } catch {
    return null;
  }
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller(req);
  if (!caller) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const pacienteSnap = await adminDb.collection("pacientes").doc(id).get();
  if (!pacienteSnap.exists) {
    return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  }

  const paciente = pacienteSnap.data()!;
  const estadoPaciente = String(paciente.estado ?? "");
  const fechaEgreso = parseDate(paciente.fechaEgreso);

  if (estadoPaciente === "activo" || !fechaEgreso) {
    return NextResponse.json({ ok: true, cerradas: 0, motivo: "paciente_sin_egreso_hospitalario" });
  }

  const resultado = await cerrarFichasCriticasActivasPorEgresoPaciente({
    pacienteId: pacienteSnap.id,
    expediente: String(paciente.expediente ?? ""),
    estadoPaciente,
    fechaEgreso,
    caller,
    fuente: "egreso_paciente",
    referenciaId: pacienteSnap.id,
  });

  return NextResponse.json({ ok: true, ...resultado });
}
