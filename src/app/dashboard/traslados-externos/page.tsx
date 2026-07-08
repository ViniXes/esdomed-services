"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, limit } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { DateField } from "@/components/ui/DateField";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { Building2, Clock, X, Search } from "lucide-react";
import type { TrasladoExterno, EstadoTrasladoExterno } from "@/types";

const FILTROS: { label: string; value: EstadoTrasladoExterno | "todos" }[] = [
  { label: "Todos", value: "todos" },
  { label: "Pendientes", value: "pendiente" },
  { label: "Confirmados", value: "confirmado" },
];

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none";

export default function DashboardTrasladosExternosPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<TrasladoExterno[]>([]);
  const [filtro, setFiltro] = useState<EstadoTrasladoExterno | "todos">("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [selected, setSelected] = useState<TrasladoExterno | null>(null);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "traslados_externos"), orderBy("creadoEn", "desc"), limit(400));
    return onSnapshot(q, s => setItems(s.docs.map(d => ({ id: d.id, ...d.data() } as TrasladoExterno))));
  }, []);

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const filtered = filtro === "todos" ? items : items.filter(t => t.estado === filtro);
  const displayList = filtered.filter(t => {
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

  const confirmar = async () => {
    if (!selected?.id || !profile) return;
    setSaving(true);
    await updateDoc(doc(db, "traslados_externos", selected.id), {
      estado: "confirmado",
      notasEsdomed: notas.trim() || null,
      revisadoPor: profile.uid,
      revisadoPorNombre: profile.nombre,
      actualizadoEn: Timestamp.now(),
    });
    setSaving(false);
    setSelected(null);
    setNotas("");
  };

  const pendientes = items.filter(t => t.estado === "pendiente").length;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
            <Building2 size={17} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Traslados a otro hospital</h1>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-3 py-1.5 rounded-xl">
          <Clock size={14} />
          {pendientes} pendiente(s)
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {FILTROS.map(f => (
          <button key={f.value} onClick={() => setFiltro(f.value)}
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

      <div className="space-y-2">
        {displayList.length === 0 && (
          <p className="text-sm text-slate-500 py-10 text-center">Sin solicitudes en este filtro.</p>
        )}
        {displayList.map(t => (
          <div key={t.id} onClick={() => { setSelected(t); setNotas(t.notasEsdomed ?? ""); }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 cursor-pointer hover:border-blue-300 dark:hover:border-blue-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 border-blue-200 dark:border-blue-800">
                    <Building2 size={10} /> Otro hospital
                  </span>
                  <span className="text-xs text-slate-400 font-medium">{formatFecha(t.creadoEn)}</span>
                </div>

                <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                  Exp. {t.pacienteExpediente} {t.pacienteNombre ? `- ${t.pacienteNombre}` : ""}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {t.servicioOrigen || "—"}{t.camaOrigen ? ` (Cama ${t.camaOrigen})` : ""} → <span className="font-medium text-slate-700 dark:text-slate-300">{t.establecimientoDestino}</span>
                </p>

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <p className="text-xs text-slate-500">
                    Dr. {t.medicoNombre}{t.medicoJvpm ? ` · JVPM ${t.medicoJvpm}` : ""}
                  </p>
                  {t.revisadoPorNombre && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded uppercase tracking-wider">
                      Recibido por: {t.revisadoPorNombre}
                    </span>
                  )}
                </div>
              </div>
              <Badge estado={t.estado} />
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-xl">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 dark:text-slate-100 font-heading">Traslado a otro hospital</h2>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <Row label="Expediente" value={selected.pacienteExpediente} />
              <Row label="Paciente" value={selected.pacienteNombre || "No especificado"} />
              <Row label="Origen" value={`${selected.servicioOrigen || "—"}${selected.camaOrigen ? ` / Cama ${selected.camaOrigen}` : ""}`} />
              <Row label="Destino" value={selected.establecimientoDestino} />

              <div className="h-px bg-slate-200 dark:bg-slate-800 my-2" />

              {selected.comentario && <Row label="Comentario" value={selected.comentario} />}
              <Row label="Médico" value={`Dr. ${selected.medicoNombre}`} />
              {selected.medicoJvpm && <Row label="JVPM" value={selected.medicoJvpm} />}
              <Row label="Estado" value={<Badge estado={selected.estado} />} />
              {selected.revisadoPorNombre && <Row label="Recibido por" value={selected.revisadoPorNombre} />}

              {selected.estado === "confirmado" ? (
                selected.notasEsdomed && (
                  <div className="pt-2">
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Observación ESDOMED</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700 whitespace-pre-wrap">{selected.notasEsdomed}</p>
                  </div>
                )
              ) : (
                <div className="pt-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Observación (opcional)</label>
                  <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
                    placeholder="Notas para el médico..." className={inputCls} />
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 justify-end bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
              {selected.estado === "confirmado" ? (
                <button onClick={() => setSelected(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  Cerrar
                </button>
              ) : (
                <button onClick={confirmar} disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-700 rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors">
                  {saving ? "Guardando..." : "Confirmar de recibido"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-slate-500 w-24 shrink-0 text-xs pt-0.5 font-medium">{label}</span>
      <span className="text-slate-800 dark:text-slate-200 font-medium text-sm flex-1">{value}</span>
    </div>
  );
}
