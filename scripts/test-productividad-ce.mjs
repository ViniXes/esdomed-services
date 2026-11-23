// Prueba de la productividad de Consulta Externa (reglas puras).
// Uso: node scripts/test-productividad-ce.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const fuente = readFileSync(new URL("../src/lib/consultaExterna/productividad.ts", import.meta.url), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const modulo = { exports: {} };
new Function("exports", "module", js)(modulo.exports, modulo);
const m = modulo.exports;

const exp = (uid, nombre, sis, fecha, nueva = false) => ({ creadoPorUid: uid, creadoPorNombre: nombre, creadoPorSis: sis, fechaCreacion: fecha, personaNueva: nueva });
const act = (uid, nombre, fecha, tipos) => ({ hechoPor: uid, hechoPorNombre: nombre, fecha, tipos });

const p = m.productividadPorPersona(
  [
    exp("k", "Kathya Andrea de Orellana Martínez", "KATHYA ANDREA DE ORELLANA MARTINEZ", "2026-11-16", true),
    exp("k", "Kathya Andrea de Orellana Martínez", "KATHYA ANDREA DE ORELLANA MARTINEZ", "2026-11-17"),
    exp("p", "Paola Alejandra Coreas Flores", "PAOLA ALEJANDRA COREAS FLORES", "2026-11-17", true),
    exp(null, null, "SIS Referencia Retorno", "2026-11-19"),
    exp(null, null, "SIS Referencia Retorno", "2026-11-20"),
  ],
  [
    // Los dos tipos en un mismo registro: cuenta una actualización.
    act("p", "Paola Alejandra Coreas Flores", "2026-11-18", ["identificacion", "responsable"]),
    act("p", "Paola Alejandra Coreas Flores", "2026-11-19", ["responsable"]),
    act("k", "Kathya Andrea de Orellana Martínez", "2026-11-19", ["identificacion"]),
    act("", "", "2026-11-19", ["identificacion"]),
  ],
);

assert.equal(p.filas.length, 2);
const kathya = p.filas.find((f) => f.clave === "k");
const paola = p.filas.find((f) => f.clave === "p");
assert.deepEqual(
  { expedientes: kathya.expedientes, nuevos: kathya.nuevosPadron, act: kathya.actualizaciones, id: kathya.identificacion, resp: kathya.responsable },
  { expedientes: 2, nuevos: 1, act: 1, id: 1, resp: 0 },
);
assert.deepEqual(
  { expedientes: paola.expedientes, nuevos: paola.nuevosPadron, act: paola.actualizaciones, id: paola.identificacion, resp: paola.responsable },
  { expedientes: 1, nuevos: 1, act: 2, id: 1, resp: 2 },
);
assert.equal(m.totalFilaCE(kathya), 3);
assert.equal(m.totalFilaCE(paola), 3);
// Empate en el total: orden alfabético.
assert.deepEqual(p.filas.map((f) => f.clave), ["k", "p"]);
assert.deepEqual(p.sinUsuario, [{ nombre: "SIS Referencia Retorno", expedientes: 2 }]);

// Nombres: sin tildes, mayúsculas ni espacios de más.
assert.equal(m.claveNombre("  Denys  Ricardo Álvarez Sorto "), "DENYS RICARDO ALVAREZ SORTO");

// Por día: todos los días del mes, solo fechas de ese mes.
const dias = m.conteoPorDia(["2026-11-16", "2026-11-16", "2026-11-30", "2026-12-01", "2026-10-31"], "2026-11");
assert.equal(dias.length, 30);
assert.equal(dias[15].valor, 2);
assert.equal(dias[29].valor, 1);
assert.equal(dias.reduce((s, d) => s + d.valor, 0), 3);
assert.equal(m.conteoPorDia([], "2026-02").length, 28);

console.log("OK: productividad de Consulta Externa");
