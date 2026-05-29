"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FileStack, Search, X, Circle } from "lucide-react";

type ControlIngreso = {
  id?: string;
  expediente: string;
  dui?: string;
  apellidos: string;
  nombres: string;
  servicio: string;
  ingresoDirectoServicio?: boolean;
  responsableIngresoNombre: string;
  creadoEn: Date;
};

function tsToDate(ts: unknown): Date {
  return ((ts as unknown) as { toDate?: () => Date }).toDate?.() ?? (ts as Date);
}

function formatFecha(ts: unknown) {
  if (!ts) return "—";
  return tsToDate(ts).toLocaleDateString("es-HN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function formatHora(ts: unknown) {
  if (!ts) return "—";
  return tsToDate(ts).toLocaleTimeString("es-HN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function esFechaHoy(ts: unknown): boolean {
  const d = tsToDate(ts);
  const hoy = new Date();
  return d.getFullYear() === hoy.getFullYear() &&
    d.getMonth() === hoy.getMonth() &&
    d.getDate() === hoy.getDate();
}

function esFechaAyer(ts: unknown): boolean {
  const d = tsToDate(ts);
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  return d.getFullYear() === ayer.getFullYear() &&
    d.getMonth() === ayer.getMonth() &&
    d.getDate() === ayer.getDate();
}

export default function ColaExpedientesPage() {
  const [ingresos, setIngresos] = useState<ControlIngreso[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [soloAyer, setSoloAyer] = useState(false);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);

  useEffect(() => {
    const q = query(collection(db, "control_ingresos"), orderBy("creadoEn", "desc"));
    return onSnapshot(q, s => {
      setIngresos(s.docs.map(d => ({ id: d.id, ...d.data() } as ControlIngreso)));
      setUltimaActualizacion(new Date());
    });
  }, []);

  const hoy  = ingresos.filter(i => esFechaHoy(i.creadoEn));
  const ayer = ingresos.filter(i => esFechaAyer(i.creadoEn));
  const ultimo = ingresos[0] ?? null;

  const base = soloAyer ? ayer : ingresos;
  const lista = base.filter(i => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (
      (i.expediente?.toLowerCase() ?? "").includes(q) ||
      (i.dui?.toLowerCase() ?? "").includes(q) ||
      (i.apellidos?.toLowerCase() ?? "").includes(q) ||
      (i.nombres?.toLowerCase() ?? "").includes(q)
    );
  });

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-teal-50 dark:bg-teal-950 rounded-xl flex items-center justify-center border border-teal-200 dark:border-teal-900 flex-shrink-0">
            <FileStack size={17} className="text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading leading-tight">
              Cola de expedientes
            </h1>
            <p className="text-xs text-slate-500">Expedientes registrados por ESDOMED — consulta en tiempo real</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0 pt-1">
          <Circle size={7} className="fill-green-500 text-green-500" />
          <span className="hidden sm:inline">En vivo</span>
          {ultimaActualizacion && (
            <span className="hidden md:inline text-slate-400">
              · {ultimaActualizacion.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">Expedientes de ayer</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 font-heading">{ayer.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">Registros del día anterior</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">Expedientes de hoy</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 font-heading">{hoy.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">Registros del día actual</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">Último expediente</p>
          <p className="text-2xl font-bold text-teal-600 dark:text-teal-400 font-mono truncate">
            {ultimo?.expediente ?? "—"}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Registro más reciente</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">Hora del último</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            {ultimo ? formatHora(ultimo.creadoEn) : "—"}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Hora de registro</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">

        {/* Toolbar */}
        <div className="space-y-2 md:space-y-0 md:flex md:items-center md:gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 rounded-t-2xl">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-1 h-5 bg-teal-500 rounded-full flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-heading truncate">
              Registros recientes
            </span>
            <span className="text-xs text-slate-400 flex-shrink-0">({lista.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 md:w-56 md:flex-none">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Expediente, DUI o paciente…"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
              />
              {busqueda && (
                <button onClick={() => setBusqueda("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <X size={12} />
                </button>
              )}
            </div>
            {/* Ayer toggle */}
            <button
              onClick={() => setSoloAyer(v => !v)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                soloAyer
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {soloAyer ? "Ver todos" : "Solo ayer"}
            </button>
          </div>
        </div>

        {lista.length === 0 ? (
          <p className="text-sm text-slate-500 py-12 text-center">
            {ingresos.length === 0 ? "No hay expedientes registrados." : "Sin resultados para la búsqueda."}
          </p>
        ) : (
          <>
            {/* Tabla md+ */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[120px]">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[90px]">Hora</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[110px]">Expediente</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[120px]">DUI</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[180px]">Paciente</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[220px]">Servicio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lista.map(ingreso => (
                    <tr key={ingreso.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                        {formatFecha(ingreso.creadoEn)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                        {formatHora(ingreso.creadoEn)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-semibold text-sm text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950 border border-teal-200 dark:border-teal-800 px-2 py-0.5 rounded-md">
                            {ingreso.expediente}
                          </span>
                          {ingreso.ingresoDirectoServicio && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded">
                              Directo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 font-mono">
                        {ingreso.dui || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {ingreso.apellidos}, {ingreso.nombres}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-md">
                          {ingreso.servicio}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards mobile */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {lista.map(ingreso => (
                <div key={ingreso.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono font-semibold text-sm text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950 border border-teal-200 dark:border-teal-800 px-2 py-0.5 rounded-md">
                          {ingreso.expediente}
                        </span>
                        {ingreso.ingresoDirectoServicio && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded">
                            Directo
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                        {ingreso.apellidos}, {ingreso.nombres}
                      </p>
                      {ingreso.dui && (
                        <p className="text-xs text-slate-500 font-mono mt-0.5">DUI: {ingreso.dui}</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-medium bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">
                          {ingreso.servicio}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs font-mono text-slate-500">{formatFecha(ingreso.creadoEn)}</p>
                      <p className="text-xs font-mono text-slate-400">{formatHora(ingreso.creadoEn)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
