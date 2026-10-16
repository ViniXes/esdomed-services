import type { FilaPlanTrabajo, PermisoTramitePlan, PlanTrabajo } from "@/types";
import { esMarcaEspecial, getHorario, labelMarca, type Horario } from "@/lib/esdomed/horarios";
import { minutosDeEtiqueta, permisoDelDia } from "@/lib/esdomed/permisos-plan";
import { normalizarCodigoMarcacion } from "@/lib/esdomed/catalogo-plan";
import { formatPeriodo } from "@/lib/esdomed/plan";

// Lectura "por día" del plan de trabajo ESDOMED: qué tiene cada persona en una
// fecha concreta (turno con su ventana horaria, ausencia o descanso) y si está
// en turno en este momento. Solo lee el plan ya cargado; no escribe nada.

export const MIN_DIA = 24 * 60;

/** Fecha local a medianoche + su ubicación en el plan (doc del mes y día 1-based). */
export interface FechaPlan {
  fecha: Date;
  periodo: string;
  dia: number;
}

export function fechaPlan(fecha: Date): FechaPlan {
  const f = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  return { fecha: f, periodo: formatPeriodo(f.getFullYear(), f.getMonth() + 1), dia: f.getDate() };
}

export function sumarDias(fecha: Date, n: number): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + n);
}

/**
 * Ventana del turno en minutos desde la medianoche del día en que inicia.
 * `fin` > 1440 = el turno amanece al día siguiente (TH34: 7 am → 7 am).
 */
export function ventanaTurno(h: Horario): { inicio: number; fin: number } | null {
  const inicio = minutosDeEtiqueta(h.entrada);
  if (inicio === null) return null;
  const esperado = Math.round(h.horas * 60);
  const salida = minutosDeEtiqueta(h.salida);
  if (salida === null) return { inicio, fin: inicio + esperado };
  // Duración según las etiquetas (cruza la medianoche si la salida no es
  // posterior a la entrada); los de más de 24 h (TH102: 7 am → 3 pm del día
  // siguiente, 32 h) se completan con las horas del catálogo.
  let duracion = (salida - inicio + MIN_DIA) % MIN_DIA || MIN_DIA;
  while (duracion + MIN_DIA <= esperado + 60) duracion += MIN_DIA;
  return { inicio, fin: inicio + duracion };
}

export type TipoEstadoDia = "turno" | "ausencia" | "descanso";

export interface EstadoDia {
  tipo: TipoEstadoDia;
  /** Celda en mayúsculas: "TH34", "PER", "ASU" o "" (descanso). */
  codigo: string;
  horario?: Horario;
  inicio?: number;
  fin?: number;
  /** Permiso por fracción del turno (la celda conserva el código del turno). */
  permisoParcial?: PermisoTramitePlan;
}

export function estadoDeCelda(celda: string | undefined, permiso?: PermisoTramitePlan): EstadoDia {
  const codigo = (celda ?? "").trim().toUpperCase();
  const horario = getHorario(codigo);
  if (horario) {
    const ventana = ventanaTurno(horario);
    return {
      tipo: "turno",
      codigo,
      horario,
      inicio: ventana?.inicio,
      fin: ventana?.fin,
      permisoParcial: permiso?.parcial ? permiso : undefined,
    };
  }
  // El asueto no es una ausencia de la persona: ese día no se trabaja.
  if (esMarcaEspecial(codigo) && codigo !== "ASU") return { tipo: "ausencia", codigo };
  return { tipo: "descanso", codigo };
}

/** Texto corto del día para alguien que no tiene turno: "Vacaciones", "Asueto", "Descanso". */
export function etiquetaSinTurno(estado: EstadoDia): string {
  if (estado.codigo && esMarcaEspecial(estado.codigo)) return labelMarca(estado.codigo);
  return "Descanso";
}

export interface RefPersona {
  uid?: string;
  codigoMarcacion?: string;
}

/** Fila de una persona en un plan, por uid y como respaldo por código de marcación. */
export function buscarFila(plan: PlanTrabajo | null | undefined, ref: RefPersona): FilaPlanTrabajo | undefined {
  if (!plan) return undefined;
  const codigo = normalizarCodigoMarcacion(ref.codigoMarcacion);
  return (
    (ref.uid ? plan.filas.find((f) => f.uid === ref.uid) : undefined) ||
    (codigo ? plan.filas.find((f) => normalizarCodigoMarcacion(f.codigoMarcacion) === codigo) : undefined)
  );
}

export type PlanesPorPeriodo = Record<string, PlanTrabajo | null | undefined>;

/** Estado de la fila en un día del mes de SU plan. */
export function estadoFilaEnDia(fila: FilaPlanTrabajo, dia: number): EstadoDia {
  return estadoDeCelda(fila.asignaciones[dia - 1], permisoDelDia(fila, dia));
}

/** Estado de una persona en una fecha; null si no aparece en el plan de ese mes. */
export function estadoPersonaEn(planes: PlanesPorPeriodo, ref: RefPersona, fecha: Date): EstadoDia | null {
  const { periodo, dia } = fechaPlan(fecha);
  const fila = buscarFila(planes[periodo], ref);
  return fila ? estadoFilaEnDia(fila, dia) : null;
}

export type MomentoTurno = "por_entrar" | "en_turno" | "terminado";

/** Dónde va un turno de HOY respecto a la hora actual (minutos desde la medianoche). */
export function momentoTurno(estado: EstadoDia, ahoraMin: number): MomentoTurno | null {
  if (estado.tipo !== "turno" || estado.inicio == null || estado.fin == null) return null;
  if (ahoraMin < estado.inicio) return "por_entrar";
  if (ahoraMin < estado.fin) return "en_turno";
  return "terminado";
}

/** ¿El turno de AYER sigue corriendo ahora? (los de 24 h o nocturnos amanecen hoy). */
export function sigueDesdeAyer(estadoAyer: EstadoDia | null | undefined, ahoraMin: number): boolean {
  if (!estadoAyer || estadoAyer.tipo !== "turno" || estadoAyer.fin == null) return false;
  return estadoAyer.fin - MIN_DIA > ahoraMin;
}

/** Minutos desde la medianoche de una fecha. */
export function minutosDelDia(fecha: Date): number {
  return fecha.getHours() * 60 + fecha.getMinutes();
}
