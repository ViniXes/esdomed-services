"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Table2, Download, AlertTriangle, HeartPulse, LogOut, BedDouble, RefreshCw } from "lucide-react";
import type { EstadoPaciente, Genero, Paciente } from "@/types";
import { DateField } from "@/components/ui/DateField";
import { calcularEdad, diasEstancia, formatFecha, nombreCompleto, toDate, ESTADO_LABEL } from "@/lib/pacientes/helpers";

type Tab = "vivos" | "fallecidos" | "activos";

interface ColDef { key: string; label: string }
interface FilaPivote { servicio: string; cols: Record<string, number>; total: number }

// Modalidades de egreso vivo (cualquiera cuenta como "egreso vivo").
const MODALIDADES_VIVO: { key: EstadoPaciente; label: string }[] = [
  { key: "alta_vivo",       label: "Domicilio" },
  { key: "alta_voluntaria", label: "Voluntaria / Exigida" },
  { key: "referido",        label: "Traslado a otro hospital" },
  { key: "fuga",            label: "Fuga" },
  { key: "in_extremis",     label: "In extremis" },
];
const ESTADOS_VIVO = MODALIDADES_VIVO.map((m) => m.key);

const generoDe = (g?: Genero): "masculino" | "femenino" | "otro" =>
  g === "masculino" ? "masculino" : g === "femenino" ? "femenino" : "otro";

const sexoCols = (items: Paciente[]): ColDef[] => {
  const base: ColDef[] = [{ key: "masculino", label: "Masculino" }, { key: "femenino", label: "Femenino" }];
  return items.some((p) => generoDe(p.genero) === "otro") ? [...base, { key: "otro", label: "Otro" }] : base;
};

function pivotar(items: Paciente[], columnas: ColDef[], clasificar: (p: Paciente) => string) {
  const filas = new Map<string, FilaPivote>();
  const totCols: Record<string, number> = {};
  columnas.forEach((c) => { totCols[c.key] = 0; });
  let totalGeneral = 0;
  for (const p of items) {
    const s = (p.servicioActual || "Sin servicio").trim();
    if (!filas.has(s)) {
      const cols: Record<string, number> = {};
      columnas.forEach((c) => { cols[c.key] = 0; });
      filas.set(s, { servicio: s, cols, total: 0 });
    }
    const f = filas.get(s)!;
    const k = clasificar(p);
    if (k in f.cols) { f.cols[k]++; totCols[k] = (totCols[k] ?? 0) + 1; }
    f.total++; totalGeneral++;
  }
  const lista = Array.from(filas.values()).sort((a, b) => b.total - a.total || a.servicio.localeCompare(b.servicio));
  return { filas: lista, totCols, totalGeneral };
}

const pad = (n: number) => String(n).padStart(2, "0");
const toInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const TABS: { value: Tab; label: string; icon: typeof LogOut }[] = [
  { value: "vivos",      label: "Egresos vivos",     icon: LogOut },
  { value: "fallecidos", label: "Egresos fallecidos", icon: HeartPulse },
  { value: "activos",    label: "Pacientes activos",  icon: BedDouble },
];

export default function TabuladoresPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const esEsdomed =
    profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";

  const hoy = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<Tab>("vivos");
  const [fechaDesde, setFechaDesde] = useState(() => toInput(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [fechaHasta, setFechaHasta] = useState(() => toInput(hoy));

  const [egresos, setEgresos] = useState<Paciente[]>([]);
  const [activos, setActivos] = useState<Paciente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const esActivos = tab === "activos";

  useEffect(() => {
    if (!authLoading && profile && !esEsdomed) router.replace("/dashboard");
  }, [authLoading, profile, esEsdomed, router]);

  // Egresos por rango de fecha (una sola lectura; recarga al cambiar fechas o con "Actualizar").
  const cargarEgresos = useCallback(async () => {
    if (!esEsdomed || !fechaDesde || !fechaHasta) return;
    setCargando(true);
    setError(null);
    try {
      const desde = new Date(fechaDesde + "T00:00:00");
      const hasta = new Date(fechaHasta + "T23:59:59");
      const snap = await getDocs(query(
        collection(db, "pacientes"),
        where("fechaEgreso", ">=", Timestamp.fromDate(desde)),
        where("fechaEgreso", "<=", Timestamp.fromDate(hasta)),
        orderBy("fechaEgreso", "desc"),
      ));
      setEgresos(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id, ...data,
          fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
          fechaEgreso: toDate(data.fechaEgreso),
          fechaNacimiento: toDate(data.fechaNacimiento),
        } as Paciente;
      }));
    } catch (e) {
      setError(`No se pudo cargar el reporte: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setCargando(false);
    }
  }, [esEsdomed, fechaDesde, fechaHasta]);

  // Pacientes activos (una sola lectura, no en vivo — es un reporte).
  const cargarActivos = useCallback(async () => {
    if (!esEsdomed) return;
    try {
      const snap = await getDocs(query(collection(db, "pacientes"), where("estado", "==", "activo")));
      setActivos(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id, ...data,
          fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
          fechaNacimiento: toDate(data.fechaNacimiento),
        } as Paciente;
      }));
    } catch (e) {
      setError(`No se pudo cargar activos: ${e instanceof Error ? e.message : "error"}`);
    }
  }, [esEsdomed]);

  useEffect(() => {
    const t = setTimeout(() => { cargarEgresos(); }, 0);
    return () => clearTimeout(t);
  }, [cargarEgresos]);
  useEffect(() => {
    const t = setTimeout(() => { cargarActivos(); }, 0);
    return () => clearTimeout(t);
  }, [cargarActivos]);

  // Filtro de detalle por servicio (se setea al hacer clic en una fila del tabulador).
  const [servicioFiltro, setServicioFiltro] = useState("");
  const resetKey = `${tab}|${fechaDesde}|${fechaHasta}`;
  const [resetKeyPrev, setResetKeyPrev] = useState(resetKey);
  if (resetKeyPrev !== resetKey) { setResetKeyPrev(resetKey); setServicioFiltro(""); }

  // Pivote + lista de pacientes (items) según la pestaña activa.
  const { items, columnas, pivote, titulo } = useMemo(() => {
    if (tab === "vivos") {
      const items = egresos.filter((p) => ESTADOS_VIVO.includes(p.estado));
      const columnas: ColDef[] = MODALIDADES_VIVO.map((m) => ({ key: m.key, label: m.label }));
      return { items, columnas, pivote: pivotar(items, columnas, (p) => p.estado), titulo: "Egresos vivos por servicio y modalidad" };
    }
    if (tab === "fallecidos") {
      const items = egresos.filter((p) => p.estado === "alta_fallecido");
      const columnas = sexoCols(items);
      return { items, columnas, pivote: pivotar(items, columnas, (p) => generoDe(p.genero)), titulo: "Egresos fallecidos por servicio y sexo" };
    }
    const columnas = sexoCols(activos);
    return { items: activos, columnas, pivote: pivotar(activos, columnas, (p) => generoDe(p.genero)), titulo: "Pacientes activos por servicio y sexo" };
  }, [tab, egresos, activos]);

  const detalle = useMemo(() => {
    const lista = servicioFiltro
      ? items.filter((p) => (p.servicioActual || "Sin servicio").trim() === servicioFiltro)
      : items;
    const fechaOrden = (p: Paciente) => (esActivos ? p.fechaIngreso : p.fechaEgreso ?? p.fechaIngreso);
    return [...lista].sort((a, b) => (fechaOrden(b)?.getTime() ?? 0) - (fechaOrden(a)?.getTime() ?? 0));
  }, [items, servicioFiltro, esActivos]);

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const rango = esActivos ? `Al ${new Date().toLocaleString("es-SV", { hour12: false })}` : `Del ${fechaDesde} al ${fechaHasta}`;
      const aoa: (string | number)[][] = [
        [titulo],
        [rango],
        [],
        ["Servicio", ...columnas.map((c) => c.label), "Total"],
      ];
      pivote.filas.forEach((f) => aoa.push([f.servicio, ...columnas.map((c) => f.cols[c.key] ?? 0), f.total]));
      aoa.push(["Total", ...columnas.map((c) => pivote.totCols[c.key] ?? 0), pivote.totalGeneral]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Resumen");

      // Hoja Detalle — un renglón por paciente (los que generan los números).
      const detalleRows = items.map((p) => {
        const edad = calcularEdad(p.fechaNacimiento);
        const estancia = esActivos
          ? diasEstancia(p.fechaIngreso)
          : (p.diasEstancia ?? (p.fechaEgreso ? diasEstancia(p.fechaIngreso, p.fechaEgreso) : ""));
        const fila: Record<string, string | number> = {
          Expediente: p.expediente,
          Paciente: nombreCompleto(p),
          Sexo: p.genero === "masculino" ? "M" : p.genero === "femenino" ? "F" : "O",
          Edad: edad ?? "",
          Servicio: p.servicioActual ?? "",
          Cama: p.camaActual ?? "",
          "Fecha de ingreso": p.fechaIngreso ? formatFecha(p.fechaIngreso) : "",
        };
        if (!esActivos) {
          fila["Fecha de egreso"] = p.fechaEgreso ? formatFecha(p.fechaEgreso) : "";
          fila["Tipo de alta"] = ESTADO_LABEL[p.estado];
          fila["Diagnóstico de egreso"] = p.diagnosticoEgreso?.descripcion ?? "";
          fila["Médico de egreso"] = p.medicoEgresoNombre ?? "";
        }
        fila["Estancia (días)"] = estancia;
        return fila;
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalleRows), "Detalle");

      const nombre = esActivos ? "activos_por_servicio" : `${tab}_${fechaDesde}_a_${fechaHasta}`;
      XLSX.writeFile(wb, `${nombre}.xlsx`);
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

  const cargandoVista = !esActivos && cargando;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-950 rounded-xl flex items-center justify-center border border-indigo-200 dark:border-indigo-900">
            <Table2 size={17} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Tabuladores</h1>
            <p className="text-xs text-slate-500">Egresos vivos, fallecidos y pacientes activos por servicio</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => (esActivos ? cargarActivos() : cargarEgresos())}
            disabled={cargandoVista}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Actualizar"
          >
            <RefreshCw size={15} className={cargandoVista ? "animate-spin" : ""} />
            Actualizar
          </button>
          <button
            onClick={exportarExcel}
            disabled={exportando || cargandoVista || pivote.filas.length === 0}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            <Download size={15} />
            {exportando ? "Generando..." : "Exportar a Excel"}
          </button>
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Rango de fecha (solo egresos) */}
      {!esActivos && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Egreso desde</span>
            <DateField value={fechaDesde} onChange={setFechaDesde} placeholder="Desde" ariaLabel="Egreso desde" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Hasta</span>
            <DateField value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" ariaLabel="Egreso hasta" />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {cargandoVista ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{pivote.totalGeneral}</p>
            <p className="text-sm text-slate-500 leading-tight">
              {tab === "vivos" ? "egresos vivos" : tab === "fallecidos" ? "egresos fallecidos" : "pacientes activos"}
              <br />
              <span className="text-xs">en {pivote.filas.length} servicio{pivote.filas.length === 1 ? "" : "s"}</span>
            </p>
          </div>

          {pivote.filas.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
              <Table2 size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm text-slate-500">
                {esActivos ? "No hay pacientes ingresados actualmente." : "No hay egresos para el rango seleccionado."}
              </p>
            </div>
          ) : (
            <>
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-4 pt-4 pb-3 font-heading">
                {titulo}
                <span className="ml-2 font-normal text-slate-400">· toca un servicio para ver su detalle</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                      <Th>Servicio</Th>
                      {columnas.map((c) => <Th key={c.key} center>{c.label}</Th>)}
                      <Th center>Total</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pivote.filas.map((f) => (
                      <tr
                        key={f.servicio}
                        onClick={() => setServicioFiltro((s) => (s === f.servicio ? "" : f.servicio))}
                        className={`cursor-pointer transition-colors ${
                          servicioFiltro === f.servicio ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{f.servicio}</td>
                        {columnas.map((c) => (
                          <td key={c.key} className="px-4 py-2.5 text-center text-slate-600 dark:text-slate-400 tabular-nums">{f.cols[c.key] ?? 0}</td>
                        ))}
                        <td className="px-4 py-2.5 text-center font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{f.total}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-semibold">
                      <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100">Total</td>
                      {columnas.map((c) => (
                        <td key={c.key} className="px-4 py-2.5 text-center text-slate-900 dark:text-slate-100 tabular-nums">{pivote.totCols[c.key] ?? 0}</td>
                      ))}
                      <td className="px-4 py-2.5 text-center text-blue-600 dark:text-blue-400 tabular-nums">{pivote.totalGeneral}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {/* Detalle: los pacientes que generan los números */}
            <DetalleTabla
              items={detalle}
              esActivos={esActivos}
              servicioFiltro={servicioFiltro}
              totalItems={items.length}
              onClear={() => setServicioFiltro("")}
            />
            </>
          )}
        </>
      )}
    </div>
  );
}

function DetalleTabla({
  items, esActivos, servicioFiltro, totalItems, onClear,
}: {
  items: Paciente[];
  esActivos: boolean;
  servicioFiltro: string;
  totalItems: number;
  onClear: () => void;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">
          Detalle de pacientes
          <span className="ml-2 font-normal text-slate-400">
            {servicioFiltro ? `· ${servicioFiltro}` : "· todos los servicios"} ({items.length}{!servicioFiltro && items.length !== totalItems ? ` de ${totalItems}` : ""})
          </span>
        </h3>
        {servicioFiltro && (
          <button onClick={onClear} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500">
            Ver todos
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <Th>Expediente</Th>
              <Th>Paciente</Th>
              <Th>Servicio / Cama</Th>
              <Th>{esActivos ? "Ingreso" : "Egreso"}</Th>
              <Th center>Estancia</Th>
              {!esActivos && <Th>Tipo de alta</Th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((p) => {
              const edad = calcularEdad(p.fechaNacimiento);
              const dias = esActivos
                ? diasEstancia(p.fechaIngreso)
                : (p.diasEstancia ?? (p.fechaEgreso ? diasEstancia(p.fechaIngreso, p.fechaEgreso) : null));
              return (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 font-mono text-slate-700 dark:text-slate-300">{p.expediente}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{nombreCompleto(p)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {edad !== null ? `${edad} años` : "—"}
                      {p.genero && <> · {p.genero === "masculino" ? "M" : p.genero === "femenino" ? "F" : "O"}</>}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-slate-700 dark:text-slate-300">{p.servicioActual}</p>
                    {p.camaActual && <p className="text-xs text-slate-500 mt-0.5">Cama {p.camaActual}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
                    {formatFecha(esActivos ? p.fechaIngreso : p.fechaEgreso)}
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-600 dark:text-slate-400 text-xs">
                    {dias !== null ? `${dias} ${dias === 1 ? "día" : "días"}` : "—"}
                  </td>
                  {!esActivos && (
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-slate-600 dark:text-slate-300">{ESTADO_LABEL[p.estado]}</span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${center ? "text-center" : "text-left"}`}>
      {children}
    </th>
  );
}
