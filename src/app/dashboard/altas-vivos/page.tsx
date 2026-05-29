"use client";

import { useState, useEffect } from "react";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, getDocs, where, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  LogIn, Plus, X, CheckCircle2, AlertCircle, Search,
  Archive, ChevronDown, Check,
} from "lucide-react";
import { useServicios } from "@/contexts/ServiciosContext";
import type { NotificacionAltaVivo, Paciente, TipoAltaVivo, EstadoNotificacionAlta } from "@/types";

// ── Labels & badges ──────────────────────────────────────────────────────────

const TIPOS_ALTA: { value: TipoAltaVivo; label: string }[] = [
  { value: "domicilio",   label: "Alta a domicilio" },
  { value: "exigida",     label: "Alta exigida" },
  { value: "referido",    label: "Referido" },
  { value: "fuga",        label: "Fuga" },
  { value: "in_extremis", label: "In extremis" },
];

const TIPO_LABEL: Record<TipoAltaVivo, string> = {
  domicilio:   "Alta a domicilio",
  exigida:     "Alta exigida",
  referido:    "Referido",
  fuga:        "Fuga",
  in_extremis: "In extremis",
};

const TIPO_COLOR: Record<TipoAltaVivo, string> = {
  domicilio:   "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
  exigida:     "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
  referido:    "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  fuga:        "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  in_extremis: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
};

const ESTADO_LABEL: Record<EstadoNotificacionAlta, string> = {
  pendiente:  "Pendiente",
  deposito:   "En depósito",
  suspendida: "Suspendida",
  procesada:  "Procesada",
};

const ESTADO_COLOR: Record<EstadoNotificacionAlta, string> = {
  pendiente:  "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  deposito:   "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700",
  suspendida: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700",
  procesada:  "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const ts = v as { toDate?: () => Date };
  if (ts.toDate) return ts.toDate();
  return new Date(v as string);
};

const formatFecha = (v: unknown) => {
  const d = toDate(v);
  if (!d) return "—";
  return d.toLocaleString("es-HN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

// ── Create Modal (TS) ─────────────────────────────────────────────────────────

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user, profile } = useAuth();
  const { servicios } = useServicios();
  const [servicio, setServicio] = useState("");
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loadingPac, setLoadingPac] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [tipoAlta, setTipoAlta] = useState<TipoAltaVivo | "">("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!servicio) { setPacientes([]); setSelectedId(""); return; }
      setLoadingPac(true);
      setSelectedId("");
      setTipoAlta("");
      getDocs(query(collection(db, "pacientes"), where("servicioActual", "==", servicio)))
        .then(snap => {
          const docs = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as Paciente))
            .filter(p => p.estado === "activo" && p.camaActual);
          docs.sort((a, b) => (a.camaActual ?? "").localeCompare(b.camaActual ?? "", undefined, { numeric: true }));
          setPacientes(docs);
        })
        .catch(() => setPacientes([]))
        .finally(() => setLoadingPac(false));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [servicio]);

  const selectedPaciente = pacientes.find(p => p.id === selectedId) ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !selectedPaciente || !tipoAlta) return;
    setSaving(true);
    setError(null);
    try {
      await addDoc(collection(db, "notificaciones_altas"), {
        notificadoPorId: user.uid,
        notificadoPorNombre: profile.nombre,
        notificadoPorRol: profile.role,
        pacienteId: selectedPaciente.id!,
        pacienteExpediente: selectedPaciente.expediente,
        pacienteNombre: `${selectedPaciente.apellidos}, ${selectedPaciente.nombres}`,
        servicio: selectedPaciente.servicioActual,
        cama: selectedPaciente.camaActual ?? "",
        tipoAlta,
        notas: notas.trim() || null,
        estado: "pendiente",
        creadoEn: Timestamp.now(),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la notificación.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 pt-16 backdrop-blur-sm overflow-y-auto">
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <p className="text-base font-bold text-slate-900 dark:text-slate-100">Nueva notificación de alta</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Servicio */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Servicio</label>
            <select value={servicio} onChange={e => setServicio(e.target.value)} required className={inputCls}>
              <option value="">Seleccionar servicio...</option>
              {servicios.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Pacientes */}
          {servicio && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Paciente (camas activas)</label>
              {loadingPac ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Buscando pacientes activos...
                </div>
              ) : pacientes.length === 0 ? (
                <p className="text-sm text-slate-400 py-2 px-1">No hay pacientes activos en este servicio.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {pacientes.map(p => (
                    <button key={p.id} type="button" onClick={() => setSelectedId(p.id!)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                        selectedId === p.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-1 ring-blue-500/30"
                          : "border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-800"
                      }`}>
                      <span className="inline-block font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 rounded px-1.5 py-0.5 mr-2">
                        Cama {p.camaActual}
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{p.apellidos}, {p.nombres}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tipo de alta */}
          {selectedId && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Tipo de alta</label>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS_ALTA.map(t => (
                  <button key={t.value} type="button" onClick={() => setTipoAlta(t.value)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      tipoAlta === t.value
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-300"
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notas */}
          {selectedId && tipoAlta && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Notas <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                className={`${inputCls} resize-none`} />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="flex-1 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !selectedId || !tipoAlta}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
              {saving ? "Guardando..." : "Notificar alta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────

function ConfirmModal({
  title, message, confirmLabel, confirmCls,
  onConfirm, onCancel, loading,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmCls: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div>
          <p className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</p>
          <p className="text-sm text-slate-500 mt-1">{message}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-50 ${confirmCls}`}>
            {loading ? "Procesando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AltasVivosPage() {
  const { user, profile } = useAuth();
  const isTS = profile?.role === "trabajo_social";
  const isEsdomed = profile?.role === "esdomed" || profile?.role === "admin";

  const [notificaciones, setNotificaciones] = useState<NotificacionAltaVivo[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoNotificacionAlta | "todas">("todas");
  const [fechaDesde, setFechaDesde] = useState(() => new Date().toISOString().split("T")[0]);
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split("T")[0]);

  const [showCreate, setShowCreate] = useState(false);
  const [createdBanner, setCreatedBanner] = useState(false);

  // Per-card state: archiving, editing tipo
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archivingTarget, setArchivingTarget] = useState<"deposito" | "suspendida" | null>(null);
  const [archivingLoading, setArchivingLoading] = useState(false);

  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [procesandoLoading, setProcesandoLoading] = useState(false);

  const [editingTipoId, setEditingTipoId] = useState<string | null>(null);
  const [editingTipoLoading, setEditingTipoLoading] = useState(false);
  const [openArchiveMenuId, setOpenArchiveMenuId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "notificaciones_altas"), orderBy("creadoEn", "desc"));
    return onSnapshot(q, snap => {
      setNotificaciones(snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionAltaVivo)));
    });
  }, []);

  const displayList = notificaciones.filter(n => {
    if (busqueda) {
      const b = busqueda.toLowerCase();
      if (!n.pacienteNombre.toLowerCase().includes(b) && !n.pacienteExpediente.toLowerCase().includes(b)) return false;
    }
    if (filtroEstado !== "todas" && n.estado !== filtroEstado) return false;
    if (fechaDesde || fechaHasta) {
      const d = toDate(n.creadoEn);
      if (!d) return false;
      if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
      if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    }
    return true;
  });

  const archivarNotificacion = async (estado: "deposito" | "suspendida") => {
    if (!archivingId || !user || !profile) return;
    setArchivingLoading(true);
    try {
      await updateDoc(doc(db, "notificaciones_altas", archivingId), {
        estado,
        modificadoPorId: user.uid,
        modificadoPorNombre: profile.nombre,
        modificadoEn: Timestamp.now(),
      });
    } finally {
      setArchivingLoading(false);
      setArchivingId(null);
      setArchivingTarget(null);
    }
  };

  const procesarNotificacion = async () => {
    if (!procesandoId || !user || !profile) return;
    setProcesandoLoading(true);
    try {
      await updateDoc(doc(db, "notificaciones_altas", procesandoId), {
        estado: "procesada",
        procesadoPorId: user.uid,
        procesadoPorNombre: profile.nombre,
        procesadoEn: Timestamp.now(),
      });
    } finally {
      setProcesandoLoading(false);
      setProcesandoId(null);
    }
  };

  const cambiarTipoAlta = async (id: string, tipo: TipoAltaVivo) => {
    if (!user || !profile) return;
    setEditingTipoId(id);
    setEditingTipoLoading(true);
    try {
      await updateDoc(doc(db, "notificaciones_altas", id), {
        tipoAlta: tipo,
        modificadoPorId: user.uid,
        modificadoPorNombre: profile.nombre,
        modificadoEn: Timestamp.now(),
      });
    } finally {
      setEditingTipoLoading(false);
      setEditingTipoId(null);
    }
  };

  const archivingNot = archivingId ? notificaciones.find(n => n.id === archivingId) : null;
  const procesandoNot = procesandoId ? notificaciones.find(n => n.id === procesandoId) : null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-teal-50 dark:bg-teal-950 rounded-xl flex items-center justify-center border border-teal-200 dark:border-teal-900">
            <LogIn size={17} className="text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Altas Vivos</h1>
            <p className="text-xs text-slate-500">Notificaciones de egreso de pacientes</p>
          </div>
        </div>
        {isTS && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
            <Plus size={15} /> Nueva
          </button>
        )}
      </div>

      {/* Banner de éxito creación */}
      {createdBanner && (
        <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 rounded-xl text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 size={16} />
          Notificación registrada correctamente.
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Buscar paciente o expediente..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
        </div>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as EstadoNotificacionAlta | "todas")}
          className="px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100">
          <option value="todas">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="procesada">Procesada</option>
          <option value="deposito">En depósito</option>
          <option value="suspendida">Suspendida</option>
        </select>
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
        {(busqueda || filtroEstado !== "todas") && (
          <button onClick={() => { setBusqueda(""); setFiltroEstado("todas"); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {displayList.length === 0 && (
          <p className="text-sm text-slate-500 py-10 text-center">
            {notificaciones.length === 0 ? "No hay notificaciones de altas vivos." : "Sin resultados para los filtros aplicados."}
          </p>
        )}

        {displayList.map(n => {
          const isLocked = n.estado === "procesada" || n.estado === "deposito" || n.estado === "suspendida";
          const editingTipo = editingTipoId === n.id && editingTipoLoading;

          return (
            <div key={n.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 transition-all hover:border-teal-200 dark:hover:border-teal-900">
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{n.pacienteNombre}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Exp. {n.pacienteExpediente}
                    {n.cama && <> · Cama {n.cama}</>}
                    {" · "}{n.servicio}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ESTADO_COLOR[n.estado]}`}>
                    {ESTADO_LABEL[n.estado]}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${TIPO_COLOR[n.tipoAlta]}`}>
                    {TIPO_LABEL[n.tipoAlta]}
                  </span>
                </div>
              </div>

              {/* Meta */}
              <div className="mt-2 space-y-0.5">
                <p className="text-xs text-slate-400">
                  Notificado por <span className="text-slate-500 font-medium">{n.notificadoPorNombre}</span>
                  {" "}({n.notificadoPorRol === "enfermeria" ? "Enfermería" : "Trabajo Social"})
                  {" · "}{formatFecha(n.creadoEn)}
                </p>
                {n.modificadoPorNombre && (
                  <p className="text-xs text-slate-400">
                    Modificado por <span className="text-slate-500 font-medium">{n.modificadoPorNombre}</span>
                    {" · "}{formatFecha(n.modificadoEn)}
                  </p>
                )}
                {n.estado === "procesada" && n.procesadoPorNombre && (
                  <p className="text-xs text-green-600 dark:text-green-500 font-medium">
                    Procesado por {n.procesadoPorNombre} · {formatFecha(n.procesadoEn)}
                  </p>
                )}
                {n.notas && (
                  <p className="text-xs text-slate-400 italic">Nota: {n.notas}</p>
                )}
              </div>

              {/* Actions */}
              {!isLocked && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">

                  {/* ESDOMED: procesar */}
                  {isEsdomed && (
                    <button
                      onClick={() => setProcesandoId(n.id!)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors"
                    >
                      <Check size={13} />
                      Acusar de recibido y dar alta en SIS
                    </button>
                  )}

                  {/* TS: editar tipo + archivar */}
                  {isTS && (
                    <>
                      {/* Editar tipo */}
                      <div className="relative">
                        <button
                          onClick={() => setEditingTipoId(editingTipoId === n.id ? null : n.id!)}
                          disabled={editingTipo}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Editar tipo
                          <ChevronDown size={12} />
                        </button>
                        {editingTipoId === n.id && !editingTipoLoading && (
                          <div className="absolute top-full left-0 mt-1 z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden w-44">
                            {TIPOS_ALTA.map(t => (
                              <button key={t.value} type="button"
                                onClick={() => { cambiarTipoAlta(n.id!, t.value); setEditingTipoId(null); }}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                                  n.tipoAlta === t.value ? "font-semibold text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-300"
                                }`}>
                                {t.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Archivar */}
                      <div className="relative">
                        <button
                          onClick={() => setOpenArchiveMenuId(openArchiveMenuId === n.id ? null : n.id!)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          <Archive size={12} />
                          Archivar
                          <ChevronDown size={12} />
                        </button>
                        {openArchiveMenuId === n.id && (
                          <div className="absolute top-full left-0 mt-1 z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden w-44">
                            <button type="button"
                              onClick={() => { setArchivingId(n.id!); setArchivingTarget("deposito"); setOpenArchiveMenuId(null); }}
                              className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                              En depósito
                            </button>
                            <button type="button"
                              onClick={() => { setArchivingId(n.id!); setArchivingTarget("suspendida"); setOpenArchiveMenuId(null); }}
                              className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                              Suspendida
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setCreatedBanner(true);
            setTimeout(() => setCreatedBanner(false), 4000);
          }}
        />
      )}

      {/* Archivar confirm */}
      {archivingId && archivingTarget && archivingNot && (
        <ConfirmModal
          title={archivingTarget === "deposito" ? "Archivar como En depósito" : "Suspender notificación"}
          message={`La notificación de ${archivingNot.pacienteNombre} quedará archivada y no podrá editarse más.`}
          confirmLabel={archivingTarget === "deposito" ? "Archivar" : "Suspender"}
          confirmCls="bg-slate-700 hover:bg-slate-600"
          onConfirm={() => archivarNotificacion(archivingTarget)}
          onCancel={() => { setArchivingId(null); setArchivingTarget(null); }}
          loading={archivingLoading}
        />
      )}

      {/* Procesar confirm */}
      {procesandoId && procesandoNot && (
        <ConfirmModal
          title="Acusar de recibido y dar alta en SIS"
          message={`Confirma que recibiste la notificación de ${procesandoNot.pacienteNombre} y que se dio de alta en el SIS. Esta acción no se puede deshacer.`}
          confirmLabel="Confirmar"
          confirmCls="bg-teal-600 hover:bg-teal-500"
          onConfirm={procesarNotificacion}
          onCancel={() => setProcesandoId(null)}
          loading={procesandoLoading}
        />
      )}

      {/* Click outside to close dropdowns */}
      {(editingTipoId || openArchiveMenuId) && (
        <div className="fixed inset-0 z-[5]"
          onClick={() => { setEditingTipoId(null); setOpenArchiveMenuId(null); }} />
      )}
    </div>
  );
}
