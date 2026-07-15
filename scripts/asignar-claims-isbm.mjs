#!/usr/bin/env node
/**
 * Asigna a un usuario de Firebase Auth los custom claims que el módulo ISBM
 * necesita para acceder a Supabase (third-party auth + políticas RLS):
 *
 *   role:     "authenticated"                     ← requisito fijo de Supabase
 *   isbm_rol: "tecnico" | "supervisor" | "jefe"   ← lo que evalúan las RLS
 *
 * Además actualiza usuarios/{uid}.role en Firestore a "isbm_<rol>" para que
 * la plataforma lo enrute al área ISBM (solo si el documento ya existe).
 *
 * IMPORTANTE: los claims viajan en el ID token — el usuario debe cerrar
 * sesión y volver a entrar (o esperar ~1 h a que expire el token) para que
 * Supabase los vea.
 *
 * Requisito: service-account.json en la raíz del proyecto.
 *
 * Uso:
 *   node scripts/asignar-claims-isbm.mjs --email jefe@isbm.local --rol jefe
 *   node scripts/asignar-claims-isbm.mjs --uid <uid> --rol tecnico --dry-run
 *   node scripts/asignar-claims-isbm.mjs --email <email> --quitar   # revoca acceso
 */

import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const KEY_PATH = resolve(ROOT, "service-account.json");

const ROLES_VALIDOS = ["tecnico", "supervisor", "jefe"];

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY_RUN = args.includes("--dry-run");
const QUITAR = args.includes("--quitar");
const EMAIL = getArg("--email");
const UID = getArg("--uid");
const ROL = getArg("--rol");

async function main() {
  if (!existsSync(KEY_PATH)) {
    console.error("\n❌ No se encontró service-account.json en la raíz del proyecto.\n");
    process.exit(1);
  }
  if (!EMAIL && !UID) {
    console.error("\n❌ Indica el usuario con --email <email> o --uid <uid>.\n");
    process.exit(1);
  }
  if (!QUITAR && !ROLES_VALIDOS.includes(ROL)) {
    console.error(`\n❌ Indica --rol ${ROLES_VALIDOS.join(" | ")} (o --quitar para revocar).\n`);
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore } = await import("firebase-admin/firestore");

  initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, "utf8"))) });
  const adminAuth = getAuth();
  const db = getFirestore();

  const user = UID ? await adminAuth.getUser(UID) : await adminAuth.getUserByEmail(EMAIL);
  console.log(`\nUsuario: ${user.displayName ?? "(sin nombre)"} <${user.email}> (${user.uid})`);
  console.log(`Claims actuales: ${JSON.stringify(user.customClaims ?? {})}`);

  const claims = QUITAR
    ? {} // limpia role/isbm_rol → pierde acceso a Supabase
    : { ...user.customClaims, role: "authenticated", isbm_rol: ROL };
  const roleFirestore = QUITAR ? null : `isbm_${ROL}`;

  console.log(`Claims nuevos:   ${JSON.stringify(claims)}`);
  if (roleFirestore) console.log(`Rol en usuarios/{uid}: ${roleFirestore}`);

  if (DRY_RUN) {
    console.log("\n(dry-run: no se escribió nada)\n");
    return;
  }

  await adminAuth.setCustomUserClaims(user.uid, claims);
  console.log("✔ Claims asignados en Firebase Auth.");

  const usuarioRef = db.collection("usuarios").doc(user.uid);
  const usuarioDoc = await usuarioRef.get();
  if (roleFirestore && usuarioDoc.exists && usuarioDoc.data()?.role === "admin") {
    // El admin ya entra a /isbm por su propio rol: solo necesita los claims.
    console.log("ℹ La cuenta es admin — se conserva su rol de plataforma (solo se asignaron claims).");
  } else if (roleFirestore && usuarioDoc.exists) {
    await usuarioRef.update({ role: roleFirestore });
    console.log("✔ Rol actualizado en Firestore (usuarios).");
  } else if (roleFirestore) {
    console.warn("⚠ No existe usuarios/{uid} en Firestore — crea el documento del usuario (nombre, email, role) para que pueda entrar a la plataforma.");
  }

  console.log("\nListo. El usuario debe CERRAR SESIÓN y volver a entrar para que el token traiga los claims.\n");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message ?? e);
  process.exit(1);
});
