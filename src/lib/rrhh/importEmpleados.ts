import type { Empleado } from "@/types";

// Mapea una fila de la hoja CONSULTA (export del sistema de gobierno) a Empleado.
// Los encabezados de CONSULTA son crípticos; se buscan de forma tolerante
// (case-insensitive, con alias) para soportar pequeñas variaciones del export.

type Row = Record<string, unknown>;

function buildGetter(row: Row) {
  const map = new Map<string, unknown>();
  for (const k of Object.keys(row)) map.set(k.trim().toLowerCase(), row[k]);
  return (...names: string[]): unknown => {
    for (const n of names) {
      const v = map.get(n.trim().toLowerCase());
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return undefined;
  };
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? undefined : s;
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function fecha(v: unknown): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d;
}

/** Quita un prefijo tipo "ISSS", "NIT", "NUP" y deja el valor limpio. */
function sinPrefijo(v: unknown, prefijo: string): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const re = new RegExp(`^${prefijo}\\s*`, "i");
  return s.replace(re, "").trim() || undefined;
}

/** "APELLIDOS, NOMBRES" → "NOMBRES APELLIDOS". */
function reordenarNombre(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (s.includes(",")) {
    const [ape, nom] = s.split(",");
    return `${(nom ?? "").trim()} ${(ape ?? "").trim()}`.replace(/\s+/g, " ").trim();
  }
  return s;
}

export interface ResultadoMapeo {
  empleado: Empleado | null;
  motivo?: string;
}

export function mapearEmpleado(row: Row): ResultadoMapeo {
  const get = buildGetter(row);

  const codigoRaw = str(get("codigo"));
  if (!codigoRaw) return { empleado: null, motivo: "sin código" };
  const codigo = codigoRaw.toUpperCase();

  const nombre =
    str(get("columna1", "nombre")) ?? reordenarNombre(get("depersona"));
  if (!nombre) return { empleado: null, motivo: `${codigo}: sin nombre` };

  const estado = str(get("estadop", "statusp"));
  const fechaIngreso = fecha(get("feingreso", "feingspn", "fenomb"));

  const empleado: Empleado = {
    codigo,
    nombre,
    nit: sinPrefijo(get("nit", "doc4"), "NIT") ?? str(get("nit")),
    isss: sinPrefijo(get("doc2"), "ISSS"),
    nup: sinPrefijo(get("doc5"), "NUP"),
    afp: str(get("pens", "afp")),
    cargo: str(get("depuesto", "inpuesto", "cargo")),
    departamento: str(get("deuniorg", "departamento")),
    fechaIngreso,
    sueldoBasico: num(get("ultbasico")),
    partidaPresupuestaria: str(get("partida")),
    unidadPresupuestaria: str(get("ul")),
    lineaTrabajo: str(get("lt")),
    codigoPresupuestario: str(get("codigo presupuestario")),
    estadoPlaza: estado,
    email: str(get("email")),
    celular: str(get("celular")),
    activo: estado ? /ocupad/i.test(estado) : true,
  };

  // Limpia undefined para no escribir campos vacíos en Firestore.
  (Object.keys(empleado) as (keyof Empleado)[]).forEach((k) => {
    if (empleado[k] === undefined) delete empleado[k];
  });

  return { empleado };
}
