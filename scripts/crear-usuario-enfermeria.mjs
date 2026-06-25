#!/usr/bin/env node
/**
 * Crea un usuario GENÉRICO de enfermería con acceso a todos los servicios
 * registrados en el sistema (rol "enfermeria"). Login por username.
 *
 * Requisito: service-account.json en la raíz (Firebase Console → Cuentas de
 * servicio → Generar nueva clave privada).
 *
 * Uso:
 *   node scripts/crear-usuario-enfermeria.mjs --dry-run   # solo muestra qué haría
 *   node scripts/crear-usuario-enfermeria.mjs             # crea el usuario
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const DRY_RUN = hasFlag("--dry-run");
const KEY_PATH = resolve(ROOT, "service-account.json");

// ── Datos del usuario a crear ────────────────────────────────────────────────
const NOMBRE = "Enfermería General";
const USERNAME = "enfermeria";
const EMAIL = "enfermeria@esdomed.local"; // sintético: el login real es por username
const PASSWORD = "enfermeria123";
const ROLE = "enfermeria";

async function main() {
  if (!existsSync(KEY_PATH)) {
    console.error("\n❌ No se encontró service-account.json en la raíz del proyecto.");
    console.error("   Firebase Console → Configuración → Cuentas de servicio → Generar clave privada.\n");
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const { getAuth } = await import("firebase-admin/auth");

  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();
  const authAdmin = getAuth();

  // ── Catálogo de servicios vivo (configuracion/servicios) ──
  const cfgSnap = await db.collection("configuracion").doc("servicios").get();
  const lista = cfgSnap.exists ? cfgSnap.data()?.lista : null;
  const servicios = Array.isArray(lista)
    ? lista.map((s) => (typeof s === "string" ? s : s?.nombre)).filter(Boolean)
    : [];

  if (servicios.length === 0) {
    console.error("\n⚠️  No se pudo leer el catálogo de servicios (configuracion/servicios).");
    console.error("   El usuario se creará igualmente; enfermería ve todos los servicios por diseño.\n");
  }

  // ── Verificar que el username no esté en uso ──
  const dup = await db.collection("usuarios").where("username", "==", USERNAME).limit(1).get();
  if (!dup.empty) {
    console.error(`\n❌ Ya existe un usuario con el username "${USERNAME}" (uid: ${dup.docs[0].id}). Aborto.\n`);
    process.exit(1);
  }

  console.log("\n── Usuario de enfermería a crear ──");
  console.log(`   Nombre:    ${NOMBRE}`);
  console.log(`   Usuario:   ${USERNAME}`);
  console.log(`   Correo:    ${EMAIL}`);
  console.log(`   Clave:     ${PASSWORD}`);
  console.log(`   Rol:       ${ROLE}`);
  console.log(`   Servicios: ${servicios.length} (todos los del catálogo)`);

  if (DRY_RUN) {
    console.log("\n(--dry-run) No se escribió nada.\n");
    process.exit(0);
  }

  // ── Crear en Firebase Auth ──
  let userRecord;
  try {
    userRecord = await authAdmin.createUser({ email: EMAIL, password: PASSWORD, displayName: NOMBRE });
  } catch (err) {
    if (err?.code === "auth/email-already-exists") {
      console.error(`\n❌ Ya existe una cuenta con el correo ${EMAIL}. Aborto.\n`);
      process.exit(1);
    }
    throw err;
  }

  // ── Documento en usuarios/{uid} ──
  await db.collection("usuarios").doc(userRecord.uid).set({
    nombre: NOMBRE,
    email: EMAIL,
    username: USERNAME,
    role: ROLE,
    servicios,
    servicio: servicios[0] ?? "",
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log(`\n✅ Usuario creado (uid: ${userRecord.uid}).\n`);
}

main().catch((e) => {
  console.error("\n❌ Error:", e?.message ?? e, "\n");
  process.exit(1);
});
