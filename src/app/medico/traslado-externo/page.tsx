"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { DateField } from "@/components/ui/DateField";
import { Plus, Search, X, Building2, MessageSquare } from "lucide-react";
import type { TrasladoExterno } from "@/types";

export default function MedicoTrasladoExternoPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<TrasladoExterno[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "traslados_externos"), where("medicoId", "==", user.uid));
    return onSnapshot(q, s => {
      const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as TrasladoExterno));
      docs.sort((a, b) => {
        const at = (a.creadoEn as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
        const bt = (b.creadoEn as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
        return bt - at;
      });
      setItems(docs);
    });
  }, [user]);

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const displayList = items.filter(t => {
    if (busqueda) {
      const q = busqueda.toLowerCase();
      if (!(t.pacienteExpediente?.toLowerCase() ?? "").includes(q) &&
          !(t.establecimientoDestino?.toLowerCase() ?? "").includes(q)) return false;
    }
    if (fechaDesde || fechaHasta) {
      const d = ((t.creadoEn as unknown) as { toDate?: () => Date }).toDate?.() ?? (t.creadoEn as Date);
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
            <Building2 size={17} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Traslado a otro hospital</h1>
        </div>
        <Link href="/medico/traslado-externo/nueva"
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={15} /> Nueva solicitud
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Buscar por expediente u hospital..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Desde</span>
          <DateField value={fechaDesde} onChange={setFechaDesde} clearable placeholder="Desde" ariaLabel="Fecha desde" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Hasta</span>
          <DateField value={fechaHasta} onChange={setFechaHasta} clearable placeholder="Hasta" ariaLabel="Fecha hasta" />
        </div>
        {(busqueda || fechaDesde || fechaHasta) && (
          <button onClick={() => { setBusqueda(""); setFechaDesde(""); setFechaHasta(""); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      <div className="space-y-3">
        {displayList.length === 0 && (
          <p className="text-sm text-slate-500 py-10 text-center">
            {items.length === 0 ? "No has enviado traslados a otro hospital." : "Sin resultados para los filtros aplicados."}
          </p>
        )}
        {displayList.map(t => (
          <div key={t.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 border-blue-200 dark:border-blue-800">
                    <Building2 size={12} /> Otro hospital
                  </span>
                  <span className="text-xs text-slate-400 font-medium">{formatFecha(t.creadoEn)}</span>
                </div>

                <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                  Exp. {t.pacienteExpediente} {t.pacienteNombre ? `- ${t.pacienteNombre}` : ""}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {t.servicioOrigen || "—"}{t.camaOrigen ? ` (Cama ${t.camaOrigen})` : ""} → <span className="font-medium text-slate-700 dark:text-slate-300">{t.establecimientoDestino}</span>
                </p>

                {t.comentario && (
                  <p className="text-xs text-slate-500 mt-2 flex items-start gap-1.5">
                    <MessageSquare size={12} className="mt-0.5 shrink-0 text-slate-400" />
                    <span className="italic">{t.comentario}</span>
                  </p>
                )}

                {t.revisadoPorNombre && (
                  <div className="mt-2">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded uppercase tracking-wider">
                      Recibido por: {t.revisadoPorNombre}
                    </span>
                  </div>
                )}

                {t.notasEsdomed && (
                  <div className="mt-3 bg-amber-50 dark:bg-amber-950/40 rounded-lg p-3 border border-amber-200 dark:border-amber-900/50">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">Observación de ESDOMED</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{t.notasEsdomed}</p>
                  </div>
                )}
              </div>
              <Badge estado={t.estado} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
