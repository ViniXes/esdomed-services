#!/usr/bin/env node
/**
 * Corrige `fechaHasta` en las incapacidades de EMERGENCIA ya guardadas.
 *
 * Motivo: al crear una incapacidad de emergencia, la app calculaba
 * fechaHasta = inicio + días, pero en emergencia NO hay hospitalización y el
 * día de la consulta cuenta como PRIMER día de incapacidad, así que lo
 * correcto es fechaHasta = inicio + (días − 1). Ej.: inicio 25/08 con 6 días
 * → hasta 30/08 (25,26,27,28,29,30), no 31/08.
 *
 * La página de edición ya usaba la fórmula correcta, por lo que solo están
 * afectados los registros creados y nunca re-guardados desde ahí. Este script
 * recalcula fechaHasta = fechaDesde + (diasIncapacidad − 1) para los docs con
 * origen == "emergencia" y corrige solo los que no coinciden. Es idempotente,
 * y también corrige registros que ESDOMED ajustó por delta (el delta arrastró
 * el mismo día de más).
 *
 * Las incapacidades de hospitalización NO se tocan: ahí la convención
 * hasta = alta + días adicionales es correcta.
 *
 * IMPORTANTE: ejecútalo en la zona horaria del hospital (El Salvador, UTC-6).
 *
 * Requisito previo: service-account.json en la raíz del proyecto.
 *
 * Uso:
 *   node scripts/corregir-fecha-hasta-emergencia.mjs --dry-run   # solo reporta
 *   node scripts/corregir-fecha-hasta-emergencia.mjs             # aplica cambios
 *   node scripts/corregir-fecha-hasta-emergencia.mjs --key ./otra-clave.json
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

/** Fecha a medianoche local (sin hora). */
function aMedianocheLocal(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Convierte un Timestamp de Firestore (o Date) a Date. */
function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

const fmt = (d) =>
  d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : "—";

async function main() {
  console.log("\n" + "=".repeat(62));
  console.log("  CORRECCIÓN fechaHasta EMERGENCIA — ESDOMED Services");
  console.log("=".repeat(62) + "\n");
  if (DRY_RUN) console.log("  ⚠  SIMULACIÓN — no se escribirá nada\n");

  if (!existsSync(KEY_PATH)) {
    console.error(`\n❌ Clave de servicio no encontrada: ${KEY_PATH}`);
    console.error("   Firebase Console → Configuración → Cuentas de servicio →");
    console.error("   Generar nueva clave privada → guardar como service-account.json\n");
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore, Timestamp } = await import("firebase-admin/firestore");
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const snap = await db.collection("incapacidades").where("origen", "==", "emergencia").get();
  console.log(`📊 ${snap.size} incapacidades de emergencia.\n`);

  const cambios = [];
  let sinDatos = 0;
  let iguales = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const fechaDesde = toDate(d.fechaDesde);
    const fechaHasta = toDate(d.fechaHasta);
    const dias = typeof d.diasIncapacidad === "number" ? d.diasIncapacidad : null;

    if (!fechaDesde || !fechaHasta || !dias || dias < 1) { sinDatos++; continue; }

    // Correcto: hasta = desde + (días − 1), a medianoche local.
    const correcta = aMedianocheLocal(fechaDesde);
    correcta.setDate(correcta.getDate() + dias - 1);

    if (aMedianocheLocal(fechaHasta).getTime() === correcta.getTime()) { iguales++; continue; }

    cambios.push({
      id: doc.id,
      expediente: d.pacienteExpediente ?? "—",
      paciente: d.pacienteNombre ?? "—",
      dias,
      desde: fmt(fechaDesde),
      antes: fmt(fechaHasta),
      despues: fmt(correcta),
      nuevaFecha: correcta,
    });
  }

  console.log(`   ${iguales} ya correctas`);
  console.log(`   ${sinDatos} sin datos suficientes (omitidas)`);
  console.log(`   ${cambios.length} por corregir\n`);

  if (cambios.length === 0) {
    console.log("✅ No hay nada que corregir.\n");
    return;
  }

  console.log("   Exp.        Paciente                     Días  Desde        Hasta antes → después");
  console.log("   " + "-".repeat(88));
  for (const c of cambios) {
    console.log(
      `   ${String(c.expediente).padEnd(11)} ${String(c.paciente).slice(0, 26).padEnd(27)} ` +
      `${String(c.dias).padStart(3)}   ${c.desde}   ${c.antes} → ${c.despues}`
    );
  }
  console.log("");

  if (DRY_RUN) {
    console.log("ℹ  Simulación completada. Ejecuta sin --dry-run para aplicar.\n");
    return;
  }

  await confirmar(`¿Actualizar ${cambios.length} registros? Escribe "si" para confirmar: `);

  const { FieldValue } = await import("firebase-admin/firestore");
  let batch = db.batch();
  let enLote = 0;
  let escritos = 0;
  for (const c of cambios) {
    batch.update(db.collection("incapacidades").doc(c.id), {
      fechaHasta: Timestamp.fromDate(c.nuevaFecha),
      fechaHastaCorregidaEn: FieldValue.serverTimestamp(),
    });
    enLote++;
    if (enLote === 400) { await batch.commit(); escritos += enLote; batch = db.batch(); enLote = 0; }
  }
  if (enLote > 0) { await batch.commit(); escritos += enLote; }

  console.log(`\n🎉 Corrección completa. ${escritos} registros actualizados.\n`);
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
