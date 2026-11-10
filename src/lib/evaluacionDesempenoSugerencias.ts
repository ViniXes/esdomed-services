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

export interface Sugerencia {
  letra: Opcion | null; // null = sin datos suficientes / a criterio del jefe
  motivo: string;
}

/** Umbrales: el valor se compara de la mejor letra (D) a la peor (A). */
export const CRITERIOS = {
  // Factor 1: errores atribuibles (hoy: altas efectivas revertidas). D ≤ 0, C ≤ 2, B ≤ 5, A > 5.
  errores: { D: 0, C: 2, B: 5 },
  // Factor 3: productividad por 100 h programadas, en % del promedio del equipo. D ≥ 110, C ≥ 90, B ≥ 60, A < 60.
  productividadPct: { D: 110, C: 90, B: 60 },
  // Factor 4: % de turnos sin ningún registro en Services. D ≤ 5, C ≤ 15, B ≤ 30, A > 30.
  turnosVaciosPct: { D: 5, C: 15, B: 30 },
  // Factor 5: días con incidencia en el reloj. D ≤ 0, C ≤ 3, B ≤ 8, A > 8 (o con amonestación).
  incidenciasMarcacion: { D: 0, C: 3, B: 8 },
} as const;

/** Texto de los criterios para mostrarlo al evaluador. */
export const CRITERIOS_TEXTO: { factor: number; dato: string; regla: string }[] = [
  { factor: 1, dato: "Errores atribuibles (altas efectivas revertidas)", regla: "D: 0 · C: 1–2 · B: 3–5 · A: más de 5" },
  { factor: 2, dato: "Sin dato directo; amonestaciones como alerta", regla: "A criterio del jefe" },
  { factor: 3, dato: "Productividad por cada 100 h programadas vs. promedio del equipo", regla: "D: ≥110% · C: 90–110% · B: 60–90% · A: <60%" },
  { factor: 4, dato: "Turnos programados sin ningún registro en Services", regla: "D: ≤5% · C: ≤15% · B: ≤30% · A: >30%" },
  { factor: 5, dato: "Días con incidencia en el reloj + amonestaciones", regla: "D: 0 · C: 1–3 · B: 4–8 · A: más de 8 o con amonestación" },
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
  const out: Record<number, Sugerencia> = {};

  // 1. Calidad
  if (esAdministrativo) out[1] = sin("Administrativo: su trabajo no se registra en Services.");
  else {
    const n = r.altasRevertidas.length;
    out[1] = {
      letra: menorEsMejor(n, CRITERIOS.errores),
      motivo: `${n} alta(s) efectiva(s) revertida(s) en el periodo. Única fuente de errores trazable por ahora.`,
    };
  }

  // 2. Responsabilidad
  out[2] = sin(`Sin dato directo en Services: a criterio del jefe.${alertaAmon}`);

  // 3. Cumplimiento de metas
  const plan = r.plan;
  if (esAdministrativo) out[3] = sin("Administrativo: su trabajo no se registra como productividad.");
  else if (!plan || plan.horasProgramadas === 0) out[3] = sin("No hay turnos del plan de trabajo en este periodo para comparar.");
  else if (plan.tasaEquipoPor100h === 0) out[3] = sin("El equipo no tiene actividad registrada para comparar.");
  else {
    const pct = Math.round((plan.tasaPor100h / plan.tasaEquipoPor100h) * 100);
    out[3] = {
      letra: mayorEsMejor(pct, CRITERIOS.productividadPct),
      motivo: `${plan.tasaPor100h} actividades por cada 100 h programadas = ${pct}% del promedio del equipo (${plan.tasaEquipoPor100h}).`,
    };
  }

  // 4. Organización
  if (esAdministrativo) out[4] = sin("Administrativo: su trabajo no se registra en Services.");
  else if (!plan || plan.turnosProgramados === 0) out[4] = sin("No hay turnos del plan de trabajo en este periodo.");
  else {
    const pct = Math.round((plan.turnosSinActividad / plan.turnosProgramados) * 100);
    out[4] = {
      letra: menorEsMejor(pct, CRITERIOS.turnosVaciosPct),
      motivo: `${plan.turnosSinActividad} de ${plan.turnosProgramados} turnos (${pct}%) sin ningún registro en Services.`,
    };
  }

  // 5. Normas e instrucciones
  const m = r.marcaciones;
  if (m.meses === 0 && !amonestaciones) out[5] = sin("No hay meses de marcación publicados en este periodo.");
  else {
    let letra = m.meses ? menorEsMejor(m.diasConIncidencia, CRITERIOS.incidenciasMarcacion) : "D";
    if (amonestaciones) letra = "A";
    out[5] = {
      letra,
      motivo: `${m.meses ? `${m.diasConIncidencia} día(s) con incidencia en ${m.meses} mes(es) publicados.` : "Sin marcaciones publicadas."}${alertaAmon}`,
    };
  }

  // 6. Discreción
  out[6] = sin("Sin dato directo en Services: a criterio del jefe.");

  // 7. Relaciones laborales
  out[7] = sin(`Sin dato directo en Services: a criterio del jefe.${alertaAmon}`);

  return out;
}
