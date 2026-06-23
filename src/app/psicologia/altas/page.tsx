"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronDown, Filter, LogOut, Search, X } from "lucide-react";
import type { EstadoPaciente, Paciente } from "@/types";
import {
  calcularEdad, diasEstancia, formatFecha, nombreCompleto, toDate,
  ESTADO_LABEL, ESTADO_BADGE,
} from "@/lib/pacientes/helpers";

// Estados de egreso (cualquier tipo de alta efectiva que ESDOMED ya registró).
const ESTADOS_EGRESO: EstadoPaciente[] = [
  "alta_vivo", "alta_voluntaria", "referido", "fuga", "in_extremis", "alta_fallecido",
];

const LIMIT = 300;
type FiltroEstado = EstadoPaciente | "todos";

export default function AltasPsicologiaPage() {
  const { profile } = useAuth();
  const [egresos, setEgresos] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<FiltroEstado>("todos");
  const [servicioFiltro, setServicioFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (!profile) return;
    // Los egresos tienen fechaEgreso; los activos no → ordenar por fechaEgreso desc
    // devuelve solo los egresados (de cualquier tipo), más recientes primero.
    const q = query(
      collection(db, "pacientes"),
      orderBy("fechaEgreso", "desc"),
      limit(LIMIT),
    );
    const unsub = onSnapshot(q, (snap) => {
      setError("");
      setEgresos(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
          fechaEgreso: toDate(data.fechaEgreso),
          fechaNacimiento: toDate(data.fechaNacimiento),
        } as Paciente;
      }));
      setLoading(false);
    }, (err) => {
      console.error("psicologia/altas:", err);
      setError(err.message || "No se pudieron cargar los egresos.");
      setLoading(false);
    });
    return unsub;
  }, [profile]);

  const serviciosUnicos = useMemo(() => {
    const set = new Set<string>();
    egresos.forEach((p) => p.servicioActual && set.add(p.servicioActual));
    return Array.from(set).sort();
  }, [egresos]);

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    return egresos.filter((p) => {
      if (estadoFiltro !== "todos" && p.estado !== estadoFiltro) return false;
      if (servicioFiltro && p.servicioActual !== servicioFiltro) return false;
      if (!term) return true;
      return (
        p.expediente?.toLowerCase().includes(term) ||
        p.dui?.toLowerCase().includes(term) ||
        nombreCompleto(p).toLowerCase().includes(term)
      );
    });
  }, [egresos, estadoFiltro, servicioFiltro, busqueda]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-50 dark:bg-violet-950 rounded-xl flex items-center justify-center border border-violet-200 dark:border-violet-900">
            <LogOut size={17} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
              Altas efectivas
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Pacientes con egreso ya registrado por ESDOMED · cualquier tipo de alta
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-900 px-3 py-1.5 rounded-xl">
          <LogOut size={14} />
          {filtrados.length} egreso{filtrados.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por expediente, DUI o nombre..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 shadow-sm"
          />
        </div>
        <div className="relative sm:w-52">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value as FiltroEstado)}
            className="w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer shadow-sm"
          >
            <option value="todos">Todos los tipos</option>
            {ESTADOS_EGRESO.map((e) => (
              <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative sm:w-52">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select
            value={servicioFiltro}
            onChange={(e) => setServicioFiltro(e.target.value)}
            className="w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer shadow-sm"
          >
            <option value="">Todos los servicios</option>
            {serviciosUnicos.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        {(busqueda || servicioFiltro || estadoFiltro !== "todos") && (
          <button
            onClick={() => { setBusqueda(""); setServicioFiltro(""); setEstadoFiltro("todos"); }}
            className="flex items-center gap-1 px-3 py-2 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors shadow-sm"
          >
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <LogOut size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            {egresos.length === 0
              ? "Aún no hay egresos registrados."
              : "Sin coincidencias para los filtros actuales."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <Th>Tipo de alta</Th>
                  <Th>Paciente</Th>
                  <Th>Servicio / Cama</Th>
                  <Th>Fecha de egreso</Th>
                  <Th>Estancia</Th>
                  <Th>Expediente</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtrados.map((p) => {
                  const edad = calcularEdad(p.fechaNacimiento);
                  const dias = p.diasEstancia ?? (p.fechaEgreso ? diasEstancia(p.fechaIngreso, p.fechaEgreso) : null);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${ESTADO_BADGE[p.estado]}`}>
                          {ESTADO_LABEL[p.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{nombreCompleto(p)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {edad !== null ? `${edad} años` : "—"}
                          {p.genero && <> · {p.genero === "masculino" ? "M" : p.genero === "femenino" ? "F" : "O"}</>}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700 dark:text-slate-300 text-sm">{p.servicioActual}</p>
                        {p.camaActual && <p className="text-xs text-slate-500 mt-0.5">Cama {p.camaActual}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
                        {formatFecha(p.fechaEgreso)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                        {dias !== null ? `${dias} ${dias === 1 ? "día" : "días"}` : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">{p.expediente}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/30 text-xs text-slate-500 flex items-center justify-between gap-3">
            <span>
              {filtrados.length}
              {filtrados.length < egresos.length && <> de {egresos.length}</>}
              {" "}egreso{filtrados.length === 1 ? "" : "s"} · más recientes primero
            </span>
            {egresos.length === LIMIT && (
              <span className="text-amber-600 dark:text-amber-400">Mostrando los últimos {LIMIT} — usa la búsqueda</span>
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
