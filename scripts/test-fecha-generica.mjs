// Prueba de la pestaña provisional de fecha genérica (reglas puras).
// Uso: node scripts/test-fecha-generica.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const fuente = readFileSync(new URL("../src/lib/consultaExterna/fechaGenerica.ts", import.meta.url), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const modulo = { exports: {} };
new Function("exports", "module", js)(modulo.exports, modulo);
const m = modulo.exports;

// ── Lectura del reporte ──
assert.equal(m.limpiarDatoSis("NO PROPORCIONADO NO PROPORCIONADO"), "");
assert.equal(m.limpiarDatoSis("  BRENDA   RAMOS "), "BRENDA RAMOS");
assert.deepEqual(m.leerCitasAgenda("22/10/2026 Hematología; 17/11/2026 Hematología"), [
  { fecha: "2026-10-22", especialidad: "Hematología" },
  { fecha: "2026-11-17", especialidad: "Hematología" },
]);
assert.deepEqual(m.leerCitasAgenda(""), []);
assert.deepEqual(m.estadoSegunSis("Expediente Unificado Con 15062-26"), { estado: "unificado", unificadoCon: "15062-26" });
assert.deepEqual(m.estadoSegunSis("Fecha de nacimiento ya cambiada"), { estado: "corregido" });
assert.equal(m.estadoSegunSis("Otra cosa"), null);
assert.equal(m.normalizarExpedienteFG(" 9113 - 26 "), "9113-26");

// ── Lista: agenda sin DUI + reporte + marcas ──
const cita = (expediente, fecha, especialidadId = "hematologia", paciente = "Perez, Ana") =>
  ({ expediente, paciente, fecha, especialidad: especialidadId === "hematologia" ? "Hematología" : "Oncología", especialidadId, medico: "Dr X", estado: "citado" });
const reporte = {
  "100-26": { paciente: "PEREZ, ANA", citasAgenda: [{ fecha: "2026-11-24", especialidad: "Hematología", especialidadId: "hematologia" }, { fecha: "2026-12-03", especialidad: "Oncología", especialidadId: "oncologia" }] },
  "200-26": { paciente: "LOPEZ, LUIS", citasAgenda: [], estadoSis: "unificado", unificadoCon: "300-26" },
  "400-26": { paciente: "GOMEZ, EVA", citasAgenda: [] },
  "500-26": { paciente: "RIVAS, JOSE", citasAgenda: [], estadoSis: "corregido" },
};
const lista = m.armarListaFG({
  citasSinDui: [cita("100-26", "2026-11-24"), cita("100-26", "2026-11-17", "hematologia", "Perez Viejo, Ana"), cita("600-26", "2026-11-24", "oncologia", "Sin Reporte, Juan")],
  conDui: new Set(["400-26"]),
  reporte,
  marcas: { "500-26": { estado: "pendiente" } },
});
const por = Object.fromEntries(lista.map((p) => [p.expediente, p]));
assert.equal(lista.length, 5);
// Nombre de la cita más reciente; citas de la agenda más las del reporte que no repiten.
assert.equal(por["100-26"].paciente, "Perez, Ana");
assert.equal(por["100-26"].fechaGenerica, true);
assert.deepEqual(por["100-26"].citas.map((c) => [c.fecha, c.origen]), [["2026-11-17", "agenda"], ["2026-11-24", "agenda"], ["2026-12-03", "reporte"]]);
assert.equal(por["100-26"].estado, "pendiente");
// Según el reporte: unificado.
assert.equal(por["200-26"].estado, "unificado");
assert.equal(por["200-26"].unificadoCon, "300-26");
assert.equal(por["200-26"].resuelto.origen, "sis");
// Ya aparece con DUI en una agenda: sale solo.
assert.equal(por["400-26"].estado, "con_dui");
// La marca de services manda sobre el reporte.
assert.equal(por["500-26"].estado, "pendiente");
// Sin DUI en la agenda pero fuera del reporte: entra, sin fecha genérica.
assert.equal(por["600-26"].fechaGenerica, false);
assert.equal(por["600-26"].estado, "pendiente");
assert.deepEqual(m.resumenFechaGenerica(lista), { total: 5, pendiente: 3, corregido: 0, unificado: 1, con_dui: 1 });

// ── Pantalla ──
assert.equal(m.edadEnAnios("2000-10-10", "2026-11-24"), 26);
assert.equal(m.edadEnAnios("2000-10-10", "2026-10-09"), 25);
assert.equal(m.citaDeHoyFG(por["100-26"], "2026-11-24").origen, "agenda");
assert.equal(m.citaDeHoyFG(por["100-26"], "2026-11-25"), null);
assert.equal(m.proximaCitaFG(por["100-26"], "2026-11-25").fecha, "2026-12-03");
assert.equal(m.coincideFG(por["100-26"], "ana perez"), true);
assert.equal(m.coincideFG(por["100-26"], "100"), true);
assert.equal(m.coincideFG(por["100-26"], "200"), false);
const hoy = "2026-11-24";
assert.deepEqual(m.filtrarFechaGenerica(lista, "", { estado: "pendiente", especialidadId: "", orden: "proxima", hoyISO: hoy }).map((p) => p.expediente), ["100-26", "600-26", "500-26"]);
assert.deepEqual(m.filtrarFechaGenerica(lista, "", { estado: "resueltos", especialidadId: "", orden: "nombre", hoyISO: hoy }).map((p) => p.expediente), ["400-26", "200-26"]);
assert.deepEqual(m.filtrarFechaGenerica(lista, "", { estado: "todos", especialidadId: "oncologia", orden: "nombre", hoyISO: hoy }).map((p) => p.expediente), ["100-26", "600-26"]);
// Cita hoy: solo pendientes con cita ese día.
assert.deepEqual(m.filtrarFechaGenerica(lista, "", { estado: "cita_hoy", especialidadId: "", orden: "nombre", hoyISO: hoy }).map((p) => p.expediente), ["100-26", "600-26"]);
assert.deepEqual(m.filtrarFechaGenerica(lista, "", { estado: "cita_hoy", especialidadId: "", orden: "nombre", hoyISO: "2026-11-25" }), []);

// ── Unificar ──
assert.equal(m.validarUnificacion("100-26", "15062-26"), null);
assert.ok(m.validarUnificacion("100-26", ""));
assert.ok(m.validarUnificacion("100-26", "100-26"));
assert.ok(m.validarUnificacion("100-26", "abc"));

console.log("OK: fecha genérica");
