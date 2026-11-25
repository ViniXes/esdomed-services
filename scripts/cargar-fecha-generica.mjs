#!/usr/bin/env node
/**
 * PROVISIONAL. Carga el reporte del SIS de pacientes con fecha de nacimiento
 * genérica (10/10/2000) a consulta_externa_fecha_generica/lista (campo
 * `reporte`), para la pestaña "Fecha genérica" de Consulta Externa.
 *
 * El reporte trae dos hojas:
 *   - "Sin unificar (10-10-2000)": pendientes, con sus citas.
 *   - "Unificados o ya actualizados": los que el SIS ya muestra corregidos o
 *     unificados (entran ya resueltos, "según el reporte del SIS").
 *
 * Solo se guarda el nombre, las citas y el estado: sin teléfonos, madre ni
 * responsable (pedido del usuario: no hacen falta). Solo toca `reporte`: lo marcado en services (`marcas`) se
 * conserva. Volver a correrlo con un reporte nuevo agrega o actualiza
 * expedientes; no quita los que ya estaban.
 *
 * Requisito: service-account.json en la raíz.
 *
 * Uso:
 *   node scripts/cargar-fecha-generica.mjs "<reporte.xlsx>" --dry-run   # solo reporta
 *   node scripts/cargar-fecha-generica.mjs "<reporte.xlsx>"             # escribe
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEY_PATH = resolve(ROOT, "service-account.json");
const ARCHIVO = process.argv[2];
const DRY_RUN = process.argv.includes("--dry-run");

if (!ARCHIVO || !existsSync(ARCHIVO)) {
  console.error('Uso: node scripts/cargar-fecha-generica.mjs "<reporte.xlsx>" [--dry-run]');
  process.exit(1);
}

// Las funciones puras de la app, transpiladas al vuelo (como en las pruebas).
const modulos = {};
function cargar(nombre) {
  if (modulos[nombre]) return modulos[nombre].exports;
  const fuente = readFileSync(resolve(ROOT, `src/lib/consultaExterna/${nombre}.ts`), "utf8");
  const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const modulo = { exports: {} };
  modulos[nombre] = modulo;
  new Function("exports", "module", "require", js)(modulo.exports, modulo, (r) => cargar(r.replace("./", "")));
  return modulo.exports;
}
const fg = cargar("fechaGenerica");
const { resolverEspecialidad } = cargar("especialidades");

const libro = XLSX.readFile(ARCHIVO);
const hoja = (patron) => {
  const nombre = libro.SheetNames.find((n) => patron.test(n));
  return nombre ? XLSX.utils.sheet_to_json(libro.Sheets[nombre], { defval: "", raw: false }) : [];
};
const pendientes = hoja(/sin unificar/i);
const resueltos = hoja(/unificados|actualizados/i);
if (pendientes.length === 0 && resueltos.length === 0) {
  console.error('El libro no tiene las hojas "Sin unificar" ni "Unificados o ya actualizados".');
  process.exit(1);
}

const citas = (texto) => fg.leerCitasAgenda(texto).map((c) => {
  const e = resolverEspecialidad(c.especialidad);
  return { fecha: c.fecha, especialidad: e?.nombre ?? c.especialidad, especialidadId: e?.id ?? "" };
});
const nombre = (ap, no) => [fg.limpiarDatoSis(ap), fg.limpiarDatoSis(no)].filter(Boolean).join(", ");

const reporte = {};
const avisos = [];
for (const f of pendientes) {
  const exp = fg.normalizarExpedienteFG(f["Expediente"]);
  if (!exp) continue;
  if (String(f["Fecha de nacimiento"]).trim() !== fg.FECHA_GENERICA_TEXTO) avisos.push(`${exp}: fecha ${f["Fecha de nacimiento"]}`);
  reporte[exp] = {
    paciente: nombre(f["Apellidos"], f["Nombres"]),
    citasAgenda: citas(f["Citas en la agenda"]),
  };
}
for (const f of resueltos) {
  const exp = fg.normalizarExpedienteFG(f["Expediente"]);
  if (!exp) continue;
  const est = fg.estadoSegunSis(f["Estado en el SIS"]);
  if (!est) { avisos.push(`${exp}: estado desconocido "${f["Estado en el SIS"]}"`); continue; }
  reporte[exp] = {
    paciente: f["Nombre en la agenda"] ? String(f["Nombre en la agenda"]).trim() : nombre(f["Apellidos (SIS)"], f["Nombres (SIS)"]),
    citasAgenda: citas(f["Citas en la agenda"]),
    estadoSis: est.estado,
    ...(est.unificadoCon ? { unificadoCon: est.unificadoCon } : {}),
  };
}

const lista = Object.values(reporte);
const sinEspecialidad = new Set(lista.flatMap((p) => p.citasAgenda.filter((c) => !c.especialidadId).map((c) => c.especialidad)));
console.log(`\n${basename(ARCHIVO)}`);
console.log(`  Pendientes: ${pendientes.length} · ya corregidos o unificados según el SIS: ${lista.filter((p) => p.estadoSis).length}`);
console.log(`  Expedientes en total: ${lista.length} · citas: ${lista.reduce((s, p) => s + p.citasAgenda.length, 0)}`);
if (sinEspecialidad.size) console.log(`  Especialidades no reconocidas: ${[...sinEspecialidad].join(", ")}`);
if (avisos.length) console.log(`  Avisos (${avisos.length}):\n    ${avisos.slice(0, 20).join("\n    ")}`);
console.log(`  Tamaño aproximado: ${Math.round(JSON.stringify(reporte).length / 1024)} KB (máximo de un documento: 1024 KB)`);

if (DRY_RUN) {
  console.log("\n--dry-run: no se escribió nada.\n");
  process.exit(0);
}

if (!existsSync(KEY_PATH)) {
  console.error("\n❌ No se encontró service-account.json en la raíz del proyecto.\n");
  process.exit(1);
}
const { default: admin } = await import("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(KEY_PATH, "utf8"))) });
const db = admin.firestore();
await db.collection(fg.COLECCION_FECHA_GENERICA).doc(fg.DOC_FECHA_GENERICA).set(
  { reporte, reporteCargadoEn: admin.firestore.FieldValue.serverTimestamp(), fuenteReporte: basename(ARCHIVO) },
  { merge: true },
);
console.log(`\n✅ Cargados ${lista.length} expedientes en ${fg.COLECCION_FECHA_GENERICA}/${fg.DOC_FECHA_GENERICA}.\n`);
