"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, query, orderBy, onSnapshot, getDocs, deleteDoc, doc, updateDoc, Timestamp, where, limit, type QueryConstraint } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { NotificacionFallecido, UserProfile } from "@/types";
import { getLecturaConfirmada, ARCHIVO_RESGUARDO, carpetaResguardo, certificadoEnResguardo } from "@/lib/fallecidos";
import { BitacoraFallecido } from "@/components/BitacoraFallecido";
import { FallecidoDetalleModal, type VistaDetalleFallecido } from "@/components/fallecidos/FallecidoDetalleModal";
import ui from "@/components/fallecidos/FallecidosUi.module.css";
import { Badge } from "@/components/ui/Badge";
import { DateField } from "@/components/ui/DateField";
import { ArrowUpRight, Circle, ClipboardCheck, Clock, X, ChevronDown, ChevronLeft, ChevronRight, CheckCircle2, FileWarning, AlertTriangle, Loader2, Lock, LockOpen, Search, MessageCircle, Trash2, ShieldCheck, Archive, Inbox, History, FileSignature, PenLine, MapPin } from "lucide-react";

// Los mismos pasos alimentan los requisitos de cierre y el resumen visual.
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
// Bandeja = trámites abiertos (en vivo). Buscar = histórico bajo demanda.
type Vista = "bandeja" | "buscar";

// Tope de la búsqueda por rango de fechas (el histórico completo nunca se baja).
const LIMIT_BUSQUEDA = 500;

const selectCls = "w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 cursor-pointer shadow-sm disabled:cursor-not-allowed";

// Valor de filtroCarpeta para los resguardos sin ubicación registrada.
const SIN_UBICAR = "__sin_ubicar__";

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
  return certificadoEnResguardo(n)
    ? COLUMNAS_SEGUIMIENTO.filter(c => c.key !== "entregaCertificado" && c.key !== "recibeDePs")
    : COLUMNAS_SEGUIMIENTO;
}


// Resumen de presentación de las condiciones existentes de cierre. No añade requisitos.
function requisitosCierre(n: NotificacionFallecido) {
  const resguardo = certificadoEnResguardo(n);
  const etiquetas: Record<CampoSeguimiento, string> = {
    tramitaDefuncion: "Tramitación de defunción",
    digitaSimmow: "Registro en SIMMOW",
    entregaCertificado: "Responsable de entrega",
    recibeDePs: "Asignación Psicología / T.S.",
  };
  return [
    { key: "confirmacion", label: "Confirmación ESDOMED", completo: n.estado === "confirmado" },
    ...pasosRequeridos(n).map(col => ({ key: col.key, label: etiquetas[col.key], completo: !!n[col.key] })),
    {
      key: "resolucion", label: resguardo ? "Ubicación física registrada" : "Certificado entregado",
      completo: resguardo ? !!n.ubicacionCertificado : n.estadoEntregaCertificado === "entregado",
    },
  ];
}

export default function DashboardFallecidosPage() {
  const { profile, user } = useAuth();
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
  const [filtro, setFiltro] = useState<"pendiente" | "confirmado" | "cert_pendiente" | "cert_vencido" | "resguardo" | "todos">("todos");
  // Dentro del filtro de resguardo: una carpeta HNES-CDCI-{año} o SIN_UBICAR.
  const [filtroCarpeta, setFiltroCarpeta] = useState<string | null>(null);
  // Qué consulta produjo los resultados de Buscar, para repetir la misma al refrescar.
  const [modoBusqueda, setModoBusqueda] = useState<"criterio" | "resguardo">("criterio");
  const [selected, setSelected] = useState<NotificacionFallecido | null>(null);
  const [activeTab, setActiveTab] = useState<VistaDetalleFallecido>("gestion");
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
    // Solo personal vigente: los dados de baja no deben ofrecerse en los
    // selectores de "quién lo hizo" (los registros históricos guardan el nombre).
    getDocs(query(collection(db, "usuarios"), where("role", "in", ["esdomed", "asistente_esdomed", "admin"])))
      .then(snap => setPersonal(
        snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)).filter(u => u.activo !== false),
      ));
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
    if (modoBusqueda === "resguardo") { setFiltro("todos"); setFiltroCarpeta(null); }
    setModoBusqueda("criterio");
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

  // Todos los certificados en resguardo interno (privados de libertad + cuerpos
  // no reclamados) de cualquier fecha, abiertos o cerrados. Dos igualdades
  // simples fusionadas en cliente, sin orderBy: no exigen índice compuesto y son
  // pocos por año. El rango de fechas, si se indicó, se afina en cliente.
  const buscarResguardo = async ({ refresco = false } = {}) => {
    setModoBusqueda("resguardo");
    setBuscando(true);
    setErrorBusqueda("");
    try {
      const col = collection(db, "notificaciones_fallecidos");
      const [ppl, resg] = await Promise.all([
        getDocs(query(col, where("privadoDeLibertad", "==", true))),
        getDocs(query(col, where("estadoEntregaCertificado", "==", "resguardado"))),
      ]);
      const m = new Map<string, NotificacionFallecido>();
      [...ppl.docs, ...resg.docs].forEach(d => m.set(d.id, { id: d.id, ...d.data() } as NotificacionFallecido));
      let docs = [...m.values()];
      if (fechaDesde) docs = docs.filter(n => (tsToDate(n.fechaDefuncion)?.getTime() ?? 0) >= new Date(fechaDesde + "T00:00:00").getTime());
      if (fechaHasta) docs = docs.filter(n => (tsToDate(n.fechaDefuncion)?.getTime() ?? 0) <= new Date(fechaHasta + "T23:59:59").getTime());
      setResultados(docs.sort(
        (a, b) => (tsToDate(b.fechaDefuncion)?.getTime() ?? 0) - (tsToDate(a.fechaDefuncion)?.getTime() ?? 0),
      ));
      if (!refresco) { setFiltro("resguardo"); setFiltroCarpeta(null); setPage(1); }
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
    if (modoBusqueda === "resguardo") { setFiltro("todos"); setFiltroCarpeta(null); }
    setModoBusqueda("criterio");
  };

  // Tras editar/cerrar desde un resultado de búsqueda (que es una foto, no un
  // listener) se relee esa misma búsqueda para no dejar datos viejos en pantalla.
  const refrescarBusqueda = () => {
    if (vista !== "buscar" || resultados === null) return;
    void (modoBusqueda === "resguardo" ? buscarResguardo({ refresco: true }) : buscar());
  };

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
      setActiveTab("gestion");
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

  // Resguardo interno y su desglose por carpeta (inventario de la gaveta).
  const enResguardoLista = filtro === "resguardo" ? notificaciones.filter(certificadoEnResguardo) : [];
  const conteoCarpetas = new Map<string, number>();
  let sinUbicar = 0;
  enResguardoLista.forEach(n => {
    const c = n.ubicacionCertificado?.carpeta;
    if (c) conteoCarpetas.set(c, (conteoCarpetas.get(c) ?? 0) + 1);
    else sinUbicar++;
  });
  const carpetas = [...conteoCarpetas.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const filtered = filtro === "todos"       ? notificaciones
    : filtro === "cert_pendiente"           ? notificaciones.filter(n => n.estadoEntregaCertificado === "pendiente" && !n.privadoDeLibertad)
    : filtro === "cert_vencido"             ? notificaciones.filter(esVencido)
    : filtro === "resguardo"                ? enResguardoLista.filter(n =>
        !filtroCarpeta ? true
        : filtroCarpeta === SIN_UBICAR ? !n.ubicacionCertificado
        : n.ubicacionCertificado?.carpeta === filtroCarpeta)
    : notificaciones.filter(n => n.estado === filtro);

  const displayList = filtered
    // Filtro de texto en cliente sobre lo ya cargado (en Buscar, los criterios
    // de expediente y fechas ya se aplicaron en el servidor).
    .filter(n => {
      const t = filtroTexto.trim().toLowerCase();
      if (!t) return true;
      return (n.pacienteExpediente?.toLowerCase() ?? "").includes(t)
        || (n.pacienteNombre?.toLowerCase() ?? "").includes(t)
        || (n.servicio?.toLowerCase() ?? "").includes(t)
        || (n.ubicacionCertificado?.carpeta.toLowerCase() ?? "").includes(t);
    })
    // Los certificados vencidos suben al tope (sort estable → conserva el orden por fecha dentro de cada grupo).
    .sort((a, b) => Number(esVencido(b)) - Number(esVencido(a)));

  // Paginación (10 por página). Reinicia a la página 1 al cambiar filtros;
  // pageSafe protege contra el snapshot en vivo que encoge la lista.
  const totalPages = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const filtrosKey = `${vista}|${filtro}|${filtroCarpeta}|${filtroTexto}`;
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
      const token = user ? await user.getIdToken() : null;
      await marcarPacienteFallecido(selected, token);
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

  // Registra quién archivó un certificado en resguardo interno y dónde quedó.
  // La primera vez toma el archivero del catálogo y la carpeta del año de
  // defunción; al cambiar solo la persona se conserva el lugar ya guardado.
  const registrarUbicacion = async (nombre: string) => {
    if (!selected?.id || !selectedLive) return;
    setUpdatingCell("ubicacionCertificado");
    const actual = selectedLive.ubicacionCertificado;
    const lugar = actual
      ? { archivero: actual.archivero, activoFijo: actual.activoFijo, gaveta: actual.gaveta, carpeta: actual.carpeta }
      : { ...ARCHIVO_RESGUARDO, carpeta: carpetaResguardo(selectedLive.fechaDefuncion) };
    await updateDoc(doc(db, "notificaciones_fallecidos", selected.id), {
      ubicacionCertificado: nombre ? {
        ...lugar,
        archivadoPor: nombre,
        archivadoPorUid: personal.find(p => p.nombre === nombre)?.uid ?? null,
        archivadoEn: Timestamp.now(),
        registradoPor: profile?.nombre ?? null,
      } : null,
    });
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

  const isLocked    = !!(selectedLive?.tramiteCerrado && !selectedLive.tramiteDesbloqueado);
  const isUnlocked  = !!(selectedLive?.tramiteCerrado && selectedLive.tramiteDesbloqueado);
  const todos4      = selectedLive ? pasosRequeridos(selectedLive).every(col => !!selectedLive[col.key]) : false;
  // La entrega debe estar resuelta para cerrar: entregado al familiar o, si queda
  // en resguardo interno (cuerpo no reclamado o privado de libertad), archivado
  // con su ubicación física registrada. "Pendiente" o sin definir bloquean el cierre.
  const enResguardo = !!selectedLive && certificadoEnResguardo(selectedLive);
  const entregaResuelta = !!selectedLive && (
    enResguardo ? !!selectedLive.ubicacionCertificado : selectedLive.estadoEntregaCertificado === "entregado"
  );
  // La ubicación se puede registrar aun con el trámite cerrado si nunca se
  // registró (casos cerrados antes de existir el campo); una ya puesta, no.
  const puedeEditarUbicacion = !isLocked || !selectedLive?.ubicacionCertificado;
  const puedeCerrar = todos4 && entregaResuelta && selectedLive?.estado === "confirmado" && (!selectedLive.tramiteCerrado || isUnlocked);
  const isAdmin     = profile?.role === "admin";

  const fiehNombreGuardado = typeof selectedLive?.actualizoFieh === "string" && selectedLive.actualizoFieh
    ? selectedLive.actualizoFieh
    : null;
  const fiehChequeado = fiehNombreGuardado !== null || fiehPendiente;

  const requisitos = selectedLive ? requisitosCierre(selectedLive) : [];
  const faltantes = requisitos.filter(r => !r.completo);

  return (
    <div className={`${ui.page} space-y-5`}>

      <header className={ui.pageHeading}>
        <div>
          <div className={ui.eyebrow}>ESDOMED <span aria-hidden="true">/</span> Solicitudes y avisos</div>
          <h1 className="font-heading">Seguimiento de defunciones</h1>
        </div>
        <span className={ui.viewLabel}>{vista === "bandeja" ? "Bandeja en vivo" : "Consulta de histórico"}</span>
      </header>

      <div className={ui.stats} aria-label="Pendientes de la bandeja">
        {([
          { label: "Sin confirmar", value: "pendiente", count: pendientes, icon: Clock, tone: "pending" },
          { label: "Certificados pendientes", value: "cert_pendiente", count: certPendientes, icon: FileWarning, tone: "normal" },
          { label: `Más de ${DIAS_HABILES_CERT} días hábiles`, value: "cert_vencido", count: certVencidos, icon: AlertTriangle, tone: "alert" },
        ] as const).map(item => (
          <button key={item.value} type="button" className={ui.stat} data-tone={item.tone}
            aria-pressed={vista === "bandeja" && filtro === item.value}
            onClick={() => {
              setVista("bandeja"); setFiltro(vista === "bandeja" && filtro === item.value ? "todos" : item.value);
              setFiltroCarpeta(null); setFiltroTexto("");
            }}>
            <span><item.icon size={17} aria-hidden="true" />{item.label}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
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
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
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
          { label: "Sin confirmar",   value: "pendiente"      },
          { label: "Confirmados",     value: "confirmado"     },
          { label: "Cert. pendiente", value: "cert_pendiente" },
          { label: "Resguardo interno", value: "resguardo"    },
        ].map(f => (
          <button key={f.value} onClick={() => { setFiltro(f.value as typeof filtro); setFiltroCarpeta(null); }}
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

      {/* Desglose del resguardo por carpeta de la gaveta */}
      {filtro === "resguardo" && enResguardoLista.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <MapPin size={13} className="text-blue-600 dark:text-blue-400 mr-0.5" />
          {[
            { value: null,       label: "Todas",      n: enResguardoLista.length },
            ...carpetas.map(([c, n]) => ({ value: c, label: c, n })),
            ...(sinUbicar > 0 ? [{ value: SIN_UBICAR, label: "Sin ubicar", n: sinUbicar }] : []),
          ].map(c => {
            const activo = filtroCarpeta === c.value;
            const esSin  = c.value === SIN_UBICAR;
            return (
              <button key={c.value ?? "todas"} onClick={() => setFiltroCarpeta(c.value)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  activo
                    ? esSin ? "bg-amber-600 text-white border-amber-600" : "bg-blue-600 text-white border-blue-600"
                    : esSin
                      ? "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900 hover:bg-amber-100 dark:hover:bg-amber-900"
                      : "text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                } ${c.value && !esSin ? "font-mono" : ""}`}>
                {c.label}
                <span className={`tabular-nums ${activo ? "text-white/80" : "opacity-70"}`}>{c.n}</span>
              </button>
            );
          })}
        </div>
      )}

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
            <button onClick={() => buscarResguardo()} disabled={buscando}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                modoBusqueda === "resguardo" && resultados !== null
                  ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900"
                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}>
              <Archive size={13} /> Resguardo interno
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
              Consulta bajo demanda: expediente exacto (trae todas sus defunciones), rango de fecha de defunción o todo el resguardo interno. Incluye los trámites ya cerrados.
            </p>
          )}
        </div>
      )}

      {/* La bandeja conserva sus consultas, filtros y paginación. */}
      {buscando ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-blue-500" aria-label="Buscando" /></div>
      ) : displayList.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
          <Inbox size={26} strokeWidth={1.5} className="text-slate-400" aria-hidden="true" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {vista === "buscar" ? (resultados === null ? "Busca por expediente, fecha o resguardo interno." : "Sin resultados para esa búsqueda.")
              : (bandeja.length === 0 ? "No hay trámites pendientes de cierre." : "Sin notificaciones en este filtro.")}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-400">
                  <th className="px-5 py-3.5 font-medium">Expediente / Paciente</th>
                  <th className="px-4 py-3.5 font-medium">Defunción</th>
                  <th className="px-4 py-3.5 font-medium">Notificado por</th>
                  <th className="px-4 py-3.5 font-medium">Confirmación</th>
                  <th className="px-4 py-3.5 font-medium">Control del trámite</th>
                  <th className="px-4 py-3.5"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginados.map(n => {
                  const req = requisitosCierre(n);
                  const pendiente = req.find(r => !r.completo);
                  const completos = req.filter(r => r.completo).length;
                  const cerrado = n.tramiteCerrado && !n.tramiteDesbloqueado;
                  return (
                    <tr key={n.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="px-5 py-4">
                        <div className={ui.tablePatient}><strong>{n.pacienteExpediente}</strong><span>{n.pacienteNombre}</span></div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{formatFechaHora(n.fechaDefuncion)}</p>
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{n.servicio} · Cama {n.cama}</p>
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <p className="text-slate-600 dark:text-slate-300">Dr. {n.medicoNombre}</p>
                        <p className="mt-1.5 text-slate-500 dark:text-slate-400">{formatFechaHora(n.creadoEn)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <Badge estado={n.estado} />
                        <span className={ui.certificateType}>
                          {n.tipoCertificado === "digital" ? <><FileSignature size={12} aria-hidden="true" /> Digital</>
                            : n.tipoCertificado === "manual" ? <><PenLine size={12} aria-hidden="true" /> Manual</> : "Certificado sin definir"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className={ui.rowProgress}>
                          <p>{cerrado ? <span className="inline-flex items-center gap-1.5"><Lock size={12} aria-hidden="true" /> Trámite cerrado</span>
                            : n.tramiteDesbloqueado ? "Registro desbloqueado" : pendiente ? "Falta: " + pendiente.label : "Listo para cerrar"}</p>
                          <div className={ui.progressTrack} aria-label={completos + " de " + req.length + " requisitos de cierre completos"}>
                            {req.map(r => <span key={r.key} data-complete={r.completo} title={r.label + (r.completo ? ": completo" : ": pendiente")} />)}
                            <small>{completos}/{req.length}</small>
                          </div>
                          <div className={ui.certificateStatus}>
                            {certificadoEnResguardo(n) ? (
                              <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                                {n.privadoDeLibertad ? <ShieldCheck size={12} aria-hidden="true" /> : <Archive size={12} aria-hidden="true" />}
                                {n.ubicacionCertificado ? n.ubicacionCertificado.carpeta + " · Gav. " + n.ubicacionCertificado.gaveta
                                  : n.privadoDeLibertad ? "Custodia · Sin ubicar" : "Resguardo · Sin ubicar"}
                              </span>
                            ) : n.estadoEntregaCertificado === "pendiente" ? (
                              <span className={esVencido(n) ? "inline-flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400" : "inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400"}>
                                {esVencido(n) ? <AlertTriangle size={12} aria-hidden="true" /> : <Clock size={12} aria-hidden="true" />}
                                {esVencido(n) ? certDiasHabiles.get(n.id ?? "") + " días háb. sin entregar" : "Certificado pendiente"}
                              </span>
                            ) : n.estadoEntregaCertificado === "entregado" ? (
                              <span className="inline-flex items-center gap-1.5 text-green-700 dark:text-green-400"><CheckCircle2 size={12} aria-hidden="true" /> Certificado entregado</span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className={ui.rowActions}>
                          <button type="button" className={ui.openButton} onClick={() => setSelected(n)} aria-label={"Abrir expediente " + n.pacienteExpediente}>
                            Abrir <ArrowUpRight size={14} aria-hidden="true" />
                          </button>
                          {(!n.tramiteCerrado || isAdmin) && (
                            <button type="button" onClick={() => setAEliminar(n)} title="Eliminar notificación duplicada" aria-label="Eliminar notificación duplicada"
                              className="inline-flex w-8 items-center justify-center rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950 dark:hover:text-rose-400">
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          )}
                        </div>
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

      {selectedLive && (
        <FallecidoDetalleModal
          notificacion={selectedLive} fechaDefuncion={formatFechaHora(selectedLive.fechaDefuncion)}
          locked={isLocked} unlocked={isUnlocked}
          busy={saving || cerrando || desbloqueando || savingFamiliar || !!updatingCell}
          vista={activeTab} onVistaChange={setActiveTab} onClose={() => setSelected(null)}
          resumen={
            <>
              <section className={ui.overviewSection}>
                <h3>Control del trámite</h3>
                <ol className={ui.checklist}>
                  {requisitos.map(r => (
                    <li key={r.key} data-complete={r.completo}>
                      {r.completo ? <CheckCircle2 size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
                      <span>{r.label}</span>
                    </li>
                  ))}
                </ol>
              </section>
              <section className={ui.overviewSection}>
                <h3>Notificación</h3>
                <div className="space-y-4">
                  <InfoCell label="Médico que notifica" value={"Dr. " + selectedLive.medicoNombre} />
                  <InfoCell label="Fecha del reporte" value={formatFechaHora(selectedLive.creadoEn)} />
                  {selectedLive.causaMuerte && <InfoCell label="Causa de muerte" value={selectedLive.causaMuerte} />}
                  {selectedLive.confirmadoPorNombre && <InfoCell label="Confirmación ESDOMED" value={selectedLive.confirmadoPorNombre} />}
                </div>
              </section>
              <section className={ui.overviewSection}>
                <h3>Lectura Psicología / T.S.</h3>
                {lecturaSel ? (
                  <div className="space-y-2">
                    <p className="flex items-start gap-2 text-xs font-medium text-green-700 dark:text-green-400"><CheckCircle2 size={15} className="shrink-0" aria-hidden="true" />{lecturaSel.por}</p>
                    <AreaBadge rol={lecturaSel.rol} />
                    {lecturaSel.en && <p className="text-xs text-slate-500 dark:text-slate-400">{formatHora(lecturaSel.en)}</p>}
                  </div>
                ) : <p className="text-xs text-slate-500 dark:text-slate-400">Sin confirmación de lectura</p>}
              </section>
            </>
          }
          bitacora={selectedLive.id ? <BitacoraFallecido key={selectedLive.id} notificacionId={selectedLive.id} tramiteCerrado={isLocked} /> : null}
          footer={
            <>
              <div className={ui.footerActions}>
                <span className={ui.footerState} aria-live="polite">
                  {isLocked ? <><Lock size={14} aria-hidden="true" /> Cerrado por {selectedLive.tramiteCerradoPor}</>
                    : puedeCerrar ? <><CheckCircle2 size={15} className="text-green-600" aria-hidden="true" /> Requisitos de cierre completos</>
                    : <><Clock size={14} aria-hidden="true" />{faltantes[0]?.label} · {faltantes.length} {faltantes.length === 1 ? "pendiente" : "pendientes"}</>}
                </span>
                <button type="button" onClick={() => enviarWhatsApp(selectedLive)} className={ui.secondaryButton}>
                  <MessageCircle size={15} aria-hidden="true" /> Generar WhatsApp
                </button>
                {selectedLive.estado === "pendiente" && !isLocked && (
                  <button type="button" onClick={confirmar} disabled={saving} className={ui.primaryButton}>
                    {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ClipboardCheck size={16} aria-hidden="true" />}
                    {saving ? "Confirmando..." : "Confirmar de leído y notificado"}
                  </button>
                )}
                {puedeCerrar && (
                  <button type="button" onClick={cerrarTramite} disabled={cerrando} className={ui.primaryButton}>
                    {cerrando ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
                    {cerrando ? "Cerrando..." : "Cerrar trámite"}
                  </button>
                )}
              </div>
              {isLocked && isAdmin && (
                <details className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                  <summary className="cursor-pointer text-xs font-medium text-amber-700 dark:text-amber-400">Desbloquear registro</summary>
                  <div className="mt-3">                <div className="border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 rounded-xl p-4 space-y-3">
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
                </div></div>
                </details>
              )}
            </>
          }
        >
          {isLocked && (
            <div className={ui.notice}><Lock size={15} aria-hidden="true" /><span>Trámite cerrado · Solo lectura{selectedLive.tramiteCerradoEn && <> · {formatHora(selectedLive.tramiteCerradoEn)}</>}</span></div>
          )}
          {isUnlocked && (
            <div className={ui.notice}><LockOpen size={15} aria-hidden="true" /><span>Desbloqueado por {selectedLive.tramiteDesbloqueadoPor}{selectedLive.tramiteJustificacion && <> · {selectedLive.tramiteJustificacion}</>}</span></div>
          )}
          <section className={ui.section} aria-labelledby="defuncion-tramitacion">
            <h3 id="defuncion-tramitacion" className={ui.sectionTitle}><span className={ui.sectionNumber}>01</span>Tramitación y registro</h3>
                <div className={ui.fieldsGrid}>
                  {COLUMNAS_SEGUIMIENTO.filter(col => col.key !== "entregaCertificado" && col.key !== "recibeDePs").map(col => {
                    const valor    = selectedLive[col.key] as string | undefined;
                    const fecha    = selectedLive[col.keyEn];
                    const isLoading = updatingCell === col.key;
                    return (
                      <div key={col.key}>
                        <label htmlFor={"seguimiento-" + col.key} className="block text-xs font-medium text-slate-500 mb-1.5">{col.label}</label>
                        <div className="relative">
                          <select id={"seguimiento-" + col.key}
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
          </section>
          <section className={ui.section} aria-labelledby="defuncion-certificado">
            <h3 id="defuncion-certificado" className={ui.sectionTitle}><span className={ui.sectionNumber}>02</span>Certificado de defunción</h3>
                <div className="space-y-4">
                  <div className={ui.fieldsGrid}>
                  <div>
                    <label htmlFor="certificado-estado" className="block text-xs font-medium text-slate-500 mb-1.5">Estado de entrega</label>
                    <div className="relative">
                      <select id="certificado-estado"
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
                    <label htmlFor="certificado-tipo" className="block text-xs font-medium text-slate-500 mb-1.5">Tipo de certificado</label>
                    <div className="relative">
                      <select id="certificado-tipo"
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

                  <label className={ui.validation}>
                    <input type="checkbox" checked={!!selectedLive.privadoDeLibertad}
                      disabled={updatingCell === "privadoDeLibertad" || isLocked}
                      onChange={e => actualizarCampo("privadoDeLibertad", e.target.checked)} className="h-4 w-4" />
                    <span className="inline-flex flex-wrap items-center gap-2"><ShieldCheck size={15} aria-hidden="true" />Privado de libertad
                      {selectedLive.privadoDeLibertad && <span className="text-xs text-blue-700 dark:text-blue-300">Certificado en custodia interna</span>}
                    </span>
                  </label>

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


                </div>
            <div className="mt-5">
              {!isLocked ? (
                <label className={ui.validation}>
                  <input type="checkbox" checked={duiValidado} onChange={e => guardarDui(e.target.checked)} className="h-4 w-4" />
                  <span>Foto de <strong>DUI validada</strong> · Vigente o con menos de un año de vencido</span>
                </label>
              ) : <InfoCell label="Foto de DUI validada" value={duiValidado ? "Sí" : "No"} />}
            </div>
          </section>
          <section className={ui.section} aria-labelledby="defuncion-entrega">
            <h3 id="defuncion-entrega" className={ui.sectionTitle}><span className={ui.sectionNumber}>03</span>{enResguardo ? "Resguardo y archivo" : "Entrega y recepción"}</h3>
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

                  {/* Ubicación física del certificado en resguardo interno: archivero,
                      gaveta y carpeta del año de defunción, más quién lo archivó. */}
                  {enResguardo && (() => {
                    const ub = selectedLive.ubicacionCertificado;
                    const lugar = ub ?? { ...ARCHIVO_RESGUARDO, carpeta: carpetaResguardo(selectedLive.fechaDefuncion) };
                    return (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                          <MapPin size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Ubicación física</p>
                        </div>
                        <div className="p-4 space-y-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
                            <div className="col-span-2">
                              <p className="text-xs text-slate-500">Archivero</p>
                              <p className="break-words text-sm text-slate-800 dark:text-slate-200 font-medium mt-0.5">{lugar.archivero}</p>
                              <p className="text-[11px] text-slate-500 font-mono mt-0.5">Activo fijo {lugar.activoFijo}</p>
                            </div>
                            <InfoCell label="Gaveta" value={String(lugar.gaveta)} />
                            <div>
                              <p className="text-xs text-slate-500">Carpeta</p>
                              <p className="text-slate-800 dark:text-slate-200 font-medium font-mono mt-0.5 whitespace-nowrap">{lugar.carpeta}</p>
                            </div>
                          </div>
                          <div>
                            <label htmlFor="certificado-archivo" className="block text-xs font-medium text-slate-500 mb-1.5">Archivado por</label>
                            <div className="relative">
                              <select id="certificado-archivo"
                                value={ub?.archivadoPor ?? ""}
                                disabled={updatingCell === "ubicacionCertificado" || !puedeEditarUbicacion}
                                onChange={e => registrarUbicacion(e.target.value)}
                                className={selectCls}
                              >
                                <option value="">— Sin archivar</option>
                                {ub?.archivadoPor && !personal.some(p => p.nombre === ub.archivadoPor) && (
                                  <option value={ub.archivadoPor}>{ub.archivadoPor}</option>
                                )}
                                {personal.map(p => (
                                  <option key={p.uid} value={p.nombre}>{p.nombre}</option>
                                ))}
                              </select>
                              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                            {ub?.archivadoEn && (
                              <p className="text-[11px] mt-1.5 flex items-center gap-1.5 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 px-2 py-1 rounded-md w-fit">
                                <CheckCircle2 size={11} /> {formatHora(ub.archivadoEn)}
                                {ub.registradoPor && ub.registradoPor !== ub.archivadoPor && <> · registró {ub.registradoPor}</>}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Recibe Psic./TS */}
                  {(() => {
                    const col = COLUMNAS_SEGUIMIENTO.find(c => c.key === "recibeDePs")!;
                    const valor = selectedLive[col.key] as string | undefined;
                    const isLoading = updatingCell === col.key;
                    return (
                      <div>
                        <label htmlFor={"seguimiento-" + col.key} className="block text-xs font-medium text-slate-500 mb-1.5">{col.label}</label>
                        <div className="relative">
                          <select id={"seguimiento-" + col.key}
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
                    <label htmlFor="certificado-entrega" className="block text-xs font-medium text-slate-500 mb-1.5">Quién entregó el certificado</label>
                    <div className="relative">
                      <select id="certificado-entrega"
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
                          <label htmlFor="familiar-parentesco" className="block text-xs font-medium text-slate-500 mb-1.5">Parentesco</label>
                          <div className="relative">
                            <select id="familiar-parentesco"
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
                          className={`w-full py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors ${
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
          </section>
        </FallecidoDetalleModal>
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
      <label htmlFor={"familiar-" + label.replaceAll(" ", "-")} className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      <input
        id={"familiar-" + label.replaceAll(" ", "-")}
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

async function cerrarFichaCriticaPorEgresoPaciente(pacienteId: string, token?: string | null) {
  if (!token) return;
  const res = await fetch(`/api/esdomed/pacientes/${pacienteId}/cerrar-ficha-critica-egreso`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`No se pudo cerrar ficha UCI/UCIN (${res.status})`);
}

async function marcarPacienteFallecido(n: NotificacionFallecido, token?: string | null) {
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

  await cerrarFichaCriticaPorEgresoPaciente(pacRef.id, token);
}
