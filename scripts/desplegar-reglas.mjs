#!/usr/bin/env node
/**
 * Despliega firestore.rules al proyecto usando la service account del repo
 * (API REST de Firebase Rules), sin depender del login de firebase-tools.
 *
 * Uso:
 *   node scripts/desplegar-reglas.mjs            # despliega firestore.rules
 *   node scripts/desplegar-reglas.mjs --dry-run  # solo valida credenciales y muestra qué haría
 */

import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const KEY_PATH = resolve(ROOT, "service-account.json");
const RULES_PATH = resolve(ROOT, "firestore.rules");
const DRY_RUN = process.argv.includes("--dry-run");

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

  const source = readFileSync(RULES_PATH, "utf8");
  console.log(`Proyecto: ${proyecto} · reglas: firestore.rules (${source.length} chars)`);

  if (DRY_RUN) {
    console.log("(dry-run: no se desplegó nada)");
    return;
  }

  // 1. Crear el ruleset con el contenido actual
  const rsRes = await fetch(`${base}/rulesets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      source: { files: [{ name: "firestore.rules", content: source }] },
    }),
  });
  if (!rsRes.ok) throw new Error(`Creando ruleset (${rsRes.status}): ${await rsRes.text()}`);
  const ruleset = await rsRes.json();
  console.log(`✔ Ruleset creado: ${ruleset.name}`);

  // 2. Apuntar el release de Firestore al nuevo ruleset
  const releaseName = `projects/${proyecto}/releases/cloud.firestore`;
  const relRes = await fetch(`${base}/releases/cloud.firestore`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      release: { name: releaseName, rulesetName: ruleset.name },
    }),
  });
  if (!relRes.ok) throw new Error(`Actualizando release (${relRes.status}): ${await relRes.text()}`);
  console.log("✔ Reglas de Firestore desplegadas.\n");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message ?? e);
  process.exit(1);
});
