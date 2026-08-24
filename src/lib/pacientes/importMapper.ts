import type { PacienteFormValue } from "@/components/pacientes/PacienteForm";
import { normalizarGenero, normalizarArea } from "@/lib/pacientes/helpers";
import { claveCama, resolverServicioCanonico } from "@/lib/servicios";

// Mapeo del reporte de Excel "pacientes ingresados" → shape del formulario
// (PacienteFormValue), para reutilizar construirDatosPersonales / construirDocIngreso.
// Lógica pura (sin Firebase). Espejo del mapeo de scripts/importar-pacientes.mjs.

export type FilaReporte = Record<string, unknown>;

export interface FilaMapeada {
  expediente: string;
  form: PacienteFormValue;
  valido: boolean;            // false si faltan campos obligatorios (expediente/nombre)
  motivoInvalido?: string;
  servicioReconocido: boolean; // false si el servicio no está en el catálogo
  servicioExcel: string;       // nombre crudo del servicio (para reportar no reconocidos)
  advertenciaCama?: string;
}

// ── Normalizadores ──────────────────────────────────────────────────────────

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

// La normalización de nombres de servicio/cama vive en @/lib/servicios
// (claveServicio, claveCama, ALIAS_SERVICIO, resolverServicioCanonico), para que
// importación, alta manual y edición de ingreso usen exactamente el mismo criterio.

function parseFechaHora(valor: unknown): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  const s = String(valor).trim();
  // DD/MM/YYYY HH:MM  o  DD/MM/YYYY HH:MM:SS AM/PM
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (m1) {
    const [, d, mo, y, hStr, min, ampm] = m1;
    let h = parseInt(hStr, 10);
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

function parsearDiagnostico(str: unknown): { codigo: string; descripcion: string } | undefined {
  const s = txt(str);
  if (!s) return undefined;
  const m = s.match(/^([A-Z]\d{2,3}(?:\.\d+)?)\s*[-–]\s*(.+)$/);
  if (m) return { codigo: m[1].trim(), descripcion: m[2].trim() };
  return { codigo: "", descripcion: s };
}

function parsearNombreMedico(str: unknown): string | undefined {
  const s = txt(str);
  if (!s) return undefined;
  const idx = s.lastIndexOf(" - "); // "NOMBRE APELLIDO - JVPM-123" → solo el nombre
  return idx > 0 ? s.substring(0, idx).trim() : s;
}

function limpiarMunicipio(str: unknown): string | undefined {
  // "San Salvador SS" → "San Salvador" (quita el sufijo de departamento)
  return txt(str).replace(/\s+[A-Z]{2,3}$/, "").trim() || undefined;
}

/** Resuelve el nombre del servicio del Excel contra el catálogo vivo.
 *  Absorbe mayúsculas, tildes, dobles espacios y romanos, y luego consulta la
 *  tabla de alias (siglas y nombres históricos) de @/lib/servicios. */
export function resolverServicio(servicioExcel: unknown, servicios: string[]): string | null {
  return resolverServicioCanonico(servicioExcel, servicios);
}

/** Intenta encajar la cama del Excel con el catálogo del servicio. */
export function resolverCama(
  camaExcel: unknown,
  camasDelServicio: string[],
): { cama: string | null; advertencia?: string } {
  const raw = txt(camaExcel).replace(/\s+/g, "");
  if (!raw) return { cama: null };
  if (camasDelServicio.length === 0) return { cama: raw };
  // Calce por clave: "2", "02" y "  2 " son la misma cama. Se devuelve SIEMPRE la
  // forma que tiene el catálogo, para que dos importaciones nunca difieran.
  const k = claveCama(raw);
  const enCatalogo = camasDelServicio.find((c) => claveCama(c) === k);
  if (enCatalogo) return { cama: enCatalogo };
  return {
    cama: raw,
    advertencia: `"${raw}" no está en el catálogo (esperado: ${camasDelServicio[0] ?? "?"})`,
  };
}

// ── Formato de fechas al shape del formulario ─────────────────────────────────

function toDateInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toDatetimeLocalInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

// ── Mapeo principal ───────────────────────────────────────────────────────────

/**
 * Convierte una fila del reporte en un PacienteFormValue + clasificación.
 * Ignora: Edad, Estancia(días), Tipo Ingreso y la columna vacía.
 */
export function mapearFilaReporte(
  row: FilaReporte,
  servicios: string[],
  getCamas: (servicio: string) => string[],
): FilaMapeada {
  const expediente = txt(row["Expediente Clínico"]);
  const apellidos = txt(row["Apellidos"]);
  const nombres = txt(row["Nombres"]);
  const servicioExcel = txt(row["Servicio"]);

  const base: FilaMapeada = {
    expediente,
    form: {},
    valido: true,
    servicioReconocido: false,
    servicioExcel,
  };

  if (!expediente || !apellidos || !nombres) {
    return { ...base, valido: false, motivoInvalido: "Faltan expediente, apellidos o nombres" };
  }

  const servicioApp = resolverServicio(servicioExcel, servicios);
  const servicioReconocido = servicioApp !== null;

  const fechaIngreso =
    parseFechaHora(row["Fecha y Hora de ingreso"]) ??
    parseFechaHora(row["Fecha Ingreso Servicio"]) ??
    new Date();
  const fechaNacimiento = parseFechaHora(row["Fecha Nacimiento"]);

  const { cama, advertencia } = servicioApp
    ? resolverCama(row["Cama"], getCamas(servicioApp))
    : { cama: txt(row["Cama"]) || null, advertencia: undefined };

  const respNombre = txt(row["Nombre Responsable"]);

  const form: PacienteFormValue = {
    expediente,
    apellidos,
    nombres,
    genero: normalizarGenero(txt(row["Género"])),
    fechaNacimiento: fechaNacimiento ? toDateInput(fechaNacimiento) : undefined,
    estadoFamiliar: txt(row["Estado Familiar"]) || undefined,
    dui: txt(row["DUI"]) || undefined,
    numeroAfiliacion: txt(row["Número Afiliación ISSS"]) || undefined,
    ocupacion: txt(row["Ocupación"]) || undefined,
    direccion: txt(row["Dirección"]) || undefined,
    municipio: limpiarMunicipio(row["Municipio"]),
    departamento: txt(row["Departamento"]) || undefined,
    area: normalizarArea(txt(row["Área"])),
    telefono: txt(row["Teléfono Paciente"]) || undefined,
    responsable: respNombre
      ? {
          nombre: respNombre,
          parentesco: txt(row["Parentesco Responsable"]) || undefined,
          telefono: txt(row["Teléfono Responsable"]) || undefined,
        }
      : undefined,
    establecimientoProcedencia: txt(row["Establecimiento Procedencia"]) || undefined,
    fechaIngreso: toDatetimeLocalInput(fechaIngreso),
    // El reporte trae el servicio/cama ACTUAL del paciente, no el de ingreso.
    // servicioIngreso se deja vacío: el personal lo completa la primera vez.
    servicioActual: servicioApp ?? servicioExcel,
    servicioIngreso: undefined,
    camaActual: cama ?? undefined,
    medicoIngresoNombre: parsearNombreMedico(row["Médico Ingreso"]),
    diagnosticoIngreso: parsearDiagnostico(row["Diagnóstico de ingreso"]),
    ultimoDiagnostico: parsearDiagnostico(row["Último diagnóstico"]),
  };

  return { expediente, form, valido: true, servicioReconocido, servicioExcel, advertenciaCama: advertencia };
}
