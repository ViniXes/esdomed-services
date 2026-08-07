import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { serviciosPorTipoMedico } from "@/lib/cuidadosCriticos";
import { jvpmAUsername, usernameValido, emailSinteticoMedico } from "@/lib/username";
import { normalizarDui, duiValido } from "@/lib/dui";
import type { TipoMedicoCuidadosCriticos } from "@/types";

const PENDIENTES = "registros_medicos_pendientes";

function esTipoMedicoValido(value: unknown): value is TipoMedicoCuidadosCriticos {
  return value === "uci" || value === "ucin" || value === "uci_ucin" || value === "jefe_uci_ucin";
}

// Endpoint PÚBLICO de autoregistro de médicos. No crea el documento en `usuarios`
// ni asigna rol: crea un usuario de Auth DESHABILITADO y guarda la solicitud en
// `registros_medicos_pendientes`. El admin la aprueba o rechaza en el dashboard.
// Así, mientras está pendiente, no puede iniciar sesión ni leer datos clínicos.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  // ── Normalización + validación de campos ──
  const nombre = String(body.nombre ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  const dui = normalizarDui(body.dui);
  const jvpmRaw = String(body.jvpm ?? "").trim();
  const username = jvpmAUsername(jvpmRaw);
  const password = String(body.password ?? "");
  const tipoMedico = esTipoMedicoValido(body.tipoMedico) ? body.tipoMedico : undefined;

  if (!nombre || nombre.length < 5) {
    return NextResponse.json({ error: "Escribe tu nombre completo" }, { status: 400 });
  }
  if (!duiValido(dui)) {
    return NextResponse.json({ error: "El DUI no es valido (formato 00000000-0)" }, { status: 400 });
  }
  if (!jvpmRaw) {
    return NextResponse.json({ error: "El JVPM es requerido" }, { status: 400 });
  }
  if (!usernameValido(username)) {
    return NextResponse.json({ error: "El JVPM no es valido como usuario (3-30 caracteres: letras, numeros, . _ -)" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "La contrasena debe tener al menos 6 caracteres" }, { status: 400 });
  }

  // Servicios: UCI/UCIN los determina el tipo; médico general los elige.
  const servicios: string[] = tipoMedico
    ? serviciosPorTipoMedico(tipoMedico)
    : Array.isArray(body.servicios) ? body.servicios.map(String).filter(Boolean) : [];
  if (servicios.length === 0) {
    return NextResponse.json({ error: "Selecciona al menos un servicio" }, { status: 400 });
  }

  // ── Unicidad: DUI y JVPM/username no pueden repetirse en usuarios ni en pendientes ──
  const [duiUsuarios, duiPendientes, userUsuarios, userPendientes] = await Promise.all([
    adminDb.collection("usuarios").where("dui", "==", dui).limit(1).get(),
    adminDb.collection(PENDIENTES).where("dui", "==", dui).limit(1).get(),
    adminDb.collection("usuarios").where("username", "==", username).limit(1).get(),
    adminDb.collection(PENDIENTES).where("username", "==", username).limit(1).get(),
  ]);
  if (!duiUsuarios.empty || !duiPendientes.empty) {
    return NextResponse.json({ error: "Ya existe un registro con ese DUI" }, { status: 409 });
  }
  if (!userUsuarios.empty || !userPendientes.empty) {
    return NextResponse.json({ error: "Ya existe un registro con ese JVPM" }, { status: 409 });
  }

  // ── Crear usuario de Auth DESHABILITADO (no puede iniciar sesion aun) ──
  const email = emailSinteticoMedico(username);
  let userRecord;
  try {
    userRecord = await adminAuth.createUser({ email, password, displayName: nombre, disabled: true });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/email-already-exists") {
      return NextResponse.json({ error: "Ya existe un registro con ese JVPM" }, { status: 409 });
    }
    if (code === "auth/invalid-password") {
      return NextResponse.json({ error: "La contrasena debe tener al menos 6 caracteres" }, { status: 400 });
    }
    throw err;
  }

  // ── Guardar la solicitud pendiente (NO toca `usuarios`) ──
  await adminDb.collection(PENDIENTES).doc(userRecord.uid).set({
    uid: userRecord.uid,
    nombre,
    dui,
    jvpm: jvpmRaw,
    username,
    email,
    ...(tipoMedico ? { tipoMedico } : {}),
    servicios,
    creadoEn: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
