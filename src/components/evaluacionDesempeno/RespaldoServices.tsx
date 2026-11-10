"use client";

import { useState } from "react";
import { CalendarClock, Database, FileWarning, ListChecks, Plus, RefreshCw, TrendingUp, Undo2 } from "lucide-react";
import {
  METRICAS_PRODUCTIVIDAD,
  cargarArchivero,
  cargarRespaldo,
  type RefPersonaEquipo,
  type ResumenRespaldo,
} from "@/lib/evaluacionDesempenoRespaldo";
import { CRITERIOS_TEXTO } from "@/lib/evaluacionDesempenoSugerencias";
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
          {/* Productividad */}
          <Bloque icon={TrendingUp} titulo="Productividad del semestre" factor="Factores 1 y 3" atenuado={esAdministrativo} ancho>
            {respaldo.plan && respaldo.plan.turnosProgramados > 0 && respaldo.plan.promedioEquipoPorTurno > 0 && (
              <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Por cada turno hace <strong className="text-slate-900 dark:text-slate-100">{respaldo.plan.actividadesPorTurno}</strong> actividades; el
                  promedio del equipo es <strong className="text-slate-900 dark:text-slate-100">{respaldo.plan.promedioEquipoPorTurno}</strong>.
                </p>
                <div className="mt-1.5">
                  <Comparacion persona={respaldo.plan.actividadesPorTurno} equipo={respaldo.plan.promedioEquipoPorTurno} grande />
                </div>
              </div>
            )}
            <table className="w-full text-xs">
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
                    <td className="py-1 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">{respaldo.productividad[m.id]}</td>
                    <td className="py-1 text-right tabular-nums text-slate-500">{Math.round(respaldo.promedioEquipo[m.id])}</td>
                    <td className="py-1 pl-2 text-right">
                      <Comparacion persona={respaldo.productividad[m.id]} equipo={respaldo.promedioEquipo[m.id]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-400">
              &quot;Promedio equipo&quot; = lo que hizo en promedio cada compañero operativo en el semestre. Arriba o abajo cuenta a partir de 10% de
              diferencia. No incluye las hojas de Drive.
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
                    En <strong>{respaldo.plan.turnosSinActividad}</strong> de sus {respaldo.plan.turnosProgramados} turnos no registró nada en Services.
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
                    <strong>Sin diploma SGAS</strong> en la pestaña Diplomas de su ficha: el factor 2 (Responsabilidad) se sugiere en A.
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
                    <li key={e.id} className="flex items-start gap-2 text-xs">
                      <span
                        className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-px text-[10px] font-semibold ${
                          amonestacion
                            ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                            : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        }`}
                      >
                        {e.tipo}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 tabular-nums text-slate-500">
                          {e.fecha}
                          {typeof e.nota === "number" && <ChipNota nota={e.nota} />}
                        </p>
                        {e.notas && <p className="text-slate-700 dark:text-slate-200">{e.notas}</p>}
                      </div>
                      {botonIncidente(`arch-${e.id}`, { fecha: e.fecha, factor: amonestacion ? 5 : 1, tipo: amonestacion || (typeof e.nota === "number" && !aproboEvaluacion(e.nota)) ? "D" : "F", descripcion: `${e.tipo}${typeof e.nota === "number" ? ` (nota ${e.nota}, mínimo ${NOTA_MINIMA_EVALUACION})` : ""}${e.notas ? `: ${e.notas}` : ""}` })}
                    </li>
                  );
                })}
              </ul>
            )}
          </Bloque>

          {/* Altas revertidas */}
          <Bloque icon={Undo2} titulo="Altas efectivas revertidas" factor="Factor 1 · calidad" atenuado={esAdministrativo}>
            {respaldo.altasRevertidas.length === 0 ? (
              <p className="text-xs text-slate-500">Ninguna alta procesada por esta persona se revirtió en el periodo.</p>
            ) : (
              <ul className="space-y-1.5">
                {respaldo.altasRevertidas.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-700 dark:text-slate-200">
                        <span className="tabular-nums text-slate-500">{a.fecha}</span> · {a.paciente}
                      </p>
                      {a.nota && <p className="text-slate-500">{a.nota}</p>}
                    </div>
                    {botonIncidente(`rev-${i}`, { fecha: a.fecha, factor: 1, tipo: "D", descripcion: `Alta efectiva revertida: ${a.paciente}${a.nota ? ` (${a.nota})` : ""}` })}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-slate-400">Indicio para revisar: la reversión puede deberse a causas ajenas a quien procesó.</p>
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

/** Arriba / en el promedio / abajo, con 10% de margen. */
function Comparacion({ persona, equipo, grande }: { persona: number; equipo: number; grande?: boolean }) {
  if (!equipo) return <span className="text-[10px] text-slate-400">—</span>;
  const dif = Math.round((persona / equipo - 1) * 100);
  const [texto, cls] =
    Math.abs(dif) < 10
      ? ["En el promedio", "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"]
      : dif > 0
        ? [`Arriba ${dif}%`, "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"]
        : [`Abajo ${-dif}%`, "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"];
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border font-semibold ${grande ? "px-2.5 py-0.5 text-xs" : "px-1.5 py-px text-[10px]"} ${cls}`}>
      {texto}
    </span>
  );
}
