import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const fuente = readFileSync(new URL("../src/lib/isbm/honorarios.ts", import.meta.url), "utf8");
const compilado = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const modulo = { exports: {} };
vm.runInNewContext(compilado, { module: modulo, exports: modulo.exports, require: createRequire(import.meta.url) });
const { resumirHonorarios } = modulo.exports;
const fila = (id, medico_tratante_nombre, total_cobrable_dia) => ({ id, medico_tratante_nombre, total_cobrable_dia });

const vacio = resumirHonorarios([]);
assert.equal(vacio.baseCentavos, 0);
assert.equal(vacio.medicos.length, 0);
assert.equal(vacio.completo, false);

const reparto = resumirHonorarios([fila(1,"Dra. Ana",50), fila(2,"Dra. Ana",30), fila(3,"Dr. Luis",20)]);
assert.equal(reparto.profesionalesCentavos,3000);
assert.equal(reparto.hospitalCentavos,7000);
assert.equal(reparto.medicos[0].estimadoCentavos,2000);
assert.equal(reparto.medicos[1].estimadoCentavos,1000);

for (let centavos = 0; centavos < 25; centavos++) {
  const resultado = resumirHonorarios(Array.from({length:7}, (_,i) => fila(i,`Médico ${i}`,i === 0 ? centavos / 100 : 0)));
  assert.equal(resultado.profesionalesCentavos + resultado.hospitalCentavos, centavos);
  assert.equal(resultado.medicos.reduce((s,m) => s + m.estimadoCentavos,0), resultado.profesionalesCentavos);
  assert.ok(resultado.medicos.every(m => m.estimadoCentavos >= 0 && Number.isInteger(m.estimadoCentavos)));
}

const incompleto = resumirHonorarios([fila(1,"Dra. Ana",50),fila(2,null,50)]);
assert.equal(incompleto.sinMedico,1);
assert.equal(incompleto.medicos[0].estimadoCentavos,null);
assert.equal(resumirHonorarios([fila(1,"Dra. Ana",null)]).medicos[0].estimadoCentavos,null);
const variantes = resumirHonorarios([fila(1," Dra.   ANA ",10),fila(2,"dra. ana",10)]);
assert.equal(variantes.medicos.length,1);
assert.equal(variantes.medicos[0].dias,2);
assert.equal(resumirHonorarios([fila(1,"Ana Pérez",10),fila(2,"Ana Perez",10)]).medicos.length,2);
console.log("Honorarios: reparto exacto, redondeo, datos incompletos y agrupación verificados.");
