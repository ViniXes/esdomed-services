import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { serviciosPorTipoMedico } from "@/lib/cuidadosCriticos";
import type { TipoMedicoCuidadosCriticos, UserRole } from "@/types";

const DEFAULT_TEST_PASSWORD = "123456";
const VALID_ROLES = new Set<UserRole>([
  "medico",
  "esdomed",
  "asistente_esdomed",
  "trabajo_social",
  "psicologia",
  "admin",
  "enfermeria",
  "rrhh",
]);

function esPersonalEsdomed(role: string | undefined) {
  return role === "esdomed" || role === "asistente_esdomed";
}

async function getCaller(req: NextRequest): Promise<{ uid: string; role: string } | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("usuarios").doc(decoded.uid).get();
    const role = snap.data()?.role;
    return typeof role === "string" ? { uid: decoded.uid, role } : null;
  } catch {
    return null;
  }
}

function isSuperAdmin(caller: { role: string } | null) {
  return caller?.role === "admin";
}

// PATCH - actualizar usuario o restablecer clave. Solo Administrador Superusuario.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const caller = await getCaller(req);
  if (!isSuperAdmin(caller)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { uid } = await params;
  const body = await req.json();

  if (body.resetPassword === true) {
    await adminAuth.updateUser(uid, { password: DEFAULT_TEST_PASSWORD });
    return NextResponse.json({ ok: true });
  }

  const update: Record<string, unknown> = {};
  const authUpdate: { email?: string; displayName?: string } = {};

  if ("nombre" in body) {
    const nombre = String(body.nombre ?? "").trim();
    if (!nombre) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    update.nombre = nombre;
    authUpdate.displayName = nombre;
  }

  if ("email" in body) {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "El correo es requerido" }, { status: 400 });
    update.email = email;
    authUpdate.email = email;
  }

  let nextRole: UserRole | undefined;
  if ("userRole" in body) {
    const userRole = body.userRole as UserRole;
    if (!VALID_ROLES.has(userRole)) return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
    nextRole = userRole;
    update.role = userRole;
  }

  const targetSnap = await adminDb.collection("usuarios").doc(uid).get();
  const targetData = targetSnap.data();
  const targetRole = nextRole ?? targetData?.role;
  let targetTipoMedico: TipoMedicoCuidadosCriticos | undefined =
    targetData?.tipoMedico === "uci" || targetData?.tipoMedico === "ucin"
      ? targetData.tipoMedico
      : undefined;

  if ("tipoMedico" in body) {
    targetTipoMedico =
      targetRole === "medico" && (body.tipoMedico === "uci" || body.tipoMedico === "ucin")
        ? body.tipoMedico
        : undefined;
  }
  update.tipoMedico = targetRole === "medico" && targetTipoMedico
    ? targetTipoMedico
    : FieldValue.delete();

  if ("servicios" in body || nextRole || "tipoMedico" in body) {
    const servicios = targetRole !== "medico"
      ? []
      : targetTipoMedico
        ? serviciosPorTipoMedico(targetTipoMedico)
        : Array.isArray(body.servicios) ? body.servicios.map(String) : [];
    update.servicios = servicios;
    update.servicio = servicios[0] ?? "";
  }

  if ("jvpm" in body || nextRole) {
    const jvpm = String(body.jvpm ?? "").trim();
    update.jvpm = targetRole === "medico" && jvpm ? jvpm : FieldValue.delete();
  }

  if ("codigoMarcacion" in body || nextRole) {
    const codigo = String(body.codigoMarcacion ?? "").trim();
    update.codigoMarcacion = esPersonalEsdomed(targetRole) && codigo ? codigo : FieldValue.delete();
  }

  if ("puesto" in body || nextRole) {
    const puesto = String(body.puesto ?? "").trim();
    update.puesto = esPersonalEsdomed(targetRole) && puesto ? puesto : FieldValue.delete();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Sin campos validos" }, { status: 400 });
  }

  if (Object.keys(authUpdate).length > 0) {
    await adminAuth.updateUser(uid, authUpdate);
  }

  await adminDb.collection("usuarios").doc(uid).update(update);
  return NextResponse.json({ ok: true });
}

// DELETE - eliminar usuario. Solo Administrador Superusuario.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const caller = await getCaller(req);
  if (!isSuperAdmin(caller)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { uid } = await params;
  if (caller?.uid === uid) {
    return NextResponse.json({ error: "No puedes eliminar tu propio usuario" }, { status: 400 });
  }

  await adminAuth.deleteUser(uid);
  await adminDb.collection("usuarios").doc(uid).delete();

  return NextResponse.json({ ok: true });
}
