// Clasificación y agregados para el dashboard de inconsistencias de marcación.
//
// Cada fila del reporte es UN día con incidencia. Según qué marcas faltan, el
// reloj descuenta el turno completo (8 o 24 h) o solo los minutos:
//   - omision_entrada: hay salida pero no entrada → turno completo
//   - omision_salida:  hay entrada pero no salida → turno completo
//   - sin_marcacion:   ninguna de las dos        → turno completo (ausencia)
//   - minutos:         ambas marcas; se descuenta la llegada tarde y/o la
//                      salida antes de hora (el reporte no las separa: TIEMPO
//                      es la suma; el desglose de aquí es una estimación).
// "00:00" es "sin marca": ningún turno del reporte empieza ni termina a medianoche.

import type {
  DiaInconsistenciaMarcacion,
  EmpleadoInconsistenciasMarcacion,
  ReporteInconsistenciasMarcacion,
} from "@/types";

export type TipoIncidencia = "omision_entrada" | "omision_salida" | "sin_marcacion" | "minutos";

export const TIPOS_INCIDENCIA: TipoIncidencia[] = ["omision_entrada", "omision_salida", "sin_marcacion", "minutos"];

export const TIPO_INCIDENCIA_LABEL: Record<TipoIncidencia, string> = {
  omision_entrada: "Olvidó marcar entrada",
  omision_salida: "Olvidó marcar salida",
  sin_marcacion: "Sin ninguna marca",
  minutos: "Tardanza / salida temprana",
};

/** Turno completo descontado (las tres primeras) vs. descuento por minutos. */
export const esTurnoCompleto = (t: TipoIncidencia) => t !== "minutos";

const SIN_MARCA = "00:00";

export function tipoIncidencia(d: Pick<DiaInconsistenciaMarcacion, "entrada" | "salida">): TipoIncidencia {
  const sinEntrada = d.entrada === SIN_MARCA;
  const sinSalida = d.salida === SIN_MARCA;
  if (sinEntrada && sinSalida) return "sin_marcacion";
  if (sinEntrada) return "omision_entrada";
  if (sinSalida) return "omision_salida";
  return "minutos";
}

const aMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Estimación de cuántos minutos fueron llegada tarde y cuántos salida temprana,
 * a partir del horario. Cuadra con el TIEMPO oficial en ~99% de los días; el
 * monto y el tiempo oficiales siguen siendo los del reporte.
 */
export function desgloseMinutos(d: DiaInconsistenciaMarcacion): { tarde: number; temprano: number } {
  if (tipoIncidencia(d) !== "minutos") return { tarde: 0, temprano: 0 };
  const [ini, fin] = d.horario.split("-").map((s) => aMin(s.trim()));
  const duracion = (fin - ini + 1440) % 1440 || 1440;
  // Entrada relativa al inicio del turno, en (-12 h, +12 h].
  const entradaRel = ((aMin(d.entrada) - ini + 720 + 1440) % 1440) - 720;
  // Salida relativa al inicio; en turnos de 24 h la salida cae el día siguiente.
  let salidaRel = (aMin(d.salida) - ini + 1440) % 1440;
  if (duracion === 1440 && salidaRel < 720) salidaRel += 1440;
  return { tarde: Math.max(0, entradaRel), temprano: Math.max(0, duracion - salidaRel) };
}

// ─── Agregados ────────────────────────────────────────────────────────────────

export interface Contador {
  eventos: number;
  monto: number;
  minutos: number;
}
const contadorVacio = (): Contador => ({ eventos: 0, monto: 0, minutos: 0 });

export interface DiaConContexto extends DiaInconsistenciaMarcacion {
  periodo: string;
  tipo: TipoIncidencia;
}

export interface ResumenPersona {
  codigoMarcacion: string;
  nombre: string;
  plaza: string;
  /** Meses del alcance en que la persona aparece en el reporte. */
  meses: string[];
  total: number;
  porTipo: Record<TipoIncidencia, Contador>;
  dias: DiaConContexto[];
}

export interface ResumenAlcance {
  total: number;
  incidencias: number;
  porTipo: Record<TipoIncidencia, Contador>;
  personas: ResumenPersona[];
  /** Lunes a domingo. */
  porDiaSemana: Contador[];
}

const porTipoVacio = () =>
  Object.fromEntries(TIPOS_INCIDENCIA.map((t) => [t, contadorVacio()])) as Record<TipoIncidencia, Contador>;

const sumar = (c: Contador, d: DiaInconsistenciaMarcacion) => {
  c.eventos++;
  c.monto += d.monto;
  c.minutos += d.minutos;
};

/** 0 = lunes … 6 = domingo. */
export function indiceDiaSemana(fechaIso: string): number {
  const [y, m, d] = fechaIso.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

export const DIAS_SEMANA_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Junta uno o varios meses: totales oficiales por persona + días clasificados. */
export function resumirAlcance(reportes: ReporteInconsistenciasMarcacion[]): ResumenAlcance {
  const porTipo = porTipoVacio();
  const porDiaSemana = DIAS_SEMANA_CORTOS.map(contadorVacio);
  const personas = new Map<string, ResumenPersona>();
  let total = 0;
  let incidencias = 0;

  const ordenados = [...reportes].sort((a, b) => a.periodo.localeCompare(b.periodo));
  for (const r of ordenados) {
    // El total del alcance es el Total General oficial (los totales por persona
    // vienen redondeados y su suma puede diferir por centavos).
    total += r.totalGeneral;
    for (const e of r.empleados) {
      const p = personas.get(e.codigoMarcacion) ?? nuevaPersona(e);
      // El nombre/plaza más reciente gana (los reportes vienen en orden).
      p.nombre = e.nombre;
      p.plaza = e.plaza;
      if (!p.meses.includes(r.periodo)) p.meses.push(r.periodo);
      p.total += e.total;
      for (const d of e.dias) {
        const tipo = tipoIncidencia(d);
        sumar(p.porTipo[tipo], d);
        sumar(porTipo[tipo], d);
        sumar(porDiaSemana[indiceDiaSemana(d.fecha)], d);
        p.dias.push({ ...d, periodo: r.periodo, tipo });
        incidencias++;
      }
      personas.set(e.codigoMarcacion, p);
    }
  }

  return {
    total: redondear(total),
    incidencias,
    porTipo,
    personas: [...personas.values()]
      .map((p) => ({ ...p, total: redondear(p.total) }))
      .sort((a, b) => b.total - a.total || b.dias.length - a.dias.length || a.nombre.localeCompare(b.nombre)),
    porDiaSemana,
  };
}

function nuevaPersona(e: EmpleadoInconsistenciasMarcacion): ResumenPersona {
  return { codigoMarcacion: e.codigoMarcacion, nombre: e.nombre, plaza: e.plaza, meses: [], total: 0, porTipo: porTipoVacio(), dias: [] };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Contador de los tres tipos que descuentan el turno completo. */
export function turnoCompleto(porTipo: Record<TipoIncidencia, Contador>): Contador {
  const c = contadorVacio();
  for (const t of TIPOS_INCIDENCIA) {
    if (!esTurnoCompleto(t)) continue;
    c.eventos += porTipo[t].eventos;
    c.monto += porTipo[t].monto;
    c.minutos += porTipo[t].minutos;
  }
  return c;
}

/** Total descontado por mes, separado en turno completo y minutos (para la tendencia). */
export function totalesPorMes(reportes: ReporteInconsistenciasMarcacion[]) {
  return [...reportes]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((r) => {
      let turno = 0;
      let minutos = 0;
      for (const e of r.empleados) {
        for (const d of e.dias) {
          if (esTurnoCompleto(tipoIncidencia(d))) turno += d.monto;
          else minutos += d.monto;
        }
      }
      return {
        periodo: r.periodo,
        mes: r.mes,
        total: r.totalGeneral,
        turnoCompleto: redondear(turno),
        minutos: redondear(minutos),
        personas: r.empleados.length,
      };
    });
}

// ─── Formato ──────────────────────────────────────────────────────────────────

export const formatoDinero = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 138 → "2 h 18 min"; 45 → "45 min". */
export function formatoDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
