"use client";

import { useEffect, useState } from "react";
import {
  collection, query, orderBy, onSnapshot, limit, where, getDocs, Timestamp, QueryConstraint,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { DateField } from "@/components/ui/DateField";
import { FileStack, Search, X, Circle, History } from "lucide-react";

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
  const [vista, setVista] = useState<"recientes" | "historico">("recientes");
  const [expHistorico, setExpHistorico] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [historicos, setHistoricos] = useState<ControlIngreso[] | null>(null);
  const [buscandoHistoricos, setBuscandoHistoricos] = useState(false);

  // Vista en vivo acotada a ayer + hoy (mismo campo en where/orderBy, no exige
  // índice compuesto). Fechas anteriores se consultan bajo demanda en la
  // pestaña Histórico con una lectura única.
  useEffect(() => {
    const inicioAyer = new Date();
    inicioAyer.setDate(inicioAyer.getDate() - 1);
    inicioAyer.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, "control_ingresos"),
      where("creadoEn", ">=", Timestamp.fromDate(inicioAyer)),
      orderBy("creadoEn", "desc"),
      limit(400),
    );
    return onSnapshot(q, s => {
      setIngresos(s.docs.map(d => ({ id: d.id, ...d.data() } as ControlIngreso)));
      setUltimaActualizacion(new Date());
    });
  }, []);

  const hoy  = ingresos.filter(i => esFechaHoy(i.creadoEn));
  const ayer = ingresos.filter(i => esFechaAyer(i.creadoEn));
  const ultimo = ingresos[0] ?? null;

  // Búsqueda histórica: por expediente exacto (sin orderBy, para no exigir
  // índice compuesto; se ordena en cliente) o por rango de fechas.
  const buscarHistoricos = async () => {
    const exp = expHistorico.trim();
    if (!exp && !fechaDesde && !fechaHasta) return;
    setBuscandoHistoricos(true);
    try {
      let docs: ControlIngreso[];
      if (exp) {
        const snap = await getDocs(query(collection(db, "control_ingresos"), where("expediente", "==", exp), limit(200)));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ControlIngreso));
        if (fechaDesde) docs = docs.filter(i => tsToDate(i.creadoEn) >= new Date(fechaDesde + "T00:00:00"));
        if (fechaHasta) docs = docs.filter(i => tsToDate(i.creadoEn) <= new Date(fechaHasta + "T23:59:59"));
        docs.sort((a, b) => tsToDate(b.creadoEn).getTime() - tsToDate(a.creadoEn).getTime());
      } else {
        const constraints: QueryConstraint[] = [];
        if (fechaDesde) constraints.push(where("creadoEn", ">=", Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"))));
        if (fechaHasta) constraints.push(where("creadoEn", "<=", Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"))));
        constraints.push(orderBy("creadoEn", "desc"), limit(500));
        const snap = await getDocs(query(collection(db, "control_ingresos"), ...constraints));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ControlIngreso));
      }
      setHistoricos(docs);
    } finally {
      setBuscandoHistoricos(false);
    }
  };

  const limpiarHistoricos = () => {
    setExpHistorico(""); setFechaDesde(""); setFechaHasta("");
    setHistoricos(null);
  };

  const base = soloAyer ? ayer : ingresos;
  const recientesFiltrados = base.filter(i => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (
      (i.expediente?.toLowerCase() ?? "").includes(q) ||
      (i.dui?.toLowerCase() ?? "").includes(q) ||
      (i.apellidos?.toLowerCase() ?? "").includes(q) ||
      (i.nombres?.toLowerCase() ?? "").includes(q)
    );
  });
  const lista = vista === "recientes" ? recientesFiltrados : (historicos ?? []);

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

      {/* Tabs Recientes / Histórico */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        {([
          { key: "recientes", label: "Ayer y hoy", icon: Circle },
          { key: "historico", label: "Histórico", icon: History },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setVista(key)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              vista === key
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-200 dark:border-slate-700"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <Icon size={key === "recientes" ? 8 : 14} className={key === "recientes" ? "fill-green-500 text-green-500" : ""} />
            {label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">

        {/* Toolbar */}
        {vista === "recientes" ? (
          <div className="space-y-2 md:space-y-0 md:flex md:items-center md:gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 rounded-t-2xl">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-1 h-5 bg-teal-500 rounded-full flex-shrink-0" />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-heading truncate">
                Registros de ayer y hoy
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
                {soloAyer ? "Ver ambos días" : "Solo ayer"}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 rounded-t-2xl space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-indigo-500 rounded-full flex-shrink-0" />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-heading truncate">
                Buscar en fechas anteriores
              </span>
              {historicos !== null && (
                <span className="text-xs text-slate-400 flex-shrink-0">({historicos.length})</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[150px] md:max-w-[200px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Expediente exacto…"
                  value={expHistorico}
                  onChange={e => setExpHistorico(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); buscarHistoricos(); } }}
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400 font-mono"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 shrink-0">Desde</span>
                <DateField value={fechaDesde} onChange={setFechaDesde} placeholder="Desde" ariaLabel="Fecha desde" clearable />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 shrink-0">Hasta</span>
                <DateField value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" ariaLabel="Fecha hasta" clearable />
              </div>
              <button
                onClick={buscarHistoricos}
                disabled={buscandoHistoricos || (!expHistorico.trim() && !fechaDesde && !fechaHasta)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Search size={13} /> {buscandoHistoricos ? "Buscando…" : "Buscar"}
              </button>
              {historicos !== null && (
                <button
                  onClick={limpiarHistoricos}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
                >
                  <X size={12} /> Limpiar
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Indica un expediente exacto (ej. 123-25), un rango de fechas, o ambos.
            </p>
          </div>
        )}

        {lista.length === 0 ? (
          <p className="text-sm text-slate-500 py-12 text-center">
            {vista === "historico"
              ? historicos === null
                ? "Define un expediente o un rango de fechas y presiona Buscar."
                : "Sin resultados para esa búsqueda."
              : ingresos.length === 0
                ? "No hay expedientes registrados en las últimas 24-48 horas."
                : "Sin resultados para la búsqueda."}
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
