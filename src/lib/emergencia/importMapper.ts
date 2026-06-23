import type { AtencionEmergencia, Genero, IngresoHospitalizacion } from "@/types";
import { normalizarGenero } from "@/lib/pacientes/helpers";

// Mapeo del reporte del SIS "Pacientes Atendidos En Emergencia" (HTML exportado
// como .xls) → AtencionEmergencia. Lógica pura, sin Firebase.
//
// El reporte trae una fila de título (banner) antes del encabezado real, por eso
// el parseo de la hoja localiza el encabezado y arma objetos por nombre de columna
// (ver localizarFilas). Cada fila ya viene como Record<columna, valor>.

export type FilaReporteEmergencia = Record<string, unknown>;

// Datos de la atención sin la metadata de importación (la pone la página al guardar).
export type DatosAtencion = Omit<
  AtencionEmergencia,
  "id" | "importadoEn" | "importadoPorId" | "importadoPorNombre" | "archivoOrigen"
>;

export interface FilaEmergenciaMapeada {
  valido: boolean;
  motivoInvalido?: string;
  dedupId: string;          // id determinista del documento (idempotencia al reimportar)
  expediente: string;
  pacienteNombre: string;
  ingresoHospitalizacion: IngresoHospitalizacion;
  datos: DatosAtencion;
}

// ── Normalizadores ──────────────────────────────────────────────────────────

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

/** Parsea "DD/MM/YYYY HH:MM:SS" (o sin segundos, o con AM/PM) a Date local. */
export function parseFechaHoraEmergencia(valor: unknown): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  const s = String(valor).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  const [, d, mo, y, hStr, min, sec, ampm] = m;
  let h = parseInt(hStr, 10);
  if (ampm?.toUpperCase() === "PM" && h < 12) h += 12;
  if (ampm?.toUpperCase() === "AM" && h === 12) h = 0;
  const fecha = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), h, parseInt(min), sec ? parseInt(sec) : 0);
  return isNaN(fecha.getTime()) ? null : fecha;
}

/** "5752-26 - ADRIANA DEL CARMEN..." → { expediente, nombre } (parte en el primer " - "). */
export function partirExpedienteNombre(valor: unknown): { expediente: string; nombre: string } {
  const s = txt(valor);
  const idx = s.indexOf(" - ");
  if (idx < 0) return { expediente: s, nombre: "" };
  return { expediente: s.slice(0, idx).trim(), nombre: s.slice(idx + 3).trim() };
}

/** "SI" → true, "NO"/vacío → false. */
function siNo(valor: unknown): boolean {
  return txt(valor).toUpperCase().startsWith("S");
}

/** "SI" → "si", "NO" → "no", vacío/otro → "sin_dato". */
function normalizarIngreso(valor: unknown): IngresoHospitalizacion {
  const s = txt(valor).toUpperCase();
  if (s.startsWith("S")) return "si";
  if (s.startsWith("N")) return "no";
  return "sin_dato";
}

/** Años al frente del texto de edad ("30 años 11 meses..." → 30). */
function aniosDeEdad(valor: unknown): number | undefined {
  const m = txt(valor).match(/^(\d+)\s*año/i);
  return m ? parseInt(m[1], 10) : undefined;
}

// ── Id determinista ───────────────────────────────────────────────────────────

/** Id de documento estable por visita: expediente + timestamp de ingreso. */
export function idAtencion(expediente: string, fecha: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}${p(fecha.getHours())}${p(fecha.getMinutes())}${p(fecha.getSeconds())}`;
  // Saneo defensivo: los ids de Firestore no admiten "/".
  return `${expediente.replace(/\//g, "-")}__${stamp}`;
}

// ── Mapeo principal ───────────────────────────────────────────────────────────

// Nombres EXACTOS de las columnas del reporte del SIS.
export const COL = {
  fechaHoraIngreso: "Fecha hora ingreso",
  expedienteNombre: "Expediente -Nombre de Paciente",
  dui: "DUI",
  sexo: "Sexo",
  edad: "Edad",
  medicoTriage: "Médico realiza el triage",
  especialidadTriage: "Especialidad Médico Triage",
  medicoAtiende: "Médico atiende",
  especialidadAtiende: "Especialidad Médico Atiende",
  veterano: "Veterano de Guerra",
  referido: "Llega referido",
  ingreso: "Ingresó a hospitalización",
  tipoEgreso: "Tipo de egreso",
  diagnostico: "Diagnóstico",
  categorizacion: "Categorización",
  fechaHoraAlta: "Fecha hora alta o ingreso",
  tiempoTotal: "Tiempo total emergencia",
  establecimiento: "Establecimiento procedencia",
} as const;

/**
 * Convierte una fila del reporte en AtencionEmergencia + clasificación.
 * Inválida si falta expediente o fecha de ingreso (la llave de la visita).
 */
export function mapearFilaEmergencia(row: FilaReporteEmergencia): FilaEmergenciaMapeada {
  const { expediente, nombre } = partirExpedienteNombre(row[COL.expedienteNombre]);
  const fechaHoraIngreso = parseFechaHoraEmergencia(row[COL.fechaHoraIngreso]);

  const base: FilaEmergenciaMapeada = {
    valido: true,
    dedupId: "",
    expediente,
    pacienteNombre: nombre,
    ingresoHospitalizacion: "sin_dato",
    datos: {} as DatosAtencion,
  };

  if (!expediente) return { ...base, valido: false, motivoInvalido: "Falta el expediente" };
  if (!fechaHoraIngreso) return { ...base, valido: false, motivoInvalido: "Fecha/hora de ingreso inválida" };

  const ingresoHospitalizacion = normalizarIngreso(row[COL.ingreso]);
  const genero: Genero = normalizarGenero(txt(row[COL.sexo]));
  const fechaHoraAlta = parseFechaHoraEmergencia(row[COL.fechaHoraAlta]);

  // Construcción del doc: solo claves definidas (Firestore rechaza undefined).
  const datos: DatosAtencion = {
    expediente,
    pacienteNombre: nombre,
    genero,
    fechaHoraIngreso,
    ingresoHospitalizacion,
    llegaReferido: siNo(row[COL.referido]),
    veteranoGuerra: siNo(row[COL.veterano]),
  };
  const asignar = (k: keyof DatosAtencion, v: unknown) => {
    const s = txt(v);
    if (s) (datos as Record<string, unknown>)[k] = s;
  };
  asignar("dui", row[COL.dui]);
  asignar("edadTexto", row[COL.edad]);
  const anios = aniosDeEdad(row[COL.edad]);
  if (anios !== undefined) datos.edadAnios = anios;
  asignar("tipoEgreso", row[COL.tipoEgreso]);
  asignar("diagnostico", row[COL.diagnostico]);
  asignar("categorizacion", row[COL.categorizacion]);
  asignar("medicoTriage", row[COL.medicoTriage]);
  asignar("especialidadTriage", row[COL.especialidadTriage]);
  asignar("medicoAtiende", row[COL.medicoAtiende]);
  asignar("especialidadAtiende", row[COL.especialidadAtiende]);
  asignar("tiempoTotalEmergencia", row[COL.tiempoTotal]);
  asignar("establecimientoProcedencia", row[COL.establecimiento]);
  if (fechaHoraAlta) datos.fechaHoraAltaIngreso = fechaHoraAlta;

  return {
    valido: true,
    dedupId: idAtencion(expediente, fechaHoraIngreso),
    expediente,
    pacienteNombre: nombre,
    ingresoHospitalizacion,
    datos,
  };
}

/**
 * Localiza el encabezado real del reporte (salta el banner de título) y devuelve
 * las filas de datos como objetos { columna: valor }. Recibe la hoja ya leída como
 * matriz (XLSX.utils.sheet_to_json con { header: 1 }).
 */
export function localizarFilas(matriz: unknown[][]): FilaReporteEmergencia[] {
  const idxHeader = matriz.findIndex(
    (fila) => Array.isArray(fila) && fila.some((c) => txt(c) === COL.expedienteNombre),
  );
  if (idxHeader < 0) return [];
  const headers = (matriz[idxHeader] as unknown[]).map((h) => txt(h));
  return matriz.slice(idxHeader + 1).map((fila) => {
    const obj: FilaReporteEmergencia = {};
    headers.forEach((h, i) => { if (h) obj[h] = (fila as unknown[])[i]; });
    return obj;
  });
}
