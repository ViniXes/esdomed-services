#!/usr/bin/env node
/**
 * Normaliza `tramiteCerrado` en `notificaciones_fallecidos`.
 *
 * Motivo: el campo solo se escribía al CERRAR el trámite, así que los trámites
 * abiertos simplemente no lo tienen. Firestore no puede consultar "documentos
 * donde el campo no existe": `where("tramiteCerrado","==",false)` y
 * `where("tramiteCerrado","!=",true)` devuelven CERO en esos documentos, así que
 * la bandeja de ESDOMED no podía pedirle al servidor "solo los pendientes de
 * cierre" y tenía que bajarse la colección entera para filtrarla en el navegador.
 *
 * Este script escribe `tramiteCerrado: false` en los documentos que NO tienen el
 * campo (los que ya lo tienen, con cualquier valor, no se tocan). Es idempotente.
 * De paso arregla un problema latente en las reglas: `allow delete` evalúa
 * `resource.data.tramiteCerrado != true`, y acceder a un campo inexistente en
 * Firestore Rules hace fallar la condición — es decir, ESDOMED no podía borrar
 * una notificación duplicada mientras el campo faltara.
 *
 * A partir de ahora `medico/fallecidos` crea la notificación ya con
 * `tramiteCerrado: false`, así que esto es una corrección única del histórico.
 *
 * Requisito previo: service-account.json en la raíz del proyecto.
 *
 * Uso:
 *   node scripts/backfill-tramite-cerrado-fallecidos.mjs --dry-run   # solo reporta
 *   node scripts/backfill-tramite-cerrado-fallecidos.mjs             # aplica
 *   node scripts/backfill-tramite-cerrado-fallecidos.mjs --key ./otra-clave.json
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const getArg = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);

const KEY_PATH = getArg("--key") || resolve(ROOT, "service-account.json");
const DRY_RUN  = hasFlag("--dry-run");

const fmt = (v) => {
  const d = v?.toDate?.() ?? (v instanceof Date ? v : null);
  return d
    ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
    : "—";
};

async function main() {
  console.log("\n" + "=".repeat(62));
  console.log("  BACKFILL tramiteCerrado (defunciones) — ESDOMED Services");
  console.log("=".repeat(62) + "\n");
  if (DRY_RUN) console.log("  ⚠  SIMULACIÓN — no se escribirá nada\n");

  if (!existsSync(KEY_PATH)) {
    console.error(`\n❌ Clave de servicio no encontrada: ${KEY_PATH}\n`);
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, "utf8"))) });
  const db = getFirestore();

  const snap = await db.collection("notificaciones_fallecidos").get();
  console.log(`📊 ${snap.size} notificaciones en total.\n`);

  const pendientes = [];
  let conCampo = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    if (typeof d.tramiteCerrado === "boolean") { conCampo++; continue; }
    pendientes.push({
      id: doc.id,
      expediente: d.pacienteExpediente ?? "—",
      nombre: d.pacienteNombre ?? "—",
      defuncion: fmt(d.fechaDefuncion),
    });
  }

  console.log(`   ${conCampo} ya tienen el campo (no se tocan).`);
  console.log(`   ${pendientes.length} sin el campo → se marcarán como ABIERTOS (tramiteCerrado: false).\n`);

  if (pendientes.length === 0) {
    console.log("✅ Nada que hacer.\n");
    return;
  }

  for (const p of pendientes) {
    console.log(`   · Exp. ${String(p.expediente).padEnd(10)} ${String(p.nombre).slice(0, 34).padEnd(36)} defunción ${p.defuncion}`);
  }
  console.log("");

  if (DRY_RUN) {
    console.log("⚠  Simulación: no se escribió nada. Ejecuta sin --dry-run para aplicar.\n");
    return;
  }

  // Lotes de 400 (tope de Firestore: 500 operaciones por batch).
  let escritos = 0;
  for (let i = 0; i < pendientes.length; i += 400) {
    const batch = db.batch();
    for (const p of pendientes.slice(i, i + 400)) {
      batch.update(db.collection("notificaciones_fallecidos").doc(p.id), { tramiteCerrado: false });
    }
    await batch.commit();
    escritos += Math.min(400, pendientes.length - i);
  }

  console.log(`✅ ${escritos} notificaciones marcadas como abiertas.\n`);
}

main().catch((e) => { console.error("\n❌", e); process.exit(1); });
