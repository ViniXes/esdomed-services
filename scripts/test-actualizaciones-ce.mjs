// Prueba de las actualizaciones de Consulta Externa (reglas puras).
// Uso: node scripts/test-actualizaciones-ce.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const fuente = readFileSync(new URL("../src/lib/consultaExterna/actualizaciones.ts", import.meta.url), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const modulo = { exports: {} };
new Function("exports", "module", js)(modulo.exports, modulo);
const m = modulo.exports;

// Rango: cuenta ambos extremos; inválido = 0.
assert.equal(m.diasDelRango("2026-11-23", "2026-11-23"), 1);
assert.equal(m.diasDelRango("2026-11-01", "2026-11-30"), 30);
assert.equal(m.diasDelRango("2026-02-27", "2026-03-02"), 4);
assert.equal(m.diasDelRango("2026-11-24", "2026-11-23"), 0);
assert.equal(m.diasDelRango("2026-11-31", "2026-12-01"), 0);
assert.equal(m.diasDelRango("", "2026-12-01"), 0);

// Vista del equipo: por persona y por día.
const reg = (uid, nombre, fecha, tipos, hechoEn) => ({ fecha, hechoPor: uid, hechoPorNombre: nombre, expediente: `${uid}${hechoEn}`, pacienteNombre: "", tipos, hechoEn });
const r = m.resumenActualizacionesEquipo([
  reg("p", "Paola", "2026-11-23", ["identificacion", "responsable"], 300),
  reg("p", "Paola", "2026-11-23", ["responsable"], 200),
  reg("p", "Paola", "2026-11-22", ["identificacion"], 100),
  reg("k", "Kathya", "2026-11-23", ["identificacion"], 250),
  reg("k", "Kathya", "2026-11-22", ["responsable"], null),
  reg("a", "Admin", "2026-11-21", ["identificacion"], 50),
  reg("", "", "2026-11-23", ["identificacion"], 400),
]);
assert.deepEqual(r.personas.map((p) => [p.uid, p.total, p.identificacion, p.responsable, p.dias, p.ultimaEn]), [
  ["p", 3, 2, 2, 2, 300],
  ["k", 2, 1, 1, 2, 250],
  ["a", 1, 1, 0, 1, 50],
]);
assert.deepEqual(r.dias.map((d) => [d.fecha, d.total, d.porPersona]), [
  ["2026-11-23", 3, { p: 2, k: 1 }],
  ["2026-11-22", 2, { p: 1, k: 1 }],
  ["2026-11-21", 1, { a: 1 }],
]);
// Empate: orden alfabético.
assert.deepEqual(m.resumenActualizacionesEquipo([reg("z", "Zoila", "2026-11-23", ["responsable"], 1), reg("b", "Beatriz", "2026-11-23", ["responsable"], 2)]).personas.map((p) => p.uid), ["b", "z"]);
assert.deepEqual(m.resumenActualizacionesEquipo([]), { personas: [], dias: [] });

console.log("OK: actualizaciones de Consulta Externa");
