#!/usr/bin/env node
/**
 * Importa el rol de turnos mensual de un ÁREA del hospital desde su Excel
 * oficial (mismo formato que ESDOMED.xlsx: encabezado AREA/HORAS/MES/AÑO, fila
 * "CODIGO DE MARCA | NOMBRE COMPLETO | PUESTO | 1..31 | HT") hacia la colección
 * `planes_trabajo_areas` con doc id `{areaId}_{YYYY-MM}`.
 *
 * Normaliza las marcas que las áreas escriben distinto al catálogo:
 *   V → VAC (vacaciones) · L → LIC (licencia) · MATERNIDAD → MAT (todo el rango)
 * Los códigos de jornada (TH9, TH30, AD1, ...) se validan contra la hoja
 * HORARIOS del propio archivo y se reporta cualquier desconocido.
 *
 * Requisito: service-account.json en la raíz (igual que limpiar-colecciones.mjs).
 *
 * Uso:
 *   node scripts/importar-plan-area.mjs examples/turnos_terapia.xlsx \
 *     --area terapia-respiratoria --nombre "Unidad de Terapia Respiratoria" \
 *     [--periodo 2026-08] [--hoja "NOMBRE DE HOJA"] [--dry-run] [--key ./clave.json]
 *
 *   --periodo se deduce de las celdas MES/AÑO del Excel si no se pasa.
 *   --dry-run analiza y muestra el resumen sin escribir en Firestore.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);

const ARCHIVO = args.find((a) => !a.startsWith("--") && a.endsWith(".xlsx"));
const AREA_ID = getArg("--area");
const NOMBRE_ARG = getArg("--nombre");
const PERIODO_ARG = getArg("--periodo");
const HOJA_ARG = getArg("--hoja");
const KEY_PATH = getArg("--key") || resolve(ROOT, "service-account.json");
const DRY_RUN = hasFlag("--dry-run");

if (!ARCHIVO || !AREA_ID) {
  console.error("Uso: node scripts/importar-plan-area.mjs <archivo.xlsx> --area <areaId> [--nombre \"...\"] [--periodo YYYY-MM] [--dry-run]");
  process.exit(1);
}

const RUTA = resolve(ROOT, ARCHIVO);
if (!existsSync(RUTA)) {
  console.error(`No existe el archivo: ${RUTA}`);
  process.exit(1);
}

// Marcas del catálogo (src/lib/esdomed/horarios.ts) + normalización de alias.
const MARCAS = new Set(["VAC", "INC", "PER", "ASU", "LIC", "MAT"]);
const ALIAS_MARCAS = { V: "VAC", L: "LIC", MATERNIDAD: "MAT", VACACIONES: "VAC", LICENCIA: "LIC" };

function normalizarCelda(v) {
  const raw = String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!raw) return "";
  return ALIAS_MARCAS[raw] ?? raw;
}

// ── Lectura del Excel ───────────────────────────────────────────────────────
const wb = XLSX.readFile(RUTA);
const nombreHoja = HOJA_ARG
  ? wb.SheetNames.find((n) => n.trim().toLowerCase() === HOJA_ARG.trim().toLowerCase())
  : wb.SheetNames[0];
if (!nombreHoja) {
  console.error(`No se encontró la hoja "${HOJA_ARG}". Hojas: ${wb.SheetNames.join(", ")}`);
  process.exit(1);
}
const ws = wb.Sheets[nombreHoja];
const filasRaw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

// Expandir celdas combinadas (ej. MATERNIDAD a lo largo del mes): copiar el
// valor de la celda superior-izquierda a todo el rango combinado.
for (const m of ws["!merges"] ?? []) {
  const valor = filasRaw[m.s.r]?.[m.s.c] ?? "";
  if (String(valor).trim() === "") continue;
  for (let r = m.s.r; r <= m.e.r; r++) {
    for (let c = m.s.c; c <= m.e.c; c++) {
      if (!filasRaw[r]) continue;
      filasRaw[r][c] = valor;
    }
  }
}

const celdaTexto = (r, c) => String(filasRaw[r]?.[c] ?? "").trim();

// Encabezado: fila con "CODIGO DE MARCA" en la primera columna.
const idxHeader = filasRaw.findIndex((r) => String(r?.[0] ?? "").trim().toUpperCase().startsWith("CODIGO DE MARCA"));
if (idxHeader === -1) {
  console.error("No se encontró la fila de encabezado (CODIGO DE MARCA | NOMBRE COMPLETO | PUESTO | 1.. ).");
  process.exit(1);
}

// Periodo: --periodo o celdas "MES:" / "AÑO:" del encabezado.
let periodo = PERIODO_ARG;
if (!periodo) {
  for (let r = 0; r < idxHeader; r++) {
    const fila = filasRaw[r] ?? [];
    for (let c = 0; c < fila.length; c++) {
      if (String(fila[c]).trim().toUpperCase().startsWith("MES")) {
        const mes = parseInt(celdaTexto(r, c + 1), 10);
        let anio = NaN;
        for (let c2 = c + 2; c2 < fila.length; c2++) {
          if (String(fila[c2]).trim().toUpperCase().startsWith("AÑO") || String(fila[c2]).trim().toUpperCase().startsWith("ANO")) {
            anio = parseInt(celdaTexto(r, c2 + 1), 10);
            break;
          }
        }
        if (mes >= 1 && mes <= 12 && anio > 2000) periodo = `${anio}-${String(mes).padStart(2, "0")}`;
      }
    }
  }
}
if (!/^\d{4}-\d{2}$/.test(periodo ?? "")) {
  console.error("No se pudo deducir el periodo del Excel; pásalo con --periodo YYYY-MM.");
  process.exit(1);
}
const [anio, mes] = periodo.split("-").map(Number);
const diasDelMes = new Date(anio, mes, 0).getDate();

// Número de horas (encabezado) y nombre del área.
let numeroHoras = "";
for (let r = 0; r < idxHeader; r++) {
  const fila = filasRaw[r] ?? [];
  const c = fila.findIndex((x) => String(x).trim().toUpperCase().startsWith("NUMERO DE HORAS"));
  if (c !== -1) numeroHoras = celdaTexto(r, c + 1);
}
let areaNombre = NOMBRE_ARG;
if (!areaNombre) {
  const filaArea = filasRaw.slice(0, idxHeader).map((r) => String(r?.[0] ?? "")).find((t) => t.trim().toUpperCase().startsWith("AREA O DEPARTAMENTO"));
  areaNombre = (filaArea ?? "").replace(/AREA O DEPARTAMENTO/i, "").trim() || AREA_ID;
}

// Catálogo de horarios de la hoja HORARIOS del propio archivo (para validar y
// calcular horas). Si no existe la hoja, solo se validan las marcas.
const horas = new Map();
const hojaHorarios = wb.SheetNames.find((n) => n.trim().toUpperCase() === "HORARIOS");
if (hojaHorarios) {
  const catalogo = XLSX.utils.sheet_to_json(wb.Sheets[hojaHorarios], { header: 1, raw: false, defval: "" });
  for (const fila of catalogo.slice(1)) {
    const codigo = String(fila[1] ?? "").trim().toUpperCase();
    const h = parseFloat(String(fila[4] ?? ""));
    if (codigo && Number.isFinite(h)) horas.set(codigo, h);
  }
}

// Columnas de días: las 31 (o 28/29/30) columnas después de PUESTO (col D en
// el formato oficial). Columna HT (si existe) para contrastar totales.
const COL_DIA_INICIO = 3;
const headerFila = filasRaw[idxHeader] ?? [];
const colHT = headerFila.findIndex((x) => String(x).trim().toUpperCase() === "HT");

// ── Filas de personal ───────────────────────────────────────────────────────
const personas = [];
const desconocidos = new Map();
const conteoCodigos = new Map();
const alertasHT = [];

for (let r = idxHeader + 1; r < filasRaw.length; r++) {
  const codigoMarcacion = celdaTexto(r, 0).toUpperCase();
  const nombre = celdaTexto(r, 1).toUpperCase();
  if (!codigoMarcacion && !nombre) break; // fin del listado
  if (!nombre) continue;

  const puesto = celdaTexto(r, 2).toUpperCase();
  const asignaciones = [];
  for (let d = 0; d < diasDelMes; d++) {
    const valor = normalizarCelda(filasRaw[r]?.[COL_DIA_INICIO + d]);
    asignaciones.push(valor);
    if (!valor) continue;
    conteoCodigos.set(valor, (conteoCodigos.get(valor) ?? 0) + 1);
    if (!horas.has(valor) && !MARCAS.has(valor)) {
      desconocidos.set(valor, (desconocidos.get(valor) ?? 0) + 1);
    }
  }

  // Contraste con la columna HT del Excel (informativo).
  if (colHT !== -1 && horas.size > 0) {
    const htExcel = parseFloat(celdaTexto(r, colHT));
    if (Number.isFinite(htExcel)) {
      const total = asignaciones.reduce((acc, c) => acc + (horas.get(c) ?? 0), 0);
      if (total !== htExcel) alertasHT.push(`${nombre}: HT del Excel=${htExcel}, calculado=${total}`);
    }
  }

  personas.push({
    uid: "",
    codigoMarcacion,
    nombre,
    puesto,
    grupo: "",
    orden: personas.length, // conserva el orden del Excel
    asignaciones,
    observaciones: "",
  });
}

// ── Resumen ─────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(62));
console.log("  IMPORTAR PLAN DE TRABAJO POR ÁREA — ESDOMED Services");
console.log("=".repeat(62));
console.log(`  Archivo:   ${ARCHIVO} (hoja "${nombreHoja}")`);
console.log(`  Área:      ${AREA_ID} — ${areaNombre}`);
console.log(`  Periodo:   ${periodo} (${diasDelMes} días) · Nº horas: ${numeroHoras || "—"}`);
console.log(`  Personal:  ${personas.length} filas`);
console.log(`  Códigos:   ${[...conteoCodigos.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}×${n}`).join("  ")}`);
if (desconocidos.size > 0) {
  console.log(`  ⚠ Códigos DESCONOCIDOS (no están en HORARIOS ni son marcas): ${[...desconocidos.entries()].map(([c, n]) => `${c}×${n}`).join("  ")}`);
}
if (alertasHT.length > 0) {
  console.log(`  ⚠ Totales que no cuadran con la columna HT del Excel (${alertasHT.length}):`);
  alertasHT.slice(0, 10).forEach((a) => console.log(`     · ${a}`));
  if (alertasHT.length > 10) console.log(`     · ... y ${alertasHT.length - 10} más`);
}

if (personas.length === 0) {
  console.error("\nNo se encontró personal en la hoja. Nada que importar.");
  process.exit(1);
}

if (DRY_RUN) {
  console.log("\n  (dry-run: no se escribió nada en Firestore)\n");
  process.exit(0);
}

// ── Escritura ───────────────────────────────────────────────────────────────
if (!existsSync(KEY_PATH)) {
  console.error(`\nNo existe la clave de servicio: ${KEY_PATH}`);
  process.exit(1);
}
const serviceAccount = JSON.parse(readFileSync(KEY_PATH, "utf8"));
const { initializeApp, cert } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const docId = `${AREA_ID}_${periodo}`;
const ref = db.collection("planes_trabajo_areas").doc(docId);
const previo = await ref.get();
const ahora = new Date();

await ref.set({
  areaId: AREA_ID,
  areaNombre,
  periodo,
  anio,
  mes,
  numeroHoras,
  filas: personas,
  creadoEn: previo.exists ? previo.data().creadoEn : ahora,
  creadoPorId: previo.exists ? previo.data().creadoPorId : "script-importar-plan-area",
  creadoPorNombre: previo.exists ? previo.data().creadoPorNombre : "Importación desde Excel",
  actualizadoEn: ahora,
  actualizadoPorId: "script-importar-plan-area",
  actualizadoPorNombre: "Importación desde Excel",
});

console.log(`\n  ✔ Guardado planes_trabajo_areas/${docId}${previo.exists ? " (reemplazó el existente)" : ""}\n`);
