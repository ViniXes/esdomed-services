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

import { collection, getDocs, query, Timestamp, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import type { InconsistenciasMarcacionPersonal, NotificacionAltaVivo, NotificacionFallecido, SolicitudImpresion, SolicitudTraslado } from "@/types";
import { COLECCION_INCONSISTENCIAS_PERSONAL } from "@/lib/inconsistenciasMarcacion/personal";
import { tipoIncidencia } from "@/lib/inconsistenciasMarcacion/analisis";

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
    meses: number;          // meses publicados del periodo
    diasConIncidencia: number;
    tardanzas: number;      // días con minutos descontados
    minutos: number;
    omisiones: number;      // olvidó marcar entrada o salida
    ausencias: number;      // días sin ninguna marca
  };
  altasRevertidas: { fecha: string; paciente: string; nota: string }[];
}

export interface EntradaArchivero {
  id: string;
  tipo: string;
  fecha: string; // "YYYY-MM-DD"
  notas: string;
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
 * sin las hojas de Drive), marcaciones publicadas y altas revertidas del periodo.
 * `nombresEquipo` = personal operativo para el promedio de comparación.
 */
export async function cargarRespaldo(params: {
  empleadoId: string;
  nombre: string;
  periodo: string;
  nombresEquipo: string[];
}): Promise<ResumenRespaldo> {
  const rango = rangoDePeriodo(params.periodo);
  if (!rango) throw new Error("El periodo no tiene el formato «JUL - DIC 2026».");
  const ini = Timestamp.fromDate(rango.inicio);
  const fin = Timestamp.fromDate(rango.fin);
  const entre = (campo: string, col: string) => getDocs(query(collection(db, col), where(campo, ">=", ini), where(campo, "<=", fin)));

  const [ingresos, confirmados, certificados, simmowF, altasProc, simmowA, impresiones, traslados, revertidas, marc] = await Promise.all([
    entre("creadoEn", "control_ingresos"),
    entre("confirmadoEn", "notificaciones_fallecidos"),
    entre("entregaCertificadoEn", "notificaciones_fallecidos"),
    entre("digitaSimmowEn", "notificaciones_fallecidos"),
    entre("procesadoEn", "notificaciones_altas"),
    entre("digitaSimmowEn", "notificaciones_altas"),
    entre("impresoEn", "solicitudes_impresion"),
    entre("actualizadoEn", "traslados"),
    entre("revertidoEn", "notificaciones_altas"),
    getDocs(query(collection(db, COLECCION_INCONSISTENCIAS_PERSONAL), where("empleadoId", "==", params.empleadoId))),
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
  const equipo = new Set(params.nombresEquipo.map(normalizar));
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

  // Marcaciones publicadas por el admin, solo meses del periodo.
  const desde = `${rango.inicio.getFullYear()}-${String(rango.inicio.getMonth() + 1).padStart(2, "0")}`;
  const hasta = `${rango.fin.getFullYear()}-${String(rango.fin.getMonth() + 1).padStart(2, "0")}`;
  const meses = datos<InconsistenciasMarcacionPersonal>(marc).filter((m) => m.periodo >= desde && m.periodo <= hasta);
  const dias = meses.flatMap((m) => m.dias ?? []);
  const marcaciones = {
    meses: meses.length,
    diasConIncidencia: dias.length,
    tardanzas: dias.filter((d) => tipoIncidencia(d) === "minutos").length,
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

  return {
    periodo: params.periodo,
    cargadoEn: new Date().toISOString(),
    productividad,
    promedioEquipo,
    totalPersona,
    promedioTotalEquipo,
    marcaciones,
    altasRevertidas,
  };
}

/** Entradas del archivero (evaluaciones / amonestaciones) de la persona dentro del periodo. */
export async function cargarArchivero(empleadoId: string, periodo: string): Promise<EntradaArchivero[]> {
  const rango = rangoDePeriodo(periodo);
  const snap = await getDocs(query(collection(db, "evaluaciones_personal"), where("empleadoId", "==", empleadoId)));
  return snap.docs
    .map((d) => {
      const x = d.data() as { tipo?: string; fecha?: unknown; notas?: string };
      return { id: d.id, tipo: x.tipo ?? "", fecha: aIso(x.fecha), notas: x.notas ?? "" };
    })
    .filter((e) => {
      if (!rango || !e.fecha) return true;
      const f = new Date(`${e.fecha}T12:00:00`);
      return f >= rango.inicio && f <= rango.fin;
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
