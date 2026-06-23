"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { AlertTriangle, History, Search, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { BusquedaTelefono } from "@/types";
import { ESTADO_LABEL, toDate } from "@/lib/pacientes/helpers";
import { DateField } from "@/components/ui/DateField";

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500";

function formatFechaHora(ts: unknown): string {
  const d = toDate(ts);
  if (!d) return "-";
  return d.toLocaleString("es-SV", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function inicioDia(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

function finDia(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59`);
  return isNaN(d.getTime()) ? null : d;
}

export default function HistorialBusquedasPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [registros, setRegistros] = useState<BusquedaTelefono[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState<"todos" | "encontrado" | "no_encontrado">("todos");

  useEffect(() => {
    if (!loading && profile?.role !== "admin") router.replace("/dashboard");
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== "admin") return;
    const q = query(
      collection(db, "busquedas_telefono"),
      orderBy("creadoEn", "desc"),
      limit(500)
    );
    return onSnapshot(q, snap => {
      setRegistros(snap.docs.map(d => ({ id: d.id, ...d.data() } as BusquedaTelefono)));
      setCargando(false);
    }, () => setCargando(false));
  }, [profile?.role]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const fDesde = inicioDia(desde);
    const fHasta = finDia(hasta);

    return registros.filter(r => {
      const fecha = toDate(r.creadoEn);
      if (estado === "encontrado" && !r.encontrado) return false;
      if (estado === "no_encontrado" && r.encontrado) return false;
      if (fDesde && fecha && fecha < fDesde) return false;
      if (fHasta && fecha && fecha > fHasta) return false;
      if (!q) return true;
      return [
        r.usuarioNombre,
        r.usuarioEmail,
        r.usuarioJvpm,
        r.expedienteBuscado,
        r.expedienteNormalizado,
        r.pacienteNombre,
        r.pacienteExpediente,
        r.pacienteServicio,
      ].some(v => String(v ?? "").toLowerCase().includes(q));
    });
  }, [busqueda, desde, hasta, estado, registros]);

  if (loading || profile?.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center border border-slate-300 dark:border-slate-700">
            <History size={17} className="text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
              Historial de busquedas
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Auditoria de consultas de telefonos realizadas por medicos
            </p>
          </div>
        </div>
        <div className="text-xs text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2">
          {filtrados.length} de {registros.length} registros
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_150px_150px_auto] gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar medico, expediente o paciente..."
              className={`${inputCls} pl-9 pr-8`}
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Limpiar busqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <DateField value={desde} onChange={v => setDesde(v)} placeholder="Desde" ariaLabel="Filtrar desde" clearable />
          <DateField value={hasta} onChange={v => setHasta(v)} placeholder="Hasta" ariaLabel="Filtrar hasta" clearable />
          <select value={estado} onChange={e => setEstado(e.target.value as typeof estado)} className={inputCls}>
            <option value="todos">Todos</option>
            <option value="encontrado">Encontrados</option>
            <option value="no_encontrado">No encontrados</option>
          </select>
          <button
            onClick={() => { setBusqueda(""); setDesde(""); setHasta(""); setEstado("todos"); }}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {cargando ? (
          <p className="text-sm text-slate-500 text-center py-12">Cargando historial...</p>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-slate-500">
            <AlertTriangle size={24} className="text-slate-400" />
            <p className="text-sm">No hay registros que coincidan con los filtros.</p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm min-w-[920px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    {["Fecha", "Medico", "Expediente", "Resultado", "Paciente", "Servicio"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtrados.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">{formatFechaHora(r.creadoEn)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{r.usuarioNombre}</p>
                        <p className="text-xs text-slate-500 font-mono">{r.usuarioJvpm || r.usuarioEmail || "-"}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">{r.expedienteNormalizado}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                          r.encontrado
                            ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900"
                            : "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900"
                        }`}>
                          {r.encontrado ? "Encontrado" : "No encontrado"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {r.pacienteNombre || "-"}
                        {r.pacienteEstado && (
                          <span className="block text-xs text-slate-500 mt-0.5">
                            {ESTADO_LABEL[r.pacienteEstado]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {r.pacienteServicio || "-"}
                        {r.pacienteCama && <span className="block text-xs text-slate-500">Cama {r.pacienteCama}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filtrados.map(r => (
                <div key={r.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{r.usuarioNombre}</p>
                      <p className="text-xs text-slate-500 font-mono">{formatFechaHora(r.creadoEn)}</p>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                      r.encontrado
                        ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900"
                        : "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900"
                    }`}>
                      {r.encontrado ? "Encontrado" : "No encontrado"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    Exp. <span className="font-mono font-semibold">{r.expedienteNormalizado}</span>
                  </p>
                  {r.pacienteNombre && (
                    <p className="text-sm text-slate-500">{r.pacienteNombre} · {r.pacienteServicio || "Sin servicio"}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
