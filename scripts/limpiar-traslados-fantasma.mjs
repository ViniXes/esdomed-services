#!/usr/bin/env node
/**
 * Limpia los "traslados fantasma" que la importación del reporte del SIS grabó en
 * `pacientes/{id}.movimientos` ANTES del fix de comparación canónica.
 *
 * Contexto: la vista de importar comparaba el servicio guardado con el del reporte
 * por igualdad literal (`a !== b`). Como el SIS escribe el mismo servicio con otra
 * caja ("Unidad de Cuidados Intensivos General 1 Adultos" vs "Unidad de cuidados
 * intensivos General 1 Adultos"), dobles espacios o tildes distintas, TODO un
 * servicio parecía "moverse" en cada importación y se escribía un movimiento con
 * servicioOrigen ≡ servicioDestino. Ahora se compara por clave canónica
 * (src/lib/servicios.ts → mismoServicio / mismaCama) y esto ya no vuelve a pasar.
 *
 * Este script borra SOLO los movimientos en los que el origen y el destino son el
 * mismo lugar (mismo servicio Y misma cama, ignorando caja/tildes/espacios/ceros).
 * Un cambio real de cama dentro del mismo servicio NO se toca. De paso reescribe
 * `servicioActual` con el nombre exacto del catálogo cuando solo difiere la forma.
 *
 * Requisito previo: service-account.json en la raíz (Firebase Console →
 * Configuración del proyecto → Cuentas de servicio → Generar nueva clave).
 *
 * Uso:
 *   node scripts/limpiar-traslados-fantasma.mjs --dry-run   # solo reporta
 *   node scripts/limpiar-traslados-fantasma.mjs             # aplica cambios
 *   node scripts/limpiar-traslados-fantasma.mjs --key ./otra-clave.json
 *   node scripts/limpiar-traslados-fantasma.mjs --todos     # incluye egresados
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const getArg = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);

const KEY_PATH = getArg("--key") || resolve(ROOT, "service-account.json");
const DRY_RUN  = hasFlag("--dry-run");
const TODOS    = hasFlag("--todos");

// ── Espejo de src/lib/servicios.ts (claveServicio / claveCama) ────────────────
// Se duplica a propósito: los scripts corren en Node puro, sin el bundler de Next.
// Si cambias la normalización allá, cámbiala aquí.
const ROMANOS = { i:"1", ii:"2", iii:"3", iv:"4", v:"5", vi:"6", vii:"7", viii:"8", ix:"9", x:"10" };

const claveServicio = (v) =>
  String(v ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((t) => ROMANOS[t] ?? t)
    .join(" ");

const claveCama = (v) =>
  String(v ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/(^|[^0-9])0+(\d)/g, "$1$2");

const mismoServicio = (a, b) => claveServicio(a) === claveServicio(b);
const mismaCama     = (a, b) => claveCama(a) === claveCama(b);

/** Un movimiento es fantasma si origen y destino son el mismo lugar. */
const esFantasma = (mov) =>
  mismoServicio(mov?.servicioOrigen, mov?.servicioDestino) &&
  mismaCama(mov?.camaOrigen, mov?.camaDestino);

const toDate = (v) =>
  !v ? null : typeof v.toDate === "function" ? v.toDate() : v instanceof Date ? v : null;

const fmt = (d) =>
  d ? `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}` : "—";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("  LIMPIEZA de traslados fantasma — ESDOMED Services");
  console.log("=".repeat(70) + "\n");
  if (DRY_RUN) console.log("  ⚠  SIMULACIÓN — no se escribirá nada\n");

  if (!existsSync(KEY_PATH)) {
    console.error(`\n❌ Clave de servicio no encontrada: ${KEY_PATH}`);
    console.error("   Firebase Console → Configuración → Cuentas de servicio →");
    console.error("   Generar nueva clave privada → guardar como service-account.json\n");
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, "utf8"))) });
  const db = getFirestore();

  const ref = db.collection("pacientes");
  const snap = TODOS ? await ref.get() : await ref.where("estado", "==", "activo").get();
  console.log(`📊 ${snap.size} pacientes revisados (${TODOS ? "todos los estados" : "solo activos"}).\n`);

  // Catálogo vivo de servicios, para reescribir servicioActual con el nombre exacto.
  const cfg = await db.collection("configuracion").doc("servicios").get();
  const catalogo = (cfg.exists ? cfg.data()?.lista ?? [] : []).map((s) => s.nombre).filter(Boolean);
  console.log(`📖 Catálogo vivo: ${catalogo.length} servicios.\n`);
  const canonico = (nombre) => catalogo.find((s) => mismoServicio(s, nombre)) ?? null;

  const cambios = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const movs = Array.isArray(d.movimientos) ? d.movimientos : [];
    const limpios = movs.filter((m) => !esFantasma(m));
    const borrados = movs.length - limpios.length;

    const canon = canonico(d.servicioActual);
    const renombra = !!canon && canon !== d.servicioActual;

    if (borrados === 0 && !renombra) continue;

    cambios.push({
      id: doc.id,
      expediente: d.expediente ?? "—",
      paciente: [d.apellidos, d.nombres].filter(Boolean).join(", ") || "—",
      servicio: d.servicioActual ?? "—",
      servicioCanonico: canon,
      renombra,
      borrados,
      limpios,
      ejemplo: movs.find(esFantasma),
    });
  }

  const totalMovs = cambios.reduce((a, c) => a + c.borrados, 0);
  const totalRen  = cambios.filter((c) => c.renombra).length;
  console.log(`   ${totalMovs} movimiento(s) fantasma en ${cambios.filter(c=>c.borrados>0).length} paciente(s)`);
  console.log(`   ${totalRen} paciente(s) con el servicio escrito fuera del catálogo\n`);

  if (cambios.length === 0) { console.log("✅ Nada que limpiar.\n"); return; }

  console.log("   Exp.        Paciente                        Fantasmas  Servicio");
  console.log("   " + "-".repeat(88));
  for (const c of cambios) {
    const svc = c.renombra ? `${c.servicio}  →  ${c.servicioCanonico}` : c.servicio;
    console.log(
      `   ${String(c.expediente).padEnd(11)} ${String(c.paciente).slice(0,30).padEnd(31)} ` +
      `${String(c.borrados).padStart(6)}     ${svc.slice(0, 70)}`
    );
  }

  const muestra = cambios.find((c) => c.ejemplo)?.ejemplo;
  if (muestra) {
    console.log("\n   Ejemplo de movimiento que se borra:");
    console.log(`     ${fmt(toDate(muestra.fecha))}  "${muestra.servicioOrigen}" (${muestra.camaOrigen ?? "—"})`);
    console.log(`             →  "${muestra.servicioDestino}" (${muestra.camaDestino ?? "—"})`);
    console.log(`     registrado por: ${muestra.registradoPorNombre ?? "—"}`);
  }
  console.log("");

  if (DRY_RUN) { console.log("ℹ  Simulación completada. Ejecuta sin --dry-run para aplicar.\n"); return; }

  await confirmar(`¿Borrar ${totalMovs} movimiento(s) fantasma en ${cambios.length} paciente(s)? Escribe "si": `);

  const { FieldValue } = await import("firebase-admin/firestore");
  let batch = db.batch(), enLote = 0, escritos = 0;
  for (const c of cambios) {
    const payload = { trasladosFantasmaLimpiadosEn: FieldValue.serverTimestamp() };
    if (c.borrados > 0) payload.movimientos = c.limpios;
    if (c.renombra) payload.servicioActual = c.servicioCanonico;
    batch.update(ref.doc(c.id), payload);
    if (++enLote === 400) { await batch.commit(); escritos += enLote; batch = db.batch(); enLote = 0; }
  }
  if (enLote > 0) { await batch.commit(); escritos += enLote; }

  console.log(`\n🎉 Listo. ${escritos} paciente(s) actualizado(s); ${totalMovs} movimiento(s) fantasma eliminados.\n`);
}

function confirmar(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (a) => {
      rl.close();
      if (a.toLowerCase() === "si") resolve();
      else { console.log("\nCancelado.\n"); process.exit(0); }
    });
  });
}

main().catch((err) => { console.error("\n❌ Error:", err.message || err); process.exit(1); });
