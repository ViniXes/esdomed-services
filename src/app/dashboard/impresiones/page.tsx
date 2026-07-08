"use client";

import { useEffect, useState } from "react";
import {
  collection, query, where, orderBy, onSnapshot, getDocs, limit,
  doc, updateDoc, Timestamp, QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { SolicitudImpresion } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { DateField } from "@/components/ui/DateField";
import { toDate } from "@/lib/pacientes/helpers";
import { Printer, Clock, Search, X, History, Inbox } from "lucide-react";

const ms = (ts: unknown) => toDate(ts)?.getTime() ?? 0;

export default function DashboardImpresionesPage() {
  const { profile } = useAuth();

  // Vista activa: bandeja en vivo ⇄ búsqueda histórica.
  const [vista, setVista] = useState<"bandeja" | "buscar">("bandeja");

  // Zona 1: pendientes en vivo (worklist). Aparecen al instante al subirlos.
  const [pendientes, setPendientes] = useState<SolicitudImpresion[]>([]);
  const [loadingPend, setLoadingPend] = useState(true);

  // Zona 2: búsqueda histórica bajo demanda (NO en vivo).
  const [busquedaExpediente, setBusquedaExpediente] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [resultados, setResultados] = useState<SolicitudImpresion[] | null>(null); // null = aún no se busca
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState("");

  const [saving, setSaving] = useState<string | null>(null);
  // Texto libre "entregado a" por solicitud, mientras está pendiente.
  const [entregadoA, setEntregadoA] = useState<Record<string, string>>({});

  // Solo los pendientes, en vivo: es el conjunto pequeño que ESDOMED debe imprimir,
  // y conviene que aparezcan al instante cuando un médico los sube. Sin orderBy en la
  // consulta para no requerir índice compuesto (estado + creadoEn); se ordena en cliente.
  useEffect(() => {
    const q = query(collection(db, "solicitudes_impresion"), where("estado", "==", "pendiente"));
    return onSnapshot(
      q,
      s => {
        const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudImpresion));
        docs.sort((a, b) => ms(b.creadoEn) - ms(a.creadoEn));
        setPendientes(docs);
        setLoadingPend(false);
      },
      () => setLoadingPend(false),
    );
  }, []);

  const dentroDelRango = (ts: unknown) => {
    if (!fechaDesde && !fechaHasta) return true;
    const d = toDate(ts);
    if (!d) return false;
    if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
    if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    return true;
  };

  // Búsqueda de impresiones anteriores: una sola lectura (getDocs), no un listener.
  // Trae solo lo que coincide y se guarda en estado (no se relee al navegar).
  const buscar = async () => {
    const exp = busquedaExpediente.trim();
    if (!exp && !fechaDesde && !fechaHasta) return;
    setBuscando(true);
    setErrorBusqueda("");
    try {
      let docs: SolicitudImpresion[];
      if (exp) {
        // Por expediente: TODAS las impresiones de ese paciente (cualquier estado/fecha).
        // Sin orderBy (evita índice compuesto expediente + creadoEn); si además hay
        // rango de fecha se aplica en cliente sobre un conjunto pequeño.
        const snap = await getDocs(query(
          collection(db, "solicitudes_impresion"),
          where("pacienteExpediente", "==", exp),
        ));
        docs = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as SolicitudImpresion))
          .filter(s => dentroDelRango(s.creadoEn));
      } else {
        // Por rango de fecha de solicitud (todo sobre creadoEn → sin índice compuesto).
        const constraints: QueryConstraint[] = [];
        if (fechaDesde) constraints.push(where("creadoEn", ">=", Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"))));
        if (fechaHasta) constraints.push(where("creadoEn", "<=", Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"))));
        constraints.push(orderBy("creadoEn", "desc"));
        constraints.push(limit(500));
        const snap = await getDocs(query(collection(db, "solicitudes_impresion"), ...constraints));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudImpresion));
      }
      docs.sort((a, b) => ms(b.creadoEn) - ms(a.creadoEn));
      setResultados(docs);
    } catch (e) {
      setErrorBusqueda((e as Error).message || "No se pudo completar la búsqueda.");
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  const limpiarBusqueda = () => {
    setBusquedaExpediente(""); setFechaDesde(""); setFechaHasta("");
    setResultados(null); setErrorBusqueda("");
  };

  const marcarImpreso = async (id: string) => {
    if (!profile) return;
    setSaving(id);
    const quien = (entregadoA[id] ?? "").trim();
    await updateDoc(doc(db, "solicitudes_impresion", id), {
      estado: "impreso", impresoPor: profile.uid,
      impresoPorNombre: profile.nombre, impresoEn: Timestamp.now(),
      ...(quien ? { entregadoA: quien } : {}),
    });
    // La lista de pendientes se actualiza sola (el listener suelta el doc). Los
    // resultados de búsqueda son una foto puntual → actualización optimista local
    // (impresoEn como Date, que es lo que espera el tipo SolicitudImpresion).
    const local = {
      estado: "impreso" as const, impresoPor: profile.uid,
      impresoPorNombre: profile.nombre, impresoEn: new Date(),
      ...(quien ? { entregadoA: quien } : {}),
    };
    setResultados(prev => prev?.map(s => (s.id === id ? { ...s, ...local } : s)) ?? prev);
    setSaving(null);
  };

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString("es-HN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const sinCriterio = !busquedaExpediente.trim() && !fechaDesde && !fechaHasta;

  const renderSolicitud = (s: SolicitudImpresion) => (
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
  );

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
          {pendientes.length} pendiente(s)
        </div>
      </div>

      {/* Cambio de vista: bandeja en vivo ⇄ búsqueda histórica */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl mb-6 w-full sm:w-fit">
        <button onClick={() => setVista("bandeja")}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            vista === "bandeja"
              ? "bg-white dark:bg-slate-900 shadow-sm text-violet-700 dark:text-violet-300"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}>
          <Inbox size={15} /> Pendientes
          {pendientes.length > 0 && (
            <span className="min-w-[18px] px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none bg-amber-500 text-white">
              {pendientes.length}
            </span>
          )}
        </button>
        <button onClick={() => setVista("buscar")}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            vista === "buscar"
              ? "bg-white dark:bg-slate-900 shadow-sm text-violet-700 dark:text-violet-300"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}>
          <Search size={15} /> Buscar anteriores
        </button>
      </div>

      {/* ── Vista: Pendientes (en vivo) ── */}
      {vista === "bandeja" && (
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={15} className="text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Pendientes de imprimir</h2>
        </div>
        {loadingPend ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : pendientes.length === 0 ? (
          <p className="text-sm text-slate-500 py-10 text-center">No hay impresiones pendientes.</p>
        ) : (
          <div className="space-y-3">{pendientes.map(renderSolicitud)}</div>
        )}
      </section>
      )}

      {/* ── Vista: Buscar impresiones anteriores (bajo demanda) ── */}
      {vista === "buscar" && (
      <section>
        <div className="flex items-center gap-2 mb-1">
          <History size={15} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Buscar impresiones anteriores</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Busca por expediente (trae todas las de ese paciente) o por rango de fecha. La búsqueda se hace bajo demanda.
        </p>

        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="text" placeholder="Buscar por expediente..." value={busquedaExpediente}
              onChange={e => setBusquedaExpediente(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") buscar(); }}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Desde</span>
            <DateField value={fechaDesde} onChange={setFechaDesde} clearable placeholder="Desde" ariaLabel="Desde" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Hasta</span>
            <DateField value={fechaHasta} onChange={setFechaHasta} clearable placeholder="Hasta" ariaLabel="Hasta" />
          </div>
          <button onClick={buscar} disabled={buscando || sinCriterio}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm">
            <Search size={13} /> {buscando ? "Buscando..." : "Buscar"}
          </button>
          {(busquedaExpediente || fechaDesde || fechaHasta || resultados !== null) && (
            <button onClick={limpiarBusqueda}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
              <X size={12} /> Limpiar
            </button>
          )}
        </div>

        {errorBusqueda && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400 mb-4">
            {errorBusqueda}
          </div>
        )}

        {resultados === null ? (
          <p className="text-sm text-slate-400 py-8 text-center">
            Escribe un expediente o elige un rango de fechas y pulsa Buscar.
          </p>
        ) : buscando ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : resultados.length === 0 ? (
          <p className="text-sm text-slate-500 py-10 text-center">Sin resultados para esa búsqueda.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-3">{resultados.length} resultado(s)</p>
            <div className="space-y-3">{resultados.map(renderSolicitud)}</div>
          </>
        )}
      </section>
      )}
    </div>
  );
}
