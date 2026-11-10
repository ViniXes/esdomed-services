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

import { collection, doc, getDoc, getDocs, query, Timestamp, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
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
] as const;

export type MetricaId = (typeof METRICAS_PRODUCTIVIDAD)[number]["id"];

export interface ResumenRespaldo {
  periodo: string;
  cargadoEn: string; // ISO
  productividad: Record<MetricaId, number>;
  /** Promedio por persona del equipo con actividad en esa métrica (excluye a quien tiene 0). */
  promedioEquipo: Record<MetricaId, number>;
  totalPersona: number;
  promedioTotalEquipo: number;
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
   * responsabilidad de cada trabajador: si el requisito aplica al periodo y no
   * está en la pestaña Diplomas de su ficha, el factor 2 se sugiere en A.
   */
  sgas?: { aplica: boolean; diploma: { fecha: string; detalle: string } | null };
  /** Plan de trabajo, solo días ya transcurridos del periodo. */
  plan?: {
    turnosProgramados: number;
    turnosSinActividad: number;   // turnos en los que no registró nada en Services
    actividadesPorTurno: number;  // total del semestre ÷ turnos programados
    promedioEquipoPorTurno: number;
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
}

type Registro = { n: string; t: Date };

/** Día en que llegó tarde: minutos descontados a la entrada (estimado con el horario). */
const llegoTarde = (d: Parameters<typeof desgloseMinutos>[0]) => desgloseMinutos(d).tarde > 0;
/** Día en que salió antes de hora (estimado con el horario). */
const salioAntes = (d: Parameters<typeof desgloseMinutos>[0]) => desgloseMinutos(d).temprano > 0;

function registros<T>(items: T[], nombre: (i: T) => string | undefined | null, fecha: (i: T) => unknown): Registro[] {
  const out: Registro[] = [];
  for (const it of items) {
    const n = normalizar(nombre(it));
    const v = fecha(it) as { toDate?: () => Date } | undefined;
    const t = v?.toDate?.() ?? null;
    if (n && t) out.push({ n, t });
  }
  return out;
}

function contarPor<T>(items: T[], nombre: (i: T) => string | undefined | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const n = normalizar(nombre(it));
    if (n) m.set(n, (m.get(n) ?? 0) + 1);
  }
  return m;
}

const aIso = (v: unknown) => {
  const d = (v as { toDate?: () => Date })?.toDate?.() ?? (v ? new Date(v as string) : null);
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
};

/**
 * Productividad (mismas fuentes y criterios que /dashboard/productividad/esdomed,
 * sin las hojas de Drive), reporte mensual del reloj y altas revertidas del periodo.
 * `equipo` = personal operativo para el promedio de comparación.
 */
export async function cargarRespaldo(params: {
  empleadoId: string;
  nombre: string;
  periodo: string;
  uid: string;
  codigoMarcacion?: string;
  equipo: RefPersonaEquipo[];
}): Promise<ResumenRespaldo> {
  const rango = rangoDePeriodo(params.periodo);
  if (!rango) throw new Error("El periodo no tiene el formato «JUL - DIC 2026».");
  const ini = Timestamp.fromDate(rango.inicio);
  const fin = Timestamp.fromDate(rango.fin);
  const entre = (campo: string, col: string) => getDocs(query(collection(db, col), where(campo, ">=", ini), where(campo, "<=", fin)));

  const [ingresos, confirmados, certificados, simmowF, altasProc, simmowA, impresiones, traslados, revertidas] = await Promise.all([
    entre("creadoEn", "control_ingresos"),
    entre("confirmadoEn", "notificaciones_fallecidos"),
    entre("entregaCertificadoEn", "notificaciones_fallecidos"),
    entre("digitaSimmowEn", "notificaciones_fallecidos"),
    entre("procesadoEn", "notificaciones_altas"),
    entre("digitaSimmowEn", "notificaciones_altas"),
    entre("impresoEn", "solicitudes_impresion"),
    entre("actualizadoEn", "traslados"),
    entre("revertidoEn", "notificaciones_altas"),
  ]);

  const datos = <T>(s: { docs: { data: () => unknown }[] }) => s.docs.map((d) => d.data() as T);
  const ing = datos<{ responsableIngresoNombre?: string; creadoPorNombre?: string }>(ingresos);
  const mapas: Record<MetricaId, Map<string, number>> = {
    expedientes: contarPor(ing, (i) => i.responsableIngresoNombre ?? i.creadoPorNombre),
    altas: contarPor(datos<NotificacionAltaVivo>(altasProc).filter((a) => a.estado === "procesada"), (a) => a.procesadoPorNombre),
    defunciones: contarPor(datos<NotificacionFallecido>(confirmados), (f) => f.confirmadoPorNombre),
    certificados: contarPor(datos<NotificacionFallecido>(certificados), (f) => f.entregaCertificado),
    simmow: (() => {
      const m = contarPor(datos<NotificacionAltaVivo>(simmowA), (a) => a.digitaSimmow);
      for (const [k, v] of contarPor(datos<NotificacionFallecido>(simmowF), (f) => f.digitaSimmow)) m.set(k, (m.get(k) ?? 0) + v);
      return m;
    })(),
    documentos: contarPor(datos<SolicitudImpresion>(impresiones).filter((i) => i.estado === "impreso"), (i) => i.impresoPorNombre),
    traslados: contarPor(datos<SolicitudTraslado>(traslados), (t) => t.revisadoPorNombre),
  };

  const yo = normalizar(params.nombre);
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

  // Registros con fecha (para turnos sin actividad).
  const todos: Registro[] = [
    ...registros(ing, (i) => i.responsableIngresoNombre ?? i.creadoPorNombre, (i) => (i as { creadoEn?: unknown }).creadoEn),
    ...registros(datos<NotificacionAltaVivo>(altasProc).filter((a) => a.estado === "procesada"), (a) => a.procesadoPorNombre, (a) => a.procesadoEn),
    ...registros(datos<NotificacionFallecido>(confirmados), (x) => x.confirmadoPorNombre, (x) => x.confirmadoEn),
    ...registros(datos<NotificacionFallecido>(certificados), (x) => x.entregaCertificado, (x) => x.entregaCertificadoEn),
    ...registros(datos<NotificacionAltaVivo>(simmowA), (a) => a.digitaSimmow, (a) => a.digitaSimmowEn),
    ...registros(datos<NotificacionFallecido>(simmowF), (x) => x.digitaSimmow, (x) => x.digitaSimmowEn),
    ...registros(datos<SolicitudImpresion>(impresiones).filter((i) => i.estado === "impreso"), (i) => i.impresoPorNombre, (i) => i.impresoEn),
    ...registros(datos<SolicitudTraslado>(traslados), (t) => t.revisadoPorNombre, (t) => t.actualizadoEn),
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
  const plan = await resumenPlan({ marcPorMes, rango, yo: { uid: params.uid, nombre: params.nombre, codigoMarcacion: params.codigoMarcacion }, equipo: params.equipo, totales: totalesEquipo, registrosYo: todos.filter((r) => r.n === yo).map((r) => r.t.getTime()) });

  return {
    periodo: params.periodo,
    cargadoEn: new Date().toISOString(),
    plan,
    productividad,
    promedioEquipo,
    totalPersona,
    promedioTotalEquipo,
    marcaciones,
    altasRevertidas,
  };
}

/** El curso SGAS fue en octubre de 2026: el requisito aplica a los periodos que terminan desde entonces. */
export const SGAS_EXIGIBLE_DESDE = new Date(2026, 9, 1);

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
    aplica: !!rango && rango.fin >= SGAS_EXIGIBLE_DESDE,
    diploma: diplomas.length ? { fecha: aIso(diplomas[0].fecha), detalle: diplomas[0].notas || diplomas[0].tipo || "Diploma SGAS" } : null,
  };
  const entradas = snap.docs
    // Los diplomas/certificados viven en la misma colección pero no son parte de este respaldo.
    .filter((d) => d.data().categoria !== "diploma")
    .map((d) => {
      const x = d.data() as { tipo?: string; fecha?: unknown; notas?: string; nota?: number };
      return { id: d.id, tipo: x.tipo ?? "", fecha: aIso(x.fecha), notas: x.notas ?? "", ...(typeof x.nota === "number" ? { nota: x.nota } : {}) };
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
      for (let dia = 1; dia <= diasMes; dia++) {
        const fecha = new Date(anio, m - 1, dia);
        if (fecha > limite || fecha < p.rango.inicio) continue;
        const est = estadoFilaEnDia(fila, dia);
        if (est.tipo === "turno") {
          turnosDe.set(clave, (turnosDe.get(clave) ?? 0) + 1);
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
  return {
    turnosProgramados: turnosDe.get(yoN) ?? 0,
    turnosSinActividad: sinActividad,
    actividadesPorTurno: r1(porTurno(yoN)),
    promedioEquipoPorTurno: r1(tasasEquipo.length ? tasasEquipo.reduce((a, b) => a + b, 0) / tasasEquipo.length : 0),
    porMes,
  };
}
