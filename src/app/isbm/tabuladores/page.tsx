"use client";

import { IsbmStats, IsbmTableHeading, IsbmEmptyState, IsbmFilter, isbmStyles as ui } from "../_components/IsbmUi";

import { IsbmPageHeading } from "../_components/IsbmPageHeading";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { Table2, Download, TriangleAlert, Users, CircleDollarSign, ArrowUpRight } from "lucide-react";
import { consultarTabulador } from "@/lib/isbm/api";
import {
  CONDICION_EGRESO_LABEL,
  formatoDolares,
  type TabuladorRow,
} from "@/lib/isbm/types";

type Tab = "activos" | "vivos" | "fallecidos";

const TABS: { id: Tab; label: string }[] = [
  { id: "activos", label: "Activos" },
  { id: "vivos", label: "Egresos vivos" },
  { id: "fallecidos", label: "Fallecidos" },
];

const CONDICIONES_VIVO = new Set(["MEJORADO", "TRASLADO", "ALTA_VOLUNTARIA"]);
const MESES = ["Todo el año", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const inputCls =
  "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function TabuladoresPage() {
  const hoy = new Date();
  const [tab, setTab] = useState<Tab>("activos");
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [filas, setFilas] = useState<TabuladorRow[] | null>(null);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setError("");
    try {
      setFilas(await consultarTabulador());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Diferido: regla react-hooks/set-state-in-effect.
  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  // Activos = sin egreso (el período no aplica). Egresados = filtrados por
  // la fecha de egreso dentro del mes/año elegido.
  const visibles = useMemo(() => {
    if (!filas) return [];
    if (tab === "activos") return filas.filter((f) => f.condicion_egreso === "PENDIENTE");
    const desde = mes ? `${anio}-${String(mes).padStart(2, "0")}-01` : `${anio}-01-01`;
    const hasta = mes ? new Date(anio, mes, 0).toISOString().slice(0, 10) : `${anio}-12-31`;
    return filas.filter((f) => {
      if (!f.fecha_egreso) return false;
      if (f.fecha_egreso < desde || f.fecha_egreso > hasta) return false;
      return tab === "fallecidos"
        ? f.condicion_egreso === "FALLECIDO"
        : CONDICIONES_VIVO.has(f.condicion_egreso);
    });
  }, [filas, tab, anio, mes]);

  const totales = useMemo(
    () => ({
      servicio: visibles.reduce((s, f) => s + f.total_servicio, 0),
      cobrable: visibles.reduce((s, f) => s + f.total_cobrable, 0),
      diasAbiertos: visibles.reduce((s, f) => s + (f.dias_censados - f.dias_cerrados), 0),
    }),
    [visibles]
  );

  const exportarExcel = () => {
    const hoja = XLSX.utils.json_to_sheet(
      visibles.map((f) => ({
        Expediente: f.expediente,
        Paciente: f.paciente_nombre,
        "N° Afiliación ISBM": f.numero_afiliacion_isbm ?? "",
        "Fecha ingreso": f.fecha_ingreso,
        "Fecha egreso": f.fecha_egreso ?? "",
        Condición: CONDICION_EGRESO_LABEL[f.condicion_egreso],
        "Días estancia": f.dias_estancia,
        "Días censados": f.dias_censados,
        "Días cerrados": f.dias_cerrados,
        "Total servicio ($)": f.total_servicio,
        "Total cobrable ($)": f.total_cobrable,
        "Pérdida ($)": Math.round((f.total_servicio - f.total_cobrable) * 100) / 100,
      }))
    );
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, TABS.find((t) => t.id === tab)?.label ?? "Tabulador");
    const periodo = tab === "activos" ? "actual" : mes ? `${anio}-${String(mes).padStart(2, "0")}` : String(anio);
    XLSX.writeFile(libro, `isbm_tabulador_${tab}_${periodo}.xlsx`);
  };

  return (
    <div className={`${ui.page} p-4 md:p-6 max-w-6xl mx-auto space-y-6`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <IsbmPageHeading title="Tabuladores" description="Consolida los cargos por paciente y exporta el período." icon={Table2} />
        <button
          onClick={exportarExcel}
          disabled={visibles.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
        >
          <Download size={15} /> Exportar Excel
        </button>
      </div>

      <IsbmStats items={[
        { label: "Pacientes", value: filas ? visibles.length : "—", detail: TABS.find(t => t.id === tab)?.label ?? "Vista actual", icon: Users },
        { label: "Total servicio", value: filas ? formatoDolares(totales.servicio) : "—", detail: "Servicios acumulados de esta vista", icon: CircleDollarSign },
        { label: "Total cobrable", value: filas ? formatoDolares(totales.cobrable) : "—", detail: "Monto cobrable de esta vista", icon: CircleDollarSign, tone: "success" },
      ]} />
      {/* Segmented control + período */}
      <div className={ui.toolbar}>
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                tab === t.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== "activos" && (
          <>
            <IsbmFilter label="Año"><select aria-label="Año" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className={inputCls}>
              {[hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select></IsbmFilter>
            <IsbmFilter label="Mes"><select aria-label="Mes" value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inputCls}>
              {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select></IsbmFilter>
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
      )}

      {totales.diasAbiertos > 0 && <div className={ui.notice}><TriangleAlert size={16} /><p><strong>{totales.diasAbiertos} días de censo por cerrar.</strong> Los montos aún no son definitivos.</p></div>}

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <IsbmTableHeading title="Consolidado por paciente" count={filas ? visibles.length : undefined}>Abre un paciente para ver su resumen</IsbmTableHeading>
        {!filas ? (
          <div className="p-10 flex justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visibles.length === 0 ? (
          <IsbmEmptyState icon={Users} title="No hay pacientes en esta vista">Selecciona otra condición de egreso o período.</IsbmEmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-2.5 font-medium">Paciente</th>
                  <th className="px-4 py-2.5 font-medium">N° afiliación</th>
                  <th className="px-4 py-2.5 font-medium">Ingreso</th>
                  <th className="px-4 py-2.5 font-medium">Egreso</th>
                  <th className="px-4 py-2.5 font-medium text-right">Estancia</th>
                  <th className="px-4 py-2.5 font-medium text-right">Censo</th>
                  <th className="px-4 py-2.5 font-medium text-right">Servicio</th>
                  <th className="px-4 py-2.5 font-medium text-right">Cobrable</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-slate-50 dark:border-slate-800/60 last:border-0 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <Link href={`/isbm/ingresos/${f.id}/resumen`} className="inline-flex items-center gap-1.5 font-semibold text-blue-800 hover:underline dark:text-blue-300">{f.paciente_nombre}<ArrowUpRight size={13} aria-hidden="true" /></Link>
                      <p className="text-[10px] font-mono text-slate-400">{f.expediente}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                      {f.numero_afiliacion_isbm ?? <span className="italic text-xs text-slate-400">pendiente</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-slate-600 dark:text-slate-400">{f.fecha_ingreso}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                      {f.fecha_egreso ?? "—"}
                      {f.fecha_egreso && (
                        <p className="text-[10px] text-slate-400">{CONDICION_EGRESO_LABEL[f.condicion_egreso]}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {f.dias_estancia} d
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {f.dias_cerrados}/{f.dias_censados}
                      {f.dias_censados > f.dias_cerrados && (
                        <span className="text-amber-500" title="Días sin cerrar"> •</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {formatoDolares(f.total_servicio)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {formatoDolares(f.total_cobrable)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
