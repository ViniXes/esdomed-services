#!/usr/bin/env node
/**
 * Backfill de `fechaEgreso` en pacientes dados de alta EFECTIVA por el módulo de
 * verificación de altas ANTES del fix que empezó a guardar `fechaEgreso`.
 *
 * Contexto: al procesar un alta efectiva, `desactivarPacienteDelAlta`
 * (src/app/api/esdomed/altas/[id]/estado/route.ts) marca el paciente con
 * `estado` de egreso + `egresoPendiente: true` + `egresadoAutoEn`. Antes NO
 * escribía `fechaEgreso`. Como la pestaña "Alta vivo" de dashboard/pacientes
 * ordena por `fechaEgreso` (y Firestore excluye del resultado los docs sin ese
 * campo), esos pacientes quedaban invisibles ahí y solo se ubicaban por "Todos"
 * (la pestaña más cara). Este script copia `egresadoAutoEn` → `fechaEgreso`
 * (preliminar; ESDOMED la ajusta al completar el egreso), igual que ya hace el
 * fix en vivo. Así pueden volver a ocultar "Todos".
 *
 * Solo toca pacientes con `egresoPendiente == true` y SIN `fechaEgreso`. Es
 * idempotente: una segunda corrida no encuentra nada que cambiar. NO toca
 * fallecidos (esos ya guardan `fechaEgreso` desde el módulo de defunciones).
 *
 * Requisito previo: descarga la clave de servicio desde Firebase Console
 *   → Configuración del proyecto → Cuentas de servicio → Generar nueva clave
 *   → guárdala como service-account.json en la raíz del proyecto
 *
 * Uso:
 *   node scripts/backfill-fecha-egreso-altas.mjs --dry-run   # solo reporta
 *   node scripts/backfill-fecha-egreso-altas.mjs             # aplica cambios
 *   node scripts/backfill-fecha-egreso-altas.mjs --key ./otra-clave.json
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

/** Convierte un Timestamp de Firestore (o Date) a Date. */
function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

const fmt = (d) =>
  d
    ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ` +
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "—";

async function main() {
  console.log("\n" + "=".repeat(62));
  console.log("  BACKFILL fechaEgreso (altas efectivas) — ESDOMED Services");
  console.log("=".repeat(62) + "\n");
  if (DRY_RUN) console.log("  ⚠  SIMULACIÓN — no se escribirá nada\n");

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

  // Solo los pacientes que el módulo de altas desactivó sin completar el egreso.
  const snap = await db.collection("pacientes").where("egresoPendiente", "==", true).get();
  console.log(`📊 ${snap.size} pacientes con egresoPendiente == true.\n`);

  const cambios = [];
  let yaTienen = 0;   // ya tienen fechaEgreso → nada que hacer (idempotencia)
  let sinFuente = 0;  // no hay egresadoAutoEn ni actualizadoEn de dónde copiar

  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.fechaEgreso) { yaTienen++; continue; }

    // Fuente de la fecha preliminar: el momento en que se marcó el alta efectiva.
    const fuente = toDate(d.egresadoAutoEn) ?? toDate(d.actualizadoEn);
    if (!fuente) { sinFuente++; continue; }

    cambios.push({
      id: doc.id,
      expediente: d.expediente ?? "—",
      paciente: [d.apellidos, d.nombres].filter(Boolean).join(", ") || "—",
      estado: d.estado ?? "—",
      fecha: fuente,
    });
  }

  console.log(`   ${yaTienen} ya tienen fechaEgreso (omitidos)`);
  console.log(`   ${sinFuente} sin fecha de origen (omitidos)`);
  console.log(`   ${cambios.length} por completar\n`);

  if (cambios.length === 0) {
    console.log("✅ No hay nada que rellenar.\n");
    return;
  }

  console.log("   Exp.        Paciente                        Estado           fechaEgreso ←");
  console.log("   " + "-".repeat(84));
  for (const c of cambios) {
    console.log(
      `   ${String(c.expediente).padEnd(11)} ${String(c.paciente).slice(0, 30).padEnd(31)} ` +
      `${String(c.estado).padEnd(16)} ${fmt(c.fecha)}`
    );
  }
  console.log("");

  if (DRY_RUN) {
    console.log("ℹ  Simulación completada. Ejecuta sin --dry-run para aplicar.\n");
    return;
  }

  await confirmar(`¿Rellenar fechaEgreso en ${cambios.length} pacientes? Escribe "si" para confirmar: `);

  const { Timestamp, FieldValue } = await import("firebase-admin/firestore");
  let batch = db.batch();
  let enLote = 0;
  let escritos = 0;
  for (const c of cambios) {
    batch.update(db.collection("pacientes").doc(c.id), {
      fechaEgreso: Timestamp.fromDate(c.fecha),
      fechaEgresoBackfillEn: FieldValue.serverTimestamp(), // marca de auditoría del backfill
    });
    enLote++;
    if (enLote === 400) { await batch.commit(); escritos += enLote; batch = db.batch(); enLote = 0; }
  }
  if (enLote > 0) { await batch.commit(); escritos += enLote; }

  console.log(`\n🎉 Backfill completo. ${escritos} pacientes actualizados.\n`);
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
