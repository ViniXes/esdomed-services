"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { SolicitudTraslado } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { ArrowRightLeft, Plus, Building2, RefreshCw, Search, X } from "lucide-react";

export default function MedicoTrasladosPage() {
  const { user } = useAuth();
  const [traslados, setTraslados] = useState<SolicitudTraslado[]>([]);
  const [busquedaExpediente, setBusquedaExpediente] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "traslados"), where("medicoId", "==", user.uid));
    return onSnapshot(q, s => {
      const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudTraslado));
      docs.sort((a, b) => {
        const at = (a.creadoEn as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
        const bt = (b.creadoEn as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
        return bt - at;
      });
      setTraslados(docs);
    });
  }, [user]);

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const getTipoLabel = (tipo?: string) => {
    if (tipo === "servicio_cama") return { label: "Servicio a Servicio", color: "text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 border-blue-200 dark:border-blue-800", icon: Building2 };
    if (tipo === "interno") return { label: "Interno", color: "text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 border-purple-200 dark:border-purple-800", icon: ArrowRightLeft };
    if (tipo === "intercambio") return { label: "Intercambio", color: "text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/50 border-orange-200 dark:border-orange-800", icon: RefreshCw };
    return { label: "Traslado", color: "text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700", icon: ArrowRightLeft };
  };

  const displayList = traslados.filter(t => {
    if (busquedaExpediente) {
      const q = busquedaExpediente.toLowerCase();
      if (!(t.pacienteExpediente?.toLowerCase() ?? "").includes(q) &&
          !(t.pacienteBExpediente?.toLowerCase() ?? "").includes(q)) return false;
    }
    if (fechaDesde || fechaHasta) {
      const d = ((t.creadoEn as unknown) as { toDate?: () => Date }).toDate?.() ?? t.creadoEn;
      if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
      if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    }
    return true;
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
            <ArrowRightLeft size={17} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Mis traslados</h1>
        </div>
        <Link href="/medico/traslados/nueva"
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={15} /> Nueva solicitud
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Buscar por expediente..." value={busquedaExpediente} onChange={e => setBusquedaExpediente(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Desde</span>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            className="px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Hasta</span>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            className="px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]" />
        </div>
        {(busquedaExpediente || fechaDesde || fechaHasta) && (
          <button onClick={() => { setBusquedaExpediente(""); setFechaDesde(""); setFechaHasta(""); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      <div className="space-y-3">
        {displayList.length === 0 && (
          <p className="text-sm text-slate-500 py-10 text-center">
            {traslados.length === 0 ? "No has enviado solicitudes de traslado." : "Sin resultados para los filtros aplicados."}
          </p>
        )}
        {displayList.map(t => {
          const typeInfo = getTipoLabel(t.tipoTraslado);
          const Icon = typeInfo.icon;

          return (
            <div key={t.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${typeInfo.color}`}>
                      <Icon size={12} /> {typeInfo.label}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">{formatFecha(t.creadoEn)}</span>
                  </div>

                  {t.tipoTraslado === "intercambio" ? (
                    <div className="space-y-1">
                      <div className="text-sm">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">Exp. {t.pacienteExpediente}</span>
                        {t.pacienteNombre && <span className="text-slate-500 ml-1">({t.pacienteNombre})</span>}
                        <span className="text-xs text-slate-500 ml-2">↔</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 ml-2">Exp. {t.pacienteBExpediente}</span>
                        {t.pacienteBNombre && <span className="text-slate-500 ml-1">({t.pacienteBNombre})</span>}
                      </div>
                      <p className="text-xs text-slate-500">Servicios: {t.servicioOrigen} / {t.servicioDestino}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                        Exp. {t.pacienteExpediente} {t.pacienteNombre ? `- ${t.pacienteNombre}` : ""}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {t.servicioOrigen} (Cama {t.camaOrigen}) → {t.tipoTraslado === "interno" ? t.servicioOrigen : t.servicioDestino} (Cama {t.camaDestino})
                      </p>
                    </div>
                  )}

                  {(t.notasEsdomed || t.revisadoPorNombre) && (
                    <div className="mt-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700/50">
                      <div className="flex items-center justify-between mb-1">
                        {t.notasEsdomed ? (
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notas ESDOMED</p>
                        ) : (
                          <div />
                        )}
                        {t.revisadoPorNombre && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded uppercase tracking-wider">
                            Procesado por: {t.revisadoPorNombre}
                          </span>
                        )}
                      </div>
                      {t.notasEsdomed && (
                        <p className="text-sm text-slate-700 dark:text-slate-300">{t.notasEsdomed}</p>
                      )}
                    </div>
                  )}
                </div>
                <Badge estado={t.estado} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
