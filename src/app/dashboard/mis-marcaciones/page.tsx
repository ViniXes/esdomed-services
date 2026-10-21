"use client";

// "Mis marcaciones": cada empleado ve sus descuentos del reloj marcador en los
// meses que el admin revisó y PUBLICÓ (copias por persona en
// `inconsistencias_marcacion_personal`, ver lib/inconsistenciasMarcacion/personal).
// Cada día se cruza con su plan de trabajo para señalar los que podría
// reclamar; los días elegidos abren el trámite "E. Inconsistencias de
// marcación" ya armado en Trámites de Personal.
// Lecturas: 1 consulta de copias + 1 de trámites propios al entrar, y 1 plan
// por mes que se abre.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FingerprintPattern, Lightbulb, Send, Timer, Wallet } from "lucide-react";
import { collection, doc, getDoc, getDocs, query, where, type Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { DiaInconsistenciaMarcacion, EstadoTramitePersonal, InconsistenciasMarcacionPersonal, PlanTrabajo, TramitePersonal } from "@/types";
import { esPersonalPlan, filaDeUsuario } from "@/lib/esdomed/plan";
import { periodoDeFecha } from "@/lib/esdomed/permisos-plan";
import {
  desgloseMinutos,
  esTurnoCompleto,
  etiquetaIncidencia,
  etiquetaPeriodo,
  formatoDinero,
  formatoDuracion,
  tipoIncidencia,
} from "@/lib/inconsistenciasMarcacion/analisis";
import { COLECCION_INCONSISTENCIAS_PERSONAL, contextoPlanDia, type ContextoPlanDia } from "@/lib/inconsistenciasMarcacion/personal";
import { ESTADO_TRAMITE_LABEL, ESTADO_TRAMITE_PILL } from "@/lib/tramitesPersonal";
import { Marca, Tarjeta } from "@/components/marcacion/Piezas";

const aFecha = (v: unknown) => ((v as Timestamp | null | undefined)?.toDate ? (v as Timestamp).toDate() : new Date());

/** "2026-09-02" → "Miércoles 2 de septiembre". */
const fechaLarga = (iso: string) => {
  const s = new Date(`${iso}T12:00:00`).toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

interface Datos {
  meses: InconsistenciasMarcacionPersonal[];
  /** Fecha ya reclamada → estado de su trámite (un rechazado se puede volver a reclamar). */
  reclamados: Map<string, EstadoTramitePersonal>;
}

async function cargar(uid: string): Promise<Datos> {
  const [copias, tramites] = await Promise.all([
    getDocs(query(collection(db, COLECCION_INCONSISTENCIAS_PERSONAL), where("empleadoId", "==", uid))),
    getDocs(query(collection(db, "tramites_personal"), where("empleadoId", "==", uid))),
  ]);
  const meses = copias.docs
    .map((d) => {
      const data = d.data();
      return { ...(data as InconsistenciasMarcacionPersonal), id: d.id, publicadoEn: aFecha(data.publicadoEn) };
    })
    .sort((a, b) => b.periodo.localeCompare(a.periodo));
  const reclamados = new Map<string, EstadoTramitePersonal>();
  for (const t of tramites.docs.map((d) => d.data() as TramitePersonal)) {
    for (const dia of t.reclamoMarcacion?.dias ?? []) {
      const previo = reclamados.get(dia.fecha);
      if (!previo || previo === "rechazado") reclamados.set(dia.fecha, t.estado);
    }
  }
  return { meses, reclamados };
}

export default function MisMarcacionesPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const puedeVer = !!profile && esPersonalPlan(profile.role, profile.codigoMarcacion);

  useEffect(() => {
    if (!authLoading && profile && !puedeVer) router.replace("/dashboard");
  }, [authLoading, profile, puedeVer, router]);

  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [planes, setPlanes] = useState<Record<string, PlanTrabajo | null>>({});
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const uid = profile?.uid;
  useEffect(() => {
    if (!uid || !puedeVer) return;
    let cancelado = false;
    cargar(uid)
      .then((d) => {
        if (cancelado) return;
        setDatos(d);
        setPeriodo((p) => p ?? d.meses[0]?.periodo ?? null);
      })
      .catch((e) => {
        if (cancelado) return;
        setError(`No se pudieron cargar tus marcaciones: ${e instanceof Error ? e.message : "error"}`);
        setDatos({ meses: [], reclamados: new Map() });
      });
    return () => {
      cancelado = true;
    };
  }, [uid, puedeVer]);

  const actual = datos?.meses.find((m) => m.periodo === periodo) ?? null;

  // Plan(es) de los días del mes abierto (casi siempre uno: el del periodo).
  useEffect(() => {
    if (!actual) return;
    const faltan = [...new Set(actual.dias.map((d) => periodoDeFecha(d.fecha)))].filter((p) => !(p in planes));
    if (!faltan.length) return;
    let cancelado = false;
    Promise.all(
      faltan.map((p) =>
        getDoc(doc(db, "planes_trabajo", p))
          .then((s) => [p, s.exists() ? ({ id: s.id, ...s.data() } as PlanTrabajo) : null] as const)
          .catch(() => [p, null] as const),
      ),
    ).then((pares) => !cancelado && setPlanes((prev) => ({ ...prev, ...Object.fromEntries(pares) })));
    return () => {
      cancelado = true;
    };
  }, [actual, planes]);

  const dias = useMemo(() => {
    if (!actual || !profile) return [];
    return [...actual.dias]
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horario.localeCompare(b.horario))
      .map((d) => {
        const p = periodoDeFecha(d.fecha);
        const plan = planes[p];
        // undefined = el plan aún se está leyendo; null = no hay plan o no estás en él.
        const contexto: ContextoPlanDia | null | undefined = !(p in planes) ? undefined : plan ? contextoPlanDia(filaDeUsuario(plan, profile), d) : null;
        return { d, contexto };
      });
  }, [actual, planes, profile]);

  const totales = useMemo(() => {
    const t = { olvidadas: 0, montoTurno: 0, diasMinutos: 0, minutos: 0, montoMinutos: 0 };
    for (const d of actual?.dias ?? []) {
      if (esTurnoCompleto(tipoIncidencia(d))) {
        t.olvidadas++;
        t.montoTurno += d.monto;
      } else {
        t.diasMinutos++;
        t.minutos += d.minutos;
        t.montoMinutos += d.monto;
      }
    }
    return t;
  }, [actual]);

  const posibles = dias.filter((x) => x.contexto?.motivo && esSeleccionable(datos, x.d.fecha)).length;
  const montoSeleccion = dias.filter((x) => seleccion.has(x.d.fecha)).reduce((a, x) => a + x.d.monto, 0);
  const anios = new Set(datos?.meses.map((m) => m.anio));

  const alternar = (fecha: string) =>
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(fecha)) s.delete(fecha);
      else s.add(fecha);
      return s;
    });

  const presentar = () => {
    if (!actual || !seleccion.size) return;
    const params = new URLSearchParams({ reclamo: actual.periodo, dias: [...seleccion].sort().join(",") });
    router.push(`/dashboard/mis-tramites?${params}`);
  };

  if (authLoading || !profile || (puedeVer && datos === null)) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!puedeVer || !datos) return null;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-6 text-white shadow-lg shadow-cyan-950/15 md:px-7">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/10" />
        <div className="relative min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">Mi área</p>
          <h1 className="mt-1 text-2xl font-bold font-heading tracking-tight md:text-3xl">Mis marcaciones</h1>
          <p className="mt-1.5 text-sm text-cyan-50/80">
            Tus descuentos del reloj marcador, según el reporte mensual de RRHH.
            {profile.codigoMarcacion && <> Código {profile.codigoMarcacion}.</>}
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {datos.meses.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-14 px-6 text-center">
          <FingerprintPattern size={30} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No tienes descuentos publicados.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            {profile.codigoMarcacion
              ? "Aquí aparecen los meses en que el reporte de descuentos de RRHH trae marcaciones a tu nombre, cuando administración los publica. Si un mes no aparece, no tuviste descuentos o todavía no se ha publicado."
              : "Tu usuario no tiene código de marcación registrado, así que no se te pueden vincular los reportes. Pide a administración que lo agregue."}
          </p>
        </div>
      ) : (
        actual && (
          <>
            {datos.meses.length > 1 && (
              <div className="flex flex-wrap gap-1 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700" role="group" aria-label="Mes">
                {datos.meses.map((m) => {
                  const activo = m.periodo === periodo;
                  return (
                    <button
                      key={m.periodo}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => {
                        setPeriodo(m.periodo);
                        setSeleccion(new Set());
                      }}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        activo ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900"
                      }`}
                    >
                      {anios.size > 1 ? etiquetaPeriodo(m) : etiquetaPeriodo(m).split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <Tarjeta
                icon={Wallet}
                label={`Descontado · ${etiquetaPeriodo(actual)}`}
                valor={formatoDinero(actual.total)}
                pie={<span>{actual.dias.length} día{actual.dias.length === 1 ? "" : "s"} con incidencia</span>}
              />
              <Tarjeta
                icon={FingerprintPattern}
                label="Marcas faltantes"
                valor={String(totales.olvidadas)}
                pie={<span>Descuentan el turno completo · {formatoDinero(totales.montoTurno)}</span>}
              />
              <Tarjeta
                icon={Timer}
                label="Tardanza / salida temprana"
                valor={totales.diasMinutos ? formatoDuracion(totales.minutos) : "—"}
                pie={<span>{totales.diasMinutos} día{totales.diasMinutos === 1 ? "" : "s"} · {formatoDinero(totales.montoMinutos)}</span>}
              />
            </div>

            {posibles > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-sm text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-200">
                <Lightbulb size={15} className="mt-0.5 shrink-0" />
                <span>
                  {posibles === 1 ? "Un día no cuadra" : `${posibles} días no cuadran`} con tu plan de trabajo. Revisa si procede presentar la inconsistencia.
                </span>
              </div>
            )}

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">Días con descuento</h2>
                <p className="text-xs text-slate-500">
                  Si falta una marca, el reloj descuenta el turno completo; si están las dos, solo los minutos. Marca los días que quieras reclamar
                  y se arma el trámite &quot;E. Inconsistencias de marcación&quot;: solo te falta adjuntar el formulario.
                </p>
                {dias.length > 0 && dias.every((x) => x.contexto === null) && (
                  <p className="mt-1 text-xs text-slate-500">No hay plan de trabajo de este mes (o no estás en él) para comparar cada día.</p>
                )}
              </div>

              <ul className="space-y-2.5">
                {dias.map(({ d, contexto }) => (
                  <FilaDia
                    key={`${d.fecha}-${d.horario}`}
                    d={d}
                    contexto={contexto}
                    estado={datos.reclamados.get(d.fecha)}
                    marcado={seleccion.has(d.fecha)}
                    onAlternar={() => alternar(d.fecha)}
                  />
                ))}
              </ul>
            </section>

            {seleccion.size > 0 && (
              <div className="sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-2 rounded-2xl border border-blue-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-blue-900 dark:bg-slate-900/95 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">
                    {seleccion.size} día{seleccion.size === 1 ? "" : "s"}
                  </span>{" "}
                  · {formatoDinero(montoSeleccion)} descontado{seleccion.size === 1 ? "" : "s"}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSeleccion(new Set())}
                    className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Quitar selección
                  </button>
                  <button
                    type="button"
                    onClick={presentar}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 sm:flex-none"
                  >
                    <Send size={14} />
                    Presentar inconsistencia
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500">
              Montos tal como vienen en el reporte de RRHH
              {actual.fechaImpresion && <> impreso el {actual.fechaImpresion}</>}
              {" · "}publicado el {actual.publicadoEn.toLocaleDateString("es-SV")}.
            </p>
          </>
        )
      )}
    </div>
  );
}

function esSeleccionable(datos: Datos | null, fecha: string) {
  const estado = datos?.reclamados.get(fecha);
  return !estado || estado === "rechazado";
}

function FilaDia({
  d,
  contexto,
  estado,
  marcado,
  onAlternar,
}: {
  d: DiaInconsistenciaMarcacion;
  contexto: ContextoPlanDia | null | undefined;
  estado: EstadoTramitePersonal | undefined;
  marcado: boolean;
  onAlternar: () => void;
}) {
  const seleccionable = !estado || estado === "rechazado";
  const { tarde, temprano } = desgloseMinutos(d);
  const Contenedor = seleccionable ? "label" : "div";

  return (
    <li>
      <Contenedor
        className={`flex gap-3 rounded-2xl border p-3.5 transition-colors ${seleccionable ? "cursor-pointer" : ""} ${
          marcado
            ? "border-blue-400 bg-blue-50/60 dark:border-blue-700 dark:bg-blue-950/30"
            : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" + (seleccionable ? " hover:border-slate-300 dark:hover:border-slate-700" : "")
        }`}
      >
        {seleccionable ? (
          <input type="checkbox" checked={marcado} onChange={onAlternar} className="mt-1 h-4 w-4 shrink-0 accent-blue-600" />
        ) : (
          <span className="mt-1 h-4 w-4 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-semibold text-slate-900 dark:text-slate-100">{fechaLarga(d.fecha)}</p>
            <p className="shrink-0 font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatoDinero(d.monto)}</p>
          </div>
          <p className="text-xs text-slate-500">
            {etiquetaIncidencia(d)} · turno {d.horario} · {formatoDuracion(d.minutos)}
          </p>

          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <dt className="text-slate-500">Entrada</dt>
              <dd>
                <Marca hora={d.entrada} desvio={tarde ? `+${tarde} min` : null} />
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-slate-500">Salida</dt>
              <dd>
                <Marca hora={d.salida} desvio={temprano ? `−${temprano} min` : null} />
              </dd>
            </div>
            {contexto && (
              <div className="flex items-center gap-1.5">
                <dt className="text-slate-500">Tu plan</dt>
                <dd className="text-slate-700 dark:text-slate-300">{contexto.plan}</dd>
              </div>
            )}
          </dl>

          {contexto?.motivo && seleccionable && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-cyan-50 px-2.5 py-1.5 text-xs text-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-200">
              <Lightbulb size={13} className="mt-px shrink-0" />
              <span>
                <span className="font-semibold">Podrías reclamarlo:</span> {contexto.motivo}.
              </span>
            </p>
          )}
          {estado && (
            <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${ESTADO_TRAMITE_PILL[estado]}`}>
              {estado === "rechazado" ? "Reclamo rechazado · puedes volver a presentarlo" : `Reclamado · ${ESTADO_TRAMITE_LABEL[estado]}`}
            </span>
          )}
        </div>
      </Contenedor>
    </li>
  );
}
