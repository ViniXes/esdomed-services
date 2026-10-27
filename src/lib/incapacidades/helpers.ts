import type { ContinuacionIncapacidad, Paciente, ReposicionIncapacidad, SolicitudIncapacidad } from "@/types";
import { toDate } from "@/lib/pacientes/helpers";

/**
 * Momento en que la incapacidad llegó a la bandeja de ESDOMED para emitir.
 * Flujo normal: cuando el médico la envió (`creadoEn`). Reposición: cuando el
 * médico completó los datos clínicos (`reposicion.completadaEn`); antes de eso
 * la había cargado ESDOMED y estaba "con el médico", así que `creadoEn` no
 * mide la espera de ESDOMED. Sirve para auditar horas de envío vs. emisión.
 */
export function recibidaEnEsdomed(s: SolicitudIncapacidad): Date {
  return toDate(s.reposicion?.completadaEn) ?? s.creadoEn;
}

/**
 * Construye un `Paciente` para la constancia a partir de la incapacidad cuando no
 * hay un ingreso en /pacientes (caso emergencia). Usa el snapshot de la incapacidad
 * y `datosConstancia` (completado al imprimir desde la Hoja de Identificación, sin
 * tocar el padrón `personas`).
 */
export function pacienteDesdeIncapacidad(inc: SolicitudIncapacidad): Paciente {
  const dc = inc.datosConstancia ?? {};
  return {
    id: inc.pacienteId ?? inc.id ?? "",
    expediente: inc.pacienteExpediente,
    apellidos: dc.apellidos ?? inc.pacienteNombre ?? "",
    nombres: dc.nombres ?? "",
    genero: dc.genero ?? inc.pacienteGenero ?? "otro",
    dui: dc.dui ?? inc.pacienteDui,
    numeroAfiliacion: dc.numeroAfiliacion,
    ocupacion: dc.ocupacion,
    telefono: dc.telefono,
    otrosNumeros: dc.otrosNumeros,
    direccion: dc.direccion,
    municipio: dc.municipio,
    departamento: dc.departamento,
    responsable: dc.responsable,
    // Reposición: el ingreso "original" es el del FIEH, aunque fechaDesde ya
    // traiga una corrección de ESDOMED (así la corrección se puede revertir).
    // toDate() por si el documento llegó sin pasar por mapIncapacidadData y el
    // bloque `reposicion` trae Timestamps crudos.
    fechaIngreso: toDate(inc.reposicion?.fiehFechaIngreso) ?? toDate(inc.fechaDesde) ?? new Date(),
    servicioIngreso: inc.servicioPaciente,
    servicioActual: inc.servicioPaciente,
    camaActual: inc.camaPaciente,
    estado: "activo",
    creadoEn: new Date(),
    creadoPor: "",
    creadoPorNombre: "",
  } as Paciente;
}

// ── Conversión de fechas de <input type="date"> ──────────────────────────────

/**
 * Parsea una fecha "YYYY-MM-DD" (de un <input type="date">) como fecha LOCAL,
 * a medianoche del huso del usuario.
 *
 * `new Date("YYYY-MM-DD")` interpreta el string como medianoche UTC, lo que en
 * El Salvador (UTC-6) cae el día anterior y corre la fecha un día hacia atrás.
 * Construir la fecha con (año, mes, día) evita ese corrimiento.
 */
export function parseDateInput(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// ── Cálculo de fechas ────────────────────────────────────────────────────────

/** Devuelve una copia de la fecha a medianoche local (sin hora). */
export function aMedianocheLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * ¿La fecha de alta cae en un día calendario ANTERIOR al del ingreso?
 * Compara solo días (medianoche local): `fechaIngreso` trae hora (p. ej. 10:30)
 * y la fecha de alta del formulario se parsea a medianoche — comparar con hora
 * rechazaba el caso legítimo de ingreso y alta EL MISMO DÍA (alta voluntaria,
 * retiro el mismo día del ingreso).
 */
export function altaAntesDelIngreso(fechaAlta: Date, fechaIngreso: Date): boolean {
  return aMedianocheLocal(fechaAlta).getTime() < aMedianocheLocal(fechaIngreso).getTime();
}

/**
 * Días de hospitalización contados de forma inclusiva (ingreso + alta ambos cuentan).
 * Ej: ingreso 1/1, alta 10/1 → 10 días.
 *
 * Se comparan solo los días calendario (medianoche local): `fechaIngreso` suele
 * traer hora de ingreso (p.ej. 14:30), y al restarla contra una `fechaAlta` a
 * medianoche el redondeo perdía un día — el día de alta no se contaba.
 */
export function calcularDiasHospitalizacion(fechaIngreso: Date, fechaAlta: Date): number {
  const ingreso = aMedianocheLocal(fechaIngreso);
  const alta = aMedianocheLocal(fechaAlta);
  return Math.round((alta.getTime() - ingreso.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Fecha hasta de la incapacidad = fecha de alta + días adicionales post-alta.
 * HNES convention: hasta = alta + diasExtras (el día "hasta" incluye ese día completo).
 */
export function calcularFechaHasta(fechaAlta: Date, diasExtras: number): Date {
  const hasta = new Date(fechaAlta);
  hasta.setDate(hasta.getDate() + diasExtras);
  return hasta;
}

/** Día calendario siguiente, a medianoche local. */
export function diaSiguiente(d: Date): Date {
  const r = aMedianocheLocal(d);
  r.setDate(r.getDate() + 1);
  return r;
}

export interface PeriodoIncapacidad {
  desde: Date;
  hasta: Date;
  /** Días de estancia que cuenta ESTA constancia (0 si los cubre la anterior). */
  diasHospitalizacion: number;
  total: number;
}

/**
 * Período de la constancia — único cálculo para médico, ESDOMED y correcciones.
 *
 * - Hospitalización: desde = ingreso, hasta = alta + días adicionales,
 *   total = estancia + adicionales.
 * - Emergencia: desde = inicio (`fechaAlta`), hasta = inicio + (días − 1),
 *   total = días prescritos.
 * - Continuación (`hastaAnterior`: el paciente ya estaba incapacitado por otra
 *   constancia que termina ese día): el período arranca el día siguiente para
 *   no traslaparse, la estancia ya cubierta no se cuenta otra vez y los días
 *   adicionales corren desde que termina la anterior (o desde el alta, si la
 *   estancia siguió después). Ej.: anterior hasta 28/10, ingreso 19/10, alta
 *   20/10, 90 días → del 29/10 al 26/01, 90 días.
 *   Si la anterior termina antes del ingreso/inicio no hay traslape y se ignora.
 */
export function calcularPeriodoIncapacidad(p: {
  fechaIngreso?: Date;
  fechaAlta: Date;
  dias: number;
  emergencia?: boolean;
  hastaAnterior?: Date | null;
}): PeriodoIncapacidad {
  const anterior = p.hastaAnterior ? aMedianocheLocal(p.hastaAnterior) : null;

  if (p.emergencia || !p.fechaIngreso) {
    const inicio = p.fechaAlta;
    const desde = anterior && anterior.getTime() >= aMedianocheLocal(inicio).getTime()
      ? diaSiguiente(anterior)
      : inicio;
    return { desde, hasta: calcularFechaHasta(desde, p.dias - 1), diasHospitalizacion: 0, total: p.dias };
  }

  if (!anterior || anterior.getTime() < aMedianocheLocal(p.fechaIngreso).getTime()) {
    const diasHospitalizacion = calcularDiasHospitalizacion(p.fechaIngreso, p.fechaAlta);
    return {
      desde: p.fechaIngreso,
      hasta: calcularFechaHasta(p.fechaAlta, p.dias),
      diasHospitalizacion,
      total: diasHospitalizacion + p.dias,
    };
  }

  const desde = diaSiguiente(anterior);
  const estanciaCubierta = aMedianocheLocal(p.fechaAlta).getTime() <= anterior.getTime();
  const diasHospitalizacion = estanciaCubierta ? 0 : calcularDiasHospitalizacion(desde, p.fechaAlta);
  return {
    desde,
    hasta: calcularFechaHasta(estanciaCubierta ? anterior : p.fechaAlta, p.dias),
    diasHospitalizacion,
    total: diasHospitalizacion + p.dias,
  };
}

/**
 * Días adicionales post-alta guardados (hospitalización), derivados de las
 * fechas: hasta − alta, o hasta − fin de la anterior si es continuación y la
 * anterior terminaba después del alta.
 */
export function diasAdicionalesGuardados(
  inc: Pick<SolicitudIncapacidad, "fechaAlta" | "fechaHasta" | "continuaDe">,
): number {
  const alta = aMedianocheLocal(inc.fechaAlta);
  const anterior = inc.continuaDe ? aMedianocheLocal(inc.continuaDe.hastaAnterior) : null;
  const base = anterior && anterior.getTime() > alta.getTime() ? anterior : alta;
  return Math.max(0, Math.round((aMedianocheLocal(inc.fechaHasta).getTime() - base.getTime()) / (1000 * 60 * 60 * 24)));
}

// ── Formato de fechas para la constancia ─────────────────────────────────────

const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Formato "25 mayo, 2026" (como aparece en la constancia oficial). */
export function formatFechaConstancia(d: Date): string {
  return `${d.getDate()} ${MESES_ES[d.getMonth()]}, ${d.getFullYear()}`;
}

/** Formato "25/05/2026". */
export function formatFechaCorta(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Formato "DD/M/YYYY" como aparece en el ejemplo de constancia (4/5/2026). */
export function formatFechaConstanciaCorta(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// ── Número a letras (español, 0–999) ─────────────────────────────────────────

const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const ESPECIALES_10_19 = [
  "diez", "once", "doce", "trece", "catorce", "quince",
  "dieciséis", "diecisiete", "dieciocho", "diecinueve",
];
const ESPECIALES_20_29 = [
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro",
  "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const DECENAS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta",
  "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos",
  "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function _0_99(n: number): string {
  if (n === 0) return "";
  if (n < 10) return UNIDADES[n];
  if (n < 20) return ESPECIALES_10_19[n - 10];
  if (n < 30) return ESPECIALES_20_29[n - 20];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (u === 0) return DECENAS[d];
  return `${DECENAS[d]} y ${UNIDADES[u]}`;
}

function _0_999(n: number): string {
  if (n === 0) return "cero";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const cent = c > 0 ? CENTENAS[c] : "";
  const rest = _0_99(resto);
  if (cent && rest) return `${cent} ${rest}`;
  return cent || rest;
}

/**
 * Convierte un número entero (0–9999) a su representación en letras en español.
 * Para incapacidades es más que suficiente (raramente exceden 365 días).
 */
export function numeroALetras(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  const entero = Math.floor(n);
  if (entero < 1000) return _0_999(entero);
  // Hasta 9999 — incapacidades muy raras pero por si acaso
  const miles = Math.floor(entero / 1000);
  const resto = entero % 1000;
  const milesStr = miles === 1 ? "mil" : `${_0_999(miles)} mil`;
  if (resto === 0) return milesStr;
  return `${milesStr} ${_0_999(resto)}`;
}

// ── Firestore → SolicitudIncapacidad ─────────────────────────────────────────

/** Convierte el bloque `reposicion` crudo de Firestore (Timestamps) a fechas. */
export function reposicionDesdeData(raw: unknown): ReposicionIncapacidad | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  return {
    creadaPorId: String(r.creadaPorId ?? ""),
    creadaPorNombre: String(r.creadaPorNombre ?? ""),
    asignadaEn: toDate(r.asignadaEn) ?? new Date(),
    asignadaPorNombre: r.asignadaPorNombre ? String(r.asignadaPorNombre) : undefined,
    completadaEn: toDate(r.completadaEn),
    cargaManual: r.cargaManual === true,
    archivoNombre: r.archivoNombre ? String(r.archivoNombre) : undefined,
    fiehFechaIngreso: toDate(r.fiehFechaIngreso),
    fiehFechaEgreso: toDate(r.fiehFechaEgreso),
    fiehServicio: r.fiehServicio ? String(r.fiehServicio) : undefined,
    fiehMedicoAlta: r.fiehMedicoAlta ? String(r.fiehMedicoAlta) : undefined,
    fiehJvpm: r.fiehJvpm ? String(r.fiehJvpm) : undefined,
  };
}

/** Convierte el bloque `continuaDe` crudo de Firestore (Timestamps) a fechas. */
export function continuacionDesdeData(raw: unknown): ContinuacionIncapacidad | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const hastaAnterior = toDate(r.hastaAnterior);
  if (!hastaAnterior) return undefined;
  return {
    hastaAnterior,
    desdeAnterior: toDate(r.desdeAnterior),
    incapacidadAnteriorId: r.incapacidadAnteriorId ? String(r.incapacidadAnteriorId) : undefined,
    aplicadaPor: String(r.aplicadaPor ?? ""),
    aplicadaEn: toDate(r.aplicadaEn) ?? new Date(),
    aclaracion: r.aclaracion ? String(r.aclaracion) : undefined,
  };
}

/** Mapea un documento de /incapacidades convirtiendo todas las fechas a Date. */
export function mapIncapacidadData(id: string, data: Record<string, unknown>): SolicitudIncapacidad {
  return {
    ...(data as object),
    id,
    fechaAlta: toDate(data.fechaAlta) ?? new Date(),
    fechaDesde: toDate(data.fechaDesde) ?? new Date(),
    fechaHasta: toDate(data.fechaHasta) ?? new Date(),
    creadoEn: toDate(data.creadoEn) ?? new Date(),
    emitidaEn: toDate(data.emitidaEn),
    fechaExpedicion: toDate(data.fechaExpedicion),
    fechaIngresoCorregida: toDate(data.fechaIngresoCorregida),
    fechaIngresoCorregidaEn: toDate(data.fechaIngresoCorregidaEn),
    diasCorregidosEn: toDate(data.diasCorregidosEn),
    reposicion: reposicionDesdeData(data.reposicion),
    continuaDe: continuacionDesdeData(data.continuaDe),
  } as SolicitudIncapacidad;
}
