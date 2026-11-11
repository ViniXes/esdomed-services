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
  // Factor 1: errores de la revisión de Denys por cada 100 egresos digitados en SIMMOW.
  // D ≤ 10%, C ≤ 15%, B ≤ 20%, A > 20% (la revisión cuenta el egreso entero aunque falle un solo
  // campo, por eso el tope es más amplio que el 5% habitual). Solo con al menos MIN_DIGITADOS digitados.
  tasaErrores: { D: 10, C: 15, B: 20 },
  // Factor 3: % que hizo la persona del total de actividades del servicio en el semestre.
  // D ≥ 8%, C ≥ 4%, B ≥ 2%, A < 2% (con unas 20 personas, la parte pareja es ~5%).
  porcentajeServicio: { D: 8, C: 4, B: 2 },
  // Factor 2: llegadas tarde en el semestre (reloj). D ≤ 5, C ≤ 7, B ≤ 9, A ≥ 10 (regla de la jefatura).
  llegadasTarde: { D: 5, C: 7, B: 9 },
  // Factor 4: % de turnos sin ningún registro en Services. D ≤ 5, C ≤ 15, B ≤ 30, A > 30.
  turnosVaciosPct: { D: 5, C: 15, B: 30 },
  // Factor 5 (disciplina): olvidos de marca + días sin marca + salidas antes de hora. Las llegadas
  // tarde NO cuentan aquí: ya se valoran en el factor 2. D ≤ 5, C ≤ 7, B ≤ 9, A ≥ 10 (igual que las llegadas tarde). Las
  // amonestaciones ponen tope: ver topeAmonestaciones().
  incidenciasMarcacion: { D: 5, C: 7, B: 9 },
} as const;

/** Texto de los criterios para mostrarlo al evaluador. */
export const CRITERIOS_TEXTO: { factor: number; dato: string; regla: string }[] = [
  { factor: 1, dato: "Errores que le observaron en la revisión de digitación SIMMOW (Denys), por cada 100 egresos que digitó; y nota del examen", regla: "Errores: D hasta 10% · C 10–15% · B 15–20% · A más de 20% (con 30+ digitados). Examen reprobado: máx. B. Coordinadores de equipo: un punto arriba" },
  { factor: 2, dato: "Llegadas tarde en el semestre (reloj). Solo en Jul–Dic 2026: diploma del curso SGAS subido a su ficha", regla: "D: 0–5 · C: 6–7 · B: 8–9 · A: 10 o más (en Jul–Dic 2026, también A sin diploma SGAS)" },
  { factor: 3, dato: "% que hizo del total de actividades del servicio en el semestre", regla: "D: 8% o más · C: 4–7.9% · B: 2–3.9% · A: menos de 2%" },
  { factor: 4, dato: "De los turnos que tuvo en el plan, en cuántos no registró ni una sola actividad en Services (ningún expediente, alta, impresión, SIMMOW… en todo el turno)", regla: "Turnos vacíos: D hasta 5% de sus turnos · C 6–15% · B 16–30% · A más de 30%" },
  { factor: 5, dato: "Disciplina: olvidos de marca + días sin marca + salidas antes de hora (reloj), y amonestaciones. Las llegadas tarde se valoran en el factor 2", regla: "Reloj D: 0–5 · C: 6–7 · B: 8–9 · A: 10 o más. Amonestación interna/oral: máx. C · escrita: máx. B · más de una: A" },
  { factor: 6, dato: "Sin dato directo", regla: "A criterio del jefe" },
  { factor: 7, dato: "Quejas o amonestaciones en el archivero, como alerta", regla: "A criterio del jefe" },
];

const menorEsMejor = (v: number, u: { D: number; C: number; B: number }): Opcion => (v <= u.D ? "D" : v <= u.C ? "C" : v <= u.B ? "B" : "A");
const mayorEsMejor = (v: number, u: { D: number; C: number; B: number }): Opcion => (v >= u.D ? "D" : v >= u.C ? "C" : v >= u.B ? "B" : "A");

const esAmonestacion = (tipo: string) => /amonest/i.test(tipo);

/** Mínimo de egresos digitados en SIMMOW para que la tasa de errores sea confiable. */
export const MIN_DIGITADOS = 30;

/**
 * Coordinadores de equipo (decisión de la jefatura): además de su trabajo hacen
 * reportes, resuelven conflictos y problemas y reportan a los jefes, así que en
 * Calidad del trabajo se les sube un punto sobre lo que les salga. Por uid; si
 * cambian los coordinadores, se actualiza esta lista.
 */
export const COORDINADORES_EQUIPO: Record<string, string> = {
  gZwWfKaYDmTZavHW6vMmATorhMN2: "Violeta Sarai Castro Orellana",
  "8WACn4ixi7TwPabAD6m8JlZceMI3": "Gabriela Alejandra Calpaño Rodriguez",
  yiPrJKlgL4SR58Xw9ic4q3OXdcz2: "Alejandro Gabriel Hernández Herrera",
  "3Fr9fO3pRkYQAKiXWcHHWIzlSiU2": "Bartimeo Oliverio Lopez Pichinte",
};

/** Una letra más arriba (A→B, B→C, C→D; D se queda en D). */
const subir = (l: Opcion): Opcion => (l === "A" ? "B" : l === "B" ? "C" : "D");

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
export function sugerirFactores(
  r: ResumenRespaldo | null,
  esAdministrativo: boolean,
  opciones: { esCoordinador?: boolean } = {},
): Record<number, Sugerencia> {
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

  // 1. Calidad: errores de la revisión de Denys por cada 100 egresos digitados en SIMMOW;
  // examen reprobado pone tope B (manda la peor letra).
  const er = r.errores;
  if (esAdministrativo) out[1] = reprobado ? { letra: "B", motivo: `Administrativo${notas}` } : sin(`Administrativo: sin datos en Services${notas}`);
  else if (!er) out[1] = reprobado ? { letra: "B", motivo: `Dale Actualizar al respaldo${notas}` } : sin(`Dale Actualizar al respaldo${notas}`);
  else if (er.noLeido) out[1] = reprobado ? { letra: "B", motivo: `No se pudo leer la revisión de Denys${notas}` } : sin(`No se pudo leer la revisión de Denys${notas}`);
  else if (er.digitados < MIN_DIGITADOS) {
    const txt = `Solo ${n(er.digitados, "egreso digitado", "egresos digitados")} en SIMMOW (${er.total} con error): muy pocos para medir${notas}`;
    out[1] = reprobado ? { letra: "B", motivo: txt } : sin(txt);
  } else {
    const pct = Math.round((er.total / er.digitados) * 1000) / 10;
    const porErrores = menorEsMejor(pct, CRITERIOS.tasaErrores);
    out[1] = {
      letra: reprobado ? peor(porErrores, "B") : porErrores,
      motivo: `${pct}% de errores (${er.total} de ${er.digitados} egresos digitados en SIMMOW)${notas}`,
    };
  }

  // Coordinador de equipo: un punto arriba en Calidad sobre lo que le salga.
  if (opciones.esCoordinador && out[1]) {
    const base = out[1];
    out[1] = base.letra
      ? { letra: subir(base.letra), motivo: `${base.motivo} · Coordinador de equipo: ${base.letra === "D" ? "ya está en D, la más alta" : `un punto arriba (${base.letra} → ${subir(base.letra)})`}` }
      : { letra: null, motivo: `${base.motivo} · Coordinador de equipo: súbele un punto a la letra que elijas` };
  }

  // 2. Responsabilidad: llegadas tarde. Solo en JUL - DIC 2026 (regla puntual de la
  // jefatura, ver SGAS_PERIODO): sin diploma SGAS queda en A.
  const tarde = m.meses ? n(m.tardanzas, "llegada tarde", "llegadas tarde") : "Sin reporte del reloj";
  if (r.sgas?.aplica && !r.sgas.diploma) out[2] = { letra: "A", motivo: `Sin diploma SGAS · ${tarde}` };
  else if (!m.meses) out[2] = sin(tarde);
  else out[2] = { letra: menorEsMejor(m.tardanzas, CRITERIOS.llegadasTarde), motivo: `${tarde}${r.sgas?.aplica ? " · Diploma SGAS subido" : ""}` };

  // 3. Cumplimiento de metas: % que hizo del total de actividades del servicio.
  if (esAdministrativo) out[3] = sin("Administrativo: sin datos en Services");
  else if (!r.totalServicio) out[3] = sin("Dale Actualizar al respaldo");
  else {
    const pct = Math.round((r.totalPersona / r.totalServicio) * 1000) / 10;
    out[3] = {
      letra: mayorEsMejor(pct, CRITERIOS.porcentajeServicio),
      motivo: `${pct}% del servicio (${r.totalPersona.toLocaleString("es-SV")} de ${r.totalServicio.toLocaleString("es-SV")} actividades)`,
    };
  }

  // 4. Organización
  if (esAdministrativo) out[4] = sin("Administrativo: sin datos en Services");
  else if (!plan?.turnosProgramados) out[4] = sin("Sin turnos en el plan");
  else {
    const pct = Math.round((plan.turnosSinActividad / plan.turnosProgramados) * 100);
    out[4] = { letra: menorEsMejor(pct, CRITERIOS.turnosVaciosPct), motivo: `En ${plan.turnosSinActividad} de sus ${plan.turnosProgramados} turnos (${pct}%) no registró ni una sola actividad en Services` };
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
