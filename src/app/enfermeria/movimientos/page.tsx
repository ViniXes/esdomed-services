"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  History,
  Pencil,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BuscadorPacienteActivo } from "@/components/pacientes/BuscadorPacienteActivo";
import type {
  EstadoNotificacionAlta,
  MotivoObservacionAlta,
  NotificacionAltaVivo,
  Paciente,
  TipoAltaVivo,
} from "@/types";

const TIPOS_ALTA: { value: TipoAltaVivo; label: string }[] = [
  { value: "domicilio", label: "Alta a domicilio" },
  { value: "exigida", label: "Alta exigida" },
  { value: "referido", label: "Referido" },
  { value: "fuga", label: "Fuga" },
  { value: "in_extremis", label: "In extremis" },
];

const TIPO_LABEL: Record<TipoAltaVivo, string> = {
  domicilio: "Alta a domicilio",
  exigida: "Alta exigida",
  referido: "Referido",
  fuga: "Fuga",
  in_extremis: "In extremis",
  deposito: "En deposito",
  suspendida: "Suspendida",
};

const ESTADO_LABEL: Record<EstadoNotificacionAlta, string> = {
  pendiente: "Pendiente ESDOMED",
  observada: "Requiere correccion",
  deposito: "En deposito",
  suspendida: "Suspendida",
  procesada: "Alta efectiva",
  recibida: "Acusada de recibido",
};

const ESTADO_COLOR: Record<EstadoNotificacionAlta, string> = {
  pendiente: "bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  observada: "bg-rose-50/70 dark:bg-rose-950/40 text-slate-800 dark:text-rose-100 border-rose-200/80 dark:border-rose-900/70",
  deposito: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  suspendida: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900",
  procesada: "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900",
  recibida: "bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-900",
};

const OBSERVACION_LABEL: Record<MotivoObservacionAlta, string> = {
  cama_expediente: "Datos de cama o expediente no coinciden",
  expediente_duplicado: "Expediente duplicado",
  no_subido_sis: "Pre-alta no registrada en SIS",
  otro: "Otra situacion a corregir",
};

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 transition";

const esSoloAcuseRecibido = (tipo: TipoAltaVivo) => tipo === "deposito" || tipo === "suspendida";
const esEstadoOcultoParaEnfermeria = (n: NotificacionAltaVivo) =>
  esSoloAcuseRecibido(n.tipoAlta) || n.estado === "deposito" || n.estado === "suspendida";

const estadoBadgeLabel = (n: NotificacionAltaVivo) =>
  n.estado === "recibida" && esSoloAcuseRecibido(n.tipoAlta)
    ? TIPO_LABEL[n.tipoAlta]
    : ESTADO_LABEL[n.estado];

const estadoBadgeColor = (n: NotificacionAltaVivo) => {
  if (n.estado === "recibida" && n.tipoAlta === "deposito") return ESTADO_COLOR.deposito;
  if (n.estado === "recibida" && n.tipoAlta === "suspendida") return ESTADO_COLOR.suspendida;
  return ESTADO_COLOR[n.estado];
};

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const ts = v as { toDate?: () => Date };
  if (ts.toDate) return ts.toDate();
  return new Date(v as string);
}

function formatFecha(v: unknown) {
  const d = toDate(v);
  if (!d) return "-";
  return d.toLocaleString("es-HN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function EnfermeriaMovimientosPage() {
  const { user, profile } = useAuth();
  const [registros, setRegistros] = useState<NotificacionAltaVivo[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoNotificacionAlta | "todos">("todos");
  const [fechaDesde, setFechaDesde] = useState(() => new Date().toISOString().split("T")[0]);
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split("T")[0]);
  const [editing, setEditing] = useState<NotificacionAltaVivo | null>(null);
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const [tipoAlta, setTipoAlta] = useState<TipoAltaVivo | "">("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query(collection(db, "notificaciones_altas"), orderBy("creadoEn", "desc"));
    return onSnapshot(q, (snap) => {
      setRegistros(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as NotificacionAltaVivo))
          .filter((n) => n.notificadoPorRol === "enfermeria")
      );
    });
  }, []);

  const registrosVisibles = registros.filter((n) => !esEstadoOcultoParaEnfermeria(n));

  const lista = registrosVisibles.filter((n) => {
    if (filtroEstado !== "todos" && n.estado !== filtroEstado) return false;
    if (fechaDesde || fechaHasta) {
      const d = toDate(n.creadoEn);
      if (!d) return false;
      if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
      if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    }
    if (!busqueda) return true;
    const b = busqueda.toLowerCase();
    return (
      n.pacienteNombre.toLowerCase().includes(b) ||
      n.pacienteExpediente.toLowerCase().includes(b) ||
      n.servicio.toLowerCase().includes(b)
    );
  });

  const abrirRectificacion = (n: NotificacionAltaVivo) => {
    setEditing(n);
    setSelectedPaciente(null);
    setTipoAlta(n.tipoAlta);
    setNotas(n.notas ?? "");
    setError("");
  };

  const cerrarRectificacion = () => {
    setEditing(null);
    setSelectedPaciente(null);
    setTipoAlta("");
    setNotas("");
    setError("");
    setSaving(false);
  };

  const guardarRectificacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !user || !profile || !tipoAlta) return;
    if ((editing.estado !== "pendiente" && editing.estado !== "observada") || editing.rectificacionUsada) {
      setError("Esta notificacion ya no puede rectificarse.");
      return;
    }

    const nextPaciente = selectedPaciente;
    setSaving(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/enfermeria/altas/${editing.id}/rectificar`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paciente: nextPaciente
            ? {
                id: nextPaciente.id,
                expediente: nextPaciente.expediente,
                apellidos: nextPaciente.apellidos,
                nombres: nextPaciente.nombres,
                servicioActual: nextPaciente.servicioActual,
                camaActual: nextPaciente.camaActual ?? "",
              }
            : null,
          tipoAlta,
          notas: notas.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "No se pudo rectificar la notificacion.");
      }

      cerrarRectificacion();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo rectificar la notificacion.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-teal-50 dark:bg-teal-950 rounded-xl flex items-center justify-center border border-teal-200 dark:border-teal-900">
          <History size={17} className="text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Movimientos de altas
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Trazabilidad de notificaciones enviadas por enfermeria
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="Pendientes" value={registrosVisibles.filter((n) => n.estado === "pendiente").length} />
        <SummaryCard label="Con observacion" value={registrosVisibles.filter((n) => n.estado === "observada").length} tone="rose" />
        <SummaryCard label="Altas efectivas" value={registrosVisibles.filter((n) => n.estado === "procesada").length} tone="green" />
        <SummaryCard label="Rectificadas" value={registrosVisibles.filter((n) => n.rectificacionUsada).length} tone="blue" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar paciente, expediente o servicio..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
          />
        </div>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as EstadoNotificacionAlta | "todos")}
          className="px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100"
        >
          <option value="todos">Todos los estados</option>
          <option value="pendiente">Pendiente ESDOMED</option>
          <option value="observada">Requiere correccion</option>
          <option value="procesada">Alta efectiva</option>
          <option value="recibida">Acusada de recibido</option>
        </select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Desde</span>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Hasta</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        {(busqueda || filtroEstado !== "todos") && (
          <button
            onClick={() => {
              setBusqueda("");
              setFiltroEstado("todos");
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
          >
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      <div className="space-y-2">
        {lista.length === 0 && (
          <p className="text-sm text-slate-500 py-10 text-center">
            {registrosVisibles.length === 0 ? "Aun no hay movimientos de enfermeria." : "Sin resultados para los filtros aplicados."}
          </p>
        )}

        {lista.map((n) => {
          const puedeRectificar =
            (n.estado === "pendiente" || n.estado === "observada") &&
            !n.rectificacionUsada &&
            n.notificadoPorId === user?.uid;

          return (
            <div
              key={n.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 transition-colors hover:border-teal-200 dark:hover:border-teal-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{n.pacienteNombre}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Exp. {n.pacienteExpediente}
                    {n.cama && <> - Cama {n.cama}</>}
                    {" - "}{n.servicio}
                    <span className="mx-1.5 text-slate-300">|</span>
                    <span className="font-medium text-slate-600 dark:text-slate-300">{TIPO_LABEL[n.tipoAlta]}</span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${estadoBadgeColor(n)}`}>
                    {n.estado === "procesada" && <CheckCircle2 size={11} className="mr-1" />}
                    {estadoBadgeLabel(n)}
                  </span>
                </div>
              </div>

              <div className="mt-2 space-y-0.5">
                <p className="text-xs text-slate-400">
                  Notificado por <span className="text-slate-500 font-medium">{n.notificadoPorNombre}</span>
                  {" - "}{formatFecha(n.creadoEn)}
                </p>
                {n.rectificacionUsada && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                    <RotateCcw size={12} />
                    Rectificado por {n.rectificadoPorNombre ?? n.modificadoPorNombre} - {formatFecha(n.rectificadoEn ?? n.modificadoEn)}
                  </p>
                )}
                {n.estado === "procesada" && n.procesadoPorNombre && (
                  <p className="text-xs text-green-600 dark:text-green-500 font-medium">
                    Alta efectiva por ESDOMED - {formatFecha(n.procesadoEn)}
                  </p>
                )}
                {n.estado === "recibida" && n.procesadoPorNombre && (
                  <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                    Acusada de recibido por ESDOMED - {formatFecha(n.procesadoEn)}
                  </p>
                )}
                {n.observacionEsdomedMotivo && (
                  <details className="group mt-2 rounded-lg border border-rose-200/70 dark:border-rose-800/70 bg-rose-50/70 dark:bg-rose-950/30 px-3 py-2 text-slate-900 dark:text-slate-100">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold">
                      <span>Observacion ESDOMED: {OBSERVACION_LABEL[n.observacionEsdomedMotivo]}</span>
                      <span className="shrink-0 text-[11px] font-medium underline-offset-2 group-open:hidden">Ver detalle</span>
                      <span className="hidden shrink-0 text-[11px] font-medium underline-offset-2 group-open:inline">Ocultar</span>
                    </summary>
                    {n.observacionEsdomedDetalle && (
                      <p className="mt-2 border-t border-rose-200/80 dark:border-rose-900 pt-2 text-xs leading-relaxed">{n.observacionEsdomedDetalle}</p>
                    )}
                    {n.observadoPorNombre && (
                      <p className="mt-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        Reportado por ESDOMED - {formatFecha(n.observadoEn)}
                      </p>
                    )}
                  </details>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2 items-center">
                {puedeRectificar ? (
                  <button
                    type="button"
                    onClick={() => abrirRectificacion(n)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors"
                  >
                    <Pencil size={12} />
                    {n.estado === "observada" ? "Corregir observacion" : "Rectificar una vez"}
                  </button>
                ) : n.rectificacionUsada ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock3 size={13} />
                    Rectificacion utilizada
                  </span>
                ) : n.estado !== "procesada" && n.estado !== "recibida" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock3 size={13} />
                    En seguimiento
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 pt-16 backdrop-blur-sm overflow-y-auto">
          <form onSubmit={guardarRectificacion} className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <button
              type="button"
              onClick={cerrarRectificacion}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              aria-label="Cerrar"
            >
              <X size={15} />
            </button>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Rectificacion unica</p>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Actualizar notificacion</h2>
              <p className="text-xs text-slate-500 mt-1">
                Puedes cambiar paciente, tipo de alta o nota antes de que ESDOMED haga alta efectiva.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Paciente actual</label>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{editing.pacienteNombre}</p>
                <p className="text-xs text-slate-500">Exp. {editing.pacienteExpediente} - {editing.servicio}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Cambiar paciente <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <BuscadorPacienteActivo value={selectedPaciente} onSelect={(p) => setSelectedPaciente(p)} accent="teal" />
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
                        ? "border-teal-500 bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-teal-300"
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
                onClick={cerrarRectificacion}
                disabled={saving}
                className="flex-1 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !tipoAlta}
                className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
              >
                {saving ? "Guardando..." : "Guardar rectificacion"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "amber",
}: {
  label: string;
  value: number;
  tone?: "amber" | "rose" | "green" | "blue";
}) {
  const toneCls = {
    amber: "border-l-4 border-l-[#c99a2e] text-[#1c1e4d] dark:text-amber-200 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
    rose: "border-l-4 border-l-[#b76e79] text-[#1c1e4d] dark:text-rose-200 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
    green: "border-l-4 border-l-[#009b8f] text-[#1c1e4d] dark:text-emerald-200 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
    blue: "border-l-4 border-l-[#1c1e4d] text-[#1c1e4d] dark:text-blue-200 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneCls}`}>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="text-xs font-medium mt-1">{label}</p>
    </div>
  );
}
