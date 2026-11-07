// Comprueba cómo se une lo escrito con un censo ya guardado de la misma atención.
// Uso: node scripts/test-unir-censos.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const fuente = readFileSync(new URL("../src/lib/emergencia/censos.ts", import.meta.url), "utf8");
const compilado = ts.transpileModule(fuente, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const modulo = { exports: {} };
new Function("exports", "module", compilado)(modulo.exports, modulo);
const { unirFormularios } = modulo.exports;

const base = {
  fechaHora: "2026-11-07T12:00",
  turno: "t07_15",
  expediente: "",
  triage: null,
  condicion: "vivo",
  destino: null,
  staffEvalua: "",
  ventilacionMecanica: false,
  procedimientosUE: [],
  diagnosticos: [],
  notas: [],
  medicosGenerales: [],
};
const nota = (texto, fecha) => ({ texto, fecha });

// El caso real del expediente 14432-26: el segundo formulario traía más
// procedimientos y una nota, y al primero se le agregó diagnóstico y destino.
const guardado = {
  ...base,
  fechaHora: "2026-11-06T21:15",
  turno: "t19_24",
  expediente: "14432-26",
  triage: "rojo",
  destino: "alta_voluntaria",
  staffEvalua: "STAFF UNO",
  procedimientosUE: ["HGT"],
  diagnosticos: [{ codigo: "R57.2", descripcion: "Choque septico" }],
  medicosGenerales: ["GENERAL UNO"],
};
const escrito = {
  ...base,
  fechaHora: "2026-11-06T21:15",
  turno: "t19_24",
  expediente: "14432-26",
  triage: "rojo",
  staffEvalua: "STAFF UNO",
  procedimientosUE: ["Exámenes", "Rayos X", "HGT", "GSA", "EKG"],
  notas: [nota("EXAMENES + REEVALUACION.-", "2026-11-07T03:24:36.000Z")],
  medicosGenerales: ["GENERAL UNO"],
};
const unido = unirFormularios(guardado, escrito, base);

assert.deepEqual(unido.procedimientosUE, ["HGT", "Exámenes", "Rayos X", "GSA", "EKG"]);
assert.deepEqual(unido.notas, escrito.notas);
assert.deepEqual(unido.diagnosticos, guardado.diagnosticos);
assert.deepEqual(unido.medicosGenerales, ["GENERAL UNO"]);
assert.equal(unido.destino, "alta_voluntaria");

// Lo guardado manda; lo escrito solo llena lo que allá seguía vacío.
const distinto = unirFormularios(
  { ...base, triage: "rojo", staffEvalua: "" },
  { ...base, triage: "verde", staffEvalua: "STAFF DOS", destino: "ingreso" },
  base,
);
assert.equal(distinto.triage, "rojo");
assert.equal(distinto.staffEvalua, "STAFF DOS");
assert.equal(distinto.destino, "ingreso");

// Un valor por defecto no es un dato: "fallecido" no se pierde frente a "vivo",
// y una casilla marcada en cualquiera de los dos queda marcada.
assert.equal(unirFormularios(base, { ...base, condicion: "fallecido" }, base).condicion, "fallecido");
assert.equal(unirFormularios({ ...base, condicion: "fallecido" }, base, base).condicion, "fallecido");
assert.equal(unirFormularios(base, { ...base, ventilacionMecanica: true }, base).ventilacionMecanica, true);
assert.equal(unirFormularios({ ...base, ventilacionMecanica: true }, base, base).ventilacionMecanica, true);

// Una casilla que por defecto va marcada conserva el "no" guardado.
const conSis = { ...base, referenciaSis: true };
assert.equal(unirFormularios({ ...conSis, referenciaSis: false }, conSis, conSis).referenciaSis, false);

// La fecha y el turno de lo guardado no cambian aunque lo escrito traiga otros.
assert.equal(unido.fechaHora, "2026-11-06T21:15");
assert.equal(unido.turno, "t19_24");

// Unir dos veces no repite notas, diagnósticos ni procedimientos.
const otraVez = unirFormularios(unido, escrito, base);
assert.deepEqual(otraVez.notas, unido.notas);
assert.deepEqual(otraVez.procedimientosUE, unido.procedimientosUE);

// No toca los objetos de entrada.
assert.deepEqual(guardado.procedimientosUE, ["HGT"]);

console.log("OK: unión de censos");
