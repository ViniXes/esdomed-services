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
const { aplicarAccion, accionesDe, compararCola, nombreConsultorio, normalizarEstado, agregarLlamado, quitarLlamadosDeCita } =
  cargar("circuito");
const paso = (estado, accion) => aplicarAccion(estado, accion)?.estado ?? null;
// Sin preconsulta en el sistema: de la espera se llama directo al consultorio.
assert.equal(paso("citado", "llego"), "espera");
assert.deepEqual(aplicarAccion("espera", "llamar"), { estado: "llamado", anuncia: true });
assert.deepEqual(aplicarAccion("llamado", "volver_a_llamar"), { estado: "llamado", anuncia: true });
assert.equal(paso("llamado", "paso_a_consulta"), "atendido");
assert.equal(paso("llamado", "no_respondio"), "no_respondio");
assert.equal(paso("no_respondio", "regreso"), "espera");
assert.equal(paso("llamado", "devolver_a_espera"), "espera");
assert.equal(paso("espera", "quitar_llegada"), "citado");
assert.equal(aplicarAccion("llamado", "paso_a_consulta").anuncia, undefined, "pasar a consulta no anuncia");
// Acciones fuera de lugar (otra computadora ya movió la cita): no aplican.
assert.equal(aplicarAccion("citado", "llamar"), null);
assert.equal(aplicarAccion("atendido", "no_respondio"), null);
assert.equal(aplicarAccion("espera", "llego"), null);
assert.equal(aplicarAccion("espera", "paso_a_consulta"), null, "hay que llamarlo antes");
// Estados de la primera versión (con preconsulta) se leen como los actuales.
assert.equal(normalizarEstado("llamado_preconsulta"), "llamado");
assert.equal(normalizarEstado("espera_consultorio"), "espera");
assert.equal(normalizarEstado("citado"), "citado");
assert.equal(paso("llamado_preconsulta", "paso_a_consulta"), "atendido");
assert.equal(paso("espera_preconsulta", "llamar"), "llamado");
// Cada acción ofrecida en un estado es aplicable en ese estado.
for (const estado of ["citado", "espera", "llamado", "no_respondio", "atendido", "llamado_preconsulta"]) {
  for (const accion of accionesDe(estado)) assert.ok(aplicarAccion(estado, accion), `${estado} → ${accion}`);
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
assert.equal(nombreConsultorio("Cirugia Torax - 1"), "Consultorio 1 de Cirugía de Tórax");

// ── Llamado por expediente y nombre, a la estación (desde 2026-11-17) ──
const { nombreParaLlamado, limpiarExpediente, idLlamadoManual, destinoEstacion, tituloLlamado } = cargar("circuito");
assert.equal(nombreParaLlamado("López Gonzales, María Pilar"), "María Pilar López Gonzales", "el SIS escribe Apellidos, Nombres");
assert.equal(nombreParaLlamado("DE LEÓN MARTÍNEZ, JOSÉ ANTONIO"), "José Antonio de León Martínez", "mayúsculas → nombre propio");
assert.equal(nombreParaLlamado("  ana   maría  pérez "), "Ana María Pérez", "escrito a mano en minúsculas");
assert.equal(nombreParaLlamado("Ana María Pérez"), "Ana María Pérez", "lo que ya viene bien no se toca");
assert.equal(nombreParaLlamado("María José McDonald"), "María José McDonald", "caja mixta se respeta");
assert.equal(nombreParaLlamado("RUIZ-LÓPEZ, ANA"), "Ana Ruiz-López", "apellido compuesto con guion");
assert.equal(nombreParaLlamado(nombreParaLlamado("PÉREZ, JUAN")), "Juan Pérez", "idempotente");
assert.equal(limpiarExpediente(" 11431 - 26 "), "11431-26");
assert.equal(idLlamadoManual("cardiologia", "11431 -26"), "manual:cardiologia:11431-26");
// Solo por nombre (expediente opcional, 2026-11-18): se identifica por el nombre, sin tildes ni mayúsculas.
assert.equal(idLlamadoManual("cardiologia", "", "PÉREZ, José Ñandú"), "manual:cardiologia:nombre:jose-nandu-perez");
assert.equal(idLlamadoManual("cardiologia", "  ", "José Ñandú Pérez"), idLlamadoManual("cardiologia", "", "jose ñandu perez"));
assert.notEqual(idLlamadoManual("cardiologia", "", "Ana López"), idLlamadoManual("cardiologia", "", "Rosa Rivas"));
assert.equal(idLlamadoManual("cardiologia", "778-26", "Ana López"), "manual:cardiologia:778-26", "con expediente manda el expediente");
assert.equal(destinoEstacion("cardiologia"), "Estación Cardiología");
assert.equal(destinoEstacion("infectologia"), "Estación Infectología");
assert.equal(tituloLlamado({ paciente: "Ana Pérez", codigo: "CA-01" }), "Ana Pérez");
assert.equal(tituloLlamado({ codigo: "CA-01" }), "CA-01", "llamados anteriores: el código");

const { textoLlamado } = cargar("voz");
assert.equal(
  textoLlamado({ expediente: "11431-26", paciente: "María Pilar López Gonzales", destino: "Estación Hematología" }),
  "Expediente 11431 guion 26, María Pilar López Gonzales. Acercarse a estación Hematología.",
);
assert.equal(textoLlamado({ paciente: "Ana Pérez", destino: "Estación Cardiología" }), "Ana Pérez. Acercarse a estación Cardiología.");
assert.equal(textoLlamado({ codigo: "HE-12", destino: "Consultorio 4 de Hematología" }), "Turno H E 12. Acercarse a consultorio 4 de Hematología.");
{
  // Una pantalla sin voz deja cada llamado en grande lo que tardaría leerse (aviso + 3 lecturas).
  const { duracionLlamadoMs } = cargar("voz");
  const d = duracionLlamadoMs("Expediente 11431 guion 26, María Pilar López Gonzales. Acercarse a estación Cardiología.");
  assert.ok(d > 15_000 && d < 35_000, `duración razonable: ${d} ms`);
  assert.ok(duracionLlamadoMs("Ana.") < d, "un texto corto dura menos");
}

// ── Voz: El Salvador primero, nunca una voz que no sea en español ──
const { ordenarVoces, elegirVoz, nombreCortoVoz } = cargar("voz");
const VOCES = [
  { name: "Microsoft Ava Multilingual Online (Natural) - English (United States)", lang: "en-US" },
  { name: "Microsoft Sabina - Spanish (Mexico)", lang: "es-MX" },
  { name: "Microsoft Dalia Online (Natural) - Spanish (Mexico)", lang: "es-MX" },
  { name: "Microsoft Rodrigo Online (Natural) - Spanish (El Salvador)", lang: "es-SV" },
  { name: "Microsoft Lorena Online (Natural) - Spanish (El Salvador)", lang: "es-SV" },
];
const ordenadas = ordenarVoces(VOCES);
assert.equal(ordenadas[0].name, "Microsoft Lorena Online (Natural) - Spanish (El Salvador)");
assert.equal(ordenadas.at(-1).name, "Microsoft Sabina - Spanish (Mexico)", "las de escritorio, al final");
assert.ok(!ordenadas.some((v) => v.lang.startsWith("en")), "sin voces en inglés");
assert.equal(elegirVoz(ordenadas, "Microsoft Dalia Online (Natural) - Spanish (Mexico)").lang, "es-MX", "respeta la elegida");
assert.equal(elegirVoz(ordenadas, "Voz que ya no existe").lang, "es-SV", "si ya no está, la recomendada");
assert.equal(elegirVoz([], "x"), null);
assert.equal(nombreCortoVoz("Microsoft Lorena Online (Natural) - Spanish (El Salvador)"), "Lorena (El Salvador)");
assert.equal(nombreCortoVoz("Microsoft Sabina - Spanish (Mexico)"), "Sabina (Mexico)");
assert.equal(nombreCortoVoz("Google español de Estados Unidos"), "Google español de Estados Unidos");

// ── Diccionario de pronunciación ──
const { aplicarPronunciacion, palabraValida, reglasDeMapa } = cargar("pronunciacion");
const reglas = [{ escrito: "Jennifer", leido: "Yénifer" }, { escrito: "Kevin", leido: "Kébin" }];
assert.equal(
  aplicarPronunciacion("Expediente 1234 guion 26, Jennifer Kevin Pérez. Acercarse a estación Cardiología.", reglas),
  "Expediente 1234 guion 26, Yénifer Kébin Pérez. Acercarse a estación Cardiología.",
);
assert.equal(aplicarPronunciacion("JENNIFER y Jénnifer", reglas), "Yénifer y Yénifer", "sin importar mayúsculas ni tildes");
assert.equal(aplicarPronunciacion("Kevinson", reglas), "Kevinson", "solo palabras completas");
assert.equal(aplicarPronunciacion("Ana", []), "Ana");
assert.ok(palabraValida("Jennifer"));
assert.ok(palabraValida("O'Brien"));
assert.equal(palabraValida("Ana María"), false, "una sola palabra");
assert.equal(palabraValida("J"), false);
assert.deepEqual(
  reglasDeMapa({ kevin: { escrito: "Kevin", leido: "Kébin" }, brenda: { escrito: "Brenda", leido: "Brenda" }, rota: { escrito: "", leido: "x" } }).map((r) => r.escrito),
  ["Brenda", "Kevin"],
);

// Lista de la pantalla: lo nuevo arriba, un "volver a llamar" no se duplica, máximo 8.
const ll = (id, citaId) => ({ id, citaId, codigo: citaId, destino: "x", estacionId: "cardiologia", enMs: 0 });
let lista = [];
for (let i = 1; i <= 9; i++) lista = agregarLlamado(lista, ll(`l${i}`, `c${i}`));
assert.equal(lista.length, 8);
assert.equal(lista[0].id, "l9");
lista = agregarLlamado(lista, ll("l10", "c5"));
assert.equal(lista[0].id, "l10");
assert.equal(lista.filter((l) => l.citaId === "c5").length, 1);
assert.equal(quitarLlamadosDeCita(lista, "c5").some((l) => l.citaId === "c5"), false);

// Turnos de la pantalla (2026-11-19): lo quitado a propósito deja su turno; lo
// que solo salió por el tope de 8 lo conserva.
{
  const { quitadoDeLaLista } = cargar("circuito");
  const t = (id, citaId, enMs) => ({ ...ll(id, citaId), enMs });
  let l8 = [];
  for (let i = 1; i <= 8; i++) l8 = agregarLlamado(l8, t(`t${i}`, `c${i}`, i * 1000));
  assert.equal(quitadoDeLaLista(t("t5", "c5", 5000), l8), false, "sigue en la lista");
  assert.equal(quitadoDeLaLista(t("t5", "c5", 5000), quitarLlamadosDeCita(l8, "c5")), true, "Quitar de la pantalla");
  assert.equal(quitadoDeLaLista(t("t5", "c5", 5000), []), true, "Limpiar pantallas");
  assert.equal(quitadoDeLaLista(t("t5", "c5", 5000), agregarLlamado(l8, t("t9", "c5", 9000))), true, "Volver a llamar lo reemplaza");
  const empujada = agregarLlamado(l8, t("t9", "c9", 9000));
  assert.equal(empujada.some((l) => l.id === "t1"), false);
  assert.equal(quitadoDeLaLista(t("t1", "c1", 1000), empujada), false, "lo empujó el tope: conserva su turno");
}

// ── Consultorio elegido por la estación (2026-11-18) ──
{
  const { destinoConsultorio, destinoDelLlamado, consultoriosDeCitas, claveColaMedico } = cargar("circuito");
  assert.equal(destinoConsultorio("Cardiologia - 3"), "Consultorio 3 de Cardiología", "el del SIS");
  assert.equal(destinoConsultorio("7"), "Consultorio 7", "escrito: solo el número");
  assert.equal(destinoConsultorio("  consultorio   7b "), "Consultorio 7b");
  assert.equal(destinoConsultorio("Sala de procedimientos"), "Consultorio Sala de procedimientos");
  assert.equal(destinoConsultorio("   "), "");
  assert.equal(destinoDelLlamado("cardiologia"), "Estación Cardiología", "sin elegir: a la estación");
  assert.equal(destinoDelLlamado("cardiologia", ""), "Estación Cardiología");
  assert.equal(destinoDelLlamado("hematologia", "Hematologia - 5"), "Consultorio 5 de Hematología");
  assert.deepEqual(
    consultoriosDeCitas([{ consultorio: "Hematologia - 10" }, { consultorio: "Hematologia - 2" }, { consultorio: "Hematologia - 2" }, { consultorio: "" }]),
    ["Hematologia - 2", "Hematologia - 10"],
  );
  assert.equal(claveColaMedico({ medico: "Ana", consultorio: "Cardiologia - 1" }), "Ana|Cardiologia - 1");
  assert.equal(
    textoLlamado({ expediente: "11431-26", paciente: "María López", destino: destinoDelLlamado("cardiologia", "Cardiologia - 3") }),
    "Expediente 11431 guion 26, María López. Acercarse a consultorio 3 de Cardiología.",
  );
}

assert.equal(
  textoLlamado({ paciente: "Ana López", destino: "Estación Cardiología" }),
  "Ana López. Acercarse a estación Cardiología.",
  "solo por nombre: no dice expediente",
);

// ── Quién abre la pantalla de llamados ──
const acceso = cargar("../accesoConsultaExterna");
const conRol = (role) => ({ role });
assert.ok(acceso.veLaPantallaCE(conRol("pantalla_ce")), "la cuenta de la TV abre la pantalla");
assert.equal(acceso.entraConsultaExterna(conRol("pantalla_ce")), false, "pero no el resto del subsistema");
assert.ok(acceso.veLaPantallaCE(conRol("consulta_externa")));
assert.ok(acceso.veLaPantallaCE(conRol("admin")));
assert.equal(acceso.veLaPantallaCE(conRol("medico")), false);
assert.equal(acceso.veLaPantallaCE(conRol("agenda_ce")), false, "agenda_ce no lee los llamados");
assert.equal(acceso.veLaPantallaCE(null), false);
// Limpiar las pantallas: solo el admin (pedido del usuario, 2026-11-18).
assert.ok(acceso.limpiaPantallasCE(conRol("admin")));
for (const r of ["esdomed", "asistente_esdomed", "consulta_externa", "pantalla_ce", "agenda_ce"]) {
  assert.equal(acceso.limpiaPantallasCE(conRol(r)), false, r);
}
// Mensajes a pantalla: la cuenta general, las estaciones y gestión; la cuenta general no entra a nada más.
for (const r of ["mensajes_ce", "consulta_externa", "admin"]) assert.ok(acceso.enviaMensajesCE(conRol(r)), r);
for (const r of ["pantalla_ce", "agenda_ce", "medico", "esdomed"]) assert.equal(acceso.enviaMensajesCE(conRol(r)), false, r);
assert.equal(acceso.entraConsultaExterna(conRol("mensajes_ce")), false, "la cuenta de mensajes no abre el subsistema");
assert.equal(acceso.veLaPantallaCE(conRol("mensajes_ce")), false, "ni la pantalla de las TVs");

// ── Mensajes a pantalla (cuenta general mensajes_ce, 2026-11-18) ──
{
  const c = cargar("circuito");
  assert.equal(c.textoParaPantalla("  MARIA   LOPEZ  "), "Maria Lopez", "todo en mayúsculas pasa a nombre propio");
  assert.equal(c.textoParaPantalla("familiares de jose perez, pasar a la ventanilla"), "Familiares de Jose Perez, Pasar a la Ventanilla");
  assert.equal(c.textoParaPantalla("María López"), "María López", "lo escrito con mayúsculas y minúsculas no se toca");
  assert.equal(c.textoParaPantalla("Ana, López"), "Ana, López", "un mensaje no se reordena como el nombre del SIS");
  assert.equal(c.textoParaPantalla("x".repeat(120)).length, c.MAX_MENSAJE_PANTALLA);
  assert.equal(c.idMensajePantalla("MARÍA López "), c.idMensajePantalla("maria lopez"), "el mismo texto reemplaza su entrada");
  assert.notEqual(c.idMensajePantalla("Ana López"), c.idMensajePantalla("Rosa Rivas"));
  assert.equal(c.destinoConsultorioDe("cardiologia", "3"), "Consultorio 3 de Cardiología");
  assert.equal(c.destinoConsultorioDe("oncologia", " consultorio 2 "), "Consultorio 2 de Oncología");
  assert.equal(c.destinoConsultorioDe("cardiologia", ""), "", "sin número no hay destino");
  assert.equal(c.destinoConsultorioDe("", "3"), "", "sin especialidad no hay destino");
  assert.equal(c.destinoSignosVitales("cardiologia"), "Toma de signos vitales de Cardiología");
  assert.equal(c.destinoSignosVitales(""), "", "signos vitales pide la especialidad");
  assert.equal(c.destinoEstacionDe("oncologia"), "Estación Oncología");
  assert.equal(c.destinoEstacionDe("cirugia_torax"), "Estación Cardiología", "Cirugía de Tórax la atiende la estación de Cardiología");
  assert.equal(c.destinoEstacionDe(""), "");
  // Flujo obligatorio: no se envía hasta tener todos los pasos.
  const sin = { indicacion: "", especialidadId: "", numero: "" };
  assert.equal(c.pasoPendienteMensaje(" ", sin), "texto");
  assert.equal(c.pasoPendienteMensaje("Ana López", sin), "destino");
  assert.equal(c.pasoPendienteMensaje("Ana López", { ...sin, indicacion: "signos" }), "especialidad");
  assert.equal(c.pasoPendienteMensaje("Ana López", { ...sin, indicacion: "signos", especialidadId: "oncologia" }), "");
  assert.equal(c.pasoPendienteMensaje("Ana López", { ...sin, indicacion: "consultorio", especialidadId: "oncologia" }), "numero");
  assert.equal(c.pasoPendienteMensaje("Ana López", { indicacion: "consultorio", especialidadId: "oncologia", numero: "2" }), "");
  assert.equal(c.pasoPendienteMensaje("Ana López", { ...sin, indicacion: "estacion", especialidadId: "cirugia_torax" }), "");
  assert.equal(c.destinoMensaje({ ...sin, indicacion: "estacion", especialidadId: "cirugia_torax" }), "Estación Cardiología");
  // Trabajo Social no lleva especialidad; "Texto libre" hay que elegirlo y no lleva destino.
  assert.equal(c.pasoPendienteMensaje("Ana López", { ...sin, indicacion: "trabajo_social" }), "");
  assert.equal(c.destinoMensaje({ ...sin, indicacion: "trabajo_social", especialidadId: "oncologia" }), "Trabajo Social");
  assert.equal(c.pasoPendienteMensaje("Ana López", { ...sin, indicacion: "libre" }), "");
  assert.equal(c.destinoMensaje({ indicacion: "libre", especialidadId: "oncologia", numero: "2" }), "", "texto libre: solo el mensaje");
  assert.equal(c.pasoPendienteMensaje(" ", { ...sin, indicacion: "libre" }), "texto", "texto libre igual pide el texto");
  // Solo números (un expediente sin elegir al paciente): falta el nombre, aun con destino completo.
  const completo = { indicacion: "estacion", especialidadId: "oncologia", numero: "" };
  for (const t of ["11431-26", "11431 26", "1143126", "12", " 11431/26 "]) {
    assert.equal(c.pasoPendienteMensaje(t, completo), "nombre", t);
    assert.equal(c.pasoPendienteMensaje(t, { ...sin, indicacion: "libre" }), "nombre", `${t} (texto libre)`);
  }
  assert.equal(c.pasoPendienteMensaje("11431-26 Ana López", completo), "", "con el nombre, el número puede ir");
  assert.equal(c.pasoPendienteMensaje("Ñ1", completo), "", "una letra con tilde o eñe cuenta");
  assert.equal(c.pasoPendienteMensaje("12", sin), "nombre", "el nombre se pide antes que el destino");
  for (const i of ["signos", "consultorio", "estacion"]) assert.equal(c.pideEspecialidad(i), true, i);
  for (const i of ["", "trabajo_social", "libre"]) assert.equal(c.pideEspecialidad(i), false, i);
  assert.equal(textoLlamado({ paciente: "Rosa Cruz", destino: c.DESTINO_TRABAJO_SOCIAL }), "Rosa Cruz. Acercarse a trabajo Social.");
  assert.equal(textoLlamado({ paciente: "Rosa Cruz", destino: c.destinoEstacionDe("hematologia") }), "Rosa Cruz. Acercarse a estación Hematología.");
  const m = c.crearMensajePantalla({ texto: "rosa cruz", destino: " Toma de signos vitales de Hematología ", porNombre: "Mensajes CE" }, 1000);
  assert.deepEqual(m, {
    id: `${c.idMensajePantalla("rosa cruz")}#1000`,
    citaId: c.idMensajePantalla("rosa cruz"),
    paciente: "Rosa Cruz",
    destino: "Toma de signos vitales de Hematología",
    enMs: 1000,
    manual: true,
    mensaje: true,
    porNombre: "Mensajes CE",
  }, "sin expediente ni estación: Firestore no acepta undefined en el arreglo");
  // Paciente elegido de la agenda: lleva su expediente y se agrupa por él.
  const conExp = c.crearMensajePantalla({ texto: "María López", destino: "", porNombre: "speaker", expediente: " 11431 - 26 " }, 5);
  assert.equal(conExp.expediente, "11431-26");
  assert.equal(conExp.citaId, "mensaje:exp:11431-26");
  assert.equal(
    c.crearMensajePantalla({ texto: "Maria Lopez G.", destino: "", porNombre: "s", expediente: "11431-26" }).citaId,
    conExp.citaId,
    "corregir el nombre no duplica al paciente en la pantalla",
  );
  assert.equal("expediente" in m, false);
  assert.equal(textoLlamado(conExp), "Expediente 11431 guion 26, María López.");
  assert.equal(textoLlamado({ paciente: "Rosa Cruz", destino: "" }), "Rosa Cruz.", "sin destino solo se lee el mensaje");
  assert.equal(textoLlamado({ paciente: "¿Quién olvidó una sombrilla?", destino: "" }), "¿Quién olvidó una sombrilla?");
  assert.equal(
    textoLlamado({ paciente: "Rosa Cruz", destino: c.destinoSignosVitales("oncologia") }),
    "Rosa Cruz. Acercarse a toma de signos vitales de Oncología.",
  );
  // Los consultorios que se eligen con un toque salen del catálogo de agendas.
  const { ESPECIALIDADES_CE, resolverEspecialidad: resolver } = cargar("especialidades");
  const semilla = JSON.parse(readFileSync(new URL("../src/lib/consultaExterna/catalogoCitasSemilla.json", import.meta.url), "utf8"));
  const porEspecialidad = {};
  for (const k of semilla.consultorios) {
    const e = resolver(k.especialidad);
    assert.ok(e, `especialidad del catálogo: ${k.especialidad}`);
    const n = Number(String(k.nombre).match(/-\s*(\d+)$/)?.[1]);
    porEspecialidad[e.id] = Math.max(porEspecialidad[e.id] ?? 0, n);
  }
  for (const e of ESPECIALIDADES_CE) assert.equal(e.consultorios, porEspecialidad[e.id] ?? 0, `consultorios de ${e.nombre}`);
}

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
