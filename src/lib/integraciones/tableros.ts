import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { SERVICIOS_HOSPITALARIOS, claveServicio, resolverServicioCanonico } from "@/lib/servicios";
import type { EstadoPaciente, Genero } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Tableros de integración: definición de los grupos de servicios y métricas que
// se exponen a OTROS sistemas vía `GET /api/integraciones/tableros/{id}`.
//
// Para agregar un tablero nuevo basta con añadir una entrada a TABLEROS. Los
// nombres de servicio se escriben como en el catálogo canónico
// (`src/lib/servicios.ts`); la comparación contra `servicioActual` de cada
// paciente se hace SIEMPRE por clave (`claveServicio`), nunca literal, así que
// las variantes de mayúsculas/tildes/espacios del SIS no pierden egresos.
//
// Semántica (idéntica a la Reportería → Tabuladores del dashboard):
//   • Egresos  = docs de `pacientes` con `fechaEgreso` en el rango. El servicio
//                del egreso es `servicioActual` (donde estaba al egresar). Un
//                reingreso egresado dos veces cuenta dos veces.
//   • Vivos    = estado ∈ {alta_vivo, alta_voluntaria, referido, fuga, in_extremis}
//   • Fallecidos = estado == alta_fallecido
//   • Ingresos = docs de `pacientes` por `fechaIngreso`, sin importar estado.
// Las fechas se interpretan en hora de El Salvador (UTC-6, sin horario de verano).
// ─────────────────────────────────────────────────────────────────────────────

export const ZONA_HORARIA = "America/El_Salvador";
const TZ_OFFSET = "-06:00";

export type TableroId =
  | "medicina-interna"
  | "cirugia"
  | "convenios"
  | "uci"
  | "ucin"
  | "paliativos"
  | "apoyo-riiss";
export type MetricaTablero = "egresos" | "ingresos";

export interface DefinicionTablero {
  id: TableroId;
  nombre: string;
  metrica: MetricaTablero;
  descripcion: string;
  /** Servicios del grupo (nombres canónicos). Vacío = todo el hospital. */
  servicios: readonly string[];
}

export const TABLEROS: readonly DefinicionTablero[] = [
  {
    id: "medicina-interna",
    nombre: "Hospitalización Medicina Interna",
    metrica: "egresos",
    descripcion: "Egresos (vivos y fallecidos) de los servicios de Medicina Interna",
    servicios: [
      "Medicina Interna Hombres 1",
      "Medicina Interna Hombres 2",
      "Medicina Interna Hombres 3",
      "Medicina Interna Mujeres 1",
      "Medicina Interna Mujeres 2",
      "Medicina Interna Mujeres 3",
      "Servicio de Cardiologia",
      "Servicio de Hematologia",
      "Servicio de Aislados",
      "Servicio de Oncologia",
      "Dialisis Peritoneal",
    ],
  },
  {
    id: "cirugia",
    nombre: "Cirugía",
    metrica: "egresos",
    descripcion: "Egresos (vivos y fallecidos) de los servicios quirúrgicos",
    servicios: ["Cirugía Hombres 1", "Cirugía Mujeres 1", "Cirugía Cardiovascular", "Neurocirugia"],
  },
  {
    id: "convenios",
    nombre: "Convenios",
    metrica: "egresos",
    descripcion: "Egresos (vivos y fallecidos) de Bienestar Magisterial",
    servicios: ["Bienestar Magisterial"],
  },
  {
    id: "uci",
    nombre: "Unidades de Cuidados Intensivos",
    metrica: "egresos",
    descripcion: "Egresos (vivos y fallecidos) de las unidades de cuidados intensivos de adultos",
    servicios: [
      "Unidad de cuidados intensivos General 1 Adultos",
      "Unidad de cuidados intensivos aislados Adultos",
      "Unidad de cuidados intensivos cardiovascular Adultos",
      "Unidad de Cuidados Intensivos Extracorpórea Adultos",
      "Unidad de Cuidados Intensivos Quirúrgicos Adultos",
      "Unidad de Cuidados Neurointensivos Adultos",
      "Unidad de Cuidados Coronarios y Posquirúrgicos Cardiovasculares",
    ],
  },
  {
    id: "ucin",
    nombre: "Unidades de Cuidados Intermedios",
    metrica: "egresos",
    descripcion: "Egresos (vivos y fallecidos) de las unidades de cuidados intermedios de adultos",
    servicios: [
      "Unidad de Cuidados Intermedios Adultos MINSAL",
      "Unidad de Cuidados Intermedios Crónicos Adultos",
      "Unidad de Cuidados Intermedios Aislados Adultos",
    ],
  },
  {
    id: "paliativos",
    nombre: "Dolor y Cuidados Paliativos",
    metrica: "egresos",
    descripcion: "Egresos (vivos y fallecidos) de Dolor y Cuidados Paliativos",
    servicios: ["Dolor y cuidados Paliativos"],
  },
  {
    id: "apoyo-riiss",
    nombre: "Servicio de apoyo a RIISS",
    metrica: "ingresos",
    descripcion: "Ingresos hospitalarios totales por mes, de todos los servicios",
    servicios: [],
  },
];

// Guardia: todo servicio configurado debe existir en el catálogo canónico. Un
// nombre mal escrito aquí produciría un tablero silenciosamente en cero.
for (const t of TABLEROS) {
  for (const s of t.servicios) {
    if (!resolverServicioCanonico(s)) {
      throw new Error(`Tablero "${t.id}": el servicio "${s}" no existe en el catálogo canónico`);
    }
  }
}

export const buscarTablero = (id: string): DefinicionTablero | undefined =>
  TABLEROS.find((t) => t.id === id);

// ── Fechas (hora de El Salvador) ──────────────────────────────────────────────

/** Día local "YYYY-MM-DD" de una fecha. */
export const diaSV = (d: Date): string => d.toLocaleDateString("en-CA", { timeZone: ZONA_HORARIA });
/** Mes local "YYYY-MM" de una fecha. */
export const mesSV = (d: Date): string => diaSV(d).slice(0, 7);

const inicioDiaSV = (dia: string) => new Date(`${dia}T00:00:00.000${TZ_OFFSET}`);
const finDiaSV = (dia: string) => new Date(`${dia}T23:59:59.999${TZ_OFFSET}`);

function ultimoDiaDelMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_MES = /^\d{4}-\d{2}$/;
const RE_ANIO = /^\d{4}$/;
export const MAX_DIAS_RANGO = 366;

export interface Rango {
  desde: string; // YYYY-MM-DD inclusive
  hasta: string; // YYYY-MM-DD inclusive
}

const diaValido = (dia: string) => RE_DIA.test(dia) && !Number.isNaN(inicioDiaSV(dia).getTime());

/**
 * Lee el rango pedido en la query string. Acepta `anio=YYYY`, `mes=YYYY-MM` o
 * `desde=YYYY-MM-DD&hasta=YYYY-MM-DD` (máx. 366 días). Sin parámetros → año en curso.
 */
export function parsearRango(sp: URLSearchParams): { rango: Rango } | { error: string } {
  const anio = sp.get("anio");
  const mes = sp.get("mes");
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");

  if (anio) {
    if (!RE_ANIO.test(anio)) return { error: "Parámetro `anio` inválido — formato YYYY" };
    return { rango: { desde: `${anio}-01-01`, hasta: `${anio}-12-31` } };
  }
  if (mes) {
    if (!RE_MES.test(mes) || !diaValido(`${mes}-01`)) return { error: "Parámetro `mes` inválido — formato YYYY-MM" };
    return { rango: { desde: `${mes}-01`, hasta: ultimoDiaDelMes(mes) } };
  }
  if (desde || hasta) {
    if (!desde || !hasta || !diaValido(desde) || !diaValido(hasta) || desde > hasta) {
      return { error: "Indica un rango válido `desde=YYYY-MM-DD&hasta=YYYY-MM-DD` (o usa `mes` / `anio`)" };
    }
    const dias = (finDiaSV(hasta).getTime() - inicioDiaSV(desde).getTime()) / 86_400_000;
    if (dias > MAX_DIAS_RANGO) return { error: `El rango no puede superar ${MAX_DIAS_RANGO} días` };
    return { rango: { desde, hasta } };
  }
  const anioActual = diaSV(new Date()).slice(0, 4);
  return { rango: { desde: `${anioActual}-01-01`, hasta: `${anioActual}-12-31` } };
}

/** Meses que cubre el rango, cada uno recortado a los límites del rango. */
export function mesesDelRango(r: Rango): { mes: string; desde: string; hasta: string }[] {
  const out: { mes: string; desde: string; hasta: string }[] = [];
  const mesInicio = r.desde.slice(0, 7);
  const mesFin = r.hasta.slice(0, 7);
  let [y, m] = mesInicio.split("-").map(Number);
  for (;;) {
    const mes = `${y}-${String(m).padStart(2, "0")}`;
    out.push({
      mes,
      desde: mes === mesInicio ? r.desde : `${mes}-01`,
      hasta: mes === mesFin ? r.hasta : ultimoDiaDelMes(mes),
    });
    if (mes >= mesFin) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

// ── Caché en memoria (por instancia de función) ───────────────────────────────
// Los tableros se refrescan con poca frecuencia y cada consulta de egresos lee
// todos los egresos del rango; una caché corta evita que cada refresco de un
// tablero externo vuelva a facturar las mismas lecturas de Firestore.

export const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { expira: number; valor: unknown }>();

export async function conCache<T>(
  clave: string,
  forzar: boolean,
  fn: () => Promise<T>,
): Promise<{ valor: T; desdeCache: boolean }> {
  const hit = cache.get(clave);
  if (!forzar && hit && hit.expira > Date.now()) return { valor: hit.valor as T, desdeCache: true };
  const valor = await fn();
  cache.set(clave, { expira: Date.now() + CACHE_TTL_MS, valor });
  return { valor, desdeCache: false };
}

// ── Catálogo vivo de servicios ────────────────────────────────────────────────
// Los nombres GUARDADOS en `pacientes` son los del catálogo vivo
// (`configuracion/servicios`), que puede diferir del estático en tildes (p. ej.
// "Servicio de Hematología"). Los tableros comparan por clave (así no se pierde
// nada) pero MUESTRAN el nombre vivo, que es el que ve ESDOMED en la app.

export async function cargarCatalogoVivo(): Promise<readonly string[]> {
  const { valor } = await conCache("catalogo-vivo", false, async () => {
    const snap = await adminDb.collection("configuracion").doc("servicios").get();
    const lista = snap.exists ? (snap.data()?.lista as { nombre?: unknown }[] | undefined) : undefined;
    const nombres = Array.isArray(lista)
      ? lista.map((s) => String(s?.nombre ?? "").trim()).filter(Boolean)
      : [];
    return nombres.length > 0 ? nombres : [...SERVICIOS_HOSPITALARIOS];
  });
  return valor;
}

/** Nombre con el que la app muestra hoy un servicio; si no está en el catálogo vivo, el que se pasó. */
export const nombreVivo = (servicio: string, catalogo: readonly string[]): string =>
  resolverServicioCanonico(servicio, catalogo) ?? servicio;

// ── Ingresos por mes (agregación: ~1 lectura por cada 1000 docs) ──────────────

export async function contarIngresosPorMes(r: Rango): Promise<{ mes: string; total: number }[]> {
  return Promise.all(
    mesesDelRango(r).map(async ({ mes, desde, hasta }) => {
      const agg = await adminDb
        .collection("pacientes")
        .where("fechaIngreso", ">=", Timestamp.fromDate(inicioDiaSV(desde)))
        .where("fechaIngreso", "<=", Timestamp.fromDate(finDiaSV(hasta)))
        .count()
        .get();
      return { mes, total: agg.data().count };
    }),
  );
}

// ── Egresos por servicio ──────────────────────────────────────────────────────

export type TipoEgreso = "vivo" | "fallecido";
export type EstadoEgreso = Exclude<EstadoPaciente, "activo">;

export const MODALIDADES_EGRESO: Record<EstadoEgreso, { tipo: TipoEgreso; etiqueta: string }> = {
  alta_vivo:       { tipo: "vivo",      etiqueta: "Domicilio" },
  alta_voluntaria: { tipo: "vivo",      etiqueta: "Voluntaria / Exigida" },
  referido:        { tipo: "vivo",      etiqueta: "Traslado a otro hospital" },
  fuga:            { tipo: "vivo",      etiqueta: "Fuga" },
  in_extremis:     { tipo: "vivo",      etiqueta: "In extremis" },
  alta_fallecido:  { tipo: "fallecido", etiqueta: "Fallecido" },
};

export interface EgresoTablero {
  expediente: string | null;
  paciente: string | null;      // solo con detalle
  sexo: Genero;
  servicio: string;             // nombre canónico
  estado: EstadoEgreso;
  tipo: TipoEgreso;
  modalidad: string;
  mes: string;                  // YYYY-MM (hora de El Salvador)
  fechaEgreso: Date;
  fechaIngreso: Date | null;    // solo con detalle
  diasEstancia: number | null;  // solo con detalle
}

const generoDe = (g: unknown): Genero => (g === "masculino" || g === "femenino" ? g : "otro");

/**
 * Lee los egresos del rango y se queda con los de los servicios indicados
 * (vacío = todos). Devuelve los servicios del grupo con su nombre vivo (para
 * sembrar/ordenar el tablero) y cuántos docs traían fecha de egreso pero un
 * estado que no es de egreso (dato inconsistente; se excluyen, como en el dashboard).
 */
export async function cargarEgresos(
  r: Rango,
  servicios: readonly string[],
  conDetalle: boolean,
): Promise<{ egresos: EgresoTablero[]; servicios: string[]; sinEstadoDeEgreso: number }> {
  const claves = new Set(servicios.map(claveServicio));
  const campos = ["servicioActual", "estado", "genero", "fechaEgreso", "expediente"];
  if (conDetalle) campos.push("nombres", "apellidos", "fechaIngreso", "diasEstancia");

  const catalogo = await cargarCatalogoVivo();
  const snap = await adminDb
    .collection("pacientes")
    .where("fechaEgreso", ">=", Timestamp.fromDate(inicioDiaSV(r.desde)))
    .where("fechaEgreso", "<=", Timestamp.fromDate(finDiaSV(r.hasta)))
    .select(...campos)
    .get();

  const egresos: EgresoTablero[] = [];
  let sinEstadoDeEgreso = 0;

  snap.forEach((doc) => {
    const p = doc.data();
    const crudo = String(p.servicioActual ?? "").trim();
    const servicio =
      resolverServicioCanonico(crudo, catalogo) ?? resolverServicioCanonico(crudo) ?? (crudo || "Sin servicio");
    if (claves.size > 0 && !claves.has(claveServicio(servicio))) return;

    const modalidad = MODALIDADES_EGRESO[p.estado as EstadoEgreso];
    if (!modalidad) {
      sinEstadoDeEgreso++;
      return;
    }

    const fechaEgreso: Date = p.fechaEgreso.toDate();
    egresos.push({
      expediente: p.expediente ?? null,
      paciente: conDetalle ? `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim() || null : null,
      sexo: generoDe(p.genero),
      servicio,
      estado: p.estado as EstadoEgreso,
      tipo: modalidad.tipo,
      modalidad: modalidad.etiqueta,
      mes: mesSV(fechaEgreso),
      fechaEgreso,
      fechaIngreso: conDetalle && p.fechaIngreso ? p.fechaIngreso.toDate() : null,
      diasEstancia: conDetalle && typeof p.diasEstancia === "number" ? p.diasEstancia : null,
    });
  });

  return { egresos, servicios: servicios.map((s) => nombreVivo(s, catalogo)), sinEstadoDeEgreso };
}
