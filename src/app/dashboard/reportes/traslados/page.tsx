"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, query, where, orderBy, getDocs, Timestamp,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import {
  ArrowRightLeft, Download, AlertTriangle, ClipboardList, CheckCircle2, XCircle, Clock3, Search,
} from "lucide-react";
import type { EstadoTraslado, SolicitudTraslado } from "@/types";
import { formatFechaHora, toDate } from "@/lib/pacientes/helpers";

const ESTADOS: EstadoTraslado[] = ["pendiente", "en_revision", "aprobado", "rechazado"];

const ESTADO_TRASLADO_LABEL: Record<EstadoTraslado, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

const TIPO_TRASLADO_LABEL: Record<string, string> = {
  servicio_cama: "Servicio a Servicio",
  interno: "Interno",
  intercambio: "Intercambio de camas",
};

type FiltroEstado = EstadoTraslado | "todos";
type FiltroTipo = "todos" | "servicio_cama" | "interno" | "intercambio";

const tipoLabel = (t?: string) => (t && TIPO_TRASLADO_LABEL[t]) || "Traslado";
// El traslado interno se mueve dentro del mismo servicio (no guarda servicioDestino).
const servicioDestino = (t: SolicitudTraslado) =>
  t.tipoTraslado === "interno" ? t.servicioOrigen : t.servicioDestino ?? "";

const pad = (n: number) => String(n).padStart(2, "0");
const toInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const selectCls =
  "px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 shadow-sm cursor-pointer";

export default function ReporteTrasladosPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const esEsdomed = profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";

  useEffect(() => {
    if (!authLoading && profile && !esEsdomed) router.replace("/dashboard");
  }, [authLoading, profile, esEsdomed, router]);

  // ── Filtros ──
  const hoy = useMemo(() => new Date(), []);
  const [fechaDesde, setFechaDesde] = useState(() => toInput(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [fechaHasta, setFechaHasta] = useState(() => toInput(hoy));
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [servicioFiltro, setServicioFiltro] = useState("");

  // ── Datos ──
  // null = aún no se consulta. NO se lee Firestore al montar ni al cambiar fechas:
  // una sola lectura (getDocs) al presionar "Generar reporte". Los demás filtros
  // (estado/tipo/servicio) operan en memoria sobre lo ya cargado, sin relecturas.
  const [traslados, setTraslados] = useState<SolicitudTraslado[] | null>(null);
  // Rango efectivamente consultado — el Excel y los avisos usan este, no el de los inputs.
  const [rangoConsultado, setRangoConsultado] = useState<{ desde: string; hasta: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  // Consulta bajo demanda (rango y orden sobre creadoEn → sin índice compuesto).
  const generarReporte = async () => {
    if (!fechaDesde || !fechaHasta || cargando) return;
    setCargando(true);
    setError(null);
    try {
      const desde = new Date(fechaDesde + "T00:00:00");
      const hasta = new Date(fechaHasta + "T23:59:59");
      const q = query(
        collection(db, "traslados"),
        where("creadoEn", ">=", Timestamp.fromDate(desde)),
        where("creadoEn", "<=", Timestamp.fromDate(hasta)),
        orderBy("creadoEn", "desc"),
      );
      const snap = await getDocs(q);
      setTraslados(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SolicitudTraslado)));
      setRangoConsultado({ desde: fechaDesde, hasta: fechaHasta });
      setServicioFiltro("");
    } catch (e) {
      setError(`No se pudo cargar el reporte: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setCargando(false);
    }
  };

  const rangoDesactualizado =
    rangoConsultado !== null &&
    (rangoConsultado.desde !== fechaDesde || rangoConsultado.hasta !== fechaHasta);

  // Servicios de origen disponibles en el set cargado (para el filtro)
  const serviciosDisponibles = useMemo(() => {
    const set = new Set<string>();
    (traslados ?? []).forEach((t) => t.servicioOrigen && set.add(t.servicioOrigen));
    return Array.from(set).sort();
  }, [traslados]);

  const filtrados = useMemo(() => (
    (traslados ?? []).filter((t) => {
      if (filtroEstado !== "todos" && t.estado !== filtroEstado) return false;
      if (filtroTipo !== "todos" && t.tipoTraslado !== filtroTipo) return false;
      if (servicioFiltro && t.servicioOrigen !== servicioFiltro) return false;
      return true;
    })
  ), [traslados, filtroEstado, filtroTipo, servicioFiltro]);

  // ── KPIs ──
  const kpis = useMemo(() => ({
    total: filtrados.length,
    aprobados: filtrados.filter((t) => t.estado === "aprobado").length,
    rechazados: filtrados.filter((t) => t.estado === "rechazado").length,
    enTramite: filtrados.filter((t) => t.estado === "pendiente" || t.estado === "en_revision").length,
  }), [filtrados]);

  // ── Pivote Servicio origen × Estado ──
  const pivote = useMemo(() => {
    const servicios = Array.from(new Set(filtrados.map((t) => t.servicioOrigen || "—"))).sort();
    const matriz = new Map<string, Map<EstadoTraslado, number>>();
    const totalPorEstado = new Map<EstadoTraslado, number>();
    const totalPorServicio = new Map<string, number>();
    for (const t of filtrados) {
      const s = t.servicioOrigen || "—";
      if (!matriz.has(s)) matriz.set(s, new Map());
      const fila = matriz.get(s)!;
      fila.set(t.estado, (fila.get(t.estado) ?? 0) + 1);
      totalPorEstado.set(t.estado, (totalPorEstado.get(t.estado) ?? 0) + 1);
      totalPorServicio.set(s, (totalPorServicio.get(s) ?? 0) + 1);
    }
    return { servicios, matriz, totalPorEstado, totalPorServicio };
  }, [filtrados]);

  // ── Conteo por tipo de traslado ──
  const porTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of filtrados) {
      const k = tipoLabel(t.tipoTraslado);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filtrados]);

  const exportarExcel = async () => {
    if (!rangoConsultado) return;
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // Hoja Detalle — una fila por solicitud de traslado
      const detalle = filtrados.map((t) => ({
        "Fecha solicitud": formatFechaHora(toDate(t.creadoEn)),
        Expediente: t.pacienteExpediente,
        Paciente: t.pacienteNombre ?? "",
        "Expediente B": t.pacienteBExpediente ?? "",
        "Paciente B": t.pacienteBNombre ?? "",
        Tipo: tipoLabel(t.tipoTraslado),
        "Servicio origen": t.servicioOrigen,
        "Cama origen": t.camaOrigen,
        "Servicio destino": servicioDestino(t),
        "Cama destino": t.camaDestino,
        Motivo: t.motivoTraslado,
        Estado: ESTADO_TRASLADO_LABEL[t.estado],
        "Médico solicitante": t.medicoNombre,
        JVPM: t.medicoJvpm ?? "",
        "Servicio del médico": t.medicoServicio,
        "Revisado por": t.revisadoPorNombre ?? "",
        "Última actualización": t.revisadoPorNombre ? formatFechaHora(toDate(t.actualizadoEn)) : "",
        "Notas ESDOMED": t.notasEsdomed ?? "",
      }));
      const wsDetalle = XLSX.utils.json_to_sheet(detalle);
      wsDetalle["!cols"] = [
        { wch: 16 }, { wch: 10 }, { wch: 28 }, { wch: 10 }, { wch: 28 }, { wch: 18 },
        { wch: 22 }, { wch: 10 }, { wch: 22 }, { wch: 10 }, { wch: 34 }, { wch: 11 },
        { wch: 26 }, { wch: 8 }, { wch: 22 }, { wch: 24 }, { wch: 16 }, { wch: 34 },
      ];
      XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle");

      // Hoja Resumen — servicio origen × estado + conteo por tipo
      const aoa: (string | number)[][] = [
        [`Traslados de cama solicitados del ${rangoConsultado.desde} al ${rangoConsultado.hasta}`],
        [`Total: ${kpis.total}`, `Aprobados: ${kpis.aprobados}`, `Rechazados: ${kpis.rechazados}`, `En trámite: ${kpis.enTramite}`],
        [],
        ["Servicio origen", ...ESTADOS.map((e) => ESTADO_TRASLADO_LABEL[e]), "Total"],
      ];
      pivote.servicios.forEach((s) => {
        aoa.push([
          s,
          ...ESTADOS.map((e) => pivote.matriz.get(s)?.get(e) ?? 0),
          pivote.totalPorServicio.get(s) ?? 0,
        ]);
      });
      aoa.push(["Total", ...ESTADOS.map((e) => pivote.totalPorEstado.get(e) ?? 0), kpis.total]);
      aoa.push([]);
      aoa.push(["Por tipo de traslado"]);
      porTipo.forEach(([tipo, n]) => aoa.push([tipo, n]));
      const wsResumen = XLSX.utils.aoa_to_sheet(aoa);
      wsResumen["!cols"] = [{ wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

      XLSX.writeFile(wb, `traslados_${rangoConsultado.desde}_a_${rangoConsultado.hasta}.xlsx`);
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
            <ArrowRightLeft size={17} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Reporte de traslados de cama</h1>
            <p className="text-xs text-slate-500">Solicitudes de traslado por fecha, servicio, tipo y estado</p>
          </div>
        </div>
        <button
          onClick={exportarExcel}
          disabled={exportando || cargando || rangoConsultado === null || filtrados.length === 0}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
        >
          <Download size={15} />
          {exportando ? "Generando..." : "Exportar a Excel"}
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Solicitud desde</span>
          <DateField value={fechaDesde} onChange={setFechaDesde} placeholder="Solicitud desde" ariaLabel="Solicitud desde" clearable />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Hasta</span>
          <DateField value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" ariaLabel="Solicitud hasta" clearable />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Estado</span>
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
            {([{ v: "todos", l: "Todos" }, ...ESTADOS.map((e) => ({ v: e, l: ESTADO_TRASLADO_LABEL[e] }))] as { v: FiltroEstado; l: string }[]).map((c) => (
              <button
                key={c.v}
                onClick={() => setFiltroEstado(c.v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filtroEstado === c.v
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
          <span className="text-[11px] text-slate-500">Tipo</span>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as FiltroTipo)} className={selectCls}>
            <option value="todos">Todos los tipos</option>
            <option value="servicio_cama">Servicio a Servicio</option>
            <option value="interno">Interno</option>
            <option value="intercambio">Intercambio de camas</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Servicio origen</span>
          <select value={servicioFiltro} onChange={(e) => setServicioFiltro(e.target.value)} className={selectCls}>
            <option value="">Todos los servicios</option>
            {serviciosDisponibles.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <button
          onClick={generarReporte}
          disabled={cargando || !fechaDesde || !fechaHasta}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          <Search size={14} />
          {cargando ? "Consultando..." : rangoConsultado ? "Actualizar reporte" : "Generar reporte"}
        </button>
      </div>

      {rangoDesactualizado && !cargando && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-700 dark:text-amber-400">
          Cambiaste el rango de fechas. Los datos mostrados corresponden del {rangoConsultado!.desde} al {rangoConsultado!.hasta}; presiona &quot;Actualizar reporte&quot; para consultarlo.
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
      ) : traslados === null ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <Search size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">Selecciona un rango de fechas y presiona &quot;Generar reporte&quot;.</p>
          <p className="text-xs text-slate-400 mt-1">No se consulta la base de datos hasta que lo pidas.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={ClipboardList} label="Total solicitudes" value={kpis.total} color="text-slate-600 dark:text-slate-300" />
            <Kpi icon={CheckCircle2} label="Aprobados" value={kpis.aprobados} color="text-blue-600 dark:text-blue-400" />
            <Kpi icon={XCircle} label="Rechazados" value={kpis.rechazados} color="text-rose-600 dark:text-rose-400" />
            <Kpi icon={Clock3} label="En trámite" value={kpis.enTramite} color="text-amber-600 dark:text-amber-400" />
          </div>

          {filtrados.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
              <ArrowRightLeft size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm text-slate-500">No hay traslados para los filtros seleccionados.</p>
            </div>
          ) : (
            <>
              {/* Tabulador servicio origen × estado */}
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-4 pt-4 pb-3 font-heading">
                  Traslados por servicio origen y estado
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                        <Th>Servicio origen</Th>
                        {ESTADOS.map((e) => <Th key={e} center>{ESTADO_TRASLADO_LABEL[e]}</Th>)}
                        <Th center>Total</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {pivote.servicios.map((s) => (
                        <tr key={s} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{s}</td>
                          {ESTADOS.map((e) => (
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
                        {ESTADOS.map((e) => (
                          <td key={e} className="px-4 py-2.5 text-center text-slate-900 dark:text-slate-100 tabular-nums">
                            {pivote.totalPorEstado.get(e) ?? 0}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-center text-blue-600 dark:text-blue-400 tabular-nums">{kpis.total}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              {/* Conteo por tipo de traslado */}
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-4 pt-4 pb-3 font-heading">
                  Por tipo de traslado
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                        <Th>Tipo</Th>
                        <Th center>Solicitudes</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {porTipo.map(([tipo, n]) => (
                        <tr key={tipo} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{tipo}</td>
                          <td className="px-4 py-2.5 text-center text-slate-600 dark:text-slate-400 tabular-nums">{n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, color }: {
  icon: typeof ClipboardList; label: string; value: string | number; color: string;
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
