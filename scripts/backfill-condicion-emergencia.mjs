#!/usr/bin/env node
/**
 * Backfill de `condicionEgreso` en `atenciones_emergencia` importadas ANTES de que
 * la importación empezara a guardar ese campo.
 *
 * Contexto: las vistas "Atendidos" y "Egresos de emergencia" ya no traen hasta 500
 * registros de golpe: primero CUENTAN por tipo en el servidor (getCountFromServer)
 * y el detalle se extrae solo del tipo elegido. Para egresos, el tipo (vivo /
 * fallecido) sale del texto crudo "Tipo de egreso", que Firestore no puede filtrar;
 * por eso cada doc guarda la condición normalizada. Un doc SIN el campo no aparece
 * en los conteos ni en el detalle de egresos.
 *
 * Misma lógica que `condicionAtencion` en src/lib/emergencia/helpers.ts:
 *   ingresoHospitalizacion == "si"  → "ingreso"
 *   tipoEgreso vacío                → "sin_dato"
 *   contiene "vivo"                 → "vivo"
 *   falleci|muert|defun|óbito       → "fallecido"
 *   otro texto                      → "otro"
 *
 * Idempotente: solo escribe los docs cuyo valor falta o no coincide. Correrlo
 * DESPUÉS de desplegar la versión nueva (las importaciones hechas con la versión
 * anterior no guardan el campo). Costo: 1 lectura por doc + 1 escritura por cambio.
 *
 * Requisito previo: service-account.json en la raíz (Firebase Console →
 * Configuración del proyecto → Cuentas de servicio → Generar nueva clave).
 *
 * Uso:
 *   node scripts/backfill-condicion-emergencia.mjs --dry-run   # solo reporta
 *   node scripts/backfill-condicion-emergencia.mjs             # aplica cambios
 *   node scripts/backfill-condicion-emergencia.mjs --key ./otra-clave.json
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
const PAGINA   = 1000;

function condicionEgreso(tipoEgreso) {
  const s = String(tipoEgreso ?? "").toLowerCase().trim();
  if (!s) return "sin_dato";
  if (s.includes("vivo")) return "vivo";
  if (/falleci|muert|defun|[óo]bito/.test(s)) return "fallecido";
  return "otro";
}

function condicionAtencion(ingreso, tipoEgreso) {
  return ingreso === "si" ? "ingreso" : condicionEgreso(tipoEgreso);
}

async function main() {
  console.log("\n" + "=".repeat(62));
  console.log("  BACKFILL condicionEgreso (emergencia) — ESDOMED Services");
  console.log("=".repeat(62) + "\n");
  if (DRY_RUN) console.log("  ⚠  SIMULACIÓN — no se escribirá nada\n");

  if (!existsSync(KEY_PATH)) {
    console.error(`\n❌ Clave de servicio no encontrada: ${KEY_PATH}`);
    console.error("   Firebase Console → Configuración → Cuentas de servicio →");
    console.error("   Generar nueva clave privada → guardar como service-account.json\n");
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore, FieldPath } = await import("firebase-admin/firestore");
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();
  const col = db.collection("atenciones_emergencia");

  // Recorre la colección por páginas (orden por id) leyendo solo los campos útiles.
  const cambios = [];
  const porCondicion = {};     // distribución final, para revisar el resultado
  const textosEgreso = {};     // valores crudos de "Tipo de egreso" (confirmar wording)
  let total = 0;
  let correctos = 0;
  let cursor = null;
  for (;;) {
    let q = col
      .select("ingresoHospitalizacion", "tipoEgreso", "condicionEgreso")
      .orderBy(FieldPath.documentId())
      .limit(PAGINA);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    for (const doc of snap.docs) {
      const d = doc.data();
      total++;
      const cond = condicionAtencion(d.ingresoHospitalizacion, d.tipoEgreso);
      porCondicion[cond] = (porCondicion[cond] ?? 0) + 1;
      const texto = String(d.tipoEgreso ?? "").trim() || "(vacío)";
      textosEgreso[texto] = (textosEgreso[texto] ?? 0) + 1;
      if (d.condicionEgreso === cond) { correctos++; continue; }
      cambios.push({ id: doc.id, antes: d.condicionEgreso ?? "—", despues: cond });
    }
    process.stdout.write(`\r   Leídos ${total} documentos...`);
    if (snap.size < PAGINA) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  console.log("\n");

  console.log("📊 Valores de \"Tipo de egreso\" en el reporte:");
  for (const [t, n] of Object.entries(textosEgreso).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(7)}  ${t}`);
  }
  console.log("\n📊 Condición normalizada:");
  for (const [c, n] of Object.entries(porCondicion).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(7)}  ${c}`);
  }
  console.log(`\n   ${correctos} ya tienen el valor correcto (omitidos)`);
  console.log(`   ${cambios.length} por escribir\n`);

  if (cambios.length === 0) {
    console.log("✅ No hay nada que rellenar.\n");
    return;
  }

  const muestra = cambios.slice(0, 15);
  console.log("   Id                                   Antes      → Después");
  console.log("   " + "-".repeat(62));
  for (const c of muestra) {
    console.log(`   ${c.id.padEnd(36)} ${String(c.antes).padEnd(10)} → ${c.despues}`);
  }
  if (cambios.length > muestra.length) console.log(`   ... y ${cambios.length - muestra.length} más`);
  console.log("");

  if (DRY_RUN) {
    console.log("ℹ  Simulación completada. Ejecuta sin --dry-run para aplicar.\n");
    return;
  }

  await confirmar(`¿Escribir condicionEgreso en ${cambios.length} atenciones? Escribe "si" para confirmar: `);

  let batch = db.batch();
  let enLote = 0;
  let escritos = 0;
  for (const c of cambios) {
    batch.update(col.doc(c.id), { condicionEgreso: c.despues });
    enLote++;
    if (enLote === 400) {
      await batch.commit(); escritos += enLote; batch = db.batch(); enLote = 0;
      process.stdout.write(`\r   Escritos ${escritos}/${cambios.length}...`);
    }
  }
  if (enLote > 0) { await batch.commit(); escritos += enLote; }

  console.log(`\n\n🎉 Backfill completo. ${escritos} atenciones actualizadas.\n`);
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
