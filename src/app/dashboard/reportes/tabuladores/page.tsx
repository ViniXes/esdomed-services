"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, query, where, orderBy, limit, startAfter, getDocs, getCountFromServer, Timestamp,
  type Query, type QueryDocumentSnapshot, type QuerySnapshot,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Table2, Download, AlertTriangle, HeartPulse, LogIn, LogOut, BedDouble, RefreshCw, FileText,
  Database, CheckCircle2, ArrowUpRight,
} from "lucide-react";
import type { EstadoPaciente, Paciente } from "@/types";
import { DateField } from "@/components/ui/DateField";
import TabuladoresPdf from "@/components/reportes/TabuladoresPdf";
import { calcularEdad, diasEstancia, formatFecha, nombreCompleto, toDate, ESTADO_LABEL } from "@/lib/pacientes/helpers";
import { mismoServicio } from "@/lib/servicios";
import { describirError, type ErrorConsulta } from "@/lib/firestoreErrores";
import {
  ESTADOS_VIVO, MODALIDADES_VIVO, generoDe, pivotar, servicioDe, sexoCols, type ColDef,
} from "@/lib/reportes/tabuladores";

type Tab = "vivos" | "fallecidos" | "activos" | "ingresos";
/** Pestañas que dependen del rango de fechas (activos es "al momento"). */
type TabRango = Exclude<Tab, "activos">;
const TABS_RANGO: TabRango[] = ["vivos", "fallecidos", "ingresos"];

const LOTE = 500; // pacientes por lectura al generar el detalle (sin tope total)

const inicioDia = (f: string) => Timestamp.fromDate(new Date(f + "T00:00:00"));
const finDia = (f: string) => Timestamp.fromDate(new Date(f + "T23:59:59.999"));

/** Consulta de cada pestaña; el conteo y el detalle usan la MISMA. Vivos y
 *  fallecidos filtran por estado + rango de `fechaEgreso` con orden DESC para
 *  aprovechar el índice (estado ASC, fechaEgreso DESC) que ya existe; ingresados
 *  y activos se resuelven con índices de un solo campo. */
function consultaTab(tab: Tab, desde: string, hasta: string): Query {
  const pacientes = collection(db, "pacientes");
  if (tab === "activos") return query(pacientes, where("estado", "==", "activo"));
  const campo = tab === "ingresos" ? "fechaIngreso" : "fechaEgreso";
  const porEstado =
    tab === "vivos" ? [where("estado", "in", ESTADOS_VIVO)]
    : tab === "fallecidos" ? [where("estado", "==", "alta_fallecido")]
    : [];
  return query(
    pacientes,
    ...porEstado,
    where(campo, ">=", inicioDia(desde)),
    where(campo, "<=", finDia(hasta)),
    orderBy(campo, "desc"),
  );
}

/** Egresos vivos de una sola modalidad: el desglose se cuenta sin leer pacientes. */
const consultaModalidad = (estado: EstadoPaciente, desde: string, hasta: string) => query(
  collection(db, "pacientes"),
  where("estado", "==", estado),
  where("fechaEgreso", ">=", inicioDia(desde)),
  where("fechaEgreso", "<=", finDia(hasta)),
  orderBy("fechaEgreso", "desc"),
);

const contarN = (q: Query) => getCountFromServer(q).then((s) => s.data().count);

function aPaciente(d: QueryDocumentSnapshot): Paciente {
  const data = d.data();
  return {
    id: d.id, ...data,
    fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
    fechaEgreso: toDate(data.fechaEgreso),
    fechaNacimiento: toDate(data.fechaNacimiento),
  } as Paciente;
}

/** Lee todos los pacientes de la pestaña en lotes con cursor (sin tope). */
async function leerTab(tab: Tab, desde: string, hasta: string, onProgreso: (leidos: number) => void): Promise<Paciente[]> {
  const lista: Paciente[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  for (;;) {
    const snap: QuerySnapshot = await getDocs(query(
      consultaTab(tab, desde, hasta),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(LOTE),
    ));
    snap.docs.forEach((d) => lista.push(aPaciente(d)));
    onProgreso(lista.length);
    if (snap.docs.length < LOTE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return lista;
}

const modalidadesDe = (lista: Paciente[]) => {
  const m: Partial<Record<EstadoPaciente, number>> = {};
  lista.forEach((p) => { m[p.estado] = (m[p.estado] ?? 0) + 1; });
  return m;
};

// Caché por sesión SPA, una entrada por pestaña + rango (activos: una sola, no
// depende del rango): el conteo y, si ya se generó, el detalle. Volver a un
// rango o pestaña ya vista no relee nada.
interface CacheTab {
  conteo?: number;
  detalle?: Paciente[];
  /** Solo vivos: conteo por modalidad de egreso. */
  modalidades?: Partial<Record<EstadoPaciente, number>>;
}
const cacheTabs = new Map<string, CacheTab>();
const claveCache = (tab: Tab, desde: string, hasta: string) =>
  tab === "activos" ? "activos" : `${tab}|${desde}|${hasta}`;

const pad = (n: number) => String(n).padStart(2, "0");
const toInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtN = (n: number) => n.toLocaleString("es-SV");

const TABS: { value: Tab; label: string; icon: typeof LogOut; color: string; unidad: string }[] = [
  { value: "vivos",      label: "Egresos vivos",      icon: LogOut,     color: "text-emerald-600 dark:text-emerald-400", unidad: "egresos vivos" },
  { value: "fallecidos", label: "Egresos fallecidos", icon: HeartPulse, color: "text-rose-600 dark:text-rose-400",       unidad: "egresos fallecidos" },
  { value: "activos",    label: "Pacientes activos",  icon: BedDouble,  color: "text-blue-600 dark:text-blue-400",       unidad: "pacientes activos" },
  { value: "ingresos",   label: "Ingresados",         icon: LogIn,      color: "text-cyan-600 dark:text-cyan-400",       unidad: "pacientes ingresados" },
];

export default function TabuladoresPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const esEsdomed =
    profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";

  const hoy = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<Tab>("vivos");
  // Por defecto se consulta solo el día actual (desde = hasta = hoy).
  const [fechaDesde, setFechaDesde] = useState(() => toInput(hoy));
  const [fechaHasta, setFechaHasta] = useState(() => toInput(hoy));
  const rangoValido = !!fechaDesde && !!fechaHasta && fechaDesde <= fechaHasta;

  const [cache, setCache] = useState<Record<string, CacheTab>>(() => Object.fromEntries(cacheTabs));
  const [contando, setContando] = useState(0); // conteos en curso
  const [extrayendo, setExtrayendo] = useState<{ tab: Tab; leidos: number } | null>(null);
  const [error, setError] = useState<ErrorConsulta | null>(null);
  const [exportando, setExportando] = useState(false);
  const [preparandoPdf, setPreparandoPdf] = useState(false);
  const [pdf, setPdf] = useState<{ desde: string; hasta: string; vivos: Paciente[]; fallecidos: Paciente[]; ingresados: Paciente[] } | null>(null);
  const ocupado = extrayendo !== null || preparandoPdf;

  const esActivos = tab === "activos";
  const esIngresos = tab === "ingresos";

  useEffect(() => {
    if (!authLoading && profile && !esEsdomed) router.replace("/dashboard");
  }, [authLoading, profile, esEsdomed, router]);

  const entrada = (t: Tab): CacheTab => cache[claveCache(t, fechaDesde, fechaHasta)] ?? {};
  const actual = entrada(tab);

  // Guarda en la caché de sesión y en el estado (re-render).
  const guardar = useCallback((clave: string, cambio: (prev: CacheTab) => CacheTab) => {
    cacheTabs.set(clave, cambio(cacheTabs.get(clave) ?? {}));
    setCache(Object.fromEntries(cacheTabs));
  }, []);

  // ── Paso 1: contar en el servidor (~1 lectura por cada 1,000), sin leer pacientes.
  //    El detalle ya generado sigue valiendo solo si su conteo no cambió. ──
  const contar = useCallback(async (tabs: Tab[], desde: string, hasta: string) => {
    setContando((n) => n + 1);
    setError(null);
    try {
      await Promise.all(tabs.map(async (t) => {
        const clave = claveCache(t, desde, hasta);
        if (t === "vivos") {
          const valores = await Promise.all(ESTADOS_VIVO.map((e) => contarN(consultaModalidad(e, desde, hasta))));
          const modalidades: Partial<Record<EstadoPaciente, number>> = {};
          ESTADOS_VIVO.forEach((e, i) => { modalidades[e] = valores[i]; });
          const conteo = valores.reduce((s, v) => s + v, 0);
          guardar(clave, (prev) => ({ conteo, modalidades, detalle: prev.conteo === conteo ? prev.detalle : undefined }));
        } else {
          const conteo = await contarN(consultaTab(t, desde, hasta));
          guardar(clave, (prev) => ({ ...prev, conteo, detalle: prev.conteo === conteo ? prev.detalle : undefined }));
        }
      }));
    } catch (e) {
      setError(describirError(e));
    } finally {
      setContando((n) => n - 1);
    }
  }, [guardar]);

  // Conteo automático del rango (es casi gratis). La espera evita contar los
  // rangos intermedios: el calendario cambia "desde" y "hasta" por separado.
  const faltanConteos = rangoValido && TABS_RANGO.some((t) => entrada(t).conteo === undefined);
  useEffect(() => {
    if (!esEsdomed || !faltanConteos) return;
    const t = setTimeout(() => { contar(TABS_RANGO, fechaDesde, fechaHasta); }, 500);
    return () => clearTimeout(t);
  }, [esEsdomed, faltanConteos, fechaDesde, fechaHasta, contar]);

  const faltaActivos = entrada("activos").conteo === undefined;
  useEffect(() => {
    if (!esEsdomed || !faltaActivos) return;
    const t = setTimeout(() => { contar(["activos"], "", ""); }, 0);
    return () => clearTimeout(t);
  }, [esEsdomed, faltaActivos, contar]);

  // ── Paso 2: generar el detalle de UNA pestaña (1 lectura por paciente). De él
  //    salen el tabulador por servicio, la lista y el Excel. ──
  const generarDetalle = useCallback(async (t: Tab, desde: string, hasta: string): Promise<Paciente[]> => {
    setExtrayendo({ tab: t, leidos: 0 });
    try {
      const lista = await leerTab(t, desde, hasta, (leidos) => setExtrayendo({ tab: t, leidos }));
      guardar(claveCache(t, desde, hasta), (prev) => ({
        ...prev,
        conteo: lista.length,
        detalle: lista,
        ...(t === "vivos" ? { modalidades: modalidadesDe(lista) } : {}),
      }));
      return lista;
    } finally {
      setExtrayendo(null);
    }
  }, [guardar]);

  const pedirDetalle = async () => {
    setError(null);
    try {
      await generarDetalle(tab, fechaDesde, fechaHasta);
    } catch (e) {
      setError(describirError(e));
    }
  };

  // Recuenta todo y vuelve a leer el detalle que está en pantalla: con el mismo
  // total pueden haber cambiado los pacientes (un ingreso y un egreso se compensan).
  const actualizar = async () => {
    const desde = fechaDesde;
    const hasta = fechaHasta;
    const teniaDetalle = !!actual.detalle;
    await contar(rangoValido ? [...TABS_RANGO, "activos"] : ["activos"], desde, hasta);
    if (teniaDetalle && (esActivos || rangoValido)) {
      try {
        await generarDetalle(tab, desde, hasta);
      } catch (e) {
        setError(describirError(e));
      }
    }
  };

  // Filtro de detalle por servicio (se setea al hacer clic en una fila del tabulador).
  const [servicioFiltro, setServicioFiltro] = useState("");
  const resetKey = `${tab}|${fechaDesde}|${fechaHasta}`;
  const [resetKeyPrev, setResetKeyPrev] = useState(resetKey);
  if (resetKeyPrev !== resetKey) { setResetKeyPrev(resetKey); setServicioFiltro(""); }

  // Pivote + lista de pacientes (items) de la pestaña activa; vacíos hasta generar el detalle.
  const detalleCargado = cache[claveCache(tab, fechaDesde, fechaHasta)]?.detalle;
  const { items, columnas, pivote, titulo } = useMemo(() => {
    const items = detalleCargado ?? [];
    if (tab === "vivos") {
      const columnas: ColDef[] = MODALIDADES_VIVO.map((m) => ({ key: m.key, label: m.label }));
      return { items, columnas, pivote: pivotar(items, columnas, (p) => p.estado), titulo: "Egresos vivos por servicio y modalidad" };
    }
    const columnas = sexoCols(items);
    const pivote = pivotar(items, columnas, (p) => generoDe(p.genero));
    const titulo =
      tab === "fallecidos" ? "Egresos fallecidos por servicio y sexo"
      : tab === "ingresos" ? "Ingresados por servicio y sexo (todos los estados)"
      : "Pacientes activos por servicio y sexo";
    return { items, columnas, pivote, titulo };
  }, [tab, detalleCargado]);

  const detalle = useMemo(() => {
    const lista = servicioFiltro
      ? items.filter((p) => mismoServicio(servicioDe(p), servicioFiltro))
      : items;
    const fechaOrden = (p: Paciente) => (esActivos || esIngresos ? p.fechaIngreso : p.fechaEgreso ?? p.fechaIngreso);
    return [...lista].sort((a, b) => (fechaOrden(b)?.getTime() ?? 0) - (fechaOrden(a)?.getTime() ?? 0));
  }, [items, servicioFiltro, esActivos, esIngresos]);

  // Pacientes que el PDF tendría que leer (lo ya generado se reusa).
  const porLeerPdf = TABS_RANGO.reduce((s, t) => {
    const e = entrada(t);
    return s + (e.detalle ? 0 : e.conteo ?? 0);
  }, 0);

  // PDF de las 3 categorías con fecha (vivos, fallecidos, ingresados) para el
  // rango elegido. Reusa el detalle ya generado; solo lee lo que falte.
  const generarPdf = async () => {
    if (!rangoValido) return;
    const desde = fechaDesde;
    const hasta = fechaHasta;
    setPreparandoPdf(true);
    setError(null);
    try {
      const listas: Partial<Record<TabRango, Paciente[]>> = {};
      for (const t of TABS_RANGO) {
        listas[t] = cacheTabs.get(claveCache(t, desde, hasta))?.detalle ?? await generarDetalle(t, desde, hasta);
      }
      setPdf({ desde, hasta, vivos: listas.vivos ?? [], fallecidos: listas.fallecidos ?? [], ingresados: listas.ingresos ?? [] });
    } catch (e) {
      setError(describirError(e));
    } finally {
      setPreparandoPdf(false);
    }
  };

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
          : esIngresos
            ? (p.diasEstancia ?? diasEstancia(p.fechaIngreso, p.fechaEgreso))
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
        if (esIngresos) {
          fila["Estado"] = ESTADO_LABEL[p.estado];
          fila["Fecha de egreso"] = p.fechaEgreso ? formatFecha(p.fechaEgreso) : "";
        } else if (!esActivos) {
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
      setError({ mensaje: `No se pudo exportar: ${e instanceof Error ? e.message : "error"}` });
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

  const tabActual = TABS.find((t) => t.value === tab) ?? TABS[0];
  const nTab = actual.conteo ?? 0;
  const sinRango = !esActivos && !rangoValido;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
            <Table2 size={17} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Tabuladores</h1>
            <p className="text-xs text-slate-500">Totales al instante; el tabulador por servicio y el detalle, cuando los pidas</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={actualizar}
            disabled={ocupado || contando > 0}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            title={actual.detalle ? "Volver a contar y releer el detalle en pantalla" : "Volver a contar"}
          >
            <RefreshCw size={15} className={contando > 0 ? "animate-spin" : ""} />
            Actualizar
          </button>
          {!esActivos && (
            <button
              onClick={generarPdf}
              disabled={ocupado || !rangoValido}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
              title={`PDF tamaño carta: egresos vivos, egresos fallecidos e ingresados por servicio (Bienestar Magisterial y MINSAL)${
                porLeerPdf > 0 ? `. Leerá ${fmtN(porLeerPdf)} pacientes que aún no se han cargado.` : ""
              }`}
            >
              <FileText size={15} />
              {preparandoPdf ? "Preparando..." : "Generar PDF"}
              {!preparandoPdf && porLeerPdf > 0 && (
                <span className="font-normal opacity-80 tabular-nums">· lee {fmtN(porLeerPdf)}</span>
              )}
            </button>
          )}
          <button
            onClick={exportarExcel}
            disabled={exportando || ocupado || pivote.filas.length === 0}
            title={actual.detalle ? undefined : "Genera el tabulador para exportar"}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            <Download size={15} />
            {exportando ? "Generando..." : "Exportar a Excel"}
          </button>
        </div>
      </div>

      {/* Rango de fecha (egresos por fecha de egreso; ingresados por fecha de ingreso) */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0 w-12 sm:w-auto">Desde</span>
          <DateField value={fechaDesde} onChange={setFechaDesde} disabled={ocupado} placeholder="Desde" ariaLabel="Desde" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0 w-12 sm:w-auto">Hasta</span>
          <DateField value={fechaHasta} onChange={setFechaHasta} disabled={ocupado} placeholder="Hasta" ariaLabel="Hasta" />
        </div>
        <p className={`text-[11px] ${rangoValido ? "text-slate-400" : "text-amber-600 dark:text-amber-400"}`}>
          {rangoValido
            ? "Egresos por fecha de egreso · ingresados por fecha de ingreso · activos al momento"
            : "Elige un rango válido: la fecha desde no puede ser posterior a la fecha hasta."}
        </p>
      </div>

      {/* Tarjetas de conteo = pestañas. Elegir una no lee nada; generar su detalle, sí. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {TABS.map((t) => {
          const e = entrada(t.value);
          const activo = tab === t.value;
          const Icon = t.icon;
          const sinDato = t.value !== "activos" && !rangoValido;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              disabled={extrayendo !== null}
              aria-pressed={activo}
              className={`text-left rounded-xl border px-3 py-2.5 sm:px-4 sm:py-3 transition-colors disabled:cursor-not-allowed ${
                activo
                  ? "bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 ring-1 ring-blue-500/40"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Icon size={13} className={`shrink-0 ${t.color}`} />
                <span className="truncate">{t.label}</span>
              </span>
              <span className="block mt-1 text-xl sm:text-2xl font-bold font-heading tabular-nums text-slate-900 dark:text-slate-100">
                {!sinDato && e.conteo !== undefined
                  ? fmtN(e.conteo)
                  : <span className="text-slate-300 dark:text-slate-600">—</span>}
              </span>
              <span className={`flex items-center gap-1 mt-0.5 text-[11px] ${
                e.detalle && !sinDato ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"
              }`}>
                {e.detalle && !sinDato
                  ? <><CheckCircle2 size={11} className="shrink-0" /> Detalle cargado</>
                  : t.value === "activos" ? "Al momento · solo conteo" : "Solo conteo"}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p>{error.mensaje}</p>
            {error.enlaceIndice && (
              <a
                href={error.enlaceIndice}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-xs font-semibold underline underline-offset-2"
              >
                Crear el índice en la consola de Firebase <ArrowUpRight size={12} />
              </a>
            )}
          </div>
        </div>
      )}

      {sinRango ? null : !actual.detalle ? (
        // Solo conteo: el tabulador por servicio y la lista se leen únicamente al pedirlos.
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-12 px-4 text-center">
          {extrayendo?.tab === tab ? (
            <div className="max-w-sm mx-auto">
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2 tabular-nums">
                Cargando detalle… {fmtN(extrayendo.leidos)} de {fmtN(Math.max(nTab, extrayendo.leidos))}
              </p>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-[width] duration-300"
                  style={{ width: `${Math.min(100, (extrayendo.leidos / Math.max(1, nTab)) * 100)}%` }}
                />
              </div>
            </div>
          ) : actual.conteo === undefined ? (
            contando > 0
              ? <div className="w-6 h-6 mx-auto border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              : <p className="text-sm text-slate-500">Sin conteo. Pulsa Actualizar para volver a intentarlo.</p>
          ) : nTab === 0 ? (
            <>
              <Table2 size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm text-slate-500">
                {esActivos
                  ? "No hay pacientes ingresados actualmente."
                  : esIngresos
                    ? "No hay ingresos para el rango seleccionado."
                    : "No hay egresos para el rango seleccionado."}
              </p>
            </>
          ) : (
            <>
              <Database size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {fmtN(nTab)} {tabActual.unidad}{esActivos ? " en este momento" : " en el rango"}
              </p>
              {tab === "vivos" && actual.modalidades && (
                <div className="flex flex-wrap justify-center gap-2 mt-3">
                  {MODALIDADES_VIVO.map((m) => (
                    <span
                      key={m.key}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300"
                    >
                      {m.label}
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{fmtN(actual.modalidades?.[m.key] ?? 0)}</span>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-500 mt-3 mb-4 max-w-md mx-auto">
                El tabulador por servicio y la lista de pacientes se arman leyendo cada registro.
                Cambiar de pestaña o de fechas no carga nada.
              </p>
              <button
                onClick={pedirDetalle}
                disabled={ocupado}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                <Database size={15} /> Generar tabulador y detalle ({fmtN(nTab)})
              </button>
            </>
          )}
        </div>
      ) : pivote.filas.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <Table2 size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            {esActivos
              ? "No hay pacientes ingresados actualmente."
              : esIngresos
                ? "No hay ingresos para el rango seleccionado."
                : "No hay egresos para el rango seleccionado."}
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
            tab={tab}
            servicioFiltro={servicioFiltro}
            totalItems={items.length}
            onClear={() => setServicioFiltro("")}
          />
        </>
      )}

      {pdf && (
        <TabuladoresPdf
          desde={pdf.desde}
          hasta={pdf.hasta}
          vivos={pdf.vivos}
          fallecidos={pdf.fallecidos}
          ingresados={pdf.ingresados}
          generadoPor={profile.nombre}
          onClose={() => setPdf(null)}
        />
      )}
    </div>
  );
}

function DetalleTabla({
  items, tab, servicioFiltro, totalItems, onClear,
}: {
  items: Paciente[];
  tab: Tab;
  servicioFiltro: string;
  totalItems: number;
  onClear: () => void;
}) {
  const esActivos = tab === "activos";
  const esIngresos = tab === "ingresos";
  // Activos e ingresados se listan por fecha de INGRESO; los egresos, por la de egreso.
  const usaIngreso = esActivos || esIngresos;
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
              <Th>{usaIngreso ? "Ingreso" : "Egreso"}</Th>
              <Th center>Estancia</Th>
              {esIngresos && <Th>Estado</Th>}
              {!esActivos && !esIngresos && <Th>Tipo de alta</Th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((p) => {
              const edad = calcularEdad(p.fechaNacimiento);
              const dias = esActivos
                ? diasEstancia(p.fechaIngreso)
                : esIngresos
                  ? (p.diasEstancia ?? diasEstancia(p.fechaIngreso, p.fechaEgreso))
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
                    {formatFecha(usaIngreso ? p.fechaIngreso : p.fechaEgreso)}
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-600 dark:text-slate-400 text-xs">
                    {dias !== null && dias !== undefined ? `${dias} ${dias === 1 ? "día" : "días"}` : "—"}
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
