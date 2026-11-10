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
  // Factor 1: altas efectivas revertidas. D ≤ 4, C 5–6, B 7–8, A ≥ 9 (con 5 empieza la C).
  errores: { D: 4, C: 6, B: 8 },
  // Factor 2: llegadas tarde en el semestre (reloj). D ≤ 5, C ≤ 7, B ≤ 9, A ≥ 10 (regla de la jefatura).
  llegadasTarde: { D: 5, C: 7, B: 9 },
  // Factor 3: actividades por turno, en % del que más registró en su grupo (= 100%).
  // D ≥ 80, C ≥ 60, B ≥ 40, A < 40.
  productividadPct: { D: 80, C: 60, B: 40 },
  // Factor 4: % de turnos sin ningún registro en Services. D ≤ 5, C ≤ 15, B ≤ 30, A > 30.
  turnosVaciosPct: { D: 5, C: 15, B: 30 },
  // Factor 5 (disciplina): olvidos de marca + días sin marca + salidas antes de hora. Las llegadas
  // tarde NO cuentan aquí: ya se valoran en el factor 2. D ≤ 5, C ≤ 7, B ≤ 9, A ≥ 10 (igual que las llegadas tarde). Las
  // amonestaciones ponen tope: ver topeAmonestaciones().
  incidenciasMarcacion: { D: 5, C: 7, B: 9 },
} as const;

/** Texto de los criterios para mostrarlo al evaluador. */
export const CRITERIOS_TEXTO: { factor: number; dato: string; regla: string }[] = [
  { factor: 1, dato: "Errores atribuibles (altas efectivas revertidas) y nota del examen del archivero", regla: "D: 0–4 · C: 5–6 · B: 7–8 · A: 9 o más. Examen reprobado (menos de 7): máx. B" },
  { factor: 2, dato: "Llegadas tarde en el semestre (reloj). Solo en Jul–Dic 2026: diploma del curso SGAS subido a su ficha", regla: "D: 0–5 · C: 6–7 · B: 8–9 · A: 10 o más (en Jul–Dic 2026, también A sin diploma SGAS)" },
  { factor: 3, dato: "Actividades registradas en Services por turno (sin traslados), como % del que más registró en su grupo", regla: "D: 80% o más del mejor · C: 60–79% · B: 40–59% · A: menos de 40%" },
  { factor: 4, dato: "Turnos en los que no registró nada en Services", regla: "D: hasta 5% · C: hasta 15% · B: hasta 30% · A: más de 30%" },
  { factor: 5, dato: "Disciplina: olvidos de marca + días sin marca + salidas antes de hora (reloj), y amonestaciones. Las llegadas tarde se valoran en el factor 2", regla: "Reloj D: 0–5 · C: 6–7 · B: 8–9 · A: 10 o más. Amonestación interna/oral: máx. C · escrita: máx. B · más de una: A" },
  { factor: 6, dato: "Sin dato directo", regla: "A criterio del jefe" },
  { factor: 7, dato: "Quejas o amonestaciones en el archivero, como alerta", regla: "A criterio del jefe" },
];

const menorEsMejor = (v: number, u: { D: number; C: number; B: number }): Opcion => (v <= u.D ? "D" : v <= u.C ? "C" : v <= u.B ? "B" : "A");
const mayorEsMejor = (v: number, u: { D: number; C: number; B: number }): Opcion => (v >= u.D ? "D" : v >= u.C ? "C" : v >= u.B ? "B" : "A");

const esAmonestacion = (tipo: string) => /amonest/i.test(tipo);

/**
 * Tope que dejan las amonestaciones del semestre en el factor 5 (regla de la
 * jefatura): una oral → máx. C; una escrita (la más grave, lleva copia a RRHH)
 * → máx. B; más de una → A. Escrita = el tipo dice "escrita"; lo demás (interna,
 * oral, verbal) pesa como oral.
 */
function topeAmonestaciones(tipos: string[]): { tope: Opcion | null; texto: string } {
  if (!tipos.length) return { tope: null, texto: "" };
  if (tipos.length > 1) return { tope: "A", texto: `${tipos.length} amonestaciones` };
  if (/escrit/i.test(tipos[0])) return { tope: "B", texto: "1 amonestación escrita" };
  return { tope: "C", texto: /intern/i.test(tipos[0]) ? "1 amonestación interna" : "1 amonestación oral" };
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
  // Examen del archivero: cuenta solo el más reciente de cada tipo (la reevaluación
  // reemplaza a la anterior). Reprobado (< 7) deja el factor 1 en máx. B.
  const ultimoPorTipo = new Map<string, NonNullable<ResumenRespaldo["archivero"]>[number]>();
  for (const e of r.archivero ?? []) {
    if (typeof e.nota !== "number") continue;
    const previo = ultimoPorTipo.get(e.tipo);
    if (!previo || e.fecha > previo.fecha) ultimoPorTipo.set(e.tipo, e);
  }
  const conNota = [...ultimoPorTipo.values()];
  const reprobado = conNota.some((e) => (e.nota as number) < NOTA_MINIMA_EVALUACION);
  const notas = conNota.length
    ? ` · Nota ${conNota.map((e) => `${e.nota}${(e.nota as number) < NOTA_MINIMA_EVALUACION ? " (reprobada, máx. B)" : ""}`).join(", ")}`
    : "";
  const out: Record<number, Sugerencia> = {};
  const m = r.marcaciones;
  const plan = r.plan;

  // 1. Calidad: altas revertidas; examen reprobado pone tope B (manda la peor letra).
  if (esAdministrativo) out[1] = reprobado ? { letra: "B", motivo: `Administrativo${notas}` } : sin(`Administrativo: sin datos en Services${notas}`);
  else {
    const porAltas = menorEsMejor(r.altasRevertidas.length, CRITERIOS.errores);
    out[1] = { letra: reprobado ? peor(porAltas, "B") : porAltas, motivo: `${n(r.altasRevertidas.length, "alta revertida", "altas revertidas")}${notas}` };
  }

  // 2. Responsabilidad: llegadas tarde. Solo en JUL - DIC 2026 (regla puntual de la
  // jefatura, ver SGAS_PERIODO): sin diploma SGAS queda en A.
  const tarde = m.meses ? n(m.tardanzas, "llegada tarde", "llegadas tarde") : "Sin reporte del reloj";
  if (r.sgas?.aplica && !r.sgas.diploma) out[2] = { letra: "A", motivo: `Sin diploma SGAS · ${tarde}` };
  else if (!m.meses) out[2] = sin(tarde);
  else out[2] = { letra: menorEsMejor(m.tardanzas, CRITERIOS.llegadasTarde), motivo: `${tarde}${r.sgas?.aplica ? " · Diploma SGAS subido" : ""}` };

  // 3. Cumplimiento de metas
  if (esAdministrativo) out[3] = sin("Administrativo: sin datos en Services");
  else if (!plan?.turnosProgramados) out[3] = sin("Sin turnos en el plan");
  else {
    // El 100% es quien más registró por turno en su grupo; si no hay compañeros en él, en todo el equipo.
    const conGrupo = !!plan.companerosGrupo && !!plan.maximoGrupoPorTurno;
    const base = conGrupo ? (plan.maximoGrupoPorTurno as number) : (plan.maximoEquipoPorTurno ?? 0);
    const quien = conGrupo ? plan.grupo : "el equipo";
    if (!base) out[3] = sin("Vuelve a cargar el respaldo");
    else {
      const pct = Math.round((plan.actividadesPorTurno / base) * 100);
      out[3] = {
        letra: mayorEsMejor(pct, CRITERIOS.productividadPct),
        motivo: `${pct}% del mejor de ${quien} (${plan.actividadesPorTurno} vs ${base} por turno)`,
      };
    }
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
