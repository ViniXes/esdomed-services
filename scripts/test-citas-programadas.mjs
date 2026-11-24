// Comprueba la lógica pura de la programación de citas 2027 y el catálogo
// semilla (agendas redistribuidas). Uso: node scripts/test-citas-programadas.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const fuente = readFileSync(new URL("../src/lib/consultaExterna/citasProgramadas.ts", import.meta.url), "utf8");
const js = ts.transpileModule(fuente, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const modulo = { exports: {} };
new Function("exports", "module", js)(modulo.exports, modulo);
const m = modulo.exports;

const semilla = JSON.parse(readFileSync(new URL("../src/lib/consultaExterna/catalogoCitasSemilla.json", import.meta.url), "utf8"));

// ── Fechas y horas ──
assert.equal(m.diaSemanaDeISO("2027-01-04"), "lunes");
assert.equal(m.diaSemanaDeISO("2027-01-08"), "viernes");
assert.equal(m.esFechaDelAnio("2027-02-28"), true);
assert.equal(m.esFechaDelAnio("2027-02-30"), false);
assert.equal(m.esFechaDelAnio("2026-12-31"), false);
assert.equal(m.hora12("06:30"), "06:30 AM");
assert.equal(m.hora12("12:00"), "12:00 PM");
assert.equal(m.hora12("13:00"), "01:00 PM");
assert.equal(m.textoFranja("12:30", "13:30"), "12:30 PM - 01:30 PM");
assert.deepEqual(m.rangoDelMes("2027-02"), ["2027-02-01", "2027-02-28"]);

// ── Textos ──
assert.equal(m.normalizarExpediente(" 12345 - 26 "), "12345-26");
assert.equal(m.expedienteConFormaUsual("7886-21"), true);
assert.equal(m.expedienteConFormaUsual("7886"), false);
assert.equal(m.slugMedico("José  Héctor Valencia"), "jose_hector_valencia");

// ── Catálogo semilla ──
assert.equal(semilla.medicos.length, 28);
assert.equal(semilla.consultorios.length, 17);
assert.equal(semilla.franjas.length, 176);
assert.deepEqual(m.validarCatalogo(semilla), [], "la semilla debe ser válida");
const nombresConsultorio = new Set(semilla.consultorios.map((c) => c.nombre));
for (const f of semilla.franjas) assert.ok(nombresConsultorio.has(f.consultorio), `consultorio desconocido: ${f.consultorio}`);
for (const x of semilla.medicos) {
  assert.equal(x.nombre, m.limpiarTexto(x.nombre), `espacios de más: ${x.nombre}`);
  if (x.consultorioFijo) assert.ok(nombresConsultorio.has(x.consultorioFijo), `consultorio fijo desconocido: ${x.consultorioFijo}`);
}
assert.equal(m.choquesDeConsultorio(semilla).length, 0, m.choquesDeConsultorio(semilla).join("\n"));

const maritza = semilla.medicos.find((x) => x.nombre === "Maritza Martinez Miranda");
const lunes = m.franjasDelDia(semilla, maritza.id, "2027-01-04");
assert.deepEqual(lunes.map((f) => f.inicio), ["06:30", "07:30"]);
assert.equal(lunes[0].consultorio, "Hematología - 2");
assert.equal(m.franjasDelDia(semilla, maritza.id, "2027-01-09").length, 0, "sábado sin franjas");
assert.deepEqual(m.diasQueAtiende(semilla, maritza.id), ["lunes", "martes", "miercoles", "jueves", "viernes"]);

// ── Validaciones del catálogo ──
const roto = structuredClone(semilla);
roto.franjas.push({ ...roto.franjas[0] });
roto.franjas.push({ ...roto.franjas[1], id: "x", inicio: "10:00", fin: "09:00" });
roto.franjas.push({ ...roto.franjas[2], id: "y", inicio: "15:00", fin: "16:00", cupo: 0 });
const errores = m.validarCatalogo(roto);
assert.ok(errores.some((e) => e.includes("repetida")));
assert.ok(errores.some((e) => e.includes("no es válido")));
assert.ok(errores.some((e) => e.includes("cupo")));

const choque = structuredClone(semilla);
const otro = semilla.medicos.find((x) => x.especialidad === "Hematología" && x.id !== maritza.id);
choque.franjas.push({ id: "z", medicoId: otro.id, dia: "lunes", inicio: "07:00", fin: "08:00", cupo: 4, consultorio: "Hematología - 2" });
assert.equal(m.choquesDeConsultorio(choque).length, 2, "choca con las dos franjas de Maritza del lunes");

// ── Citas ──
const occ = m.ocupacionPorFranja([
  { franjaInicio: "06:30", estado: "pendiente" },
  { franjaInicio: "06:30", estado: "registrada_sis" },
  { franjaInicio: "06:30", estado: "anulada" },
  { franjaInicio: "07:30", estado: "pendiente" },
]);
assert.equal(occ.get("06:30"), 2);
assert.equal(occ.get("07:30"), 1);

const base = {
  fecha: "2027-01-04", especialidad: "Hematología", medicoId: maritza.id, medico: maritza.nombre,
  consultorio: "Hematología - 2", franjaInicio: "06:30", franjaFin: "07:30",
  expediente: "7886-21", paciente: "Flamenco Lovos, Jesus", tipo: "Subsecuente", observaciones: "",
};
assert.deepEqual(m.validarCita(base), []);
assert.ok(m.validarCita({ ...base, fecha: "2026-12-01" }).length);
assert.ok(m.validarCita({ ...base, paciente: "  " }).length);
assert.ok(m.validarCita({ ...base, tipo: "" }).length);

const orden = [
  { ...base, fecha: "2027-01-05" },
  { ...base, franjaInicio: "07:30" },
  { ...base, especialidad: "Cardiología" },
].sort(m.compararCitas);
assert.deepEqual(orden.map((c) => `${c.fecha} ${c.especialidad} ${c.franjaInicio}`), [
  "2027-01-04 Cardiología 06:30",
  "2027-01-04 Hematología 07:30",
  "2027-01-05 Hematología 06:30",
]);

console.log("OK: programación de citas 2027");

// ── Descargas ──
const grupos = m.agruparPorEspecialidad([
  { especialidad: "Cirugía de Tórax", n: 1 },
  { especialidad: "Hematología", n: 2 },
  { especialidad: "Hematología", n: 3 },
  { especialidad: "Infectología", n: 4 },
]);
assert.deepEqual(grupos.map((g) => g.especialidad), ["Hematología", "Infectología", "Cirugía de Tórax"]);
assert.deepEqual(grupos[0].citas.map((c) => c.n), [2, 3], "conserva el orden de la lista");
assert.equal(m.nombrePestana("Cirugía Cardiovascular"), "Cirugía Cardiovascular");
assert.equal(m.nombrePestana("a/b:c"), "a b c");
console.log("OK: descargas por especialidad");

// ── Horario opcional y búsqueda en listas ──
assert.deepEqual(m.validarCita({ ...base, franjaInicio: "", franjaFin: "" }), [], "se puede guardar sin horario");
assert.ok(m.validarCita({ ...base, franjaInicio: "25:00", franjaFin: "" }).length);
assert.equal(m.textoFranja("", ""), "Sin horario");
const ops = [
  { etiqueta: "Astul Elias Campos Ibarra" },
  { etiqueta: "Carlos Josue Perez Rivas" },
  { etiqueta: "Marcial Fidel Cabrera Candray" },
  { etiqueta: "Ricardo Ernesto Menjivar Castillo" },
];
assert.deepEqual(m.filtrarOpciones(ops, "car").map((o) => o.etiqueta), [
  "Carlos Josue Perez Rivas",
  "Ricardo Ernesto Menjivar Castillo",
], "empieza por lo escrito primero; Marcial no contiene 'car'");
assert.deepEqual(m.filtrarOpciones(ops, "ric cas").map((o) => o.etiqueta), ["Ricardo Ernesto Menjivar Castillo"]);
assert.equal(m.filtrarOpciones(ops, "").length, 4);
assert.deepEqual(m.filtrarOpciones([{ etiqueta: "Hematología" }], "hemato").length, 1);
console.log("OK: horario opcional y búsqueda");

// Fecha escrita en números (día/mes/año)
assert.equal(m.fechaEscritaAISO("18/12/2027"), "2027-12-18");
assert.equal(m.fechaEscritaAISO("6-1-27"), "2027-01-06");
assert.equal(m.fechaEscritaAISO("06.01.2027"), "2027-01-06");
assert.equal(m.fechaEscritaAISO("06012027"), "2027-01-06");
assert.equal(m.fechaEscritaAISO("6/1"), "2027-01-06");
assert.equal(m.fechaEscritaAISO("31/02/2027"), null);
assert.equal(m.fechaEscritaAISO("13/13/2027"), null);
assert.equal(m.fechaEscritaAISO("18 de diciembre"), null);
assert.equal(m.isoADdMmAaaa("2027-01-06"), "06/01/2027");
console.log("OK: fecha en números");

// ── Buscador de la lista ──
{
  const c = { expediente: "15193-26", paciente: "Pineda Hurtado, Alejandro José" };
  assert.equal(m.coincideBusqueda(c, ""), true);
  assert.equal(m.coincideBusqueda(c, "15193"), true);
  assert.equal(m.coincideBusqueda(c, " 15193 - 26 "), true);
  assert.equal(m.coincideBusqueda(c, "1520"), false);
  assert.equal(m.coincideBusqueda(c, "alejandro pineda"), true);
  assert.equal(m.coincideBusqueda(c, "JOSE hurtado"), true);
  assert.equal(m.coincideBusqueda(c, "pineda lopez"), false);
  assert.equal(m.pareceExpediente("15193-2"), true);
  assert.equal(m.pareceExpediente("pineda"), false);
}
console.log("buscador: ok");

// ── Nombres escritos a mano (nombres.ts) ──
{
  const fuenteN = readFileSync(new URL("../src/lib/consultaExterna/nombres.ts", import.meta.url), "utf8");
  const jsN = ts.transpileModule(fuenteN, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const modN = { exports: {} };
  new Function("exports", "module", jsN)(modN.exports, modN);
  const n = modN.exports;
  const dic = JSON.parse(readFileSync(new URL("../src/lib/consultaExterna/diccionarioNombres.json", import.meta.url), "utf8"));
  assert.equal(n.nombrePropio("  alrjandro   JOSE pineda hurtado "), "Alrjandro Jose Pineda Hurtado");
  assert.equal(n.nombrePropio("HERNANDEZ DE RODRIGUEZ ,MATILDE DE LOS ANGELES"), "Hernandez de Rodriguez, Matilde de los Angeles");
  assert.equal(n.nombrePropio("de la cruz, ana maría"), "De la Cruz, Ana María");
  assert.equal(n.nombrePropio("peña lópez-garcía"), "Peña López-García");
  assert.deepEqual(n.palabrasDudosas("Alejndro Lopez", dic), [{ palabra: "Alejndro", sugerencia: "Alejandro" }]);
  assert.deepEqual(n.palabrasDudosas("Hernandez Sanchez, Edwin Alexander", dic), []);
  assert.equal(n.aplicarSugerencias("alejndro lopez", [{ palabra: "alejndro", sugerencia: "Alejandro" }]), "Alejandro Lopez");
}
console.log("nombres: ok");
