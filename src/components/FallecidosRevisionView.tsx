"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { ArrowUpRight, CheckCircle2, Clock, Eye, History, Inbox, Loader2, Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import { FallecidoAvisoDetalle } from "@/components/fallecidos/FallecidoAvisoDetalle";
import ui from "@/components/fallecidos/FallecidosUi.module.css";
import review from "@/components/fallecidos/RevisionFallecidos.module.css";

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
  const recepcionesHref = rol === "trabajo_social" ? "/dashboard/recepciones" : "/psicologia/recepciones";

  const { profile } = useAuth();
  // Zona 1: las más recientes, en vivo (worklist). Nuevos fallecidos aparecen al instante.
  const [notificaciones, setNotificaciones] = useState<NotificacionFallecido[]>([]);
  const [filtro, setFiltro] = useState<"pendiente" | "confirmado" | "todos">("todos");
  const [filtroLectura, setFiltroLectura] = useState<"sin_leer" | "leidos" | "todos">("todos");
  const [vista, setVista] = useState<"recientes" | "historico">("recientes");

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

  const porEstado = filtro === "todos" ? notificaciones : notificaciones.filter(n => n.estado === filtro);
  const recientes = porEstado.filter(n => filtroLectura === "todos" || (filtroLectura === "leidos" ? !!getLecturaConfirmada(n) : !getLecturaConfirmada(n)));
  const sinLeer = notificaciones.filter(n => !getLecturaConfirmada(n)).length;
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
    <div className={ui.page}>
      <header className={ui.pageHeading}>
        <div>
          <div className={ui.eyebrow}>{areaLabel}<span aria-hidden="true">/</span>Defunciones</div>
          <h1 className="font-heading">Avisos de defunción</h1>
        </div>
        <Link href={recepcionesHref} prefetch={false} className={ui.secondaryButton}><Inbox size={16} aria-hidden="true" />Mis recepciones<ArrowUpRight size={14} aria-hidden="true" /></Link>
      </header>
      <div className={ui.stats} aria-label="Estado de los avisos recientes">
        <button type="button" className={ui.stat} data-tone="pending" aria-pressed={vista === "recientes" && filtroLectura === "sin_leer"}
          onClick={() => { setVista("recientes"); setFiltro("todos"); setFiltroLectura(filtroLectura === "sin_leer" ? "todos" : "sin_leer"); }}>
          <span><Eye size={17} aria-hidden="true" />Sin lectura confirmada</span><strong>{sinLeer}</strong>
        </button>
        <button type="button" className={ui.stat} aria-pressed={vista === "recientes" && filtroLectura === "leidos"}
          onClick={() => { setVista("recientes"); setFiltro("todos"); setFiltroLectura(filtroLectura === "leidos" ? "todos" : "leidos"); }}>
          <span><CheckCircle2 size={17} aria-hidden="true" />Lectura confirmada</span><strong>{notificaciones.length - sinLeer}</strong>
        </button>
        <button type="button" className={ui.stat} aria-pressed={vista === "recientes" && filtro === "pendiente"}
          onClick={() => { setVista("recientes"); setFiltroLectura("todos"); setFiltro(filtro === "pendiente" ? "todos" : "pendiente"); }}>
          <span><Clock size={17} aria-hidden="true" />Pendientes en ESDOMED</span><strong>{pendientes}</strong>
        </button>
      </div>
      {permissionError && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">No tienes permiso para consultar estos avisos. Contacta al administrador.</p>}
      <nav className={review.tabs} aria-label="Consulta de avisos">
        <button type="button" aria-pressed={vista === "recientes"} onClick={() => setVista("recientes")}><Inbox size={16} aria-hidden="true" />Avisos recientes</button>
        <button type="button" aria-pressed={vista === "historico"} onClick={() => setVista("historico")}><History size={16} aria-hidden="true" />Buscar histórico</button>
      </nav>
      {vista === "recientes" ? (
        <section aria-label="Avisos recientes" className="mt-5 space-y-5">
          <div className={review.toolbar}>
            <div className={review.filters}>
              <label className={review.field}>Lectura del aviso
                <select value={filtroLectura} onChange={e => setFiltroLectura(e.target.value as typeof filtroLectura)}>
                  <option value="todos">Todas</option><option value="sin_leer">Sin lectura confirmada</option><option value="leidos">Lectura confirmada</option>
                </select>
              </label>
              <label className={review.field}>Revisión de ESDOMED
                <select value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)}>
                  <option value="todos">Todos los estados</option><option value="pendiente">Pendiente de confirmación</option><option value="confirmado">Confirmado</option>
                </select>
              </label>
            </div>
            <span className={review.count}>{recientes.length} de {notificaciones.length} avisos recientes · Hasta {LIVE_LIMIT}</span>
          </div>
          <TablaNotificaciones lista={recientes} onSelect={setSelected} />
        </section>
      ) : (
        <section aria-label="Búsqueda histórica" className="mt-5 space-y-5">
          <div className={review.search}>
            <label className={review.field}>Expediente
              <input type="text" placeholder="Expediente exacto" value={busquedaExpediente} onChange={e => setBusquedaExpediente(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") buscar(); }} />
            </label>
            <div className={review.field}><span>Defunción desde</span><DateField value={fechaDesde} onChange={setFechaDesde} clearable placeholder="Desde" ariaLabel="Fecha desde" /></div>
            <div className={review.field}><span>Hasta</span><DateField value={fechaHasta} onChange={setFechaHasta} clearable placeholder="Hasta" ariaLabel="Fecha hasta" /></div>
            <button type="button" onClick={buscar} disabled={buscando || sinCriterio} className={ui.primaryButton}>
              {buscando ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}{buscando ? "Buscando…" : "Buscar"}
            </button>
            {(busquedaExpediente || fechaDesde || fechaHasta || resultados !== null) && <button type="button" onClick={limpiarBusqueda} className={ui.secondaryButton}><X size={14} aria-hidden="true" />Limpiar</button>}
          </div>
          {errorBusqueda && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">{errorBusqueda}</p>}
          {buscando ? <div className={review.empty} role="status"><Loader2 size={22} className="animate-spin" aria-hidden="true" />Buscando avisos…</div>
            : resultados === null ? <div className={review.empty}><History size={28} strokeWidth={1.5} aria-hidden="true" /><p>Consulta por expediente o fecha de defunción</p></div>
            : <><p className={review.count}>{resultados.length} {resultados.length === 1 ? "resultado" : "resultados"}</p><TablaNotificaciones lista={resultados} onSelect={setSelected} /></>}
        </section>
      )}
      {selectedLive && <FallecidoAvisoDetalle notificacion={selectedLive} lectura={lecturaSel} area={areaLabel}
        recepcionesHref={recepcionesHref} saving={savingVisto} onConfirm={confirmarVisto} onClose={() => setSelected(null)} />}
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

  if (lista.length === 0) return <div className={review.empty}><Inbox size={28} strokeWidth={1.5} aria-hidden="true" /><p>Sin avisos que coincidan</p></div>;
  return (
    <div className={review.tableWrap}>
      <div className="overflow-x-auto">
        <table className={review.table} aria-label="Avisos de defunción">
          <thead><tr><th>Expediente / Paciente</th><th>Defunción</th><th>Revisión de ESDOMED</th><th>Lectura del aviso</th><th><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            {paginados.map(n => {
              const lectura = getLecturaConfirmada(n);
              return (
                <tr key={n.id}>
                  <td><div className={ui.tablePatient}><strong>{n.pacienteExpediente}</strong><span>{n.pacienteNombre}</span></div></td>
                  <td><p className="font-medium text-slate-700 dark:text-slate-200">{n.servicio} · Cama {n.cama}</p><span className={review.secondaryLine}>{formatFechaHora(n.fechaDefuncion)}</span></td>
                  <td><Badge estado={n.estado} />{n.estado === "confirmado" && <><span className={review.secondaryLine}>{n.confirmadoPorNombre}</span><span className={review.secondaryLine}>{n.duiValidado ? "DUI validado" : "DUI sin validar"}</span></>}</td>
                  <td>
                    <span className={review.status} data-complete={!!lectura}>{lectura ? <CheckCircle2 size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}{lectura ? "Lectura confirmada" : "Por confirmar lectura"}</span>
                    {lectura && <><span className={review.secondaryLine}>{lectura.por}</span>{lectura.rol && <span className={review.secondaryLine}>{lectura.rol === "trabajo_social" ? "Trabajo Social" : lectura.rol === "psicologia" ? "Psicología" : lectura.rol}{lectura.en && <> · {formatHora(lectura.en)}</>}</span>}</>}
                  </td>
                  <td className="text-right"><button type="button" className={ui.openButton} onClick={() => onSelect(n)} aria-label={"Revisar expediente " + n.pacienteExpediente}>Revisar<ArrowUpRight size={14} aria-hidden="true" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={review.pagination}>
        <span>{(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, lista.length)} de {lista.length}</span>
        {totalPages > 1 && <div>
          <button type="button" onClick={() => setPage(Math.max(1, pageSafe - 1))} disabled={pageSafe === 1} className={ui.iconButton} aria-label="Página anterior"><ChevronLeft size={16} aria-hidden="true" /></button>
          <span>{pageSafe} / {totalPages}</span>
          <button type="button" onClick={() => setPage(Math.min(totalPages, pageSafe + 1))} disabled={pageSafe === totalPages} className={ui.iconButton} aria-label="Página siguiente"><ChevronRight size={16} aria-hidden="true" /></button>
        </div>}
      </div>
    </div>
  );
}
