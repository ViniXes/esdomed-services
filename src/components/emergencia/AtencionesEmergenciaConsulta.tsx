"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection, query, orderBy, onSnapshot, limit, where, getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Ambulance, HeartPulse, Search, ChevronLeft, ChevronRight, Upload, X,
  ArrowUpRight, Stethoscope,
} from "lucide-react";
import type { AtencionEmergencia, IngresoHospitalizacion } from "@/types";
import { toDate, formatFechaHora } from "@/lib/pacientes/helpers";
import {
  INGRESO_BADGE, INGRESO_LABEL, triageBadge,
  condicionEgreso, CONDICION_BADGE, CONDICION_LABEL, type CondicionEgresoEmergencia,
} from "@/lib/emergencia/helpers";

type Vista = "atendidos" | "egresos";

const LIMIT = 500;
const PAGE_SIZE = 50;

const FILTROS_ATENDIDOS: { value: string; label: string }[] = [
  { value: "no",    label: "No ingresaron" },
  { value: "si",    label: "Ingresaron" },
  { value: "todos", label: "Todos" },
];

const FILTROS_EGRESOS: { value: string; label: string }[] = [
  { value: "todos",     label: "Todos" },
  { value: "vivo",      label: "Vivos" },
  { value: "fallecido", label: "Fallecidos" },
  { value: "otro",      label: "Otros" },
];

interface Props {
  /** Muestra el botón "Importar reporte" (solo ESDOMED/admin). */
  permiteImportar?: boolean;
  /** Construye el enlace a la ficha del paciente activo (trazabilidad). Si no se
   *  pasa, solo se muestra la insignia sin enlace (p. ej. en el portal médico). */
  fichaHref?: (pacienteId: string) => string;
  /** "atendidos" = todos los atendidos (filtro por ingreso). "egresos" = solo los
   *  que NO ingresaron, filtrados por condición de egreso (vivo / fallecido). */
  vista?: Vista;
}

export function AtencionesEmergenciaConsulta({ permiteImportar, fichaHref, vista = "atendidos" }: Props) {
  const { profile } = useAuth();
  const esEgresos = vista === "egresos";
  const [atenciones, setAtenciones] = useState<AtencionEmergencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>(esEgresos ? "todos" : "no");
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [page, setPage] = useState(1);
  // Mapa expediente → id del ingreso en `pacientes` (trazabilidad).
  const [ingresosPorExp, setIngresosPorExp] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, "atenciones_emergencia"),
      orderBy("fechaHoraIngreso", "desc"),
      limit(LIMIT),
    );
    const unsub = onSnapshot(q, (snap) => {
      setAtenciones(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          fechaHoraIngreso: toDate(data.fechaHoraIngreso) ?? new Date(),
          fechaHoraAltaIngreso: toDate(data.fechaHoraAltaIngreso),
          importadoEn: toDate(data.importadoEn) ?? new Date(),
        } as AtencionEmergencia;
      }));
      setLoading(false);
    });
    return unsub;
  }, [profile]);

  // ── Trazabilidad: ¿cuáles expedientes existen como ingreso en `pacientes`? ──
  useEffect(() => {
    if (!profile || atenciones.length === 0) return;
    let cancelado = false;
    (async () => {
      const exps = Array.from(new Set(atenciones.map((a) => a.expediente))).filter(Boolean);
      const mapa = new Map<string, string>();
      try {
        for (let i = 0; i < exps.length; i += 30) {
          const chunk = exps.slice(i, i + 30);
          const snap = await getDocs(
            query(collection(db, "pacientes"), where("expediente", "in", chunk)),
          );
          snap.forEach((d) => {
            if (!mapa.has(d.data().expediente)) mapa.set(d.data().expediente, d.id);
          });
        }
        if (!cancelado) setIngresosPorExp(mapa);
      } catch {
        // Best-effort: sin permisos o error de red, simplemente no se muestran enlaces.
      }
    })();
    return () => { cancelado = true; };
  }, [profile, atenciones]);

  // En egresos, el universo son los que NO ingresaron a hospitalización (egresaron
  // de emergencia). En atendidos, son todas las atenciones.
  const base = useMemo(
    () => (esEgresos ? atenciones.filter((a) => a.ingresoHospitalizacion !== "si") : atenciones),
    [atenciones, esEgresos],
  );

  // En egresos la fecha relevante es la de alta; en atendidos, la de ingreso a emergencia.
  const fechaDe = useCallback(
    (a: AtencionEmergencia) => (esEgresos ? (a.fechaHoraAltaIngreso ?? a.fechaHoraIngreso) : a.fechaHoraIngreso),
    [esEgresos],
  );

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    const desde = fechaDesde ? new Date(fechaDesde + "T00:00:00") : null;
    const hasta = fechaHasta ? new Date(fechaHasta + "T23:59:59") : null;
    return base.filter((a) => {
      if (filtro !== "todos") {
        if (esEgresos) { if (condicionEgreso(a.tipoEgreso) !== filtro) return false; }
        else if (a.ingresoHospitalizacion !== filtro) return false;
      }
      const fecha = fechaDe(a);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      if (!term) return true;
      return (
        a.expediente?.toLowerCase().includes(term) ||
        a.dui?.toLowerCase().includes(term) ||
        a.pacienteNombre?.toLowerCase().includes(term)
      ) ?? false;
    });
  }, [base, filtro, busqueda, fechaDesde, fechaHasta, esEgresos, fechaDe]);

  // Reset de página al cambiar filtros.
  const filtrosKey = `${filtro}|${busqueda}|${fechaDesde}|${fechaHasta}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) { setFiltrosPrevios(filtrosKey); setPage(1); }

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginados = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const conteoAtendidos = useMemo(() => {
    const c: Record<IngresoHospitalizacion, number> = { no: 0, si: 0, sin_dato: 0 };
    base.forEach((a) => { c[a.ingresoHospitalizacion]++; });
    return c;
  }, [base]);

  const conteoEgresos = useMemo(() => {
    const c: Record<CondicionEgresoEmergencia, number> = { vivo: 0, fallecido: 0, otro: 0, sin_dato: 0 };
    base.forEach((a) => { c[condicionEgreso(a.tipoEgreso)]++; });
    return c;
  }, [base]);

  const filtros = esEgresos ? FILTROS_EGRESOS : FILTROS_ATENDIDOS;
  const contarTab = (value: string): number => {
    if (value === "todos") return base.length;
    return esEgresos
      ? conteoEgresos[value as CondicionEgresoEmergencia]
      : conteoAtendidos[value as IngresoHospitalizacion];
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
            esEgresos
              ? "bg-violet-50 dark:bg-violet-950 border-violet-200 dark:border-violet-900"
              : "bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-900"
          }`}>
            {esEgresos
              ? <HeartPulse size={17} className="text-violet-600 dark:text-violet-400" />
              : <Ambulance size={17} className="text-rose-600 dark:text-rose-400" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
              {esEgresos ? "Egresos de emergencia" : "Atendidos en emergencia"}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {esEgresos
                ? "Pacientes que egresaron desde emergencia (sin ingresar), por condición de alta."
                : <>Pacientes que pasaron por emergencia. Por defecto se muestran los que <span className="font-medium">no ingresaron</span> a hospitalización.</>}
            </p>
          </div>
        </div>
        {permiteImportar && (
          <Link
            href="/dashboard/emergencia/importar"
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Upload size={15} />
            Importar reporte
          </Link>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {filtros.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filtro === f.value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-xs opacity-70 tabular-nums">{contarTab(f.value)}</span>
          </button>
        ))}
      </div>

      {/* Buscador + rango de fecha */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por expediente, DUI o nombre..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">{esEgresos ? "Alta desde" : "Ingreso desde"}</span>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="px-2 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 shadow-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Hasta</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="px-2 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 shadow-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        {(busqueda || fechaDesde || fechaHasta) && (
          <button
            onClick={() => { setBusqueda(""); setFechaDesde(""); setFechaHasta(""); }}
            className="flex items-center gap-1 px-3 py-2 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors shadow-sm"
          >
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <Ambulance size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            {atenciones.length === 0
              ? "Aún no hay atenciones de emergencia importadas."
              : "Sin coincidencias para los filtros actuales."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <Th>Expediente</Th>
                  <Th>Paciente</Th>
                  <Th>{esEgresos ? "Fecha de alta" : "Ingreso a emergencia"}</Th>
                  {!esEgresos && <Th>Triage</Th>}
                  <Th>Diagnóstico</Th>
                  <Th>{esEgresos ? "Condición" : "Hospitalización"}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginados.map((a) => {
                  const pacienteId = ingresosPorExp.get(a.expediente);
                  const triage = triageBadge(a.categorizacion);
                  const cond = condicionEgreso(a.tipoEgreso);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors align-top">
                      <td className="px-4 py-3">
                        <p className="font-semibold font-mono text-slate-900 dark:text-slate-100">{a.expediente}</p>
                        {a.dui && <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{a.dui}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{a.pacienteNombre || "—"}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {a.edadAnios != null ? `${a.edadAnios} años` : a.edadTexto || "—"}
                          {a.genero && <> · {a.genero === "masculino" ? "M" : a.genero === "femenino" ? "F" : "O"}</>}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
                        {formatFechaHora(fechaDe(a))}
                        {!esEgresos && a.llegaReferido && (
                          <span className="block text-[11px] text-sky-600 dark:text-sky-400 mt-0.5">Referido</span>
                        )}
                      </td>
                      {!esEgresos && (
                        <td className="px-4 py-3">
                          {a.categorizacion ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${triage ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"}`}>
                              {a.categorizacion}
                            </span>
                          ) : <span className="text-slate-400 text-xs">—</span>}
                        </td>
                      )}
                      <td className="px-4 py-3 max-w-[240px]">
                        <p className="text-slate-700 dark:text-slate-300 text-xs line-clamp-2">{a.diagnostico || "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        {esEgresos ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${CONDICION_BADGE[cond]}`}>
                            {CONDICION_LABEL[cond]}
                          </span>
                        ) : (
                          <>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${INGRESO_BADGE[a.ingresoHospitalizacion]}`}>
                              {INGRESO_LABEL[a.ingresoHospitalizacion]}
                            </span>
                            {pacienteId && (
                              fichaHref ? (
                                <Link
                                  href={fichaHref(pacienteId)}
                                  className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 mt-1"
                                >
                                  <ArrowUpRight size={11} /> Ver ficha
                                </Link>
                              ) : (
                                <span className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                                  <Stethoscope size={11} /> Registrado en padrón
                                </span>
                              )
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between gap-4">
            <span className="text-xs text-slate-500 shrink-0">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtrados.length)} de{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">{filtrados.length}</span>
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-slate-500 px-2 tabular-nums">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            {atenciones.length === LIMIT && (
              <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">
                Límite de {LIMIT} — afina por fecha
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  );
}
