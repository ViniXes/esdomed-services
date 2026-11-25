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
const elegibles = m.TIPOS_GESTION_TS_CE.filter((t) => !t.automatica).map((t) => t.id);
assert.equal(m.gruposDeTipos("cardiologia").flatMap((g) => g.tipos).length, elegibles.length, "el área no bloquea ningún tipo");

// ── La gestión que deja el directorio no se elige ni se registra a mano ──
assert.ok(m.esAutomatica(m.TIPO_ACTUALIZACION_DATOS) && !m.esAutomatica("receta"));
assert.ok(!elegibles.includes(m.TIPO_ACTUALIZACION_DATOS), "no sale en el asistente");
assert.deepEqual(m.filtrarTipos("actualizacion de datos").flatMap((g) => g.tipos), [], "tampoco al buscarla");
assert.ok(!m.validarGestion({ tipo: m.TIPO_ACTUALIZACION_DATOS, area: "cardiologia" }).ok, "ni se registra ni se corrige a mano");
assert.equal(m.labelTipo(m.TIPO_ACTUALIZACION_DATOS), "Actualización de datos del paciente");
assert.equal(m.areaSugerida(m.TIPO_ACTUALIZACION_DATOS, "oncologia", "cardiologia"), "hemato_onco", "cuenta en el área del paciente");

// ── Área: del tipo, luego de la especialidad, luego de la cuenta ──
assert.equal(m.areaSugerida("marcapaso", "hematologia", "hemato_onco"), "cardiologia");
assert.equal(m.areaSugerida("receta", "cirugia_torax", "hemato_onco"), "cardiologia");
assert.equal(m.areaSugerida("receta", "oncologia", "cardiologia"), "hemato_onco");
assert.equal(m.areaSugerida("receta", "infectologia", "cardiologia"), "otra");
assert.equal(m.areaSugerida("receta", "", "cardiologia"), "cardiologia");

// ── El área solo se pregunta si no se puede saber ──
assert.ok(m.pideArea("receta", ""), "común + paciente sin especialidad");
assert.ok(!m.pideArea("receta", "cardiologia"), "sale de la especialidad");
assert.ok(!m.pideArea("marcapaso", ""), "sale del tipo");

// ── Buscador de tipos ──
assert.equal(m.filtrarTipos("", "cardiologia").flatMap((g) => g.tipos).length, ids.length - 1, "sin texto, todos los que se eligen");
assert.deepEqual(m.filtrarTipos("constancia", "cardiologia").flatMap((g) => g.tipos.map((t) => t.id)), ["constancia_medica", "constancia_permanencia"]);
assert.deepEqual(m.filtrarTipos("TRAMITE  marcapaso").flatMap((g) => g.tipos.map((t) => t.id)), ["marcapaso"], "cada palabra, sin tildes");
assert.deepEqual(m.filtrarTipos("medico cambio").flatMap((g) => g.tipos.map((t) => t.id)), ["cambio_medico"], "en cualquier orden");
assert.deepEqual(m.filtrarTipos("xyz"), [], "los grupos vacíos no salen");
assert.equal(m.tituloGestion({ tipo: "cita_estudio", detalle: "holter" }), "Cita o estudio: Holter");
assert.equal(m.tituloGestion({ tipo: "receta", detalle: "" }), "Trámite de receta");

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
assert.equal(r.delDirectorio, 0);
const conDirectorio = m.resumirTS("2026-11", {
  ...datos,
  gestiones: [...datos.gestiones, g({ id: "g5", tipo: m.TIPO_ACTUALIZACION_DATOS, estado: "finalizada", fecha: "2026-11-20", fechaCierre: "2026-11-20", ultimaNotaFecha: "2026-11-20", clave: "300-26" })],
}, HOY);
assert.deepEqual([conDirectorio.nuevas, conDirectorio.delDirectorio, conDirectorio.finalizadas], [3, 1, 2], "la actualización de datos cuenta como gestión nueva y finalizada");
assert.equal(conDirectorio.porTipo.find((x) => x.id === m.TIPO_ACTUALIZACION_DATOS).nuevas, 1, "y sale en su propio renglón");
assert.equal(m.finDeMes("2028-02"), "2028-02-29");

// ── Directorio ──
// El módulo importa el catálogo y la división política: se enlazan con un require mínimo.
function transpilar(ruta, requerir) {
  const codigo = ts.transpileModule(readFileSync(new URL(ruta, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("exports", "module", "require", codigo)(mod.exports, mod, requerir);
  return mod.exports;
}
const division = transpilar("../src/lib/divisionPolitica.ts", () => ({}));
const d = transpilar("../src/lib/consultaExterna/trabajoSocialDirectorio.ts", (r) => (r === "./trabajoSocial" ? m : r === "@/lib/divisionPolitica" ? division : {}));

assert.equal(d.idDirectorio("nom:PEREZ, JOSE"), "nom%3APEREZ%2C%20JOSE", "la clave sirve de id aunque traiga comas");
assert.equal(d.normalizarTelefono("7123 4567"), "7123-4567");
assert.equal(d.normalizarTelefono("+503 7123-4567"), "7123-4567", "el código de El Salvador se quita");
assert.equal(d.normalizarTelefono("+502 1234 5678"), "+50212345678", "el de otro país se conserva");
assert.equal(d.normalizarTelefono(""), "");
assert.equal(d.normalizarTelefono("12345"), null);

const ficha = (x) => d.validarFicha({ telefono: "71234567", ...x }, HOY);
assert.ok(ficha({}).ok);
assert.equal(ficha({}).datos.telefono, "7123-4567");
assert.equal(ficha({}).datos.residencia, "sv");
assert.ok(!d.validarFicha({}, HOY).ok, "vacía no se guarda");
assert.ok(!d.validarFicha({ nacionalidad: "Salvadoreña", residencia: "sv" }, HOY).ok, "lo marcado de entrada no cuenta como dato");
assert.ok(d.validarFicha({ nacionalidad: "Hondureña" }, HOY).ok, "otra nacionalidad sí es un dato");
assert.ok(!ficha({ telefono: "123" }).ok);
assert.ok(!ficha({ correo: "ana@" }).ok);
assert.equal(ficha({ correo: " Ana@Correo.COM " }).datos.correo, "ana@correo.com");
assert.equal(ficha({ telefono: "", telefono2: "22220000" }).datos.telefono, "2222-0000", "el único teléfono queda de principal");
assert.equal(ficha({ telefono2: "7123-4567" }).datos.telefono2, "", "el mismo número dos veces se guarda una");

// Documento
assert.ok(!ficha({ documentoNumero: "A123" }).ok, "número sin tipo");
assert.ok(!ficha({ documentoTipo: "dui", documentoNumero: "123" }).ok);
assert.equal(ficha({ documentoTipo: "dui", documentoNumero: "004188606" }).datos.documentoNumero, "00418860-6");
assert.equal(ficha({ documentoTipo: "pasaporte", documentoNumero: " a 123456 " }).datos.documentoNumero, "A 123456");
assert.equal(ficha({ documentoTipo: "pasaporte" }).datos.documentoTipo, "", "tipo sin número no dice nada");
assert.deepEqual(d.fichaSugerida({ dui: "00418860-6" }).documentoTipo, "dui", "el DUI de la cita se ofrece");
assert.equal(d.fichaSugerida({ dui: "" }).documentoTipo, "");
const soloDui = d.fichaSugerida({ dui: "00418860-6" });
assert.ok(!d.validarFicha(soloDui, HOY, { duiDeCita: "00418860-6" }).ok, "repetir el DUI de la cita no es completar la ficha");
assert.ok(d.validarFicha(soloDui, HOY, { duiDeCita: "" }).ok, "un DUI que la cita no traía sí es un dato");
assert.ok(d.validarFicha({ ...soloDui, telefono: "71234567" }, HOY, { duiDeCita: "00418860-6" }).ok);

// Nacimiento o edad
assert.ok(!ficha({ fechaNacimiento: "2026-11-25" }).ok, "nacimiento futuro");
assert.ok(!ficha({ fechaNacimiento: "1890-01-01" }).ok);
assert.ok(!ficha({ edad: 130 }).ok);
const conFecha = ficha({ fechaNacimiento: "1960-11-25", edad: 50 }).datos;
assert.equal(conFecha.edad, null, "con fecha, la edad anotada sobra");
assert.deepEqual(d.edadDe(conFecha, HOY), { anios: 65, aproximada: false }, "cumple mañana");
assert.deepEqual(d.edadDe({ fechaNacimiento: "1960-11-24", edad: null, edadAl: "" }, HOY), { anios: 66, aproximada: false });
const conEdad = ficha({ edad: "70" }).datos;
assert.deepEqual([conEdad.edad, conEdad.edadAl], [70, HOY]);
assert.deepEqual(d.edadDe({ fechaNacimiento: "", edad: 70, edadAl: "2024-11-01" }, HOY), { anios: 72, aproximada: true }, "la edad anotada envejece");
const previa = { edad: 70, edadAl: "2024-11-01" };
assert.equal(d.validarFicha({ edad: 70 }, HOY, { previa }).datos.edadAl, "2024-11-01", "misma edad: conserva cuándo se anotó");
assert.equal(d.validarFicha({ edad: 71 }, HOY, { previa }).datos.edadAl, HOY, "edad corregida: se anota hoy");
assert.equal(d.edadDe(d.fichaVacia(), HOY), null);

// Domicilio
const enSV = ficha({ zona: "rural", departamento: "San Salvador", distrito: "Soyapango", direccion: " Col. Prueba  #1 ", pais: "Honduras" }).datos;
assert.equal(enSV.municipio, "San Salvador Este", "el municipio sale del distrito");
assert.equal(enSV.pais, "", "en El Salvador no se guarda país");
assert.equal(d.domicilioTexto(enSV), "Col. Prueba #1, Soyapango, San Salvador Este, San Salvador");
assert.equal(ficha({ departamento: "San Salvador", distrito: "Metapán" }).datos.distrito, "", "distrito de otro departamento no entra");
assert.equal(ficha({ departamento: "Atlántida" }).datos.departamento, "");
assert.equal(d.municipioDeDistrito("La Libertad", "Santa Tecla"), "La Libertad Sur");
const fuera = ficha({ residencia: "exterior", pais: "Honduras", direccion: "Barrio El Centro, Ocotepeque", departamento: "San Salvador", zona: "urbana" }).datos;
assert.deepEqual([fuera.departamento, fuera.zona], ["", ""], "fuera del país no hay departamento ni zona");
assert.equal(d.domicilioTexto(fuera), "Barrio El Centro, Ocotepeque, Honduras");

// Responsable
assert.ok(!ficha({ responsable: { telefono: "71234567" } }).ok, "responsable sin nombre");
assert.ok(!ficha({ responsable: { nombre: "Ana Pérez", telefono: "12" } }).ok);
assert.deepEqual(ficha({ responsable: { nombre: " Ana  Pérez ", parentesco: "Hijo (a)", telefono: "22221111" } }).datos.responsable,
  { nombre: "Ana Pérez", parentesco: "Hijo (a)", telefono: "2222-1111" });

// Qué cambió: es lo que dice la gestión que deja el directorio.
const base = d.fichaSugerida({ dui: "00418860-6" });
assert.deepEqual(d.camposCambiados(null, base, "00418860-6"), [], "lo que ya se sabía no es un cambio");
assert.deepEqual(d.camposCambiados(null, base, ""), ["documento"], "un DUI que la cita no traía sí");
const llena = ficha({ documentoTipo: "dui", documentoNumero: "004188606", departamento: "San Salvador", distrito: "Soyapango", responsable: { nombre: "Ana Pérez" } }).datos;
assert.deepEqual(d.camposCambiados(null, llena, "00418860-6"), ["teléfono", "domicilio", "responsable"]);
assert.deepEqual(d.camposCambiados(llena, llena), [], "guardar sin tocar nada no cambia nada");
assert.deepEqual(d.camposCambiados(llena, { ...llena, telefono2: "2222-0000" }), ["teléfono"]);
assert.deepEqual(d.camposCambiados(llena, { ...llena, edadAl: "2026-01-01" }), [], "el día en que se anotó la edad no es un dato");
assert.deepEqual(d.camposCambiados(llena, { ...llena, nacionalidad: "Hondureña", responsable: { ...llena.responsable, parentesco: "Madre" } }), ["nacionalidad", "responsable"]);
assert.equal(d.textoActualizacion(["responsable", "teléfono", "domicilio"], true), "Completó en el directorio: teléfono, domicilio y responsable.");
assert.equal(d.textoActualizacion(["correo"], false), "Actualizó en el directorio: correo.");
assert.equal(d.textoActualizacion(["correo", "sexo"], false), "Actualizó en el directorio: correo y sexo.");

// ── Adjuntos ──
const a = transpilar("../src/lib/consultaExterna/trabajoSocialAdjuntos.ts", () => ({}));
const bytes = (...x) => Uint8Array.from(x);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00);
assert.deepEqual(a.validarAdjunto("Constancia Médica.PDF", 2000, PDF).datos, { nombre: "Constancia Médica.PDF", mime: "application/pdf", clase: "pdf" });
assert.equal(a.validarAdjunto("C:\\Users\\ana\\foto del dui.jpg", 900, bytes(0xff, 0xd8, 0xff, 0xe0)).datos.nombre, "foto del dui.jpg", "sin la carpeta de origen");
assert.equal(a.validarAdjunto("informe.docx", 900, ZIP).datos.clase, "word");
assert.equal(a.validarAdjunto("matriz.xls", 900, bytes(0xd0, 0xcf, 0x11, 0xe0)).datos.clase, "excel");
assert.ok(a.validarAdjunto("basura.pdf", 900, bytes(0, 0, 0x25, 0x50, 0x44, 0x46)).ok, "el %PDF puede venir tras unos bytes");
assert.ok(!a.validarAdjunto("programa.exe", 900, EXE).ok, "tipo no admitido");
assert.ok(!a.validarAdjunto("pagina.html", 900).ok);
assert.ok(!a.validarAdjunto("dibujo.svg", 900).ok);
assert.ok(!a.validarAdjunto("sin extension", 900).ok);
assert.ok(!a.validarAdjunto("programa.pdf", 900, EXE).ok, "un ejecutable con extensión .pdf no entra");
assert.ok(!a.validarAdjunto("foto.png", 900, PDF).ok, "ni un PDF llamado .png");
assert.ok(a.validarAdjunto("programa.pdf", 900).ok, "sin los bytes solo se mira extensión y tamaño");
assert.ok(!a.validarAdjunto("vacio.pdf", 0, PDF).ok);
assert.ok(!a.validarAdjunto("enorme.pdf", a.MAX_ADJUNTO_BYTES + 1, PDF).ok);
assert.ok(a.validarAdjunto("justo.pdf", a.MAX_ADJUNTO_BYTES, PDF).ok);
assert.match(a.validarAdjunto("enorme.pdf", 6 * 1024 * 1024).error, /6\.0 MB.*4\.0 MB/);
assert.equal(a.rutaAdjunto("g1", "a9", "Constancia médica (1) de José.pdf"), "consulta_externa_ts/g1/a9_Constancia_medica__1__de_Jose.pdf");
assert.ok(!a.rutaAdjunto("g1", "a9", "../../otro/archivo.pdf").slice("consulta_externa_ts/g1/".length).includes("/"), "el nombre no puede salirse de la carpeta");
assert.deepEqual([a.tamanoTexto(340 * 1024), a.tamanoTexto(1.25 * 1024 * 1024), a.tamanoTexto(10)], ["340 KB", "1.3 MB", "1 KB"]);
assert.ok(a.seAbreEnNavegador("pdf") && a.seAbreEnNavegador("imagen") && !a.seAbreEnNavegador("word"));
assert.ok(a.ACEPTA_ADJUNTOS.includes(".docx") && a.ACEPTA_ADJUNTOS.includes("image/jpeg"));

console.log(`Trabajo Social CE: bien (${ids.length} tipos de gestión, directorio y adjuntos incluidos).`);
