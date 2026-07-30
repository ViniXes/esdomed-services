"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection, query, where, onSnapshot, deleteDoc, doc, Timestamp,
  getDocs, orderBy, limit, type QueryConstraint, type QueryDocumentSnapshot, type DocumentData,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { DateField } from "@/components/ui/DateField";
import { useAuth } from "@/contexts/AuthContext";
import { FileText, Plus, CheckCircle2, Clock, Pencil, Trash2, Search, ChevronLeft, ChevronRight, X, User, Users, History, RefreshCw } from "lucide-react";
import type { EstadoIncapacidad, SolicitudIncapacidad } from "@/types";
import { toDate, formatFecha } from "@/lib/pacientes/helpers";

type FiltroEstado = EstadoIncapacidad | "todos";
type Vista = "mias" | "todas" | "historico";

const FILTROS_ESTADO: { value: FiltroEstado; label: string }[] = [
  { value: "todos",     label: "Todas" },
  { value: "pendiente", label: "Pendientes" },
  { value: "emitida",   label: "Emitidas" },
];

// Topes de seguridad. La vista pública ya viene acotada por fecha (ayer y hoy);
// el histórico es bajo demanda y siempre exige expediente o rango.
const LIMIT_VENTANA = 200;
const LIMIT_HISTORICO = 500;
const LIMIT_HISTORICO_EXP = 200;

const mapIncapacidad = (d: QueryDocumentSnapshot<DocumentData>): SolicitudIncapacidad => {
  const data = d.data();
  return {
    id: d.id,
    ...data,
    fechaAlta: toDate(data.fechaAlta) ?? new Date(),
    fechaDesde: toDate(data.fechaDesde) ?? new Date(),
    fechaHasta: toDate(data.fechaHasta) ?? new Date(),
    creadoEn: toDate(data.creadoEn) ?? new Date(),
    emitidaEn: toDate(data.emitidaEn),
  } as SolicitudIncapacidad;
};

const porFecha = (a: SolicitudIncapacidad, b: SolicitudIncapacidad) =>
  b.creadoEn.getTime() - a.creadoEn.getTime();

const inicioDeAyer = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Caché de módulo de la vista pública: sobrevive a la navegación SPA para no
// releer la ventana cada vez que se alterna de pestaña.
let cacheTodas: { docs: SolicitudIncapacidad[]; en: Date } | null = null;

// Ventana pública: solo ayer y hoy. `where` y `orderBy` sobre el mismo campo
// → no exige índice compuesto.
async function leerVentanaAyerHoy() {
  const snap = await getDocs(query(
    collection(db, "incapacidades"),
    where("creadoEn", ">=", Timestamp.fromDate(inicioDeAyer())),
    orderBy("creadoEn", "desc"),
    limit(LIMIT_VENTANA),
  ));
  cacheTodas = { docs: snap.docs.map(mapIncapacidad), en: new Date() };
  return cacheTodas;
}

const quitarDeCacheTodas = (id: string) => {
  if (cacheTodas) cacheTodas = { ...cacheTodas, docs: cacheTodas.docs.filter((s) => s.id !== id) };
};

export default function MedicoIncapacidadesPage() {
  const { user } = useAuth();
  const [vista, setVista] = useState<Vista>("mias");
  const [solicitudes, setSolicitudes] = useState<SolicitudIncapacidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  // Histórico: bajo demanda, exige expediente o rango de fechas.
  const [expHistorico, setExpHistorico] = useState("");
  const [histDesde, setHistDesde] = useState("");
  const [histHasta, setHistHasta] = useState("");
  const [resultados, setResultados] = useState<SolicitudIncapacidad[] | null>(null); // null = aún no se busca
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState("");

  const PAGE_SIZE = 5;

  const eliminar = async (id: string) => {
    setEliminandoId(id);
    try {
      await deleteDoc(doc(db, "incapacidades", id));
      // "Mías" se refresca sola por el listener; las otras vistas son lecturas
      // puntuales, así que se quita también de lo mostrado y de la caché.
      setSolicitudes((prev) => prev.filter((s) => s.id !== id));
      setResultados((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
      quitarDeCacheTodas(id);
    } catch (e) {
      alert(`No se pudo eliminar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setEliminandoId(null);
      setConfirmandoId(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    // El histórico no lee nada al entrar: espera criterio + botón Buscar.
    if (vista === "historico") return;

    if (vista === "mias") {
      // Vista personal: en vivo, solo las del médico (acotada por medicoId).
      const q = query(collection(db, "incapacidades"), where("medicoId", "==", user.uid));
      return onSnapshot(q, (s) => {
        setSolicitudes(s.docs.map(mapIncapacidad).sort(porFecha));
        setLoading(false);
      });
    }

    // Vista pública: solo ayer y hoy, lectura puntual (no abre un listener
    // global por médico) y servida de la caché si ya se leyó en esta sesión.
    let activo = true;
    (cacheTodas ? Promise.resolve(cacheTodas) : leerVentanaAyerHoy())
      .then(({ docs, en }) => {
        if (!activo) return;
        setSolicitudes(docs);
        setActualizadoEn(en);
        setLoading(false);
      })
      .catch((e) => {
        if (!activo) return;
        console.error("Error al cargar incapacidades (vista pública):", e);
        setSolicitudes([]);
        setLoading(false);
      });
    return () => { activo = false; };
  }, [user, vista]);

  const actualizarTodas = async () => {
    setRefrescando(true);
    try {
      const { docs, en } = await leerVentanaAyerHoy();
      setSolicitudes(docs);
      setActualizadoEn(en);
    } catch (e) {
      console.error("Error al actualizar incapacidades (vista pública):", e);
    } finally {
      setRefrescando(false);
    }
  };

  const sinCriterio = !expHistorico.trim() && !histDesde && !histHasta;

  // Búsqueda histórica: una sola lectura puntual, nunca un listener.
  const buscarHistorico = async () => {
    const exp = expHistorico.trim();
    if (sinCriterio) return;
    setBuscando(true);
    setErrorBusqueda("");
    try {
      let docs: SolicitudIncapacidad[];
      if (exp) {
        // Por expediente exacto: sin orderBy para no exigir índice compuesto;
        // el rango, si lo hay, se afina en cliente.
        const snap = await getDocs(query(
          collection(db, "incapacidades"),
          where("pacienteExpediente", "==", exp),
          limit(LIMIT_HISTORICO_EXP),
        ));
        docs = snap.docs.map(mapIncapacidad);
        if (histDesde) docs = docs.filter((s) => s.creadoEn >= new Date(histDesde + "T00:00:00"));
        if (histHasta) docs = docs.filter((s) => s.creadoEn <= new Date(histHasta + "T23:59:59"));
      } else {
        // Por rango de fecha de solicitud (mismo campo en where/orderBy).
        const constraints: QueryConstraint[] = [];
        if (histDesde) constraints.push(where("creadoEn", ">=", Timestamp.fromDate(new Date(histDesde + "T00:00:00"))));
        if (histHasta) constraints.push(where("creadoEn", "<=", Timestamp.fromDate(new Date(histHasta + "T23:59:59"))));
        constraints.push(orderBy("creadoEn", "desc"), limit(LIMIT_HISTORICO));
        const snap = await getDocs(query(collection(db, "incapacidades"), ...constraints));
        docs = snap.docs.map(mapIncapacidad);
      }
      setResultados(docs.sort(porFecha));
      setPagina(1);
    } catch (e) {
      setErrorBusqueda(e instanceof Error ? e.message : "No se pudo completar la búsqueda.");
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  const limpiarHistorico = () => {
    setExpHistorico(""); setHistDesde(""); setHistHasta("");
    setResultados(null); setErrorBusqueda(""); setPagina(1);
  };

  // Lo que se muestra: la ventana en vivo/puntual o los resultados del histórico.
  const base = useMemo(
    () => (vista === "historico" ? (resultados ?? []) : solicitudes),
    [vista, resultados, solicitudes],
  );

  const pendientes = base.filter((s) => s.estado === "pendiente").length;
  const emitidas = base.filter((s) => s.estado === "emitida").length;

  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    // Rango por Fecha de alta, en hora local para no correr el día (UTC-6).
    const desde = fechaDesde ? new Date(fechaDesde + "T00:00:00") : null;
    const hasta = fechaHasta ? new Date(fechaHasta + "T23:59:59") : null;
    return base.filter((s) => {
      if (filtroEstado !== "todos" && s.estado !== filtroEstado) return false;
      if (desde && s.fechaAlta < desde) return false;
      if (hasta && s.fechaAlta > hasta) return false;
      if (t && !(
        s.pacienteNombre.toLowerCase().includes(t) ||
        s.pacienteExpediente.toLowerCase().includes(t) ||
        (s.medicoNombre ?? "").toLowerCase().includes(t)
      )) return false;
      return true;
    });
  }, [base, busqueda, filtroEstado, fechaDesde, fechaHasta]);

  const hayFiltros = busqueda !== "" || filtroEstado !== "todos" || fechaDesde !== "" || fechaHasta !== "";

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = filtradas.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#243b6b] via-indigo-700 to-blue-700 px-5 py-5 shadow-lg shadow-indigo-950/15 md:px-7 md:py-6">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20"><FileText size={24} /></span><div><h1 className="text-xl font-bold text-white md:text-2xl font-heading">Gestión de incapacidades</h1><p className="mt-1 text-sm text-indigo-50/90">Solicite, consulte y dé seguimiento a los certificados de incapacidad.</p></div></div>
          <Link prefetch={false} href="/medico/incapacidades/nueva" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-800 shadow-sm transition-colors hover:bg-indigo-50"><Plus size={16} /> Nueva incapacidad</Link>
        </div>
      </section>

      {/* Resumen del alcance mostrado (personal, ayer y hoy, o búsqueda) */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5 dark:border-indigo-900/60 dark:bg-indigo-950/25"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white"><FileText size={16} /></span><div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{base.length}</p><p className="mt-1 text-[11px] font-medium text-slate-500">{vista === "mias" ? "Solicitadas" : vista === "todas" ? "Ayer y hoy" : "Resultados"}</p></div></div>
        <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/25"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white"><Clock size={16} /></span><div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{pendientes}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Pendientes</p></div></div>
        <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/25"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white"><CheckCircle2 size={16} /></span><div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{emitidas}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Emitidas</p></div></div>
      </div>

      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4">
        {([
          { value: "mias",      label: "Mías",           icon: User },
          { value: "todas",     label: "Ayer y hoy",     icon: Users },
          { value: "historico", label: "Histórico",      icon: History },
        ] as { value: Vista; label: string; icon: typeof User }[]).map((v) => (
          <button
            key={v.value}
            onClick={() => {
              if (v.value === vista) return;
              setLoading(v.value !== "historico");
              setVista(v.value);
              setPagina(1);
              // El histórico filtra fechas en el servidor: el rango de alta
              // (filtro en cliente) se limpia para no ocultar resultados.
              if (v.value === "historico") { setFechaDesde(""); setFechaHasta(""); }
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              vista === v.value
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <v.icon size={14} />
            {v.label}
          </button>
        ))}
      </div>

      {vista === "mias" && pendientes > 0 && (
        <div className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-3 py-1.5 rounded-xl mb-4 w-fit">
          <Clock size={14} />
          {pendientes} esperando emisión
        </div>
      )}

      {/* Alcance de la vista pública: solo ayer y hoy, con refresco manual */}
      {vista === "todas" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-xs text-slate-500">
            Mostrando las incapacidades solicitadas <span className="font-medium text-slate-600 dark:text-slate-300">ayer y hoy</span>.
            Para fechas anteriores use la pestaña Histórico.
            {actualizadoEn && ` · Actualizado ${actualizadoEn.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit", hour12: false })}`}
          </p>
          <button
            onClick={actualizarTodas}
            disabled={refrescando}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw size={12} className={refrescando ? "animate-spin" : ""} />
            {refrescando ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
      )}

      {/* Histórico: no lee nada hasta que se da expediente o rango de fechas */}
      {vista === "historico" && (
        <div className="mb-4 space-y-2">
          <div className="flex items-start gap-2">
            <History size={14} className="mt-0.5 flex-shrink-0 text-slate-400" />
            <p className="text-xs text-slate-500">
              Busque por expediente (trae todas las de ese paciente) o por rango de fecha de solicitud.
              La consulta se hace bajo demanda para no releer toda la colección.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={expHistorico}
                onChange={(e) => setExpHistorico(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarHistorico(); } }}
                placeholder="Expediente exacto (ej. 123-25)…"
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 shrink-0">Solicitud desde</span>
              <DateField value={histDesde} onChange={setHistDesde} clearable placeholder="Desde" ariaLabel="Solicitud desde" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 shrink-0">Hasta</span>
              <DateField value={histHasta} onChange={setHistHasta} clearable placeholder="Hasta" ariaLabel="Solicitud hasta" />
            </div>
            <button
              onClick={buscarHistorico}
              disabled={buscando || sinCriterio}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Search size={13} /> {buscando ? "Buscando…" : "Buscar"}
            </button>
            {(expHistorico || histDesde || histHasta || resultados !== null) && (
              <button
                onClick={limpiarHistorico}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-500 transition-colors hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:hover:text-slate-100"
              >
                <X size={12} /> Limpiar
              </button>
            )}
          </div>
          {errorBusqueda && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
              {errorBusqueda}
            </div>
          )}
        </div>
      )}

      {!loading && base.length > 0 && (
        <>
          {/* Filtros por estado */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {FILTROS_ESTADO.map((f) => (
              <button
                key={f.value}
                onClick={() => { setFiltroEstado(f.value); setPagina(1); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filtroEstado === f.value
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Buscador + rango por fecha de alta */}
          <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
                placeholder="Buscar por paciente o expediente..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              />
            </div>
            {/* El histórico ya filtra por fecha en el servidor: aquí solo texto y estado */}
            {vista !== "historico" && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 shrink-0">Alta desde</span>
                  <DateField
                    value={fechaDesde}
                    onChange={(v) => { setFechaDesde(v); setPagina(1); }}
                    clearable
                    placeholder="Alta desde"
                    ariaLabel="Alta desde"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 shrink-0">Hasta</span>
                  <DateField
                    value={fechaHasta}
                    onChange={(v) => { setFechaHasta(v); setPagina(1); }}
                    clearable
                    placeholder="Hasta"
                    ariaLabel="Fecha hasta"
                  />
                </div>
              </>
            )}
            {hayFiltros && (
              <button
                onClick={() => { setBusqueda(""); setFiltroEstado("todos"); setFechaDesde(""); setFechaHasta(""); setPagina(1); }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
              >
                <X size={12} /> Limpiar
              </button>
            )}
          </div>
        </>
      )}

      {loading || buscando ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : vista === "historico" && resultados === null ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <History size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            Indique un expediente o un rango de fechas y pulse Buscar.
          </p>
        </div>
      ) : base.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <FileText size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            {vista === "mias"
              ? "No has solicitado incapacidades."
              : vista === "todas"
                ? "No hay incapacidades solicitadas ayer ni hoy."
                : "Sin resultados para esa búsqueda."}
          </p>
          {vista === "mias" && (
            <Link prefetch={false}
              href="/medico/incapacidades/nueva"
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
            >
              <Plus size={14} /> Solicitar la primera
            </Link>
          )}
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <Search size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">Sin coincidencias para los filtros aplicados.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map((s) => {
          const esMia = s.medicoId === user?.uid;
          return (
            <article
              key={s.id}
              className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03] transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-950/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800"
            >
              <span className={`absolute bottom-0 left-0 top-0 w-1 ${s.estado === "emitida" ? "bg-emerald-500" : "bg-amber-400"}`} />
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1 pl-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-[15px]">
                      {s.pacienteNombre}
                    </p>
                    {s.estado === "pendiente" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-full">
                        <Clock size={10} /> Pendiente
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={10} /> Emitida
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Exp. <span className="font-mono">{s.pacienteExpediente}</span>
                    {" · "}
                    {s.diasIncapacidad} {s.diasIncapacidad === 1 ? "día" : "días"}
                    {" · "}
                    Alta {formatFecha(s.fechaAlta)}
                  </p>
                  {vista !== "mias" && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 flex-wrap">
                      <User size={11} className="text-slate-400" />
                      {s.medicoNombre}
                      {s.medicoServicio && <span className="text-slate-400">· {s.medicoServicio}</span>}
                      {esMia && <span className="text-blue-600 dark:text-blue-400 font-medium">· Tuya</span>}
                    </p>
                  )}
                  {s.estado === "emitida" && s.emitidaPorNombre && (
                    <p className="text-xs text-green-700 dark:text-green-400 mt-1.5">
                      Emitida por {s.emitidaPorNombre}
                      {s.emitidaEn && ` · ${formatFecha(s.emitidaEn)}`}
                    </p>
                  )}
                </div>
                {esMia && s.estado === "pendiente" && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link prefetch={false}
                      href={`/medico/incapacidades/${s.id}/editar`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors"
                    >
                      <Pencil size={12} />
                      Editar
                    </Link>
                    {confirmandoId === s.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => eliminar(s.id!)}
                          disabled={eliminandoId === s.id}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {eliminandoId === s.id ? "Eliminando..." : "Sí, eliminar"}
                        </button>
                        <button
                          onClick={() => setConfirmandoId(null)}
                          disabled={eliminandoId === s.id}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmandoId(s.id!)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition-colors"
                        title="Eliminar solicitud"
                      >
                        <Trash2 size={12} />
                        Eliminar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
          })}

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-xs text-slate-500">
                {(paginaActual - 1) * PAGE_SIZE + 1}–{Math.min(paginaActual * PAGE_SIZE, filtradas.length)} de {filtradas.length}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={paginaActual === 1}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={13} /> Anterior
                </button>
                <span className="text-xs text-slate-500 px-1 tabular-nums">
                  {paginaActual} / {totalPaginas}
                </span>
                <button
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaActual === totalPaginas}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
