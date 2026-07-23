"use client";

import { useState, useEffect, useMemo } from "react";
import {
  collection, query, where, orderBy, onSnapshot, getDocs, limit,
  addDoc, Timestamp,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  LogIn, Plus, X, CheckCircle2, AlertCircle, Search, Ban,
  Check, MessageSquareWarning, Pencil, ChevronLeft, ChevronRight, Download, Undo2,
  Inbox, History,
} from "lucide-react";
import { BuscadorPacienteActivo } from "@/components/pacientes/BuscadorPacienteActivo";
import { DateField } from "@/components/ui/DateField";
import { notificacionAltaAbierta, fmtCuando } from "@/lib/altas/duplicados";
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
  duplicada:  "Duplicada",
  revertida:  "Alta revertida",
  rechazada:  "Rechazada",
};

const ESTADO_COLOR: Record<EstadoNotificacionAlta, string> = {
  pendiente:  "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  observada:  "bg-rose-50/70 dark:bg-rose-950/40 text-slate-800 dark:text-rose-100 border-rose-200/80 dark:border-rose-900/70",
  deposito:   "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700",
  suspendida: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700",
  procesada:  "bg-blue-50 dark:bg-[var(--color-institutional-navy)] text-[#1c1e4d] dark:text-[#dce6ff] border-[#c9a892]/60 dark:border-[#c9a892]/40",
  recibida:   "bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-900",
  duplicada:  "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  revertida:  "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900",
  rechazada:  "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900",
};

const ESTADO_DOT: Record<EstadoNotificacionAlta, string> = {
  pendiente:  "bg-amber-500",
  observada:  "bg-rose-500",
  deposito:   "bg-slate-400",
  suspendida: "bg-slate-400",
  procesada:  "bg-[#1c1e4d] dark:bg-[#c9a892]",
  recibida:   "bg-sky-500",
  duplicada:  "bg-slate-400",
  revertida:  "bg-orange-500",
  rechazada:  "bg-red-500",
};

// Orden de los contadores por estado (también funcionan como filtro rápido).
const COUNTER_ESTADOS: EstadoNotificacionAlta[] = [
  "pendiente", "observada", "procesada", "recibida", "deposito", "suspendida", "duplicada", "revertida", "rechazada",
];

// Chips siempre visibles (trabajo real de ESDOMED). El resto son estados
// excepcionales o informativos: su chip solo aparece cuando hay casos.
const COUNTER_ESTADOS_FIJOS: EstadoNotificacionAlta[] = ["pendiente", "observada", "procesada"];

// Estados accionables: se mantienen en la bandeja en vivo aunque sean de días
// anteriores, para no perder trabajo sin procesar.
const ESTADOS_ACCIONABLES: EstadoNotificacionAlta[] = ["pendiente", "observada"];

const PAGE_SIZE = 12;

const OBSERVACION_LABEL: Record<MotivoObservacionAlta, string> = {
  cama_expediente: "Datos de cama o expediente no coinciden",
  expediente_duplicado: "Expediente duplicado",
  no_subido_sis: "Pre-alta no registrada en SIS",
  otro: "Otra situacion a corregir",
};

const OBSERVACION_DEFAULT: Record<MotivoObservacionAlta, string> = {
  cama_expediente: "Los datos de cama o expediente no coinciden con la informacion disponible para procesar el alta. Verificar y reenviar la correccion.",
  expediente_duplicado: "El expediente se encuentra duplicado. Confirmar el registro correcto antes de reenviar la correccion.",
  no_subido_sis: "No se encuentra registrada en SIS la pre-alta del paciente. Verificar el registro y reenviar la correccion.",
  otro: "",
};

const OBSERVACION_MOTIVOS: MotivoObservacionAlta[] = [
  "cama_expediente",
  "no_subido_sis",
  "otro",
];

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

/* Acción primaria institucional: marino con hairline dorado arena (mismo lenguaje que enfermería y el sidebar). */
const primaryBtnCls = "bg-[#1c1e4d] hover:bg-[#2f48aa] text-white ring-1 ring-inset ring-[#c9a892]/40 dark:ring-[#c9a892]/50";

/* Estado seleccionado institucional para chips/selecciones (eco del estado activo del sidebar). */
const selectedChipCls = "border-[#1c1e4d] bg-blue-50 text-[#1c1e4d] ring-1 ring-[#c9a892]/45 dark:border-[#c9a892]/50 dark:bg-[var(--color-institutional-navy)] dark:text-white";

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

const esRolEsdomed = (rol?: string) => rol === "esdomed" || rol === "admin";

const fueModificadaPorEsdomed = (n: NotificacionAltaVivo) =>
  esRolEsdomed(n.modificadoPorRol) ||
  (Boolean(n.modificadoPorId) &&
    (n.modificadoPorId === n.procesadoPorId || n.modificadoPorId === n.observadoPorId));

const nombreEsdomedVisible = (mostrarNombre: boolean, nombre?: string) =>
  mostrarNombre ? nombre ?? "ESDOMED" : "ESDOMED";

// ── Create Modal (TS) ─────────────────────────────────────────────────────────

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user, profile } = useAuth();
  const esGenerico = !!profile?.generico;
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const [tipoAlta, setTipoAlta] = useState<TipoAltaVivo | "">("");
  const [persona, setPersona] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !selectedPaciente || !tipoAlta) return;
    // Cuentas genéricas (compartidas por servicio): exigir el nombre real de quien notifica.
    if (esGenerico && !persona.trim()) {
      setError("Escribe el nombre de quien notifica.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Pre-chequeo: evitar duplicados si el paciente ya tiene una alta abierta.
      const dup = await notificacionAltaAbierta(selectedPaciente.id!);
      if (dup) {
        setError(`Este paciente ya tiene una notificación de alta sin procesar${dup.por ? `, registrada por ${dup.por}` : ""}${dup.cuando ? ` (${fmtCuando(dup.cuando)})` : ""}.`);
        setSaving(false);
        return;
      }
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
        ...(esGenerico ? { notificadoPorPersona: persona.trim() } : {}),
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
              accent="navy"
            />
          </div>

          {/* Nombre de quien notifica — solo cuentas genéricas (compartidas por servicio) */}
          {selectedPaciente && esGenerico && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Nombre de quien notifica <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={persona}
                onChange={e => setPersona(e.target.value)}
                placeholder="Nombre del enfermero/a que reporta"
                className={inputCls}
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Esta cuenta es compartida del servicio; indica quién está reportando.
              </p>
            </div>
          )}

          {/* Tipo de alta */}
          {selectedPaciente && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Tipo de alta</label>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS_ALTA.map(t => (
                  <button key={t.value} type="button" onClick={() => setTipoAlta(t.value)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      tipoAlta === t.value
                        ? selectedChipCls
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-[#c9a892]/70"
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
            <button type="submit" disabled={saving || !selectedPaciente || !tipoAlta || (esGenerico && !persona.trim())}
              className={`flex-1 py-2.5 ${primaryBtnCls} text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors`}>
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
  onConfirm, onCancel, loading, children,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmCls: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div>
          <p className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</p>
          <p className="text-sm text-slate-500 mt-1">{message}</p>
        </div>
        {children}
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

// ── Revertir Modal ─────────────────────────────────────────────────────────────

function RevertirModal({
  notificacion, onConfirm, onCancel, loading,
}: {
  notificacion: NotificacionAltaVivo;
  onConfirm: (nota: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [nota, setNota] = useState("");
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-900 flex items-center justify-center shrink-0">
            <Undo2 size={18} className="text-orange-600 dark:text-orange-300" />
          </div>
          <div>
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">Revertir alta efectiva</p>
            <p className="text-sm text-slate-500 mt-1">
              {notificacion.pacienteNombre} volverá a estar activo en Pacientes, se restaurarán sus tarjetas de visita y la notificación quedará cerrada como revertida. Úsalo solo si confirmaste que el paciente no se fue.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Nota de reversión <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            className={`${inputCls} resize-none focus:ring-orange-500`}
            placeholder="Ej. Familiar llamó: el paciente sigue internado, no egresó..."
          />
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={() => onConfirm(nota)} disabled={loading}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-500 rounded-xl transition-colors disabled:opacity-50">
            {loading ? "Procesando..." : "Revertir y reactivar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Digitador SIMMOW: select reusable + modal de corrección ───────────────────

function SelectDigitadorSimmow({
  value, onChange, personal, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  personal: string[];
  disabled?: boolean;
}) {
  // Si el valor guardado ya no está en el catálogo (personal dado de baja), se
  // conserva como opción para no perderlo al abrir el select.
  const opciones = personal.includes(value) || !value ? personal : [value, ...personal];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`${inputCls} cursor-pointer`}
    >
      <option value="">Pendiente / lo digita otra persona</option>
      {opciones.map((n) => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
  );
}

function SimmowModal({
  notificacion, personal, onConfirm, onCancel, loading,
}: {
  notificacion: NotificacionAltaVivo;
  personal: string[];
  onConfirm: (nombre: string | null) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [nombre, setNombre] = useState(notificacion.digitaSimmow ?? "");
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div>
          <p className="text-base font-bold text-slate-900 dark:text-slate-100">
            {notificacion.digitaSimmow ? "Corregir digitador SIMMOW" : "Registrar digitador SIMMOW"}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Indica quién digitó el egreso de {notificacion.pacienteNombre} en SIMMOW.
          </p>
        </div>
        <SelectDigitadorSimmow value={nombre} onChange={setNombre} personal={personal} disabled={loading} />
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={() => onConfirm(nombre || null)} disabled={loading}
            className={`flex-1 py-2.5 text-sm font-semibold ${primaryBtnCls} rounded-xl transition-colors disabled:opacity-50`}>
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rechazar Modal ─────────────────────────────────────────────────────────────

function RechazarModal({
  notificacion, onConfirm, onCancel, loading,
}: {
  notificacion: NotificacionAltaVivo;
  onConfirm: (nota: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [nota, setNota] = useState("");
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 flex items-center justify-center shrink-0">
            <Ban size={18} className="text-red-600 dark:text-red-300" />
          </div>
          <div>
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">Rechazar notificación</p>
            <p className="text-sm text-slate-500 mt-1">
              La notificación de {notificacion.pacienteNombre} quedará cerrada como <strong>Rechazada</strong> (no procede el alta). No cambia el estado del paciente. El equipo que notificó verá tu nota; si el alta sí corresponde, deberán enviar una notificación nueva.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Motivo del rechazo <span className="text-red-500">*</span>
          </label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            autoFocus
            className={`${inputCls} resize-none focus:ring-red-500`}
            placeholder="Ej. El paciente no está en proceso de alta; la notificación se envió por error..."
          />
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={() => onConfirm(nota)} disabled={loading || !nota.trim()}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-colors disabled:opacity-50">
            {loading ? "Procesando..." : "Rechazar"}
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
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">
              {notificacion.estado === "revertida" ? "Dejar en espera con observación" : "Marcar con observacion"}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {notificacion.estado === "revertida"
                ? `La notificación de ${notificacion.pacienteNombre} quedará en espera con tu comentario visible para el equipo que notificó. Cuando se resuelva, podrás marcarla como efectiva de nuevo.`
                : `El equipo que notifico vera el motivo para corregir la notificacion de ${notificacion.pacienteNombre}.`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {OBSERVACION_MOTIVOS.map((value) => (
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
          <BuscadorPacienteActivo value={selectedPaciente} onSelect={(p) => setSelectedPaciente(p)} accent="navy" />
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
                    ? selectedChipCls
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-[#c9a892]/70"
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
            className={`flex-1 py-2.5 ${primaryBtnCls} text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors`}
          >
            {saving ? "Guardando..." : "Guardar rectificacion"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ChipContador({
  label, count, active, onClick, dot,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
        active
          ? selectedChipCls
          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
    >
      {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
      <span>{label}</span>
      <span className="tabular-nums font-bold text-slate-900 dark:text-slate-100">{count}</span>
    </button>
  );
}

export function AltasVivosView() {
  const { user, profile } = useAuth();
  const isTS = profile?.role === "trabajo_social";
  const isEsdomed = profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";

  const [recientes, setRecientes] = useState<NotificacionAltaVivo[]>([]);
  const [accionables, setAccionables] = useState<NotificacionAltaVivo[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoNotificacionAlta | "todas">("todas");
  const [vista, setVista] = useState<"bandeja" | "buscar">("bandeja");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [resultados, setResultados] = useState<NotificacionAltaVivo[] | null>(null); // null = aún no se busca
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState("");
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [createdBanner, setCreatedBanner] = useState(false);

  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [procesandoLoading, setProcesandoLoading] = useState(false);
  // Quién digita en SIMMOW: default = quien procesa; editable en el modal de
  // alta efectiva y corregible después sobre la procesada (SimmowModal).
  const [digitadorSimmow, setDigitadorSimmow] = useState("");
  const [simmowId, setSimmowId] = useState<string | null>(null);
  const [simmowLoading, setSimmowLoading] = useState(false);
  const [personalEsdomed, setPersonalEsdomed] = useState<string[]>([]);

  const [revirtiendoId, setRevirtiendoId] = useState<string | null>(null);
  const [revirtiendoLoading, setRevirtiendoLoading] = useState(false);

  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [rechazandoLoading, setRechazandoLoading] = useState(false);

  const [reabriendoId, setReabriendoId] = useState<string | null>(null);

  const [observandoId, setObservandoId] = useState<string | null>(null);
  const [observandoLoading, setObservandoLoading] = useState(false);
  const [quitandoObservacionId, setQuitandoObservacionId] = useState<string | null>(null);
  const [rectificando, setRectificando] = useState<NotificacionAltaVivo | null>(null);
  const [exportando, setExportando] = useState(false);

  // ── Bandeja en vivo: altas de HOY + todas las accionables (pendiente/observada)
  // de cualquier día, para no perder trabajo sin procesar. Dos listeners fusionados.
  useEffect(() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const q = query(collection(db, "notificaciones_altas"), where("creadoEn", ">=", hoy), orderBy("creadoEn", "desc"));
    return onSnapshot(q, snap => setRecientes(snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionAltaVivo))));
  }, []);
  useEffect(() => {
    const q = query(collection(db, "notificaciones_altas"), where("estado", "in", ESTADOS_ACCIONABLES));
    return onSnapshot(q, snap => setAccionables(snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionAltaVivo))));
  }, []);

  // Catálogo de personal ESDOMED para el select "Digita SIMMOW" (lectura puntual,
  // colección pequeña — mismo patrón que fallecidos).
  useEffect(() => {
    if (!isEsdomed) return;
    getDocs(query(collection(db, "usuarios"), where("role", "in", ["esdomed", "asistente_esdomed", "admin"])))
      .then(s => setPersonalEsdomed(
        s.docs.map(d => d.data().nombre as string).filter(Boolean).sort((a, b) => a.localeCompare(b))
      ))
      .catch(() => setPersonalEsdomed([]));
  }, [isEsdomed]);

  // Abrir el modal de alta efectiva prellenando el digitador con el usuario actual.
  const abrirProcesar = (id: string) => {
    setDigitadorSimmow(profile?.nombre ?? "");
    setProcesandoId(id);
  };

  // Fuente de datos según la vista: bandeja (en vivo, deduplicada) o resultados de búsqueda.
  const notificaciones = useMemo(() => {
    if (vista === "buscar") return resultados ?? [];
    const m = new Map<string, NotificacionAltaVivo>();
    [...recientes, ...accionables].forEach(n => { if (n.id) m.set(n.id, n); });
    return [...m.values()].sort((a, b) => (toDate(b.creadoEn)?.getTime() ?? 0) - (toDate(a.creadoEn)?.getTime() ?? 0));
  }, [vista, resultados, recientes, accionables]);

  // ── Búsqueda histórica bajo demanda (getDocs puntual, no listener) ──
  const buscar = async () => {
    const exp = busqueda.trim();
    if (!exp && !(fechaDesde && fechaHasta)) return;
    setBuscando(true);
    setErrorBusqueda("");
    try {
      let docs: NotificacionAltaVivo[];
      if (exp) {
        // Por expediente exacto: trae solo las altas de ese paciente (cualquier fecha/estado).
        const snap = await getDocs(query(collection(db, "notificaciones_altas"), where("pacienteExpediente", "==", exp)));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionAltaVivo));
      } else {
        // Por rango de fecha (todo sobre creadoEn → sin índice compuesto).
        const snap = await getDocs(query(
          collection(db, "notificaciones_altas"),
          where("creadoEn", ">=", new Date(fechaDesde + "T00:00:00")),
          where("creadoEn", "<=", new Date(fechaHasta + "T23:59:59")),
          orderBy("creadoEn", "desc"), limit(500),
        ));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionAltaVivo));
      }
      docs.sort((a, b) => (toDate(b.creadoEn)?.getTime() ?? 0) - (toDate(a.creadoEn)?.getTime() ?? 0));
      setResultados(docs);
    } catch (e) {
      setErrorBusqueda((e as Error).message || "No se pudo completar la búsqueda.");
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  // Tras una acción en modo búsqueda, refresca la foto (en bandeja los listeners lo hacen solos).
  const refrescarBusqueda = () => (vista === "buscar" ? buscar() : undefined);

  // Base: búsqueda + rango de fecha (sin filtrar por estado, para los contadores).
  const baseList = useMemo(() => notificaciones.filter(n => {
    if (busqueda) {
      const b = busqueda.toLowerCase();
      if (!n.pacienteNombre.toLowerCase().includes(b) && !n.pacienteExpediente.toLowerCase().includes(b)) return false;
    }
    // El rango de fecha solo aplica en modo búsqueda; la bandeja ya viene acotada a hoy + accionables.
    if (vista === "buscar" && (fechaDesde || fechaHasta)) {
      const d = toDate(n.creadoEn);
      if (!d) return false;
      if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
      if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    }
    return true;
  }), [notificaciones, busqueda, fechaDesde, fechaHasta, vista]);

  const conteos = useMemo(() => {
    const c: Record<string, number> = { todas: baseList.length };
    COUNTER_ESTADOS.forEach((e) => { c[e] = 0; });
    baseList.forEach((n) => { c[n.estado] = (c[n.estado] ?? 0) + 1; });
    return c;
  }, [baseList]);

  const displayList = useMemo(
    () => (filtroEstado === "todas" ? baseList : baseList.filter((n) => n.estado === filtroEstado)),
    [baseList, filtroEstado],
  );

  // Reset de página al cambiar filtros.
  const filterKey = `${vista}|${busqueda}|${filtroEstado}|${fechaDesde}|${fechaHasta}|${resultados ? "r" : "n"}`;
  const [filterKeyPrev, setFilterKeyPrev] = useState(filterKey);
  if (filterKeyPrev !== filterKey) { setFilterKeyPrev(filterKey); setPage(1); }

  const totalPages = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const pageItems = displayList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Exporta a Excel lo que se está viendo (respeta búsqueda, fecha y estado).
  const exportarExcel = async () => {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const rows = displayList.map((n) => ({
        "Fecha notificación": formatFecha(n.creadoEn),
        Expediente: n.pacienteExpediente,
        Paciente: n.pacienteNombre,
        Servicio: n.servicio,
        Cama: n.cama ?? "",
        "Tipo de alta": TIPO_LABEL[n.tipoAlta],
        Estado: estadoBadgeLabel(n),
        "Notificado por": n.notificadoPorNombre,
        "Reportado por (enfermero/a)": n.notificadoPorPersona ?? "",
        Rol: n.notificadoPorRol === "enfermeria" ? "Enfermería" : n.notificadoPorRol === "trabajo_social" ? "Trabajo Social" : (n.notificadoPorRol ?? ""),
        "Procesada / recibida por": n.procesadoPorNombre ?? "",
        "Fecha de proceso": n.procesadoEn ? formatFecha(n.procesadoEn) : "",
        "Digitó SIMMOW": n.digitaSimmow ?? "",
        "Fecha digitación SIMMOW": n.digitaSimmowEn ? formatFecha(n.digitaSimmowEn) : "",
        "Revertida por": n.revertidoPorNombre ?? "",
        "Fecha de reversión": n.revertidoEn ? formatFecha(n.revertidoEn) : "",
        "Nota de reversión": n.revertidoNota ?? "",
        "Rechazada por": n.rechazadoPorNombre ?? "",
        "Motivo de rechazo": n.rechazoNota ?? "",
        Observación: n.observacionEsdomedMotivo ? OBSERVACION_LABEL[n.observacionEsdomedMotivo] : "",
        Notas: n.notas ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Altas vivos");
      XLSX.writeFile(wb, `altas_vivos_${fechaDesde || "inicio"}_a_${fechaHasta || "fin"}.xlsx`);
    } finally {
      setExportando(false);
    }
  };

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
        body: JSON.stringify({ action: "procesar", digitaSimmow: digitadorSimmow || null }),
      });
      if (!res.ok) throw new Error("No se pudo procesar la notificacion.");
      await refrescarBusqueda();
    } finally {
      setProcesandoLoading(false);
      setProcesandoId(null);
    }
  };

  // Registrar/corregir quién digitó en SIMMOW sobre un alta ya procesada.
  const asignarSimmow = async (nombre: string | null) => {
    if (!simmowId || !user) return;
    setSimmowLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/esdomed/altas/${simmowId}/estado`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "asignar_simmow", nombre }),
      });
      if (!res.ok) throw new Error("No se pudo guardar el digitador SIMMOW.");
      await refrescarBusqueda();
    } finally {
      setSimmowLoading(false);
      setSimmowId(null);
    }
  };

  const revertirNotificacion = async (nota: string) => {
    if (!revirtiendoId || !user || !profile) return;
    setRevirtiendoLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/esdomed/altas/${revirtiendoId}/estado`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "revertir", nota }),
      });
      if (!res.ok) throw new Error("No se pudo revertir el alta.");
      await refrescarBusqueda();
    } finally {
      setRevirtiendoLoading(false);
      setRevirtiendoId(null);
    }
  };

  const rechazarNotificacion = async (nota: string) => {
    if (!rechazandoId || !user || !profile) return;
    setRechazandoLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/esdomed/altas/${rechazandoId}/estado`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "rechazar", nota }),
      });
      if (!res.ok) throw new Error("No se pudo rechazar la notificacion.");
      await refrescarBusqueda();
    } finally {
      setRechazandoLoading(false);
      setRechazandoId(null);
    }
  };

  const reabrirNotificacion = async (id: string) => {
    if (!user || !profile) return;
    setReabriendoId(id);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/esdomed/altas/${id}/estado`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "reabrir" }),
      });
      if (!res.ok) throw new Error("No se pudo reabrir la notificacion.");
      await refrescarBusqueda();
    } finally {
      setReabriendoId(null);
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
      await refrescarBusqueda();
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
      await refrescarBusqueda();
    } finally {
      setQuitandoObservacionId(null);
    }
  };

  const procesandoNot = procesandoId ? notificaciones.find(n => n.id === procesandoId) : null;
  const simmowNot = simmowId ? notificaciones.find(n => n.id === simmowId) : null;
  const observandoNot = observandoId ? notificaciones.find(n => n.id === observandoId) : null;
  const revirtiendoNot = revirtiendoId ? notificaciones.find(n => n.id === revirtiendoId) : null;
  const rechazandoNot = rechazandoId ? notificaciones.find(n => n.id === rechazandoId) : null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#1c1e4d] dark:bg-[#c9a892] rounded-xl flex items-center justify-center ring-1 ring-[#c9a892]/45 dark:ring-0 shadow-sm">
            <LogIn size={17} className="text-white dark:text-[#1c2834]" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a67c65] dark:text-[#c9a892]/80">Verificación · Egresos vivos</p>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Altas Vivos</h1>
            <p className="text-xs text-slate-500">Notificaciones de egreso de pacientes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportarExcel}
            disabled={exportando || displayList.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <Download size={15} /> {exportando ? "Generando..." : "Excel"}
          </button>
          {isTS && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
              <Plus size={15} /> Nueva
            </button>
          )}
        </div>
      </div>

      {/* Banner de éxito creación */}
      {createdBanner && (
        <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-blue-50 dark:bg-[var(--color-institutional-navy)] border border-[#c9a892]/50 dark:border-[#c9a892]/40 rounded-xl text-sm text-[#1c1e4d] dark:text-[#f0ece8]">
          <CheckCircle2 size={16} className="text-[#1c1e4d] dark:text-[#c9a892]" />
          Cambio guardado correctamente.
        </div>
      )}

      {/* Cambio de vista: bandeja del día ⇄ búsqueda histórica */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl mb-4 w-full sm:w-fit">
        <button onClick={() => setVista("bandeja")}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            vista === "bandeja"
              ? "bg-white dark:bg-slate-900 shadow-sm text-[#1c1e4d] dark:text-[#c9a892] ring-1 ring-[#c9a892]/40 dark:ring-[#c9a892]/30"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}>
          <Inbox size={15} /> Bandeja del día
        </button>
        <button onClick={() => setVista("buscar")}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            vista === "buscar"
              ? "bg-white dark:bg-slate-900 shadow-sm text-[#1c1e4d] dark:text-[#c9a892] ring-1 ring-[#c9a892]/40 dark:ring-[#c9a892]/30"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}>
          <History size={15} /> Buscar anteriores
        </button>
      </div>

      {vista === "bandeja" && (
        <p className="text-xs text-slate-500 mb-3">Altas de hoy + todas las pendientes/observadas de días anteriores. Lo ya procesado se consulta en “Buscar anteriores”.</p>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text"
            placeholder={vista === "buscar" ? "Expediente exacto…" : "Buscar paciente o expediente..."}
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => { if (vista === "buscar" && e.key === "Enter") buscar(); }}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
        </div>
        {vista === "buscar" && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 shrink-0">Desde</span>
              <DateField value={fechaDesde} onChange={setFechaDesde} placeholder="Desde" ariaLabel="Fecha desde" clearable />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 shrink-0">Hasta</span>
              <DateField value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" ariaLabel="Fecha hasta" clearable />
            </div>
            <button onClick={buscar} disabled={buscando || (!busqueda.trim() && !(fechaDesde && fechaHasta))}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm">
              <Search size={13} /> {buscando ? "Buscando…" : "Buscar"}
            </button>
          </>
        )}
        {(busqueda || filtroEstado !== "todas" || (vista === "buscar" && (fechaDesde || fechaHasta || resultados !== null))) && (
          <button onClick={() => {
            setBusqueda(""); setFiltroEstado("todas");
            if (vista === "buscar") { setFechaDesde(""); setFechaHasta(""); setResultados(null); setErrorBusqueda(""); }
          }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {errorBusqueda && (
        <div className="mb-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {errorBusqueda}
        </div>
      )}

      {/* Contadores por estado (clic para filtrar). Los estados excepcionales
          solo muestran chip cuando tienen casos (o si son el filtro activo). */}
      <div className="flex flex-wrap gap-2 mb-4">
        <ChipContador label="Todas" count={conteos.todas} active={filtroEstado === "todas"} onClick={() => setFiltroEstado("todas")} />
        {COUNTER_ESTADOS.filter((e) => COUNTER_ESTADOS_FIJOS.includes(e) || (conteos[e] ?? 0) > 0 || filtroEstado === e).map((e) => (
          <ChipContador
            key={e}
            label={ESTADO_LABEL[e]}
            dot={ESTADO_DOT[e]}
            count={conteos[e] ?? 0}
            active={filtroEstado === e}
            onClick={() => setFiltroEstado(e)}
          />
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {displayList.length === 0 && (
          <p className="text-sm text-slate-500 py-10 text-center">
            {vista === "buscar" && resultados === null
              ? "Escribe un expediente o elige un rango de fechas y pulsa Buscar."
              : notificaciones.length === 0
                ? (vista === "buscar" ? "Sin resultados para esa búsqueda." : "No hay altas de hoy ni pendientes por procesar.")
                : "Sin resultados para los filtros aplicados."}
          </p>
        )}

        {pageItems.map(n => {
          const requiereSoloAcuse = esSoloAcuseRecibido(n.tipoAlta);
          const isLocked = n.estado === "procesada" || n.estado === "recibida" || n.estado === "deposito" || n.estado === "suspendida" || n.estado === "duplicada" || n.estado === "revertida" || n.estado === "rechazada";
          const mostrarNombresEsdomed = isEsdomed;
          const modificadoPorNombre = isTS && fueModificadaPorEsdomed(n) ? "ESDOMED" : n.modificadoPorNombre;
          const puedeRectificarTS =
            isTS &&
            (n.estado === "pendiente" || n.estado === "observada") &&
            !n.rectificacionUsada &&
            n.notificadoPorRol === "trabajo_social";

          return (
            <div key={n.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 transition-all hover:border-[#c9a892]/60 dark:hover:border-[#c9a892]/35">
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
                {n.notificadoPorPersona && (
                  <p className="text-xs text-slate-400">
                    Reportado por <span className="text-slate-600 dark:text-slate-300 font-medium">{n.notificadoPorPersona}</span>
                  </p>
                )}
                {/* "Modificado por" solo cuando hubo intervención real (observación):
                    si el modificador coincide con quien procesó, fue el cierre normal
                    (legado antes del arreglo) y no se muestra. */}
                {n.modificadoPorNombre && n.modificadoPorId !== n.procesadoPorId && (
                  <p className="text-xs text-slate-400">
                    Modificado por <span className="text-slate-500 font-medium">{modificadoPorNombre}</span>
                    {" · "}{formatFecha(n.modificadoEn)}
                  </p>
                )}
                {n.estado === "procesada" && n.procesadoPorNombre && (
                  <p className="text-xs text-[#1c1e4d] dark:text-[#c9a892] font-medium">
                    Alta efectiva por {nombreEsdomedVisible(mostrarNombresEsdomed, n.procesadoPorNombre)} · {formatFecha(n.procesadoEn)}
                  </p>
                )}
                {n.estado === "procesada" && (
                  n.digitaSimmow ? (
                    <p className="text-xs text-slate-400">
                      Digitada en SIMMOW por <span className="text-slate-500 font-medium">{nombreEsdomedVisible(mostrarNombresEsdomed, n.digitaSimmow)}</span>
                      {n.digitaSimmowEn && <> · {formatFecha(n.digitaSimmowEn)}</>}
                    </p>
                  ) : isEsdomed ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400">Pendiente de digitar en SIMMOW</p>
                  ) : null
                )}
                {n.estado === "recibida" && n.procesadoPorNombre && (
                  <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                    Acusada de recibido por {nombreEsdomedVisible(mostrarNombresEsdomed, n.procesadoPorNombre)} · {formatFecha(n.procesadoEn)}
                  </p>
                )}
                {n.estado === "duplicada" && n.duplicadoPorNombre && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                    Notificacion duplicada cerrada por {nombreEsdomedVisible(mostrarNombresEsdomed, n.duplicadoPorNombre)} · {formatFecha(n.duplicadoEn)}
                  </p>
                )}
                {n.estado === "revertida" && (
                  <>
                    <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                      Alta revertida{n.revertidoPorNombre ? ` por ${nombreEsdomedVisible(mostrarNombresEsdomed, n.revertidoPorNombre)}` : ""}
                      {n.revertidoEn ? ` · ${formatFecha(n.revertidoEn)}` : ""} · paciente reactivado
                    </p>
                    {n.revertidoNota && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic">Nota de reversión: {n.revertidoNota}</p>
                    )}
                  </>
                )}
                {n.estado === "rechazada" && (
                  <>
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                      Rechazada{n.rechazadoPorNombre ? ` por ${nombreEsdomedVisible(mostrarNombresEsdomed, n.rechazadoPorNombre)}` : ""}
                      {n.rechazadoEn ? ` · ${formatFecha(n.rechazadoEn)}` : ""}
                    </p>
                    {n.rechazoNota && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic">Motivo del rechazo: {n.rechazoNota}</p>
                    )}
                  </>
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
                        Observado por {nombreEsdomedVisible(mostrarNombresEsdomed, n.observadoPorNombre)} - {formatFecha(n.observadoEn)}
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
                        onClick={() => abrirProcesar(n.id!)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${primaryBtnCls} rounded-lg transition-colors`}
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
                      <button
                        onClick={() => setRechazandoId(n.id!)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800 rounded-lg transition-colors"
                      >
                        <Ban size={13} />
                        Rechazar
                      </button>
                    </>
                  )}

                  {puedeRectificarTS && (
                    <button
                      type="button"
                      onClick={() => setRectificando(n)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${primaryBtnCls} rounded-lg transition-colors`}
                    >
                      <Pencil size={12} />
                      {n.estado === "observada" ? "Corregir observacion" : "Rectificar una vez"}
                    </button>
                  )}
                </div>
              )}

              {/* ESDOMED: corregir digitador SIMMOW / revertir un alta efectiva */}
              {isEsdomed && n.estado === "procesada" && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSimmowId(n.id!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <Pencil size={12} />
                    {n.digitaSimmow ? "Corregir digitador SIMMOW" : "Registrar digitador SIMMOW"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRevirtiendoId(n.id!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/50 hover:bg-orange-100 dark:hover:bg-orange-900/60 border border-orange-200 dark:border-orange-800 rounded-lg transition-colors"
                  >
                    <Undo2 size={13} />
                    Revertir alta efectiva
                  </button>
                </div>
              )}

              {/* ESDOMED: una revertida vuelve al flujo — efectiva de nuevo, o en
                  espera con observación mientras se resuelve lo que faltó */}
              {isEsdomed && n.estado === "revertida" && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => abrirProcesar(n.id!)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${primaryBtnCls} rounded-lg transition-colors`}
                  >
                    <Check size={13} />
                    Marcar efectiva de nuevo
                  </button>
                  <button
                    type="button"
                    onClick={() => setObservandoId(n.id!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1c1e4d] dark:text-amber-100 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 rounded-lg transition-colors"
                  >
                    <MessageSquareWarning size={13} />
                    Dejar en espera con observación
                  </button>
                  <button
                    type="button"
                    onClick={() => setRechazandoId(n.id!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800 rounded-lg transition-colors"
                  >
                    <Ban size={13} />
                    Rechazar
                  </button>
                </div>
              )}

              {/* ESDOMED: reabrir una rechazada por error → vuelve a "pendiente"
                  para gestionarla de nuevo (p. ej. dejarla con observación) */}
              {isEsdomed && n.estado === "rechazada" && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => reabrirNotificacion(n.id!)}
                    disabled={reabriendoId === n.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/50 hover:bg-orange-100 dark:hover:bg-orange-900/60 border border-orange-200 dark:border-orange-800 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Undo2 size={13} />
                    {reabriendoId === n.id ? "Reabriendo..." : "Reabrir (rechazada por error)"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Paginación */}
      {displayList.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-4 mt-4 px-1">
          <span className="text-xs text-slate-500">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, displayList.length)} de{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">{displayList.length}</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-xs text-slate-500 px-2 tabular-nums">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

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
          title={
            procesandoNot.estado === "revertida"
              ? "Marcar efectiva de nuevo"
              : esSoloAcuseRecibido(procesandoNot.tipoAlta) ? "Acusar de recibido" : "Acusar de recibido y dar alta en SIS"
          }
          message={
            procesandoNot.estado === "revertida"
              ? `El alta de ${procesandoNot.pacienteNombre} volverá a quedar como efectiva: el paciente saldrá de nuevo de los pacientes activos y sus tarjetas de visita se anularán. Úsalo cuando ya se resolvió lo que motivó la reversión.`
              : esSoloAcuseRecibido(procesandoNot.tipoAlta)
              ? `Confirma que recibiste la notificación de ${procesandoNot.pacienteNombre}. Quedará cerrada como acuse de recibido, sin alta efectiva.`
              : `Confirma que recibiste la notificación de ${procesandoNot.pacienteNombre} y que se dio de alta en el SIS. Esta acción no se puede deshacer.`
          }
          confirmLabel="Confirmar"
          confirmCls={primaryBtnCls}
          onConfirm={procesarNotificacion}
          onCancel={() => setProcesandoId(null)}
          loading={procesandoLoading}
        >
          {/* Solo las altas efectivas generan egreso que digitar en SIMMOW */}
          {!esSoloAcuseRecibido(procesandoNot.tipoAlta) && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                ¿Quién digita el egreso en SIMMOW?
              </label>
              <SelectDigitadorSimmow
                value={digitadorSimmow}
                onChange={setDigitadorSimmow}
                personal={personalEsdomed}
                disabled={procesandoLoading}
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Por defecto, quien da el alta efectiva. Si lo digita otra persona, selecciónala; también se puede corregir después.
              </p>
            </div>
          )}
        </ConfirmModal>
      )}

      {simmowId && simmowNot && (
        <SimmowModal
          notificacion={simmowNot}
          personal={personalEsdomed}
          onConfirm={asignarSimmow}
          onCancel={() => setSimmowId(null)}
          loading={simmowLoading}
        />
      )}

      {revirtiendoId && revirtiendoNot && (
        <RevertirModal
          notificacion={revirtiendoNot}
          onConfirm={revertirNotificacion}
          onCancel={() => setRevirtiendoId(null)}
          loading={revirtiendoLoading}
        />
      )}

      {rechazandoId && rechazandoNot && (
        <RechazarModal
          notificacion={rechazandoNot}
          onConfirm={rechazarNotificacion}
          onCancel={() => setRechazandoId(null)}
          loading={rechazandoLoading}
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
