#!/usr/bin/env node
/**
 * Recalcula `diasIncapacidad` en los registros históricos de la colección
 * `incapacidades`.
 *
 * Motivo: `fechaIngreso` (= `fechaDesde`) se guardaba CON la hora de ingreso.
 * El cálculo anterior restaba esa hora contra una `fechaAlta`/`fechaHasta` a
 * medianoche y, por el redondeo, perdía un día en ingresos de tarde/noche
 * (el día de alta no se contaba). Aquí recalculamos el total de días de forma
 * inclusiva comparando SOLO los días calendario (medianoche local), igual que
 * ahora hace `calcularDiasHospitalizacion` en la app.
 *
 * El total correcto = días inclusivos entre `fechaDesde` y `fechaHasta`
 * (ambos extremos cuentan). `fechaHasta` = alta + días adicionales y NO cambia,
 * así que solo se actualiza `diasIncapacidad`. La operación es idempotente.
 *
 * IMPORTANTE: ejecútalo en la misma zona horaria que usa el hospital
 * (El Salvador, UTC-6), tal como los demás scripts, para que la normalización
 * de día calendario coincida con la de la app.
 *
 * Requisito previo: descarga la clave de servicio desde Firebase Console
 *   → Configuración del proyecto → Cuentas de servicio → Generar nueva clave
 *   → guárdala como service-account.json en la raíz del proyecto
 *
 * Uso:
 *   node scripts/recalcular-dias-incapacidad.mjs --dry-run   # solo reporta
 *   node scripts/recalcular-dias-incapacidad.mjs             # aplica cambios
 *   node scripts/recalcular-dias-incapacidad.mjs --key ./otra-clave.json
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

const DIA_MS = 1000 * 60 * 60 * 24;

/** Fecha a medianoche local (sin hora). */
function aMedianocheLocal(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Días inclusivos entre dos fechas comparando solo el día calendario. */
function diasInclusivos(desde, hasta) {
  const a = aMedianocheLocal(desde);
  const b = aMedianocheLocal(hasta);
  return Math.round((b.getTime() - a.getTime()) / DIA_MS) + 1;
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
  console.log("  RECÁLCULO DE DÍAS DE INCAPACIDAD — ESDOMED Services");
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

  const snap = await db.collection("incapacidades").get();
  console.log(`📊 ${snap.size} registros en 'incapacidades'.\n`);

  const cambios = [];
  let sinDatos = 0;
  let iguales = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const fechaDesde = toDate(d.fechaDesde);
    const fechaHasta = toDate(d.fechaHasta);
    const actual = typeof d.diasIncapacidad === "number" ? d.diasIncapacidad : null;

    if (!fechaDesde || !fechaHasta) { sinDatos++; continue; }

    const correcto = diasInclusivos(fechaDesde, fechaHasta);
    if (!Number.isFinite(correcto) || correcto < 1) { sinDatos++; continue; }

    if (actual === correcto) { iguales++; continue; }

    cambios.push({
      id: doc.id,
      expediente: d.pacienteExpediente ?? "—",
      paciente: d.pacienteNombre ?? "—",
      desde: fmt(fechaDesde),
      hasta: fmt(fechaHasta),
      antes: actual,
      despues: correcto,
    });
  }

  console.log(`   ${iguales} ya correctos`);
  console.log(`   ${sinDatos} sin fechas suficientes (omitidos)`);
  console.log(`   ${cambios.length} por corregir\n`);

  if (cambios.length === 0) {
    console.log("✅ No hay nada que recalcular.\n");
    return;
  }

  console.log("   Exp.        Paciente                     Desde→Hasta            Antes → Después");
  console.log("   " + "-".repeat(86));
  for (const c of cambios) {
    console.log(
      `   ${String(c.expediente).padEnd(11)} ${String(c.paciente).slice(0, 26).padEnd(27)} ` +
      `${c.desde}→${c.hasta}`.padEnd(23) +
      ` ${String(c.antes).padStart(4)} → ${c.despues}`
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
      diasIncapacidad: c.despues,
      diasRecalculadoEn: FieldValue.serverTimestamp(),
    });
    enLote++;
    if (enLote === 400) { await batch.commit(); escritos += enLote; batch = db.batch(); enLote = 0; }
  }
  if (enLote > 0) { await batch.commit(); escritos += enLote; }

  console.log(`\n🎉 Recálculo completo. ${escritos} registros actualizados.\n`);
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
