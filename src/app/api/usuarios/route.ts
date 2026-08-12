import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { serviciosPorTipoMedico } from "@/lib/cuidadosCriticos";
import { normalizarUsername, usernameValido } from "@/lib/username";
import type { TipoMedicoCuidadosCriticos, UserRole } from "@/types";

const VALID_ROLES = new Set<UserRole>([
  "medico",
  "esdomed",
  "asistente_esdomed",
  "trabajo_social",
  "psicologia",
  "comite_lesiones",
  "admin",
  "enfermeria",
  "rrhh",
  "transporte",
  "motorista",
  "isbm_tecnico",
  "isbm_supervisor",
  "isbm_jefe",
]);

function esTipoMedicoValido(value: unknown): value is TipoMedicoCuidadosCriticos {
  return value === "uci" || value === "ucin" || value === "uci_ucin" || value === "jefe_uci_ucin";
}

// Roles del personal ESDOMED que llevan código de marcación y puesto en el plan.
function esPersonalEsdomed(role: UserRole) {
  return role === "esdomed" || role === "asistente_esdomed";
}

// Quién puede tener código de marcación / puesto: el personal ESDOMED y también
// un admin que además sea personal de ESDOMED (para que aparezca en el plan).
function puedeTenerCodigoPlan(role: UserRole) {
  return esPersonalEsdomed(role) || role === "admin";
}

// Roles colegiados que llevan número de junta (JVPM): médicos, psicología y
// trabajo social (también están colegiados y firman/sellan documentos).
function puedeTenerJvpm(role: UserRole) {
  return role === "medico" || role === "psicologia" || role === "trabajo_social";
}

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

// GET — listar usuarios. Requiere `?role=` para acotar la lectura a ese rol
// (sin `orderBy` server-side, para no exigir un índice compuesto nuevo; se
// ordena en cliente). Sin `role` (o `role=todos`) mantiene el comportamiento
// anterior de traer la colección completa — sigue disponible, pero el front
// ya no lo dispara por defecto al abrir la página.
export async function GET(req: NextRequest) {
  const callerRole = await getCallerRole(req);
  if (!isSuperAdmin(callerRole)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const filtroRol = searchParams.get("role");

  const snap =
    filtroRol && filtroRol !== "todos" && VALID_ROLES.has(filtroRol as UserRole)
      ? await adminDb.collection("usuarios").where("role", "==", filtroRol).get()
      : await adminDb.collection("usuarios").orderBy("nombre").get();

  const usuarios = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as { uid: string; nombre?: string }));
  if (filtroRol && filtroRol !== "todos") {
    usuarios.sort((a, b) => String(a.nombre ?? "").localeCompare(String(b.nombre ?? "")));
  }
  return NextResponse.json(usuarios);
}

// POST — crear usuario
export async function POST(req: NextRequest) {
  const role = await getCallerRole(req);
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { nombre, email, password, userRole, servicios, jvpm, tipoMedico, codigoMarcacion, puesto, username: usernameRaw } = await req.json();

  if (!nombre || !email || !password || !userRole) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }
  if (!VALID_ROLES.has(userRole as UserRole)) {
    return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
  }

  // Username opcional (alias de login). Si viene, se valida formato y unicidad.
  const username = normalizarUsername(usernameRaw);
  if (username) {
    if (!usernameValido(username)) {
      return NextResponse.json({ error: "Username invalido (3-30 caracteres: letras, numeros, . _ -)" }, { status: 400 });
    }
    const dup = await adminDb.collection("usuarios").where("username", "==", username).limit(1).get();
    if (!dup.empty) {
      return NextResponse.json({ error: `El username "${username}" ya esta en uso`, code: "username-taken" }, { status: 409 });
    }
  }

  // Si el correo ya está registrado, Firebase Auth lanza auth/email-already-exists.
  // Lo devolvemos como 409 con un código que el cliente usa para abrir el modal.
  let userRecord;
  try {
    userRecord = await adminAuth.createUser({ email, password, displayName: nombre });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/email-already-exists") {
      return NextResponse.json(
        { error: `Ya existe un usuario con el correo ${email}`, code: "email-already-exists" },
        { status: 409 },
      );
    }
    if (code === "auth/invalid-email") {
      return NextResponse.json({ error: "El correo electronico no es valido" }, { status: 400 });
    }
    if (code === "auth/invalid-password") {
      return NextResponse.json({ error: "La contrasena debe tener al menos 6 caracteres" }, { status: 400 });
    }
    throw err;
  }

  const tipoMedicoValido: TipoMedicoCuidadosCriticos | undefined =
    userRole === "medico" && esTipoMedicoValido(tipoMedico)
      ? tipoMedico
      : undefined;
  const serviciosArr: string[] = tipoMedicoValido
    ? serviciosPorTipoMedico(tipoMedicoValido)
    : Array.isArray(servicios) ? servicios.map(String) : [];

  const conCodigoPlan = puedeTenerCodigoPlan(userRole as UserRole);

  await adminDb.collection("usuarios").doc(userRecord.uid).set({
    nombre,
    email,
    ...(username ? { username } : {}),
    role: userRole,
    servicios: serviciosArr,
    servicio: serviciosArr[0] ?? "",
    ...(tipoMedicoValido ? { tipoMedico: tipoMedicoValido } : {}),
    ...(puedeTenerJvpm(userRole as UserRole) && jvpm ? { jvpm } : {}),
    ...(conCodigoPlan && codigoMarcacion ? { codigoMarcacion: String(codigoMarcacion).trim() } : {}),
    ...(conCodigoPlan && puesto ? { puesto: String(puesto).trim() } : {}),
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ uid: userRecord.uid });
}
