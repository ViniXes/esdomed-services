"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, BedDouble, Clock, Filter, ChevronDown, Search, X } from "lucide-react";
import type { Paciente } from "@/types";
import { calcularEdad, diasEstancia, formatFecha, nombreCompleto, toDate } from "@/lib/pacientes/helpers";

type Orden = "antiguos" | "recientes";

export default function PacientesActivosPsicologiaPage() {
  const { profile } = useAuth();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [servicioFiltro, setServicioFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("antiguos");

  useEffect(() => {
    if (!profile) return;
    // Misma fuente que ESDOMED: ingresos activos. Sin orderBy en la consulta para
    // no depender de un índice compuesto (estado + fechaIngreso); ordenamos en cliente.
    const q = query(
      collection(db, "pacientes"),
      where("estado", "==", "activo"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setError("");
      setPacientes(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
            fechaNacimiento: toDate(data.fechaNacimiento),
          } as Paciente;
        }),
      );
      setLoading(false);
    }, (err) => {
      console.error("pacientes-activos:", err);
      setError(err.message || "No se pudieron cargar los pacientes.");
      setLoading(false);
    });
    return unsub;
  }, [profile]);

  const serviciosUnicos = useMemo(() => {
    const set = new Set<string>();
    pacientes.forEach((p) => p.servicioActual && set.add(p.servicioActual));
    return Array.from(set).sort();
  }, [pacientes]);

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    const lista = pacientes.filter((p) => {
      if (servicioFiltro && p.servicioActual !== servicioFiltro) return false;
      if (!term) return true;
      return (
        p.expediente?.toLowerCase().includes(term) ||
        p.dui?.toLowerCase().includes(term) ||
        nombreCompleto(p).toLowerCase().includes(term)
      );
    });
    // "antiguos" = más tiempo aquí primero (ingreso más viejo arriba).
    const dir = orden === "antiguos" ? 1 : -1;
    return [...lista].sort(
      (a, b) => dir * (a.fechaIngreso.getTime() - b.fechaIngreso.getTime()),
    );
  }, [pacientes, busqueda, servicioFiltro, orden]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-50 dark:bg-violet-950 rounded-xl flex items-center justify-center border border-violet-200 dark:border-violet-900">
            <Clock size={17} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
              Pacientes activos por antigüedad
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Hospitalizados ordenados por tiempo de estancia · fuente: ingresos activos de ESDOMED
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-900 px-3 py-1.5 rounded-xl">
          <BedDouble size={14} />
          {pacientes.length} hospitalizados
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
        <div className="relative sm:w-56">
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
        <button
          onClick={() => setOrden((o) => (o === "antiguos" ? "recientes" : "antiguos"))}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm whitespace-nowrap"
          title="Cambiar orden por antigüedad"
        >
          {orden === "antiguos" ? <ArrowDownWideNarrow size={15} /> : <ArrowUpWideNarrow size={15} />}
          {orden === "antiguos" ? "Más tiempo primero" : "Más reciente primero"}
        </button>
        {(busqueda || servicioFiltro) && (
          <button
            onClick={() => { setBusqueda(""); setServicioFiltro(""); }}
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
          <BedDouble size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            {pacientes.length === 0
              ? "No hay pacientes activos en este momento."
              : "Sin coincidencias para los filtros actuales."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <Th>#</Th>
                  <Th>Estancia</Th>
                  <Th>Paciente</Th>
                  <Th>Servicio / Cama</Th>
                  <Th>Ingreso</Th>
                  <Th>Expediente</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtrados.map((p, i) => {
                  const edad = calcularEdad(p.fechaNacimiento);
                  const dias = diasEstancia(p.fechaIngreso);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-violet-700 dark:text-violet-300 tabular-nums">
                          <Clock size={13} className="text-violet-400" />
                          {dias} {dias === 1 ? "día" : "días"}
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
                        {formatFecha(p.fechaIngreso)}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">{p.expediente}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/30 text-xs text-slate-500">
            {filtrados.length}
            {filtrados.length < pacientes.length && <> de {pacientes.length}</>}
            {" "}paciente{filtrados.length === 1 ? "" : "s"} · {orden === "antiguos" ? "mayor tiempo de estancia primero" : "ingreso más reciente primero"}
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
