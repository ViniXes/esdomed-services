"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { GRUPOS_GESTION_TS, labelTipoGestion, TIPOS_GESTION_TS } from "@/lib/trabajosocial/catalogos";
import type { GestionTS } from "@/types";
import { BarChart3, Download } from "lucide-react";
import { GestionesTabs } from "../_components/GestionesTabs";

const selectCls =
  "appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 transition cursor-pointer";

function mesActualStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
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

  const { ini, fin, dias } = useMemo(() => rangoMes(mes), [mes]);

  useEffect(() => {
    setLoading(true);
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

  // Totales por tipo de gestión (mes completo).
  const porTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of gestiones) m.set(g.tipo, (m.get(g.tipo) ?? 0) + 1);
    return m;
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
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-amber-50 dark:bg-amber-950/40 rounded-xl flex items-center justify-center border border-amber-200 dark:border-amber-900">
          <BarChart3 size={17} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Productividad</h1>
          <p className="text-xs text-slate-500 mt-0.5">Gestiones por trabajadora y día — producción diaria del mes</p>
        </div>
      </div>

      <GestionesTabs />

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer las gestiones. Pide al administrador que despliegue la regla de la colección <strong>gestiones_ts</strong>.
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={selectCls} />
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
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 text-center bg-amber-50/60 dark:bg-amber-950/30">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {trabajadoras.map((t) => (
                    <tr key={t} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-3 py-2 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{t}</td>
                      {diasArr.map((d) => {
                        const n = conteo.get(t)?.get(d) ?? 0;
                        return (
                          <td key={d} className={`px-2 py-2 text-center tabular-nums ${n ? "text-slate-800 dark:text-slate-200 font-medium" : "text-slate-300 dark:text-slate-700"}`}>
                            {n || "·"}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center font-bold tabular-nums text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/30">
                        {totalPorTrabajadora.get(t) ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-semibold">
                    <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5 text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">Total</td>
                    {diasArr.map((d) => (
                      <td key={d} className="px-2 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-400">{totalPorDia.get(d) ?? 0}</td>
                    ))}
                    <td className="px-3 py-2.5 text-center tabular-nums text-amber-700 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-950/50">{totalMes}</td>
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
                    <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-500 uppercase tracking-wide mt-2 mb-1">{grupo}</p>
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
