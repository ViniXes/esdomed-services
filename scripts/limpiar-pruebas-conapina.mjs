#!/usr/bin/env node
/**
 * Lista y borra notificaciones CONAPINA/FGR de prueba.
 *
 * El borrado es solo de admin (las reglas no lo permiten desde la app) y el
 * contenido clínico es inmutable a propósito, así que este script existe solo
 * para limpiar los datos que se generaron probando el módulo.
 *
 * Uso:
 *   node scripts/limpiar-pruebas-conapina.mjs                      # lista todo
 *   node scripts/limpiar-pruebas-conapina.mjs --exp 6576-26        # lista solo ese expediente
 *   node scripts/limpiar-pruebas-conapina.mjs --borrar id1,id2     # borra esos ids (pide confirmación de conteo)
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const getArg = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

const KEY_PATH = resolve(ROOT, "service-account.json");
const EXP = getArg("--exp");
const BORRAR = (getArg("--borrar") || "").split(",").map((s) => s.trim()).filter(Boolean);

const fmt = (ts) => {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" });
};

async function main() {
  if (!existsSync(KEY_PATH)) {
    console.error(`\n❌ Clave de servicio no encontrada: ${KEY_PATH}\n`);
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, "utf8"))) });
  const db = getFirestore();

  const snap = await db.collection("notificaciones_conapina_fgr").get();
  const docs = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((n) => !EXP || (n.pacienteExpediente || "").trim() === EXP);

  console.log(`\n📋 notificaciones_conapina_fgr — ${docs.length} documento(s)${EXP ? ` del expediente ${EXP}` : " en total"}\n`);
  for (const n of docs) {
    console.log(`  ${n.id}`);
    console.log(`     expediente : ${n.pacienteExpediente || "—"}  |  ${n.pacienteNombre || "—"}`);
    console.log(`     estado     : ${n.estado}`);
    console.log(`     tipo/hecho : ${n.tipoCaso} · ${fmt(n.fechaHecho)}`);
    console.log(`     médico     : ${n.medicoNombre || "—"} (${n.medicoId || "—"})`);
    console.log(`     creado     : ${fmt(n.creadoEn)}`);
    if (n.revisadoPorNombre) console.log(`     recibido   : ${n.revisadoPorNombre} · ${fmt(n.revisadoEn)}`);
    if (n.avisoRecibidoPor) console.log(`     avisado a  : ${n.avisoRecibidoPor} · ${fmt(n.avisoFecha)}`);
    if (n.motivoAnulacion) console.log(`     anulación  : ${n.motivoAnulacion}`);
    if (n.nota) console.log(`     nota       : ${String(n.nota).slice(0, 120)}`);
    if (n.oficios?.length) console.log(`     oficios    : ${n.oficios.length} archivo(s) ⚠ borrar también en Storage`);
    console.log("");
  }

  // Revisiones del tamizaje (apartado 2), por si quedaron pruebas ahí.
  const rev = await db.collection("revisiones_lesiones").get();
  const revs = rev.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`📋 revisiones_lesiones — ${revs.length} documento(s)`);
  for (const r of revs) {
    console.log(`  ${r.id}  ${r.expediente || "—"}  ${r.resultado}  por ${r.revisadoPorNombre || "—"} · ${fmt(r.revisadoEn)}`);
  }
  console.log("");

  if (!BORRAR.length) {
    console.log('ℹ  Nada borrado. Para borrar: --borrar <id1>,<id2>\n');
    return;
  }

  console.log(`🗑  Borrando ${BORRAR.length} notificación(es)...\n`);
  for (const id of BORRAR) {
    const ref = db.collection("notificaciones_conapina_fgr").doc(id);
    const d = await ref.get();
    if (!d.exists) { console.log(`  ⚠  ${id} no existe, se omite`); continue; }
    const data = d.data();
    if (data.oficios?.length) {
      console.log(`  ⚠  ${id} tiene ${data.oficios.length} oficio(s) en Storage — bórralos aparte`);
    }
    await ref.delete();
    console.log(`  ✅ ${id} borrado (exp ${data.pacienteExpediente}, estado ${data.estado})`);
  }
  console.log("");
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
