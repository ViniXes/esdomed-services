"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp,
  where, getDocs, limit, arrayUnion, QueryConstraint,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { DateField } from "@/components/ui/DateField";
import { useAuth } from "@/contexts/AuthContext";
import { SolicitudTraslado, EstadoTraslado, Paciente, MovimientoPaciente } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { ArrowRightLeft, Clock, X, Building2, RefreshCw, Search, History, Inbox } from "lucide-react";

const FILTROS: { label: string; value: EstadoTraslado | "todos" }[] = [
  { label: "Todos", value: "todos" },
  { label: "Pendientes", value: "pendiente" },
  { label: "En revisión", value: "en_revision" },
  { label: "Aprobados", value: "aprobado" },
  { label: "Rechazados", value: "rechazado" },
];

// Ventana en vivo: las últimas 50 solicitudes (cualquier estado) + TODAS las
// pendientes (aunque sean más viejas que esa ventana, para no perder ninguna por
// procesar). Lo anterior a esto se busca bajo demanda por expediente o fecha.
const LIVE_LIMIT = 50;

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none";

const ms = (ts: unknown) => (ts as { toDate?: () => Date })?.toDate?.()?.getTime() ?? new Date(ts as string).getTime() ?? 0;

function dedupe(...listas: SolicitudTraslado[][]): SolicitudTraslado[] {
  const m = new Map<string, SolicitudTraslado>();
  listas.flat().forEach(t => { if (t.id) m.set(t.id, t); });
  return [...m.values()].sort((a, b) => ms(b.creadoEn) - ms(a.creadoEn));
}

export default function DashboardTrasladosPage() {
  const { user, profile } = useAuth();

  // Zona 1: en vivo — últimas 50 (cualquier estado) + todas las pendientes.
  const [recientes, setRecientes] = useState<SolicitudTraslado[]>([]);
  const [pendientesLive, setPendientesLive] = useState<SolicitudTraslado[]>([]);
  const [filtro, setFiltro] = useState<EstadoTraslado | "todos">("pendiente");
  const [vista, setVista] = useState<"bandeja" | "buscar">("bandeja");

  // Zona 2: búsqueda histórica bajo demanda (NO en vivo).
  const [busquedaExpediente, setBusquedaExpediente] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [resultados, setResultados] = useState<SolicitudTraslado[] | null>(null); // null = aún no se busca
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState("");

  const [selected, setSelected] = useState<SolicitudTraslado | null>(null);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "traslados"), orderBy("creadoEn", "desc"), limit(LIVE_LIMIT));
    return onSnapshot(q, s => setRecientes(s.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudTraslado))));
  }, []);

  useEffect(() => {
    const q = query(collection(db, "traslados"), where("estado", "==", "pendiente"));
    return onSnapshot(q, s => setPendientesLive(s.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudTraslado))));
  }, []);

  const enVivo = useMemo(() => dedupe(recientes, pendientesLive), [recientes, pendientesLive]);
  const displayList = filtro === "todos" ? enVivo : enVivo.filter(t => t.estado === filtro);

  const dentroDelRango = (ts: unknown) => {
    if (!fechaDesde && !fechaHasta) return true;
    const d = (ts as { toDate?: () => Date })?.toDate?.();
    if (!d) return false;
    if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
    if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    return true;
  };

  // Búsqueda de traslados anteriores: una sola lectura (getDocs), no un listener.
  const buscar = async () => {
    const exp = busquedaExpediente.trim();
    if (!exp && !fechaDesde && !fechaHasta) return;
    setBuscando(true);
    setErrorBusqueda("");
    try {
      let docs: SolicitudTraslado[];
      if (exp) {
        // Por expediente: puede aparecer como paciente A o como paciente B (intercambio).
        // Dos consultas de igualdad (sin índice compuesto) + merge por id.
        const [snapA, snapB] = await Promise.all([
          getDocs(query(collection(db, "traslados"), where("pacienteExpediente", "==", exp))),
          getDocs(query(collection(db, "traslados"), where("pacienteBExpediente", "==", exp))),
        ]);
        docs = dedupe(
          snapA.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudTraslado)),
          snapB.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudTraslado)),
        ).filter(t => dentroDelRango(t.creadoEn));
      } else {
        // Por rango de fecha (todo sobre creadoEn → sin índice compuesto).
        const constraints: QueryConstraint[] = [];
        if (fechaDesde) constraints.push(where("creadoEn", ">=", Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"))));
        if (fechaHasta) constraints.push(where("creadoEn", "<=", Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"))));
        constraints.push(orderBy("creadoEn", "desc"));
        constraints.push(limit(500));
        const snap = await getDocs(query(collection(db, "traslados"), ...constraints));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudTraslado));
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

  const sinCriterio = !busquedaExpediente.trim() && !fechaDesde && !fechaHasta;

  const actualizarEstado = async (estado: EstadoTraslado) => {
    if (!selected?.id || !profile) return;
    setSaving(true);
    const id = selected.id;
    await updateDoc(doc(db, "traslados", id), {
      estado, notasEsdomed: notas,
      revisadoPor: profile.uid, revisadoPorNombre: profile.nombre,
      actualizadoEn: Timestamp.now(),
    });
    // Si se aprueba, propagar el movimiento al/los paciente(s) si existen en la BD
    if (estado === "aprobado") {
      try {
        await aplicarTrasladoAPaciente(selected, profile.nombre);
      } catch (err) {
        // No bloqueamos la aprobación del traslado si la sincronización falla
        console.error("Error sincronizando traslado con paciente:", err);
      }
      // Si el traslado saca al paciente de una unidad UCI/UCIN, cierra automáticamente
      // la ficha de esa unidad (mismo efecto que un egreso vivo/fallecido manual).
      try {
        if (user) {
          const token = await user.getIdToken();
          await fetch(`/api/esdomed/traslados/${id}/cerrar-ficha-critica`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch (err) {
        console.error("Error cerrando ficha UCI/UCIN tras traslado:", err);
      }
    }
    // La lista en vivo se actualiza sola (listeners). Los resultados de búsqueda son
    // una foto puntual → actualización optimista local.
    const local = { estado, notasEsdomed: notas, revisadoPor: profile.uid, revisadoPorNombre: profile.nombre };
    setResultados(prev => prev?.map(t => (t.id === id ? { ...t, ...local } : t)) ?? prev);
    setSaving(false); setSelected(null); setNotas("");
  };

  const getTipoLabel = (tipo?: string) => {
    if (tipo === "servicio_cama") return { label: "Servicio a Servicio", color: "text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 border-blue-200 dark:border-blue-800", icon: Building2 };
    if (tipo === "interno") return { label: "Interno", color: "text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 border-purple-200 dark:border-purple-800", icon: ArrowRightLeft };
    if (tipo === "intercambio") return { label: "Intercambio", color: "text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/50 border-orange-200 dark:border-orange-800", icon: RefreshCw };
    return { label: "Traslado", color: "text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700", icon: ArrowRightLeft };
  };

  const abrir = (t: SolicitudTraslado) => { setSelected(t); setNotas(t.notasEsdomed ?? ""); };

  const renderTraslado = (t: SolicitudTraslado) => {
    const typeInfo = getTipoLabel(t.tipoTraslado);
    const Icon = typeInfo.icon;
    return (
      <div key={t.id} onClick={() => abrir(t)}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 cursor-pointer hover:border-blue-300 dark:hover:border-blue-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">

            <div className="flex items-center gap-2 mb-1.5">
              <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${typeInfo.color}`}>
                <Icon size={10} /> {typeInfo.label}
              </span>
              <span className="text-xs text-slate-400 font-medium">{formatFechaHora(t.creadoEn)}</span>
            </div>

            {t.tipoTraslado === "intercambio" ? (
              <div className="space-y-1 mt-2">
                <div className="text-sm">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">Exp. {t.pacienteExpediente}</span>
                  {t.pacienteNombre && <span className="text-slate-500 ml-1">({t.pacienteNombre})</span>}
                  <span className="text-xs text-slate-500 ml-2">↔</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 ml-2">Exp. {t.pacienteBExpediente}</span>
                  {t.pacienteBNombre && <span className="text-slate-500 ml-1">({t.pacienteBNombre})</span>}
                </div>
                <p className="text-xs text-slate-500">Servicios: {t.servicioOrigen} / {t.servicioDestino}</p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                  Exp. {t.pacienteExpediente} {t.pacienteNombre ? `- ${t.pacienteNombre}` : ""}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {t.servicioOrigen} (Cama {t.camaOrigen}) → {t.tipoTraslado === "interno" ? t.servicioOrigen : t.servicioDestino} (Cama {t.camaDestino})
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <p className="text-xs text-slate-500">
                Dr. {t.medicoNombre}{t.medicoJvpm ? ` · JVPM ${t.medicoJvpm}` : ""}
              </p>
              {t.revisadoPorNombre && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  Procesado por: {t.revisadoPorNombre}
                </span>
              )}
              {t.respuestaMedico && t.estado === "pendiente" && (
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100 dark:bg-blue-900/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  Médico respondió
                </span>
              )}
            </div>
          </div>
          <Badge estado={t.estado} />
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
            <ArrowRightLeft size={17} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Solicitudes de traslado</h1>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-3 py-1.5 rounded-xl">
          <Clock size={14} />
          {pendientesLive.length} pendiente(s)
        </div>
      </div>

      {/* Cambio de vista: bandeja en vivo ⇄ búsqueda histórica */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl mb-6 w-full sm:w-fit">
        <button onClick={() => setVista("bandeja")}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            vista === "bandeja"
              ? "bg-white dark:bg-slate-900 shadow-sm text-blue-700 dark:text-blue-300"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}>
          <Inbox size={15} /> Bandeja
          {pendientesLive.length > 0 && (
            <span className="min-w-[18px] px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none bg-amber-500 text-white">
              {pendientesLive.length}
            </span>
          )}
        </button>
        <button onClick={() => setVista("buscar")}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            vista === "buscar"
              ? "bg-white dark:bg-slate-900 shadow-sm text-blue-700 dark:text-blue-300"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}>
          <Search size={15} /> Buscar anteriores
        </button>
      </div>

      {/* ── Vista: Bandeja en vivo (últimas 50 + todas las pendientes) ── */}
      {vista === "bandeja" && (
      <section>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {FILTROS.map(f => (
            <button key={f.value} onClick={() => setFiltro(f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filtro === f.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200"
              }`}>
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500">Últimas {LIVE_LIMIT} + pendientes</span>
        </div>

        <div className="space-y-2">
          {displayList.length === 0 && (
            <p className="text-sm text-slate-500 py-10 text-center">Sin solicitudes en este filtro.</p>
          )}
          {displayList.map(renderTraslado)}
        </div>
      </section>
      )}

      {/* ── Vista: Buscar traslados anteriores (bajo demanda) ── */}
      {vista === "buscar" && (
      <section>
        <div className="flex items-center gap-2 mb-1">
          <History size={15} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Buscar traslados anteriores</h2>
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
            <DateField value={fechaDesde} onChange={setFechaDesde} clearable placeholder="Desde" ariaLabel="Fecha desde" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Hasta</span>
            <DateField value={fechaHasta} onChange={setFechaHasta} clearable placeholder="Hasta" ariaLabel="Fecha hasta" />
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
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : resultados.length === 0 ? (
          <p className="text-sm text-slate-500 py-10 text-center">Sin resultados para esa búsqueda.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-3">{resultados.length} resultado(s)</p>
            <div className="space-y-2">{resultados.map(renderTraslado)}</div>
          </>
        )}
      </section>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-xl">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 dark:text-slate-100 font-heading">
                {selected.tipoTraslado === "intercambio" ? "Solicitud de Intercambio" : "Solicitud de Traslado"}
              </h2>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">

              {selected.tipoTraslado === "intercambio" ? (
                <>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Paciente A (Se mueve a cama {selected.camaDestino})</p>
                    <Row label="Expediente"  value={selected.pacienteExpediente} />
                    <Row label="Nombre"      value={selected.pacienteNombre || "No especificado"} />
                    <Row label="Ubicación"   value={`${selected.servicioOrigen} / Cama ${selected.camaOrigen}`} />
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Paciente B (Se mueve a cama {selected.camaOrigen})</p>
                    <Row label="Expediente"  value={selected.pacienteBExpediente} />
                    <Row label="Nombre"      value={selected.pacienteBNombre || "No especificado"} />
                    <Row label="Ubicación"   value={`${selected.servicioDestino} / Cama ${selected.camaDestino}`} />
                  </div>
                </>
              ) : (
                <>
                  <Row label="Expediente"  value={selected.pacienteExpediente} />
                  <Row label="Paciente"    value={selected.pacienteNombre || "No especificado"} />
                  <Row label="Origen"      value={`${selected.servicioOrigen} / Cama ${selected.camaOrigen}`} />
                  <Row label="Destino"     value={`${selected.tipoTraslado === "interno" ? selected.servicioOrigen : selected.servicioDestino} / Cama ${selected.camaDestino}`} />
                </>
              )}

              <div className="h-px bg-slate-200 dark:bg-slate-800 my-2" />

              <Row label="Motivo"      value={selected.motivoTraslado} />
              <Row label="Solicitado"  value={formatFechaHora(selected.creadoEn)} />
              <Row label="Médico"      value={`Dr. ${selected.medicoNombre}`} />
              {selected.medicoJvpm && (
                <Row label="JVPM"        value={selected.medicoJvpm} />
              )}
              <Row label="Estado"      value={<Badge estado={selected.estado} />} />
              {selected.revisadoPorNombre && (
                <Row label="Procesado por" value={selected.revisadoPorNombre} />
              )}

              {selected.respuestaMedico && (
                <div className="bg-blue-50 dark:bg-blue-950/40 rounded-lg p-3 border border-blue-200 dark:border-blue-900/50">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-1">Respuesta del médico</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{selected.respuestaMedico}</p>
                </div>
              )}

              {/* Una vez aprobado/rechazado el traslado es terminal: notas en solo lectura. */}
              {selected.estado === "aprobado" || selected.estado === "rechazado" ? (
                selected.notasEsdomed && (
                  <div className="pt-2">
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Notas ESDOMED</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700 whitespace-pre-wrap">{selected.notasEsdomed}</p>
                  </div>
                )
              ) : (
                <div className="pt-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Notas ESDOMED</label>
                  <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
                    placeholder="Observaciones o motivo de rechazo..."
                    className={inputCls} />
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 justify-end bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
              {selected.estado === "aprobado" || selected.estado === "rechazado" ? (
                <button onClick={() => setSelected(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  Cerrar
                </button>
              ) : (
                <>
                  <button onClick={() => actualizarEstado("rechazado")} disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 rounded-lg hover:bg-red-100 dark:hover:bg-red-900 disabled:opacity-50 transition-colors">
                    Rechazar
                  </button>
                  <button onClick={() => actualizarEstado("en_revision")} disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 disabled:opacity-50 transition-colors">
                    En revisión
                  </button>
                  <button onClick={() => actualizarEstado("aprobado")} disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-700 rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors">
                    {saving ? "Guardando..." : "Aprobar"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatFechaHora(ts: unknown) {
  if (!ts) return "—";
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return d.toLocaleString("es-HN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-slate-500 w-24 shrink-0 text-xs pt-0.5 font-medium">{label}</span>
      <span className="text-slate-800 dark:text-slate-200 font-medium text-sm flex-1">{value}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sincronización con módulo de Pacientes
// ────────────────────────────────────────────────────────────────────────────
// Cuando un traslado se aprueba, buscamos el/los paciente(s) activos por
// expediente y actualizamos servicio/cama + ruta de movimientos. Si no existe
// en la BD de pacientes, se ignora silenciosamente (el módulo es opcional).

async function buscarPacienteActivoPorExpediente(exp: string) {
  const q = query(
    collection(db, "pacientes"),
    where("expediente", "==", exp),
    where("estado", "==", "activo"),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, data: d.data() as Paciente };
}

async function aplicarTrasladoAPaciente(t: SolicitudTraslado, registradoPor: string) {
  const ahora = Timestamp.now();

  if (t.tipoTraslado === "intercambio") {
    if (!t.pacienteBExpediente) return;
    const [pacA, pacB] = await Promise.all([
      buscarPacienteActivoPorExpediente(t.pacienteExpediente),
      buscarPacienteActivoPorExpediente(t.pacienteBExpediente),
    ]);

    // En intercambio: A pasa a la cama y servicio que tenía B; B pasa a la cama y servicio que tenía A.
    if (pacA) {
      const movA: MovimientoPaciente = {
        fecha: new Date(),
        servicioOrigen: t.servicioOrigen,
        servicioDestino: t.servicioDestino ?? t.servicioOrigen,
        camaOrigen: t.camaOrigen,
        camaDestino: t.camaDestino,
        trasladoId: t.id,
        registradoPorNombre: registradoPor,
      };
      await updateDoc(doc(db, "pacientes", pacA.id), {
        servicioActual: t.servicioDestino ?? t.servicioOrigen,
        camaActual: t.camaDestino,
        movimientos: arrayUnion({ ...movA, fecha: ahora }),
        actualizadoEn: ahora,
      });
    }
    if (pacB) {
      const movB: MovimientoPaciente = {
        fecha: new Date(),
        servicioOrigen: t.servicioDestino ?? t.servicioOrigen,
        servicioDestino: t.servicioOrigen,
        camaOrigen: t.camaDestino,
        camaDestino: t.camaOrigen,
        trasladoId: t.id,
        registradoPorNombre: registradoPor,
      };
      await updateDoc(doc(db, "pacientes", pacB.id), {
        servicioActual: t.servicioOrigen,
        camaActual: t.camaOrigen,
        movimientos: arrayUnion({ ...movB, fecha: ahora }),
        actualizadoEn: ahora,
      });
    }
    return;
  }

  // Traslado simple (interno o servicio_cama)
  const paciente = await buscarPacienteActivoPorExpediente(t.pacienteExpediente);
  if (!paciente) return;

  const servicioDestino = t.tipoTraslado === "interno"
    ? t.servicioOrigen
    : (t.servicioDestino ?? t.servicioOrigen);

  const mov: MovimientoPaciente = {
    fecha: new Date(),
    servicioOrigen: t.servicioOrigen,
    servicioDestino,
    camaOrigen: t.camaOrigen,
    camaDestino: t.camaDestino,
    trasladoId: t.id,
    registradoPorNombre: registradoPor,
  };

  await updateDoc(doc(db, "pacientes", paciente.id), {
    servicioActual: servicioDestino,
    camaActual: t.camaDestino,
    movimientos: arrayUnion({ ...mov, fecha: ahora }),
    actualizadoEn: ahora,
  });
}
