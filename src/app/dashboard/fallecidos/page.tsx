"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, getDocs, doc, updateDoc, Timestamp, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { NotificacionFallecido, UserProfile } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { HeartPulse, Clock, X, ChevronDown, CheckCircle2, FileWarning, Lock, LockOpen, Search } from "lucide-react";

// entregaCertificado permanece aquí para el cálculo de todos4 y puntos de progreso
const COLUMNAS_SEGUIMIENTO = [
  { key: "tramitaDefuncion",   keyEn: "tramitaDefuncionEn",   label: "Tramita Defunción" },
  { key: "digitaSimmow",       keyEn: "digitaSimmowEn",       label: "Digita SIMMOW" },
  { key: "entregaCertificado", keyEn: "entregaCertificadoEn", label: "Entrega Certificado" },
  { key: "recibeDePs",         keyEn: "recibeDePsEn",         label: "Recibe Psic./T.S." },
] as const;

const PARENTESCOS = [
  "Padre", "Madre", "Hijo (a)", "Abuelo (a)", "Tío (a)", "Cuñado (a)",
  "Primo (a)", "Esposo (a)", "Nieto (a)", "Hermano (a)", "Sobrino (a)",
  "Compañero (a)", "Suegro (a)", "Otros",
] as const;

type CampoSeguimiento = typeof COLUMNAS_SEGUIMIENTO[number]["key"];
type ActiveTab = "expediente" | "seguimiento" | "entrega" | "certificado";

const selectCls = "w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 cursor-pointer shadow-sm disabled:cursor-not-allowed";

export default function DashboardFallecidosPage() {
  const { profile } = useAuth();
  const [notificaciones, setNotificaciones] = useState<NotificacionFallecido[]>([]);
  const [busquedaExpediente, setBusquedaExpediente] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [personal, setPersonal] = useState<UserProfile[]>([]);
  const [personalPsTs, setPersonalPsTs] = useState<UserProfile[]>([]);
  const [filtro, setFiltro] = useState<"pendiente" | "confirmado" | "cert_pendiente" | "todos">("todos");
  const [selected, setSelected] = useState<NotificacionFallecido | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("expediente");
  const [saving, setSaving] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [desbloqueando, setDesbloqueando] = useState(false);
  const [justificacion, setJustificacion] = useState("");
  const [updatingCell, setUpdatingCell] = useState<string | null>(null);
  const [familiarNombre, setFamiliarNombre] = useState("");
  const [familiarDui, setFamiliarDui] = useState("");
  const [familiarTelefono, setFamiliarTelefono] = useState("");
  const [familiarParentesco, setFamiliarParentesco] = useState("");
  const [savingFamiliar, setSavingFamiliar] = useState(false);
  const [savedFamiliar, setSavedFamiliar] = useState(false);
  const [fiehPendiente, setFiehPendiente] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "notificaciones_fallecidos"), orderBy("creadoEn", "desc"));
    const unsub = onSnapshot(q, s =>
      setNotificaciones(s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido)))
    );
    getDocs(query(collection(db, "usuarios"), where("role", "==", "esdomed")))
      .then(snap => setPersonal(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile))));
    getDocs(query(collection(db, "usuarios"), where("role", "in", ["psicologia", "trabajo_social"])))
      .then(snap => setPersonalPsTs(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile))));
    return unsub;
  }, []);

  useEffect(() => {
    if (!selected) return;
    setActiveTab("expediente");
    setJustificacion("");
    setFiehPendiente(false);
    setFamiliarNombre(selected.familiarNombre ?? "");
    setFamiliarDui(selected.familiarDui ?? "");
    setFamiliarTelefono(selected.familiarTelefono ?? "");
    setFamiliarParentesco(selected.familiarParentesco ?? "");
  }, [selected?.id]); // eslint-disable-line

  const filtered = filtro === "todos"       ? notificaciones
    : filtro === "cert_pendiente"           ? notificaciones.filter(n => n.estadoEntregaCertificado === "pendiente")
    : notificaciones.filter(n => n.estado === filtro);

  const displayList = filtered.filter(n => {
    if (busquedaExpediente && !(n.pacienteExpediente?.toLowerCase() ?? "").includes(busquedaExpediente.toLowerCase())) return false;
    if (fechaDesde || fechaHasta) {
      const d = ((n.creadoEn as unknown) as { toDate?: () => Date }).toDate?.() ?? n.creadoEn;
      if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
      if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    }
    return true;
  });

  const confirmar = async () => {
    if (!selected?.id || !profile) return;
    setSaving(true);
    await updateDoc(doc(db, "notificaciones_fallecidos", selected.id), {
      estado: "confirmado",
      confirmadoPor: profile.uid,
      confirmadoPorNombre: profile.nombre,
      confirmadoEn: Timestamp.now(),
    });
    // Propagar al módulo Pacientes si el expediente existe y está activo
    try {
      await marcarPacienteFallecido(selected);
    } catch (err) {
      console.error("Error sincronizando fallecido con paciente:", err);
    }
    setSaving(false);
  };

  const cerrarTramite = async () => {
    if (!selected?.id || !profile) return;
    setCerrando(true);
    await updateDoc(doc(db, "notificaciones_fallecidos", selected.id), {
      tramiteCerrado: true,
      tramiteCerradoPor: profile.nombre,
      tramiteCerradoEn: Timestamp.now(),
      tramiteDesbloqueado: false,
      tramiteJustificacion: null,
    });
    setCerrando(false);
  };

  const desbloquear = async () => {
    if (!selected?.id || !profile || !justificacion.trim()) return;
    setDesbloqueando(true);
    await updateDoc(doc(db, "notificaciones_fallecidos", selected.id), {
      tramiteDesbloqueado: true,
      tramiteDesbloqueadoPor: profile.nombre,
      tramiteDesbloqueadoEn: Timestamp.now(),
      tramiteJustificacion: justificacion.trim(),
    });
    setDesbloqueando(false);
    setJustificacion("");
  };

  const asignar = async (campo: CampoSeguimiento, nombre: string) => {
    if (!selected?.id) return;
    setUpdatingCell(campo);
    const data: Record<string, unknown> = {
      [campo]: nombre || null,
      [`${campo}En`]: nombre ? Timestamp.now() : null,
    };
    if (campo === "recibeDePs") {
      const persona = personalPsTs.find(p => p.nombre === nombre);
      data.recibeDePsUid = persona?.uid ?? null;
      data.recibeDePsConfirmado = false;
      data.recibeDePsConfirmadoEn = null;
    }
    await updateDoc(doc(db, "notificaciones_fallecidos", selected.id), data);
    setUpdatingCell(null);
  };

  const actualizarCampo = async (campo: string, valor: string | boolean | null) => {
    if (!selected?.id) return;
    setUpdatingCell(campo);
    await updateDoc(doc(db, "notificaciones_fallecidos", selected.id), { [campo]: valor });
    setUpdatingCell(null);
  };

  const guardarFamiliar = async () => {
    if (!selected?.id) return;
    setSavingFamiliar(true);
    await updateDoc(doc(db, "notificaciones_fallecidos", selected.id), {
      familiarNombre:     familiarNombre     || null,
      familiarDui:        familiarDui        || null,
      familiarTelefono:   familiarTelefono   || null,
      familiarParentesco: familiarParentesco || null,
    });
    setSavingFamiliar(false);
    setSavedFamiliar(true);
    setTimeout(() => setSavedFamiliar(false), 3000);
  };

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatHora = (ts: unknown) => {
    if (!ts) return null;
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString("es-HN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const productividad = personal.map(p => ({
    nombre: p.nombre,
    simmow:      notificaciones.filter(n => n.digitaSimmow === p.nombre).length,
    tramita:     notificaciones.filter(n => n.tramitaDefuncion === p.nombre).length,
    certificado: notificaciones.filter(n => n.entregaCertificado === p.nombre).length,
    psicologia:  notificaciones.filter(n => n.recibeDePs === p.nombre).length,
    total:       notificaciones.filter(n =>
      n.digitaSimmow === p.nombre || n.tramitaDefuncion === p.nombre ||
      n.entregaCertificado === p.nombre || n.recibeDePs === p.nombre
    ).length,
  })).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

  const pendientes     = notificaciones.filter(n => n.estado === "pendiente").length;
  const certPendientes = notificaciones.filter(n => n.estadoEntregaCertificado === "pendiente").length;
  const selectedLive   = selected ? notificaciones.find(n => n.id === selected.id) ?? selected : null;

  const TABS: { id: ActiveTab; label: string }[] = [
    { id: "expediente",  label: "Expediente"  },
    { id: "seguimiento", label: "Seguimiento" },
    { id: "certificado", label: "Certificado" },
    { id: "entrega",     label: "Entrega"     },
  ];

  const isLocked    = !!(selectedLive?.tramiteCerrado && !selectedLive.tramiteDesbloqueado);
  const isUnlocked  = !!(selectedLive?.tramiteCerrado && selectedLive.tramiteDesbloqueado);
  const todos4      = selectedLive ? COLUMNAS_SEGUIMIENTO.every(col => !!selectedLive[col.key]) : false;
  const puedeCerrar = todos4 && selectedLive?.estado === "confirmado" && (!selectedLive.tramiteCerrado || isUnlocked);
  const isAdmin     = profile?.role === "admin";

  const fiehNombreGuardado = typeof selectedLive?.actualizoFieh === "string" && selectedLive.actualizoFieh
    ? selectedLive.actualizoFieh
    : null;
  const fiehChequeado = fiehNombreGuardado !== null || fiehPendiente;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-rose-50 dark:bg-rose-950 rounded-xl flex items-center justify-center border border-rose-200 dark:border-rose-900">
            <HeartPulse size={17} className="text-rose-600 dark:text-rose-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Notificaciones de fallecidos</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pendientes > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-3 py-1.5 rounded-xl">
              <Clock size={14} />
              {pendientes} sin confirmar
            </div>
          )}
          {certPendientes > 0 && (
            <button
              onClick={() => setFiltro(filtro === "cert_pendiente" ? "todos" : "cert_pendiente")}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border transition-colors ${
                filtro === "cert_pendiente"
                  ? "bg-orange-600 text-white border-orange-600"
                  : "text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-900 hover:bg-orange-100 dark:hover:bg-orange-900"
              }`}
            >
              <FileWarning size={14} />
              {certPendientes} cert. pendientes
            </button>
          )}
        </div>
      </div>

      {/* Productividad */}
      {productividad.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Productividad del equipo</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {productividad.map(p => (
              <div key={p.nombre} className="bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{p.nombre}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  {p.simmow > 0      && <span className="text-[11px] text-blue-600 dark:text-blue-400">{p.simmow} SIMMOW</span>}
                  {p.tramita > 0     && <span className="text-[11px] text-teal-600 dark:text-teal-400">{p.tramita} tram.</span>}
                  {p.certificado > 0 && <span className="text-[11px] text-violet-600 dark:text-violet-400">{p.certificado} cert.</span>}
                  {p.psicologia > 0  && <span className="text-[11px] text-rose-600 dark:text-rose-400">{p.psicologia} psic.</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: "Todos",           value: "todos"          },
          { label: "Pendientes",      value: "pendiente"      },
          { label: "Confirmados",     value: "confirmado"     },
          { label: "Cert. pendiente", value: "cert_pendiente" },
        ].map(f => (
          <button key={f.value} onClick={() => setFiltro(f.value as typeof filtro)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filtro === f.value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}>
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-slate-500">{displayList.length} registros</span>
      </div>

      <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Buscar por expediente..." value={busquedaExpediente} onChange={e => setBusquedaExpediente(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
        </div>
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
        {(busquedaExpediente || fechaDesde || fechaHasta) && (
          <button onClick={() => { setBusquedaExpediente(""); setFechaDesde(""); setFechaHasta(""); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      {displayList.length === 0 ? (
        <p className="text-sm text-slate-500 py-10 text-center">Sin notificaciones en este filtro.</p>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Paciente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Servicio / Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Médico</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Seguimiento</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {displayList.map(n => {
                  const pasos = COLUMNAS_SEGUIMIENTO.filter(col => !!n[col.key]).length;
                  return (
                    <tr key={n.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-sm">{n.pacienteExpediente}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{n.pacienteNombre}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700 dark:text-slate-300">{n.servicio} · Cama {n.cama}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{formatFecha(n.fechaDefuncion)}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                        Dr. {n.medicoNombre}
                      </td>
                      <td className="px-4 py-3">
                        <Badge estado={n.estado} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            {COLUMNAS_SEGUIMIENTO.map(col => (
                              <div key={col.key} title={col.label}
                                className={`w-2 h-2 rounded-full ${!!n[col.key] ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                            ))}
                            <span className="text-xs text-slate-500 ml-1">{pasos}/{COLUMNAS_SEGUIMIENTO.length}</span>
                          </div>
                          {n.tramiteCerrado && !n.tramiteDesbloqueado && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 rounded-md">
                              <Lock size={9} /> Cerrado
                            </span>
                          )}
                          {n.tramiteDesbloqueado && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-1.5 py-0.5 rounded-md">
                              <LockOpen size={9} /> Desbloqueado
                            </span>
                          )}
                          {n.estadoEntregaCertificado === "pendiente" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-900 px-1.5 py-0.5 rounded-md">
                              <FileWarning size={10} /> Cert. pendiente
                            </span>
                          )}
                          {n.estadoEntregaCertificado === "entregado" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-900 px-1.5 py-0.5 rounded-md">
                              <CheckCircle2 size={10} /> Cert. entregado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setSelected(n)}
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors whitespace-nowrap">
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de detalle */}
      {selectedLive && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="px-5 pt-5 pb-0 flex-shrink-0">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-widest mb-0.5">Expediente</p>
                  <h2 className="font-bold text-xl text-slate-900 dark:text-slate-100 font-mono leading-tight">
                    {selectedLive.pacienteExpediente}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {selectedLive.pacienteNombre}
                    <span className="mx-1.5 text-slate-300 dark:text-slate-700">·</span>
                    {selectedLive.servicio} · Cama {selectedLive.cama}
                    <span className="mx-1.5 text-slate-300 dark:text-slate-700">·</span>
                    Dr. {selectedLive.medicoNombre}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isLocked && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2 py-1 rounded-lg">
                      <Lock size={11} /> Cerrado
                    </span>
                  )}
                  {isUnlocked && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-1 rounded-lg">
                      <LockOpen size={11} /> Desbloqueado
                    </span>
                  )}
                  <Badge estado={selectedLive.estado} />
                  <button onClick={() => setSelected(null)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Tab bar */}
              <div className="flex -mx-5 px-5 border-b border-slate-200 dark:border-slate-800">
                {TABS.map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? "border-blue-600 text-blue-600 dark:text-blue-400"
                        : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Locked banner */}
            {isLocked && (
              <div className="mx-5 mt-4 flex items-center gap-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 flex-shrink-0">
                <Lock size={15} className="text-slate-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Trámite cerrado — solo lectura</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cerrado por <span className="font-medium">{selectedLive.tramiteCerradoPor}</span>
                    {selectedLive.tramiteCerradoEn && <> · {formatHora(selectedLive.tramiteCerradoEn)}</>}
                  </p>
                </div>
              </div>
            )}

            {/* Unlocked banner */}
            {isUnlocked && (
              <div className="mx-5 mt-4 flex items-center gap-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 flex-shrink-0">
                <LockOpen size={15} className="text-amber-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Registro desbloqueado</p>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                    Por <span className="font-medium">{selectedLive.tramiteDesbloqueadoPor}</span>
                    {selectedLive.tramiteJustificacion && <> · "{selectedLive.tramiteJustificacion}"</>}
                  </p>
                </div>
              </div>
            )}

            {/* Tab content */}
            <div className="overflow-y-auto flex-1 p-5 space-y-4">

              {/* ── Tab: Expediente ── */}
              {activeTab === "expediente" && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoCell label="Fecha defunción" value={formatFecha(selectedLive.fechaDefuncion)} />
                  <InfoCell label="Servicio" value={selectedLive.servicio} />
                  <div className="col-span-2">
                    <InfoCell label="Notificado por" value={`Dr. ${selectedLive.medicoNombre}`} />
                  </div>
                  {selectedLive.causaMuerte && (
                    <div className="col-span-2">
                      <InfoCell label="Causa de muerte" value={selectedLive.causaMuerte} />
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab: Seguimiento ── */}
              {activeTab === "seguimiento" && (
                <div className="space-y-4">
                  {COLUMNAS_SEGUIMIENTO.filter(col => col.key !== "entregaCertificado" && col.key !== "recibeDePs").map(col => {
                    const valor    = selectedLive[col.key] as string | undefined;
                    const fecha    = selectedLive[col.keyEn];
                    const isLoading = updatingCell === col.key;
                    return (
                      <div key={col.key}>
                        <label className="block text-xs font-medium text-slate-500 mb-1.5">{col.label}</label>
                        <div className="relative">
                          <select
                            value={valor ?? ""}
                            disabled={isLoading || isLocked}
                            onChange={e => asignar(col.key, e.target.value)}
                            className={selectCls}
                          >
                            <option value="">— Sin asignar</option>
                            {personal.map(p => (
                              <option key={p.uid} value={p.nombre}>{p.nombre}</option>
                            ))}
                          </select>
                          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                        {valor && fecha && (
                          <p className="text-[11px] mt-1.5 flex items-center gap-1.5 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 px-2 py-1 rounded-md w-fit">
                            <CheckCircle2 size={11} /> {formatHora(fecha)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Tab: Entrega ── */}
              {activeTab === "entrega" && (
                <div className="space-y-5">

                  {/* Recibe Psic./TS */}
                  {(() => {
                    const col = COLUMNAS_SEGUIMIENTO.find(c => c.key === "recibeDePs")!;
                    const valor = selectedLive[col.key] as string | undefined;
                    const isLoading = updatingCell === col.key;
                    return (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1.5">{col.label}</label>
                        <div className="relative">
                          <select
                            value={valor ?? ""}
                            disabled={isLoading || isLocked}
                            onChange={e => asignar(col.key, e.target.value)}
                            className={selectCls}
                          >
                            <option value="">— Sin asignar</option>
                            {personalPsTs.map(p => (
                              <option key={p.uid} value={p.nombre}>{p.nombre}</option>
                            ))}
                          </select>
                          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                        {valor && (
                          <div className="mt-1.5">
                            {selectedLive.recibeDePsConfirmado ? (
                              <p className="text-[11px] flex items-center gap-1.5 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 px-2 py-1 rounded-md w-fit">
                                <CheckCircle2 size={11} />
                                Recepción confirmada · {formatHora(selectedLive.recibeDePsConfirmadoEn)}
                              </p>
                            ) : (
                              <p className="text-[11px] flex items-center gap-1.5 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-1 rounded-md w-fit">
                                <Clock size={11} />
                                Pendiente de confirmar por {valor}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Quién entregó */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Quién entregó el certificado</label>
                    <div className="relative">
                      <select
                        value={selectedLive.entregaCertificado ?? ""}
                        disabled={updatingCell === "entregaCertificado" || isLocked}
                        onChange={e => asignar("entregaCertificado", e.target.value)}
                        className={selectCls}
                      >
                        <option value="">— Sin asignar</option>
                        {personal.map(p => (
                          <option key={p.uid} value={p.nombre}>{p.nombre}</option>
                        ))}
                      </select>
                      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    {selectedLive.entregaCertificado && selectedLive.entregaCertificadoEn && (
                      <p className="text-[11px] mt-1.5 flex items-center gap-1.5 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 px-2 py-1 rounded-md w-fit">
                        <CheckCircle2 size={11} /> {formatHora(selectedLive.entregaCertificadoEn)}
                      </p>
                    )}
                  </div>

                  {/* FIEH */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-500">
                      ¿Actualizó FIEH en Archivero Virtual y Datos en Simmow?
                      <span className="block font-normal text-slate-400 dark:text-slate-500 mt-0.5">
                        Aplica solo para certificados manuales
                      </span>
                    </label>
                    <label className={`flex items-center gap-2.5 select-none ${isLocked ? "opacity-50" : "cursor-pointer"}`}>
                      <input
                        type="checkbox"
                        checked={fiehChequeado}
                        disabled={isLocked}
                        onChange={e => {
                          if (!e.target.checked) {
                            actualizarCampo("actualizoFieh", null);
                            setFiehPendiente(false);
                          } else {
                            setFiehPendiente(true);
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-blue-600 flex-shrink-0 disabled:cursor-not-allowed"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">Sí, se actualizó</span>
                    </label>
                    {fiehChequeado && (
                      <div className="relative">
                        <select
                          value={fiehNombreGuardado ?? ""}
                          disabled={isLocked || updatingCell === "actualizoFieh"}
                          onChange={e => {
                            if (e.target.value) {
                              actualizarCampo("actualizoFieh", e.target.value);
                              setFiehPendiente(false);
                            }
                          }}
                          className={selectCls}
                        >
                          <option value="">— Seleccionar quién actualizó</option>
                          {personal.map(p => (
                            <option key={p.uid} value={p.nombre}>{p.nombre}</option>
                          ))}
                        </select>
                        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    )}
                    {fiehNombreGuardado && (
                      <p className="text-[11px] flex items-center gap-1.5 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 px-2 py-1 rounded-md w-fit">
                        <CheckCircle2 size={11} /> Actualizado por {fiehNombreGuardado}
                      </p>
                    )}
                  </div>

                  {/* Familiar */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Familiar que recibe</p>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <FamiliarInput
                          label="Nombre completo"
                          value={familiarNombre}
                          onChange={v => setFamiliarNombre(v.toUpperCase())}
                          placeholder="Nombre del familiar"
                          className="col-span-2"
                          disabled={isLocked}
                        />
                        <FamiliarInput
                          label="DUI"
                          value={familiarDui}
                          onChange={setFamiliarDui}
                          placeholder="00000000-0"
                          disabled={isLocked}
                        />
                        <FamiliarInput
                          label="Teléfono"
                          value={familiarTelefono}
                          onChange={v => setFamiliarTelefono(v.replace(/\D/g, ""))}
                          placeholder="Solo números"
                          disabled={isLocked}
                        />
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">Parentesco</label>
                          <div className="relative">
                            <select
                              value={familiarParentesco}
                              onChange={e => setFamiliarParentesco(e.target.value)}
                              disabled={isLocked}
                              className={selectCls}
                            >
                              <option value="">— Seleccionar parentesco</option>
                              {PARENTESCOS.map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                      {!isLocked && (
                        <button
                          onClick={guardarFamiliar}
                          disabled={savingFamiliar || savedFamiliar}
                          className={`w-full py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-all ${
                            savedFamiliar
                              ? "bg-green-600 hover:bg-green-700 shadow-md shadow-green-500/20"
                              : "bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600"
                          }`}
                        >
                          {savingFamiliar ? "Guardando..." : savedFamiliar ? "¡Datos guardados con éxito!" : "Guardar datos familiar"}
                        </button>
                      )}
                      {selectedLive.familiarNombre && (
                        <div className="bg-green-50 dark:bg-green-500/10 px-3 py-2.5 rounded-lg space-y-1">
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400">
                            <CheckCircle2 size={13} /> Datos guardados
                          </p>
                          <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">{selectedLive.familiarNombre}</p>
                          {selectedLive.familiarDui        && <p className="text-xs text-slate-500">DUI: {selectedLive.familiarDui}</p>}
                          {selectedLive.familiarTelefono   && <p className="text-xs text-slate-500">Tel: {selectedLive.familiarTelefono}</p>}
                          {selectedLive.familiarParentesco && <p className="text-xs text-slate-500">{selectedLive.familiarParentesco}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab: Certificado ── */}
              {activeTab === "certificado" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Estado de entrega</label>
                    <div className="relative">
                      <select
                        value={selectedLive.estadoEntregaCertificado ?? ""}
                        disabled={updatingCell === "estadoEntregaCertificado" || isLocked}
                        onChange={e => actualizarCampo("estadoEntregaCertificado", e.target.value || null)}
                        className={selectCls}
                      >
                        <option value="">— Sin definir</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="entregado">Entregado</option>
                      </select>
                      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Tipo de certificado</label>
                    <div className="relative">
                      <select
                        value={selectedLive.tipoCertificado ?? ""}
                        disabled={updatingCell === "tipoCertificado" || isLocked}
                        onChange={e => actualizarCampo("tipoCertificado", e.target.value || null)}
                        className={selectCls}
                      >
                        <option value="">— Sin definir</option>
                        <option value="digital">Digital</option>
                        <option value="manual">Manual</option>
                      </select>
                      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex-shrink-0 space-y-3">
              {selectedLive.estado === "pendiente" && !isLocked && (
                <button onClick={confirmar} disabled={saving}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-green-700 rounded-xl hover:bg-green-600 disabled:opacity-50 transition-colors">
                  {saving ? "Confirmando..." : "Confirmar de leído y notificado"}
                </button>
              )}
              {puedeCerrar && activeTab === "entrega" && (
                <button onClick={cerrarTramite} disabled={cerrando}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-slate-800 dark:bg-slate-700 rounded-xl hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <Lock size={14} />
                  {cerrando ? "Cerrando..." : "Cerrar trámite"}
                </button>
              )}
              {isLocked && isAdmin && (
                <div className="border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-widest">
                    Desbloquear registro
                  </p>
                  <textarea
                    value={justificacion}
                    onChange={e => setJustificacion(e.target.value)}
                    placeholder="Justificación para el desbloqueo..."
                    rows={2}
                    className="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-slate-400"
                  />
                  <button
                    onClick={desbloquear}
                    disabled={!justificacion.trim() || desbloqueando}
                    className="w-full py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    <LockOpen size={14} />
                    {desbloqueando ? "Desbloqueando..." : "Desbloquear registro"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-slate-800 dark:text-slate-200 font-medium mt-0.5">{value}</p>
    </div>
  );
}

function FamiliarInput({ label, value, onChange, placeholder, className = "", disabled = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string; disabled?: boolean;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sincronización con módulo de Pacientes
// ────────────────────────────────────────────────────────────────────────────

async function marcarPacienteFallecido(n: NotificacionFallecido) {
  if (!n.pacienteExpediente) return;
  const q = query(
    collection(db, "pacientes"),
    where("expediente", "==", n.pacienteExpediente),
    where("estado", "==", "activo"),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return;
  const pacRef = snap.docs[0].ref;
  const pacData = snap.docs[0].data();
  const fechaIngreso = (pacData.fechaIngreso as { toDate?: () => Date })?.toDate?.() ?? new Date();
  const fechaDefuncion = (n.fechaDefuncion as unknown as { toDate?: () => Date })?.toDate?.()
    ?? (n.fechaDefuncion instanceof Date ? n.fechaDefuncion : new Date());
  const dias = Math.max(0, Math.floor((fechaDefuncion.getTime() - fechaIngreso.getTime()) / (1000 * 60 * 60 * 24)));

  await updateDoc(pacRef, {
    estado: "alta_fallecido",
    fechaEgreso: Timestamp.fromDate(fechaDefuncion),
    diasEstancia: dias,
    fallecidoId: n.id,
    medicoEgresoNombre: n.medicoNombre,
    medicoEgresoJvpm: n.medicoJvpm || null,
    actualizadoEn: Timestamp.now(),
  });
}
