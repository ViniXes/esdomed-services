#!/usr/bin/env node
/**
 * Despliega firestore.rules y storage.rules al proyecto usando la service
 * account del repo (API REST de Firebase Rules), sin depender del login de
 * firebase-tools.
 *
 * Uso:
 *   node scripts/desplegar-reglas.mjs                 # despliega ambas
 *   node scripts/desplegar-reglas.mjs --solo-firestore
 *   node scripts/desplegar-reglas.mjs --dry-run       # solo valida credenciales
 */

import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const KEY_PATH = resolve(ROOT, "service-account.json");
const RULES_PATH = resolve(ROOT, "firestore.rules");
const STORAGE_RULES_PATH = resolve(ROOT, "storage.rules");
const DRY_RUN = process.argv.includes("--dry-run");
const SOLO_FIRESTORE = process.argv.includes("--solo-firestore");

// El bucket sale del .env.local (es una variable pública NEXT_PUBLIC_); si no
// está, se cae al nombre por defecto del proyecto.
function bucketDeEnv(proyecto) {
  const envPath = resolve(ROOT, ".env.local");
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, "utf8").match(/^NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=(.+)$/m);
    if (m) return m[1].trim();
  }
  return `${proyecto}.firebasestorage.app`;
}

async function main() {
  if (!existsSync(KEY_PATH)) {
    console.error("\n❌ No se encontró service-account.json en la raíz del proyecto.\n");
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const key = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  const app = initializeApp({ credential: cert(key) });
  const token = (await app.options.credential.getAccessToken()).access_token;
  const proyecto = key.project_id;
  const base = `https://firebaserules.googleapis.com/v1/projects/${proyecto}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const bucket = bucketDeEnv(proyecto);
  const objetivos = [
    { archivo: "firestore.rules", ruta: RULES_PATH, release: "cloud.firestore", etiqueta: "Firestore" },
    ...(SOLO_FIRESTORE ? [] : [
      { archivo: "storage.rules", ruta: STORAGE_RULES_PATH, release: `firebase.storage/${bucket}`, etiqueta: "Storage" },
    ]),
  ].filter(o => existsSync(o.ruta));

  console.log(`Proyecto: ${proyecto}`);
  for (const o of objetivos) {
    console.log(`  · ${o.archivo} (${readFileSync(o.ruta, "utf8").length} chars) → ${o.release}`);
  }

  if (DRY_RUN) {
    console.log("(dry-run: no se desplegó nada)");
    return;
  }

  for (const o of objetivos) {
    const source = readFileSync(o.ruta, "utf8");

    // 1. Crear el ruleset con el contenido actual
    const rsRes = await fetch(`${base}/rulesets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: { files: [{ name: o.archivo, content: source }] },
      }),
    });
    if (!rsRes.ok) throw new Error(`Creando ruleset de ${o.etiqueta} (${rsRes.status}): ${await rsRes.text()}`);
    const ruleset = await rsRes.json();
    console.log(`✔ Ruleset creado: ${ruleset.name}`);

    // 2. Apuntar el release al nuevo ruleset
    const releaseName = `projects/${proyecto}/releases/${o.release}`;
    const relRes = await fetch(`${base}/releases/${o.release}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        release: { name: releaseName, rulesetName: ruleset.name },
      }),
    });
    if (!relRes.ok) throw new Error(`Actualizando release de ${o.etiqueta} (${relRes.status}): ${await relRes.text()}`);
    console.log(`✔ Reglas de ${o.etiqueta} desplegadas.`);
  }
  console.log("");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message ?? e);
  process.exit(1);
});
