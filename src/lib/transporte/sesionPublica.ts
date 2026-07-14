import { signInAnonymously } from "firebase/auth";
import { auth } from "@/lib/firebase";

// El formulario público de transporte no pide cuenta: si no hay sesión, se
// inicia una ANÓNIMA e invisible. Con eso las reglas de Firestore pueden exigir
// autenticación, validar la forma del documento y sellar solicitanteUid —
// sin abrir la colección a escrituras sin sesión.
// Requiere habilitar el proveedor "Anonymous" en Firebase Auth (consola).
export async function asegurarSesionPublica(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}
