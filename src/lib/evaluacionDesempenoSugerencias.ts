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
  // tarde NO cuentan aquí: ya se valoran en el factor 2. D ≤ 0, C ≤ 3, B ≤ 8, A > 8. Las
  // amonestaciones ponen tope: ver topeAmonestaciones().
  incidenciasMarcacion: { D: 0, C: 3, B: 8 },
} as const;

/** Texto de los criterios para mostrarlo al evaluador. */
export const CRITERIOS_TEXTO: { factor: number; dato: string; regla: string }[] = [
  { factor: 1, dato: "Errores atribuibles (altas efectivas revertidas)", regla: "D: 0 · C: 1–2 · B: 3–5 · A: más de 5" },
  { factor: 2, dato: "Llegadas tarde en el semestre (reloj). Solo en Jul–Dic 2026: diploma del curso SGAS subido a su ficha", regla: "D: 0–5 · C: 6–7 · B: 8–9 · A: 10 o más (en Jul–Dic 2026, también A sin diploma SGAS)" },
  { factor: 3, dato: "Actividades por turno trabajado comparadas con el promedio del equipo", regla: "D: 10% o más arriba · C: en el promedio · B: hasta 40% abajo · A: más de 40% abajo" },
  { factor: 4, dato: "Turnos en los que no registró nada en Services", regla: "D: hasta 5% · C: hasta 15% · B: hasta 30% · A: más de 30%" },
  { factor: 5, dato: "Disciplina: olvidos de marca + días sin marca + salidas antes de hora (reloj), y amonestaciones. Las llegadas tarde se valoran en el factor 2", regla: "Reloj D: 0 · C: 1–3 · B: 4–8 · A: más de 8. Amonestación oral: máx. C · escrita: máx. B · más de una: A" },
  { factor: 6, dato: "Sin dato directo", regla: "A criterio del jefe" },
  { factor: 7, dato: "Quejas o amonestaciones en el archivero, como alerta", regla: "A criterio del jefe" },
];

const menorEsMejor = (v: number, u: { D: number; C: number; B: number }): Opcion => (v <= u.D ? "D" : v <= u.C ? "C" : v <= u.B ? "B" : "A");
const mayorEsMejor = (v: number, u: { D: number; C: number; B: number }): Opcion => (v >= u.D ? "D" : v >= u.C ? "C" : v >= u.B ? "B" : "A");

const esAmonestacion = (tipo: string) => /amonest/i.test(tipo);

/**
 * Tope que dejan las amonestaciones del semestre en el factor 5 (regla de la
 * jefatura): una oral → máx. C; una escrita (la más grave, lleva copia a RRHH)
 * → máx. B; más de una → A. Escrita = el tipo dice "escrita"; lo demás (oral,
 * verbal, interna) cuenta como oral.
 */
function topeAmonestaciones(tipos: string[]): { tope: Opcion | null; texto: string } {
  if (!tipos.length) return { tope: null, texto: "" };
  if (tipos.length > 1) return { tope: "A", texto: `${tipos.length} amonestaciones` };
  const escrita = /escrit/i.test(tipos[0]);
  return escrita ? { tope: "B", texto: "1 amonestación escrita" } : { tope: "C", texto: "1 amonestación oral" };
}

/** La peor de dos letras (A es la peor). */
const peor = (a: Opcion, b: Opcion): Opcion => (a < b ? a : b);

/**
 * Motivos en una línea, solo el dato y su cifra: la regla ya se ve en el globito
 * y en "Ver criterios", así que aquí no se repite la explicación.
 */
export function sugerirFactores(r: ResumenRespaldo | null, esAdministrativo: boolean): Record<number, Sugerencia> {
  const sin = (motivo: string): Sugerencia => ({ letra: null, motivo });
  if (!r) return {};
  const n = (x: number, uno: string, varios: string) => `${x} ${x === 1 ? uno : varios}`;
  const tiposAmon = (r.archivero ?? []).filter((e) => esAmonestacion(e.tipo)).map((e) => e.tipo);
  const amonestaciones = tiposAmon.length;
  const conNota = (r.archivero ?? []).filter((e) => typeof e.nota === "number");
  const notas = conNota.length
    ? ` · Nota ${conNota.map((e) => `${e.nota}${(e.nota as number) < NOTA_MINIMA_EVALUACION ? " (reprobada)" : ""}`).join(", ")}`
    : "";
  const out: Record<number, Sugerencia> = {};
  const m = r.marcaciones;
  const plan = r.plan;

  // 1. Calidad
  if (esAdministrativo) out[1] = sin(`Administrativo: sin datos en Services${notas}`);
  else out[1] = { letra: menorEsMejor(r.altasRevertidas.length, CRITERIOS.errores), motivo: `${n(r.altasRevertidas.length, "alta revertida", "altas revertidas")}${notas}` };

  // 2. Responsabilidad: llegadas tarde. Solo en JUL - DIC 2026 (regla puntual de la
  // jefatura, ver SGAS_PERIODO): sin diploma SGAS queda en A.
  const tarde = m.meses ? n(m.tardanzas, "llegada tarde", "llegadas tarde") : "Sin reporte del reloj";
  if (r.sgas?.aplica && !r.sgas.diploma) out[2] = { letra: "A", motivo: `Sin diploma SGAS · ${tarde}` };
  else if (!m.meses) out[2] = sin(tarde);
  else out[2] = { letra: menorEsMejor(m.tardanzas, CRITERIOS.llegadasTarde), motivo: `${tarde}${r.sgas?.aplica ? " · Diploma SGAS subido" : ""}` };

  // 3. Cumplimiento de metas
  if (esAdministrativo) out[3] = sin("Administrativo: sin datos en Services");
  else if (!plan?.turnosProgramados) out[3] = sin("Sin turnos en el plan");
  else if (!plan.promedioEquipoPorTurno) out[3] = sin("El equipo no tiene actividad para comparar");
  else {
    const pct = Math.round((plan.actividadesPorTurno / plan.promedioEquipoPorTurno) * 100);
    const dif = pct - 100;
    out[3] = {
      letra: mayorEsMejor(pct, CRITERIOS.productividadPct),
      motivo: `${plan.actividadesPorTurno} por turno vs ${plan.promedioEquipoPorTurno} del equipo (${dif >= 0 ? "+" : ""}${dif}%)`,
    };
  }

  // 4. Organización
  if (esAdministrativo) out[4] = sin("Administrativo: sin datos en Services");
  else if (!plan?.turnosProgramados) out[4] = sin("Sin turnos en el plan");
  else {
    const pct = Math.round((plan.turnosSinActividad / plan.turnosProgramados) * 100);
    out[4] = { letra: menorEsMejor(pct, CRITERIOS.turnosVaciosPct), motivo: `${plan.turnosSinActividad} de ${plan.turnosProgramados} turnos sin registro (${pct}%)` };
  }

  // 5. Normas (disciplina): olvidos + sin marca + salidas antes; las amonestaciones
  // ponen un tope (oral máx. C, escrita máx. B, más de una A) y manda la peor letra.
  const faltas = m.omisiones + m.ausencias + (m.salidasAntes ?? 0);
  const amon = topeAmonestaciones(tiposAmon);
  const textoAmon = amonestaciones ? n(amonestaciones, "amonestación", "amonestaciones") : "";
  if (!m.meses && !amon.tope) out[5] = sin("Sin reporte del reloj");
  else {
    const porReloj: Opcion | null = m.meses ? menorEsMejor(faltas, CRITERIOS.incidenciasMarcacion) : null;
    const letra = porReloj && amon.tope ? peor(porReloj, amon.tope) : (porReloj ?? amon.tope ?? "D");
    const partes = [
      amon.tope ? `${amon.texto} (máx. ${amon.tope})` : "",
      m.meses ? `${n(faltas, "falta", "faltas")} (${m.omisiones} olvido, ${m.ausencias} sin marca, ${m.salidasAntes ?? 0} salió antes)` : "Sin reporte del reloj",
    ].filter(Boolean);
    out[5] = { letra, motivo: partes.join(" · ") };
  }

  // 6. Discreción
  out[6] = sin("A criterio del jefe");

  // 7. Relaciones laborales
  out[7] = sin(amonestaciones ? `A criterio del jefe · revisar ${textoAmon}` : "A criterio del jefe");

  return out;
}
