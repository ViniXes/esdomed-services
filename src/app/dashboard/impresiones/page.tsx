"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { SolicitudImpresion } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Printer, Clock, Search, X } from "lucide-react";

export default function DashboardImpresionesPage() {
  const { profile } = useAuth();
  const [solicitudes, setSolicitudes] = useState<SolicitudImpresion[]>([]);
  const [filtro, setFiltro] = useState<"pendiente" | "impreso" | "todos">("pendiente");
  const [busquedaExpediente, setBusquedaExpediente] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  // Texto libre "entregado a" por solicitud, mientras está pendiente.
  const [entregadoA, setEntregadoA] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = query(collection(db, "solicitudes_impresion"), orderBy("creadoEn", "desc"));
    return onSnapshot(q, s => setSolicitudes(s.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudImpresion))));
  }, []);

  const filtered = filtro === "todos" ? solicitudes : solicitudes.filter(s => s.estado === filtro);

  const displayList = filtered.filter(s => {
    if (busquedaExpediente && !(s.pacienteExpediente?.toLowerCase() ?? "").includes(busquedaExpediente.toLowerCase())) return false;
    if (fechaDesde || fechaHasta) {
      const d = ((s.creadoEn as unknown) as { toDate?: () => Date }).toDate?.() ?? s.creadoEn;
      if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
      if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    }
    return true;
  });

  const marcarImpreso = async (id: string) => {
    if (!profile) return;
    setSaving(id);
    const quien = (entregadoA[id] ?? "").trim();
    await updateDoc(doc(db, "solicitudes_impresion", id), {
      estado: "impreso", impresoPor: profile.uid,
      impresoPorNombre: profile.nombre, impresoEn: Timestamp.now(),
      ...(quien ? { entregadoA: quien } : {}),
    });
    setSaving(null);
  };

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString("es-HN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-50 dark:bg-violet-950 rounded-xl flex items-center justify-center border border-violet-200 dark:border-violet-900">
            <Printer size={17} className="text-violet-600 dark:text-violet-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Solicitudes de impresión</h1>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-3 py-1.5 rounded-xl">
          <Clock size={14} />
          {solicitudes.filter(s => s.estado === "pendiente").length} pendiente(s)
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {[{ label: "Todos", value: "todos" }, { label: "Pendientes", value: "pendiente" }, { label: "Impresos", value: "impreso" }].map(f => (
          <button key={f.value} onClick={() => setFiltro(f.value as typeof filtro)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filtro === f.value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200"
            }`}>
            {f.label}
          </button>
        ))}
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
          <p className="text-sm text-slate-500 py-10 text-center">Sin solicitudes en este filtro.</p>
        )}
        {displayList.map(s => (
          <div key={s.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-violet-300 dark:hover:border-violet-900 transition-all shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
              
              {/* Información principal */}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 text-[15px] truncate">{s.descripcion}</p>
                  <Badge estado={s.estado} />
                </div>
                
                {s.pacienteExpediente && (
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Exp. {s.pacienteExpediente}</p>
                )}
                
                <div className="text-sm text-slate-500 space-y-0.5">
                  <p>Dr. {s.medicoNombre}{s.medicoJvpm ? ` · JVPM ${s.medicoJvpm}` : ""}</p>
                  <p>{s.copias} copia(s) · Solicitado {formatFecha(s.creadoEn)}</p>
                </div>
                
                {s.estado === "impreso" && s.impresoPorNombre && (
                  <div className="mt-2 inline-flex flex-col gap-0.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-md border border-green-200 dark:border-green-800">
                    <p className="text-[11px] font-medium">Impreso por {s.impresoPorNombre} el {formatFecha(s.impresoEn)}</p>
                    {s.entregadoA && (
                      <p className="text-[11px] font-medium">Entregado a {s.entregadoA}</p>
                    )}
                  </div>
                )}
              </div>
              
              {/* Archivos y Acciones */}
              <div className="flex flex-col gap-3 shrink-0 w-full sm:w-auto items-end">
                <div className="w-full flex flex-col gap-1.5">
                  {s.archivos && s.archivos.length > 0 ? (
                    s.archivos.map((archivo, idx) => (
                      <a key={idx} href={archivo.url} target="_blank" rel="noopener noreferrer"
                        className="block px-3 py-1.5 text-xs font-medium text-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors truncate max-w-full sm:max-w-[200px]" title={archivo.nombre}>
                        {archivo.nombre}
                      </a>
                    ))
                  ) : s.pdfUrl ? (
                    <a href={s.pdfUrl} target="_blank" rel="noopener noreferrer"
                      className="block px-3 py-1.5 text-xs font-medium text-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors truncate max-w-full sm:max-w-[200px]" title={s.pdfNombre}>
                      {s.pdfNombre || "Ver Documento"}
                    </a>
                  ) : null}
                </div>

                {s.estado === "pendiente" && (
                  <div className="w-full flex flex-col gap-1.5 mt-1">
                    <input
                      type="text"
                      value={entregadoA[s.id!] ?? ""}
                      onChange={e => setEntregadoA(prev => ({ ...prev, [s.id!]: e.target.value }))}
                      placeholder="¿A quién se entregó? (opcional)"
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
                    />
                    <button onClick={() => marcarImpreso(s.id!)} disabled={saving === s.id}
                      className="w-full px-4 py-2 text-xs font-semibold text-white bg-green-700 rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors shadow-sm">
                      {saving === s.id ? "Procesando..." : "Marcar como impreso"}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
