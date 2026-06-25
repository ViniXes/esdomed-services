#!/usr/bin/env node
/**
 * Marca con `generico: true` las cuentas genéricas de enfermería (las creadas por
 * servicio, identificadas por su correo @enfermeria.esdomed.local). El flag hace
 * que el formulario de notificación de alta pida el nombre real de quien reporta.
 *
 * Uso:
 *   node scripts/marcar-genericos-enfermeria.mjs --dry-run
 *   node scripts/marcar-genericos-enfermeria.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEY = resolve(ROOT, "service-account.json");
const DRY_RUN = process.argv.includes("--dry-run");

if (!existsSync(KEY)) { console.error("\n❌ Falta service-account.json\n"); process.exit(1); }

const { initializeApp, cert } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
initializeApp({ credential: cert(JSON.parse(readFileSync(KEY, "utf8"))) });
const db = getFirestore();

const snap = await db.collection("usuarios").where("role", "==", "enfermeria").get();
const genericos = snap.docs.filter((d) => String(d.data().email || "").endsWith("@enfermeria.esdomed.local"));

console.log(`\n${genericos.length} cuentas genéricas de enfermería a marcar (generico: true):`);
genericos.forEach((d) => console.log(`  - ${d.data().username}  (${d.data().servicio})`));

if (DRY_RUN) { console.log("\n(--dry-run) No se escribió nada.\n"); process.exit(0); }

let n = 0;
for (const d of genericos) {
  if (d.data().generico === true) continue;
  await d.ref.update({ generico: true });
  n++;
}
console.log(`\n✅ Marcadas: ${n} (las que ya estaban marcadas se omiten).\n`);
