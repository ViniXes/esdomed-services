#!/usr/bin/env node
/**
 * Vacía las colecciones operativas de Firestore para re-migrar desde cero.
 * CONSERVA la colección `usuarios` (auth/roles) para no romper el login.
 *
 * Requisito previo: descarga la clave de servicio desde Firebase Console
 *   → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada
 *   → Guárdala como service-account.json en la raíz del proyecto
 *
 * Uso:
 *   node scripts/limpiar-colecciones.mjs --dry-run     # solo cuenta, no borra
 *   node scripts/limpiar-colecciones.mjs               # borra (pide confirmación)
 *   node scripts/limpiar-colecciones.mjs --key ./otra-clave.json
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);

const KEY_PATH = getArg("--key") || resolve(ROOT, "service-account.json");
const DRY_RUN  = hasFlag("--dry-run");

// Colecciones operativas a vaciar.
// SE CONSERVAN (no se tocan nunca):
//   - `usuarios`         → cuentas y roles (auth)
//   - `configuracion`    → seed: catálogo de servicios/camas
//   - `planes_trabajo`   → "Mi área" de ESDOMED (horarios mensuales)
const COLECCIONES = [
  "personas",
  "pacientes",
  "traslados",
  "notificaciones_fallecidos",
  "notificaciones_altas",
  "notificaciones_prealta",
  "solicitudes_impresion",
  "control_ingresos",
  "incapacidades",
  "anexo5",
  "busquedas_telefono",
  "tarjetas_visita",
  "visitas",
  "recepciones",
  "empleados",
  "licencias",
];

async function main() {
  console.log("\n" + "=".repeat(62));
  console.log("  LIMPIEZA DE COLECCIONES — ESDOMED Services");
  console.log("=".repeat(62));
  console.log("  Se CONSERVAN 'usuarios', 'configuracion' y 'planes_trabajo'.\n");
  if (DRY_RUN) console.log("  ⚠  SIMULACIÓN — no se borrará nada\n");

  if (!existsSync(KEY_PATH)) {
    console.error(`\n❌ Clave de servicio no encontrada: ${KEY_PATH}`);
    console.error("   Firebase Console → Configuración → Cuentas de servicio →");
    console.error("   Generar nueva clave privada → guardar como service-account.json\n");
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  // ── Conteo previo ───────────────────────────────────────────────────────
  console.log("📊 Documentos por colección:\n");
  let total = 0;
  const conteos = {};
  for (const nombre of COLECCIONES) {
    const snap = await db.collection(nombre).count().get();
    const n = snap.data().count;
    conteos[nombre] = n;
    total += n;
    console.log(`   ${String(n).padStart(6)}  ${nombre}`);
  }
  console.log(`   ${"-".repeat(6)}`);
  console.log(`   ${String(total).padStart(6)}  TOTAL\n`);

  if (DRY_RUN) {
    console.log("ℹ  Simulación completada. Ejecuta sin --dry-run para borrar.\n");
    return;
  }
  if (total === 0) {
    console.log("No hay nada que borrar.\n");
    return;
  }

  await confirmar(`¿BORRAR ${total} documentos de ${COLECCIONES.length} colecciones? Escribe "si" para confirmar: `);

  console.log("");
  for (const nombre of COLECCIONES) {
    if (conteos[nombre] === 0) continue;
    process.stdout.write(`  🗑  Borrando ${nombre}...`);
    await db.recursiveDelete(db.collection(nombre));
    process.stdout.write(`\r  ✅ ${nombre} vaciada (${conteos[nombre]} docs)        \n`);
  }

  console.log("\n🎉 Limpieza completa. ('usuarios', 'configuracion' y 'planes_trabajo' intactas).\n");
}

function confirmar(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      if (answer.toLowerCase() === "si") resolve();
      else { console.log("\nCancelado.\n"); process.exit(0); }
    });
  });
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
