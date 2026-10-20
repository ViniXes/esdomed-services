"use client";

// Estadísticas de inconsistencias de marcación (solo admin). Cada mes el admin
// sube el PDF "Reporte Descuentos" de RRHH; se lee en el navegador y queda un
// documento por mes en `inconsistencias_marcacion/{YYYY-MM}`. Al montar se lee
// la colección completa (un documento pequeño por mes cargado) y todo lo demás
// —filtros, gráficas, tabla— se calcula en memoria.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, FileUp, FingerprintPattern } from "lucide-react";
import { collection, getDocs, type Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { ReporteInconsistenciasMarcacion } from "@/types";
import { nombreMes } from "@/lib/inconsistenciasMarcacion/parser";
import { resumirAlcance, totalesPorMes } from "@/lib/inconsistenciasMarcacion/analisis";
import { CargarReporteModal, COLECCION_INCONSISTENCIAS } from "./_components/CargarReporteModal";
import { GraficoDiaSemana, GraficoMeses } from "./_components/Graficos";
import { Composicion, etiquetaPeriodo, Indicadores, MesesCargados } from "./_components/Resumen";
import { TablaPersonas } from "./_components/TablaPersonas";
import { exportarInconsistenciasExcel } from "./_components/exportarExcel";

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function mapReporte(id: string, data: Record<string, unknown>): ReporteInconsistenciasMarcacion {
  const cargadoEn = data.cargadoEn as Timestamp | null | undefined;
  return {
    ...(data as unknown as ReporteInconsistenciasMarcacion),
    id,
    cargadoEn: cargadoEn?.toDate ? cargadoEn.toDate() : new Date(),
  };
}

async function leerReportes(): Promise<ReporteInconsistenciasMarcacion[]> {
  const snap = await getDocs(collection(db, COLECCION_INCONSISTENCIAS));
  return snap.docs
    .map((d) => mapReporte(d.id, d.data()))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

export default function InconsistenciasMarcacionPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const esAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!authLoading && profile && !esAdmin) router.replace("/dashboard");
  }, [authLoading, profile, esAdmin, router]);

  const [reportes, setReportes] = useState<ReporteInconsistenciasMarcacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anio, setAnio] = useState<number | null>(null);
  // periodo "YYYY-MM" del mes elegido, o null = todo el año
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardadoMsg, setGuardadoMsg] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const aplicar = useCallback((lista: ReporteInconsistenciasMarcacion[], seleccionar?: string) => {
    setError(null);
    setReportes(lista);
    // Por defecto el mes más reciente; tras guardar, el recién cargado.
    const foco = lista.find((r) => r.periodo === seleccionar) ?? lista[lista.length - 1];
    if (foco) {
      setAnio(foco.anio);
      setPeriodo(foco.periodo);
    }
  }, []);

  const fallo = useCallback((e: unknown) => {
    setError(`No se pudieron cargar los reportes: ${e instanceof Error ? e.message : "error"}`);
    setReportes((prev) => prev ?? []);
  }, []);

  useEffect(() => {
    if (!esAdmin) return;
    let cancelado = false;
    leerReportes()
      .then((lista) => !cancelado && aplicar(lista))
      .catch((e) => !cancelado && fallo(e));
    return () => {
      cancelado = true;
    };
  }, [esAdmin, aplicar, fallo]);

  const porPeriodo = useMemo(() => new Map((reportes ?? []).map((r) => [r.periodo, r])), [reportes]);
  const anios = useMemo(() => [...new Set((reportes ?? []).map((r) => r.anio))].sort((a, b) => b - a), [reportes]);
  const delAnio = useMemo(() => (reportes ?? []).filter((r) => r.anio === anio), [reportes, anio]);
  const enAlcance = useMemo(
    () => (periodo ? delAnio.filter((r) => r.periodo === periodo) : delAnio),
    [delAnio, periodo],
  );
  const resumen = useMemo(() => resumirAlcance(enAlcance), [enAlcance]);
  const meses = useMemo(() => totalesPorMes(delAnio), [delAnio]);

  // Mes anterior CARGADO (para la comparación del total).
  const reporteActual = periodo ? porPeriodo.get(periodo) ?? null : null;
  const reporteAnterior = useMemo(() => {
    if (!periodo || !reportes) return null;
    const i = reportes.findIndex((r) => r.periodo === periodo);
    return i > 0 ? reportes[i - 1] : null;
  }, [periodo, reportes]);

  const titulo = reporteActual ? etiquetaPeriodo(reporteActual) : anio ? `Todo ${anio} (${delAnio.length} mes${delAnio.length === 1 ? "" : "es"})` : "";

  const exportar = async () => {
    setExportando(true);
    try {
      await exportarInconsistenciasExcel(
        resumen,
        titulo,
        `inconsistencias_marcacion_${periodo ?? anio}.xlsx`,
      );
    } catch (e) {
      setError(`No se pudo exportar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setExportando(false);
    }
  };

  if (authLoading || !profile || (esAdmin && reportes === null)) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!esAdmin) return null;

  const hayDatos = (reportes?.length ?? 0) > 0;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-6 text-white shadow-lg shadow-cyan-950/15 md:px-7">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/10" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">Administración</p>
            <h1 className="mt-1 text-2xl font-bold font-heading tracking-tight md:text-3xl">Inconsistencias de marcación</h1>
            <p className="mt-1.5 text-sm text-cyan-50/80">
              Descuentos del reloj marcador del personal de ESDOMED, mes a mes, según el reporte de RRHH.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hayDatos && (
              <button
                type="button"
                onClick={exportar}
                disabled={exportando || resumen.incidencias === 0}
                className="flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/20 disabled:opacity-50"
              >
                <Download size={15} />
                {exportando ? "Generando…" : "Exportar a Excel"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setGuardadoMsg(null);
                setModalAbierto(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-blue-900 shadow-sm transition-colors hover:bg-cyan-50"
            >
              <FileUp size={15} />
              Cargar reporte del mes
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {guardadoMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {guardadoMsg}
        </div>
      )}

      {!hayDatos ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 px-6 text-center">
          <FingerprintPattern size={30} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Aún no hay reportes cargados.</p>
          <p className="text-xs text-slate-500 mt-1">Sube el PDF &quot;Reporte Descuentos&quot; de cada mes para ver las estadísticas.</p>
        </div>
      ) : (
        <>
          {/* Filtros: un solo renglón que manda sobre todo lo de abajo */}
          <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            {anios.length > 1 && (
              <select
                value={anio ?? ""}
                onChange={(e) => {
                  setAnio(Number(e.target.value));
                  setPeriodo(null);
                }}
                aria-label="Año"
                className="px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              >
                {anios.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
            <div className="flex flex-wrap gap-1" role="group" aria-label="Mes">
              <Chip activo={periodo === null} onClick={() => setPeriodo(null)}>
                Todo {anio}
              </Chip>
              {delAnio.map((r) => (
                <Chip key={r.periodo} activo={periodo === r.periodo} onClick={() => setPeriodo(r.periodo)}>
                  {capitalizar(nombreMes(r.mes))}
                </Chip>
              ))}
            </div>
          </div>

          <Indicadores
            resumen={resumen}
            actual={reporteActual}
            anterior={reporteAnterior}
            meses={enAlcance.length}
          />

          <Composicion resumen={resumen} />

          <div className="grid gap-4 lg:grid-cols-2">
            <GraficoMeses
              datos={meses}
              seleccionado={periodo}
              onSeleccionar={(p) => setPeriodo((actual) => (actual === p ? null : p))}
            />
            <GraficoDiaSemana datos={resumen.porDiaSemana} />
          </div>

          <TablaPersonas personas={resumen.personas} mesesEnAlcance={enAlcance.length} />

          <MesesCargados reportes={delAnio} />
        </>
      )}

      {modalAbierto && (
        <CargarReporteModal
          existentes={porPeriodo}
          onCerrar={() => setModalAbierto(false)}
          onGuardado={(p) => {
            setModalAbierto(false);
            const [y, m] = p.split("-").map(Number);
            setGuardadoMsg(`Reporte de ${etiquetaPeriodo({ anio: y, mes: m })} guardado.`);
            leerReportes().then((lista) => aplicar(lista, p)).catch(fallo);
          }}
        />
      )}
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        activo
          ? "bg-blue-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900"
      }`}
    >
      {children}
    </button>
  );
}
