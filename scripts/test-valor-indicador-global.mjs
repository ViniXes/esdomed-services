import assert from "node:assert/strict";
import { valorIndicadorGlobal } from "../src/lib/valorIndicadorGlobal.ts";

const indicadores = [
  { id: 1, valor: 92 / 65 },
  { id: 2, valor: 1529 / 2015 * 100 },
  { id: 3, valor: 1499 / 92 },
  { id: 4, valor: 486 / 92 },
  { id: 5, valor: 0 },
  { id: 6, valor: null },
];
assert.equal(valorIndicadorGlobal(indicadores, 4), 486 / 92);
assert.equal(valorIndicadorGlobal(indicadores, 5), 0);
assert.equal(valorIndicadorGlobal(indicadores, 6), null);
assert.equal(valorIndicadorGlobal(indicadores, 99), null);
assert.equal(valorIndicadorGlobal([], 4), null);
console.log("5 escenarios de indicadores globales aprobados");
