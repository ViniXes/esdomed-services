"use client";

// Incapacidades emitidas por área: cuántas emitió ESDOMED en un rango (según la
// fecha de EMISIÓN), agrupadas por el servicio del paciente ("Emergencia" en las
// de emergencia). Cero lecturas al montar: una sola consulta al pulsar
// "Generar reporte" (rango + orderBy sobre emitidaEn, sin índice compuesto).

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, orderBy, getDocs, Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useServicios } from "@/contexts/ServiciosContext";
import { DateField } from "@/components/ui/DateField";
import {
  AlertTriangle, BarChart3, CalendarDays, Download, FileCheck2, FileClock, Layers, Search, X,
} from "lucide-react";
import type { SolicitudIncapacidad } from "@/types";
import { formatFecha, formatFechaHora } from "@/lib/pacientes/helpers";
import { mapIncapacidadData } from "@/lib/incapacidades/helpers";
import { claveServicio, resolverServicioCanonico } from "@/lib/servicios";

const pad = (n: number) => String(n).padStart(2, "0");
const toInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fechaCorta = (ymd: string) => ymd.split("-").reverse().join("/");

/** Nombre del área para mostrar: el del catálogo vivo si lo reconoce, si no el guardado. */
const areaDe = (s: SolicitudIncapacidad, catalogo: readonly string[]) => {
  const crudo = (s.servicioPaciente || "").trim();
  return crudo ? resolverServicioCanonico(crudo, catalogo) ?? crudo : "Sin servicio";
};

interface FilaArea { clave: string; area: string; emitidas: number; dias: number }

const selectCls =
  "px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 shadow-sm cursor-pointer max-w-[280px]";

export default function IncapacidadesPorAreaPage() {
  const { profile, loading: authLoading } = useAuth();
  const { servicios } = useServicios();
  const router = useRouter();
  const esEsdomed = profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";

  useEffect(() => {
    if (!authLoading && profile && !esEsdomed) router.replace("/dashboard");
  }, [authLoading, profile, esEsdomed, router]);

  // Por defecto: del 1 del mes en curso a hoy.
  const hoy = useMemo(() => new Date(), []);
  const [fechaDesde, setFechaDesde] = useState(() => toInput(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [fechaHasta, setFechaHasta] = useState(() => toInput(hoy));
  // Clave del área (claveServicio); "" = todas. Se elige antes o después de
  // generar: el filtro es en memoria, cambiarlo no vuelve a consultar.
  const [areaFiltro, setAreaFiltro] = useState("");

  const [emitidas, setEmitidas] = useState<SolicitudIncapacidad[] | null>(null); // null = aún no se consulta
  const [rangoConsultado, setRangoConsultado] = useState<{ desde: string; hasta: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const rangoInvalido = !fechaDesde || !fechaHasta || fechaDesde > fechaHasta;
  const rangoDesactualizado =
    rangoConsultado !== null && (rangoConsultado.desde !== fechaDesde || rangoConsultado.hasta !== fechaHasta);

  const generarReporte = async () => {
    if (rangoInvalido) return;
    setCargando(true);
    setError(null);
    try {
      const snap = await getDocs(query(
        collection(db, "incapacidades"),
        where("emitidaEn", ">=", Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"))),
        where("emitidaEn", "<=", Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"))),
        orderBy("emitidaEn", "desc"),
      ));
      setEmitidas(snap.docs.map((d) => mapIncapacidadData(d.id, d.data())).filter((s) => s.estado === "emitida"));
      setRangoConsultado({ desde: fechaDesde, hasta: fechaHasta });
    } catch (e) {
      setError(`No se pudo generar el reporte: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setCargando(false);
    }
  };

  // Agrupado por clave de servicio (caja/tildes/espacios no parten un área en dos).
  const porArea = useMemo<FilaArea[]>(() => {
    const mapa = new Map<string, FilaArea>();
    for (const s of emitidas ?? []) {
      const area = areaDe(s, servicios);
      const clave = claveServicio(area);
      const fila = mapa.get(clave) ?? { clave, area, emitidas: 0, dias: 0 };
      fila.emitidas++;
      fila.dias += s.diasIncapacidad || 0;
      mapa.set(clave, fila);
    }
    return Array.from(mapa.values()).sort((a, b) => b.emitidas - a.emitidas || a.area.localeCompare(b.area));
  }, [emitidas, servicios]);

  // Opciones del selector: el catálogo vivo de servicios (disponible antes de
  // consultar) + cualquier área del resultado que no figure en él.
  const opcionesArea = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const s of servicios) mapa.set(claveServicio(s), s);
    for (const f of porArea) if (!mapa.has(f.clave)) mapa.set(f.clave, f.area);
    return Array.from(mapa, ([clave, nombre]) => ({ clave, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [servicios, porArea]);

  const areaNombre = areaFiltro ? opcionesArea.find((o) => o.clave === areaFiltro)?.nombre ?? null : null;
  const filaArea = areaFiltro ? porArea.find((f) => f.clave === areaFiltro) ?? null : null;

  const detalle = useMemo(
    () => (emitidas ?? []).filter((s) => !areaFiltro || claveServicio(areaDe(s, servicios)) === areaFiltro),
    [emitidas, areaFiltro, servicios],
  );

  const total = emitidas?.length ?? 0;
  const diasTotal = porArea.reduce((a, f) => a + f.dias, 0);
  const kpi = areaFiltro
    ? { emitidas: filaArea?.emitidas ?? 0, dias: filaArea?.dias ?? 0 }
    : { emitidas: total, dias: diasTotal };
  const promedio = kpi.emitidas ? (kpi.dias / kpi.emitidas).toFixed(1) : "0";
  const pct = (n: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : "0%");

  const exportarExcel = async () => {
    if (!rangoConsultado || !emitidas) return;
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const rango = `Emitidas del ${fechaCorta(rangoConsultado.desde)} al ${fechaCorta(rangoConsultado.hasta)} (según fecha de emisión)`;
      const aoa: (string | number)[][] = [
        ["Incapacidades emitidas por área"],
        [rango],
        [],
        ["Área", "Emitidas", "% del total", "Días otorgados"],
      ];
      porArea.forEach((f) => aoa.push([f.area, f.emitidas, pct(f.emitidas), f.dias]));
      aoa.push(["Total", total, total ? "100%" : "0%", diasTotal]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Por área");

      const filas = detalle.map((s) => ({
        Área: areaDe(s, servicios),
        Expediente: s.pacienteExpediente,
        Paciente: s.pacienteNombre,
        "Médico solicitante": s.medicoNombre,
        Días: s.diasIncapacidad,
        "Fecha de alta": formatFecha(s.fechaAlta),
        "Emitida el": s.emitidaEn ? formatFechaHora(s.emitidaEn) : "",
        "Emitida por": s.emitidaPorNombre ?? "",
        Origen: s.origen === "emergencia" ? "Emergencia" : s.origen === "reposicion" ? "Reposición" : "Hospitalización",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Detalle");

      const sufijo = areaNombre ? `_${areaNombre.replace(/[^\p{L}\p{N}]+/gu, "_")}` : "";
      XLSX.writeFile(wb, `incapacidades_emitidas_${rangoConsultado.desde}_a_${rangoConsultado.hasta}${sufijo}.xlsx`);
    } catch (e) {
      setError(`No se pudo exportar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setExportando(false);
    }
  };

  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!esEsdomed) return null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
            <BarChart3 size={17} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Incapacidades por área</h1>
            <p className="text-xs text-slate-500">Cuántas emitió ESDOMED en un período, por servicio del paciente</p>
          </div>
        </div>
        <button
          onClick={exportarExcel}
          disabled={exportando || cargando || !emitidas || emitidas.length === 0}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
        >
          <Download size={15} />
          {exportando ? "Generando..." : "Exportar a Excel"}
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Emitidas desde</span>
          <DateField value={fechaDesde} onChange={setFechaDesde} placeholder="Desde" ariaLabel="Emitidas desde" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Hasta</span>
          <DateField value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" ariaLabel="Emitidas hasta" />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Área</span>
          <select value={areaFiltro} onChange={(e) => setAreaFiltro(e.target.value)} className={selectCls} aria-label="Área">
            <option value="">Todas las áreas</option>
            {opcionesArea.map((o) => {
              const n = porArea.find((f) => f.clave === o.clave)?.emitidas;
              return <option key={o.clave} value={o.clave}>{o.nombre}{n ? ` (${n})` : ""}</option>;
            })}
          </select>
        </div>

        <button
          onClick={generarReporte}
          disabled={cargando || rangoInvalido}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          <Search size={14} />
          {cargando ? "Consultando..." : rangoConsultado ? "Actualizar reporte" : "Generar reporte"}
        </button>
      </div>

      {fechaDesde > fechaHasta && fechaDesde && fechaHasta && (
        <p className="text-xs text-amber-700 dark:text-amber-400">La fecha &quot;desde&quot; es posterior a &quot;hasta&quot;.</p>
      )}

      {rangoDesactualizado && !cargando && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-700 dark:text-amber-400">
          Cambiaste el rango de fechas. Los datos mostrados son del {fechaCorta(rangoConsultado!.desde)} al {fechaCorta(rangoConsultado!.hasta)}; presiona &quot;Actualizar reporte&quot; para consultarlo.
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : emitidas === null ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <Search size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">Elige el rango de fechas de emisión y el área, y presiona &quot;Generar reporte&quot;.</p>
          <p className="text-xs text-slate-400 mt-1">No se consulta la base de datos hasta que lo pidas.</p>
        </div>
      ) : emitidas.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <FileCheck2 size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">No se emitieron incapacidades en ese período.</p>
        </div>
      ) : (
        <>
          {/* KPIs (del área elegida o de todas) */}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2">
              {areaNombre ?? "Todas las áreas"}
              <span className="normal-case tracking-normal font-normal">
                {" · "}del {fechaCorta(rangoConsultado!.desde)} al {fechaCorta(rangoConsultado!.hasta)}
              </span>
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={FileCheck2} label="Emitidas" value={kpi.emitidas} color="text-emerald-600 dark:text-emerald-400" />
              <Kpi icon={CalendarDays} label="Días otorgados" value={kpi.dias} color="text-blue-600 dark:text-blue-400" />
              <Kpi icon={BarChart3} label="Promedio de días" value={promedio} color="text-blue-600 dark:text-blue-400" />
              {areaFiltro
                ? <Kpi icon={Layers} label="Del total emitido" value={pct(kpi.emitidas)} color="text-blue-600 dark:text-blue-400" />
                : <Kpi icon={Layers} label="Áreas" value={porArea.length} color="text-blue-600 dark:text-blue-400" />}
            </div>
          </div>

          {/* Tabla por área */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-4 pt-4 pb-3 font-heading">
              Emitidas por área
              <span className="ml-2 font-normal text-slate-400">· toca un área para ver sus incapacidades</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <Th>Área</Th>
                    <Th center>Emitidas</Th>
                    <Th center>% del total</Th>
                    <Th center>Días otorgados</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {porArea.map((f) => (
                    <tr
                      key={f.clave}
                      onClick={() => setAreaFiltro((c) => (c === f.clave ? "" : f.clave))}
                      className={`cursor-pointer transition-colors ${
                        areaFiltro === f.clave ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      }`}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{f.area}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{f.emitidas}</td>
                      <td className="px-4 py-2.5 text-center text-slate-600 dark:text-slate-400 tabular-nums">{pct(f.emitidas)}</td>
                      <td className="px-4 py-2.5 text-center text-slate-600 dark:text-slate-400 tabular-nums">{f.dias}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-semibold">
                    <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100">Total</td>
                    <td className="px-4 py-2.5 text-center text-blue-600 dark:text-blue-400 tabular-nums">{total}</td>
                    <td className="px-4 py-2.5 text-center text-slate-900 dark:text-slate-100 tabular-nums">100%</td>
                    <td className="px-4 py-2.5 text-center text-slate-900 dark:text-slate-100 tabular-nums">{diasTotal}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Detalle: las incapacidades que generan los números */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">
                Incapacidades emitidas
                <span className="ml-2 font-normal text-slate-400">
                  · {areaNombre ?? "todas las áreas"} ({detalle.length})
                </span>
              </h3>
              {areaFiltro && (
                <button
                  onClick={() => setAreaFiltro("")}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
                >
                  <X size={12} /> Ver todas las áreas
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <Th>Expediente</Th>
                    <Th>Paciente</Th>
                    <Th>Médico solicitante</Th>
                    <Th center>Días</Th>
                    <Th>Fecha alta</Th>
                    <Th>Emitida</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detalle.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                        No se emitieron incapacidades de {areaNombre ?? "esta área"} en ese período.
                      </td>
                    </tr>
                  )}
                  {detalle.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => router.push(`/dashboard/incapacidades/${s.id}`)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-mono font-semibold text-slate-800 dark:text-slate-200">{s.pacienteExpediente}</p>
                        {s.origen === "reposicion" && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 px-1.5 py-0.5 rounded-full">
                            <FileClock size={9} /> Reposición
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{s.pacienteNombre}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{areaDe(s, servicios)}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300">Dr. {s.medicoNombre}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{s.diasIncapacidad}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatFecha(s.fechaAlta)}</td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                        <p className="text-slate-700 dark:text-slate-300">{s.emitidaEn ? formatFechaHora(s.emitidaEn) : "—"}</p>
                        {s.emitidaPorNombre && <p className="text-slate-500 mt-0.5">{s.emitidaPorNombre}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, color }: {
  icon: typeof FileCheck2; label: string; value: string | number; color: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-slate-500 mb-1.5">
        <Icon size={13} className={color} />
        <p className="text-[11px] font-medium uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
    </div>
  );
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${center ? "text-center" : "text-left"}`}>
      {children}
    </th>
  );
}
