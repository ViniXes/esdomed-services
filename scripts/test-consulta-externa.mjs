// Comprueba el lector de la "Programación de citas por día" y la numeración de
// códigos del turnero de Consulta Externa, con datos inventados.
// Uso: node scripts/test-consulta-externa.mjs [ruta-a-un-xls-del-SIS]
// Con un .xls real, además imprime el resumen de lo que se cargaría (no lo guarda).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

// Transpila los módulos puros y los enlaza con un require mínimo.
const modulos = {};
function cargar(nombre) {
  if (modulos[nombre]) return modulos[nombre].exports;
  const fuente = readFileSync(new URL(`../src/lib/consultaExterna/${nombre}.ts`, import.meta.url), "utf8");
  const js = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const modulo = { exports: {} };
  modulos[nombre] = modulo;
  new Function("exports", "module", "require", js)(modulo.exports, modulo, (r) => cargar(r.replace("./", "")));
  return modulo.exports;
}
const { leerProgramacionCitas, leerFranja } = cargar("programacion");
const { prepararCarga, numerarNuevas, fechaReporteAISO, idCita } = cargar("agenda");
const { resolverEspecialidad, formatearCodigo } = cargar("especialidades");

// ── Hojas como las entrega SheetJS: una por agenda ──
const ENC = ["Número Expediente", "DUI", "Nombre del Paciente", "Tipo Cita", "Fecha de Otorgamiento", "Módulo que Otorga Cita"];
const paciente = (exp, dui, nombre, tipo = "Subsecuente") => [
  [exp, dui, nombre, tipo, "15/10/2026", "Área de citas"],
  ["Teléfono Paciente: 2222-0000", "", "Responsable: Pérez, Ana (Madre - Tel: 7000-0000)", "", "", ""],
  ["", "", "Dirección: COL PRUEBA #1", "", "", ""],
];
const franja = (texto, consultorio, filas) => [
  [texto, "", "", `Consultorio: ${consultorio}`, "", ""],
  ENC,
  ...filas.flat(),
  ["Pacientes Citados:", "", String(filas.length), "", "", ""],
];
const hoja = (especialidad, medico, franjas) => [
  [especialidad, "", "", "", "", ""],
  ["", "", "", "", "", ""],
  [medico, "", "", "", "", ""],
  ["13/11/2026", "", "", "", "", ""],
  ...franjas.flat(),
];

const cardio = hoja("Cardiología", "Ana Gómez", [
  franja("09:00:00 AM - 10:00:00 AM", "Cardiologia - 3", [paciente("10-26", "00000001-1", "Ruiz, Juan"), paciente("11-26", "", "Paz, Eva")]),
  franja("08:00:00 AM - 09:00:00 AM", "Cardiologia - 3", [paciente("12-26", "00000003-3", "Luna, Sol", "Primera Vez")]),
]);
const hemato = hoja("Hematologia", "Luis Mena", [
  franja("12:00:00 PM - 01:00:00 PM", "Hematologia - 2", [paciente("20-25", "00000004-4", "Mar, Rio"), paciente("20-25", "00000004-4", "Mar, Rio")]),
]);
const torax = hoja("Cirugía Torácica", "Raúl Soto", [
  franja("07:00:00 AM - 08:00:00 AM", "Cirugia Torax - 1", [paciente("30-24", "00000005-5", "Sol, Luz")]),
]);
const otra = hoja("Neurología", "Inés Vela", [
  franja("07:00:00 AM - 08:00:00 AM", "Neurologia - 1", [paciente("40-24", "00000006-6", "Vela, Mar")]),
]);
const basura = [["Censo diario"], ["algo", "otra cosa"]];

// ── Franjas ──
assert.deepEqual(leerFranja("08:00:00 AM - 09:00:00 AM"), { inicio: "08:00", fin: "09:00" });
assert.deepEqual(leerFranja("12:00:00 PM - 01:00:00 PM"), { inicio: "12:00", fin: "13:00" });
assert.deepEqual(leerFranja("11:30:00 AM - 12:30:00 PM"), { inicio: "11:30", fin: "12:30" });
assert.deepEqual(leerFranja("12:00 AM - 01:00 AM"), { inicio: "00:00", fin: "01:00" });
assert.equal(leerFranja("Consultorio: Cardiologia - 3"), null);

// ── Lector: una hoja por agenda ──
const prog = leerProgramacionCitas([cardio, basura, hemato, torax, otra]);
assert.deepEqual(prog.fechas, ["13/11/2026"]);
assert.equal(prog.citas.length, 6, "el repetido dentro de la misma especialidad no se duplica");
assert.deepEqual(prog.repetidas, [{ expediente: "20-25", especialidad: "Hematologia" }]);
assert.equal(prog.agendas.length, 4);
const c10 = prog.citas.find((c) => c.expediente === "10-26");
assert.equal(c10.especialidad, "Cardiología");
assert.equal(c10.medico, "Ana Gómez");
assert.equal(c10.consultorio, "Cardiologia - 3");
assert.equal(c10.franjaInicio, "09:00");
assert.equal(c10.paciente, "Ruiz, Juan");
assert.equal(prog.citas.find((c) => c.expediente === "11-26").dui, "");
assert.equal(prog.citas.find((c) => c.expediente === "12-26").primeraVez, true);
assert.equal(prog.citas.find((c) => c.expediente === "20-25").franjaInicio, "12:00");
assert.deepEqual(prog.agendas[0].franjas, ["09:00–10:00", "08:00–09:00"]);

// ── Lector: el mismo reporte guardado desde Excel en una sola hoja ──
const unaHoja = leerProgramacionCitas([[...cardio, ...hemato, ...torax]]);
assert.equal(unaHoja.citas.length, 5);
assert.deepEqual(
  unaHoja.agendas.map((a) => `${a.especialidad}/${a.medico}`),
  ["Cardiología/Ana Gómez", "Hematologia/Luis Mena", "Cirugía Torácica/Raúl Soto"],
);
assert.equal(unaHoja.citas.find((c) => c.expediente === "30-24").medico, "Raúl Soto");

// ── Catálogo ──
assert.equal(resolverEspecialidad("HEMATOLOGIA").id, "hematologia");
assert.equal(resolverEspecialidad("Cirugía  de Torax").id, "cirugia_torax");
assert.equal(resolverEspecialidad("Cirugía Torácica").estacion, "cardiologia");
assert.equal(resolverEspecialidad("Neurología"), null);
assert.equal(formatearCodigo("CA", 7), "CA-07");
assert.equal(formatearCodigo("CA", 104), "CA-104");

// ── Preparación ──
const carga = prepararCarga(prog);
assert.equal(carga.fechaISO, "2026-11-13");
assert.equal(fechaReporteAISO("13/11/2026"), "2026-11-13");
assert.deepEqual(carga.noReconocidas, [{ especialidad: "Neurología", citas: 1 }]);
assert.equal(carga.citas.length, 5);
assert.deepEqual(carga.resumen.map((r) => [r.id, r.citas, r.primeraVez, r.sinDui]), [
  ["hematologia", 1, 0, 0],
  ["cardiologia", 3, 1, 1],
  ["cirugia_torax", 1, 0, 0],
]);
assert.equal(carga.citas.find((c) => c.expediente === "30-24").estacionId, "cardiologia");
assert.equal(idCita("2026-11-13", "cardiologia", "10-26"), "2026-11-13_cardiologia_10-26");
assert.equal(prepararCarga({ ...prog, fechas: ["13/11/2026", "14/11/2026"] }).fechaISO, "", "dos fechas: no hay fecha única");

// ── Numeración: por franja, luego orden del reporte; sigue al último usado ──
const { numeradas, ultimoNumero } = numerarNuevas(carga.citas, {});
const codigo = (exp) => numeradas.find((c) => c.expediente === exp).codigo;
assert.equal(codigo("12-26"), "CA-01", "la franja de 08:00 va primero aunque venga después en el reporte");
assert.equal(codigo("10-26"), "CA-02");
assert.equal(codigo("11-26"), "CA-03");
assert.equal(codigo("30-24"), "CT-01", "cada especialidad numera aparte aunque compartan estación");
assert.deepEqual(ultimoNumero, { cardiologia: 3, hematologia: 1, cirugia_torax: 1 });
const segunda = numerarNuevas([carga.citas[0]], ultimoNumero);
assert.equal(segunda.numeradas[0].codigo, "CA-04", "una segunda carga sigue la numeración");
assert.equal(ultimoNumero.cardiologia, 3, "no muta el contador recibido");

// ── Circuito de la estación ──
const { aplicarAccion, accionesDe, compararCola, nombreConsultorio, destinoLlamado, agregarLlamado, quitarLlamadosDeCita } =
  cargar("circuito");
const paso = (estado, accion, etapa) => aplicarAccion(estado, accion, etapa)?.estado ?? null;
assert.equal(paso("citado", "llego"), "espera_preconsulta");
assert.equal(paso("espera_preconsulta", "llamar"), "llamado_preconsulta");
assert.equal(aplicarAccion("espera_preconsulta", "llamar").llamado, "preconsulta");
assert.equal(aplicarAccion("llamado_preconsulta", "volver_a_llamar").estado, "llamado_preconsulta");
assert.equal(aplicarAccion("llamado_preconsulta", "volver_a_llamar").llamado, "preconsulta");
assert.equal(paso("llamado_preconsulta", "preconsulta_lista"), "espera_consultorio");
assert.equal(aplicarAccion("espera_consultorio", "llamar").llamado, "consultorio");
assert.equal(paso("llamado_consultorio", "paso_a_consulta"), "atendido");
assert.deepEqual(aplicarAccion("llamado_consultorio", "no_respondio"), { estado: "no_respondio", etapaNoRespondio: "consultorio" });
assert.equal(paso("no_respondio", "regreso", "consultorio"), "espera_consultorio", "regresa a la etapa donde no respondió");
assert.equal(paso("no_respondio", "regreso", "preconsulta"), "espera_preconsulta");
assert.equal(paso("llamado_consultorio", "devolver_a_espera"), "espera_consultorio");
assert.equal(paso("espera_preconsulta", "quitar_llegada"), "citado");
// Acciones fuera de lugar (otra computadora ya movió la cita): no aplican.
assert.equal(aplicarAccion("citado", "llamar"), null);
assert.equal(aplicarAccion("atendido", "no_respondio"), null);
assert.equal(aplicarAccion("espera_consultorio", "llego"), null);
assert.equal(aplicarAccion("llamado_preconsulta", "paso_a_consulta"), null, "no se salta la preconsulta lista");
// Cada acción ofrecida en un estado es aplicable en ese estado.
for (const estado of ["citado", "espera_preconsulta", "llamado_preconsulta", "espera_consultorio", "llamado_consultorio", "no_respondio", "atendido"]) {
  for (const accion of accionesDe(estado)) assert.ok(aplicarAccion(estado, accion, "preconsulta"), `${estado} → ${accion}`);
}

// Cola: franja primero, luego llegada, luego número.
const cola = [
  { id: "b", franjaInicio: "09:00", numero: 1, llegadaMs: 100 },
  { id: "c", franjaInicio: "08:00", numero: 5, llegadaMs: 300 },
  { id: "d", franjaInicio: "08:00", numero: 2, llegadaMs: 200 },
  { id: "e", franjaInicio: "08:00", numero: 3, llegadaMs: null },
].sort(compararCola);
assert.deepEqual(cola.map((c) => c.id), ["d", "c", "e", "b"]);

// Destinos.
assert.equal(nombreConsultorio("Cardiologia - 3"), "Consultorio 3 de Cardiología");
assert.equal(nombreConsultorio("Hematologia - 12"), "Consultorio 12 de Hematología");
assert.equal(nombreConsultorio("Sala B"), "Consultorio Sala B");
assert.equal(destinoLlamado("preconsulta", { estacionId: "cardiologia", consultorio: "Cirugia Torax - 1" }), "Preconsulta de Cardiología");
assert.equal(destinoLlamado("consultorio", { estacionId: "cardiologia", consultorio: "Cirugia Torax - 1" }), "Consultorio 1 de Cirugía de Tórax");

// Lista de la pantalla: lo nuevo arriba, un "volver a llamar" no se duplica, máximo 8.
const ll = (id, citaId) => ({ id, citaId, codigo: citaId, destino: "x", etapa: "preconsulta", estacionId: "cardiologia", enMs: 0 });
let lista = [];
for (let i = 1; i <= 9; i++) lista = agregarLlamado(lista, ll(`l${i}`, `c${i}`));
assert.equal(lista.length, 8);
assert.equal(lista[0].id, "l9");
lista = agregarLlamado(lista, ll("l10", "c5"));
assert.equal(lista[0].id, "l10");
assert.equal(lista.filter((l) => l.citaId === "c5").length, 1);
assert.equal(quitarLlamadosDeCita(lista, "c5").some((l) => l.citaId === "c5"), false);

// ── Búsqueda para marcar llegada ──
const { coincideCita } = cargar("busqueda");
const ana = { codigo: "CA-07", expediente: "11431-26", dui: "00440933-7", paciente: "López Gonzales, María Pilar" };
assert.ok(coincideCita(ana, "CA-07"));
assert.ok(coincideCita(ana, "ca7"));
assert.ok(coincideCita(ana, "ca 07"));
assert.equal(coincideCita(ana, "CA-17"), false);
assert.equal(coincideCita(ana, "he7"), false);
assert.ok(coincideCita(ana, "11431"), "expediente por prefijo");
assert.ok(coincideCita(ana, "11431-26"));
assert.ok(coincideCita(ana, "004409"), "DUI por prefijo");
assert.ok(coincideCita(ana, "maria lopez"), "nombre sin tildes y en cualquier orden");
assert.equal(coincideCita(ana, "maria perez"), false);
assert.equal(coincideCita(ana, "m"), false, "una letra no busca");

console.log("✓ test-consulta-externa: lector, catálogo, numeración, circuito y búsqueda OK");

// ── Opcional: resumen de un .xls real del SIS ──
const ruta = process.argv[2];
if (ruta) {
  const XLSX = createRequire(import.meta.url)("xlsx");
  const wb = XLSX.read(new Uint8Array(readFileSync(ruta)), { type: "array", raw: true });
  const hojas = wb.SheetNames.map((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "" }));
  const real = prepararCarga(leerProgramacionCitas(hojas));
  const { numeradas: nums } = numerarNuevas(real.citas, {});
  console.log(`\n${ruta}: ${hojas.length} hojas, fecha ${real.fechaISO || "(no única)"}, ${real.citas.length} citas`);
  for (const r of real.resumen) {
    const deEsta = nums.filter((c) => c.especialidadId === r.id);
    console.log(`  ${r.nombre.padEnd(24)} ${String(r.citas).padStart(3)} citas · ${r.medicos} médicos · ${r.primeraVez} primera vez · ${r.sinDui} sin DUI · ${deEsta[0].codigo} a ${deEsta.at(-1).codigo}`);
  }
  if (real.noReconocidas.length) console.log("  No reconocidas:", real.noReconocidas);
}
