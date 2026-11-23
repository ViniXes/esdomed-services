// Reporte del SIS "Expedientes creados": lector y reglas puras (sin Firebase),
// compartidas por la pantalla de carga, la API y la prueba
// (node scripts/test-expedientes-creados.mjs).
//
// Para qué sirve: registrar la productividad de quien creó cada expediente en
// Consulta Externa y agregar al padrón (personas/{expediente}) a los pacientes
// que services aún no conoce, SOLO como datos de persona: no son pre-ingresos,
// ni ingresos, ni atenciones de emergencia.

export type GeneroReporte = "masculino" | "femenino" | "otro";

export interface ExpedienteCreado {
  expediente: string;
  apellidos: string;
  nombres: string;
  /** Nombre tal como viene en el reporte ("Apellidos, Nombres"). */
  nombreCompleto: string;
  genero: GeneroReporte;
  /** YYYY-MM-DD, o "" si el reporte no la trae o no se entiende. */
  fechaNacimiento: string;
  nombreMadre: string;
  /** Quién creó el expediente, tal cual lo escribe el SIS. */
  creadoPor: string;
  /** YYYY-MM-DD */
  fechaCreacion: string;
  area: string;
}

export interface FilaInvalida { fila: number; expediente: string; motivo: string }

export interface LecturaExpedientesCreados {
  /** Solo Consulta Externa, sin expedientes repetidos. */
  filas: ExpedienteCreado[];
  /** Filas de otras áreas de creación (no se usan). */
  otrasAreas: { area: string; total: number }[];
  invalidas: FilaInvalida[];
  repetidas: number;
  totalFilas: number;
}

export const AREA_CONSULTA_EXTERNA = "Consulta Externa";
export const ORIGEN_PERSONA_CE = "sis_expedientes_creados_ce";
export const COLECCION_EXPEDIENTES_CE = "consulta_externa_expedientes_creados";
export const MAX_FILAS_POR_CARGA = 5000;
/** Quién sube el reporte: ESDOMED, admin y las digitadoras de Consulta Externa (agenda_ce). */
export const ROLES_SUBEN_EXPEDIENTES_CE: readonly string[] = ["esdomed", "asistente_esdomed", "admin", "agenda_ce"];
/** Quién ve la pestaña Consulta Externa de Productividad. Por ahora, admin. */
export const ROLES_VEN_PRODUCTIVIDAD_CE: readonly string[] = ["admin"];
/**
 * Quién lee GET /api/productividad/expedientes-ce: los que ven la pestaña y el
 * asistente administrativo, que la usa en la pestaña Administrativos (lo que los
 * administrativos produjeron en Consulta Externa). Solo devuelve conteos por
 * persona y fecha, sin datos de pacientes.
 */
export const ROLES_LEEN_PRODUCTIVIDAD_CE: readonly string[] = ["admin", "asistente_esdomed"];

/** Mayúsculas, sin tildes y con un solo espacio: para comparar textos del SIS. */
export function claveTexto(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizarExpediente(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, "").replace(/[‐-―]/g, "-").toUpperCase();
}

export function esAreaConsultaExterna(area: unknown): boolean {
  return claveTexto(area) === claveTexto(AREA_CONSULTA_EXTERNA);
}

const ENCABEZADOS = {
  expediente: ["NUMERO DE EXPEDIENTE", "EXPEDIENTE"],
  nombre: ["NOMBRE COMPLETO PACIENTE", "NOMBRE COMPLETO DEL PACIENTE", "NOMBRE COMPLETO", "PACIENTE"],
  sexo: ["SEXO"],
  nacimiento: ["FECHA DE NACIMIENTO"],
  madre: ["NOMBRE DE LA MADRE"],
  creador: ["CREO EXPEDIENTE", "CREADO POR"],
  fechaCreacion: ["FECHA DE CREACION"],
  area: ["AREA CREACION", "AREA DE CREACION"],
} as const;
type Campo = keyof typeof ENCABEZADOS;

/** Fecha del reporte (dd/mm/aaaa, Date de SheetJS o serial de Excel) → YYYY-MM-DD. */
export function fechaReporteISO(valor: unknown): string {
  if (valor == null || valor === "") return "";
  const iso = (a: number, m: number, d: number) => {
    const f = new Date(Date.UTC(a, m - 1, d));
    if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return "";
    return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return "";
    return iso(valor.getFullYear(), valor.getMonth() + 1, valor.getDate());
  }
  if (typeof valor === "number" && valor > 0 && valor < 100000) {
    // Serial de Excel (días desde 1899-12-30).
    const f = new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000);
    return iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }
  const s = String(valor).trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  return "";
}

export function generoReporte(sexo: unknown): GeneroReporte {
  const s = claveTexto(sexo);
  if (s.startsWith("MASC") || s === "M" || s === "HOMBRE") return "masculino";
  if (s.startsWith("FEM") || s === "F" || s === "MUJER") return "femenino";
  return "otro";
}

/** "Apellidos, Nombres" → partes. Sin coma, todo queda como apellidos. */
export function partirNombre(nombre: unknown): { apellidos: string; nombres: string } {
  const s = String(nombre ?? "").replace(/\s+/g, " ").trim();
  const i = s.indexOf(",");
  if (i < 0) return { apellidos: s, nombres: "" };
  return { apellidos: s.slice(0, i).trim(), nombres: s.slice(i + 1).trim() };
}

/** Ubica la fila de encabezados y la columna de cada campo. */
function ubicarEncabezados(filas: unknown[][]): { fila: number; col: Partial<Record<Campo, number>> } | null {
  for (let r = 0; r < Math.min(filas.length, 15); r++) {
    const col: Partial<Record<Campo, number>> = {};
    (filas[r] ?? []).forEach((celda, c) => {
      const k = claveTexto(celda);
      for (const campo of Object.keys(ENCABEZADOS) as Campo[]) {
        if (col[campo] === undefined && (ENCABEZADOS[campo] as readonly string[]).includes(k)) col[campo] = c;
      }
    });
    if (col.expediente !== undefined && col.area !== undefined && col.creador !== undefined) return { fila: r, col };
  }
  return null;
}

/**
 * Lee el reporte como matriz (SheetJS `sheet_to_json(..., { header: 1 })`).
 * Lanza un Error con mensaje para el usuario si no es el reporte esperado.
 */
export function leerExpedientesCreados(filas: unknown[][]): LecturaExpedientesCreados {
  const enc = ubicarEncabezados(filas);
  if (!enc) {
    throw new Error("No parece el reporte de expedientes creados: faltan las columnas \"Número de Expediente\", \"Creó Expediente\" o \"Area Creación\".");
  }
  const { col } = enc;
  const celda = (fila: unknown[], campo: Campo) => (col[campo] === undefined ? undefined : fila[col[campo]!]);
  const texto = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

  const vistos = new Set<string>();
  const otras = new Map<string, number>();
  const salida: LecturaExpedientesCreados = { filas: [], otrasAreas: [], invalidas: [], repetidas: 0, totalFilas: 0 };

  for (let r = enc.fila + 1; r < filas.length; r++) {
    const fila = filas[r] ?? [];
    if (fila.every((v) => v == null || String(v).trim() === "")) continue;
    salida.totalFilas++;
    const area = texto(celda(fila, "area"));
    if (!esAreaConsultaExterna(area)) {
      const k = area || "(sin área)";
      otras.set(k, (otras.get(k) ?? 0) + 1);
      continue;
    }
    const expediente = normalizarExpediente(celda(fila, "expediente"));
    const nombreCompleto = texto(celda(fila, "nombre"));
    const creadoPor = texto(celda(fila, "creador"));
    const fechaCreacion = fechaReporteISO(celda(fila, "fechaCreacion"));
    const numFila = r + 1;
    const invalida = (motivo: string) => salida.invalidas.push({ fila: numFila, expediente, motivo });
    if (!expediente) { invalida("Sin número de expediente."); continue; }
    if (!nombreCompleto) { invalida("Sin nombre del paciente."); continue; }
    if (!creadoPor) { invalida("No dice quién creó el expediente."); continue; }
    if (!fechaCreacion) { invalida("Fecha de creación vacía o no válida."); continue; }
    if (vistos.has(expediente)) { salida.repetidas++; continue; }
    vistos.add(expediente);
    const { apellidos, nombres } = partirNombre(nombreCompleto);
    salida.filas.push({
      expediente,
      apellidos,
      nombres,
      nombreCompleto,
      genero: generoReporte(celda(fila, "sexo")),
      fechaNacimiento: fechaReporteISO(celda(fila, "nacimiento")),
      nombreMadre: texto(celda(fila, "madre")),
      creadoPor,
      fechaCreacion,
      area: AREA_CONSULTA_EXTERNA,
    });
  }
  salida.otrasAreas = Array.from(otras, ([area, total]) => ({ area, total })).sort((a, b) => b.total - a.total);
  return salida;
}

/**
 * Empareja el nombre del SIS con el roster de usuarios de services. Solo
 * coincidencia completa (sin importar mayúsculas, tildes ni espacios), igual
 * que Productividad: un nombre incompleto no se atribuye a nadie.
 */
export function emparejarCreador<T extends { nombre: string }>(creadoPor: string, usuarios: T[]): T | null {
  const k = claveTexto(creadoPor);
  if (!k) return null;
  return usuarios.find((u) => claveTexto(u.nombre) === k) ?? null;
}

/** Valida una fila que llega a la API (viene del navegador: no se confía en ella). */
export function sanearFilaRecibida(v: unknown): ExpedienteCreado | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const t = (x: unknown, max = 200) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const expediente = normalizarExpediente(o.expediente).slice(0, 30);
  const nombreCompleto = t(o.nombreCompleto);
  const creadoPor = t(o.creadoPor);
  const fechaCreacion = fechaReporteISO(o.fechaCreacion);
  if (!expediente || expediente.includes("/") || !nombreCompleto || !creadoPor || !fechaCreacion) return null;
  if (!esAreaConsultaExterna(o.area)) return null;
  const { apellidos, nombres } = partirNombre(nombreCompleto);
  const genero = o.genero === "masculino" || o.genero === "femenino" ? o.genero : "otro";
  return {
    expediente,
    apellidos,
    nombres,
    nombreCompleto,
    genero,
    fechaNacimiento: fechaReporteISO(o.fechaNacimiento),
    nombreMadre: t(o.nombreMadre),
    creadoPor,
    fechaCreacion,
    area: AREA_CONSULTA_EXTERNA,
  };
}

/** "YYYY-MM" → primer y último día ("YYYY-MM-DD") para filtrar por fechaCreacion. */
export function rangoMesISO(mes: string): [string, string] | null {
  const m = mes.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const anio = Number(m[1]);
  const numero = Number(m[2]);
  if (numero < 1 || numero > 12) return null;
  const dias = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  return [`${mes}-01`, `${mes}-${String(dias).padStart(2, "0")}`];
}
