#!/usr/bin/env node
/**
 * Resetea las colecciones del módulo Lesiones intencionales / CONAPINA-FGR
 * (todas eran datos de prueba). Borra TODO el contenido de:
 *
 *   · notificaciones_conapina_fgr
 *   · revisiones_lesiones
 *   · solicitudes_notificacion_lesion
 *   · Storage: oficios_conapina/  (los oficios escaneados adjuntos)
 *
 * NO toca `pacientes` (el informe de adolescentes y el tamizaje solo LEEN de
 * ahí — esos ingresos son datos reales del censo).
 *
 * El borrado es solo de admin (las reglas no lo permiten desde la app).
 *
 * Uso:
 *   node scripts/resetear-conapina.mjs               # solo LISTA lo que hay
 *   node scripts/resetear-conapina.mjs --confirmar   # borra todo lo listado
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const KEY_PATH = resolve(ROOT, "service-account.json");
const CONFIRMAR = process.argv.includes("--confirmar");

const COLECCIONES = [
  "notificaciones_conapina_fgr",
  "revisiones_lesiones",
  "solicitudes_notificacion_lesion",
];
const PREFIJO_STORAGE = "oficios_conapina/";

const fmt = (ts) => {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" });
};

// El bucket sale del .env.local (variable pública NEXT_PUBLIC_); si no está,
// se cae al nombre por defecto del proyecto. Mismo criterio que
// desplegar-reglas.mjs.
function bucketDeEnv(proyecto) {
  const envPath = resolve(ROOT, ".env.local");
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, "utf8").match(/^NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=(.+)$/m);
    if (m) return m[1].trim();
  }
  return `${proyecto}.firebasestorage.app`;
}

// Resumen de una línea por documento, según la colección.
function resumen(coll, d) {
  if (coll === "notificaciones_conapina_fgr")
    return `exp ${d.pacienteExpediente || "—"} · ${d.pacienteNombre || "—"} · ${d.estado} · por ${d.medicoNombre || "—"} · ${fmt(d.creadoEn)}${d.oficios?.length ? ` · ⚠ ${d.oficios.length} oficio(s)` : ""}`;
  if (coll === "revisiones_lesiones")
    return `exp ${d.expediente || "—"} · ${d.resultado} · por ${d.revisadoPorNombre || "—"} · ${fmt(d.revisadoEn)}`;
  return `exp ${d.expediente || "—"} · ${d.pacienteNombre || "—"} · ${d.estado} · por ${d.creadoPorNombre || "—"} · ${fmt(d.creadoEn)}`;
}

async function main() {
  if (!existsSync(KEY_PATH)) {
    console.error(`\n❌ Clave de servicio no encontrada: ${KEY_PATH}\n`);
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getStorage } = await import("firebase-admin/storage");
  const key = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  initializeApp({ credential: cert(key) });
  const db = getFirestore();
  const bucket = getStorage().bucket(bucketDeEnv(key.project_id));

  // ── Inventario ──
  let totalDocs = 0;
  const snaps = {};
  for (const coll of COLECCIONES) {
    const snap = await db.collection(coll).get();
    snaps[coll] = snap;
    totalDocs += snap.size;
    console.log(`\n📋 ${coll} — ${snap.size} documento(s)`);
    for (const doc of snap.docs) console.log(`   ${doc.id}  ${resumen(coll, doc.data())}`);
  }

  let archivos = [];
  try {
    [archivos] = await bucket.getFiles({ prefix: PREFIJO_STORAGE });
  } catch (e) {
    console.log(`\n⚠ No se pudo listar Storage (${e.message}); se omite ese paso.`);
  }
  console.log(`\n📦 Storage ${PREFIJO_STORAGE} — ${archivos.length} archivo(s)`);
  for (const f of archivos) console.log(`   ${f.name}`);

  if (totalDocs === 0 && archivos.length === 0) {
    console.log("\n✨ Todo está vacío: no hay nada que resetear.\n");
    return;
  }

  if (!CONFIRMAR) {
    console.log(`\nℹ  Nada borrado (solo listado). Para borrar TODO lo anterior:\n   node scripts/resetear-conapina.mjs --confirmar\n`);
    return;
  }

  // ── Borrado ──
  console.log("\n🗑  Borrando...\n");
  for (const coll of COLECCIONES) {
    const docs = snaps[coll].docs;
    // Lotes de 500 (límite de WriteBatch); las pruebas son pocas, pero por si acaso.
    for (let i = 0; i < docs.length; i += 500) {
      const batch = db.batch();
      docs.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    console.log(`  ✅ ${coll}: ${docs.length} documento(s) borrados`);
  }
  for (const f of archivos) await f.delete();
  if (archivos.length) console.log(`  ✅ Storage: ${archivos.length} archivo(s) borrados`);

  console.log("\n✨ Módulo reseteado: las colecciones quedaron vacías. Todo lo que entre de ahora en adelante es real.\n");
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
