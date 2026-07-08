"use client";

import { useEffect, useState } from "react";
import {
  collection, query, where, orderBy, onSnapshot, getDocs, limit,
  doc, updateDoc, Timestamp, QueryConstraint,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { NotificacionFallecido } from "@/types";
import { getLecturaConfirmada } from "@/lib/fallecidos";
import { Badge } from "@/components/ui/Badge";
import { DateField } from "@/components/ui/DateField";
import { HeartPulse, X, CheckCircle2, Clock, Search, ChevronLeft, ChevronRight, History } from "lucide-react";

// Registros por página en la tabla (paginación de a 10).
const PAGE_SIZE = 10;
// Ventana en vivo: solo las N notificaciones más recientes. Las anteriores se
// consultan bajo demanda (por expediente o rango de fecha), no en vivo, para que
// el listener no crezca sin tope conforme se acumulan fallecidos.
const LIVE_LIMIT = 20;

const tsToDate = (ts: unknown): Date | null => {
  if (!ts) return null;
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return isNaN(d.getTime()) ? null : d;
};
const formatHora = (ts: unknown) => {
  const d = tsToDate(ts);
  return d ? d.toLocaleString("es-HN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : null;
};
const formatFechaHora = (ts: unknown) => {
  const d = tsToDate(ts);
  return d ? d.toLocaleString("es-HN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
};

/**
 * Vista de revisión de notificaciones de fallecidos para personal que solo
 * confirma "visto" (Psicología / Trabajo Social). Comparte los campos
 * lecturaPor / lecturaEn definidos en NotificacionFallecido.
 */
export default function FallecidosRevisionView({
  rol = "psicologia",
}: {
  rol?: "psicologia" | "trabajo_social";
}) {
  const areaLabel = rol === "trabajo_social" ? "Trabajo Social" : "Psicología";
  const reglaLabel = rol === "trabajo_social" ? "trabajo_social" : "psicologia";

  const { profile } = useAuth();
  // Zona 1: las más recientes, en vivo (worklist). Nuevos fallecidos aparecen al instante.
  const [notificaciones, setNotificaciones] = useState<NotificacionFallecido[]>([]);
  const [filtro, setFiltro] = useState<"pendiente" | "confirmado" | "todos">("todos");

  // Zona 2: búsqueda histórica bajo demanda (NO en vivo).
  const [busquedaExpediente, setBusquedaExpediente] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [resultados, setResultados] = useState<NotificacionFallecido[] | null>(null); // null = aún no se busca
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState("");

  const [selected, setSelected] = useState<NotificacionFallecido | null>(null);
  const [savingVisto, setSavingVisto] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "notificaciones_fallecidos"), orderBy("creadoEn", "desc"), limit(LIVE_LIMIT));
    return onSnapshot(
      q,
      s => {
        setPermissionError(false);
        setNotificaciones(s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido)));
      },
      err => {
        if (err.code === "permission-denied") setPermissionError(true);
      }
    );
  }, []);

  const recientes = filtro === "todos" ? notificaciones : notificaciones.filter(n => n.estado === filtro);
  const pendientes = notificaciones.filter(n => n.estado === "pendiente").length;

  const dentroDelRango = (ts: unknown) => {
    if (!fechaDesde && !fechaHasta) return true;
    const d = tsToDate(ts);
    if (!d) return false;
    if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
    if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    return true;
  };

  // Búsqueda de notificaciones anteriores: una sola lectura (getDocs), no un listener.
  const buscar = async () => {
    const exp = busquedaExpediente.trim();
    if (!exp && !fechaDesde && !fechaHasta) return;
    setBuscando(true);
    setErrorBusqueda("");
    try {
      let docs: NotificacionFallecido[];
      if (exp) {
        // Por expediente: TODAS las notificaciones de ese paciente (cualquier fecha).
        // Sin orderBy (evita índice compuesto); el rango de fecha, si lo hay, se aplica
        // en cliente sobre un conjunto pequeño.
        const snap = await getDocs(query(
          collection(db, "notificaciones_fallecidos"),
          where("pacienteExpediente", "==", exp),
        ));
        docs = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido))
          .filter(n => dentroDelRango(n.fechaDefuncion));
      } else {
        // Por rango de fecha de defunción (todo sobre fechaDefuncion → sin índice compuesto).
        const constraints: QueryConstraint[] = [];
        if (fechaDesde) constraints.push(where("fechaDefuncion", ">=", Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"))));
        if (fechaHasta) constraints.push(where("fechaDefuncion", "<=", Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"))));
        constraints.push(orderBy("fechaDefuncion", "desc"));
        constraints.push(limit(500));
        const snap = await getDocs(query(collection(db, "notificaciones_fallecidos"), ...constraints));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido));
      }
      docs.sort((a, b) => (tsToDate(b.fechaDefuncion)?.getTime() ?? 0) - (tsToDate(a.fechaDefuncion)?.getTime() ?? 0));
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

  const sinCriterio = !busquedaExpediente.trim() && !fechaDesde && !fechaHasta;

  // El detalle sale de la lista viva o de los resultados de búsqueda (el que lo tenga).
  const selectedLive = selected
    ? (notificaciones.find(n => n.id === selected.id) ?? resultados?.find(n => n.id === selected.id) ?? selected)
    : null;
  const lecturaSel = selectedLive ? getLecturaConfirmada(selectedLive) : null;

  const confirmarVisto = async () => {
    if (!selectedLive?.id || !profile) return;
    setSavingVisto(true);
    // La confirmación de LECTURA es independiente de la asignación/entrega del
    // certificado (recibeDePs*, que escribe ESDOMED). El área sale del rol REAL
    // del usuario, no de la ruta, para que nunca quede desfasada del nombre.
    const id = selectedLive.id;
    await updateDoc(doc(db, "notificaciones_fallecidos", id), {
      lecturaPor:    profile.nombre,
      lecturaPorUid: profile.uid,
      lecturaPorRol: profile.role,
      lecturaEn:     Timestamp.now(),
    });
    // La lista viva se actualiza sola (listener). Los resultados de búsqueda son una
    // foto puntual → actualización optimista local (lecturaEn como Date, según el tipo).
    const local = { lecturaPor: profile.nombre, lecturaPorUid: profile.uid, lecturaPorRol: profile.role, lecturaEn: new Date() };
    setResultados(prev => prev?.map(n => (n.id === id ? { ...n, ...local } : n)) ?? prev);
    setSavingVisto(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-rose-50 dark:bg-rose-950 rounded-xl flex items-center justify-center border border-rose-200 dark:border-rose-900">
            <HeartPulse size={17} className="text-rose-600 dark:text-rose-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Notificaciones de fallecidos
          </h1>
        </div>
        {pendientes > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-3 py-1.5 rounded-xl">
            <Clock size={14} />
            {pendientes} sin confirmar
          </div>
        )}
      </div>

      {/* Error de permisos */}
      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer notificaciones. Pide al administrador que agregue <strong>{reglaLabel}</strong> a las reglas de Firestore.
        </div>
      )}

      {/* ── Zona 1: Recientes (en vivo) ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mr-1">Recientes</h2>
          {[
            { label: "Todos",       value: "todos"      },
            { label: "Pendientes",  value: "pendiente"  },
            { label: "Confirmados", value: "confirmado" },
          ].map(f => (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value as typeof filtro)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filtro === f.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500">Últimas {LIVE_LIMIT}</span>
        </div>
        <TablaNotificaciones lista={recientes} onSelect={setSelected} />
      </section>

      {/* ── Zona 2: Buscar notificaciones anteriores (bajo demanda) ── */}
      <section className="border-t border-slate-200 dark:border-slate-800 pt-6 space-y-3">
        <div className="flex items-center gap-2">
          <History size={15} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Buscar notificaciones anteriores</h2>
        </div>
        <p className="text-xs text-slate-500 -mt-1">
          Busca por expediente (trae todas las de ese paciente) o por rango de fecha de defunción. La búsqueda se hace bajo demanda.
        </p>

        <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por expediente…"
              value={busquedaExpediente}
              onChange={e => setBusquedaExpediente(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") buscar(); }}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Desde</span>
            <DateField value={fechaDesde} onChange={setFechaDesde} clearable placeholder="Desde" ariaLabel="Fecha desde" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Hasta</span>
            <DateField value={fechaHasta} onChange={setFechaHasta} clearable placeholder="Hasta" ariaLabel="Fecha hasta" />
          </div>
          <button onClick={buscar} disabled={buscando || sinCriterio}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm">
            <Search size={13} /> {buscando ? "Buscando…" : "Buscar"}
          </button>
          {(busquedaExpediente || fechaDesde || fechaHasta || resultados !== null) && (
            <button onClick={limpiarBusqueda}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
              <X size={12} /> Limpiar
            </button>
          )}
        </div>

        {errorBusqueda && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {errorBusqueda}
          </div>
        )}

        {resultados === null ? (
          <p className="text-sm text-slate-400 py-8 text-center">
            Escribe un expediente o elige un rango de fechas y pulsa Buscar.
          </p>
        ) : buscando ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {resultados.length > 0 && <p className="text-xs text-slate-500">{resultados.length} resultado(s)</p>}
            <TablaNotificaciones lista={resultados} onSelect={setSelected} />
          </>
        )}
      </section>

      {/* Modal de detalle */}
      {selectedLive && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-[95vw] max-w-lg max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 flex-shrink-0">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-0.5">Expediente</p>
                <h2 className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                  {selectedLive.pacienteExpediente}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedLive.pacienteNombre} · {selectedLive.servicio} · Cama {selectedLive.cama}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge estado={selectedLive.estado} />
                <button
                  onClick={() => setSelected(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">

              {/* Datos del caso */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Datos del caso</p>
                <InfoCell label="Fecha y hora de defunción"  value={formatFechaHora(selectedLive.fechaDefuncion)} />
                <InfoCell label="Notificado por"   value={`Dr. ${selectedLive.medicoNombre}`} />
                <InfoCell label="Servicio"         value={selectedLive.servicio} />
                {selectedLive.causaMuerte && <InfoCell label="Causa" value={selectedLive.causaMuerte} />}
                {selectedLive.estado === "confirmado" && (
                  <InfoCell label="DUI validado (ESDOMED)" value={selectedLive.duiValidado ? "Sí — DUI ok" : "No — Sin DUI"} />
                )}
              </div>

              {/* Confirmación del área */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Recepción</p>
                {lecturaSel ? (
                  <div className="flex items-start gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 px-3 py-2.5 rounded-lg">
                    <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Confirmado por <span className="font-semibold">{lecturaSel.por}</span>
                      {lecturaSel.rol && (
                        <span className="ml-1.5 align-middle"><AreaBadge rol={lecturaSel.rol} /></span>
                      )}
                      {lecturaSel.en && (
                        <><br /><span className="text-xs opacity-75">{formatHora(lecturaSel.en)}</span></>
                      )}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Aún no confirmado.</p>
                )}
              </div>
            </div>

            {/* Footer: confirmar visto */}
            {!lecturaSel && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
                <button
                  onClick={confirmarVisto}
                  disabled={savingVisto}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-500 disabled:opacity-50 transition-colors"
                >
                  {savingVisto ? "Confirmando..." : `Confirmar visto por ${areaLabel}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TablaNotificaciones({ lista, onSelect }: { lista: NotificacionFallecido[]; onSelect: (n: NotificacionFallecido) => void }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(lista.length / PAGE_SIZE));
  // Reinicia a la página 1 cuando cambia la lista (patrón de ajuste de estado en render).
  const key = `${lista.length}|${lista[0]?.id ?? ""}`;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) { setPrevKey(key); setPage(1); }
  const pageSafe = Math.min(page, totalPages);
  const paginados = lista.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  if (lista.length === 0) {
    return <p className="text-sm text-slate-500 py-8 text-center">Sin notificaciones que coincidan.</p>;
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Paciente</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Servicio / Fecha</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Médico</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Recepción</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {paginados.map(n => (
              <tr key={n.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-sm">{n.pacienteExpediente}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{n.pacienteNombre}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-700 dark:text-slate-300">{n.servicio} · Cama {n.cama}</p>
                  <p className="text-xs text-slate-500 mt-0.5">† {formatFechaHora(n.fechaDefuncion)}</p>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                  Dr. {n.medicoNombre}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <Badge estado={n.estado} />
                    {n.estado === "confirmado" && n.confirmadoPorNombre && (
                      <span className="text-[11px] text-slate-500">por {n.confirmadoPorNombre}</span>
                    )}
                    {n.estado === "confirmado" && <DuiBadge ok={!!n.duiValidado} />}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const lectura = getLecturaConfirmada(n);
                    return lectura ? (
                      <div className="flex flex-col items-start gap-1">
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle2 size={13} /> Visto
                        </span>
                        <span className="text-[11px] text-slate-500">{lectura.por}</span>
                        <AreaBadge rol={lectura.rol} />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Pendiente</span>
                    );
                  })()}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onSelect(n)}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors whitespace-nowrap"
                  >
                    Ver detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between gap-4">
        <span className="text-xs text-slate-500 shrink-0">
          {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, lista.length)} de{" "}
          <span className="font-medium text-slate-700 dark:text-slate-300">{lista.length}</span>
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, pageSafe - 1))}
              disabled={pageSafe === 1}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-slate-500 px-2 tabular-nums">{pageSafe} / {totalPages}</span>
            <button
              onClick={() => setPage(Math.min(totalPages, pageSafe + 1))}
              disabled={pageSafe === totalPages}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AreaBadge({ rol }: { rol?: string }) {
  if (rol === "trabajo_social") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
        Trabajo Social
      </span>
    );
  }
  if (rol === "psicologia") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
        Psicología
      </span>
    );
  }
  return null;
}

function DuiBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
      DUI ok
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
      Sin DUI
    </span>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-slate-800 dark:text-slate-200 font-medium mt-0.5">{value}</p>
    </div>
  );
}
