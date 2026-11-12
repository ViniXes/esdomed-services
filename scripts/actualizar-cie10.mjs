/**
 * Actualiza el catálogo CIE-10 de la app (cie-10/codes.json) desde el catálogo del SIS.
 *
 * El SIS (MINSAL) es la fuente: es lo que eligen los médicos allá y lo que llega en
 * cada importación, así que código y texto deben coincidir letra por letra.
 *
 * De dónde sale el archivo del SIS: Administración → Diagnósticos CIE10
 * (/admin/minsal/siaps/mntcie10/list). Se recorren las páginas de 200 y se guarda
 * { fuente, extraido, columnas, filas: [[codigo, diagnostico, activo, causaExterna,
 * odontologia, sexo]] } con activo/causaExterna/odontologia en "sí"/"no".
 *
 * Reglas:
 *  - Todo código del SIS entra con su texto literal y sus marcas.
 *  - "Activo = no" en el SIS → `inactivo: true`: la app lo reconoce por código
 *    (registros viejos, validación de la matriz UCI) pero el buscador no lo ofrece.
 *  - Un código que tenemos y el SIS no → se conserva como `inactivo` + `fueraDelSis`,
 *    por la misma razón. Nunca se borra: hay registros que lo guardaron.
 *  - Los encabezados de rango del catálogo viejo ("C00-C75 …") no son códigos y salen.
 *
 * Uso:
 *   node scripts/actualizar-cie10.mjs <archivo-sis.json> --dry-run   # solo informa
 *   node scripts/actualizar-cie10.mjs <archivo-sis.json>             # escribe cie-10/codes.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = resolve(ROOT, "cie-10/codes.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const origen = args.find((a) => !a.startsWith("--"));
if (!origen) {
  console.error("Falta el archivo del SIS. Uso: node scripts/actualizar-cie10.mjs <archivo-sis.json> [--dry-run]");
  process.exit(1);
}

const RE_CODIGO = /^[A-Z]\d\d(\.(\d{1,2}|\*))?$/;
/** "D77.*" del SIS y "D77" del catálogo viejo son el mismo código. */
const clave = (codigo) => codigo.toUpperCase().replace(/\.\*$/, "");

// ── Fuente: SIS ────────────────────────────────────────────────────────────
const sis = JSON.parse(readFileSync(resolve(origen), "utf8"));
const filas = sis.filas ?? [];
const errores = [];
if (filas.length < 10000) errores.push(`El archivo trae ${filas.length} filas; el SIS tiene más de 12,000. ¿Quedó a medias?`);
const vistos = new Set();
for (const f of filas) {
  if (!Array.isArray(f) || f.length !== 6) { errores.push(`Fila mal formada: ${JSON.stringify(f)}`); continue; }
  if (!RE_CODIGO.test(f[0])) errores.push(`Código con formato raro: ${f[0]}`);
  if (!f[1]?.trim()) errores.push(`Código sin descripción: ${f[0]}`);
  if (vistos.has(clave(f[0]))) errores.push(`Código repetido: ${f[0]}`);
  vistos.add(clave(f[0]));
}
if (errores.length) {
  console.error("El archivo del SIS no pasa la revisión:\n  " + errores.slice(0, 20).join("\n  "));
  process.exit(1);
}

// ── Actual: cie-10/codes.json (formato viejo por niveles o formato nuevo) ───
const actualRaw = JSON.parse(readFileSync(DESTINO, "utf8"));
const puntoViejo = (c) => (c.length > 3 ? `${c.slice(0, 3)}.${c.slice(3)}` : c);
const actuales = Array.isArray(actualRaw)
  ? actualRaw
      .filter((e) => e.level >= 2 && !e.code.includes("-"))
      .map((e) => ({ code: puntoViejo(e.code), description: e.description.trim() }))
  : actualRaw.codigos;
const porClaveActual = new Map(actuales.map((e) => [clave(e.code), e]));

// ── Construcción ───────────────────────────────────────────────────────────
const nuevoCatalogo = [];
for (const [codigo, diagnostico, activo, causaExterna, odontologia, sexo] of filas) {
  const e = { code: codigo, description: diagnostico.trim() };
  if (activo === "no") e.inactivo = true;
  if (causaExterna === "sí") e.causaExterna = true;
  if (odontologia === "sí") e.odontologia = true;
  if (sexo && sexo !== "Ambos") e.sexo = sexo;
  nuevoCatalogo.push(e);
}
const conservados = actuales
  .filter((e) => !vistos.has(clave(e.code)))
  .map((e) => ({ code: e.code, description: e.description, inactivo: true, fueraDelSis: true }));
nuevoCatalogo.push(...conservados);
nuevoCatalogo.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

// ── Informe ────────────────────────────────────────────────────────────────
const porLetra = (lista) =>
  Object.entries(lista.reduce((acc, e) => ((acc[e.code[0]] = (acc[e.code[0]] ?? 0) + 1), acc), {}))
    .map(([l, n]) => `${l}:${n}`)
    .join(" ");
const nuevos = nuevoCatalogo.filter((e) => !e.fueraDelSis && !porClaveActual.has(clave(e.code)));
const nuevosFuera = conservados.filter((e) => !porClaveActual.get(clave(e.code))?.fueraDelSis);
const textoCambiado = nuevoCatalogo.filter((e) => {
  const previo = porClaveActual.get(clave(e.code));
  return !e.fueraDelSis && previo && previo.description !== e.description;
});
const pasanAInactivo = nuevoCatalogo.filter((e) => {
  const previo = porClaveActual.get(clave(e.code));
  return !e.fueraDelSis && e.inactivo && previo && !previo.inactivo;
});

console.log(`Fuente: ${sis.fuente ?? "?"} (extraído ${sis.extraido ?? "?"})`);
console.log(`SIS: ${filas.length} códigos, ${filas.filter((f) => f[2] === "no").length} inactivos`);
console.log(`Catálogo actual: ${actuales.length} códigos`);
console.log(`Catálogo nuevo: ${nuevoCatalogo.length} (${nuevoCatalogo.filter((e) => !e.inactivo).length} se ofrecen en el buscador)`);
console.log(`\nNuevos (están en el SIS, no los teníamos): ${nuevos.length}\n  ${porLetra(nuevos)}`);
console.log(`\nFuera del SIS (se conservan ocultos para reconocer registros viejos): ${nuevosFuera.length} nuevos, ${conservados.length} en total`);
console.log(`  3 caracteres (categorías padre): ${nuevosFuera.filter((e) => e.code.length === 3).length}`);
console.log(`  otros: ${nuevosFuera.filter((e) => e.code.length !== 3).map((e) => e.code).join(", ") || "—"}`);
console.log(`\nYa existían y ahora están inactivos en el SIS: ${pasanAInactivo.length}`);
console.log(`  ${pasanAInactivo.map((e) => e.code).join(" ")}`);
console.log(`\nTexto cambiado al del SIS: ${textoCambiado.length}`);
for (const e of textoCambiado.slice(0, 8)) {
  console.log(`  ${e.code}\n    antes: ${porClaveActual.get(clave(e.code)).description}\n    SIS:   ${e.description}`);
}

if (dryRun) {
  console.log("\n--dry-run: no se escribió nada.");
  process.exit(0);
}

const cabecera = { fuente: sis.fuente, extraido: sis.extraido, total: nuevoCatalogo.length };
// Una entrada por línea: los diffs de la próxima actualización se leen solos.
const cuerpo = nuevoCatalogo.map((e) => "    " + JSON.stringify(e)).join(",\n");
const encabezado = JSON.stringify(cabecera, null, 2).replace(/\n}$/, "");
writeFileSync(DESTINO, `${encabezado},\n  "codigos": [\n${cuerpo}\n  ]\n}\n`, "utf8");
console.log(`\nEscrito ${DESTINO}`);
