"use client";

import { useState, useEffect } from "react";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  LogIn, Plus, X, CheckCircle2, AlertCircle, Search,
  Check, MessageSquareWarning, Pencil,
} from "lucide-react";
import { BuscadorPacienteActivo } from "@/components/pacientes/BuscadorPacienteActivo";
import type {
  EstadoNotificacionAlta,
  MotivoObservacionAlta,
  NotificacionAltaVivo,
  Paciente,
  TipoAltaVivo,
} from "@/types";

// ── Labels & badges ──────────────────────────────────────────────────────────

const TIPOS_ALTA: { value: TipoAltaVivo; label: string }[] = [
  { value: "domicilio",   label: "Alta a domicilio" },
  { value: "exigida",     label: "Alta exigida" },
  { value: "referido",    label: "Referido" },
  { value: "fuga",        label: "Fuga" },
  { value: "in_extremis", label: "In extremis" },
  { value: "deposito",    label: "En deposito" },
  { value: "suspendida",  label: "Suspendida" },
];

const TIPO_LABEL: Record<TipoAltaVivo, string> = {
  domicilio:   "Alta a domicilio",
  exigida:     "Alta exigida",
  referido:    "Referido",
  fuga:        "Fuga",
  in_extremis: "In extremis",
  deposito:    "En deposito",
  suspendida:  "Suspendida",
};

const ESTADO_LABEL: Record<EstadoNotificacionAlta, string> = {
  pendiente:  "Pendiente",
  observada:  "Requiere correccion",
  deposito:   "En depósito",
  suspendida: "Suspendida",
  procesada:  "Alta efectiva",
  recibida:   "Acusada de recibido",
};

const ESTADO_COLOR: Record<EstadoNotificacionAlta, string> = {
  pendiente:  "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  observada:  "bg-rose-50/70 dark:bg-rose-950/40 text-slate-800 dark:text-rose-100 border-rose-200/80 dark:border-rose-900/70",
  deposito:   "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700",
  suspendida: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700",
  procesada:  "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
  recibida:   "bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-900",
};

const OBSERVACION_LABEL: Record<MotivoObservacionAlta, string> = {
  cama_expediente: "Error de cama o expediente",
  expediente_duplicado: "Expediente duplicado",
  no_subido_sis: "No aparece subido en SIS",
  otro: "Otra observacion",
};

const OBSERVACION_DEFAULT: Record<MotivoObservacionAlta, string> = {
  cama_expediente: "Verificar cama y expediente reportado; los datos no coinciden para procesar el alta.",
  expediente_duplicado: "El expediente aparece duplicado. Revisar antes de reenviar la notificacion.",
  no_subido_sis: "El paciente no aparece subido en SIS al momento de la notificacion. Subirlo y reenviar la correccion.",
  otro: "",
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
  return d.toLocaleString("es-HN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
};

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

const esSoloAcuseRecibido = (tipo: TipoAltaVivo) => tipo === "deposito" || tipo === "suspendida";

const estadoInicialPorTipo = (tipo: TipoAltaVivo): EstadoNotificacionAlta => {
  if (tipo === "deposito") return "deposito";
  if (tipo === "suspendida") return "suspendida";
  return "pendiente";
};

const estadoBadgeLabel = (n: NotificacionAltaVivo) =>
  n.estado === "recibida" && esSoloAcuseRecibido(n.tipoAlta)
    ? TIPO_LABEL[n.tipoAlta]
    : ESTADO_LABEL[n.estado];

const estadoBadgeColor = (n: NotificacionAltaVivo) => {
  if (n.estado === "recibida" && n.tipoAlta === "deposito") return ESTADO_COLOR.deposito;
  if (n.estado === "recibida" && n.tipoAlta === "suspendida") return ESTADO_COLOR.suspendida;
  return ESTADO_COLOR[n.estado];
};

// ── Create Modal (TS) ─────────────────────────────────────────────────────────

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user, profile } = useAuth();
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const [tipoAlta, setTipoAlta] = useState<TipoAltaVivo | "">("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        estado: estadoInicialPorTipo(tipoAlta),
        rectificacionUsada: false,
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
          {/* Buscar paciente: por servicio, expediente o cama */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Buscar paciente</label>
            <BuscadorPacienteActivo
              value={selectedPaciente}
              onSelect={(p) => { setSelectedPaciente(p); if (!p) setTipoAlta(""); }}
              accent="blue"
            />
          </div>

          {/* Tipo de alta */}
          {selectedPaciente && (
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
          {selectedPaciente && tipoAlta && (
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
            <button type="submit" disabled={saving || !selectedPaciente || !tipoAlta}
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

function ObservacionModal({
  notificacion,
  onConfirm,
  onCancel,
  loading,
}: {
  notificacion: NotificacionAltaVivo;
  onConfirm: (motivo: MotivoObservacionAlta, detalle: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [motivo, setMotivo] = useState<MotivoObservacionAlta>("cama_expediente");
  const [detalle, setDetalle] = useState(OBSERVACION_DEFAULT.cama_expediente);

  const elegirMotivo = (value: MotivoObservacionAlta) => {
    setMotivo(value);
    setDetalle(OBSERVACION_DEFAULT[value]);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 pt-16 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 flex items-center justify-center shrink-0">
            <MessageSquareWarning size={18} className="text-rose-600 dark:text-rose-300" />
          </div>
          <div>
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">Marcar con observacion</p>
            <p className="text-sm text-slate-500 mt-1">
              El equipo que notifico vera el motivo para corregir la notificacion de {notificacion.pacienteNombre}.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(Object.keys(OBSERVACION_LABEL) as MotivoObservacionAlta[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => elegirMotivo(value)}
              className={`px-3 py-2 rounded-lg border text-left text-xs font-semibold transition-all ${
                motivo === value
                  ? "border-rose-500 bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30"
                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-rose-300"
              }`}
            >
              {OBSERVACION_LABEL[value]}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Mensaje para Enfermeria</label>
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            rows={3}
            className={`${inputCls} resize-none focus:ring-rose-500`}
            placeholder="Describe que debe corregirse..."
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(motivo, detalle)}
            disabled={loading || !detalle.trim()}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
          >
            {loading ? "Guardando..." : "Enviar observacion"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RectificacionModal({
  notificacion,
  onClose,
  onSaved,
}: {
  notificacion: NotificacionAltaVivo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const [tipoAlta, setTipoAlta] = useState<TipoAltaVivo | "">(notificacion.tipoAlta);
  const [notas, setNotas] = useState(notificacion.notas ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardarRectificacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !notificacion.id || !tipoAlta) return;

    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/altas/${notificacion.id}/rectificar`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paciente: selectedPaciente
            ? {
                id: selectedPaciente.id,
                expediente: selectedPaciente.expediente,
                apellidos: selectedPaciente.apellidos,
                nombres: selectedPaciente.nombres,
                servicioActual: selectedPaciente.servicioActual,
                camaActual: selectedPaciente.camaActual ?? "",
              }
            : null,
          tipoAlta,
          notas: notas.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "No se pudo guardar la rectificacion.");
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la rectificacion.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 pt-16 backdrop-blur-sm overflow-y-auto">
      <form onSubmit={guardarRectificacion} className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
          aria-label="Cerrar"
        >
          <X size={15} />
        </button>

        <div>
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Rectificacion unica</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Actualizar notificacion</h2>
          <p className="text-xs text-slate-500 mt-1">
            Puedes corregir paciente, tipo de alta o nota antes de que ESDOMED cierre el caso.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Paciente actual</label>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{notificacion.pacienteNombre}</p>
            <p className="text-xs text-slate-500">Exp. {notificacion.pacienteExpediente} - {notificacion.servicio}</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Cambiar paciente <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <BuscadorPacienteActivo value={selectedPaciente} onSelect={(p) => setSelectedPaciente(p)} accent="blue" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Tipo de alta</label>
          <div className="grid grid-cols-2 gap-2">
            {TIPOS_ALTA.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTipoAlta(t.value)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                  tipoAlta === t.value
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Notas <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="mt-0.5" />
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !tipoAlta}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
          >
            {saving ? "Guardando..." : "Guardar rectificacion"}
          </button>
        </div>
      </form>
    </div>
  );
}

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

  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [procesandoLoading, setProcesandoLoading] = useState(false);

  const [observandoId, setObservandoId] = useState<string | null>(null);
  const [observandoLoading, setObservandoLoading] = useState(false);
  const [quitandoObservacionId, setQuitandoObservacionId] = useState<string | null>(null);
  const [rectificando, setRectificando] = useState<NotificacionAltaVivo | null>(null);

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

  const procesarNotificacion = async () => {
    if (!procesandoId || !user || !profile) return;
    setProcesandoLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/esdomed/altas/${procesandoId}/estado`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "procesar" }),
      });
      if (!res.ok) throw new Error("No se pudo procesar la notificacion.");
    } finally {
      setProcesandoLoading(false);
      setProcesandoId(null);
    }
  };

  const observarNotificacion = async (motivo: MotivoObservacionAlta, detalle: string) => {
    if (!observandoId || !user || !profile) return;
    setObservandoLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/esdomed/altas/${observandoId}/estado`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "observar", motivo, detalle }),
      });
      if (!res.ok) throw new Error("No se pudo guardar la observacion.");
    } finally {
      setObservandoLoading(false);
      setObservandoId(null);
    }
  };

  const quitarObservacion = async (id: string) => {
    if (!user || !profile) return;
    setQuitandoObservacionId(id);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/esdomed/altas/${id}/estado`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "quitar_observacion" }),
      });
      if (!res.ok) throw new Error("No se pudo quitar la observacion.");
    } finally {
      setQuitandoObservacionId(null);
    }
  };

  const procesandoNot = procesandoId ? notificaciones.find(n => n.id === procesandoId) : null;
  const observandoNot = observandoId ? notificaciones.find(n => n.id === observandoId) : null;

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
          Cambio guardado correctamente.
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
          <option value="observada">Requiere correccion</option>
          <option value="procesada">Alta efectiva</option>
          <option value="recibida">Acusada de recibido</option>
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
          const requiereSoloAcuse = esSoloAcuseRecibido(n.tipoAlta);
          const isLocked = n.estado === "procesada" || n.estado === "recibida" || n.estado === "deposito" || n.estado === "suspendida";
          const puedeRectificarTS =
            isTS &&
            (n.estado === "pendiente" || n.estado === "observada") &&
            !n.rectificacionUsada &&
            n.notificadoPorRol === "trabajo_social";

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
                    <span className="mx-1.5 text-slate-300">|</span>
                    <span className="font-medium text-slate-600 dark:text-slate-300">{TIPO_LABEL[n.tipoAlta]}</span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${estadoBadgeColor(n)}`}>
                    {estadoBadgeLabel(n)}
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
                    Alta efectiva por {n.procesadoPorNombre} · {formatFecha(n.procesadoEn)}
                  </p>
                )}
                {n.estado === "recibida" && n.procesadoPorNombre && (
                  <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                    Acusada de recibido por {n.procesadoPorNombre} · {formatFecha(n.procesadoEn)}
                  </p>
                )}
                {n.observacionEsdomedMotivo && (
                  <details className="group mt-2 rounded-lg border border-rose-200/70 dark:border-rose-800/70 bg-rose-50/70 dark:bg-rose-950/30 px-3 py-2 text-slate-900 dark:text-slate-100">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold">
                      <span>{OBSERVACION_LABEL[n.observacionEsdomedMotivo]}</span>
                      <span className="shrink-0 text-[11px] font-medium underline-offset-2 group-open:hidden">Ver detalle</span>
                      <span className="hidden shrink-0 text-[11px] font-medium underline-offset-2 group-open:inline">Ocultar</span>
                    </summary>
                    {n.observacionEsdomedDetalle && (
                      <p className="mt-2 border-t border-rose-200/80 dark:border-rose-900 pt-2 text-xs leading-relaxed">{n.observacionEsdomedDetalle}</p>
                    )}
                    {n.observadoPorNombre && (
                      <p className="mt-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        Observado por {n.observadoPorNombre} - {formatFecha(n.observadoEn)}
                      </p>
                    )}
                  </details>
                )}
                {n.notas && (
                  <p className="text-xs text-slate-400 italic">Nota: {n.notas}</p>
                )}
              </div>

              {/* Actions */}
              {!isLocked && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">

                  {/* ESDOMED: procesar */}
                  {isEsdomed && requiereSoloAcuse ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg">
                      No requiere gestion adicional de ESDOMED
                    </span>
                  ) : isEsdomed && (
                    <>
                      <button
                        onClick={() => setProcesandoId(n.id!)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors"
                      >
                        <Check size={13} />
                        {requiereSoloAcuse ? "Acusar de recibido" : "Acusar de recibido y dar alta en SIS"}
                      </button>
                      <button
                        onClick={() => setObservandoId(n.id!)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1c1e4d] dark:text-amber-100 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 rounded-lg transition-colors"
                      >
                        <MessageSquareWarning size={13} />
                        {n.estado === "observada" ? "Cambiar observacion" : "Marcar con observacion"}
                      </button>
                      {n.estado === "observada" && (
                        <button
                          onClick={() => quitarObservacion(n.id!)}
                          disabled={quitandoObservacionId === n.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {quitandoObservacionId === n.id ? "Quitando..." : "Quitar observacion"}
                        </button>
                      )}
                    </>
                  )}

                  {puedeRectificarTS && (
                    <button
                      type="button"
                      onClick={() => setRectificando(n)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors"
                    >
                      <Pencil size={12} />
                      {n.estado === "observada" ? "Corregir observacion" : "Rectificar una vez"}
                    </button>
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

      {/* Procesar confirm */}
      {procesandoId && procesandoNot && (
        <ConfirmModal
          title={esSoloAcuseRecibido(procesandoNot.tipoAlta) ? "Acusar de recibido" : "Acusar de recibido y dar alta en SIS"}
          message={
            esSoloAcuseRecibido(procesandoNot.tipoAlta)
              ? `Confirma que recibiste la notificación de ${procesandoNot.pacienteNombre}. Quedará cerrada como acuse de recibido, sin alta efectiva.`
              : `Confirma que recibiste la notificación de ${procesandoNot.pacienteNombre} y que se dio de alta en el SIS. Esta acción no se puede deshacer.`
          }
          confirmLabel="Confirmar"
          confirmCls="bg-teal-600 hover:bg-teal-500"
          onConfirm={procesarNotificacion}
          onCancel={() => setProcesandoId(null)}
          loading={procesandoLoading}
        />
      )}

      {observandoId && observandoNot && (
        <ObservacionModal
          notificacion={observandoNot}
          onConfirm={observarNotificacion}
          onCancel={() => setObservandoId(null)}
          loading={observandoLoading}
        />
      )}

      {rectificando && (
        <RectificacionModal
          notificacion={rectificando}
          onClose={() => setRectificando(null)}
          onSaved={() => {
            setCreatedBanner(true);
            setTimeout(() => setCreatedBanner(false), 4000);
          }}
        />
      )}
    </div>
  );
}
