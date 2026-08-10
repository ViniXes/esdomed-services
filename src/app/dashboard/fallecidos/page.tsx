"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, query, orderBy, onSnapshot, getDocs, deleteDoc, doc, updateDoc, Timestamp, where, limit, type QueryConstraint } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { NotificacionFallecido, UserProfile } from "@/types";
import { getLecturaConfirmada } from "@/lib/fallecidos";
import { Badge } from "@/components/ui/Badge";
import { DateField } from "@/components/ui/DateField";
import { HeartPulse, Clock, X, ChevronDown, ChevronLeft, ChevronRight, CheckCircle2, FileWarning, AlertTriangle, Loader2, Lock, LockOpen, Search, MessageCircle, Trash2, ShieldCheck, Archive, Inbox, History, FileSignature, PenLine } from "lucide-react";

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
// Bandeja = trámites abiertos (en vivo). Buscar = histórico bajo demanda.
type Vista = "bandeja" | "buscar";

// Tope de la búsqueda por rango de fechas (el histórico completo nunca se baja).
const LIMIT_BUSQUEDA = 500;

const selectCls = "w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 cursor-pointer shadow-sm disabled:cursor-not-allowed";

// Registros por página en la tabla (paginación de a 10).
const PAGE_SIZE = 10;

// Umbral para alertar un certificado de defunción atascado: más de estos días
// HÁBILES pendiente de entrega (contados desde la fecha de defunción).
const DIAS_HABILES_CERT = 5;

// Días hábiles (lunes–viernes) transcurridos entre `desde` y hoy. No excluye
// feriados (refinamiento posible a futuro con una tabla de feriados de El Salvador).
function diasHabilesTranscurridos(desde: Date, hasta: Date = new Date()): number {
  const cur = new Date(desde); cur.setHours(0, 0, 0, 0);
  const fin = new Date(hasta); fin.setHours(0, 0, 0, 0);
  let dias = 0;
  while (cur < fin) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();          // 0 = domingo, 6 = sábado
    if (dow !== 0 && dow !== 6) dias++;
  }
  return dias;
}

function tsToDate(ts: unknown): Date | null {
  if (!ts) return null;
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Pasos de seguimiento exigidos para cerrar el trámite. En privados de libertad el
// certificado queda en custodia interna, y en cuerpos no reclamados (fosa común)
// queda resguardado en archivo interno: en ambos casos la entrega y la recepción
// por Psic./T.S. no aplican, así que no se exigen para cerrar ni cuentan en el progreso.
function pasosRequeridos(n: NotificacionFallecido) {
  return n.privadoDeLibertad || n.estadoEntregaCertificado === "resguardado"
    ? COLUMNAS_SEGUIMIENTO.filter(c => c.key !== "entregaCertificado" && c.key !== "recibeDePs")
    : COLUMNAS_SEGUIMIENTO;
}

export default function DashboardFallecidosPage() {
  const { profile } = useAuth();
  const [vista, setVista] = useState<Vista>("bandeja");
  // Bandeja en vivo: trámites abiertos + los reabiertos (desbloqueados).
  const [abiertos, setAbiertos] = useState<NotificacionFallecido[]>([]);
  const [desbloqueados, setDesbloqueados] = useState<NotificacionFallecido[]>([]);
  // Búsqueda histórica: lectura puntual, null = aún no se busca.
  const [resultados, setResultados] = useState<NotificacionFallecido[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState("");
  const [busquedaExpediente, setBusquedaExpediente] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  // Filtro de texto en cliente sobre la lista mostrada (no consulta nada).
  const [filtroTexto, setFiltroTexto] = useState("");
  const [page, setPage] = useState(1);
  const [personal, setPersonal] = useState<UserProfile[]>([]);
  const [personalPsTs, setPersonalPsTs] = useState<UserProfile[]>([]);
  const [filtro, setFiltro] = useState<"pendiente" | "confirmado" | "cert_pendiente" | "cert_vencido" | "todos">("todos");
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
  const [duiValidado, setDuiValidado] = useState(false);
  // Eliminación de notificaciones duplicadas (con confirmación).
  const [aEliminar, setAEliminar] = useState<NotificacionFallecido | null>(null);
  const [eliminando, setEliminando] = useState(false);

  // ── Bandeja en vivo: SOLO lo pendiente de cierre ──────────────────────────
  // Antes se bajaban las 500 notificaciones más recientes (toda la colección) y
  // se filtraba en el navegador. Ahora el servidor entrega únicamente los
  // trámites abiertos; el histórico cerrado se consulta en la pestaña Buscar.
  // Sin `orderBy` en la consulta (evita el índice compuesto tramiteCerrado +
  // fecha): el orden se hace en cliente sobre un conjunto pequeño.
  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, "notificaciones_fallecidos"), where("tramiteCerrado", "==", false)),
      s => setAbiertos(s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido))),
    );
    // Un trámite cerrado que ESDOMED reabre (desbloqueado) sigue con
    // tramiteCerrado = true, así que necesita su propio listener para no
    // desaparecer de la bandeja justo mientras se está corrigiendo.
    const u2 = onSnapshot(
      query(collection(db, "notificaciones_fallecidos"), where("tramiteDesbloqueado", "==", true)),
      s => setDesbloqueados(s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido))),
    );
    getDocs(query(collection(db, "usuarios"), where("role", "in", ["esdomed", "asistente_esdomed", "admin"])))
      .then(snap => setPersonal(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile))));
    getDocs(query(collection(db, "usuarios"), where("role", "in", ["psicologia", "trabajo_social"])))
      .then(snap => setPersonalPsTs(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile))));
    return () => { u1(); u2(); };
  }, []);

  // Fuente de datos según la vista: bandeja (dos listeners fusionados y
  // deduplicados) o los resultados de la búsqueda histórica.
  const bandeja = useMemo(() => {
    const m = new Map<string, NotificacionFallecido>();
    [...abiertos, ...desbloqueados].forEach(n => { if (n.id) m.set(n.id, n); });
    return [...m.values()].sort(
      (a, b) => (tsToDate(b.fechaDefuncion)?.getTime() ?? 0) - (tsToDate(a.fechaDefuncion)?.getTime() ?? 0),
    );
  }, [abiertos, desbloqueados]);

  const notificaciones = vista === "buscar" ? (resultados ?? []) : bandeja;

  const sinCriterio = !busquedaExpediente.trim() && !fechaDesde && !fechaHasta;

  // Búsqueda del histórico: una sola lectura puntual, nunca un listener.
  const buscar = async () => {
    const exp = busquedaExpediente.trim();
    if (sinCriterio) return;
    setBuscando(true);
    setErrorBusqueda("");
    try {
      let docs: NotificacionFallecido[];
      if (exp) {
        // Por expediente exacto: todas las defunciones de ese paciente. Sin
        // orderBy para no exigir índice compuesto; el rango se afina en cliente.
        const snap = await getDocs(query(
          collection(db, "notificaciones_fallecidos"),
          where("pacienteExpediente", "==", exp),
        ));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido));
        if (fechaDesde) docs = docs.filter(n => (tsToDate(n.fechaDefuncion)?.getTime() ?? 0) >= new Date(fechaDesde + "T00:00:00").getTime());
        if (fechaHasta) docs = docs.filter(n => (tsToDate(n.fechaDefuncion)?.getTime() ?? 0) <= new Date(fechaHasta + "T23:59:59").getTime());
      } else {
        // Por rango de FECHA DE DEFUNCIÓN (mismo campo en where y orderBy → sin índice nuevo).
        const constraints: QueryConstraint[] = [];
        if (fechaDesde) constraints.push(where("fechaDefuncion", ">=", Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"))));
        if (fechaHasta) constraints.push(where("fechaDefuncion", "<=", Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"))));
        constraints.push(orderBy("fechaDefuncion", "desc"), limit(LIMIT_BUSQUEDA));
        const snap = await getDocs(query(collection(db, "notificaciones_fallecidos"), ...constraints));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido));
      }
      setResultados(docs.sort(
        (a, b) => (tsToDate(b.fechaDefuncion)?.getTime() ?? 0) - (tsToDate(a.fechaDefuncion)?.getTime() ?? 0),
      ));
      setPage(1);
    } catch (e) {
      setErrorBusqueda(e instanceof Error ? e.message : "No se pudo completar la búsqueda.");
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  const limpiarBusqueda = () => {
    setBusquedaExpediente(""); setFechaDesde(""); setFechaHasta("");
    setResultados(null); setErrorBusqueda(""); setPage(1);
  };

  // Tras editar/cerrar desde un resultado de búsqueda (que es una foto, no un
  // listener) se relee esa misma búsqueda para no dejar datos viejos en pantalla.
  const refrescarBusqueda = () => { if (vista === "buscar" && resultados !== null) void buscar(); };

  // Al abrir el modal para otro registro (o reabrir uno tras cerrarlo), reinicia
  // el formulario de edición. Ajuste de estado en render, no en efecto — patrón
  // recomendado por React y ya usado en la paginación de esta pantalla. El
  // centinela rastrea `selected?.id` (incl. undefined) para reiniciar también al
  // reabrir el mismo registro.
  const selId = selected?.id;
  const [selPrev, setSelPrev] = useState(selId);
  if (selId !== selPrev) {
    setSelPrev(selId);
    if (selected) {
      setActiveTab("expediente");
      setJustificacion("");
      setFiehPendiente(false);
      setFamiliarNombre(selected.familiarNombre ?? "");
      setFamiliarDui(selected.familiarDui ?? "");
      setFamiliarTelefono(selected.familiarTelefono ?? "");
      setFamiliarParentesco(selected.familiarParentesco ?? "");
      setDuiValidado(!!selected.duiValidado);
    }
  }

  // Certificados "vencidos": pendientes de entrega con más de DIAS_HABILES_CERT
  // días hábiles desde la defunción. Se calcula sobre lo ya cargado (0 lecturas extra).
  // Los privados de libertad quedan en custodia interna: su certificado no se
  // entrega, así que se excluyen del cálculo de vencidos (no generan alerta).
  // Ojo: se calcula sobre la BANDEJA (trámites abiertos), no sobre lo que se
  // esté mostrando: un certificado vencido siempre pertenece a un caso abierto,
  // y así el contador del encabezado no cambia al entrar a Buscar.
  const certDiasHabiles = new Map<string, number>();
  bandeja.forEach(n => {
    if (n.id && n.estadoEntregaCertificado === "pendiente" && !n.privadoDeLibertad) {
      const fd = tsToDate(n.fechaDefuncion);
      if (fd) certDiasHabiles.set(n.id, diasHabilesTranscurridos(fd));
    }
  });
  const esVencido = (n: NotificacionFallecido) => (certDiasHabiles.get(n.id ?? "") ?? 0) > DIAS_HABILES_CERT;
  const certVencidos = [...certDiasHabiles.values()].filter(d => d > DIAS_HABILES_CERT).length;

  const filtered = filtro === "todos"       ? notificaciones
    : filtro === "cert_pendiente"           ? notificaciones.filter(n => n.estadoEntregaCertificado === "pendiente" && !n.privadoDeLibertad)
    : filtro === "cert_vencido"             ? notificaciones.filter(esVencido)
    : notificaciones.filter(n => n.estado === filtro);

  const displayList = filtered
    // Filtro de texto en cliente sobre lo ya cargado (en Buscar, los criterios
    // de expediente y fechas ya se aplicaron en el servidor).
    .filter(n => {
      const t = filtroTexto.trim().toLowerCase();
      if (!t) return true;
      return (n.pacienteExpediente?.toLowerCase() ?? "").includes(t)
        || (n.pacienteNombre?.toLowerCase() ?? "").includes(t)
        || (n.servicio?.toLowerCase() ?? "").includes(t);
    })
    // Los certificados vencidos suben al tope (sort estable → conserva el orden por fecha dentro de cada grupo).
    .sort((a, b) => Number(esVencido(b)) - Number(esVencido(a)));

  // Paginación (10 por página). Reinicia a la página 1 al cambiar filtros;
  // pageSafe protege contra el snapshot en vivo que encoge la lista.
  const totalPages = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const filtrosKey = `${vista}|${filtro}|${filtroTexto}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) { setFiltrosPrevios(filtrosKey); setPage(1); }
  const pageSafe = Math.min(page, totalPages);
  const paginados = displayList.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const confirmar = async () => {
    if (!selected?.id || !profile) return;
    setSaving(true);
    await updateDoc(doc(db, "notificaciones_fallecidos", selected.id), {
      estado: "confirmado",
      confirmadoPor: profile.uid,
      confirmadoPorNombre: profile.nombre,
      confirmadoEn: Timestamp.now(),
      duiValidado,
    });
    // Propagar al módulo Pacientes si el expediente existe y está activo
    try {
      await marcarPacienteFallecido(selected);
    } catch (err) {
      console.error("Error sincronizando fallecido con paciente:", err);
    }
    refrescarBusqueda();
    setSaving(false);
  };

  const cerrarTramite = async () => {
    if (!selected?.id || !profile) return;
    setCerrando(true);
    const cierre = {
      tramiteCerrado: true,
      tramiteCerradoPor: profile.nombre,
      tramiteCerradoEn: Timestamp.now(),
      tramiteDesbloqueado: false,
      tramiteJustificacion: null,
    };
    await updateDoc(doc(db, "notificaciones_fallecidos", selected.id), cierre);
    // Al cerrarlo sale de la bandeja en vivo: se refleja el cierre en la copia
    // local para que el modal abierto no siga mostrándolo como pendiente.
    setSelected(prev => prev ? {
      ...prev,
      tramiteCerrado: true,
      tramiteCerradoPor: profile.nombre,
      tramiteCerradoEn: new Date(),
      tramiteDesbloqueado: false,
      tramiteJustificacion: undefined,
    } : prev);
    refrescarBusqueda();
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
    // Vuelve a la bandeja mientras se corrige: lo capta el listener de
    // `tramiteDesbloqueado == true` (el trámite sigue marcado como cerrado).
    refrescarBusqueda();
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
      data.recibeDePsEntregadoPor = nombre ? (profile?.nombre ?? null) : null;
      data.recibeDePsEntregadoPorUid = nombre ? (profile?.uid ?? null) : null;
      data.recibeDePsConfirmado = false;
      data.recibeDePsConfirmadoEn = null;
    }
    await updateDoc(doc(db, "notificaciones_fallecidos", selected.id), data);
    refrescarBusqueda();
    setUpdatingCell(null);
  };

  const actualizarCampo = async (campo: string, valor: string | boolean | null) => {
    if (!selected?.id) return;
    setUpdatingCell(campo);
    await updateDoc(doc(db, "notificaciones_fallecidos", selected.id), { [campo]: valor });
    refrescarBusqueda();
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

  // Elimina una notificación duplicada. No toca al paciente: si ya fue marcado
  // fallecido por la notificación buena, ese estado se conserva.
  const eliminarNotificacion = async () => {
    const n = aEliminar;
    if (!n?.id) return;
    setEliminando(true);
    try {
      await deleteDoc(doc(db, "notificaciones_fallecidos", n.id));
      if (selected?.id === n.id) setSelected(null);
      setAEliminar(null);
    } catch {
      /* las reglas bloquean trámites cerrados para no-admin */
    } finally {
      setEliminando(false);
    }
  };

  const enviarWhatsApp = (n: NotificacionFallecido) => {
    const mensaje =
      `Esdomed Notifica defuncion!\n\n` +
      `Expediente: ${n.pacienteExpediente ?? ""}\n` +
      `Servicio: ${n.servicio ?? ""}\n` +
      `Cama: ${n.cama ?? ""}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener");
  };

  const formatHora = (ts: unknown) => {
    if (!ts) return null;
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString("es-HN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  };

  // Fecha + hora completas (para la hora de fallecimiento que indicó el médico).
  const formatFechaHora = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString("es-HN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  };

  // Marca/desmarca el DUI validado. Si el caso ya está confirmado, guarda de
  // inmediato (corrección post-confirmación); si está pendiente, se guarda al confirmar.
  const guardarDui = async (val: boolean) => {
    setDuiValidado(val);
    if (selected?.id && selectedLive?.estado === "confirmado") {
      await updateDoc(doc(db, "notificaciones_fallecidos", selected.id), { duiValidado: val });
    }
  };

  // Contadores del encabezado: siempre sobre la bandeja (trámites abiertos),
  // para que no cambien al pasar a la búsqueda histórica.
  const pendientes     = bandeja.filter(n => n.estado === "pendiente").length;
  const certPendientes = bandeja.filter(n => n.estadoEntregaCertificado === "pendiente" && !n.privadoDeLibertad).length;
  const selectedLive   = selected ? notificaciones.find(n => n.id === selected.id) ?? selected : null;
  const lecturaSel     = selectedLive ? getLecturaConfirmada(selectedLive) : null;

  const TABS: { id: ActiveTab; label: string }[] = [
    { id: "expediente",  label: "Expediente"  },
    { id: "seguimiento", label: "Seguimiento" },
    { id: "certificado", label: "Certificado" },
    { id: "entrega",     label: "Entrega"     },
  ];

  const isLocked    = !!(selectedLive?.tramiteCerrado && !selectedLive.tramiteDesbloqueado);
  const isUnlocked  = !!(selectedLive?.tramiteCerrado && selectedLive.tramiteDesbloqueado);
  const todos4      = selectedLive ? pasosRequeridos(selectedLive).every(col => !!selectedLive[col.key]) : false;
  // La entrega debe estar resuelta para cerrar: entregado al familiar, resguardado
  // en archivo interno (cuerpo no reclamado) o en custodia interna (privado de
  // libertad). "Pendiente" o sin definir bloquean el cierre.
  const entregaResuelta = !!selectedLive && (
    !!selectedLive.privadoDeLibertad ||
    selectedLive.estadoEntregaCertificado === "entregado" ||
    selectedLive.estadoEntregaCertificado === "resguardado"
  );
  const puedeCerrar = todos4 && entregaResuelta && selectedLive?.estado === "confirmado" && (!selectedLive.tramiteCerrado || isUnlocked);
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
          {certVencidos > 0 && (
            <button
              onClick={() => setFiltro(filtro === "cert_vencido" ? "todos" : "cert_vencido")}
              title={`Certificados pendientes de entrega con más de ${DIAS_HABILES_CERT} días hábiles desde la defunción`}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border transition-colors ${
                filtro === "cert_vencido"
                  ? "bg-red-600 text-white border-red-600"
                  : "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-900"
              }`}
            >
              <AlertTriangle size={14} />
              {certVencidos} cert. vencidos
            </button>
          )}
        </div>
      </div>

      {/* Vistas: bandeja de trámites abiertos (en vivo) vs histórico (bajo demanda) */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
        {([
          { value: "bandeja", label: "Pendientes de cierre", icon: Inbox },
          { value: "buscar",  label: "Buscar histórico",     icon: History },
        ] as { value: Vista; label: string; icon: typeof Inbox }[]).map(v => (
          <button
            key={v.value}
            onClick={() => { if (v.value === vista) return; setVista(v.value); setFiltro("todos"); setFiltroTexto(""); setPage(1); }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              vista === v.value
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <v.icon size={14} />
            {v.label}
            {v.value === "bandeja" && bandeja.length > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                {bandeja.length}
              </span>
            )}
          </button>
        ))}
      </div>

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

      {vista === "bandeja" ? (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="text" placeholder="Filtrar por expediente, paciente o servicio..." value={filtroTexto} onChange={e => setFiltroTexto(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
          </div>
          <p className="text-xs text-slate-500">
            Solo trámites <span className="font-medium text-slate-600 dark:text-slate-300">pendientes de cierre</span>. Los cerrados se consultan en Buscar histórico.
          </p>
          {filtroTexto && (
            <button onClick={() => setFiltroTexto("")}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="text" placeholder="Expediente exacto…" value={busquedaExpediente}
                onChange={e => setBusquedaExpediente(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
                className="w-full pl-8 pr-3 py-1.5 text-sm font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 shrink-0">Defunción desde</span>
              <DateField value={fechaDesde} onChange={setFechaDesde} clearable placeholder="Desde" ariaLabel="Defunción desde" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 shrink-0">Hasta</span>
              <DateField value={fechaHasta} onChange={setFechaHasta} clearable placeholder="Hasta" ariaLabel="Defunción hasta" />
            </div>
            <button onClick={buscar} disabled={buscando || sinCriterio}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
              <Search size={13} /> {buscando ? "Buscando…" : "Buscar"}
            </button>
            {(busquedaExpediente || fechaDesde || fechaHasta || resultados !== null) && (
              <button onClick={limpiarBusqueda}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
                <X size={12} /> Limpiar
              </button>
            )}
          </div>
          {errorBusqueda ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
              {errorBusqueda}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Consulta bajo demanda: expediente exacto (trae todas sus defunciones) o rango de fecha de defunción. Incluye los trámites ya cerrados.
            </p>
          )}
        </div>
      )}

      {/* Tabla */}
      {buscando ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-blue-500" />
        </div>
      ) : displayList.length === 0 ? (
        <p className="text-sm text-slate-500 py-10 text-center">
          {vista === "buscar"
            ? (resultados === null
                ? "Indica un expediente o un rango de fechas y pulsa Buscar."
                : "Sin resultados para esa búsqueda.")
            : (bandeja.length === 0
                ? "No hay trámites pendientes de cierre."
                : "Sin notificaciones en este filtro.")}
        </p>
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
                {paginados.map(n => {
                  const colsReq = pasosRequeridos(n);
                  const pasos = colsReq.filter(col => !!n[col.key]).length;
                  return (
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
                        <p>Dr. {n.medicoNombre}</p>
                        {/* Hora en que el médico envió la notificación (no la de defunción) */}
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                          Reportado {formatFechaHora(n.creadoEn)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1.5">
                          <Badge estado={n.estado} />
                          {/* Tipo de certificado de defunción: digital (SIMMOW) o manual (libreta) */}
                          {n.tipoCertificado === "digital" ? (
                            <span title="Certificado de defunción digital (SIMMOW)"
                              className="flex w-fit items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-400">
                              <FileSignature size={10} /> Digital
                            </span>
                          ) : n.tipoCertificado === "manual" ? (
                            <span title="Certificado de defunción manual (llenado a mano)"
                              className="flex w-fit items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-400">
                              <PenLine size={10} /> Manual
                            </span>
                          ) : (
                            <span title="Falta indicar si el certificado es digital o manual (pestaña Certificado)"
                              className="flex w-fit items-center gap-1 rounded-md border border-dashed border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 dark:border-slate-600">
                              Cert. sin definir
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            {colsReq.map(col => (
                              <div key={col.key} title={col.label}
                                className={`w-2 h-2 rounded-full ${!!n[col.key] ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                            ))}
                            <span className="text-xs text-slate-500 ml-1">{pasos}/{colsReq.length}</span>
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
                          {n.privadoDeLibertad ? (
                            <span title="Privado de libertad: el certificado queda en custodia interna de ESDOMED (no se entrega salvo requerimiento de la Fiscalía)"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-900 px-1.5 py-0.5 rounded-md">
                              <ShieldCheck size={10} /> En custodia interna
                            </span>
                          ) : n.estadoEntregaCertificado === "pendiente" ? (
                            esVencido(n) ? (
                              <span title={`Más de ${DIAS_HABILES_CERT} días hábiles desde la defunción sin entregar el certificado`}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-1.5 py-0.5 rounded-md">
                                <AlertTriangle size={10} /> {certDiasHabiles.get(n.id ?? "")} días háb. sin entregar
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-900 px-1.5 py-0.5 rounded-md">
                                <FileWarning size={10} /> Cert. pendiente
                              </span>
                            )
                          ) : null}
                          {!n.privadoDeLibertad && n.estadoEntregaCertificado === "entregado" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-900 px-1.5 py-0.5 rounded-md">
                              <CheckCircle2 size={10} /> Cert. entregado
                            </span>
                          )}
                          {!n.privadoDeLibertad && n.estadoEntregaCertificado === "resguardado" && (
                            <span title="Cuerpo no reclamado (desconocido / fosa común): el certificado queda resguardado en el archivo interno de ESDOMED"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950 border border-teal-200 dark:border-teal-900 px-1.5 py-0.5 rounded-md">
                              <Archive size={10} /> Resguardado en archivo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setSelected(n)}
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors">
                          Ver detalle
                        </button>
                        {/* Eliminar duplicados: trámites cerrados solo el admin */}
                        {(!n.tramiteCerrado || isAdmin) && (
                          <button
                            onClick={() => setAEliminar(n)}
                            title="Eliminar notificación (duplicado)"
                            aria-label="Eliminar notificación"
                            className="ml-2.5 p-1 rounded-md text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors align-middle"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between gap-4">
            <span className="text-xs text-slate-500 shrink-0">
              {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, displayList.length)} de{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">{displayList.length}</span>
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
                    {selectedLive.tramiteJustificacion && <> · &quot;{selectedLive.tramiteJustificacion}&quot;</>}
                  </p>
                </div>
              </div>
            )}

            {/* Tab content */}
            <div className="overflow-y-auto flex-1 p-5 space-y-4">

              {/* ── Tab: Expediente ── */}
              {activeTab === "expediente" && (
                <div className="space-y-3">
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-x-6 gap-y-3">
                    <InfoCell label="Fecha y hora de defunción" value={formatFechaHora(selectedLive.fechaDefuncion)} />
                    <InfoCell label="Servicio" value={selectedLive.servicio} />
                    <InfoCell label="Notificado por" value={`Dr. ${selectedLive.medicoNombre}`} />
                    <InfoCell label="Hora del reporte" value={formatFechaHora(selectedLive.creadoEn)} />
                    {selectedLive.causaMuerte && (
                      <div className="col-span-2">
                        <InfoCell label="Causa de muerte" value={selectedLive.causaMuerte} />
                      </div>
                    )}
                  </div>

                  {/* Confirmación de LEÍDO por Psicología / Trabajo Social.
                      La registra el propio personal de esas áreas; es independiente
                      de la asignación/entrega del certificado que hace ESDOMED. */}
                  {lecturaSel && (
                    <div className="flex items-start gap-2 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-900 rounded-xl px-3 py-2.5">
                      <CheckCircle2 size={15} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 text-sm">
                        <p className="font-semibold text-green-700 dark:text-green-400">
                          Confirmado de leído por {lecturaSel.por}
                          <span className="ml-1.5 align-middle"><AreaBadge rol={lecturaSel.rol} /></span>
                        </p>
                        {lecturaSel.en && (
                          <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">{formatHora(lecturaSel.en)}</p>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => enviarWhatsApp(selectedLive)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-500 transition-colors"
                  >
                    <MessageCircle size={15} /> Generar mensaje de WhatsApp
                  </button>
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

                  {selectedLive.privadoDeLibertad && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 text-[11px] text-indigo-700 dark:text-indigo-300">
                      <ShieldCheck size={14} className="mt-0.5 shrink-0" />
                      <span>
                        Privado de libertad — certificado en custodia interna. La recepción por
                        Psic./T.S. y la entrega no aplican y no se exigen para cerrar el trámite.
                      </span>
                    </div>
                  )}

                  {!selectedLive.privadoDeLibertad && selectedLive.estadoEntregaCertificado === "resguardado" && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-[11px] text-teal-700 dark:text-teal-300">
                      <Archive size={14} className="mt-0.5 shrink-0" />
                      <span>
                        Resguardado en archivo interno — cuerpo no reclamado (desconocido / fosa común).
                        La recepción por Psic./T.S. y la entrega no aplican y no se exigen para cerrar el trámite.
                      </span>
                    </div>
                  )}

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
                        {valor && selectedLive.recibeDePsEntregadoPor && (
                          <p className="text-[11px] mt-1.5 flex items-center gap-1.5 text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md w-fit">
                            Entregado por {selectedLive.recibeDePsEntregadoPor}
                            {selectedLive.recibeDePsEn && <> · {formatHora(selectedLive.recibeDePsEn)}</>}
                          </p>
                        )}
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
                  {/* Privado de libertad: al marcarlo, el certificado queda en custodia
                      interna de ESDOMED y deja de contar como pendiente/vencido. */}
                  <label className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border select-none ${
                    isLocked
                      ? "opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                      : "cursor-pointer bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900"
                  }`}>
                    <input
                      type="checkbox"
                      checked={!!selectedLive.privadoDeLibertad}
                      disabled={updatingCell === "privadoDeLibertad" || isLocked}
                      onChange={e => actualizarCampo("privadoDeLibertad", e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-700 dark:text-indigo-300">
                        <ShieldCheck size={14} /> Privado de libertad
                      </span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        El certificado queda en custodia interna de ESDOMED; no se entrega
                        salvo requerimiento de la Fiscalía. No genera alerta de vencido.
                      </span>
                    </span>
                  </label>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Estado de entrega</label>
                    <div className="relative">
                      <select
                        value={selectedLive.estadoEntregaCertificado ?? ""}
                        disabled={updatingCell === "estadoEntregaCertificado" || isLocked || !!selectedLive.privadoDeLibertad}
                        onChange={e => actualizarCampo("estadoEntregaCertificado", e.target.value || null)}
                        className={selectCls}
                      >
                        <option value="">— Sin definir</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="entregado">Entregado</option>
                        <option value="resguardado">Resguardado en archivo interno</option>
                      </select>
                      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    {selectedLive.privadoDeLibertad && (
                      <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1.5">
                        En custodia interna — la entrega no aplica mientras sea privado de libertad.
                      </p>
                    )}
                    {!selectedLive.privadoDeLibertad && selectedLive.estadoEntregaCertificado === "resguardado" && (
                      <p className="text-[11px] text-teal-600 dark:text-teal-400 mt-1.5">
                        Para cuerpos no reclamados (desconocidos / fosa común): el certificado queda
                        archivado en ESDOMED y el trámite puede cerrarse sin entrega.
                      </p>
                    )}
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
              {/* DUI validado — disponible en pendiente y también en confirmado
                  (en confirmado se guarda al marcar; en pendiente, al confirmar). */}
              {!isLocked && (
                <label className="flex items-start gap-2.5 px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={duiValidado}
                    onChange={(e) => guardarDui(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-green-600 shrink-0"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    ¿Se cuenta con foto de <strong>DUI validada</strong> (vigente o con menos de un año de vencido)?
                    {selectedLive.estado === "confirmado" && (
                      <span className="block text-[11px] text-slate-400 mt-0.5">Se guarda al marcar.</span>
                    )}
                  </span>
                </label>
              )}
              {selectedLive.estado === "pendiente" && !isLocked && (
                <button onClick={confirmar} disabled={saving}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-green-700 rounded-xl hover:bg-green-600 disabled:opacity-50 transition-colors">
                  {saving ? "Confirmando..." : "Confirmar de leído y notificado"}
                </button>
              )}
              {/* Bloqueo de cierre por entrega pendiente: todo lo demás está listo,
                  pero el certificado no se ha entregado ni resguardado. */}
              {activeTab === "entrega" && !isLocked && selectedLive.estado === "confirmado" && todos4 && !entregaResuelta && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                  <FileWarning size={14} className="mt-0.5 shrink-0" />
                  <span>
                    No se puede cerrar el trámite: la entrega del certificado sigue pendiente.
                    En la pestaña <strong>Certificado</strong>, márcala como <strong>Entregado</strong> o,
                    si nadie reclamó el cuerpo, como <strong>Resguardado en archivo interno</strong>.
                  </span>
                </div>
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

      {/* Confirmación de eliminación (duplicados) */}
      {aEliminar && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-rose-600 dark:text-rose-300" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-900 dark:text-slate-100">Eliminar notificación de fallecido</p>
                <p className="text-sm text-slate-500 mt-1">
                  Se eliminará la notificación de <strong>{aEliminar.pacienteNombre}</strong> (Exp.{" "}
                  <span className="font-mono">{aEliminar.pacienteExpediente}</span>), incluido su seguimiento
                  (SIMMOW, certificado, entrega). Úsalo solo para <strong>duplicados</strong> — esta acción no se
                  puede deshacer y no cambia el estado del paciente.
                </p>
              </div>
            </div>
            {aEliminar.estado === "confirmado" && (
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
                Esta notificación ya fue confirmada. Verifica que exista otra notificación del mismo fallecimiento antes de eliminarla.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setAEliminar(null)}
                disabled={eliminando}
                className="flex-1 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={eliminarNotificacion}
                disabled={eliminando}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors disabled:opacity-50"
              >
                {eliminando ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Eliminar
              </button>
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

// Distintivo del área del personal que confirmó visto (psicología / trabajo social).
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
