// Comprueba los establecimientos de los censos de emergencia: que los frecuentes
// coincidan con el catálogo real de SIMMOW, el nombre canónico (registros
// viejos), la clasificación "REFERENCIA EN SIS" y la búsqueda.
// Uso: node scripts/test-establecimientos-censo.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const fuente = readFileSync(new URL("../src/lib/emergencia/establecimientosCenso.ts", import.meta.url), "utf8");
const compilado = ts.transpileModule(fuente, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const modulo = { exports: {} };
new Function("exports", "module", compilado)(modulo.exports, modulo);
const {
  ESTABLECIMIENTOS_FRECUENTES, agruparEstablecimientos, buscarEstablecimientosCenso, claveEstablecimiento,
  clasificacionSis, nombreEstablecimiento,
} = modulo.exports;

const catalogo = JSON.parse(readFileSync(new URL("../src/lib/simmow/establecimientosSimmow.json", import.meta.url), "utf8"));
const porCodigo = new Map(catalogo.map((e) => [e.codigo, e.nombre]));

// Cada frecuente apunta a una fila real de SIMMOW y su primer alias es ese nombre.
for (const e of ESTABLECIMIENTOS_FRECUENTES) {
  if (!e.simmow) continue;
  assert.ok(porCodigo.has(e.simmow), `${e.nombre}: el código ${e.simmow} no está en SIMMOW`);
  assert.equal(claveEstablecimiento(e.alias[0]), claveEstablecimiento(porCodigo.get(e.simmow)), `${e.nombre}: alias[0] no es el nombre de SIMMOW`);
}
// Nombres, códigos y alias sin repetir entre frecuentes.
const vistos = new Map();
for (const e of ESTABLECIMIENTOS_FRECUENTES) {
  for (const n of [e.nombre, ...e.alias]) {
    const k = claveEstablecimiento(n);
    assert.ok(!vistos.has(k) || vistos.get(k) === e.nombre, `"${n}" se repite en ${vistos.get(k)} y ${e.nombre}`);
    vistos.set(k, e.nombre);
  }
}
const codigos = ESTABLECIMIENTOS_FRECUENTES.flatMap((e) => (e.simmow ? [e.simmow] : []));
assert.equal(new Set(codigos).size, codigos.length, "código SIMMOW repetido");

// DoctorSV va primero y se resuelve aunque venga escrito de otra forma.
assert.equal(ESTABLECIMIENTOS_FRECUENTES[0].nombre, "DoctorSV");
assert.equal(nombreEstablecimiento("Doctor SV"), "DoctorSV");
assert.equal(nombreEstablecimiento("TELEMEDICINA DOCTORSV"), "DoctorSV");

// Los valores que ya están guardados en los censos (2026-11-14).
assert.equal(nombreEstablecimiento("HOSPITAL NACIONAL SAN RAFAEL – SANTA TECLA"), "HN San Rafael");
assert.equal(nombreEstablecimiento("HOSPITAL NACIONAL NEUMOLÓGICO Y DE MEDICINA FAMILIAR DR. JOSÉ ANTONIO SALDAÑA"), "HN Saldaña");
assert.equal(nombreEstablecimiento("HOSPITAL NACIONAL ZACAMIL DR. JUAN JOSÉ FERNÁNDEZ"), "HN Zacamil");
assert.equal(nombreEstablecimiento("HOSPITAL NACIONAL DE LA MUJER DRA. MARÍA ISABEL RODRÍGUEZ"), "HN de la Mujer");
assert.equal(nombreEstablecimiento("HN San Bartolo"), "HN San Bartolo");
assert.equal(nombreEstablecimiento("Hospital privado"), "Hospital privado");
assert.equal(nombreEstablecimiento("Otro"), "Otro");
// Lo que no es frecuente se queda tal cual.
assert.equal(nombreEstablecimiento("UNIDAD MEDICAS SANTA TECLA ISSS"), "UNIDAD MEDICAS SANTA TECLA ISSS");
assert.equal(nombreEstablecimiento("  "), "");
assert.equal(nombreEstablecimiento(undefined), "");

// El tablero junta las formas de un mismo hospital y no toca "sin_dato".
assert.deepEqual(
  agruparEstablecimientos({ "HN San Rafael": 2, "HOSPITAL NACIONAL SAN RAFAEL – SANTA TECLA": 3, sin_dato: 1 }),
  { "HN San Rafael": 5, sin_dato: 1 },
);

// Clasificación SIS: también con el nombre largo de San Rafael.
assert.equal(clasificacionSis("DoctorSV", true), "DR SV");
assert.equal(clasificacionSis("HN San Rafael", false), "HNSR SIN REF SIS");
assert.equal(clasificacionSis("Hospital Nacional Santa Tecla LL \"San Rafael\"", true), "HNSR CON REF SIS");
assert.equal(clasificacionSis("HN Zacamil", true), "OTROS HOSP CON REF SIS");
assert.equal(clasificacionSis("UCSFE Santa Tecla LL", false), "OTROS HOSP SIN REF SIS");

// Búsqueda: sin texto, solo frecuentes.
const vacia = buscarEstablecimientosCenso("", catalogo);
assert.equal(vacia.frecuentes.length, ESTABLECIMIENTOS_FRECUENTES.length);
assert.equal(vacia.catalogo.length, 0);

// "santa tecla" encuentra San Rafael entre los frecuentes y no lo repite del catálogo.
const tecla = buscarEstablecimientosCenso("santa tecla", catalogo);
assert.ok(tecla.frecuentes.some((e) => e.nombre === "HN San Rafael"));
assert.ok(!tecla.catalogo.some((e) => e.codigo === "163"), "San Rafael repetido desde SIMMOW");
assert.ok(tecla.catalogo.some((e) => /^UCSF/.test(e.nombre)), "faltan las UCSF de Santa Tecla");

// Sin tildes y en cualquier orden.
assert.ok(buscarEstablecimientosCenso("neumologico", catalogo).frecuentes.some((e) => e.nombre === "HN Saldaña"));
assert.ok(buscarEstablecimientosCenso("ahuachapan nacional", catalogo).frecuentes.some((e) => e.nombre === "HN Ahuachapán"));
assert.ok(buscarEstablecimientosCenso("telemedicina", catalogo).frecuentes.some((e) => e.nombre === "DoctorSV"));

// Privados con nombre, y el propio HES nunca aparece.
const privados = buscarEstablecimientosCenso("privado", catalogo, 500);
assert.ok(privados.totalCatalogo > 50, `privados: ${privados.totalCatalogo}`);
assert.ok(privados.catalogo.some((e) => /Lourdes/.test(e.nombre)));
assert.ok(!buscarEstablecimientosCenso("el salvador", catalogo, 2000).catalogo.some((e) => e.codigo === "2317"));

// Límite y total.
const ucsf = buscarEstablecimientosCenso("ucsf", catalogo);
assert.equal(ucsf.catalogo.length, 40);
assert.ok(ucsf.totalCatalogo > 900, `UCSF: ${ucsf.totalCatalogo}`);

// Ningún frecuente sale repetido desde el catálogo.
const hospitales = buscarEstablecimientosCenso("hospital", catalogo, 2000);
const frecuentes = new Set(codigos);
assert.ok(hospitales.catalogo.every((e) => !frecuentes.has(e.codigo)), "frecuente repetido desde SIMMOW");

// Primero lo que coincide al inicio de palabra.
const conPuntos = buscarEstablecimientosCenso("mar", catalogo, 2000).catalogo;
const alInicio = (n) => claveEstablecimiento(n).split("_").some((p) => p.startsWith("MAR"));
const primeroSinInicio = conPuntos.findIndex((e) => !alInicio(e.nombre));
assert.ok(primeroSinInicio === -1 || conPuntos.slice(primeroSinInicio).every((e) => !alInicio(e.nombre)), "orden por inicio de palabra");

console.log(`OK — ${ESTABLECIMIENTOS_FRECUENTES.length} frecuentes; ${catalogo.length} en SIMMOW; ${ucsf.totalCatalogo} UCSF; ${privados.totalCatalogo} privados`);
