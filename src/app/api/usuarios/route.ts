import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { serviciosPorTipoMedico } from "@/lib/cuidadosCriticos";
import type { TipoMedicoCuidadosCriticos, UserRole } from "@/types";

const VALID_ROLES = new Set<UserRole>([
  "medico",
  "esdomed",
  "trabajo_social",
  "psicologia",
  "admin",
  "enfermeria",
  "rrhh",
]);

async function getCallerRole(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("usuarios").doc(decoded.uid).get();
    return snap.data()?.role ?? null;
  } catch {
    return null;
  }
}

function isSuperAdmin(role: string | null) {
  return role === "admin";
}

// GET — listar todos los usuarios
export async function GET(req: NextRequest) {
  const role = await getCallerRole(req);
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const snap = await adminDb.collection("usuarios").orderBy("nombre").get();
  const usuarios = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  return NextResponse.json(usuarios);
}

// POST — crear usuario
export async function POST(req: NextRequest) {
  const role = await getCallerRole(req);
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { nombre, email, password, userRole, servicios, jvpm, tipoMedico } = await req.json();

  if (!nombre || !email || !password || !userRole) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }
  if (!VALID_ROLES.has(userRole as UserRole)) {
    return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
  }

  const userRecord = await adminAuth.createUser({ email, password, displayName: nombre });

  const tipoMedicoValido: TipoMedicoCuidadosCriticos | undefined =
    userRole === "medico" && (tipoMedico === "uci" || tipoMedico === "ucin")
      ? tipoMedico
      : undefined;
  const serviciosArr: string[] = tipoMedicoValido
    ? serviciosPorTipoMedico(tipoMedicoValido)
    : Array.isArray(servicios) ? servicios.map(String) : [];

  await adminDb.collection("usuarios").doc(userRecord.uid).set({
    nombre,
    email,
    role: userRole,
    servicios: serviciosArr,
    servicio: serviciosArr[0] ?? "",
    ...(tipoMedicoValido ? { tipoMedico: tipoMedicoValido } : {}),
    ...(userRole === "medico" && jvpm ? { jvpm } : {}),
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ uid: userRecord.uid });
}
