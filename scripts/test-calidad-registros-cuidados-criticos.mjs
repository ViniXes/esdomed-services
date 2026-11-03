import assert from "node:assert/strict";
import { resumirCalidadRegistrosCuidadosCriticos } from "../src/lib/calidadRegistrosCuidadosCriticos.ts";

const ficha = (overrides = {}) => ({
  creadoPorId: "med-1",
  creadoPorNombre: "Dra. Uno",
  estadoEstancia: "egresada",
  datos: { alta: "ALTA", diagnostico_de_egreso_1: "J18.9 - Neumonia" },
  ...overrides,
});

const rows = resumirCalidadRegistrosCuidadosCriticos([
  ficha(),
  ficha({ id: "2", datos: { alta: "TRASLADO", diagnostico_de_egreso_1: "No registrado" } }),
  ficha({ id: "3", estadoEstancia: "activa", datos: { diagnostico_de_egreso_1: "No registrado" } }),
  ficha({ id: "4", creadoPorId: "med-2", creadoPorNombre: "Dr. Dos", datos: { fecha_de_muerte: "2026-10-01", diagnostico_de_egreso_1: "No registrado" } }),
].map(item => item));

assert.equal(rows.length, 2);
assert.deepEqual(rows.find(row => row.creadorId === "med-2"), {
  creadorId: "med-2",
  creadorNombre: "Dr. Dos",
  fichas: 1,
  estanciasCerradas: 1,
  cerradasConDiagnostico: 0,
  cerradasSinDiagnostico: 1,
});
assert.deepEqual(rows.find(row => row.creadorId === "med-1"), {
  creadorId: "med-1",
  creadorNombre: "Dra. Uno",
  fichas: 3,
  estanciasCerradas: 2,
  cerradasConDiagnostico: 1,
  cerradasSinDiagnostico: 1,
});

console.log("3 agrupaciones de calidad de registros aprobadas");
