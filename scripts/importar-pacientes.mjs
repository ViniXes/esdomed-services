#!/usr/bin/env node
/**
 * Importación inicial de pacientes hospitalizados desde Excel a Firestore.
 *
 * Requisito previo: descarga la clave de servicio desde Firebase Console
 *   → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada
 *   → Guárdala como service-account.json en la raíz del proyecto
 *
 * Uso:
 *   node scripts/importar-pacientes.mjs --dry-run          # solo analiza, no escribe
 *   node scripts/importar-pacientes.mjs                    # importa a Firestore
 *   node scripts/importar-pacientes.mjs --key ./otra-clave.json --file ./otro.xlsx
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);

const KEY_PATH   = getArg("--key")  || resolve(ROOT, "service-account.json");
const EXCEL_PATH = getArg("--file") || resolve(ROOT, "examples/pacientes_actuales.xlsx");
const DRY_RUN    = hasFlag("--dry-run");

// ── Catálogo de servicios (espejo de src/lib/servicios.ts) ───────────────────
const bedsZP = (n)    => Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, "0"));
const beds   = (p, n) => Array.from({ length: n }, (_, i) => `${p}-${String(i + 1).padStart(2, "0")}`);
const bedsPN = (p, n) => Array.from({ length: n }, (_, i) => `${p}${String(i + 1).padStart(2, "0")}`);
const bedsNS = (n, s) => Array.from({ length: n }, (_, i) => `${i + 1}${s}`);
const bedsN  = (n)    => Array.from({ length: n }, (_, i) => String(i + 1));

const CAMAS_POR_SERVICIO = {
  "Emergencia":                                                        [],
  "Obstetricia":                                                       [],
  "Unidad de Cuidados Intensivos":                                     [],
  "Unidad de Cuidados Intermedios":                                    [],
  "Bienestar Magisterial":                                             bedsN(2),
  "Unidad de Cuidados Intensivos Adultos BM":                         bedsN(10),
  "Unidad de Cuidados Intermedios Adultos BM":                        bedsN(10),
  "Cirugía Hombres 1":                                                bedsZP(12),
  "Cirugía Mujeres 1":                                                bedsZP(12),
  "Cirugía Cardiovascular":                                           beds("CCV", 8),
  "Neurocirugia":                                                     beds("NEU", 10),
  "Dolor y cuidados Paliativos":                                      bedsNS(10, "P"),
  "Unidad de Cuidados Intermedios Adultos MINSAL":                    bedsZP(30),
  "Unidad de Cuidados Intermedios Aislados Adultos":                  bedsPN("AI", 5),
  "Unidad de Cuidados Intermedios Crónicos Adultos":                  bedsPN("CR", 21),
  "Medicina Interna Hombres 1":                                       beds("MH1", 45),
  "Medicina Interna Hombres 2":                                       beds("MH2", 25),
  "Medicina Interna Hombres 3":                                       beds("MH3", 20),
  "Medicina Interna Mujeres 1":                                       beds("MM1", 50),
  "Medicina Interna Mujeres 2":                                       beds("MM2", 30),
  "Medicina Interna Mujeres 3":                                       beds("MM3", 32),
  "Servicio de Cardiologia":                                          beds("CAR", 8),
  "Servicio de Hematologia":                                          beds("HEM", 50),
  "Servicio de Aislados":                                             beds("MAI", 12),
  "Servicio de Oncologia":                                            beds("ONC", 15),
  "Unidad de cuidados intensivos General 1 Adultos":                  bedsNS(10, "G1"),
  "Unidad de cuidados intensivos aislados Adultos":                   bedsNS(8,  "A"),
  "Unidad de cuidados intensivos cardiovascular Adultos":             bedsNS(12, "C"),
  "Unidad de Cuidados Intensivos Extracorpórea Adultos":              bedsNS(9,  "E"),
  "Unidad de Cuidados Intensivos Quirúrgicos Adultos":                bedsNS(9,  "Q"),
  "Unidad de Cuidados Neurointensivos Adultos":                       bedsNS(10, "N"),
  "Unidad de Cuidados Coronarios y Posquirúrgicos Cardiovasculares":  bedsNS(7,  "CPC"),
  "Unidad de Evaluacion y Observación Medica":                        beds("EOM", 10),
  "Quimioterapia Ambulatoria":                                        bedsPN("QTA", 20),
  "Unidad de Terapia Intervencionista Endovascular":                  ["UTE-1", "UTE-2", "UTE-3"],
  "Dialisis Peritoneal":                                              bedsN(60),
  "Terapias Sanguíneas Extracorpórea":                                bedsN(10),
  "Centro Quirúrgico": [
    ...bedsPN("Q", 5),
    ...Array.from({ length: 12 }, (_, i) => `R${i + 1}`),
  ],
};

// Normaliza solo espacios (los nombres ya coinciden con el SIS oficial)
const normalizar = (s) => s?.toString().replace(/\s+/g, " ").trim() ?? "";

// Lookup exacto por nombre normalizado
const SERVICIOS_LOOKUP = Object.fromEntries(
  Object.keys(CAMAS_POR_SERVICIO).map((s) => [normalizar(s), s])
);

// ── Funciones de transformación ───────────────────────────────────────────────

function resolverServicio(excel) {
  return SERVICIOS_LOOKUP[normalizar(excel)] ?? null;
}

/** Intenta encajar la cama del Excel con el catálogo del servicio. */
function resolverCama(camaExcel, servicioApp) {
  if (!camaExcel) return { cama: null, advertencia: null };
  const camas = CAMAS_POR_SERVICIO[servicioApp] ?? [];
  if (camas.length === 0) return { cama: String(camaExcel).trim(), advertencia: null };

  // Normalizar espacios extra dentro del valor (ej: "MM1- 01" → "MM1-01")
  const raw = String(camaExcel).trim().replace(/\s+/g, "");

  // 1. Coincidencia exacta
  if (camas.includes(raw)) return { cama: raw, advertencia: null };

  // 2. Zero-padded  01 → si el catálogo usa 01
  const padded = raw.padStart(2, "0");
  if (camas.includes(padded)) return { cama: padded, advertencia: null };

  // 3. Sin cero inicial  01 → 1
  const stripped = raw.replace(/^0+/, "") || "0";
  if (camas.includes(stripped)) return { cama: stripped, advertencia: null };

  // 4. No encontrada — se importa con valor original + advertencia
  return {
    cama: raw,
    advertencia: `"${raw}" no está en el catálogo de ${servicioApp} (formato esperado: ${camas[0] ?? "?"})`,
  };
}

function parseFechaHora(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  const s = String(valor).trim();
  // DD/MM/YYYY HH:MM  o  DD/MM/YYYY HH:MM:SS AM/PM
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (m1) {
    let [, d, mo, y, h, min, ampm] = m1;
    h = parseInt(h, 10);
    if (ampm?.toUpperCase() === "PM" && h < 12) h += 12;
    if (ampm?.toUpperCase() === "AM" && h === 12) h = 0;
    const fecha = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), h, parseInt(min));
    return isNaN(fecha.getTime()) ? null : fecha;
  }
  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    const fecha = new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3]));
    return isNaN(fecha.getTime()) ? null : fecha;
  }
  return null;
}

function normalizarGenero(g) {
  const s = normalizar(g);
  if (s === "masculino" || s === "m") return "masculino";
  if (s === "femenino"  || s === "f") return "femenino";
  return "otro";
}

function normalizarArea(a) {
  const s = normalizar(a);
  if (s === "urbana") return "urbana";
  if (s === "rural")  return "rural";
  return undefined;
}

function normalizarCircunstancia(tipo) {
  const s = normalizar(tipo ?? "");
  if (s.includes("emergencia")) return "emergencia";
  if (s.includes("referid"))    return "referido";
  return "demanda_espontanea";
}

function parsearDiagnostico(str) {
  if (!str) return undefined;
  const s = String(str).trim();
  const m = s.match(/^([A-Z]\d{2,3}(?:\.\d+)?)\s*[-–]\s*(.+)$/);
  if (m) return { codigo: m[1].trim(), descripcion: m[2].trim() };
  if (s) return { codigo: "", descripcion: s };
  return undefined;
}

function parsearNombreMedico(str) {
  if (!str) return undefined;
  const s = String(str).trim();
  // "NOMBRE APELLIDO - JVPM-123" → solo el nombre
  const idx = s.lastIndexOf(" - ");
  return idx > 0 ? s.substring(0, idx).trim() : s;
}

function limpiarMunicipio(str) {
  // "San Salvador SS" → "San Salvador"
  return str?.toString().trim().replace(/\s+[A-Z]{2,3}$/, "").trim() || undefined;
}

function sinNulos(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n" + "=".repeat(62));
  console.log("  IMPORTACIÓN DE PACIENTES HOSPITALIZADOS — ESDOMED Services");
  console.log("=".repeat(62));
  if (DRY_RUN) console.log("  ⚠  SIMULACIÓN — no se escribirá nada en Firestore\n");

  // ── Verificar archivos ────────────────────────────────────────────────────
  if (!existsSync(KEY_PATH)) {
    console.error(`\n❌ Clave de servicio no encontrada: ${KEY_PATH}`);
    console.error("   Pasos para obtenerla:");
    console.error("   1. Firebase Console → Configuración del proyecto → Cuentas de servicio");
    console.error("   2. Clic en «Generar nueva clave privada»");
    console.error("   3. Guarda el archivo como: service-account.json (en la raíz del proyecto)\n");
    process.exit(1);
  }
  if (!existsSync(EXCEL_PATH)) {
    console.error(`\n❌ Archivo Excel no encontrado: ${EXCEL_PATH}\n`);
    process.exit(1);
  }

  // ── Leer Excel ────────────────────────────────────────────────────────────
  console.log(`\n📂 Leyendo Excel: ${EXCEL_PATH}`);
  const workbook = XLSX.readFile(EXCEL_PATH, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(`   ${rows.length} filas encontradas en "${workbook.SheetNames[0]}"\n`);

  // ── Procesar filas ────────────────────────────────────────────────────────
  const listos = [];
  const serviciosDesconocidos = new Map(); // nombre → count
  const advertenciasCama = [];
  const expedientesDuplicados = new Map();
  let omitidos = 0;

  const { Timestamp } = await import("firebase-admin/firestore").then(
    () => import("firebase-admin/firestore")
  ).catch(() => ({ Timestamp: null }));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fila = i + 2;

    const expediente    = row["Expediente Clínico"]?.toString().trim();
    const apellidos     = row["Apellidos"]?.toString().trim();
    const nombres       = row["Nombres"]?.toString().trim();
    const servicioExcel = row["Servicio"]?.toString().trim();

    // Campos obligatorios
    if (!expediente || !apellidos || !nombres || !servicioExcel) {
      console.warn(`  ⚠ Fila ${fila}: campos obligatorios vacíos — omitida`);
      omitidos++;
      continue;
    }

    // Detectar duplicados en el Excel
    if (expedientesDuplicados.has(expediente)) {
      expedientesDuplicados.get(expediente).push(fila);
    } else {
      expedientesDuplicados.set(expediente, [fila]);
    }

    // Resolver servicio
    const servicioApp = resolverServicio(servicioExcel);
    if (!servicioApp) {
      serviciosDesconocidos.set(servicioExcel, (serviciosDesconocidos.get(servicioExcel) ?? 0) + 1);
      omitidos++;
      continue;
    }

    // Fecha de ingreso
    let fechaIngreso = parseFechaHora(row["Fecha y Hora de ingreso"]);
    if (!fechaIngreso) {
      const fi2 = parseFechaHora(row["Fecha Ingreso Servicio"]);
      if (fi2) {
        fechaIngreso = fi2;
      } else {
        console.warn(`  ⚠ Fila ${fila} (${expediente}): sin fecha de ingreso válida — se usará hoy`);
        fechaIngreso = new Date();
      }
    }

    // Fecha de nacimiento
    const fechaNacimiento = parseFechaHora(row["Fecha Nacimiento"]);

    // Cama
    const { cama, advertencia: advertenciaCama } = resolverCama(row["Cama"], servicioApp);
    if (advertenciaCama) advertenciasCama.push({ fila, expediente, servicio: servicioApp, advertencia: advertenciaCama });

    // Diagnósticos
    const diagnosticoIngreso = parsearDiagnostico(row["Diagnóstico de ingreso"]);
    const diagnosticoUltimo  = parsearDiagnostico(row["Último diagnóstico"]);
    const diagnosticosCompl  = (diagnosticoUltimo && diagnosticoUltimo.codigo !== diagnosticoIngreso?.codigo)
      ? [diagnosticoUltimo]
      : [];

    // Responsable
    const respNombre = row["Nombre Responsable"]?.toString().trim();
    const responsable = respNombre ? sinNulos({
      nombre:     respNombre,
      parentesco: row["Parentesco Responsable"]?.toString().trim() || undefined,
      telefono:   row["Teléfono Responsable"]?.toString().trim()   || undefined,
    }) : undefined;

    // Documento paciente
    const paciente = sinNulos({
      expediente,
      apellidos,
      nombres,
      genero:               normalizarGenero(row["Género"]),
      fechaNacimiento:      fechaNacimiento ? "__TIMESTAMP__" : undefined,
      _fechaNacimientoDate: fechaNacimiento,
      dui:                  row["DUI"]?.toString().trim()                      || undefined,
      estadoFamiliar:       row["Estado Familiar"]?.toString().trim()          || undefined,
      ocupacion:            row["Ocupación"]?.toString().trim()                || undefined,
      numeroAfiliacion:     row["Número Afiliación ISSS"]?.toString().trim()  || undefined,
      establecimientoProcedencia: row["Establecimiento Procedencia"]?.toString().trim() || undefined,

      direccion:     row["Dirección"]?.toString().trim()                       || undefined,
      municipio:     limpiarMunicipio(row["Municipio"]),
      departamento:  row["Departamento"]?.toString().trim()                    || undefined,
      area:          normalizarArea(row["Área"]),
      telefono:      row["Teléfono Paciente"]?.toString().trim()               || undefined,

      responsable,

      fechaIngreso:        "__TIMESTAMP__",
      _fechaIngresoDate:   fechaIngreso,
      servicioIngreso:     servicioApp,
      circunstanciaIngreso: normalizarCircunstancia(row["Tipo Ingreso"]),
      medicoIngresoNombre: parsearNombreMedico(row["Médico Ingreso"]),
      diagnosticoIngreso,

      servicioActual: servicioApp,
      camaActual:     cama || undefined,

      diagnosticosComplementarios: diagnosticosCompl.length > 0 ? diagnosticosCompl : undefined,
      movimientos: [],

      estado:          "activo",
      creadoEn:        "__TIMESTAMP_NOW__",
      creadoPor:       "importacion_inicial",
      creadoPorNombre: "Importación Inicial",
    });

    listos.push(paciente);
  }

  // ── Detectar expedientes duplicados ──────────────────────────────────────
  const duplicados = [...expedientesDuplicados.entries()]
    .filter(([, filas]) => filas.length > 1);

  // ── Reporte ───────────────────────────────────────────────────────────────
  console.log("─".repeat(62));
  console.log("📊 RESUMEN DE VALIDACIÓN\n");
  console.log(`  ✅ Listos para importar:       ${listos.length}`);
  console.log(`  ⏭  Omitidos (sin servicio):   ${omitidos}`);
  console.log(`  ⚠  Advertencias de cama:       ${advertenciasCama.length}`);
  console.log(`  🔁 Expedientes duplicados:     ${duplicados.length}`);
  console.log("");

  if (serviciosDesconocidos.size > 0) {
    console.log("❌ SERVICIOS NO RECONOCIDOS (esas filas no se importarán):");
    for (const [nombre, count] of serviciosDesconocidos) {
      console.log(`   • "${nombre}" — ${count} paciente(s)`);
    }
    console.log("");
    console.log("   Para incluirlos, agrega el mapeo en resolverServicio() o");
    console.log("   actualiza el nombre en el Excel para que coincida con servicios.ts\n");
  }

  if (duplicados.length > 0) {
    console.log("⚠  EXPEDIENTES DUPLICADOS EN EL EXCEL (se importarán todos):");
    for (const [exp, filas] of duplicados.slice(0, 10)) {
      console.log(`   • ${exp} — filas ${filas.join(", ")}`);
    }
    if (duplicados.length > 10) console.log(`   ... y ${duplicados.length - 10} más`);
    console.log("");
  }

  if (advertenciasCama.length > 0) {
    console.log("⚠  CAMAS QUE NO COINCIDEN CON EL CATÁLOGO (se importan con valor original):");
    for (const { fila, expediente, advertencia } of advertenciasCama.slice(0, 15)) {
      console.log(`   • Fila ${fila} (${expediente}): ${advertencia}`);
    }
    if (advertenciasCama.length > 15) console.log(`   ... y ${advertenciasCama.length - 15} más`);
    console.log("");
  }

  // Distribución por servicio
  const porServicio = {};
  for (const p of listos) {
    porServicio[p.servicioActual] = (porServicio[p.servicioActual] ?? 0) + 1;
  }
  console.log("📍 DISTRIBUCIÓN POR SERVICIO:");
  for (const [s, n] of Object.entries(porServicio).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(3)}  ${s}`);
  }
  console.log("");

  if (DRY_RUN) {
    console.log("ℹ  Simulación completada. Ejecuta sin --dry-run para importar a Firestore.\n");
    return;
  }

  if (listos.length === 0) {
    console.log("No hay registros válidos para importar.\n");
    return;
  }

  // ── Confirmar e importar ──────────────────────────────────────────────────
  await confirmar(`¿Importar ${listos.length} pacientes a Firestore? Escribe "si" para confirmar: `);

  console.log("\n🔑 Inicializando Firebase Admin...");
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore, Timestamp: TS } = await import("firebase-admin/firestore");
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const ahora = TS.now();

  // Convertir marcadores de Timestamp
  const preparar = (p) => {
    const doc = { ...p };
    if (doc._fechaNacimientoDate) {
      doc.fechaNacimiento = TS.fromDate(doc._fechaNacimientoDate);
    }
    doc.fechaIngreso = TS.fromDate(doc._fechaIngresoDate);
    doc.creadoEn = ahora;
    // Limpiar claves internas
    delete doc._fechaNacimientoDate;
    delete doc._fechaIngresoDate;
    return doc;
  };

  const CHUNK = 400;
  let importados = 0;
  process.stdout.write("\n");
  for (let i = 0; i < listos.length; i += CHUNK) {
    const chunk = listos.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const p of chunk) {
      batch.set(db.collection("pacientes").doc(), preparar(p));
    }
    await batch.commit();
    importados += chunk.length;
    process.stdout.write(`\r  ✅ ${importados}/${listos.length} importados...`);
  }

  console.log(`\n\n🎉 Importación completa: ${importados} pacientes guardados en Firestore.\n`);
}

function confirmar(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      if (answer.toLowerCase() === "si") {
        resolve();
      } else {
        console.log("\nCancelado.\n");
        process.exit(0);
      }
    });
  });
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
