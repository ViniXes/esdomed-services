"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, query, where, orderBy, getDocs, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart3, Download, AlertTriangle, HeartPulse, Activity, Users, CalendarClock,
} from "lucide-react";
import type { EstadoPaciente, Paciente } from "@/types";
import {
  ESTADO_LABEL, calcularEdad, diasEstancia, formatFecha, formatFechaHora,
  nombreCompleto, toDate,
} from "@/lib/pacientes/helpers";

// Categorías de egreso
const VIVOS_ESTADOS: EstadoPaciente[] = ["alta_vivo", "alta_voluntaria", "referido", "fuga", "in_extremis"];
const esFallecido = (e: EstadoPaciente) => e === "alta_fallecido";

type Categoria = "ambos" | "vivos" | "fallecidos";
type TipoVivo = "todos" | "alta_vivo" | "alta_voluntaria" | "referido" | "fuga" | "in_extremis";

const pad = (n: number) => String(n).padStart(2, "0");
const toInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const inputDateCls =
  "px-2 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 shadow-sm [color-scheme:light] dark:[color-scheme:dark]";
const selectCls =
  "px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 shadow-sm cursor-pointer";

export default function ReportesPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const esEsdomed = profile?.role === "esdomed" || profile?.role === "admin";

  useEffect(() => {
    if (!authLoading && profile && !esEsdomed) router.replace("/dashboard");
  }, [authLoading, profile, esEsdomed, router]);

  // ── Filtros ──
  const hoy = useMemo(() => new Date(), []);
  const [fechaDesde, setFechaDesde] = useState(() => toInput(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [fechaHasta, setFechaHasta] = useState(() => toInput(hoy));
  const [categoria, setCategoria] = useState<Categoria>("ambos");
  const [servicioFiltro, setServicioFiltro] = useState("");
  const [tipoVivo, setTipoVivo] = useState<TipoVivo>("todos");

  // ── Datos ──
  const [egresos, setEgresos] = useState<Paciente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  // Carga por rango de fecha de egreso (los activos no tienen fechaEgreso → quedan fuera).
  useEffect(() => {
    if (!esEsdomed) return;
    if (!fechaDesde || !fechaHasta) return;
    let cancelado = false;
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const desde = new Date(fechaDesde + "T00:00:00");
        const hasta = new Date(fechaHasta + "T23:59:59");
        const q = query(
          collection(db, "pacientes"),
          where("fechaEgreso", ">=", Timestamp.fromDate(desde)),
          where("fechaEgreso", "<=", Timestamp.fromDate(hasta)),
          orderBy("fechaEgreso", "desc"),
        );
        const snap = await getDocs(q);
        if (cancelado) return;
        const lista = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
            fechaEgreso: toDate(data.fechaEgreso),
            fechaNacimiento: toDate(data.fechaNacimiento),
            creadoEn: toDate(data.creadoEn) ?? new Date(),
          } as Paciente;
        });
        setEgresos(lista);
      } catch (e) {
        if (!cancelado) setError(`No se pudo cargar el reporte: ${e instanceof Error ? e.message : "error"}`);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [fechaDesde, fechaHasta, esEsdomed]);

  // Estados a incluir según categoría + tipo
  const estados: EstadoPaciente[] = useMemo(() => {
    if (categoria === "fallecidos") return ["alta_fallecido"];
    if (categoria === "vivos") return tipoVivo === "todos" ? VIVOS_ESTADOS : [tipoVivo];
    return [...VIVOS_ESTADOS, "alta_fallecido"];
  }, [categoria, tipoVivo]);

  // Servicios disponibles en el set cargado (para el filtro)
  const serviciosDisponibles = useMemo(() => {
    const set = new Set<string>();
    egresos.forEach((p) => p.servicioActual && set.add(p.servicioActual));
    return Array.from(set).sort();
  }, [egresos]);

  // Lista filtrada (categoría/tipo + servicio)
  const filtrados = useMemo(() => {
    const estadosSet = new Set(estados);
    return egresos.filter((p) => {
      if (!estadosSet.has(p.estado)) return false;
      if (servicioFiltro && p.servicioActual !== servicioFiltro) return false;
      return true;
    });
  }, [egresos, estados, servicioFiltro]);

  // ── KPIs ──
  const kpis = useMemo(() => {
    const total = filtrados.length;
    const vivos = filtrados.filter((p) => !esFallecido(p.estado)).length;
    const fallecidos = filtrados.filter((p) => esFallecido(p.estado)).length;
    const estancias = filtrados
      .map((p) => p.diasEstancia ?? (p.fechaEgreso ? diasEstancia(p.fechaIngreso, p.fechaEgreso) : null))
      .filter((d): d is number => d !== null && Number.isFinite(d));
    const promedioEstancia = estancias.length
      ? Math.round((estancias.reduce((a, b) => a + b, 0) / estancias.length) * 10) / 10
      : 0;
    return { total, vivos, fallecidos, promedioEstancia };
  }, [filtrados]);

  // ── Pivote Servicio × Tipo de egreso ──
  const pivote = useMemo(() => {
    const servicios = Array.from(new Set(filtrados.map((p) => p.servicioActual || "—"))).sort();
    const matriz = new Map<string, Map<EstadoPaciente, number>>();
    const totalPorTipo = new Map<EstadoPaciente, number>();
    const totalPorServicio = new Map<string, number>();
    for (const p of filtrados) {
      const s = p.servicioActual || "—";
      if (!matriz.has(s)) matriz.set(s, new Map());
      const fila = matriz.get(s)!;
      fila.set(p.estado, (fila.get(p.estado) ?? 0) + 1);
      totalPorTipo.set(p.estado, (totalPorTipo.get(p.estado) ?? 0) + 1);
      totalPorServicio.set(s, (totalPorServicio.get(s) ?? 0) + 1);
    }
    return { servicios, matriz, totalPorTipo, totalPorServicio };
  }, [filtrados]);

  // ── Resumen mensual ──
  const porMes = useMemo(() => {
    const meses = new Map<string, { vivos: number; fallecidos: number }>();
    for (const p of filtrados) {
      if (!p.fechaEgreso) continue;
      const key = `${p.fechaEgreso.getFullYear()}-${pad(p.fechaEgreso.getMonth() + 1)}`;
      if (!meses.has(key)) meses.set(key, { vivos: 0, fallecidos: 0 });
      const m = meses.get(key)!;
      if (esFallecido(p.estado)) m.fallecidos++; else m.vivos++;
    }
    return Array.from(meses.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrados]);

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // Hoja Detalle — una fila por egreso
      const detalle = filtrados.map((p) => ({
        Expediente: p.expediente,
        Paciente: nombreCompleto(p),
        Sexo: p.genero === "masculino" ? "M" : p.genero === "femenino" ? "F" : "O",
        Edad: calcularEdad(p.fechaNacimiento) ?? "",
        "Servicio de ingreso": p.servicioIngreso ?? "",
        "Servicio de egreso": p.servicioActual ?? "",
        Cama: p.camaActual ?? "",
        "Fecha de ingreso": p.fechaIngreso ? formatFecha(p.fechaIngreso) : "",
        "Fecha de egreso": p.fechaEgreso ? formatFechaHora(p.fechaEgreso) : "",
        "Días de estancia": p.diasEstancia ?? (p.fechaEgreso ? diasEstancia(p.fechaIngreso, p.fechaEgreso) : ""),
        "Tipo de egreso": ESTADO_LABEL[p.estado],
        Categoría: esFallecido(p.estado) ? "Fallecido" : "Vivo",
        "Diagnóstico de egreso": p.diagnosticoEgreso?.descripcion ?? "",
        "Médico de egreso": p.medicoEgresoNombre ?? "",
        JVPM: p.medicoEgresoJvpm ?? "",
      }));
      const wsDetalle = XLSX.utils.json_to_sheet(detalle);
      XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle");

      // Hoja Resumen — tabulador servicio × tipo
      const encabezado = ["Servicio", ...estados.map((e) => ESTADO_LABEL[e]), "Total"];
      const aoa: (string | number)[][] = [
        [`Egresos del ${fechaDesde} al ${fechaHasta}`],
        [`Total: ${kpis.total}`, `Vivos: ${kpis.vivos}`, `Fallecidos: ${kpis.fallecidos}`, `Estancia prom.: ${kpis.promedioEstancia} días`],
        [],
        encabezado,
      ];
      pivote.servicios.forEach((s) => {
        aoa.push([
          s,
          ...estados.map((e) => pivote.matriz.get(s)?.get(e) ?? 0),
          pivote.totalPorServicio.get(s) ?? 0,
        ]);
      });
      aoa.push([
        "Total",
        ...estados.map((e) => pivote.totalPorTipo.get(e) ?? 0),
        kpis.total,
      ]);
      const wsResumen = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

      XLSX.writeFile(wb, `egresos_${fechaDesde}_a_${fechaHasta}.xlsx`);
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
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-950 rounded-xl flex items-center justify-center border border-indigo-200 dark:border-indigo-900">
            <BarChart3 size={17} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Reportería de egresos</h1>
            <p className="text-xs text-slate-500">Tabulador de egresos vivos y fallecidos por fecha y servicio</p>
          </div>
        </div>
        <button
          onClick={exportarExcel}
          disabled={exportando || cargando || filtrados.length === 0}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
        >
          <Download size={15} />
          {exportando ? "Generando..." : "Exportar a Excel"}
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Egreso desde</span>
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className={inputDateCls} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Hasta</span>
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className={inputDateCls} />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Categoría</span>
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
            {([
              { v: "ambos", l: "Ambos" },
              { v: "vivos", l: "Vivos" },
              { v: "fallecidos", l: "Fallecidos" },
            ] as { v: Categoria; l: string }[]).map((c) => (
              <button
                key={c.v}
                onClick={() => setCategoria(c.v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  categoria === c.v
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {c.l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Servicio</span>
          <select value={servicioFiltro} onChange={(e) => setServicioFiltro(e.target.value)} className={selectCls}>
            <option value="">Todos los servicios</option>
            {serviciosDisponibles.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {categoria === "vivos" && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">Tipo de egreso</span>
            <select value={tipoVivo} onChange={(e) => setTipoVivo(e.target.value as TipoVivo)} className={selectCls}>
              <option value="todos">Todos los tipos</option>
              {VIVOS_ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
            </select>
          </div>
        )}
      </div>

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
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={Activity} label="Total egresos" value={kpis.total} color="text-slate-600 dark:text-slate-300" />
            <Kpi icon={Users} label="Vivos" value={kpis.vivos} color="text-blue-600 dark:text-blue-400" />
            <Kpi icon={HeartPulse} label="Fallecidos" value={kpis.fallecidos} color="text-rose-600 dark:text-rose-400" />
            <Kpi icon={CalendarClock} label="Estancia promedio" value={`${kpis.promedioEstancia} días`} color="text-emerald-600 dark:text-emerald-400" />
          </div>

          {filtrados.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
              <BarChart3 size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm text-slate-500">No hay egresos para los filtros seleccionados.</p>
            </div>
          ) : (
            <>
              {/* Tabulador servicio × tipo */}
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-4 pt-4 pb-3 font-heading">
                  Egresos por servicio y tipo
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                        <Th>Servicio</Th>
                        {estados.map((e) => <Th key={e} center>{ESTADO_LABEL[e]}</Th>)}
                        <Th center>Total</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {pivote.servicios.map((s) => (
                        <tr key={s} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{s}</td>
                          {estados.map((e) => (
                            <td key={e} className="px-4 py-2.5 text-center text-slate-600 dark:text-slate-400 tabular-nums">
                              {pivote.matriz.get(s)?.get(e) ?? 0}
                            </td>
                          ))}
                          <td className="px-4 py-2.5 text-center font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                            {pivote.totalPorServicio.get(s) ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-semibold">
                        <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100">Total</td>
                        {estados.map((e) => (
                          <td key={e} className="px-4 py-2.5 text-center text-slate-900 dark:text-slate-100 tabular-nums">
                            {pivote.totalPorTipo.get(e) ?? 0}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-center text-blue-600 dark:text-blue-400 tabular-nums">{kpis.total}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              {/* Resumen mensual */}
              {porMes.length > 1 && (
                <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-4 pt-4 pb-3 font-heading">
                    Egresos por mes
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                          <Th>Mes</Th>
                          <Th center>Vivos</Th>
                          <Th center>Fallecidos</Th>
                          <Th center>Total</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {porMes.map(([mes, v]) => (
                          <tr key={mes} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200 tabular-nums">{mes}</td>
                            <td className="px-4 py-2.5 text-center text-blue-600 dark:text-blue-400 tabular-nums">{v.vivos}</td>
                            <td className="px-4 py-2.5 text-center text-rose-600 dark:text-rose-400 tabular-nums">{v.fallecidos}</td>
                            <td className="px-4 py-2.5 text-center font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{v.vivos + v.fallecidos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, color }: {
  icon: typeof Activity; label: string; value: string | number; color: string;
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
