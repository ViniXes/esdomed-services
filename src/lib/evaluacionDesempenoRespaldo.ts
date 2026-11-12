// Respaldo de la evaluación del desempeño con la trazabilidad que ya existe en
// ESDOMED Services. Pensado para el personal OPERATIVO: su trabajo queda
// registrado aquí (expedientes, altas, defunciones, SIMMOW, impresiones,
// traslados). El administrativo hace trabajo que no se mide como productividad
// en el sistema (desarrollo, calidad, coordinación): para él solo aplican el
// archivero de amonestaciones y las marcaciones.
//
// Es un apoyo para el evaluador, no un puntaje automático: el formulario MINSAL
// lo sigue llenando el jefe. Se carga bajo demanda (consultas por rango del
// semestre) y al guardar la evaluación queda una foto del resumen.

import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, where } from "@/lib/firestoreMeter";
import { auth, db } from "@/lib/firebase";
import type { EmpleadoInconsistenciasMarcacion, NotificacionAltaVivo, NotificacionFallecido, PlanTrabajo, SolicitudImpresion, SolicitudTraslado } from "@/types";
import { COLECCION_INCONSISTENCIAS } from "@/lib/inconsistenciasMarcacion/personal";
import { normalizarCodigoMarcacion } from "@/lib/esdomed/catalogo-plan";
import { desgloseMinutos, tipoIncidencia } from "@/lib/inconsistenciasMarcacion/analisis";
import { buscarFila, estadoFilaEnDia } from "@/lib/esdomed/turnos-dia";

const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

/** "JUL - DIC 2026" → 1/jul/2026 00:00 … 31/dic/2026 23:59 (null si no se entiende). */
export function rangoDePeriodo(periodo: string): { inicio: Date; fin: Date } | null {
  const m = /^\s*([A-Z]{3})\w*\s*-\s*([A-Z]{3})\w*\s+(\d{4})\s*$/i.exec(periodo.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  if (!m) return null;
  const a = MESES.indexOf(m[1].toUpperCase());
  const b = MESES.indexOf(m[2].toUpperCase());
  const anio = Number(m[3]);
  if (a < 0 || b < 0 || b < a) return null;
  return { inicio: new Date(anio, a, 1), fin: new Date(anio, b + 1, 0, 23, 59, 59, 999) };
}

const normalizar = (s?: string | null) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim().replace(/\s+/g, " ");

export const METRICAS_PRODUCTIVIDAD = [
  { id: "expedientes", label: "Expedientes creados" },
  { id: "altas", label: "Altas efectivas" },
  { id: "defunciones", label: "Defunciones procesadas" },
  { id: "certificados", label: "Certificados entregados" },
  { id: "simmow", label: "Egresos digitados SIMMOW" },
  { id: "documentos", label: "Documentos impresos/entregados" },
  { id: "traslados", label: "Traslados procesados" },
  // Hojas de Google Drive que el personal lleva a mano (mismas que la página de Productividad).
  { id: "carpetas", label: "Carpetas creadas (Drive)" },
  { id: "actualizaciones", label: "Actualizaciones (Drive)" },
  { id: "consentimientos", label: "Consentimientos (Drive)" },
  { id: "emergenciasSimmow", label: "Emergencias digitadas SIMMOW (Drive)" },
] as const;

const HOJAS_DRIVE = ["carpetas", "actualizaciones", "consentimientos", "emergenciasSimmow"] as const;

export type MetricaId = (typeof METRICAS_PRODUCTIVIDAD)[number]["id"];

export interface ResumenRespaldo {
  periodo: string;
  cargadoEn: string; // ISO
  productividad: Record<MetricaId, number>;
  /** Promedio por persona del equipo con actividad en esa métrica (excluye a quien tiene 0). */
  promedioEquipo: Record<MetricaId, number>;
  totalPersona: number;
  promedioTotalEquipo: number;
  /** Actividades del personal operativo ESDOMED evaluado en el periodo: la suma de todas sus partes da 100%. */
  totalServicio?: number;
  /** Alguna hoja de Drive no se pudo leer: el conteo puede quedar corto. */
  driveIncompleto?: boolean;
  /**
   * Revisión de digitación SIMMOW de Denys (hoja "Historico"): errores que le
   * observaron a la persona en el periodo, comparados con los egresos que digitó
   * en SIMMOW. Base del factor 1 (calidad).
   */
  errores?: { total: number; digitados: number; porCategoria: { categoria: string; total: number }[]; noLeido?: boolean };
  marcaciones: {
    meses: number;          // meses del periodo con reporte del reloj cargado
    diasConIncidencia: number;
    tardanzas: number;      // días que llegó tarde (según el horario del reloj)
    salidasAntes?: number;  // días que salió antes de hora (permanencia; no es puntualidad)
    minutos: number;
    omisiones: number;      // olvidó marcar entrada o salida
    ausencias: number;      // días sin ninguna marca
  };
  altasRevertidas: { fecha: string; paciente: string; nota: string }[];
  /** Entradas del archivero (evaluaciones/amonestaciones) dentro del periodo. */
  archivero?: EntradaArchivero[];
  /**
   * Diploma del curso SGAS (Sistema de Gestión Antisoborno). Subirlo era
   * responsabilidad de cada trabajador: en el periodo SGAS_PERIODO, si no está
   * en la pestaña Diplomas de su ficha, el factor 2 se sugiere en A.
   */
  sgas?: { aplica: boolean; diploma: { fecha: string; detalle: string } | null };
  /** Plan de trabajo, solo días ya transcurridos del periodo. */
  plan?: {
    turnosProgramados: number;
    turnosSinActividad: number;   // turnos en los que no registró nada en Services
    actividadesPorTurno: number;  // total del semestre ÷ turnos programados
    promedioEquipoPorTurno: number;
    /** Grupo de trabajo con el que se compara (Grupos 1 a 4, Equipo de emergencia…). */
    grupo?: string;
    /** Compañeros de ese grupo con actividad registrada (sin contar a la persona). */
    companerosGrupo?: number;
    /** Promedio de actividades por turno de esos compañeros. */
    promedioGrupoPorTurno?: number;
    /** El que más registró por turno en su grupo (incluida la persona): es el 100% del factor 3. */
    maximoGrupoPorTurno?: number;
    /** El que más registró por turno en todo el equipo (respaldo si no hay grupo). */
    maximoEquipoPorTurno?: number;
    /** Total mayor del semestre en su grupo (incluida la persona): es el 100% del factor 3. */
    maximoGrupoTotal?: number;
    /** Total mayor del semestre en todo el equipo (respaldo si no hay compañeros en su grupo). */
    maximoEquipoTotal?: number;
    porMes: MesRespaldo[];
  };
}

/** Resumen sencillo de un mes: lo que decía el plan y lo que marcó el reloj. */
export interface MesRespaldo {
  periodo: string;        // "2026-07"
  enPlan: boolean;        // aparece en el plan de ese mes
  turnos: number;         // turnos programados (días ya transcurridos)
  vacaciones: number;
  incapacidades: number;
  permisos: number;       // PER + licencias
  marcacionPublicada: boolean; // hay reporte del reloj cargado para ese mes
  tarde: number;          // días que llegó tarde (no cuenta las salidas antes de hora)
  salioAntes?: number;    // días que salió antes de hora
  olvidoMarca: number;    // olvidó marcar entrada o salida
  sinMarca: number;       // día de turno sin ninguna marca (no vino)
}

export interface RefPersonaEquipo {
  uid: string;
  nombre: string;
  codigoMarcacion?: string;
}

export interface EntradaArchivero {
  id: string;
  tipo: string;
  fecha: string; // "YYYY-MM-DD"
  notas: string;
  nota?: number; // 0–10, mínimo 7 para aprobar
  notaPorRevisar?: boolean; // cambiaron el archivo después de poner la nota
}

type Registro = { n: string; t: Date };

/** Día en que llegó tarde: minutos descontados a la entrada (estimado con el horario). */
const llegoTarde = (d: Parameters<typeof desgloseMinutos>[0]) => desgloseMinutos(d).tarde > 0;
/** Día en que salió antes de hora (estimado con el horario). */
const salioAntes = (d: Parameters<typeof desgloseMinutos>[0]) => desgloseMinutos(d).temprano > 0;

type Canon = (nombre?: string | null) => string;

/** Palabra igual, cortada (una empieza con la otra, 5+ letras) o con una letra distinta (5+ letras). */
function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++dif > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Une las formas distintas de escribir a la misma persona. El nombre guardado en
 * cada actividad (o en las hojas de Drive y la revisión de Denys) es texto libre:
 * "Oscar Alexander Guardado" / "… Guardado Guevara", "Boris Andree Rodríguez
 * Quintanill", "Gabriela Alejandra Calpaño de Ruiz", "Fernando Javier Gálvez
 * Sompson". Se acredita a la persona del personal con la que comparte 3 o más
 * palabras (tolerando una palabra cortada o con una letra distinta), si es una
 * sola la que más comparte; si hay empate o ninguna llega a 3, queda tal cual.
 */
export function canonDeNombres(nombresPersonal: string[]): Canon {
  const personal = [...new Set(nombresPersonal.map(normalizar).filter(Boolean))].map((n) => ({ n, palabras: n.split(" ") }));
  const exactos = new Set(personal.map((p) => p.n));
  const cache = new Map<string, string>();
  return (nombre) => {
    const n = normalizar(nombre);
    if (!n || exactos.has(n)) return n;
    const previo = cache.get(n);
    if (previo !== undefined) return previo;
    const palabras = n.split(" ");
    let destino = n;
    if (palabras.length >= 3) {
      const puntajes = personal
        .map((p) => ({ p, c: palabras.filter((w) => p.palabras.some((v) => mismaPalabra(w, v))).length }))
        .filter((x) => x.c >= 3)
        .sort((x, y) => y.c - x.c);
      if (puntajes.length && !(puntajes[1] && puntajes[1].c === puntajes[0].c)) destino = puntajes[0].p.n;
    }
    cache.set(n, destino);
    return destino;
  };
}

function registros<T>(items: T[], nombre: (i: T) => string | undefined | null, fecha: (i: T) => unknown, canon: Canon = normalizar): Registro[] {
  const out: Registro[] = [];
  for (const it of items) {
    const n = canon(nombre(it));
    const v = fecha(it) as Date | { toDate?: () => Date } | undefined;
    const t = v instanceof Date ? v : (v?.toDate?.() ?? null);
    if (n && t) out.push({ n, t });
  }
  return out;
}

function contarPor<T>(items: T[], nombre: (i: T) => string | undefined | null, canon: Canon = normalizar): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const n = canon(nombre(it));
    if (n) m.set(n, (m.get(n) ?? 0) + 1);
  }
  return m;
}

const aIso = (v: unknown) => {
  const d = (v as { toDate?: () => Date })?.toDate?.() ?? (v ? new Date(v as string) : null);
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
};

// ─── Productividad por mes (lo que sale de Firestore) ────────────────────────
// Leer el semestre completo eran ~28.000 documentos por carga y por persona
// evaluada (los mismos datos para todo el equipo). Ahora cada mes CERRADO se
// resume una sola vez en `productividad_resumen/{YYYY-MM}` (conteos por persona y
// minutos con actividad, sin datos de pacientes) y después cuesta 1 lectura; solo
// el mes en curso se lee de las colecciones, con caché en la sesión.

export const COLECCION_RESUMEN_PRODUCTIVIDAD = "productividad_resumen";
/** Subirla obliga a recalcular los resúmenes guardados (cambio de criterio). */
const VERSION_RESUMEN = 1;

const METRICAS_FIRESTORE = ["expedientes", "altas", "defunciones", "certificados", "simmow", "documentos", "traslados"] as const;
type MetricaFirestore = (typeof METRICAS_FIRESTORE)[number];

/** Lo que hizo una persona en el mes. `n` = nombre normalizado tal como quedó escrito. */
interface PersonaMes {
  n: string;
  c: Partial<Record<MetricaFirestore, number>>;
  /** Minutos (epoch / 60 000) en los que registró algo; para los turnos sin actividad. */
  a: number[];
}

interface ProductividadMes {
  mes: string; // "2026-07"
  personas: PersonaMes[];
}

/** Caché de la sesión: los meses cerrados no cambian; el mes en curso se refresca con "Actualizar". */
const cacheMeses = new Map<string, ProductividadMes>();

const aMs = (v: unknown): number | null => {
  const d = v instanceof Date ? v : ((v as { toDate?: () => Date })?.toDate?.() ?? null);
  const t = d?.getTime();
  return t != null && Number.isFinite(t) ? t : null;
};

/** Lee un mes de las colecciones (mismas fuentes y criterios que /dashboard/productividad/esdomed). */
async function leerMesDeColecciones(mes: string): Promise<ProductividadMes> {
  const [anio, m] = mes.split("-").map(Number);
  const ini = Timestamp.fromDate(new Date(anio, m - 1, 1));
  const fin = Timestamp.fromDate(new Date(anio, m, 0, 23, 59, 59, 999));
  const entre = (campo: string, col: string) => getDocs(query(collection(db, col), where(campo, ">=", ini), where(campo, "<=", fin)));
  const [ingresos, confirmados, certificados, simmowF, altasProc, simmowA, impresiones, traslados] = await Promise.all([
    entre("creadoEn", "control_ingresos"),
    entre("confirmadoEn", "notificaciones_fallecidos"),
    entre("entregaCertificadoEn", "notificaciones_fallecidos"),
    entre("digitaSimmowEn", "notificaciones_fallecidos"),
    entre("procesadoEn", "notificaciones_altas"),
    entre("digitaSimmowEn", "notificaciones_altas"),
    entre("impresoEn", "solicitudes_impresion"),
    entre("actualizadoEn", "traslados"),
  ]);
  const personas = new Map<string, { c: Partial<Record<MetricaFirestore, number>>; a: Set<number> }>();
  const sumar = (metrica: MetricaFirestore, nombre: string | undefined | null, fecha: unknown) => {
    const n = normalizar(nombre);
    if (!n) return;
    const p = personas.get(n) ?? { c: {}, a: new Set<number>() };
    p.c[metrica] = (p.c[metrica] ?? 0) + 1;
    const t = aMs(fecha);
    if (t != null) p.a.add(Math.floor(t / 60000));
    personas.set(n, p);
  };
  const datos = <T>(s: { docs: { data: () => unknown }[] }) => s.docs.map((d) => d.data() as T);
  for (const i of datos<{ responsableIngresoNombre?: string; creadoPorNombre?: string; creadoEn?: unknown }>(ingresos)) {
    sumar("expedientes", i.responsableIngresoNombre ?? i.creadoPorNombre, i.creadoEn);
  }
  for (const a of datos<NotificacionAltaVivo>(altasProc)) if (a.estado === "procesada") sumar("altas", a.procesadoPorNombre, a.procesadoEn);
  for (const f of datos<NotificacionFallecido>(confirmados)) sumar("defunciones", f.confirmadoPorNombre, f.confirmadoEn);
  for (const f of datos<NotificacionFallecido>(certificados)) sumar("certificados", f.entregaCertificado, f.entregaCertificadoEn);
  for (const a of datos<NotificacionAltaVivo>(simmowA)) sumar("simmow", a.digitaSimmow, a.digitaSimmowEn);
  for (const f of datos<NotificacionFallecido>(simmowF)) sumar("simmow", f.digitaSimmow, f.digitaSimmowEn);
  for (const i of datos<SolicitudImpresion>(impresiones)) if (i.estado === "impreso") sumar("documentos", i.impresoPorNombre, i.impresoEn);
  for (const t of datos<SolicitudTraslado>(traslados)) sumar("traslados", t.revisadoPorNombre, t.actualizadoEn);
  return {
    mes,
    personas: [...personas.entries()].map(([n, p]) => ({ n, c: p.c, a: [...p.a].sort((x, y) => x - y) })),
  };
}

/** Un mes se da por cerrado desde el día 2 del siguiente (margen para lo registrado tarde). */
const mesCerrado = (mes: string) => {
  const [anio, m] = mes.split("-").map(Number);
  return Date.now() >= new Date(anio, m, 2).getTime();
};

async function productividadDelMes(mes: string, forzar: boolean): Promise<ProductividadMes> {
  const cerrado = mesCerrado(mes);
  const enCache = cacheMeses.get(mes);
  if (enCache && (cerrado || !forzar)) return enCache;
  let datos: ProductividadMes | null = null;
  if (cerrado) {
    try {
      const snap = await getDoc(doc(db, COLECCION_RESUMEN_PRODUCTIVIDAD, mes));
      const x = snap.exists() ? (snap.data() as { version?: number; personas?: PersonaMes[] }) : null;
      if (x?.version === VERSION_RESUMEN && Array.isArray(x.personas)) datos = { mes, personas: x.personas };
    } catch {
      // Sin permiso o sin red: se calcula desde las colecciones.
    }
  }
  if (!datos) {
    datos = await leerMesDeColecciones(mes);
    if (cerrado) {
      // Se guarda para que el mes no se vuelva a leer completo. Si falla (reglas), solo se pierde el ahorro.
      setDoc(doc(db, COLECCION_RESUMEN_PRODUCTIVIDAD, mes), {
        version: VERSION_RESUMEN,
        mes,
        personas: datos.personas,
        generadoEn: serverTimestamp(),
        generadoPorId: auth.currentUser?.uid ?? null,
      }).catch((e) => console.warn("No se pudo guardar el resumen de productividad", mes, e));
    }
  }
  cacheMeses.set(mes, datos);
  return datos;
}

/** Meses del periodo hasta el actual (los futuros no tienen datos). */
function mesesHastaHoy(rango: { inicio: Date; fin: Date }): string[] {
  const hoy = new Date();
  const hasta = rango.fin < hoy ? rango.fin : hoy;
  const meses: string[] = [];
  for (let d = new Date(rango.inicio.getFullYear(), rango.inicio.getMonth(), 1); d <= hasta; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return meses;
}

/**
 * Productividad (mismas fuentes y criterios que /dashboard/productividad/esdomed,
 * más las hojas de Drive), reporte mensual del reloj y altas revertidas del periodo.
 * `equipo` = personal operativo para el promedio de comparación. `forzar` vuelve a
 * leer el mes en curso (botón "Actualizar"); los meses cerrados salen del resumen.
 */
export async function cargarRespaldo(params: {
  empleadoId: string;
  nombre: string;
  periodo: string;
  uid: string;
  codigoMarcacion?: string;
  equipo: RefPersonaEquipo[];
  forzar?: boolean;
}): Promise<ResumenRespaldo> {
  const rango = rangoDePeriodo(params.periodo);
  if (!rango) throw new Error("El periodo no tiene el formato «JUL - DIC 2026».");
  const ini = Timestamp.fromDate(rango.inicio);
  const fin = Timestamp.fromDate(rango.fin);

  const [mesesProd, revertidas, drive, revision] = await Promise.all([
    Promise.all(mesesHastaHoy(rango).map((m) => productividadDelMes(m, !!params.forzar))),
    // Pocas en el semestre (decenas): se leen directo.
    getDocs(query(collection(db, "notificaciones_altas"), where("revertidoEn", ">=", ini), where("revertidoEn", "<=", fin))),
    leerHojasDrive(rango),
    leerRevisionDenys(rango),
  ]);
  const datos = <T>(s: { docs: { data: () => unknown }[] }) => s.docs.map((d) => d.data() as T);
  // Nombres del personal evaluado: une las variantes de escritura de cada persona.
  const canon = canonDeNombres([params.nombre, ...params.equipo.map((p) => p.nombre)]);
  const yo = normalizar(params.nombre);
  const cuenta = <T>(items: T[], nombre: (i: T) => string | undefined | null) => contarPor(items, nombre, canon);
  const reg = <T>(items: T[], nombre: (i: T) => string | undefined | null, fecha: (i: T) => unknown) => registros(items, nombre, fecha, canon);
  const deFirestore = Object.fromEntries(METRICAS_FIRESTORE.map((id) => [id, new Map<string, number>()])) as Record<MetricaFirestore, Map<string, number>>;
  // Minutos con actividad de la persona evaluada (de Firestore), para los turnos sin actividad.
  const actividadYo: number[] = [];
  for (const mes of mesesProd) {
    for (const p of mes.personas) {
      const n = canon(p.n);
      if (!n) continue;
      for (const id of METRICAS_FIRESTORE) {
        const v = p.c[id];
        if (v) deFirestore[id].set(n, (deFirestore[id].get(n) ?? 0) + v);
      }
      if (n === yo) for (const minuto of p.a) actividadYo.push(minuto * 60000);
    }
  }
  const mapas: Record<MetricaId, Map<string, number>> = {
    ...deFirestore,
    carpetas: cuenta(drive.hojas.carpetas, (x) => x.nombre),
    actualizaciones: cuenta(drive.hojas.actualizaciones, (x) => x.nombre),
    consentimientos: cuenta(drive.hojas.consentimientos, (x) => x.nombre),
    emergenciasSimmow: cuenta(drive.hojas.emergenciasSimmow, (x) => x.nombre),
  };

  const equipo = new Set(params.equipo.map((p) => normalizar(p.nombre)));
  equipo.add(yo);
  const productividad = {} as Record<MetricaId, number>;
  const promedioEquipo = {} as Record<MetricaId, number>;
  const totalesEquipo = new Map<string, number>();
  for (const { id } of METRICAS_PRODUCTIVIDAD) {
    productividad[id] = mapas[id].get(yo) ?? 0;
    const valores = [...equipo].map((n) => mapas[id].get(n) ?? 0).filter((v) => v > 0);
    promedioEquipo[id] = valores.length ? Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10 : 0;
    for (const n of equipo) totalesEquipo.set(n, (totalesEquipo.get(n) ?? 0) + (mapas[id].get(n) ?? 0));
  }
  const totalPersona = Object.values(productividad).reduce((a, b) => a + b, 0);
  // Total del servicio = lo que hizo el personal operativo de ESDOMED que se evalúa
  // (vigente). Así las partes de todos suman exactamente 100%.
  const totalServicio = [...totalesEquipo.values()].reduce((a, b) => a + b, 0);
  const conActividad = [...totalesEquipo.values()].filter((v) => v > 0);
  const promedioTotalEquipo = conActividad.length ? Math.round(conActividad.reduce((a, b) => a + b, 0) / conActividad.length) : 0;

  // Reloj: el reporte mensual de RRHH que el admin carga en Inconsistencias de
  // marcación (doc por mes, publicado o no). Solo trae a quien tuvo descuentos:
  // si el mes está cargado y la persona no aparece, ese mes no tuvo incidencias.
  const periodosRango: string[] = [];
  for (let d = new Date(rango.inicio); d <= rango.fin; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    periodosRango.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const reportes = await Promise.all(
    periodosRango.map((p) =>
      getDoc(doc(db, COLECCION_INCONSISTENCIAS, p))
        .then((snap) => (snap.exists() ? { periodo: p, empleados: ((snap.data().empleados ?? []) as EmpleadoInconsistenciasMarcacion[]) } : null))
        .catch(() => null),
    ),
  );
  const miCodigo = normalizarCodigoMarcacion(params.codigoMarcacion);
  const meses = reportes
    .filter((x): x is { periodo: string; empleados: EmpleadoInconsistenciasMarcacion[] } => !!x)
    .map((x) => {
      const yo = x.empleados.find((e) => (miCodigo && normalizarCodigoMarcacion(e.codigoMarcacion) === miCodigo) || normalizar(e.nombre) === normalizar(params.nombre));
      return { periodo: x.periodo, dias: yo?.dias ?? [] };
    });
  const dias = meses.flatMap((m) => m.dias);
  const marcaciones = {
    meses: meses.length,
    diasConIncidencia: dias.length,
    tardanzas: dias.filter(llegoTarde).length,
    salidasAntes: dias.filter(salioAntes).length,
    minutos: dias.reduce((a, d) => a + (d.minutos || 0), 0),
    omisiones: dias.filter((d) => {
      const t = tipoIncidencia(d);
      return t === "omision_entrada" || t === "omision_salida";
    }).length,
    ausencias: dias.filter((d) => tipoIncidencia(d) === "sin_marcacion").length,
  };

  // Altas efectivas que procesó esta persona y luego se revirtieron (el paciente
  // no se había ido). Es un indicio para revisar, no necesariamente un error suyo.
  const altasRevertidas = datos<NotificacionAltaVivo>(revertidas)
    .filter((a) => normalizar(a.procesadoPorNombre) === yo)
    .map((a) => ({ fecha: aIso(a.revertidoEn), paciente: a.pacienteNombre ?? "", nota: a.revertidoNota ?? "" }));

  // Registros con fecha de la persona (para turnos sin actividad): Firestore + hojas de Drive.
  const registrosYo = [
    ...actividadYo,
    ...HOJAS_DRIVE.flatMap((h) => reg(drive.hojas[h], (x) => x.nombre, (x) => new Date(x.fecha)))
      .filter((r: Registro) => r.n === yo)
      .map((r) => r.t.getTime()),
  ];
  const marcPorMes = new Map(
    meses.map((m) => {
      const ds = m.dias ?? [];
      return [
        m.periodo,
        {
          tarde: ds.filter(llegoTarde).length,
          salioAntes: ds.filter(salioAntes).length,
          olvidoMarca: ds.filter((d) => ["omision_entrada", "omision_salida"].includes(tipoIncidencia(d))).length,
          sinMarca: ds.filter((d) => tipoIncidencia(d) === "sin_marcacion").length,
        },
      ] as const;
    }),
  );
  const plan = await resumenPlan({ marcPorMes, rango, yo: { uid: params.uid, nombre: params.nombre, codigoMarcacion: params.codigoMarcacion }, equipo: params.equipo, totales: totalesEquipo, registrosYo });

  return {
    periodo: params.periodo,
    cargadoEn: new Date().toISOString(),
    plan,
    productividad,
    promedioEquipo,
    totalPersona,
    promedioTotalEquipo,
    totalServicio,
    ...(drive.incompleto ? { driveIncompleto: true } : {}),
    errores: (() => {
      const mias = revision.incidencias.filter((x) => canon(x.usuario) === yo);
      const cat = new Map<string, number>();
      for (const x of mias) cat.set(x.categoria, (cat.get(x.categoria) ?? 0) + 1);
      return {
        total: mias.length,
        digitados: productividad.simmow ?? 0,
        porCategoria: [...cat.entries()].map(([categoria, total]) => ({ categoria, total })).sort((p, q) => q.total - p.total),
        ...(revision.noLeido ? { noLeido: true } : {}),
      };
    })(),
    marcaciones,
    altasRevertidas,
  };
}

/**
 * Regla puntual de la jefatura para la PRIMERA evaluación (curso SGAS de octubre
 * 2026): solo cuenta en este periodo. Los siguientes semestres tendrán otro
 * parámetro; no se repite automáticamente.
 */
export const SGAS_PERIODO = "JUL - DIC 2026";

/** Diploma del curso SGAS: se reconoce por "SGAS" o "Antisoborno" en el tipo, la descripción o el archivo. */
export const esDiplomaSgas = (x: { tipo?: string; notas?: string; archivos?: { nombre?: string }[] }) =>
  /\bsgas\b|antisoborno/i.test([x.tipo, x.notas, ...(x.archivos ?? []).map((a) => a.nombre)].filter(Boolean).join(" "));

/**
 * Archivero de la persona en una sola lectura: evaluaciones y amonestaciones
 * del periodo (sin diplomas) y si tiene subido el diploma SGAS.
 */
export async function cargarArchivero(
  empleadoId: string,
  periodo: string,
): Promise<{ entradas: EntradaArchivero[]; sgas: NonNullable<ResumenRespaldo["sgas"]> }> {
  const rango = rangoDePeriodo(periodo);
  const snap = await getDocs(query(collection(db, "evaluaciones_personal"), where("empleadoId", "==", empleadoId)));
  const diplomas = snap.docs
    .map((d) => d.data() as { categoria?: string; tipo?: string; notas?: string; fecha?: unknown; archivos?: { nombre?: string }[] })
    .filter((x) => x.categoria === "diploma" && esDiplomaSgas(x))
    // Cuenta si lo subió hasta el fin del periodo evaluado.
    .filter((x) => !rango || !aIso(x.fecha) || new Date(`${aIso(x.fecha)}T12:00:00`) <= rango.fin)
    .sort((a, b) => aIso(a.fecha).localeCompare(aIso(b.fecha)));
  const sgas = {
    aplica: periodo.trim().toUpperCase() === SGAS_PERIODO,
    diploma: diplomas.length ? { fecha: aIso(diplomas[0].fecha), detalle: diplomas[0].notas || diplomas[0].tipo || "Diploma SGAS" } : null,
  };
  const entradas = snap.docs
    // Los diplomas/certificados viven en la misma colección pero no son parte de este respaldo.
    .filter((d) => d.data().categoria !== "diploma")
    .map((d) => {
      const x = d.data() as { tipo?: string; fecha?: unknown; notas?: string; nota?: number; notaPorRevisar?: boolean };
      return {
        id: d.id,
        tipo: x.tipo ?? "",
        fecha: aIso(x.fecha),
        notas: x.notas ?? "",
        ...(typeof x.nota === "number" ? { nota: x.nota } : {}),
        ...(x.notaPorRevisar ? { notaPorRevisar: true } : {}),
      };
    })
    .filter((e) => {
      if (!rango || !e.fecha) return true;
      const f = new Date(`${e.fecha}T12:00:00`);
      return f >= rango.inicio && f <= rango.fin;
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { entradas, sgas };
}

/**
 * Turnos del plan de trabajo (solo días ya transcurridos) mes por mes, junto con
 * lo que marcó el reloj; y actividades por turno para comparar con el equipo
 * sin castigar vacaciones, permisos ni incapacidades.
 */
async function resumenPlan(p: {
  marcPorMes: Map<string, { tarde: number; salioAntes: number; olvidoMarca: number; sinMarca: number }>;
  rango: { inicio: Date; fin: Date };
  yo: RefPersonaEquipo;
  equipo: RefPersonaEquipo[];
  totales: Map<string, number>;
  registrosYo: number[];
}): Promise<NonNullable<ResumenRespaldo["plan"]>> {
  const hoy = new Date();
  const limite = p.rango.fin < hoy ? p.rango.fin : hoy;
  const periodos: string[] = [];
  for (let d = new Date(p.rango.inicio.getFullYear(), p.rango.inicio.getMonth(), 1); d <= limite; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    periodos.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const planes = await Promise.all(
    periodos.map((id) =>
      getDoc(doc(db, "planes_trabajo", id))
        .then((s) => (s.exists() ? (s.data() as PlanTrabajo) : null))
        .catch(() => null),
    ),
  );

  const personas = [p.yo, ...p.equipo.filter((e) => e.uid !== p.yo.uid)];
  const turnosDe = new Map<string, number>();
  // Turnos de cada persona por grupo de comparación, para saber su grupo principal.
  const turnosPorGrupo = new Map<string, Map<string, number>>();
  let sinActividad = 0;
  const regs = [...p.registrosYo].sort((a, b) => a - b);
  const hayEntre = (a: number, b: number) => {
    let lo = 0;
    let hi = regs.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (regs[m] < a) lo = m + 1;
      else hi = m;
    }
    return lo < regs.length && regs[lo] <= b;
  };

  const porMes: MesRespaldo[] = periodos.map((periodo, i) => {
    const plan = planes[i];
    const marc = p.marcPorMes.get(periodo);
    const mes: MesRespaldo = {
      periodo,
      enPlan: false,
      turnos: 0,
      vacaciones: 0,
      incapacidades: 0,
      permisos: 0,
      marcacionPublicada: !!marc,
      tarde: marc?.tarde ?? 0,
      salioAntes: marc?.salioAntes ?? 0,
      olvidoMarca: marc?.olvidoMarca ?? 0,
      sinMarca: marc?.sinMarca ?? 0,
    };
    if (!plan) return mes;
    const [anio, m] = periodo.split("-").map(Number);
    const diasMes = new Date(anio, m, 0).getDate();
    for (const persona of personas) {
      const fila = buscarFila(plan, persona);
      if (!fila) continue;
      const esYo = persona.uid === p.yo.uid;
      if (esYo) mes.enPlan = true;
      const clave = normalizar(persona.nombre);
      const grupo = grupoComparacion(fila.grupo);
      for (let dia = 1; dia <= diasMes; dia++) {
        const fecha = new Date(anio, m - 1, dia);
        if (fecha > limite || fecha < p.rango.inicio) continue;
        const est = estadoFilaEnDia(fila, dia);
        if (est.tipo === "turno") {
          turnosDe.set(clave, (turnosDe.get(clave) ?? 0) + 1);
          const g = turnosPorGrupo.get(clave) ?? new Map<string, number>();
          g.set(grupo, (g.get(grupo) ?? 0) + 1);
          turnosPorGrupo.set(clave, g);
          if (esYo) {
            mes.turnos++;
            const ini = fecha.getTime() + (est.inicio ?? 0) * 60000;
            const fin = fecha.getTime() + (est.fin ?? 24 * 60) * 60000;
            if (fin <= hoy.getTime() && !hayEntre(ini, fin)) sinActividad++;
          }
        } else if (esYo && est.tipo === "ausencia") {
          if (est.codigo === "VAC") mes.vacaciones++;
          else if (est.codigo === "INC") mes.incapacidades++;
          else mes.permisos++;
        }
      }
    }
    return mes;
  });

  const yoN = normalizar(p.yo.nombre);
  const porTurno = (n: string) => {
    const t = turnosDe.get(n) ?? 0;
    return t > 0 ? (p.totales.get(n) ?? 0) / t : 0;
  };
  const tasasEquipo = [...turnosDe.keys()].map(porTurno).filter((t) => t > 0);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  // Grupo principal = donde tuvo más turnos en el semestre.
  const principal = (n: string) => [...(turnosPorGrupo.get(n) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const miGrupo = principal(yoN);
  const tasasGrupo = miGrupo
    ? [...turnosDe.keys()].filter((n) => n !== yoN && principal(n) === miGrupo).map(porTurno).filter((t) => t > 0)
    : [];
  const maximo = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
  return {
    turnosProgramados: turnosDe.get(yoN) ?? 0,
    turnosSinActividad: sinActividad,
    actividadesPorTurno: r1(porTurno(yoN)),
    promedioEquipoPorTurno: r1(promedio(tasasEquipo)),
    maximoEquipoPorTurno: r1(maximo(tasasEquipo)),
    maximoEquipoTotal: maximo([...p.totales.values()]),
    ...(miGrupo
      ? {
          grupo: miGrupo,
          companerosGrupo: tasasGrupo.length,
          promedioGrupoPorTurno: r1(promedio(tasasGrupo)),
          maximoGrupoPorTurno: r1(maximo([...tasasGrupo, porTurno(yoN)])),
          maximoGrupoTotal: maximo([...turnosDe.keys()].filter((n) => principal(n) === miGrupo).map((n) => p.totales.get(n) ?? 0)),
        }
      : {}),
    porMes,
  };
}

/**
 * Grupo con el que se compara la productividad. Los Grupos 1 a 4 hacen el mismo
 * trabajo en distinto turno (3 personas cada uno): se comparan juntos. Apoyo
 * diurno / emergencia se compara con el Equipo de emergencia.
 */
function grupoComparacion(grupo?: string): string {
  const g = (grupo ?? "").trim();
  if (/^grupo\s*\d/i.test(g)) return "Grupos 1 a 4";
  if (/emergencia/i.test(g)) return "Equipo de emergencia";
  if (/consulta/i.test(g)) return "Consulta Externa";
  return g || "Sin grupo";
}

/**
 * Registros (nombre, fecha) de las hojas de Drive del periodo, mes por mes, con la
 * misma API que usa la página de Productividad. Si una hoja o un mes falla, sigue
 * con lo demás y avisa que el conteo puede quedar corto.
 */
async function leerHojasDrive(rango: { inicio: Date; fin: Date }): Promise<{
  hojas: Record<(typeof HOJAS_DRIVE)[number], { nombre: string; fecha: string }[]>;
  incompleto: boolean;
}> {
  const hojas = { carpetas: [], actualizaciones: [], consentimientos: [], emergenciasSimmow: [] } as Record<
    (typeof HOJAS_DRIVE)[number],
    { nombre: string; fecha: string }[]
  >;
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  if (!token) return { hojas, incompleto: true };
  const hoy = new Date();
  const hasta = rango.fin < hoy ? rango.fin : hoy;
  const meses: string[] = [];
  for (let d = new Date(rango.inicio.getFullYear(), rango.inicio.getMonth(), 1); d <= hasta; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  let incompleto = false;
  await Promise.all(
    HOJAS_DRIVE.flatMap((hoja) =>
      meses.map(async (mes) => {
        try {
          const res = await fetch(`/api/productividad/historial-drive?hoja=${hoja}&mes=${mes}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { registros?: { nombre: string; fecha: string }[] };
          hojas[hoja].push(...(data.registros ?? []));
        } catch {
          incompleto = true;
        }
      }),
    ),
  );
  return { hojas, incompleto };
}

/** Observaciones de la revisión de digitación SIMMOW de Denys en el periodo (vía API, sin datos de pacientes). */
async function leerRevisionDenys(rango: { inicio: Date; fin: Date }): Promise<{ incidencias: { usuario: string; mes: string; categoria: string }[]; noLeido: boolean }> {
  const mes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { incidencias: [], noLeido: true };
    const res = await fetch(`/api/evaluacion-desempeno/incidencias?desde=${mes(rango.inicio)}&hasta=${mes(rango.fin)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { incidencias: [], noLeido: true };
    const data = (await res.json()) as { incidencias?: { usuario: string; mes: string; categoria: string }[] };
    return { incidencias: data.incidencias ?? [], noLeido: false };
  } catch {
    return { incidencias: [], noLeido: true };
  }
}
