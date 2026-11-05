// Llena la plantilla con cifras conocidas y comprueba celdas, totales y estructura.
// Uso: node scripts/test-ocupacion-camas.mjs [ruta.xlsx]  (ruta: escribe el resultado)
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { strFromU8, unzipSync } = require("fflate");

const fuente = readFileSync(new URL("../src/lib/reportes/ocupacionCamasXlsx.ts", import.meta.url), "utf8");
const compilado = ts.transpileModule(fuente, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const modulo = { exports: {} };
vm.runInNewContext(compilado, { module: modulo, exports: modulo.exports, require });
const { generarOcupacionXlsx, totalesOcupacion } = modulo.exports;

// fila, filaTotal, oficiales, extras, ocupadas del Excel del 30-10-2026
const NO_CENSABLES = [
  [13, 32, 17, 0], [14, 20, 8, 7], [15, 21, 9, 9], [16, 22, 10, 8], [17, 23, 7, 6], [18, 24, 9, 7],
  [19, 25, 10, 9], [20, 26, 12, 7], [21, 27, 30, 23], [22, 28, 21, 19], [23, 29, 5, 4], [24, 30, 10, 4],
  [25, 31, 10, 1], [26, 33, 10, 0], [27, 34, 10, 0], [28, 35, 14, 0], [29, 36, 3, 0],
];
const CENSABLES = [
  [30, 16, 10, 2, 7], [31, 17, 10, 2, 9], [32, 18, 8, 2, 5], [33, 19, 10, 2, 5], [34, 3, 45, 2, 38],
  [35, 4, 25, 2, 24], [36, 5, 20, 2, 16], [37, 6, 50, 2, 41], [38, 7, 30, 2, 22], [39, 8, 32, 2, 16],
  [40, 9, 8, 2, 8], [41, 10, 50, 2, 47], [42, 11, 12, 2, 5], [43, 12, 15, 2, 13], [44, 13, 10, 0, 4],
  [45, 14, 60, 0, 10], [46, 15, 2, 8, 1],
];
const filas = [
  ...NO_CENSABLES.map(([fila, filaTotal, oficiales, ocupadas]) => ({
    fila, filaTotal, tipo: "noCensable", oficiales, extras: 0, ocupadas, ocupadasExtra: 0,
  })),
  ...CENSABLES.map(([fila, filaTotal, oficiales, extras, ocupadas]) => ({
    fila, filaTotal, tipo: "censable", oficiales, extras, ocupadas, ocupadasExtra: 0,
  })),
];

const totales = totalesOcupacion(filas);
assert.equal(totales.camasCensables, 397);
assert.equal(totales.ocupadasCensables, 271);
assert.equal(totales.camasNoCensables, 195);
assert.equal(totales.ocupadasNoCensables, 104);
assert.ok(Math.abs(totales.ocupacionHospitalizacion - 0.6826196473551638) < 1e-12);
assert.ok(Math.abs(totales.ocupacionCriticos - 0.7375886524822695) < 1e-12);

const plantilla = readFileSync(new URL("../public/plantillas/ocupacion-camas-hnes.xlsx", import.meta.url));
const salida = generarOcupacionXlsx(new Uint8Array(plantilla), filas, "2026-10-30");
const original = unzipSync(new Uint8Array(plantilla));
const generado = unzipSync(salida);

assert.deepEqual(Object.keys(generado), Object.keys(original));
assert.deepEqual(generado["xl/media/image1.png"], original["xl/media/image1.png"]);

assert.equal(strFromU8(generado["xl/workbook.xml"]).match(/fullCalcOnLoad/g).length, 1);

const hoja = strFromU8(generado["xl/worksheets/sheet1.xml"]);
const celda = (ref) => hoja.match(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`))[0];
assert.match(celda("F6"), /<v>46325<\/v>/);
assert.match(celda("D39"), /<v>32<\/v>/);
assert.match(celda("D43"), /<v>15<\/v>/);
assert.match(celda("J43"), /<f t="array"[\s\S]*<\/f><v>0\.8666/);
assert.match(celda("D47"), /<f [\s\S]*<v>397<\/v>/);
assert.equal(celda("F30").includes("<v>"), false);

const conExtra = filas.map((f) => (f.fila === 41 ? { ...f, ocupadasExtra: 1 } : f));
const conExtraHoja = strFromU8(unzipSync(generarOcupacionXlsx(new Uint8Array(plantilla), conExtra, "2026-10-30"))["xl/worksheets/sheet1.xml"]);
assert.match(conExtraHoja, /<c r="F41"[^>]*><v>2<\/v>/);
assert.match(conExtraHoja, /<c r="G41"[^>]*><v>1<\/v>/);

if (process.argv[2]) writeFileSync(process.argv[2], salida);
console.log("ok");
