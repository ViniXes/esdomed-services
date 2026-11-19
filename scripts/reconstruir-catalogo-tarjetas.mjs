#!/usr/bin/env node
/**
 * Reconstruye el Catálogo de tarjetas de Consulta Externa
 * (consulta_externa_tarjetas/{f00…f19}) a partir de TODAS las citas cargadas
 * (consulta_externa_citas): cada paciente que aparece con DUI, con su DUI,
 * nombre, primera y última cita y especialidades.
 *
 * Sirve para llenarlo la primera vez con las agendas cargadas antes de que
 * existiera el catálogo, y para repararlo si algún día no coincide. Usa las
 * mismas funciones que la app (src/lib/consultaExterna/tarjetas.ts). Reemplaza
 * cada fragmento completo: el resultado es exactamente lo que dicen las citas.
 *
 * Costo: 1 lectura por cita + a lo más 20 escrituras.
 *
 * Requisito: service-account.json en la raíz.
 *
 * Uso:
 *   node scripts/reconstruir-catalogo-tarjetas.mjs --dry-run   # solo reporta
 *   node scripts/reconstruir-catalogo-tarjetas.mjs             # escribe
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import admin from "firebase-admin";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEY_PATH = resolve(ROOT, "service-account.json");
const DRY_RUN = process.argv.includes("--dry-run");
const COL_CITAS = "consulta_externa_citas";
const COL_TARJETAS = "consulta_externa_tarjetas";

// Las funciones puras de la app, transpiladas al vuelo (como en las pruebas).
const modulos = {};
function cargar(nombre) {
  if (modulos[nombre]) return modulos[nombre].exports;
  const fuente = readFileSync(resolve(ROOT, `src/lib/consultaExterna/${nombre}.ts`), "utf8");
  const js = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const modulo = { exports: {} };
  modulos[nombre] = modulo;
  new Function("exports", "module", "require", js)(modulo.exports, modulo, (r) => cargar(r.replace("./", "")));
  return modulo.exports;
}
const { FRAGMENTOS_TARJETAS, fragmentoTarjeta, fusionarTarjeta } = cargar("tarjetas");

if (!existsSync(KEY_PATH)) {
  console.error("\n❌ No se encontró service-account.json en la raíz del proyecto.\n");
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(KEY_PATH, "utf8"))) });
const db = admin.firestore();

const snap = await db.collection(COL_CITAS).select("fecha", "expediente", "dui", "paciente", "especialidadId").get();
const citas = snap.docs
  .map((d) => d.data())
  .filter((c) => c.dui && c.expediente)
  // En orden de fecha: así manda el nombre y el DUI de la cita más reciente.
  .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

const fragmentos = new Map();
for (const c of citas) {
  const f = fragmentoTarjeta(c.expediente);
  const mapa = fragmentos.get(f) ?? {};
  mapa[c.expediente] = fusionarTarjeta(mapa[c.expediente], c);
  fragmentos.set(f, mapa);
}

const existentes = await db.collection(COL_TARJETAS).listDocuments();
const ids = new Set([...fragmentos.keys(), ...existentes.map((r) => r.id)]);
const pacientes = [...fragmentos.values()].reduce((n, m) => n + Object.keys(m).length, 0);
const fechas = [...new Set(citas.map((c) => c.fecha))].sort();

console.log(`Citas leídas: ${snap.size} · con DUI: ${citas.length} · días: ${fechas[0] ?? "—"} a ${fechas.at(-1) ?? "—"}`);
console.log(`Pacientes con tarjeta: ${pacientes} en ${fragmentos.size} de ${FRAGMENTOS_TARJETAS} documentos`);
const mayor = Math.max(0, ...[...fragmentos.values()].map((m) => Buffer.byteLength(JSON.stringify(m))));
console.log(`Documento más grande: ~${Math.round(mayor / 1024)} KB (límite de Firestore: 1024 KB)`);

if (DRY_RUN) {
  console.log("\n--dry-run: no se escribió nada.");
  process.exit(0);
}

const lote = db.batch();
for (const id of [...ids].sort()) {
  lote.set(db.collection(COL_TARJETAS).doc(id), {
    pacientes: fragmentos.get(id) ?? {},
    actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    reconstruidoEn: admin.firestore.FieldValue.serverTimestamp(),
  });
}
await lote.commit();
console.log(`\n✓ Catálogo reconstruido: ${ids.size} documentos escritos.`);
