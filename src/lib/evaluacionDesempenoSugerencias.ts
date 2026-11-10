// Sugerencia de letra (A/B/C/D) por factor a partir del respaldo de Services.
//
// Es una AYUDA para el evaluador, nunca se aplica sola: el formulario MINSAL lo
// firma el jefe y él decide. Los umbrales viven aquí (CRITERIOS) para ajustarlos
// en un solo lugar cuando la jefatura los afine.
//
// Solo tiene sentido para el personal OPERATIVO: el trabajo del administrativo
// (sistema, calidad, coordinación) no queda registrado como productividad, así
// que para él solo se sugiere con marcaciones y archivero.

import type { Opcion } from "@/lib/evaluacionDesempeno";
import type { ResumenRespaldo } from "@/lib/evaluacionDesempenoRespaldo";
import { NOTA_MINIMA_EVALUACION } from "@/lib/evaluacionesPersonal";

export interface Sugerencia {
  letra: Opcion | null; // null = sin datos suficientes / a criterio del jefe
  motivo: string;
}

/** Umbrales: el valor se compara de la mejor letra (D) a la peor (A). */
export const CRITERIOS = {
  // Factor 1: errores atribuibles (hoy: altas efectivas revertidas). D ≤ 0, C ≤ 2, B ≤ 5, A > 5.
  errores: { D: 0, C: 2, B: 5 },
  // Factor 2: llegadas tarde en el semestre (reloj). D ≤ 5, C ≤ 7, B ≤ 9, A ≥ 10 (regla de la jefatura).
  llegadasTarde: { D: 5, C: 7, B: 9 },
  // Factor 3: actividades por turno, en % del promedio del equipo. D ≥ 110, C ≥ 90, B ≥ 60, A < 60.
  productividadPct: { D: 110, C: 90, B: 60 },
  // Factor 4: % de turnos sin ningún registro en Services. D ≤ 5, C ≤ 15, B ≤ 30, A > 30.
  turnosVaciosPct: { D: 5, C: 15, B: 30 },
  // Factor 5 (disciplina): olvidos de marca + días sin marca + salidas antes de hora. Las llegadas
  // tarde NO cuentan aquí: ya se valoran en el factor 2. D ≤ 0, C ≤ 3, B ≤ 8, A > 8 (o con amonestación).
  incidenciasMarcacion: { D: 0, C: 3, B: 8 },
} as const;

/** Texto de los criterios para mostrarlo al evaluador. */
export const CRITERIOS_TEXTO: { factor: number; dato: string; regla: string }[] = [
  { factor: 1, dato: "Errores atribuibles (altas efectivas revertidas)", regla: "D: 0 · C: 1–2 · B: 3–5 · A: más de 5" },
  { factor: 2, dato: "Llegadas tarde en el semestre (reloj)", regla: "D: 0–5 · C: 6–7 · B: 8–9 · A: 10 o más" },
  { factor: 3, dato: "Actividades por turno trabajado comparadas con el promedio del equipo", regla: "D: 10% o más arriba · C: en el promedio · B: hasta 40% abajo · A: más de 40% abajo" },
  { factor: 4, dato: "Turnos en los que no registró nada en Services", regla: "D: hasta 5% · C: hasta 15% · B: hasta 30% · A: más de 30%" },
  { factor: 5, dato: "Disciplina: olvidos de marca + días sin marca + salidas antes de hora (reloj), y amonestaciones. Las llegadas tarde se valoran en el factor 2", regla: "D: 0 · C: 1–3 · B: 4–8 · A: más de 8 o con amonestación" },
  { factor: 6, dato: "Sin dato directo", regla: "A criterio del jefe" },
  { factor: 7, dato: "Quejas o amonestaciones en el archivero, como alerta", regla: "A criterio del jefe" },
];

const menorEsMejor = (v: number, u: { D: number; C: number; B: number }): Opcion => (v <= u.D ? "D" : v <= u.C ? "C" : v <= u.B ? "B" : "A");
const mayorEsMejor = (v: number, u: { D: number; C: number; B: number }): Opcion => (v >= u.D ? "D" : v >= u.C ? "C" : v >= u.B ? "B" : "A");

const esAmonestacion = (tipo: string) => /amonest/i.test(tipo);

export function sugerirFactores(r: ResumenRespaldo | null, esAdministrativo: boolean): Record<number, Sugerencia> {
  const sin = (motivo: string): Sugerencia => ({ letra: null, motivo });
  if (!r) return {};
  const amonestaciones = (r.archivero ?? []).filter((e) => esAmonestacion(e.tipo)).length;
  const alertaAmon = amonestaciones ? ` Hay ${amonestaciones} amonestación(es) en el archivero.` : "";
  const conNota = (r.archivero ?? []).filter((e) => typeof e.nota === "number");
  const reprobadas = conNota.filter((e) => (e.nota as number) < NOTA_MINIMA_EVALUACION);
  const textoNotas = conNota.length
    ? ` Evaluaciones del archivero: ${conNota.map((e) => `${e.tipo} ${e.nota}`).join(", ")}${reprobadas.length ? ` (${reprobadas.length} bajo ${NOTA_MINIMA_EVALUACION})` : " (todas aprobadas)"}.`
    : "";
  const out: Record<number, Sugerencia> = {};

  // 1. Calidad
  if (esAdministrativo) out[1] = sin(`Administrativo: su trabajo no se registra en Services.${textoNotas}`);
  else {
    const n = r.altasRevertidas.length;
    out[1] = {
      letra: menorEsMejor(n, CRITERIOS.errores),
      motivo: `${n} alta(s) efectiva(s) revertida(s) en el periodo.${textoNotas}`,
    };
  }

  // 2. Responsabilidad: llegadas tarde del semestre
  const mr = r.marcaciones;
  if (mr.meses === 0) out[2] = sin(`No hay reporte del reloj cargado para este periodo.${alertaAmon}`);
  else
    out[2] = {
      letra: menorEsMejor(mr.tardanzas, CRITERIOS.llegadasTarde),
      motivo: `${mr.tardanzas} llegada(s) tarde en ${mr.meses} mes(es) con reporte del reloj.${alertaAmon}`,
    };

  // 3. Cumplimiento de metas
  const plan = r.plan;
  if (esAdministrativo) out[3] = sin("Administrativo: su trabajo no se registra como productividad.");
  else if (!plan || !plan.turnosProgramados) out[3] = sin("No tiene turnos en el plan de trabajo de este periodo para comparar.");
  else if (!plan.promedioEquipoPorTurno) out[3] = sin("El equipo no tiene actividad registrada para comparar.");
  else {
    const pct = Math.round((plan.actividadesPorTurno / plan.promedioEquipoPorTurno) * 100);
    const dif = pct - 100;
    const comparado = Math.abs(dif) < 10 ? "en el promedio del equipo" : dif > 0 ? `${dif}% arriba del promedio del equipo` : `${-dif}% abajo del promedio del equipo`;
    out[3] = {
      letra: mayorEsMejor(pct, CRITERIOS.productividadPct),
      motivo: `Hace ${plan.actividadesPorTurno} actividades por turno; el equipo, ${plan.promedioEquipoPorTurno}. Está ${comparado}.`,
    };
  }

  // 4. Organización
  if (esAdministrativo) out[4] = sin("Administrativo: su trabajo no se registra en Services.");
  else if (!plan || !plan.turnosProgramados) out[4] = sin("No tiene turnos en el plan de trabajo de este periodo.");
  else {
    const pct = Math.round((plan.turnosSinActividad / plan.turnosProgramados) * 100);
    out[4] = {
      letra: menorEsMejor(pct, CRITERIOS.turnosVaciosPct),
      motivo: `En ${plan.turnosSinActividad} de sus ${plan.turnosProgramados} turnos (${pct}%) no registró nada en Services.`,
    };
  }

  // 5. Normas e instrucciones
  const m = r.marcaciones;
  if (m.meses === 0 && !amonestaciones) out[5] = sin("No hay reporte del reloj cargado para este periodo.");
  else {
    const faltasDisciplina = m.omisiones + m.ausencias + (m.salidasAntes ?? 0);
    let letra = m.meses ? menorEsMejor(faltasDisciplina, CRITERIOS.incidenciasMarcacion) : "D";
    if (amonestaciones) letra = "A";
    out[5] = {
      letra,
      motivo: `${
        m.meses
          ? `En ${m.meses} mes(es) con reporte del reloj: ${m.omisiones} olvido(s) de marca, ${m.ausencias} día(s) sin marca y ${m.salidasAntes ?? 0} salida(s) antes de hora (${faltasDisciplina} en total). Las ${m.tardanzas} llegada(s) tarde no cuentan aquí: ya se valoran en Responsabilidad (factor 2).`
          : "Sin reporte del reloj."
      }${alertaAmon}`,
    };
  }

  // 6. Discreción
  out[6] = sin("Sin dato directo en Services: a criterio del jefe.");

  // 7. Relaciones laborales
  out[7] = sin(`Sin dato directo en Services: a criterio del jefe.${alertaAmon}`);

  return out;
}
