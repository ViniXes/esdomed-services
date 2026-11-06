// Comprueba el cálculo del resumen mensual de los censos de emergencia.
// Uso: node scripts/test-resumen-censos.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const fuente = readFileSync(new URL("../src/lib/emergencia/resumenCenso.ts", import.meta.url), "utf8");
const compilado = ts.transpileModule(fuente, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const modulo = { exports: {} };
new Function("exports", "module", compilado)(modulo.exports, modulo);
const {
  comparacionMensual, construirResumen, contribucion, deltaResumen, mesesDelTablero, serieDiaria,
  sumarResumenes,
} = modulo.exports;

const demanda = (extra = {}) => ({
  fecha: new Date("2026-11-06T15:00:00-06:00"),
  estadoRegistro: "cerrado", camposFaltantes: [], turno: "t07_15", edad: 45, genero: "femenino",
  triage: "rojo", condicion: "vivo", especialidad: "Pediatría", traeReferencia: false, destino: "alta",
  staffEvalua: "CIRUGÍA", evaluadoPor: "especialidad", reevaluacion: null, ventilacionMecanica: false,
  consulta48h: false, aseguradoIsss: true, empleadoHes: false, procedimientosUE: ["EKG", "TAC"],
  medicosGenerales: ["ANA RUIZ", "CARDIOLOGÍA"],
  diagnosticos: [{ codigo: "J18.9", descripcion: "Neumonía" }],
  ...extra,
});
const conteo = (c, dim) => c.pares.filter(([d]) => d === dim).map(([, k]) => k);

// Noviembre cuenta; lo anterior fueron pruebas.
assert.equal(contribucion("demanda", demanda({ fecha: new Date("2026-10-31T23:00:00-06:00") })), null);
assert.equal(contribucion("demanda", demanda({ fecha: new Date("2026-11-01T00:00:00-06:00") })).mes, "2026-11");
// La hora de El Salvador manda: esto en UTC ya es noviembre, aquí sigue siendo octubre.
assert.equal(contribucion("demanda", demanda({ fecha: new Date("2026-11-01T03:00:00Z") })), null);
// Timestamp de Firestore.
assert.equal(contribucion("demanda", demanda({ fecha: { toDate: () => new Date("2026-11-06T15:00:00-06:00") } })).mes, "2026-11");

const c = contribucion("demanda", demanda());
assert.deepEqual(conteo(c, "evaluaEspecialidad"), ["CIRUGÍA"]);
assert.deepEqual(conteo(c, "evaluaPersona"), []);
assert.deepEqual(conteo(c, "medicosTurno"), ["ANA RUIZ", "CARDIOLOGÍA"]);
assert.deepEqual(conteo(c, "procedimiento"), ["EKG", "TAC"]);
assert.deepEqual(conteo(c, "diagnostico"), ["J18.9 · Neumonía"]);
assert.deepEqual(conteo(c, "edadSexo"), ["40-49|femenino"]);
assert.deepEqual(conteo(c, "dia"), ["06"]);
assert.deepEqual(conteo(c, "reevaluacion"), ["no_aplica"]);
assert.deepEqual(conteo(c, "lugarReferencia"), [], "sin referencia no cuenta lugar");
assert.deepEqual(conteo(c, "servicioIngresar"), [], "alta no cuenta servicio");

// Un registro a medio llenar cuenta como Sin dato y dice qué le falta.
const abierto = contribucion("demanda", demanda({
  estadoRegistro: "abierto", camposFaltantes: ["destino", "triage"], triage: null, destino: null,
  genero: null, edad: null, staffEvalua: "", evaluadoPor: null, diagnosticos: [], procedimientosUE: [],
}));
assert.deepEqual(conteo(abierto, "triage"), ["sin_dato"]);
assert.deepEqual(conteo(abierto, "destino"), ["sin_dato"]);
assert.deepEqual(conteo(abierto, "edadSexo"), ["sin_dato|sin_dato"]);
assert.deepEqual(conteo(abierto, "evaluaPersona"), ["sin_dato"]);
assert.deepEqual(conteo(abierto, "procedimiento"), ["ninguno"]);
assert.deepEqual(conteo(abierto, "faltante"), ["destino", "triage"]);

// Campos que dependen de otro.
const ingreso = contribucion("demanda", demanda({ destino: "ingreso", servicioIngresar: "Medicina Interna Hombres 1", traeReferencia: true, lugarReferencia: "HN Zacamil", empleadoHes: true, dependencia: "Enfermería" }));
assert.deepEqual(conteo(ingreso, "servicioIngresar"), ["Medicina Interna Hombres 1"]);
assert.deepEqual(conteo(ingreso, "lugarReferencia"), ["HN Zacamil"]);
assert.deepEqual(conteo(ingreso, "dependencia"), ["Enfermería"]);

const referido = {
  fecha: new Date("2026-11-06T15:00:00-06:00"), estadoRegistro: "cerrado", turno: "t19_24", edad: 70,
  genero: "masculino", hospitalReferencia: "HN Zacamil", clasificacionSis: "OTROS HOSP CON REF SIS",
  condicion: "inestable", dispositivoO2: "VM", discrepanciaDiagnostico: "si", modificacionServicio: "no",
  servicioIngreso: "Fallece en emergencia", tiempoPermanencia: "> 2 horas", razonDemora: "Disponibilidad de cama",
  staffEvalua: "JUAN PEREZ", evaluadoPor: "staff", procedimientosUE: [], diagnosticos: [],
};
const cr = contribucion("referidos", referido);
assert.deepEqual(conteo(cr, "razonDemora"), ["Disponibilidad de cama"]);
assert.deepEqual(conteo(cr, "edadSexo"), ["60+|masculino"]);
assert.deepEqual(conteo(contribucion("referidos", { ...referido, tiempoPermanencia: "< 1 hora" }), "razonDemora"), []);

// Crear suma todo.
const nuevo = deltaResumen("demanda", null, demanda());
assert.equal(nuevo["2026-11"].total, 1);
assert.equal(nuevo["2026-11"].conteos.triage.rojo, 1);

// Editar resta lo viejo y suma lo nuevo: el total no cambia.
const edicion = deltaResumen("demanda", demanda(), demanda({ triage: "verde" }))["2026-11"];
assert.equal(edicion.total, 0);
assert.deepEqual(edicion.conteos, { triage: { rojo: -1, verde: 1 } });

// Editar sin tocar nada que cuente no escribe en el resumen.
assert.deepEqual(deltaResumen("demanda", demanda(), demanda()), {});

// Registro de prueba de octubre: ni crearlo ni editarlo toca el resumen.
const octubre = { fecha: new Date("2026-10-10T10:00:00-06:00") };
assert.deepEqual(deltaResumen("demanda", demanda(octubre), demanda({ ...octubre, triage: "verde" })), {});

// Cambiar la fecha de mes mueve el registro.
const movido = deltaResumen("demanda", demanda(), demanda({ fecha: new Date("2026-12-02T10:00:00-06:00") }));
assert.equal(movido["2026-11"].total, -1);
assert.equal(movido["2026-12"].total, 1);

// Editar con deltas da lo mismo que reconstruir desde cero.
const registros = [demanda(), demanda({ triage: "verde", genero: "masculino" }), demanda({ destino: "ingreso", servicioIngresar: "UCI" })];
const reconstruido = construirResumen("demanda", "2026-11", registros);
assert.equal(reconstruido.total, 3);
const editado = registros.map((r, i) => (i === 0 ? { ...r, triage: "amarillo" } : r));
const acumulado = sumarResumenes([reconstruido, deltaResumen("demanda", registros[0], editado[0])["2026-11"]]);
assert.deepEqual(acumulado, sumarResumenes([construirResumen("demanda", "2026-11", editado)]));

// Series y periodos.
assert.deepEqual(mesesDelTablero("2027-01"), ["2027-01", "2026-12", "2026-11"]);
assert.equal(serieDiaria({ dia: { "02": 5 } }, "2026-11", "2026-11-06").length, 6);
assert.equal(serieDiaria({ dia: {} }, "2026-11", "2026-12-15").length, 30);
assert.equal(serieDiaria({ dia: { "02": 5 } }, "2026-11", "2026-11-06")[1].valor, 5);

// Comparación: el mes en curso se mide contra los mismos días del anterior.
const nov = { mes: "2026-11", total: 300, conteos: { dia: { "01": 10, "02": 10, "20": 280 } } };
const dic = { mes: "2026-12", total: 30, conteos: { dia: { "01": 15, "02": 15 } } };
assert.deepEqual(comparacionMensual([nov, dic], "2026-12", "2026-12-02"), { mesPrevio: "2026-11", enCurso: true, cambioPct: 50 });
assert.equal(comparacionMensual([nov, dic], "2026-12", "2027-01-10").cambioPct, -90);
assert.equal(comparacionMensual([nov], "2026-11", "2026-11-06"), null, "noviembre no tiene con qué compararse");

console.log("resumen de censos: OK");
