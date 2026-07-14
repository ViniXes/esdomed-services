"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import {
  ACCIONES_SEGUIMIENTO, GRUPOS_GESTION_TS, keyAccionSeguimiento, labelTipoGestion,
  MODALIDAD_GESTION_LABEL, TIPOS_GESTION_TS, type ModalidadGestion,
} from "@/lib/trabajosocial/catalogos";
import type { GestionTS } from "@/types";
import { BarChart3, ChevronDown, ChevronRight, Download } from "lucide-react";

const selectCls =
  "appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";

function mesActualStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
}

const ACCION_KEYS = new Set(ACCIONES_SEGUIMIENTO.map((a) => a.key));

// Agrupación macro de servicios como la usa el libro "SEGUIMIENTO Y VISITA
// FAMILIAR" (cuadros VISITAS/VIDEOLLAMADAS/LLAMADAS/STS POR SERVICIO).
// El orden de los checks importa: "intensivos quirúrgicos" es UCI, no Cirugía.
const GRUPOS_SVF = ["MEDICINA INTERNA", "CIRUGÍA", "UCINT", "UCI", "DOLOR Y PALIATIVOS", "OTROS", "SIN ESPECIFICAR"] as const;
function grupoServicioSVF(servicio?: string): string {
  const s = (servicio ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
  if (!s) return "SIN ESPECIFICAR";
  if (s.includes("intermedio")) return "UCINT";
  if (s.includes("intensiv") || s.includes("coronario") || s.includes("neurocritic")) return "UCI";
  if (s.includes("paliativ")) return "DOLOR Y PALIATIVOS";
  if (s.includes("cirug")) return "CIRUGÍA";
  if (s.includes("medicina interna") || s.includes("cardiolog") || s.includes("hematolog") || s.includes("aislado") || s.includes("oncolog")) {
    return "MEDICINA INTERNA";
  }
  return "OTROS";
}
// Primer y último día del mes "YYYY-MM" como strings "YYYY-MM-DD" (rango lexicográfico).
function rangoMes(mes: string): { ini: string; fin: string; dias: number } {
  const [y, m] = mes.split("-").map(Number);
  const dias = new Date(y, m, 0).getDate();
  return {
    ini: `${mes}-01`,
    fin: `${mes}-${`${dias}`.padStart(2, "0")}`,
    dias,
  };
}

export default function ProductividadPage() {
  const [mes, setMes] = useState(mesActualStr());
  const [gestiones, setGestiones] = useState<GestionTS[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  // Trabajadoras con su desglose por tipo desplegado en la matriz.
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  const { ini, fin, dias } = useMemo(() => rangoMes(mes), [mes]);

  useEffect(() => {
    const q = query(
      collection(db, "gestiones_ts"),
      where("fecha", ">=", ini),
      where("fecha", "<=", fin),
    );
    return onSnapshot(
      q,
      (s) => {
        setPermissionError(false);
        setGestiones(s.docs.map((d) => ({ id: d.id, ...d.data() } as GestionTS)));
        setLoading(false);
      },
      (err) => {
        if (err.code === "permission-denied") setPermissionError(true);
        setLoading(false);
      },
    );
  }, [ini, fin]);

  // Matriz trabajadora × día. Las filas se derivan de las trabajadoras presentes en el mes.
  const { trabajadoras, conteo, totalPorTrabajadora, totalPorDia, totalMes } = useMemo(() => {
    const conteo = new Map<string, Map<number, number>>(); // trabajadora → (día → n)
    const totalPorTrabajadora = new Map<string, number>();
    const totalPorDia = new Map<number, number>();
    let totalMes = 0;
    for (const g of gestiones) {
      const dia = Number(g.fecha.split("-")[2]);
      if (!conteo.has(g.trabajadoraNombre)) conteo.set(g.trabajadoraNombre, new Map());
      const fila = conteo.get(g.trabajadoraNombre)!;
      fila.set(dia, (fila.get(dia) ?? 0) + 1);
      totalPorTrabajadora.set(g.trabajadoraNombre, (totalPorTrabajadora.get(g.trabajadoraNombre) ?? 0) + 1);
      totalPorDia.set(dia, (totalPorDia.get(dia) ?? 0) + 1);
      totalMes++;
    }
    const trabajadoras = [...conteo.keys()].sort((a, b) => a.localeCompare(b));
    return { trabajadoras, conteo, totalPorTrabajadora, totalPorDia, totalMes };
  }, [gestiones]);

  // Desglose trabajadora → tipo → día (sub-filas expandibles de la matriz).
  const porTrabajadoraTipoDia = useMemo(() => {
    const m = new Map<string, Map<string, Map<number, number>>>();
    for (const g of gestiones) {
      const dia = Number(g.fecha.split("-")[2]);
      if (!m.has(g.trabajadoraNombre)) m.set(g.trabajadoraNombre, new Map());
      const tipos = m.get(g.trabajadoraNombre)!;
      if (!tipos.has(g.tipo)) tipos.set(g.tipo, new Map());
      const fila = tipos.get(g.tipo)!;
      fila.set(dia, (fila.get(dia) ?? 0) + 1);
    }
    return m;
  }, [gestiones]);

  const toggleExpandida = (t: string) =>
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });

  // Totales por tipo de gestión (mes completo).
  const porTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of gestiones) m.set(g.tipo, (m.get(g.tipo) ?? 0) + 1);
    return m;
  }, [gestiones]);

  // Cuadros diarios del libro "SEGUIMIENTO Y VISITA FAMILIAR": resumen de
  // acciones por día + desglose por servicio (macro) para cada acción.
  const cuadrosSVF = useMemo(() => {
    const porAccionDia = new Map<string, Map<number, number>>();          // acción → día → n
    const porAccionGrupoDia = new Map<string, Map<string, Map<number, number>>>(); // acción → grupo → día → n
    const atendidosDia = new Map<number, Set<string>>();                  // día → expedientes únicos (acciones)
    for (const g of gestiones) {
      const k = keyAccionSeguimiento(g);
      if (!ACCION_KEYS.has(k)) continue;
      const dia = Number(g.fecha.split("-")[2]);
      if (!porAccionDia.has(k)) porAccionDia.set(k, new Map());
      const pd = porAccionDia.get(k)!;
      pd.set(dia, (pd.get(dia) ?? 0) + 1);
      const grupo = grupoServicioSVF(g.servicio);
      if (!porAccionGrupoDia.has(k)) porAccionGrupoDia.set(k, new Map());
      const grupos = porAccionGrupoDia.get(k)!;
      if (!grupos.has(grupo)) grupos.set(grupo, new Map());
      const gd = grupos.get(grupo)!;
      gd.set(dia, (gd.get(dia) ?? 0) + 1);
      if (!atendidosDia.has(dia)) atendidosDia.set(dia, new Set());
      atendidosDia.get(dia)!.add(g.expediente);
    }
    const suma = (m?: Map<number, number>) => [...(m?.values() ?? [])].reduce((a, b) => a + b, 0);

    // Cuadro resumen: pacientes atendidos (únicos) + una fila por acción.
    const atendidosPorDia = new Map<number, number>();
    atendidosDia.forEach((set, dia) => atendidosPorDia.set(dia, set.size));
    const resumen = [
      { label: "PACIENTES ATENDIDOS (únicos)", porDia: atendidosPorDia, total: suma(atendidosPorDia) },
      ...ACCIONES_SEGUIMIENTO.map((a) => ({
        label: a.chip.toUpperCase(),
        porDia: porAccionDia.get(a.key) ?? new Map<number, number>(),
        total: suma(porAccionDia.get(a.key)),
      })),
    ];

    // Un cuadro por acción: filas = grupos de servicio con datos, en el orden del libro.
    const porServicio = ACCIONES_SEGUIMIENTO.map((a) => {
      const grupos = porAccionGrupoDia.get(a.key) ?? new Map<string, Map<number, number>>();
      const filas = GRUPOS_SVF
        .map((gr) => ({ label: gr, porDia: grupos.get(gr) ?? new Map<number, number>(), total: suma(grupos.get(gr)) }))
        .filter((f) => f.total > 0);
      return {
        key: a.key,
        titulo: `${a.chip} por servicio`,
        filas,
        totalPorDia: porAccionDia.get(a.key) ?? new Map<number, number>(),
        total: suma(porAccionDia.get(a.key)),
      };
    }).filter((c) => c.total > 0);

    const totalGestionesDia = new Map<number, number>();
    porAccionDia.forEach((pd) => pd.forEach((n, dia) => totalGestionesDia.set(dia, (totalGestionesDia.get(dia) ?? 0) + n)));

    return { resumen, porServicio, totalGestionesDia, totalGestiones: suma(totalGestionesDia) };
  }, [gestiones]);

  // Gestiones por servicio del paciente (snapshot guardado en cada gestión),
  // con desglose por trabajadora para la tabla servicio × trabajadora.
  const { serviciosOrdenados, porServicioTrabajadora } = useMemo(() => {
    const totales = new Map<string, number>();
    const cruz = new Map<string, Map<string, number>>(); // servicio → (trabajadora → n)
    for (const g of gestiones) {
      const s = g.servicio?.trim() || "Sin servicio";
      totales.set(s, (totales.get(s) ?? 0) + 1);
      if (!cruz.has(s)) cruz.set(s, new Map());
      const fila = cruz.get(s)!;
      fila.set(g.trabajadoraNombre, (fila.get(g.trabajadoraNombre) ?? 0) + 1);
    }
    const serviciosOrdenados = [...totales.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { serviciosOrdenados, porServicioTrabajadora: cruz };
  }, [gestiones]);

  // Desglose por modalidad + total de minutos registrados en el mes.
  const { porModalidad, totalMin } = useMemo(() => {
    const porModalidad = new Map<ModalidadGestion, number>();
    let totalMin = 0;
    for (const g of gestiones) {
      const mod = (g.modalidad ?? "presencial") as ModalidadGestion;
      porModalidad.set(mod, (porModalidad.get(mod) ?? 0) + 1);
      if (g.duracionMin) totalMin += g.duracionMin;
    }
    return { porModalidad, totalMin };
  }, [gestiones]);

  const diasArr = Array.from({ length: dias }, (_, i) => i + 1);

  // Exportar la matriz a CSV (mismo formato que la hoja PRODUCCION DIARIA).
  const exportarCSV = () => {
    const cab = ["Trabajadora", ...diasArr.map(String), "Total"];
    const filas = trabajadoras.map((t) => [
      t,
      ...diasArr.map((d) => String(conteo.get(t)?.get(d) ?? 0)),
      String(totalPorTrabajadora.get(t) ?? 0),
    ]);
    const totalRow = ["TOTAL", ...diasArr.map((d) => String(totalPorDia.get(d) ?? 0)), String(totalMes)];
    const csv = [cab, ...filas, totalRow]
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `produccion-diaria-${mes}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto space-y-5">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
          <BarChart3 size={13} /> Trabajo Social
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Productividad</h1>
        <p className="text-xs text-slate-500 mt-0.5">Gestiones por trabajadora y día — producción diaria del mes</p>
      </div>


      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer las gestiones. Pide al administrador que despliegue la regla de la colección <strong>gestiones_ts</strong>.
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month"
          value={mes}
          onChange={(e) => {
            // El spinner se enciende aquí (handler), no en el efecto — regla react-hooks.
            if (e.target.value !== mes) { setMes(e.target.value); setLoading(true); }
          }}
          className={selectCls}
        />
        <span className="text-sm text-slate-500">{totalMes} gestión(es) en el mes</span>
        {totalMes > 0 && (
          <button
            onClick={exportarCSV}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Download size={15} /> Exportar CSV
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-16 text-center">Cargando…</p>
      ) : totalMes === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <BarChart3 size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No hay gestiones registradas en este mes.</p>
        </div>
      ) : (
        <>
          {/* Resumen: modalidad + tiempo */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {(Object.keys(MODALIDAD_GESTION_LABEL) as ModalidadGestion[]).map((m) => (
              <div key={m} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5">
                <span className="text-xs text-slate-500 truncate">{MODALIDAD_GESTION_LABEL[m]}</span>
                <span className="text-lg font-bold font-heading tabular-nums text-slate-800 dark:text-slate-200">{porModalidad.get(m) ?? 0}</span>
              </div>
            ))}
            {totalMin > 0 && (
              <div className="flex items-center justify-between gap-2 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl px-3.5 py-2.5">
                <span className="text-xs text-blue-700 dark:text-blue-400">Tiempo</span>
                <span className="text-lg font-bold font-heading tabular-nums text-blue-700 dark:text-blue-400 whitespace-nowrap">
                  {Math.floor(totalMin / 60)}h {totalMin % 60}m
                </span>
              </div>
            )}
          </div>

          {/* Matriz trabajadora × día */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/50 text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[160px]">
                      Trabajadora
                    </th>
                    {diasArr.map((d) => (
                      <th key={d} className="px-2 py-2.5 text-xs font-semibold text-slate-500 text-center w-9">{d}</th>
                    ))}
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 text-center bg-blue-50/60 dark:bg-blue-950/30">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {trabajadoras.map((t) => {
                    const abierta = expandidas.has(t);
                    // Sub-filas por tipo, ordenadas por volumen en el mes.
                    const tipos = abierta
                      ? [...(porTrabajadoraTipoDia.get(t) ?? new Map<string, Map<number, number>>()).entries()]
                          .map(([tipo, porDia]) => ({
                            tipo,
                            porDia,
                            total: [...porDia.values()].reduce((a, b) => a + b, 0),
                          }))
                          .sort((a, b) => b.total - a.total || labelTipoGestion(a.tipo).localeCompare(labelTipoGestion(b.tipo)))
                      : [];
                    return (
                      <Fragment key={t}>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-3 py-2 whitespace-nowrap">
                            <button
                              onClick={() => toggleExpandida(t)}
                              title={abierta ? "Ocultar desglose por tipo" : "Ver desglose diario por tipo de gestión"}
                              className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                              {abierta ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
                              {t}
                            </button>
                          </td>
                          {diasArr.map((d) => {
                            const n = conteo.get(t)?.get(d) ?? 0;
                            return (
                              <td key={d} className={`px-2 py-2 text-center tabular-nums ${n ? "text-slate-800 dark:text-slate-200 font-medium" : "text-slate-300 dark:text-slate-700"}`}>
                                {n || "·"}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-center font-bold tabular-nums text-blue-700 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-950/30">
                            {totalPorTrabajadora.get(t) ?? 0}
                          </td>
                        </tr>
                        {tipos.map(({ tipo, porDia, total }) => (
                          <tr key={`${t}|${tipo}`} className="bg-slate-50/70 dark:bg-slate-800/30">
                            <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/90 pl-8 pr-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap max-w-[240px] truncate" title={labelTipoGestion(tipo)}>
                              {labelTipoGestion(tipo)}
                            </td>
                            {diasArr.map((d) => {
                              const n = porDia.get(d) ?? 0;
                              return (
                                <td key={d} className={`px-2 py-1.5 text-center text-xs tabular-nums ${n ? "text-slate-600 dark:text-slate-300" : "text-slate-200 dark:text-slate-700/70"}`}>
                                  {n || "·"}
                                </td>
                              );
                            })}
                            <td className="px-3 py-1.5 text-center text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300 bg-blue-50/40 dark:bg-blue-950/20">
                              {total}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-semibold">
                    <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5 text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">Total</td>
                    {diasArr.map((d) => (
                      <td key={d} className="px-2 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-400">{totalPorDia.get(d) ?? 0}</td>
                    ))}
                    <td className="px-3 py-2.5 text-center tabular-nums text-blue-700 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-950/50">{totalMes}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Cuadros diarios del libro "SEGUIMIENTO Y VISITA FAMILIAR" */}
          {cuadrosSVF.totalGestiones > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest pt-1">
                Cuadros diarios — seguimiento y visita familiar
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">· formato del libro PRODUCCION DIARIA</span>
              </p>
              <CuadroDiario
                titulo="Resumen diario"
                filas={cuadrosSVF.resumen}
                diasArr={diasArr}
                totalPorDia={cuadrosSVF.totalGestionesDia}
                totalLabel="TOTAL DE GESTIONES DIARIAS"
                total={cuadrosSVF.totalGestiones}
                abiertoInicial
              />
              {cuadrosSVF.porServicio.map((c) => (
                <CuadroDiario
                  key={c.key}
                  titulo={c.titulo}
                  filas={c.filas}
                  diasArr={diasArr}
                  totalPorDia={c.totalPorDia}
                  totalLabel="TOTAL DE ATENCIONES DIARIAS"
                  total={c.total}
                />
              ))}
            </div>
          )}

          {/* Gestiones por servicio (servicio del paciente al momento de la gestión) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-4 pt-4 pb-3">
              Gestiones por servicio
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">· servicio del paciente al registrar la gestión</span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Servicio</th>
                    {trabajadoras.map((t) => (
                      <th key={t} className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-center whitespace-nowrap">
                        {t.split(" ")[0]}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 text-center bg-blue-50/60 dark:bg-blue-950/30">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {serviciosOrdenados.map(([servicio, total]) => (
                    <tr key={servicio} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-200">{servicio}</td>
                      {trabajadoras.map((t) => {
                        const n = porServicioTrabajadora.get(servicio)?.get(t) ?? 0;
                        return (
                          <td key={t} className={`px-3 py-2 text-center tabular-nums ${n ? "text-slate-800 dark:text-slate-200 font-medium" : "text-slate-300 dark:text-slate-700"}`}>
                            {n || "·"}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center font-bold tabular-nums text-blue-700 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-950/30">{total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-semibold">
                    <td className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">Total</td>
                    {trabajadoras.map((t) => (
                      <td key={t} className="px-3 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-400">
                        {totalPorTrabajadora.get(t) ?? 0}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-center tabular-nums text-blue-700 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-950/50">{totalMes}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Totales por tipo de gestión */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Gestiones por tipo</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
              {GRUPOS_GESTION_TS.map((grupo) => {
                const tiposGrupo = TIPOS_GESTION_TS.filter((t) => t.grupo === grupo && (porTipo.get(t.id) ?? 0) > 0);
                if (tiposGrupo.length === 0) return null;
                return (
                  <div key={grupo} className="break-inside-avoid">
                    <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-500 uppercase tracking-wide mt-2 mb-1">{grupo}</p>
                    {tiposGrupo.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-3 text-sm py-0.5">
                        <span className="text-slate-600 dark:text-slate-400 truncate">{labelTipoGestion(t.id)}</span>
                        <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">{porTipo.get(t.id)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Cuadro diario (formato del libro: filas × día 1..31 + TOTAL MENSUAL) ──────
function CuadroDiario({
  titulo, filas, diasArr, totalPorDia, totalLabel, total, abiertoInicial = false,
}: {
  titulo: string;
  filas: { label: string; porDia: Map<number, number>; total: number }[];
  diasArr: number[];
  totalPorDia: Map<number, number>;
  totalLabel: string;
  total: number;
  abiertoInicial?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${abierto ? "" : "-rotate-90"}`} />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex-1 text-left">{titulo}</span>
        <span className="text-xs font-bold text-blue-700 dark:text-blue-400 tabular-nums">{total}</span>
      </button>
      {abierto && (
        <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/50 text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[190px]" />
                {diasArr.map((d) => (
                  <th key={d} className="px-2 py-2 text-xs font-semibold text-slate-500 text-center w-9">{d}</th>
                ))}
                <th className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 text-center bg-blue-50/60 dark:bg-blue-950/30 whitespace-nowrap">Total mensual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filas.map((f) => (
                <tr key={f.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">{f.label}</td>
                  {diasArr.map((d) => {
                    const n = f.porDia.get(d) ?? 0;
                    return (
                      <td key={d} className={`px-2 py-2 text-center tabular-nums ${n ? "text-slate-800 dark:text-slate-200 font-medium" : "text-slate-300 dark:text-slate-700"}`}>
                        {n || "·"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center font-bold tabular-nums text-blue-700 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-950/30">{f.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-semibold">
                <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-600 dark:text-slate-300 whitespace-nowrap">{totalLabel}</td>
                {diasArr.map((d) => (
                  <td key={d} className="px-2 py-2 text-center tabular-nums text-slate-600 dark:text-slate-400">{totalPorDia.get(d) ?? 0}</td>
                ))}
                <td className="px-3 py-2 text-center tabular-nums text-blue-700 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-950/50">{total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
