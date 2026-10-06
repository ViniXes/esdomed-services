"use client";

import { IsbmStats, IsbmTableHeading, IsbmEmptyState, IsbmFilter, isbmStyles as ui } from "../_components/IsbmUi";

import { IsbmPageHeading } from "../_components/IsbmPageHeading";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Receipt, Hourglass, Search, CircleDollarSign } from "lucide-react";
import { listarCargos } from "@/lib/isbm/api";
import {
  MOTIVO_NO_FACTURABLE_LABEL,
  RUBRO_LABEL,
  formatoDolares,
  type CargoListado,
  type RubroArancelIsbm,
} from "@/lib/isbm/types";

const inputCls =
  "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

const MESES = ["Todo el año", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function CargosPage() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [rubro, setRubro] = useState("");
  const [verAnulados, setVerAnulados] = useState(false);
  const [soloObservados, setSoloObservados] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [cargos, setCargos] = useState<CargoListado[] | null>(null);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargos(null);
    setError("");
    try {
      setCargos(await listarCargos({ anio, mes, rubro: rubro || undefined, anulado: verAnulados ? undefined : false }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [anio, mes, rubro, verAnulados]);

  // Diferido: regla react-hooks/set-state-in-effect.
  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  const filtrados = useMemo(() => {
    if (!cargos) return [];
    const t = busqueda.trim().toLowerCase();
    return cargos.filter((c) => {
      if (soloObservados && (!c.pendiente_revision || c.anulado)) return false;
      if (!t) return true;
      return (
        c.expediente.toLowerCase().includes(t) ||
        (c.afiliacion?.paciente_nombre ?? "").toLowerCase().includes(t) ||
        c.arancel.descripcion.toLowerCase().includes(t)
      );
    });
  }, [cargos, busqueda, soloObservados]);

  const vivos = filtrados.filter((c) => !c.anulado);
  const totalServicio = vivos.reduce((s, c) => s + c.costo_total, 0);
  const totalFacturable = vivos.reduce((s, c) => s + c.monto_facturable, 0);

  const anios = [hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2];

  return (
    <div className={`${ui.page} p-4 md:p-6 max-w-6xl mx-auto space-y-6`}>
      <IsbmPageHeading title="Cargos" description="Consulta los servicios registrados y sus montos facturables." icon={Receipt} />

      <IsbmStats items={[
        { label: "Cargos registrados", value: cargos ? filtrados.length : "—", detail: "Resultados de los filtros actuales", icon: Receipt },
        { label: "Total servicio", value: cargos ? formatoDolares(totalServicio) : "—", detail: "Sin incluir cargos anulados", icon: CircleDollarSign },
        { label: "Total facturable", value: cargos ? formatoDolares(totalFacturable) : "—", detail: "Monto facturable de los resultados", icon: CircleDollarSign, tone: "success" },
      ]} />
      <div className={ui.toolbar}>
        <IsbmFilter label="Año"><select aria-label="Año" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className={inputCls}>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select></IsbmFilter>
        <IsbmFilter label="Mes"><select aria-label="Mes" value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inputCls}>
          {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select></IsbmFilter>
        <IsbmFilter label="Rubro"><select aria-label="Rubro" value={rubro} onChange={(e) => setRubro(e.target.value)} className={inputCls}>
          <option value="">Todos los rubros</option>
          {(Object.keys(RUBRO_LABEL) as RubroArancelIsbm[]).map((r) => (
            <option key={r} value={r}>{RUBRO_LABEL[r]}</option>
          ))}
        </select></IsbmFilter>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 px-1 cursor-pointer">
          <input type="checkbox" checked={verAnulados} onChange={(e) => setVerAnulados(e.target.checked)} className="accent-blue-600" />
          Incluir anulados
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 px-1 cursor-pointer">
          <input type="checkbox" checked={soloObservados} onChange={(e) => setSoloObservados(e.target.checked)} className="accent-amber-600" />
          <Hourglass size={13} className="text-amber-500" /> Solo en observación
        </label>
        <div className={ui.search}><IsbmFilter label="Buscar cargo"><div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Buscar por expediente, paciente o arancel"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Expediente, paciente o arancel…"
            className={`${inputCls} w-full pl-9`}
          />
        </div></IsbmFilter></div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
      )}


      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <IsbmTableHeading title="Detalle de cargos" count={cargos ? filtrados.length : undefined}>Servicios y montos por paciente</IsbmTableHeading>
        {!cargos ? (
          <div className="p-10 flex justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtrados.length === 0 ? (
          <IsbmEmptyState icon={Receipt} title="No hay cargos en esta vista">Prueba con otro período, rubro o término de búsqueda.</IsbmEmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 font-medium">Paciente</th>
                  <th className="px-4 py-2.5 font-medium">Arancel</th>
                  <th className="px-4 py-2.5 font-medium text-right">Cant.</th>
                  <th className="px-4 py-2.5 font-medium text-right">Servicio</th>
                  <th className="px-4 py-2.5 font-medium text-right">Facturable</th>
                  <th className="px-4 py-2.5 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-b border-slate-50 dark:border-slate-800/60 last:border-0 ${c.anulado ? "opacity-45" : ""}`}
                  >
                    <td className="px-4 py-2.5 text-xs tabular-nums text-slate-600 dark:text-slate-400">{c.fecha}</td>
                    <td className="px-4 py-2.5">
                      <p className={`text-slate-900 dark:text-slate-100 ${c.anulado ? "line-through" : ""}`}>
                        {c.afiliacion?.paciente_nombre ?? "—"}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400">{c.expediente}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-slate-800 dark:text-slate-200">{c.arancel.descripcion}</p>
                      <p className="text-[10px] text-slate-400">{RUBRO_LABEL[c.arancel.rubro]}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">{Number(c.cantidad)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatoDolares(c.costo_total)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatoDolares(c.monto_facturable)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {c.pendiente_revision && !c.anulado && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-full px-2 py-0.5 whitespace-nowrap">
                            <Hourglass size={10} /> En observación
                          </span>
                        )}
                        {c.motivo_no_facturable && (
                          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-full px-2 py-0.5 whitespace-nowrap">
                            {MOTIVO_NO_FACTURABLE_LABEL[c.motivo_no_facturable]}
                          </span>
                        )}
                      </div>
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
