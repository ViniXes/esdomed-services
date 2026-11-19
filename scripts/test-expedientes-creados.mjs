// Prueba del lector del reporte SIS "Expedientes creados" (Consulta Externa).
// Uso: node scripts/test-expedientes-creados.mjs [reporte.xlsx]
// Con un .xlsx real, además imprime el resumen; no guarda nada.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const fuente = readFileSync(new URL("../src/lib/consultaExterna/expedientesCreados.ts", import.meta.url), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const modulo = { exports: {} };
new Function("exports", "module", js)(modulo.exports, modulo);
const m = modulo.exports;

const ENC = ["Número de Expediente", "Nombre Completo Paciente", "Sexo", "Fecha de Nacimiento", "Edad", "Nombre de la Madre", "Creó Expediente", "Fecha de Creación", "Area Creación"];
const fila = (exp, nombre, sexo, nac, madre, creo, fecha, area = "Consulta Externa") => [exp, nombre, sexo, nac, "", madre, creo, fecha, area];

const l = m.leerExpedientesCreados([
  ["Reporte de expedientes creados"],
  ENC,
  fila("15143-26", "Navarrete De Vasquez, Fatima Roxana", "Femenino", "31/03/1988", "BLANCA CAMPOS", "PAOLA ALEJANDRA COREAS FLORES", "18/11/2026"),
  fila(" 15149 - 26 ", "Polio, Medardo", "Masculino", "17/05/1949", "", "KATHYA ANDREA DE ORELLANA MARTINEZ", "18/11/2026"),
  fila("15149-26", "Polio, Medardo", "Masculino", "17/05/1949", "", "KATHYA ANDREA DE ORELLANA MARTINEZ", "18/11/2026"),
  fila("15200-26", "Perez, Juan", "Masculino", "01/01/1990", "", "OTRA PERSONA", "18/11/2026", "Emergencia"),
  fila("", "Sin, Expediente", "Masculino", "01/01/1990", "", "X", "18/11/2026"),
  fila("15201-26", "Mal, Fecha", "Femenino", "", "", "X", "31/02/2026"),
  [null, null],
]);
assert.equal(l.totalFilas, 6);
assert.equal(l.filas.length, 2);
assert.equal(l.repetidas, 1);
assert.deepEqual(l.otrasAreas, [{ area: "Emergencia", total: 1 }]);
assert.equal(l.invalidas.length, 2);
assert.deepEqual(l.filas[0], {
  expediente: "15143-26", apellidos: "Navarrete De Vasquez", nombres: "Fatima Roxana",
  nombreCompleto: "Navarrete De Vasquez, Fatima Roxana", genero: "femenino", fechaNacimiento: "1988-03-31",
  nombreMadre: "BLANCA CAMPOS", creadoPor: "PAOLA ALEJANDRA COREAS FLORES", fechaCreacion: "2026-11-18", area: "Consulta Externa",
});
assert.equal(l.filas[1].expediente, "15149-26");
assert.throws(() => m.leerExpedientesCreados([["Otra cosa"]]), /No parece el reporte/);

// Fechas
assert.equal(m.fechaReporteISO("1/2/2026"), "2026-02-01");
assert.equal(m.fechaReporteISO(new Date(2026, 10, 18)), "2026-11-18");
assert.equal(m.fechaReporteISO(46344), "2026-11-18");
assert.equal(m.fechaReporteISO("30/02/2026"), "");
assert.deepEqual(m.rangoMesISO("2026-02"), ["2026-02-01", "2026-02-28"]);
assert.equal(m.rangoMesISO("2026-13"), null);

// Emparejar creadores con usuarios (sin tildes ni mayúsculas, solo nombre completo)
const usuarios = [{ nombre: "Kathya Andrea de Orellana Martínez" }, { nombre: "Paola Alejandra Coreas Flores" }];
assert.equal(m.emparejarCreador("KATHYA ANDREA DE ORELLANA MARTINEZ", usuarios)?.nombre, "Kathya Andrea de Orellana Martínez");
assert.equal(m.emparejarCreador("PAOLA COREAS", usuarios), null);

// Saneo de lo que llega a la API
assert.equal(m.sanearFilaRecibida({ ...l.filas[0], area: "Emergencia" }), null);
assert.equal(m.sanearFilaRecibida({ ...l.filas[0], expediente: "a/b" }), null);
assert.equal(m.sanearFilaRecibida({ ...l.filas[0], genero: "x" }).genero, "otro");
assert.deepEqual(m.sanearFilaRecibida(l.filas[0]), l.filas[0]);

console.log("OK: lector de expedientes creados");

const ruta = process.argv[2];
if (ruta) {
  const XLSX = (await import("xlsx")).default ?? (await import("xlsx"));
  const wb = XLSX.read(readFileSync(ruta), { type: "buffer", cellDates: true });
  const matriz = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true });
  const r = m.leerExpedientesCreados(matriz);
  const porCreador = {};
  for (const f of r.filas) porCreador[f.creadoPor] = (porCreador[f.creadoPor] ?? 0) + 1;
  console.log({ totalFilas: r.totalFilas, consultaExterna: r.filas.length, otrasAreas: r.otrasAreas, invalidas: r.invalidas, repetidas: r.repetidas, porCreador, ejemplo: r.filas[0] });
}
