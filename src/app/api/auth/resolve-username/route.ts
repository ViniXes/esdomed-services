import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { normalizarUsername } from "@/lib/username";

// Traduce un username a su correo para que el cliente haga el signIn normal.
// Es pre-login (sin sesión), por eso corre en el servidor con el admin SDK; las
// reglas de Firestore impiden leer `usuarios` sin autenticarse. Devuelve siempre
// un error genérico si no existe, para no revelar qué usernames están registrados.
export async function POST(req: NextRequest) {
  let username = "";
  try {
    const body = await req.json();
    username = normalizarUsername(body?.username);
  } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }
  if (!username) return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 404 });

  const snap = await adminDb.collection("usuarios").where("username", "==", username).limit(1).get();
  const email = snap.empty ? null : snap.docs[0].data().email;
  if (!email) return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 404 });

  return NextResponse.json({ email });
}
