"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  where,
  getDocs,
  Timestamp,
  QueryConstraint,
} from "@/lib/firestoreMeter";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  History,
  Info,
  Loader2,
  LogIn,
  Pencil,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BuscadorPacienteActivo } from "@/components/pacientes/BuscadorPacienteActivo";
import { DateField } from "@/components/ui/DateField";
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
  deposito: "En depósito",
  suspendida: "Suspendida",
};

const ESTADO_LABEL: Record<EstadoNotificacionAlta, string> = {
  pendiente: "Pendiente ESDOMED",
  observada: "Requiere corrección",
  deposito: "En depósito",
  suspendida: "Suspendida",
  procesada: "Alta efectiva",
  recibida: "Acusada de recibido",
  duplicada: "Duplicada",
  revertida: "Alta revertida",
  rechazada: "Rechazada por ESDOMED",
};

// Solo familias semánticas: ámbar = en espera, rosa/rojo = corregir o rechazo,
// esmeralda = alta efectiva; lo informativo va en el azul/acento institucional.
const ESTADO_COLOR: Record<EstadoNotificacionAlta, string> = {
  pendiente: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  observada: "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900",
  deposito: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  suspendida: "bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900",
  procesada: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
  recibida: "bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-900",
  duplicada: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  revertida: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  rechazada: "bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900",
};

// Franja lateral de cada tarjeta: el estado se lee antes que el texto.
const ESTADO_FRANJA: Record<EstadoNotificacionAlta, string> = {
  pendiente: "bg-amber-400",
  observada: "bg-rose-500",
  deposito: "bg-slate-300 dark:bg-slate-600",
  suspendida: "bg-red-500",
  procesada: "bg-emerald-500",
  recibida: "bg-cyan-500",
  duplicada: "bg-slate-300 dark:bg-slate-600",
  revertida: "bg-slate-400 dark:bg-slate-500",
  rechazada: "bg-red-500",
};

const OBSERVACION_LABEL: Record<MotivoObservacionAlta, string> = {
  cama_expediente: "Datos de cama o expediente no coinciden",
  expediente_duplicado: "Expediente duplicado",
  no_subido_sis: "Pre-alta no registrada en SIS",
  otro: "Otra situación a corregir",
};

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

const primaryBtnCls = "bg-blue-700 hover:bg-blue-600 text-white shadow-sm shadow-blue-700/20";

const filtroCls =
  "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 dark:text-slate-100";

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

/** Fecha (YYYY-MM-DD) en zona local, evita el corrimiento de toISOString() en UTC. */
function fechaLocalStr(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

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

// En cuentas genéricas (compartidas por servicio) interesa quién la envió de verdad.
const quienNotifico = (n: NotificacionAltaVivo) =>
  n.notificadoPorPersona ? `${n.notificadoPorPersona} (${n.notificadoPorNombre})` : n.notificadoPorNombre;

export default function EnfermeriaMovimientosPage() {
  const { user, profile } = useAuth();
  const [registros, setRegistros] = useState<NotificacionAltaVivo[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoNotificacionAlta | "todos">("todos");
  const [fechaDesde, setFechaDesde] = useState(() => fechaLocalStr(new Date()));
  const [fechaHasta, setFechaHasta] = useState(() => fechaLocalStr(new Date()));
  const [resultadosHistoricos, setResultadosHistoricos] = useState<NotificacionAltaVivo[] | null>(null);
  const [buscandoHistoricos, setBuscandoHistoricos] = useState(false);
  const [editing, setEditing] = useState<NotificacionAltaVivo | null>(null);
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const [tipoAlta, setTipoAlta] = useState<TipoAltaVivo | "">("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Vista en vivo acotada al DÍA ACTUAL (mismo campo en where/orderBy, no exige
  // índice compuesto). Lo anterior a hoy se consulta bajo demanda (getDocs).
  useEffect(() => {
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, "notificaciones_altas"),
      where("creadoEn", ">=", Timestamp.fromDate(inicioHoy)),
      orderBy("creadoEn", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setRegistros(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as NotificacionAltaVivo))
          .filter((n) => n.notificadoPorRol === "enfermeria")
      );
    });
  }, []);

  // Fecha (YYYY-MM-DD local) de HOY, límite inferior de la vista en vivo.
  const limiteVivoStr = fechaLocalStr(new Date());
  const fueraDeRangoVivo = !!fechaDesde && fechaDesde < limiteVivoStr;

  // Búsqueda de notificaciones anteriores a hoy: una sola lectura (getDocs), no listener.
  const buscarHistoricos = async () => {
    if (!fechaDesde && !fechaHasta) return;
    setBuscandoHistoricos(true);
    try {
      const constraints: QueryConstraint[] = [];
      if (fechaDesde) constraints.push(where("creadoEn", ">=", Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"))));
      if (fechaHasta) constraints.push(where("creadoEn", "<=", Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"))));
      constraints.push(orderBy("creadoEn", "desc"), limit(500));
      const snap = await getDocs(query(collection(db, "notificaciones_altas"), ...constraints));
      setResultadosHistoricos(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as NotificacionAltaVivo))
          .filter((n) => n.notificadoPorRol === "enfermeria")
      );
    } finally {
      setBuscandoHistoricos(false);
    }
  };

  const volverARecientes = () => {
    setResultadosHistoricos(null);
    setFechaDesde(fechaLocalStr(new Date()));
    setFechaHasta(fechaLocalStr(new Date()));
  };

  const registrosVisibles = (resultadosHistoricos ?? registros).filter((n) => !esEstadoOcultoParaEnfermeria(n));

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

  const puedeRectificar = (n: NotificacionAltaVivo) =>
    (n.estado === "pendiente" || n.estado === "observada") &&
    !n.rectificacionUsada &&
    n.notificadoPorId === user?.uid;

  // Devueltas por ESDOMED que esta cuenta todavía puede corregir: lo único que
  // exige acción de enfermería en esta vista.
  const porCorregir = registrosVisibles.filter((n) => n.estado === "observada" && puedeRectificar(n)).length;

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
      setError("Esta notificación ya no puede rectificarse.");
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
        throw new Error(data?.error ?? "No se pudo rectificar la notificación.");
      }

      cerrarRectificacion();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo rectificar la notificación.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Encabezado */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-5 shadow-lg shadow-cyan-950/20 md:px-7 md:py-6">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
              <History size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white md:text-2xl font-heading">Movimientos de altas</h1>
              <p className="mt-1 max-w-xl text-sm text-cyan-50/90">Siga el estado de cada alta que notificó enfermería y corrija las que ESDOMED devuelva.</p>
            </div>
          </div>
          <Link
            href="/enfermeria/altas"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-900 shadow-sm transition-colors hover:bg-cyan-50"
          >
            <LogIn size={16} /> Notificar alta
          </Link>
        </div>
      </section>

      {/* Lo que requiere acción, antes que cualquier otra cosa */}
      {porCorregir > 0 && filtroEstado !== "observada" && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/70 dark:bg-rose-950/30 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-300">
              <AlertCircle size={18} />
            </span>
            <div>
              <p className="text-sm font-bold text-rose-900 dark:text-rose-100">
                {porCorregir === 1 ? "ESDOMED devolvió 1 alta para corregir" : `ESDOMED devolvió ${porCorregir} altas para corregir`}
              </p>
              <p className="mt-0.5 text-xs text-rose-700/90 dark:text-rose-200/80">Revise la observación y corríjala para que el alta siga su trámite.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFiltroEstado("observada")}
            className="shrink-0 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500"
          >
            Ver devueltas
          </button>
        </div>
      )}

      <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Seguimiento</p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">Altas notificadas</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {resultadosHistoricos !== null ? "Resultados del rango seleccionado." : "Se actualiza en vivo con las altas de hoy."}
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500">{lista.length} {lista.length === 1 ? "resultado" : "resultados"}</span>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Pendientes" value={registrosVisibles.filter((n) => n.estado === "pendiente").length} icon={Clock3} tone="amber" />
          <Kpi label="Con observación" value={registrosVisibles.filter((n) => n.estado === "observada").length} icon={AlertCircle} tone="rose" />
          <Kpi label="Altas efectivas" value={registrosVisibles.filter((n) => n.estado === "procesada").length} icon={CheckCircle2} tone="emerald" />
          <Kpi label="Rectificadas" value={registrosVisibles.filter((n) => n.rectificacionUsada).length} icon={RotateCcw} tone="cyan" />
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="relative min-w-[180px] flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar paciente, expediente o servicio..."
              aria-label="Buscar"
              className={`${filtroCls} w-full py-1.5 pl-8 pr-3 placeholder-slate-400`}
            />
          </div>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoNotificacionAlta | "todos")}
            aria-label="Estado"
            className={`${filtroCls} px-2 py-1.5`}
          >
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendiente ESDOMED</option>
            <option value="observada">Requiere corrección</option>
            <option value="procesada">Alta efectiva</option>
            <option value="recibida">Acusada de recibido</option>
            <option value="duplicada">Duplicada</option>
          </select>
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-xs text-slate-500">Desde</span>
            <DateField value={fechaDesde} onChange={setFechaDesde} placeholder="Desde" ariaLabel="Fecha desde" clearable />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-xs text-slate-500">Hasta</span>
            <DateField value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" ariaLabel="Fecha hasta" clearable />
          </div>
          {(busqueda || filtroEstado !== "todos") && (
            <button
              onClick={() => {
                setBusqueda("");
                setFiltroEstado("todos");
              }}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:hover:text-slate-100"
            >
              <X size={12} /> Limpiar
            </button>
          )}
        </div>

        {/* La vista en vivo solo cubre hoy; para fechas anteriores hay que pedirlo explícitamente */}
        {fueraDeRangoVivo && resultadosHistoricos === null && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
            <span className="flex items-center gap-1.5"><Info size={14} className="shrink-0" /> Ese rango incluye días anteriores a hoy. Búsquelos para verlos.</span>
            <button
              onClick={buscarHistoricos}
              disabled={buscandoHistoricos}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-cyan-700 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
            >
              {buscandoHistoricos ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              {buscandoHistoricos ? "Buscando..." : "Buscar días anteriores"}
            </button>
          </div>
        )}
        {resultadosHistoricos !== null && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
            <span>Mostrando altas del rango seleccionado (no se actualiza en vivo).</span>
            <button
              onClick={volverARecientes}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
            >
              <X size={12} /> Volver a hoy
            </button>
          </div>
        )}
      </section>

      <div className="space-y-3">
        {lista.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700">
            <History size={22} className="mx-auto text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm text-slate-500">
              {resultadosHistoricos !== null
                ? "No hay altas notificadas en ese rango."
                : registrosVisibles.length === 0
                  ? "Enfermería no ha notificado altas hoy."
                  : "Ninguna alta coincide con los filtros."}
            </p>
          </div>
        )}

        {lista.map((n) => {
          const rectificable = puedeRectificar(n);
          // Rechazada es cierre definitivo: no mostrarla "En seguimiento".
          const estaCerrada = n.estado === "procesada" || n.estado === "recibida" || n.estado === "duplicada" || n.estado === "rechazada";

          return (
            <div
              key={n.id}
              className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.03] transition-colors hover:border-cyan-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-800"
            >
              <span className={`absolute bottom-0 left-0 top-0 w-1 ${ESTADO_FRANJA[n.estado]}`} />
              <div className="pl-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{n.pacienteNombre}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      <span className="font-mono font-medium">Exp. {n.pacienteExpediente}</span>
                      {" · "}{n.servicio}
                      {n.cama && <> · Cama {n.cama}</>}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-300">{TIPO_LABEL[n.tipoAlta]}</p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${estadoBadgeColor(n)}`}>
                    {n.estado === "procesada" && <CheckCircle2 size={11} />}
                    {estadoBadgeLabel(n)}
                  </span>
                </div>

                <div className="mt-2 space-y-0.5">
                  <p className="text-xs text-slate-400">
                    Notificado por <span className="font-medium text-slate-500 dark:text-slate-400">{quienNotifico(n)}</span>
                    {" · "}{formatFecha(n.creadoEn)}
                  </p>
                  {n.notas && (
                    <p className="text-xs text-slate-500">
                      <span className="font-medium">Nota:</span> {n.notas}
                    </p>
                  )}
                  {n.rectificacionUsada && (
                    <p className="flex items-center gap-1 text-xs font-medium text-cyan-700 dark:text-cyan-300">
                      <RotateCcw size={12} />
                      Rectificado por {n.rectificadoPorNombre ?? n.modificadoPorNombre} · {formatFecha(n.rectificadoEn ?? n.modificadoEn)}
                    </p>
                  )}
                  {n.estado === "procesada" && n.procesadoPorNombre && (
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      Alta efectiva por ESDOMED · {formatFecha(n.procesadoEn)}
                    </p>
                  )}
                  {n.estado === "recibida" && n.procesadoPorNombre && (
                    <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300">
                      Acusada de recibido por ESDOMED · {formatFecha(n.procesadoEn)}
                    </p>
                  )}
                  {n.estado === "duplicada" && n.duplicadoPorNombre && (
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Notificación duplicada cerrada por ESDOMED · {formatFecha(n.duplicadoEn)}
                    </p>
                  )}
                  {n.estado === "rechazada" && (
                    <>
                      <p className="text-xs font-medium text-red-600 dark:text-red-400">
                        Rechazada por ESDOMED{n.rechazadoEn ? ` · ${formatFecha(n.rechazadoEn)}` : ""}
                      </p>
                      {n.rechazoNota && (
                        <p className="mt-1 rounded-lg border border-red-200/70 bg-red-50/70 px-3 py-2 text-xs text-slate-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-slate-300">
                          <span className="font-semibold">Motivo:</span> {n.rechazoNota}
                          <span className="mt-0.5 block text-[11px] text-slate-500">Si el alta sí corresponde, envíe una notificación nueva.</span>
                        </p>
                      )}
                    </>
                  )}
                  {n.observacionEsdomedMotivo && (
                    <details className="group mt-2 rounded-lg border border-rose-200/70 bg-rose-50/70 px-3 py-2 text-slate-900 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-slate-100">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold">
                        <span>Observación ESDOMED: {OBSERVACION_LABEL[n.observacionEsdomedMotivo]}</span>
                        <span className="shrink-0 text-[11px] font-medium text-rose-700 group-open:hidden dark:text-rose-300">Ver detalle</span>
                        <span className="hidden shrink-0 text-[11px] font-medium text-rose-700 group-open:inline dark:text-rose-300">Ocultar</span>
                      </summary>
                      {n.observacionEsdomedDetalle && (
                        <p className="mt-2 border-t border-rose-200/80 pt-2 text-xs leading-relaxed dark:border-rose-900">{n.observacionEsdomedDetalle}</p>
                      )}
                      {n.observadoPorNombre && (
                        <p className="mt-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          Reportado por ESDOMED · {formatFecha(n.observadoEn)}
                        </p>
                      )}
                    </details>
                  )}
                </div>

                {(rectificable || n.rectificacionUsada || !estaCerrada) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {rectificable ? (
                      <button
                        type="button"
                        onClick={() => abrirRectificacion(n)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                          n.estado === "observada" ? "bg-rose-600 text-white hover:bg-rose-500" : primaryBtnCls
                        }`}
                      >
                        <Pencil size={12} />
                        {n.estado === "observada" ? "Corregir observación" : "Rectificar (una vez)"}
                      </button>
                    ) : n.rectificacionUsada ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <Clock3 size={13} />
                        Rectificación utilizada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <Clock3 size={13} />
                        En seguimiento
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16 backdrop-blur-sm">
          <form onSubmit={guardarRectificacion} className="relative w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={cerrarRectificacion}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Cerrar"
            >
              <X size={15} />
            </button>
            <div className="flex items-start gap-3 pr-6">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white"><Pencil size={16} /></span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300">
                  {editing.estado === "observada" ? "Corregir observación" : "Rectificación única"}
                </p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">Actualizar notificación</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Puede cambiar el paciente, el tipo de alta o la nota antes de que ESDOMED haga el alta efectiva. Solo se permite una vez.
                </p>
              </div>
            </div>

            {editing.observacionEsdomedMotivo && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs dark:border-rose-900/70 dark:bg-rose-950/30">
                <p className="font-semibold text-rose-900 dark:text-rose-100">ESDOMED indicó: {OBSERVACION_LABEL[editing.observacionEsdomedMotivo]}</p>
                {editing.observacionEsdomedDetalle && (
                  <p className="mt-1 leading-relaxed text-rose-800/90 dark:text-rose-200/80">{editing.observacionEsdomedDetalle}</p>
                )}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">Paciente actual</label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{editing.pacienteNombre}</p>
                <p className="text-xs text-slate-500">
                  Exp. {editing.pacienteExpediente} · {editing.servicio}{editing.cama ? ` · Cama ${editing.cama}` : ""}
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                Cambiar paciente <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <BuscadorPacienteActivo value={selectedPaciente} onSelect={(p) => setSelectedPaciente(p)} accent="blue" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">Tipo de alta</label>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS_ALTA.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTipoAlta(t.value)}
                    aria-pressed={tipoAlta === t.value}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      tipoAlta === t.value
                        ? "border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-700 dark:bg-cyan-950/35 dark:text-cyan-100"
                        : "border-slate-200 text-slate-600 hover:border-cyan-200 hover:bg-cyan-50/50 dark:border-slate-700 dark:text-slate-400 dark:hover:border-cyan-800"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="notas-rect" className="mb-1.5 block text-xs font-medium text-slate-500">
                Nota <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <textarea id="notas-rect" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={cerrarRectificacion}
                disabled={saving}
                className="flex-1 rounded-xl py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !tipoAlta}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${primaryBtnCls}`}
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const KPI_TONO = {
  amber: { caja: "border-amber-100 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/25", icono: "bg-amber-500" },
  rose: { caja: "border-rose-100 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/25", icono: "bg-rose-500" },
  emerald: { caja: "border-emerald-100 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/25", icono: "bg-emerald-500" },
  cyan: { caja: "border-cyan-100 bg-cyan-50/70 dark:border-cyan-900/60 dark:bg-cyan-950/25", icono: "bg-cyan-600" },
} as const;

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Clock3;
  tone: keyof typeof KPI_TONO;
}) {
  const t = KPI_TONO[tone];
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${t.caja}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${t.icono}`}>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{value}</p>
        <p className="mt-1 truncate text-[11px] font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}
