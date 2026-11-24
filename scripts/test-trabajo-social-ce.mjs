// Prueba de Trabajo Social de Consulta Externa: catálogo, validaciones, índice
// de citados y resumen del mes. No usa Firebase ni guarda nada.
// Uso: node scripts/test-trabajo-social-ce.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const fuente = readFileSync(new URL("../src/lib/consultaExterna/trabajoSocial.ts", import.meta.url), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modulo = { exports: {} };
new Function("exports", "module", js)(modulo.exports, modulo);
const m = modulo.exports;
const HOY = "2026-11-24";

// ── Catálogo ──
const ids = m.TIPOS_GESTION_TS_CE.map((t) => t.id);
assert.equal(new Set(ids).size, ids.length, "tipos repetidos");
for (const t of m.TIPOS_GESTION_TS_CE) {
  for (const lista of [t.pasos, t.detalles ?? []]) {
    assert.equal(new Set(lista.map((x) => x.id)).size, lista.length, `repetidos en ${t.id}`);
  }
}
assert.deepEqual(m.gruposDeTipos("hemato_onco").map((g) => g.id), ["hemato_onco", "comun", "cardiologia"]);
assert.equal(m.gruposDeTipos("cardiologia").flatMap((g) => g.tipos).length, ids.length, "el área no bloquea ningún tipo");

// ── Área: del tipo, luego de la especialidad, luego de la cuenta ──
assert.equal(m.areaSugerida("marcapaso", "hematologia", "hemato_onco"), "cardiologia");
assert.equal(m.areaSugerida("receta", "cirugia_torax", "hemato_onco"), "cardiologia");
assert.equal(m.areaSugerida("receta", "oncologia", "cardiologia"), "hemato_onco");
assert.equal(m.areaSugerida("receta", "infectologia", "cardiologia"), "otra");
assert.equal(m.areaSugerida("receta", "", "cardiologia"), "cardiologia");

assert.deepEqual(m.sugeridoPorPaso("llamada_recibida"), { medio: "llamada" });
assert.deepEqual(m.sugeridoPorPaso("entrevista_familiar"), { conQuien: "familiar" });
assert.deepEqual(m.sugeridoPorPaso(""), {});

// ── Validaciones ──
const gestion = (x) => m.validarGestion({ tipo: "receta", area: "cardiologia", ...x });
assert.ok(gestion({}).ok);
assert.ok(!gestion({ tipo: "no_existe" }).ok);
assert.ok(!gestion({ area: "" }).ok);
assert.ok(!gestion({ tipo: "cita_estudio" }).ok, "cita sin detalle");
assert.ok(!gestion({ tipo: "cita_estudio", detalle: "holter", procedencia: "red" }).ok, "red sin hospital");
const red = gestion({ tipo: "cita_estudio", detalle: "holter", procedencia: "red", establecimiento: " Hospital  de Zacatecoluca " });
assert.equal(red.datos.establecimiento, "Hospital de Zacatecoluca");
assert.equal(gestion({ tipo: "cita_estudio", detalle: "holter", establecimiento: "X" }).datos.establecimiento, "");
assert.equal(gestion({ tipo: "programa_mas", area: "cardiologia" }).datos.area, "hemato_onco", "el tipo de un área cuenta en ella");
assert.equal(gestion({ tipo: "rastreo", medico: "Dr. X" }).datos.medico, "", "médico solo donde se pide");
assert.deepEqual(gestion({ poblacion: ["adulto_mayor", "otra"] }).datos.poblacion, ["adulto_mayor"]);

const nota = (x, tipo = "receta") => m.validarNota({ medio: "llamada", paso: "gestion_medico", ...x }, tipo, HOY);
assert.ok(nota({}).ok);
assert.equal(nota({}).datos.fecha, HOY);
assert.ok(!nota({ fecha: "2026-11-25" }).ok, "fecha futura");
assert.ok(!nota({ fecha: "2026-09-01" }).ok, "muy vieja");
assert.ok(!nota({ medio: "fax" }).ok);
assert.ok(!nota({ paso: "", texto: " " }).ok, "ni paso ni texto");
assert.ok(nota({ paso: "", texto: "Se llamó" }).ok);
assert.ok(!nota({ paso: "" }, "otra").ok, "otra gestión exige nota");
assert.equal(nota({ paso: "pnc", texto: "Se llamó" }).datos.paso, "", "paso de otro tipo no entra");
assert.equal(nota({ texto: "Línea 1\r\n  línea   2" }).datos.texto, "Línea 1\n línea 2");
assert.ok(!m.validarMotivo("  no ").ok);
assert.ok(m.validarMotivo("El paciente no acepta").ok);

assert.ok(!m.validarPacienteManual({ paciente: "Juan" }).ok);
assert.ok(!m.validarPacienteManual({ paciente: "Pérez, Juan", dui: "123" }).ok);
const manual = m.validarPacienteManual({ paciente: " Pérez,  Juan ", expediente: " 100 - 26 ", dui: "004188606" });
assert.deepEqual(manual.datos, { expediente: "100-26", dui: "00418860-6", paciente: "Pérez, Juan" });
assert.equal(m.claveDePaciente(manual.datos), "100-26");
assert.equal(m.claveDePaciente({ expediente: "", dui: "00418860-6", paciente: "X Y" }), "dui:00418860-6");
assert.equal(m.claveDePaciente({ expediente: "", dui: "", paciente: "Pérez, José" }), "nom:PEREZ, JOSE");
assert.ok(m.validarActividad({ tipo: "charla", detalle: "Anticoagulación", asistentes: 12 }, HOY).ok);
assert.ok(!m.validarActividad({ tipo: "charla", detalle: "Anticoagulación", asistentes: -1 }, HOY).ok);
assert.equal(m.validarActividad({ tipo: "reunion_virtual", detalle: "Programa", asistentes: 9 }, HOY).datos.asistentes, 0);

// ── Índice de citados ──
const cita = (x) => ({ fecha: "2026-11-20", expediente: "100-26", dui: "", paciente: "Pérez, Juan", especialidadId: "cardiologia", medico: "Dr. A", ...x });
let p = m.fusionarCita(undefined, cita({}));
assert.equal(p.ultima, "2026-11-20");
assert.equal(p.dui, "", "entra aunque no tenga DUI");
p = m.fusionarCita(p, cita({ fecha: "2026-11-13", dui: "00418860-6", especialidadId: "hematologia", medico: "Dr. B" }));
assert.equal(p.primera, "2026-11-13");
assert.equal(p.dui, "00418860-6", "el DUI de una cita anterior completa el que faltaba");
assert.equal(p.medico, "Dr. A", "manda la más reciente");
assert.deepEqual(p.especialidades, ["cardiologia", "hematologia"]);
assert.deepEqual(m.fusionarCita(p, cita({})), p, "idempotente");
const deMano = m.fusionarCita({ expediente: "100-26", dui: "", paciente: "Juan Perez", primera: "", ultima: "", especialidades: [], especialidadId: "", medico: "", manual: true }, cita({}));
assert.equal(deMano.paciente, "Pérez, Juan");
assert.equal(deMano.manual, false, "al aparecer citado deja de ser manual");
const frag = m.citasPorFragmento([cita({}), cita({ expediente: " 100 - 26 " }), cita({ expediente: "" })]);
assert.equal(frag.size, 1);
assert.equal([...frag.values()][0].length, 2);
assert.match(m.fragmentoPaciente("nom:PEREZ, JOSE"), /^f(0\d|1\d)$/);

// ── Resumen ──
const g = (x) => ({
  id: "g", clave: "100-26", expediente: "100-26", dui: "", paciente: "Pérez, Juan", especialidadId: "cardiologia", origen: "cita", tipo: "receta", detalle: "",
  area: "cardiologia", procedencia: "", establecimiento: "", medico: "", poblacion: [], estado: "en_proceso", motivoNoProcede: "", fecha: "2026-11-10",
  fechaCierre: "", creadoPor: "A", creadoPorNombre: "Ana", creadoEnMs: 1, totalNotas: 1, ultimaNotaFecha: "2026-11-10", historial: [], ...x,
});
const n = (x) => ({ id: "n", gestionId: "g1", clave: "100-26", fecha: "2026-11-10", paso: "", conQuien: "paciente", medio: "llamada", texto: "x", autor: "A", autorNombre: "Ana", creadoEnMs: 1, editadoEnMs: 0, ...x });
const datos = {
  gestiones: [
    g({ id: "g1" }), // abierta, 14 días sin movimiento
    g({ id: "g2", estado: "finalizada", fechaCierre: "2026-11-14", tipo: "cita_estudio", detalle: "holter", procedencia: "red", establecimiento: "ISSS", clave: "200-26" }),
    g({ id: "g3", fecha: "2026-10-30", estado: "no_procede", fechaCierre: "2026-11-05", motivoNoProcede: "No acepta" }), // de octubre, cerrada en noviembre
    g({ id: "g4", fecha: "2026-10-02", estado: "en_proceso", ultimaNotaFecha: "2026-11-23", area: "hemato_onco", tipo: "programa_mas", creadoPor: "B", creadoPorNombre: "Berta" }),
  ],
  notas: [n({}), n({ id: "n2", gestionId: "g4", autor: "A", fecha: "2026-11-23" }), n({ id: "n3", gestionId: "g3", fecha: "2026-10-30" })],
  actividades: [{ id: "a", tipo: "charla", detalle: "x", asistentes: 20, area: "cardiologia", fecha: "2026-11-11", autor: "A", autorNombre: "Ana", creadoEnMs: 1 }],
};
const r = m.resumirTS("2026-11", datos, HOY);
assert.equal(r.nuevas, 2, "solo las del mes");
assert.equal(r.finalizadas, 1);
assert.equal(r.noProcede, 1, "cerrada en el mes aunque se abriera antes");
assert.equal(r.enProceso, 2);
assert.equal(r.notas, 2, "la nota de octubre no cuenta");
assert.equal(r.pacientes, 2);
assert.equal(r.asistentes, 20);
assert.equal(r.porDia.length, 30);
assert.equal(r.porDia[9].gestiones, 2);
assert.deepEqual(r.sinMovimiento.map((x) => x.id), ["g1"]);
assert.equal(r.porTipo.find((x) => x.id === "cita_estudio").diasCierre, 4);
assert.deepEqual(r.red, [{ establecimiento: "ISSS", n: 1 }]);
const ana = r.porPersona.find((x) => x.uid === "A");
assert.deepEqual(ana.areas.find((a) => a.area === "hemato_onco"), { area: "hemato_onco", gestiones: 0, notas: 1 }, "se ve la cobertura");
assert.equal(m.resumirTS("2026-11", datos, HOY, { area: "hemato_onco" }).notas, 1);
assert.equal(m.resumirTS("2026-11", datos, HOY, { persona: "B" }).nuevas, 0);
assert.equal(m.finDeMes("2028-02"), "2028-02-29");

console.log(`Trabajo Social CE: bien (${ids.length} tipos de gestión).`);
