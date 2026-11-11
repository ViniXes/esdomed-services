"use client";

import { useState } from "react";
import { CalendarClock, Database, FileWarning, ListChecks, Plus, RefreshCw, SearchCheck, TrendingUp } from "lucide-react";
import {
  METRICAS_PRODUCTIVIDAD,
  cargarArchivero,
  cargarRespaldo,
  type RefPersonaEquipo,
  type ResumenRespaldo,
} from "@/lib/evaluacionDesempenoRespaldo";
import { CRITERIOS_TEXTO, MIN_DIGITADOS } from "@/lib/evaluacionDesempenoSugerencias";
import { NOTA_MINIMA_EVALUACION, aproboEvaluacion } from "@/lib/evaluacionesPersonal";
import { ChipNota } from "@/components/personal/EvaluacionesPersonal";
import type { IncidenteCritico } from "@/lib/evaluacionDesempeno";

interface Props {
  empleadoId: string;
  nombre: string;
  codigoMarcacion?: string;
  periodo: string;
  esAdministrativo: boolean;
  equipo: RefPersonaEquipo[];
  respaldo: ResumenRespaldo | null;
  onRespaldo: (r: ResumenRespaldo) => void;
  onAgregarIncidente: (i: IncidenteCritico) => void;
}

/**
 * Trazabilidad de ESDOMED Services para respaldar la evaluación: productividad
 * del semestre contra el promedio del equipo operativo, archivero de
 * amonestaciones, reporte del reloj y altas revertidas. Cada hallazgo puede
 * pasarse al Registro de Incidentes Críticos (página 3) con un clic.
 */
export function RespaldoServices({ empleadoId, nombre, codigoMarcacion, periodo, esAdministrativo, equipo, respaldo, onRespaldo, onAgregarIncidente }: Props) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [verCriterios, setVerCriterios] = useState(false);
  const archivero = respaldo?.archivero ?? null;
  const [agregados, setAgregados] = useState<Set<string>>(new Set());

  const cargar = async () => {
    setCargando(true);
    setError("");
    try {
      const [r, a] = await Promise.all([
        cargarRespaldo({ empleadoId, uid: empleadoId, nombre, codigoMarcacion, periodo, equipo }),
        cargarArchivero(empleadoId, periodo),
      ]);
      onRespaldo({ ...r, archivero: a.entradas, sgas: a.sgas });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el respaldo.");
    } finally {
      setCargando(false);
    }
  };

  const agregar = (clave: string, inc: IncidenteCritico) => {
    onAgregarIncidente(inc);
    setAgregados((s) => new Set(s).add(clave));
  };

  const botonIncidente = (clave: string, inc: IncidenteCritico) => (
    <BotonAgregar hecho={agregados.has(clave)} onClick={() => agregar(clave, inc)} />
  );

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <section className="rounded-2xl border border-cyan-200 bg-cyan-50/40 p-4 md:p-5 dark:border-cyan-900 dark:bg-cyan-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
            <Database size={15} /> Respaldo desde ESDOMED Services
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Trazabilidad del periodo {periodo} para sustentar la evaluación. Con esto se sugiere una letra por factor; la decisión siempre es del evaluador.
          </p>
          <button
            type="button"
            onClick={() => setVerCriterios((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300"
          >
            <ListChecks size={13} /> {verCriterios ? "Ocultar criterios" : "Ver criterios de sugerencia"}
          </button>
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
        >
          <RefreshCw size={14} className={cargando ? "animate-spin" : ""} />
          {cargando ? "Cargando…" : respaldo ? "Actualizar" : "Cargar respaldo"}
        </button>
      </div>

      {verCriterios && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 font-semibold">Factor</th>
                <th className="px-3 py-2 font-semibold">Dato de Services</th>
                <th className="px-3 py-2 font-semibold">Sugerencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {CRITERIOS_TEXTO.map((c) => (
                <tr key={c.factor}>
                  <td className="px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-200">{c.factor}</td>
                  <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{c.dato}</td>
                  <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{c.regla}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400 dark:border-slate-800">
            Solo cuentan los días ya transcurridos del periodo. La productividad se compara por turno trabajado según el plan, así vacaciones, permisos e incapacidades no castigan.
          </p>
        </div>
      )}

      {esAdministrativo && (
        <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Personal administrativo: su trabajo (sistema, calidad, coordinación) no se registra como productividad en Services, así que esas cifras no
          sirven para evaluarlo. Sí aplican el archivero y las marcaciones.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {respaldo && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {/* Errores de digitación (revisión de Denys) */}
          <Bloque icon={SearchCheck} titulo="Errores en la digitación SIMMOW (revisión de Denys)" factor="Factor 1 · calidad" atenuado={esAdministrativo} ancho>
            <ErroresRevision errores={respaldo.errores} nombre={primerNombre(nombre)} />
          </Bloque>

          {/* Productividad */}
          <Bloque icon={TrendingUp} titulo="Productividad del semestre" factor="Factor 3 · metas" atenuado={esAdministrativo} ancho>
            <ParteDelServicio total={respaldo.totalPersona} servicio={respaldo.totalServicio ?? 0} nombre={primerNombre(nombre)} />
            {respaldo.driveIncompleto && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                No se pudo leer alguna hoja de Drive: el conteo puede quedar corto. Dale Actualizar en un momento.
              </p>
            )}
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="pb-1 font-semibold">Actividad (total del semestre)</th>
                  <th className="pb-1 text-right font-semibold">{primerNombre(nombre)}</th>
                  <th className="pb-1 text-right font-semibold">Promedio equipo</th>
                  <th className="pb-1 text-right font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {METRICAS_PRODUCTIVIDAD.map((m) => (
                  <tr key={m.id}>
                    <td className="py-1 text-slate-600 dark:text-slate-300">{m.label}</td>
                    <td className="py-1 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">{respaldo.productividad[m.id] ?? 0}</td>
                    <td className="py-1 text-right tabular-nums text-slate-500">{Math.round(respaldo.promedioEquipo[m.id] ?? 0)}</td>
                    <td className="py-1 pl-2 text-right">
                      <Comparacion persona={respaldo.productividad[m.id] ?? 0} equipo={respaldo.promedioEquipo[m.id] ?? 0} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-1.5 font-semibold text-slate-700 dark:text-slate-200">Total</td>
                  <td className="pt-1.5 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100">{respaldo.totalPersona}</td>
                  <td className="pt-1.5 text-right tabular-nums text-slate-500">{respaldo.promedioTotalEquipo}</td>
                  <td className="pt-1.5 pl-2 text-right">
                    <Comparacion persona={respaldo.totalPersona} equipo={respaldo.promedioTotalEquipo} />
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-400">
              &quot;Promedio equipo&quot; = lo que hizo en promedio cada compañero operativo en el semestre. Arriba o abajo cuenta a partir de 10% de
              diferencia. Incluye las hojas de Drive (carpetas, actualizaciones, consentimientos, emergencias SIMMOW).
            </p>
          </Bloque>

          {/* Asistencia mes por mes */}
          <Bloque icon={CalendarClock} titulo="Asistencia mes por mes" factor="Factores 2, 4 y 5" ancho>
            {!respaldo.plan?.porMes ? (
              <p className="text-xs text-slate-500">Vuelve a cargar el respaldo para ver la asistencia por mes.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                        <th className="pb-1 text-left font-semibold">Mes</th>
                        <th className="pb-1 text-right font-semibold">Turnos</th>
                        <th className="pb-1 text-right font-semibold">Llegadas tarde</th>
                        <th className="pb-1 text-right font-semibold">Salió antes</th>
                        <th className="pb-1 text-right font-semibold">Olvidó marcar</th>
                        <th className="pb-1 text-right font-semibold">No vino (sin marca)</th>
                        <th className="pb-1 text-right font-semibold">Incapacidad</th>
                        <th className="pb-1 text-right font-semibold">Permisos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {respaldo.plan.porMes.map((m) => (
                        <tr key={m.periodo}>
                          <td className="py-1 font-medium capitalize text-slate-700 dark:text-slate-200">{nombreMes(m.periodo)}</td>
                          <td className="py-1 text-right tabular-nums text-slate-700 dark:text-slate-200">
                            {m.enPlan ? m.turnos : <span className="text-slate-400">sin plan</span>}
                          </td>
                          {m.marcacionPublicada ? (
                            <>
                              <Celda n={m.tarde} alerta />
                              <Celda n={m.salioAntes ?? 0} alerta />
                              <Celda n={m.olvidoMarca} alerta />
                              <Celda n={m.sinMarca} alerta />
                            </>
                          ) : (
                            <td colSpan={4} className="py-1 text-center text-[11px] text-slate-400">
                              sin reporte del reloj
                            </td>
                          )}
                          <Celda n={m.incapacidades} />
                          <Celda n={m.permisos} />
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="pt-1.5 text-slate-700 dark:text-slate-200">Total</td>
                        <td className="pt-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{respaldo.plan.turnosProgramados}</td>
                        <Celda n={respaldo.marcaciones.tardanzas} alerta />
                        <Celda n={respaldo.marcaciones.salidasAntes ?? 0} alerta />
                        <Celda n={respaldo.marcaciones.omisiones} alerta />
                        <Celda n={respaldo.marcaciones.ausencias} alerta />
                        <Celda n={respaldo.plan.porMes.reduce((t, m) => t + m.incapacidades, 0)} />
                        <Celda n={respaldo.plan.porMes.reduce((t, m) => t + m.permisos, 0)} />
                      </tr>
                    </tbody>
                  </table>
                </div>
                {!esAdministrativo && respaldo.plan.turnosProgramados > 0 && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    <strong>Turnos vacíos (factor 4):</strong> en <strong>{respaldo.plan.turnosSinActividad}</strong> de sus {respaldo.plan.turnosProgramados} turnos
                    {" "}(<strong>{Math.round((respaldo.plan.turnosSinActividad / respaldo.plan.turnosProgramados) * 100)}%</strong>) no registró ni una sola
                    actividad en Services durante todo el turno. Mientras más bajo, mejor.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-400">
                    Turnos, incapacidad y permisos salen del plan de trabajo (solo días ya pasados). Llegadas tarde, salidas antes, olvidos y días sin marca salen
                    del reloj: el reporte mensual de RRHH cargado en Administración → Inconsistencias de marcación.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {respaldo.marcaciones.tardanzas > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        Llegadas tarde (factor 2):
                        {botonIncidente("tardanzas", {
                          fecha: hoy,
                          factor: 2,
                          tipo: "D",
                          descripcion: `Llegadas tarde ${periodo}: ${respaldo.marcaciones.tardanzas}.`,
                        })}
                      </span>
                    )}
                    {respaldo.marcaciones.omisiones + respaldo.marcaciones.ausencias + (respaldo.marcaciones.salidasAntes ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        Disciplina (factor 5):
                        {botonIncidente("disciplina", {
                          fecha: hoy,
                          factor: 5,
                          tipo: "D",
                          descripcion: `Disciplina ${periodo}: ${respaldo.marcaciones.omisiones} olvidos de marca, ${respaldo.marcaciones.ausencias} días sin marca y ${respaldo.marcaciones.salidasAntes ?? 0} salidas antes de hora.`,
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </Bloque>

          {/* Archivero */}
          <Bloque icon={FileWarning} titulo="Archivero: evaluaciones y amonestaciones" factor="Factores 2, 5 y 7">
            {respaldo.sgas?.aplica && (
              <div
                className={`mb-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                  respaldo.sgas.diploma
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                }`}
              >
                {respaldo.sgas.diploma ? (
                  <>
                    <strong>Diploma SGAS subido</strong> ({respaldo.sgas.diploma.fecha}).
                  </>
                ) : (
                  <>
                    <strong>Sin diploma SGAS</strong> en la pestaña Diplomas de su ficha: en este periodo el factor 2 (Responsabilidad) se sugiere en A.
                  </>
                )}
              </div>
            )}
            {!archivero || archivero.length === 0 ? (
              <p className="text-xs text-slate-500">Sin registros en el archivero de esta persona dentro del periodo.</p>
            ) : (
              <ul className="space-y-1.5">
                {archivero.map((e) => {
                  const amonestacion = /amonest/i.test(e.tipo);
                  return (
                    <li key={e.id} className="text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full border px-1.5 py-px text-[10px] font-semibold ${
                            amonestacion
                              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                              : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          }`}
                        >
                          {e.tipo}
                        </span>
                        <span className="tabular-nums text-slate-500">{e.fecha}</span>
                        {typeof e.nota === "number" && <ChipNota nota={e.nota} />}
                        {e.notaPorRevisar && <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">nota por revisar</span>}
                        <span className="ml-auto">
                          {botonIncidente(`arch-${e.id}`, {
                            fecha: e.fecha,
                            factor: amonestacion ? 5 : 1,
                            tipo: amonestacion || (typeof e.nota === "number" && !aproboEvaluacion(e.nota)) ? "D" : "F",
                            descripcion:
                              typeof e.nota === "number"
                                ? `${e.tipo}: nota ${e.nota} (${aproboEvaluacion(e.nota) ? "aprobada" : `reprobada, mínimo ${NOTA_MINIMA_EVALUACION}`})`
                                : `${e.tipo}${e.notas ? `: ${e.notas}` : ""}`,
                          })}
                        </span>
                      </div>
                      {/* Con nota basta la etiqueta; la descripción solo se muestra si no hay nota (p. ej. amonestaciones). */}
                      {typeof e.nota !== "number" && e.notas && <p className="mt-0.5 text-slate-700 dark:text-slate-200">{e.notas}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Bloque>

        </div>
      )}
    </section>
  );
}

function Bloque({
  icon: Icon,
  titulo,
  factor,
  atenuado,
  ancho,
  children,
}: {
  icon: typeof Database;
  titulo: string;
  factor: string;
  atenuado?: boolean;
  ancho?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 ${atenuado ? "opacity-60" : ""} ${ancho ? "lg:col-span-2" : ""}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
          <Icon size={14} className="text-blue-600 dark:text-blue-400" /> {titulo}
        </p>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{factor}</span>
      </div>
      {children}
    </div>
  );
}

function BotonAgregar({ hecho, onClick }: { hecho: boolean; onClick: () => void }) {
  return hecho ? (
    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Agregado</span>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/50"
    >
      <Plus size={12} /> Incidente
    </button>
  );
}

const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (periodo: string) => MESES_LARGOS[Number(periodo.slice(5, 7)) - 1] ?? periodo;
const primerNombre = (n: string) => n.trim().split(/\s+/)[0] || "Persona";

function Celda({ n, alerta }: { n: number; alerta?: boolean }) {
  return (
    <td
      className={`py-1 text-right tabular-nums ${
        n === 0 ? "text-slate-400" : alerta ? "font-semibold text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"
      }`}
    >
      {n}
    </td>
  );
}

const ESCALA_SERVICIO: { letra: string; texto: string; desde: number }[] = [
  { letra: "D", texto: "8% o más", desde: 8 },
  { letra: "C", texto: "4–7.9%", desde: 4 },
  { letra: "B", texto: "2–3.9%", desde: 2 },
  { letra: "A", texto: "menos de 2%", desde: -Infinity },
];

/**
 * Factor 1 en simple: de todas las actividades del servicio en el semestre,
 * qué porcentaje hizo la persona, y la escala con su letra resaltada.
 */
function ParteDelServicio({ total, servicio, nombre }: { total: number; servicio: number; nombre: string }) {
  if (!servicio) return <p className="text-xs text-slate-500">Dale Actualizar para ver su parte del total del servicio.</p>;
  const pct = Math.round((total / servicio) * 1000) / 10;
  const actual = ESCALA_SERVICIO.find((e) => pct >= e.desde)?.letra;
  const fmt = (x: number) => x.toLocaleString("es-SV");
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
      <p className="text-sm">
        {nombre} hizo <strong className="tabular-nums">{fmt(total)}</strong> de <strong className="tabular-nums">{fmt(servicio)}</strong> actividades del
        servicio en el semestre = <strong className="tabular-nums">{pct}%</strong>
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {ESCALA_SERVICIO.map((e) => (
          <li
            key={e.letra}
            className={`rounded-full border px-2 py-0.5 ${
              e.letra === actual
                ? "border-blue-500 bg-blue-50 font-semibold text-blue-800 dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-200"
                : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
            }`}
          >
            {e.letra}: {e.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}

const ESCALA_ERRORES: { letra: string; texto: string; hasta: number }[] = [
  { letra: "D", texto: "hasta 10%", hasta: 10 },
  { letra: "C", texto: "10–15%", hasta: 15 },
  { letra: "B", texto: "15–20%", hasta: 20 },
  { letra: "A", texto: "más de 20%", hasta: Infinity },
];

/**
 * Factor 1 en simple: de los egresos que digitó en SIMMOW, a cuántos les
 * encontró error la revisión de Denys, el % y la escala con su letra resaltada.
 */
function ErroresRevision({ errores, nombre }: { errores: ResumenRespaldo["errores"]; nombre: string }) {
  if (!errores) return <p className="text-xs text-slate-500">Dale Actualizar para ver los errores de la revisión de Denys.</p>;
  if (errores.noLeido) return <p className="text-xs text-amber-700 dark:text-amber-300">No se pudo leer la hoja de revisión de Denys. Dale Actualizar en un momento.</p>;
  const pocos = errores.digitados < MIN_DIGITADOS;
  const pct = errores.digitados ? Math.round((errores.total / errores.digitados) * 1000) / 10 : 0;
  const actual = pocos ? null : ESCALA_ERRORES.find((e) => pct <= e.hasta)?.letra;
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
      <p className="text-sm">
        {nombre} digitó <strong className="tabular-nums">{errores.digitados.toLocaleString("es-SV")}</strong> egresos en SIMMOW y la revisión le encontró
        error en <strong className="tabular-nums">{errores.total}</strong>
        {errores.digitados ? (
          <>
            {" "}
            = <strong className="tabular-nums">{pct}%</strong>
          </>
        ) : null}
      </p>
      {pocos ? (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          Con menos de {MIN_DIGITADOS} egresos digitados el porcentaje no es confiable: queda a criterio del jefe.
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {ESCALA_ERRORES.map((e) => (
            <li
              key={e.letra}
              className={`rounded-full border px-2 py-0.5 ${
                e.letra === actual
                  ? "border-blue-500 bg-blue-50 font-semibold text-blue-800 dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-200"
                  : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
              }`}
            >
              {e.letra}: {e.texto}
            </li>
          ))}
        </ul>
      )}
      {errores.porCategoria.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          <strong>En qué:</strong> {errores.porCategoria.map((c) => `${c.categoria} (${c.total})`).join(" · ")}
        </p>
      )}
    </div>
  );
}

/** Arriba / en el promedio / abajo, con 10% de margen. */
function Comparacion({ persona, equipo }: { persona: number; equipo: number }) {
  if (!equipo) return <span className="text-[10px] text-slate-400">—</span>;
  const dif = Math.round((persona / equipo - 1) * 100);
  const [texto, cls] =
    Math.abs(dif) < 10
      ? ["En el promedio", "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"]
      : dif > 0
        ? [`Arriba ${dif}%`, "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"]
        : [`Abajo ${-dif}%`, "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"];
  return <span className={`inline-block whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-semibold ${cls}`}>{texto}</span>;
}
