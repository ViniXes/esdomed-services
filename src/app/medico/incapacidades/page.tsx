"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection, query, where, onSnapshot, deleteDoc, doc,
  getDocs, orderBy, limit, type QueryDocumentSnapshot, type DocumentData,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { DateField } from "@/components/ui/DateField";
import { useAuth } from "@/contexts/AuthContext";
import { FileText, Plus, CheckCircle2, Clock, Pencil, Trash2, Search, ChevronLeft, ChevronRight, X, User, Users } from "lucide-react";
import type { EstadoIncapacidad, SolicitudIncapacidad } from "@/types";
import { toDate, formatFecha } from "@/lib/pacientes/helpers";

type FiltroEstado = EstadoIncapacidad | "todos";
type Vista = "mias" | "todas";

const FILTROS_ESTADO: { value: FiltroEstado; label: string }[] = [
  { value: "todos",     label: "Todas" },
  { value: "pendiente", label: "Pendientes" },
  { value: "emitida",   label: "Emitidas" },
];

// Tope de la vista pública (lectura puntual de todas las incapacidades).
const LIMIT_PUBLICO = 400;

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

  const PAGE_SIZE = 5;

  const eliminar = async (id: string) => {
    setEliminandoId(id);
    try {
      await deleteDoc(doc(db, "incapacidades", id));
      // onSnapshot refresca la lista automáticamente.
    } catch (e) {
      alert(`No se pudo eliminar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setEliminandoId(null);
      setConfirmandoId(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    const porFecha = (a: SolicitudIncapacidad, b: SolicitudIncapacidad) =>
      b.creadoEn.getTime() - a.creadoEn.getTime();

    if (vista === "mias") {
      // Vista personal: en vivo, solo las del médico.
      const q = query(collection(db, "incapacidades"), where("medicoId", "==", user.uid));
      return onSnapshot(q, (s) => {
        setSolicitudes(s.docs.map(mapIncapacidad).sort(porFecha));
        setLoading(false);
      });
    }

    // Vista pública: lectura puntual de todas (no abre un listener global por médico).
    let activo = true;
    const q = query(collection(db, "incapacidades"), orderBy("creadoEn", "desc"), limit(LIMIT_PUBLICO));
    getDocs(q)
      .then((s) => {
        if (!activo) return;
        setSolicitudes(s.docs.map(mapIncapacidad).sort(porFecha));
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

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente").length;

  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    // Rango por Fecha de alta, en hora local para no correr el día (UTC-6).
    const desde = fechaDesde ? new Date(fechaDesde + "T00:00:00") : null;
    const hasta = fechaHasta ? new Date(fechaHasta + "T23:59:59") : null;
    return solicitudes.filter((s) => {
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
  }, [solicitudes, busqueda, filtroEstado, fechaDesde, fechaHasta]);

  const hayFiltros = busqueda !== "" || filtroEstado !== "todos" || fechaDesde !== "" || fechaHasta !== "";

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = filtradas.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-50 dark:bg-amber-950 rounded-xl flex items-center justify-center border border-amber-200 dark:border-amber-900">
            <FileText size={17} className="text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Incapacidades
          </h1>
        </div>
        <Link
          href="/medico/incapacidades/nueva"
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={15} /> Nueva solicitud
        </Link>
      </div>

      {/* Toggle vista: personal vs pública */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4">
        {([
          { value: "mias",  label: "Mías",   icon: User },
          { value: "todas", label: "Todas",  icon: Users },
        ] as { value: Vista; label: string; icon: typeof User }[]).map((v) => (
          <button
            key={v.value}
            onClick={() => { if (v.value !== vista) setLoading(true); setVista(v.value); setPagina(1); }}
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

      {!loading && solicitudes.length > 0 && (
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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : solicitudes.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <FileText size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            {vista === "mias" ? "No has solicitado incapacidades." : "No hay incapacidades registradas."}
          </p>
          {vista === "mias" && (
            <Link
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
        <div className="space-y-2">
          {visibles.map((s) => {
          const esMia = s.medicoId === user?.uid;
          return (
            <div
              key={s.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-amber-300 dark:hover:border-amber-900 transition-all shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
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
                  {vista === "todas" && (
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
                    <Link
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
            </div>
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
