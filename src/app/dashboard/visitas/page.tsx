"use client";

import { useEffect, useMemo, useState, useRef, useCallback, createContext, useContext } from "react";
import {
  collection, query, where, onSnapshot, getDocs, getDoc,
  addDoc, updateDoc, doc, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { PARENTESCOS } from "@/lib/parentescos";
import { DateField } from "@/components/ui/DateField";
import type { Paciente, TarjetaVisita, Visita, VisitanteInfo } from "@/types";
import {
  DoorOpen, Plus, X, LogIn, LogOut, User, UserPlus, IdCard,
  Search, CheckCircle2, CalendarDays, MessageSquare, CreditCard, Ban, Trash2,
  AlertTriangle, ArrowLeft,
} from "lucide-react";

// ── Estilos compartidos ───────────────────────────────────────────────────────

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 transition";
// Cuántos pacientes se muestran por página en el roster antes de "Cargar más".
const ROSTER_PAGINA = 12;
const selectCls =
  "w-full appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 transition cursor-pointer";

// ── Utilidades ────────────────────────────────────────────────────────────────

function fechaStr(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

function hoyStr(): string {
  return fechaStr(new Date());
}

function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  return (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
}

function fmtHora(ts: unknown): string {
  const d = toDate(ts);
  return d ? d.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
}

/** "2026-06-04" → "miércoles 04 jun" */
function fmtFechaStr(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("es-HN", { weekday: "long", day: "2-digit", month: "short" });
}

function iniciales(nombres = "", apellidos = ""): string {
  return `${nombres} ${apellidos}`.trim().split(/\s+/).filter(Boolean).map(w => w[0]!.toUpperCase()).join("");
}

/**
 * Código de tarjeta: expediente del paciente + iniciales de su nombre.
 * En reingresos (mismo expediente) se agrega un sufijo de secuencia para
 * distinguir la tarjeta de cada internamiento: 1-26-JCP, 1-26-JCP-2, …
 */
function codigoTarjeta(expediente: string, nombres: string, apellidos: string, secuencia = 1): string {
  const ini = iniciales(nombres, apellidos);
  const base = ini ? `${expediente}-${ini}` : expediente;
  return secuencia > 1 ? `${base}-${secuencia}` : base;
}

/** Clave para deduplicar visitantes: DUI si existe, si no el nombre normalizado. */
function claveVisitante(v: VisitanteInfo): string {
  return (v.dui?.trim() || v.nombre.trim().toUpperCase());
}

function limpiarVisitante(v: VisitanteInfo): VisitanteInfo {
  return {
    nombre: v.nombre.trim().toUpperCase(),
    parentesco: v.parentesco.trim(),
    ...(v.dui?.trim() ? { dui: v.dui.trim() } : {}),
    ...(v.telefono?.trim() ? { telefono: v.telefono.trim() } : {}),
  };
}

// Lee la ubicación vigente del paciente (fuente de verdad). Devuelve null si no existe.
async function ubicacionPaciente(pacienteId: string): Promise<{ servicio: string; cama: string } | null> {
  if (!pacienteId) return null;
  const p = await getDoc(doc(db, "pacientes", pacienteId));
  if (!p.exists()) return null;
  const data = p.data() as Paciente;
  return { servicio: data.servicioActual ?? "", cama: data.camaActual ?? "" };
}

async function cargarTarjeta(id: string): Promise<TarjetaVisita | null> {
  const d = await getDoc(doc(db, "tarjetas_visita", id));
  if (!d.exists()) return null;
  const tarjeta = { id: d.id, ...d.data() } as TarjetaVisita;
  // Refrescar el snapshot de ubicación si el paciente fue trasladado desde que se creó.
  const ubic = await ubicacionPaciente(tarjeta.pacienteId);
  if (ubic && (ubic.servicio !== tarjeta.servicio || (ubic.cama ?? "") !== (tarjeta.cama ?? ""))) {
    await updateDoc(doc(db, "tarjetas_visita", tarjeta.id!), {
      servicio: ubic.servicio,
      cama: ubic.cama,
      actualizadoEn: Timestamp.now(),
    }).catch(() => { /* permisos: dejar snapshot anterior */ });
    tarjeta.servicio = ubic.servicio;
    tarjeta.cama = ubic.cama;
  }
  return tarjeta;
}

type TabId = "hoy" | "activos" | "historial";

// ── Feedback (toasts de éxito / error) ────────────────────────────────────────

type Feedback = { id: number; tipo: "success" | "error"; mensaje: string };
const FeedbackCtx = createContext<(tipo: "success" | "error", mensaje: string) => void>(() => {});
const useFeedback = () => useContext(FeedbackCtx);

function FeedbackStack({ items, onDismiss }: { items: Feedback[]; onDismiss: (id: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[210] flex flex-col gap-2 items-center pointer-events-none">
      {items.map(f => <FeedbackToast key={f.id} f={f} onDismiss={() => onDismiss(f.id)} />)}
    </div>
  );
}

function FeedbackToast({ f, onDismiss }: { f: Feedback; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  const ok = f.tipo === "success";
  return (
    <div
      className={`pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-xl text-sm font-medium ${
        ok
          ? "bg-white dark:bg-slate-800 border-l-4 border-l-emerald-500 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
          : "bg-white dark:bg-slate-800 border-l-4 border-l-rose-500 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
      }`}
      style={{ animation: "notif-in 0.25s ease-out" }}
    >
      {ok ? <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" /> : <AlertTriangle size={16} className="text-rose-500 flex-shrink-0" />}
      <span>{f.mensaje}</span>
      <button onClick={onDismiss} className="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Cerrar"><X size={13} /></button>
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────

export default function VisitasPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<TabId>("activos");
  const [permissionError, setPermissionError] = useState(false);

  const [visitasHoy, setVisitasHoy] = useState<Visita[]>([]);
  const [hoyTexto, setHoyTexto] = useState("");
  const [hoyEstado, setHoyEstado] = useState<Visita["estado"] | "todos">("todos");
  const [tarjetas, setTarjetas] = useState<TarjetaVisita[]>([]);
  // Roster de pacientes activos (pestaña "Pacientes activos").
  const [pacientesActivos, setPacientesActivos] = useState<Paciente[]>([]);
  const [rosterTexto, setRosterTexto] = useState("");
  const [rosterServicio, setRosterServicio] = useState("todos");
  const [rosterSoloSinVisita, setRosterSoloSinVisita] = useState(false);
  const [rosterVisibles, setRosterVisibles] = useState(ROSTER_PAGINA);
  const [histFecha, setHistFecha] = useState(hoyStr());
  const [histTexto, setHistTexto] = useState("");
  const [histEstado, setHistEstado] = useState<Visita["estado"] | "todos">("todos");
  const [histVisitas, setHistVisitas] = useState<Visita[]>([]);

  // Modales
  const [picker, setPicker] = useState<{ tarjeta: TarjetaVisita; visitaProgramadaId?: string } | null>(null);
  const [detalle, setDetalle] = useState<Visita | null>(null);
  const [tarjetaSel, setTarjetaSel] = useState<TarjetaVisita | null>(null);
  const [carnet, setCarnet] = useState<TarjetaVisita | null>(null);
  // Paciente activo sin tarjeta para el que se va a crear su primera tarjeta (capturar titular).
  const [nuevaTarjetaPaciente, setNuevaTarjetaPaciente] = useState<Paciente | null>(null);

  // Feedback de éxito / error
  const feedbackId = useRef(0);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const notify = useCallback((tipo: "success" | "error", mensaje: string) => {
    const id = ++feedbackId.current;
    setFeedbacks(f => [...f, { id, tipo, mensaje }]);
  }, []);
  const dismiss = useCallback((id: number) => setFeedbacks(f => f.filter(x => x.id !== id)), []);

  const hoy = hoyStr();

  const handleSalida = async (v: Visita) => {
    if (!profile) return;
    try {
      await registrarSalida(v, { id: profile.uid, nombre: profile.nombre });
      notify("success", "Salida registrada");
    } catch {
      notify("error", "No se pudo registrar la salida");
    }
  };

  // Cierre automático de fin de día: cualquier visita "en_curso" que quedó abierta
  // de un día anterior se finaliza al 23:59 de su propia fecha. Barrido perezoso al cargar.
  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, "visitas"), where("estado", "==", "en_curso")));
      const ahora = hoyStr();
      await Promise.all(snap.docs.map(d => {
        const v = d.data() as Visita;
        if (!v.fecha || v.fecha >= ahora) return null;
        const [y, m, dd] = v.fecha.split("-").map(Number);
        const fin = new Date(y, (m ?? 1) - 1, dd ?? 1, 23, 59, 59);
        return updateDoc(doc(db, "visitas", d.id), {
          estado: "finalizada",
          salidaEn: Timestamp.fromDate(fin),
          cierreAutomatico: true,
          salidaPorNombre: "Sistema",
        });
      }).filter(Boolean));
    })().catch(() => { /* sin permisos o sin pendientes: ignorar */ });
  }, []);

  useEffect(() => {
    const q = query(collection(db, "visitas"), where("fecha", "==", hoy));
    return onSnapshot(
      q,
      s => {
        setPermissionError(false);
        const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as Visita));
        docs.sort((a, b) => (toDate(b.creadoEn)?.getTime() ?? 0) - (toDate(a.creadoEn)?.getTime() ?? 0));
        setVisitasHoy(docs);
      },
      err => { if (err.code === "permission-denied") setPermissionError(true); }
    );
  }, [hoy]);

  // Roster: todos los pacientes activos (fuente de verdad del listado diario) + sus tarjetas.
  useEffect(() => {
    if (tab !== "activos") return;
    const q = query(collection(db, "pacientes"), where("estado", "==", "activo"));
    return onSnapshot(q, s => {
      const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as Paciente));
      docs.sort((a, b) =>
        (a.servicioActual ?? "").localeCompare(b.servicioActual ?? "") ||
        (a.camaActual ?? "").localeCompare(b.camaActual ?? "") ||
        `${a.apellidos} ${a.nombres}`.localeCompare(`${b.apellidos} ${b.nombres}`)
      );
      setPacientesActivos(docs);
    });
  }, [tab]);

  useEffect(() => {
    if (tab !== "activos") return;
    const q = query(collection(db, "tarjetas_visita"), where("estado", "==", "activa"));
    return onSnapshot(q, s => setTarjetas(s.docs.map(d => ({ id: d.id, ...d.data() } as TarjetaVisita))));
  }, [tab]);

  useEffect(() => {
    if (tab !== "historial") return;
    // El filtro de estado se resuelve en el servidor. Combinar where("fecha")
    // con where("estado") exige un índice compuesto (visitas: fecha + estado);
    // si falta, Firestore lanza un error con el link para crearlo (ver consola).
    const constraints = [where("fecha", "==", histFecha)];
    if (histEstado !== "todos") constraints.push(where("estado", "==", histEstado));
    const q = query(collection(db, "visitas"), ...constraints);
    return onSnapshot(
      q,
      s => {
        const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as Visita));
        docs.sort((a, b) => (toDate(b.entradaEn ?? b.creadoEn)?.getTime() ?? 0) - (toDate(a.entradaEn ?? a.creadoEn)?.getTime() ?? 0));
        setHistVisitas(docs);
      },
      err => {
        if (err.code === "failed-precondition")
          notify("error", "Falta crear el índice de Firestore — abre la consola del navegador (F12) y usa el link del error.");
        else if (err.code === "permission-denied")
          setPermissionError(true);
      }
    );
  }, [tab, histFecha, histEstado, notify]);

  const programadas = visitasHoy.filter(v => v.estado === "programada");
  const enCurso     = visitasHoy.filter(v => v.estado === "en_curso");
  const finalizadas = visitasHoy.filter(v => v.estado === "finalizada");
  const canceladas  = visitasHoy.filter(v => v.estado === "cancelada");
  // "Efectivas" = visitas ya completadas (finalizadas). Las en curso van en su propio contador.
  const efectivas   = finalizadas.length;

  // Buscador rápido del tab Hoy (no afecta los contadores, que reflejan el día completo).
  const coincideHoy = useMemo(() => {
    const q = hoyTexto.trim().toLowerCase();
    return (v: Visita) => !q ||
      v.expediente?.toLowerCase().includes(q) ||
      v.pacienteNombre?.toLowerCase().includes(q) ||
      v.visitante?.nombre?.toLowerCase().includes(q) ||
      v.servicio?.toLowerCase().includes(q);
  }, [hoyTexto]);
  const enCursoHoy    = enCurso.filter(coincideHoy);
  const programadasHoy = programadas.filter(coincideHoy);
  const finalizadasHoy = finalizadas.filter(coincideHoy);
  const canceladasHoy  = canceladas.filter(coincideHoy);

  // Filtro por estado del tab Hoy (chips). "todos" muestra todas las secciones.
  const verHoy = (e: Visita["estado"]) => hoyEstado === "todos" || hoyEstado === e;
  const verEnCursoHoy    = verHoy("en_curso")  && enCursoHoy.length > 0;
  const verProgramadasHoy = hoyEstado === "todos" && programadasHoy.length > 0;
  const verFinalizadasHoy = verHoy("finalizada") && finalizadasHoy.length > 0;
  const verCanceladasHoy  = verHoy("cancelada")  && canceladasHoy.length > 0;
  const hayVisiblesHoy = verEnCursoHoy || verProgramadasHoy || verFinalizadasHoy || verCanceladasHoy;

  // Mapas para enriquecer cada paciente del roster: su tarjeta activa y su visita en curso de hoy.
  const tarjetaPorPaciente = new Map<string, TarjetaVisita>();
  for (const t of tarjetas) if (t.pacienteId) tarjetaPorPaciente.set(t.pacienteId, t);
  const enCursoPorPaciente = new Map<string, Visita>();
  for (const v of enCurso) if (v.pacienteId) enCursoPorPaciente.set(v.pacienteId, v);
  // Pacientes con visita EFECTIVA hoy (entró alguien: en curso o finalizada). Para el seguimiento
  // "sin visita hoy" — las canceladas no cuentan como visita recibida.
  const visitadosHoy = new Set<string>();
  for (const v of visitasHoy) if ((v.estado === "en_curso" || v.estado === "finalizada") && v.pacienteId) visitadosHoy.add(v.pacienteId);

  const rosterServicios = useMemo(
    () => Array.from(new Set(pacientesActivos.map(p => p.servicioActual).filter(Boolean))).sort(),
    [pacientesActivos]
  );

  // Cálculo plano (no useMemo): depende de `visitadosHoy`, un Set derivado que se recrea cada render.
  const rosterFiltrado = pacientesActivos.filter(p => {
    if (rosterServicio !== "todos" && p.servicioActual !== rosterServicio) return false;
    if (rosterSoloSinVisita && p.id && visitadosHoy.has(p.id)) return false;
    const t = rosterTexto.trim().toLowerCase();
    if (!t) return true;
    return (
      p.expediente?.toLowerCase().includes(t) ||
      `${p.apellidos} ${p.nombres}`.toLowerCase().includes(t) ||
      (p.camaActual ?? "").toLowerCase().includes(t) ||
      (p.servicioActual ?? "").toLowerCase().includes(t)
    );
  });

  // El estado ya se filtra en el servidor; aquí solo queda la búsqueda por texto.
  const histFiltradas = useMemo(() => {
    const t = histTexto.trim().toLowerCase();
    if (!t) return histVisitas;
    return histVisitas.filter(v =>
      v.expediente?.toLowerCase().includes(t) ||
      v.pacienteNombre?.toLowerCase().includes(t) ||
      v.servicio?.toLowerCase().includes(t) ||
      v.visitante?.nombre?.toLowerCase().includes(t)
    );
  }, [histVisitas, histTexto]);

  const rosterPagina = rosterFiltrado.slice(0, rosterVisibles);
  // La paginación se reinicia desde los handlers (búsqueda/filtro/cambio de tab) para
  // evitar setState dentro de un efecto.
  const setTabReset = (t: TabId) => { setTab(t); setRosterVisibles(ROSTER_PAGINA); };

  const abrirEntrada = async (v: Visita) => {
    const tarjeta = await cargarTarjeta(v.tarjetaId);
    if (tarjeta) { setDetalle(null); setPicker({ tarjeta, visitaProgramadaId: v.id }); }
  };

  // Abrir el detalle / carnet de una tarjeta refrescando su ubicación desde el paciente.
  const abrirTarjeta = async (t: TarjetaVisita) => setTarjetaSel((t.id ? await cargarTarjeta(t.id) : null) ?? t);
  const abrirCarnet  = async (t: TarjetaVisita) => setCarnet((t.id ? await cargarTarjeta(t.id) : null) ?? t);

  return (
    <FeedbackCtx.Provider value={notify}>
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-800">
            <DoorOpen size={17} className="text-blue-700 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Visitas de familiares</h1>
            <p className="text-xs text-slate-500 mt-0.5">Control de entradas y salidas de visitas</p>
          </div>
        </div>
      </div>

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer visitas. Pide al administrador que agregue <strong>trabajo_social</strong> a las reglas de Firestore.
        </div>
      )}

      {/* Tabs — control segmentado, sin scroll (envuelve en pantallas chicas) */}
      <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
        {([["activos", "Pacientes activos"], ["hoy", "Hoy"], ["historial", "Historial"]] as [TabId, string][]).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTabReset(val)}
            className={`flex-1 min-w-[78px] px-3 py-2 rounded-lg text-sm font-medium text-center transition-colors ${
              tab === val
                ? "bg-white dark:bg-slate-900 shadow-sm text-blue-800 dark:text-blue-300"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── HOY ── */}
      {tab === "hoy" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Contador label="Efectivas" valor={efectivas} color="text-emerald-600 dark:text-emerald-400" icon={CheckCircle2} />
            <Contador label="En curso" valor={enCurso.length} color="text-blue-700 dark:text-blue-400" icon={LogIn} />
            <Contador label="Canceladas" valor={canceladas.length} color="text-rose-600 dark:text-rose-400" icon={Ban} />
          </div>

          {visitasHoy.length > 0 && (
            <>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={hoyTexto} onChange={e => setHoyTexto(e.target.value)}
                  placeholder="Buscar en las visitas de hoy por paciente, expediente, visitante o servicio…"
                  className={inputCls + " pl-9"} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {([
                  ["todos", "Todas"],
                  ["en_curso", "En curso"],
                  ["finalizada", "Finalizadas"],
                  ["cancelada", "Canceladas"],
                ] as const).map(([val, label]) => {
                  const activo = hoyEstado === val;
                  return (
                    <button
                      key={val}
                      onClick={() => setHoyEstado(val)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        activo
                          ? "bg-amber-500 border-amber-500 text-white"
                          : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400 dark:hover:border-amber-700"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {visitasHoy.length === 0 && !permissionError ? (
            <EmptyState texto="No hay visitas registradas hoy." sub="Registra una entrada desde “Pacientes activos”." />
          ) : !hayVisiblesHoy ? (
            <p className="text-sm text-slate-400 py-10 text-center">Ninguna visita de hoy coincide con el filtro.</p>
          ) : (
            <div className="space-y-6">
              {verEnCursoHoy && (
                <Seccion titulo="En curso">
                  <Grid>{enCursoHoy.map(v => <VisitaCard key={v.id} v={v} onClick={() => setDetalle(v)} onSalida={() => handleSalida(v)} />)}</Grid>
                </Seccion>
              )}
              {verProgramadasHoy && (
                <Seccion titulo="Programadas · por ingresar">
                  <Grid>{programadasHoy.map(v => <VisitaCard key={v.id} v={v} onClick={() => setDetalle(v)} onEntrada={() => abrirEntrada(v)} />)}</Grid>
                </Seccion>
              )}
              {verFinalizadasHoy && (
                <Seccion titulo="Finalizadas">
                  <Grid>{finalizadasHoy.map(v => <VisitaCard key={v.id} v={v} onClick={() => setDetalle(v)} />)}</Grid>
                </Seccion>
              )}
              {verCanceladasHoy && (
                <Seccion titulo="Canceladas">
                  <Grid>{canceladasHoy.map(v => <VisitaCard key={v.id} v={v} onClick={() => setDetalle(v)} />)}</Grid>
                </Seccion>
              )}
            </div>
          )}
        </>
      )}

      {/* ── PACIENTES ACTIVOS (roster diario) ── */}
      {tab === "activos" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={rosterTexto} onChange={e => { setRosterTexto(e.target.value); setRosterVisibles(ROSTER_PAGINA); }}
                placeholder="Buscar por paciente, expediente, cama o servicio…"
                className={inputCls + " pl-9"} />
            </div>
            <select value={rosterServicio} onChange={e => { setRosterServicio(e.target.value); setRosterVisibles(ROSTER_PAGINA); }} className={selectCls + " max-w-[220px]"}>
              <option value="todos">Todos los servicios</option>
              {rosterServicios.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              onClick={() => { setRosterSoloSinVisita(v => !v); setRosterVisibles(ROSTER_PAGINA); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                rosterSoloSinVisita
                  ? "bg-amber-500 border-amber-500 text-white"
                  : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400 dark:hover:border-amber-700"
              }`}
            >
              Solo sin visita hoy
            </button>
            <span className="text-sm text-slate-500">{rosterFiltrado.length} paciente(s)</span>
          </div>

          {pacientesActivos.length === 0 ? (
            <EmptyState texto="No hay pacientes activos." sub="Cada paciente internado aparece aquí automáticamente mientras esté activo." />
          ) : rosterFiltrado.length === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center">Ningún paciente activo coincide con la búsqueda.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {rosterPagina.map(p => (
                  <PacienteRosterCard
                    key={p.id}
                    paciente={p}
                    tarjeta={p.id ? tarjetaPorPaciente.get(p.id) : undefined}
                    visitaEnCurso={p.id ? enCursoPorPaciente.get(p.id) : undefined}
                    visitoHoy={p.id ? visitadosHoy.has(p.id) : false}
                    onEntrada={() => {
                      const tj = p.id ? tarjetaPorPaciente.get(p.id) : undefined;
                      if (tj) setPicker({ tarjeta: tj });
                      else setNuevaTarjetaPaciente(p);
                    }}
                    onSalida={handleSalida}
                    onListaBlanca={abrirTarjeta}
                    onCarnet={abrirCarnet}
                  />
                ))}
              </div>
              {rosterFiltrado.length > rosterVisibles && (
                <div className="flex flex-col items-center gap-1.5 pt-2">
                  <button
                    onClick={() => setRosterVisibles(n => n + ROSTER_PAGINA)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900 transition"
                  >
                    Cargar más
                  </button>
                  <span className="text-xs text-slate-400">
                    Mostrando {rosterPagina.length} de {rosterFiltrado.length}
                  </span>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── HISTORIAL ── */}
      {tab === "historial" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <CalendarDays size={15} />
              <DateField value={histFecha} onChange={v => setHistFecha(v)}
                placeholder="Fecha" ariaLabel="Filtrar visitas por fecha" />
            </label>
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={histTexto} onChange={e => setHistTexto(e.target.value)}
                placeholder="Filtrar por expediente, paciente, servicio o visitante…"
                className={inputCls + " pl-9"} />
            </div>
            <span className="text-sm text-slate-500">{histFiltradas.length} registros</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {([
              ["todos", "Todos"],
              ["programada", "Programada"],
              ["en_curso", "En curso"],
              ["finalizada", "Finalizada"],
              ["cancelada", "Cancelada"],
            ] as const).map(([val, label]) => {
              const activo = histEstado === val;
              return (
                <button
                  key={val}
                  onClick={() => setHistEstado(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    activo
                      ? "bg-amber-500 border-amber-500 text-white"
                      : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400 dark:hover:border-amber-700"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {histFiltradas.length === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center">Sin visitas para este día / filtro.</p>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                      {["Paciente", "Visitante", "Entrada", "Salida", "Estado", ""].map((h, i) => (
                        <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {histFiltradas.map(v => (
                      <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs text-slate-500">{v.expediente}</p>
                          <p className="font-medium text-slate-800 dark:text-slate-200">{v.pacienteNombre}</p>
                          <p className="text-xs text-slate-500">{v.servicio} · Cama {v.cama || "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-800 dark:text-slate-200 flex items-center gap-1">
                            {v.esTitular && <User size={12} className="text-amber-500 fill-amber-500" />}
                            {v.visitante?.nombre ?? "—"}
                          </p>
                          <p className="text-xs text-slate-500">{v.visitante?.parentesco}{v.visitante?.dui ? ` · ${v.visitante.dui}` : ""}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                          {v.entradaEn ? fmtHora(v.entradaEn) : "—"}
                          {(v.entradaPorNombre ?? (v.entradaEn ? v.registradoPorNombre : "")) && (
                            <p className="text-xs text-slate-400">por {v.entradaPorNombre ?? v.registradoPorNombre}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                          {v.salidaEn ? fmtHora(v.salidaEn) : "—"}
                          {v.salidaPorNombre && <p className="text-xs text-slate-400">por {v.salidaPorNombre}</p>}
                        </td>
                        <td className="px-4 py-3"><EstadoBadge estado={v.estado} /></td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => setDetalle(v)} className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-amber-500">Detalle</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {nuevaTarjetaPaciente && profile && (
        <PrimeraVisitaModal
          paciente={nuevaTarjetaPaciente}
          onClose={() => setNuevaTarjetaPaciente(null)}
        />
      )}

      {picker && profile && (
        <ElegirVisitanteModal
          tarjeta={picker.tarjeta}
          visitaProgramadaId={picker.visitaProgramadaId}
          onClose={() => setPicker(null)}
        />
      )}

      {detalle && (
        <DetalleVisitaModal
          visita={detalle}
          onClose={() => setDetalle(null)}
          onRegistrarEntrada={() => abrirEntrada(detalle)}
        />
      )}

      {carnet && (
        <TarjetaCarnetModal
          tarjeta={carnet}
          onClose={() => setCarnet(null)}
        />
      )}

      {tarjetaSel && (
        <TarjetaDetalleModal
          tarjeta={tarjetaSel}
          onClose={() => setTarjetaSel(null)}
        />
      )}

      <FeedbackStack items={feedbacks} onDismiss={dismiss} />
    </div>
    </FeedbackCtx.Provider>
  );
}

// ── Acciones sueltas ──────────────────────────────────────────────────────────

async function registrarSalida(v: Visita, por: { id: string; nombre: string }) {
  if (!v.id) return;
  await updateDoc(doc(db, "visitas", v.id), {
    salidaEn: Timestamp.now(),
    estado: "finalizada",
    salidaPorId: por.id,
    salidaPorNombre: por.nombre,
  });
}

// Crea una visita en curso (entrada espontánea) para un visitante ya elegido. Graba la
// ubicación VIGENTE del paciente y quién hizo la entrada. `visitante` debe venir limpio.
async function crearVisitaEntrada(tarjeta: TarjetaVisita, visitante: VisitanteInfo, por: { id: string; nombre: string }) {
  const ubic = await ubicacionPaciente(tarjeta.pacienteId);
  await addDoc(collection(db, "visitas"), {
    fecha: hoyStr(),
    tarjetaId: tarjeta.id,
    pacienteId: tarjeta.pacienteId,
    expediente: tarjeta.expediente,
    pacienteNombre: tarjeta.pacienteNombre,
    servicio: ubic?.servicio ?? tarjeta.servicio,
    cama: ubic?.cama ?? tarjeta.cama ?? "",
    programada: false,
    visitante,
    esTitular: claveVisitante(visitante) === claveVisitante(tarjeta.titular),
    estado: "en_curso",
    entradaEn: Timestamp.now(),
    entradaPorId: por.id,
    entradaPorNombre: por.nombre,
    registradoPorId: por.id,
    registradoPorNombre: por.nombre,
    creadoEn: Timestamp.now(),
  });
}

// ── Subcomponentes de presentación ─────────────────────────────────────────────

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{children}</div>;
}

function EmptyState({ texto, sub }: { texto: string; sub?: string }) {
  return (
    <div className="text-center py-16 text-slate-400">
      <DoorOpen size={32} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm">{texto}</p>
      {sub && <p className="text-xs mt-1">{sub}</p>}
    </div>
  );
}

function Contador({ label, valor, color, icon: Icon }: { label: string; valor: number; color: string; icon: React.ElementType }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <Icon size={16} className="text-slate-400" />
        <span className={`text-2xl font-bold font-heading ${color}`}>{valor}</span>
      </div>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest first-letter:uppercase">{titulo}</p>
      {children}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: Visita["estado"] }) {
  const cfg = {
    programada: { t: "Programada", c: "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" },
    en_curso:   { t: "En curso",   c: "text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-800" },
    finalizada: { t: "Finalizada", c: "text-slate-500 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700" },
    cancelada:  { t: "Cancelada",  c: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-900" },
  }[estado];
  return <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-1 rounded-lg border ${cfg.c}`}>{cfg.t}</span>;
}

function VisitaCard({ v, onClick, onEntrada, onSalida }: {
  v: Visita; onClick: () => void; onEntrada?: () => void; onSalida?: () => void;
}) {
  return (
    <div onClick={onClick}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-start justify-between gap-3 cursor-pointer hover:border-amber-400 dark:hover:border-amber-700 transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">{v.expediente}</p>
          <EstadoBadge estado={v.estado} />
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5 truncate">{v.pacienteNombre}</p>
        <p className="text-xs text-slate-500 mt-0.5">{v.servicio} · Cama {v.cama || "—"}</p>
        {v.visitante && (
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 flex items-center gap-1 flex-wrap">
            {v.esTitular && <User size={12} className="text-amber-500 fill-amber-500" />}
            <span className="font-medium">{v.visitante.nombre}</span>
            <span className="text-slate-400">· {v.visitante.parentesco}</span>
            {v.entradaEn && <span className="text-slate-400">· entró {fmtHora(v.entradaEn)}</span>}
            {v.salidaEn && <span className="text-slate-400">· salió {fmtHora(v.salidaEn)}</span>}
          </p>
        )}
        {v.comentarios && (
          <p className="text-xs text-slate-500 mt-1.5 flex items-start gap-1">
            <MessageSquare size={12} className="mt-0.5 flex-shrink-0" /> <span className="line-clamp-1">{v.comentarios}</span>
          </p>
        )}
      </div>
      <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
        {onEntrada && (
          <button onClick={onEntrada}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-lg transition-colors">
            <LogIn size={14} /> Entrada
          </button>
        )}
        {onSalida && (
          <button onClick={onSalida}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 rounded-lg transition-colors">
            <LogOut size={14} /> Salida
          </button>
        )}
      </div>
    </div>
  );
}

// ── Select de parentesco ────────────────────────────────────────────────────

function ParentescoSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={selectCls}>
      <option value="">— Parentesco</option>
      {PARENTESCOS.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  );
}

// ── Card: paciente activo en el roster diario ─────────────────────────────────

function PacienteRosterCard({ paciente, tarjeta, visitaEnCurso, visitoHoy, onEntrada, onSalida, onListaBlanca, onCarnet }: {
  paciente: Paciente;
  tarjeta?: TarjetaVisita;
  visitaEnCurso?: Visita;
  visitoHoy: boolean;
  onEntrada: () => void;
  onSalida: (v: Visita) => void;
  onListaBlanca: (t: TarjetaVisita) => void;
  onCarnet: (t: TarjetaVisita) => void;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs text-slate-500">{paciente.expediente}</p>
          <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{paciente.apellidos}, {paciente.nombres}</p>
          <p className="text-xs text-slate-500">{paciente.servicioActual} · Cama {paciente.camaActual || "—"}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {visitaEnCurso ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-800"><LogIn size={11} /> En curso</span>
          ) : tarjeta ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><IdCard size={11} /> Con tarjeta</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900">Sin tarjeta</span>
          )}
          {!visitaEnCurso && (
            visitoHoy ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={10} /> Visitó hoy</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-500 dark:text-rose-400">Sin visita hoy</span>
            )
          )}
        </div>
      </div>

      {visitaEnCurso?.visitante && (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <User size={12} className="text-amber-500" /> {visitaEnCurso.visitante.nombre} · {visitaEnCurso.visitante.parentesco}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-auto">
        {visitaEnCurso ? (
          <button onClick={() => onSalida(visitaEnCurso)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <LogOut size={14} /> Salida
          </button>
        ) : (
          <button onClick={onEntrada}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-lg transition-colors">
            <LogIn size={14} /> Registrar entrada
          </button>
        )}
        {tarjeta && (
          <>
            <button onClick={() => onListaBlanca(tarjeta)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <User size={14} /> Lista blanca
            </button>
            <button onClick={() => onCarnet(tarjeta)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <CreditCard size={14} /> Carnet
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Modal: Primera visita (crea la tarjeta + titular para un paciente sin tarjeta) ──

function PrimeraVisitaModal({ paciente, onClose }: {
  paciente: Paciente;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const notify = useFeedback();
  // Pre-llenar el titular desde el responsable que ESDOMED ya capturó en el paciente.
  const prefillResponsable = useMemo<VisitanteInfo | null>(() => {
    const r = paciente.responsable;
    if (!r?.nombre) return null;
    const parentesco = PARENTESCOS.find(p => p.toLowerCase() === (r.parentesco ?? "").trim().toLowerCase()) ?? "";
    return { nombre: r.nombre.toUpperCase(), parentesco, dui: r.documento ?? "", telefono: r.telefono ?? "" };
  }, [paciente.responsable]);
  const [titular, setTitular] = useState<VisitanteInfo>(prefillResponsable ?? { nombre: "", parentesco: "", dui: "", telefono: "" });
  // Cuántas tarjetas existen ya para este expediente (reingresos), para numerar el código.
  const [previasCount, setPreviasCount] = useState(0);
  const [tarjetaExistente, setTarjetaExistente] = useState<TarjetaVisita | null>(null);
  const [verificando, setVerificando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Detectar si ya hay una tarjeta activa (carrera con el roster) y contar previas del
  // expediente. Solo depende del paciente — no dispara navegación.
  useEffect(() => {
    let cancel = false;
    (async () => {
      const snap = await getDocs(query(collection(db, "tarjetas_visita"), where("expediente", "==", paciente.expediente)));
      if (cancel) return;
      const todas = snap.docs.map(d => ({ id: d.id, ...d.data() } as TarjetaVisita));
      setTarjetaExistente(todas.find(t => t.pacienteId === paciente.id && t.estado === "activa") ?? null);
      setPreviasCount(todas.length);
      setVerificando(false);
    })();
    return () => { cancel = true; };
  }, [paciente]);

  // Crea (o reutiliza) la tarjeta y registra DE UNA la entrada del responsable capturado;
  // luego cierra. No abre el picker: el responsable que se acaba de capturar es quien entra.
  const crear = async () => {
    if (!paciente.id || !profile) return;
    if (!titular.nombre.trim() || !titular.parentesco.trim()) { notify("error", "Faltan datos del titular"); return; }
    setGuardando(true);
    try {
      const limpio = limpiarVisitante(titular);
      let tarjeta: TarjetaVisita;
      if (tarjetaExistente?.id) {
        // Caso raro: ya existía tarjeta activa. Reutilizarla y sumar al visitante a la lista blanca.
        tarjeta = tarjetaExistente;
        const yaEsta = tarjeta.listaBlanca.some(v => claveVisitante(v) === claveVisitante(limpio));
        if (!yaEsta) {
          await updateDoc(doc(db, "tarjetas_visita", tarjetaExistente.id), {
            listaBlanca: [...tarjeta.listaBlanca, limpio], actualizadoEn: Timestamp.now(),
          });
        }
      } else {
        const nombreCompleto = `${paciente.apellidos}, ${paciente.nombres}`;
        const codigo = codigoTarjeta(paciente.expediente, paciente.nombres, paciente.apellidos, previasCount + 1);
        const ref = await addDoc(collection(db, "tarjetas_visita"), {
          codigo, pacienteId: paciente.id, expediente: paciente.expediente, pacienteNombre: nombreCompleto,
          servicio: paciente.servicioActual, cama: paciente.camaActual ?? "",
          titular: limpio, listaBlanca: [limpio], estado: "activa",
          creadoEn: Timestamp.now(), creadoPor: profile.uid, creadoPorNombre: profile.nombre,
        });
        tarjeta = {
          id: ref.id, codigo, pacienteId: paciente.id, expediente: paciente.expediente, pacienteNombre: nombreCompleto,
          servicio: paciente.servicioActual, cama: paciente.camaActual ?? "", titular: limpio,
          listaBlanca: [limpio], estado: "activa", creadoEn: new Date(),
          creadoPor: profile.uid, creadoPorNombre: profile.nombre,
        };
      }
      await crearVisitaEntrada(tarjeta, limpio, { id: profile.uid, nombre: profile.nombre });
      notify("success", `Entrada registrada · ${limpio.nombre}`);
      onClose();
    } catch {
      notify("error", "No se pudo registrar la entrada");
      setGuardando(false);
    }
  };

  const valido = titular.nombre.trim() && titular.parentesco.trim();

  return (
    <ModalShell onClose={onClose} titulo="Primera visita" icon={UserPlus} ancho="max-w-lg">
      <div className="space-y-4">
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
          <p className="font-medium text-slate-800 dark:text-slate-200">{paciente.apellidos}, {paciente.nombres}</p>
          <p className="text-xs text-slate-500">Exp. {paciente.expediente} · {paciente.servicioActual} · Cama {paciente.camaActual || "—"}</p>
        </div>

        {verificando ? (
          <p className="text-sm text-slate-400 py-6 text-center">Verificando tarjeta…</p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {tarjetaExistente ? "Responsable que ingresa" : "Titular (responsable principal)"}
              </p>
              <p className="text-[11px] text-slate-400">
                {tarjetaExistente
                  ? `Ya existe la tarjeta ${tarjetaExistente.codigo} · se registrará la entrada`
                  : `Se creará la tarjeta ${codigoTarjeta(paciente.expediente, paciente.nombres, paciente.apellidos, previasCount + 1)}${previasCount > 0 ? ` · internamiento #${previasCount + 1} de este expediente` : ""}`}
              </p>
              {prefillResponsable && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Pre-cargado del responsable registrado por ESDOMED · verificá los datos
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Nombre completo *" value={titular.nombre}
                  onChange={e => setTitular({ ...titular, nombre: e.target.value.toUpperCase() })} />
                <ParentescoSelect value={titular.parentesco} onChange={p => setTitular({ ...titular, parentesco: p })} />
                <input className={inputCls} placeholder="DUI / documento" value={titular.dui}
                  onChange={e => setTitular({ ...titular, dui: e.target.value })} />
                <input className={inputCls} placeholder="Teléfono" value={titular.telefono}
                  onChange={e => setTitular({ ...titular, telefono: e.target.value })} />
              </div>
            </div>
            <button onClick={crear} disabled={guardando || !valido}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors">
              <LogIn size={16} /> {guardando ? "Registrando…" : "Crear tarjeta y registrar entrada"}
            </button>
          </>
        )}
      </div>
    </ModalShell>
  );
}

// ── Modal: Elegir visitante (roster + nuevo con búsqueda por DUI) ─────────────

function ElegirVisitanteModal({ tarjeta, visitaProgramadaId, onClose }: {
  tarjeta: TarjetaVisita; visitaProgramadaId?: string; onClose: () => void;
}) {
  const { profile } = useAuth();
  const notify = useFeedback();
  const [guardando, setGuardando] = useState(false);
  const [modoNuevo, setModoNuevo] = useState(false);
  const [nuevo, setNuevo] = useState<VisitanteInfo>({ nombre: "", parentesco: "", dui: "", telefono: "" });
  const [buscandoDui, setBuscandoDui] = useState(false);

  const esTitular = (v: VisitanteInfo) => claveVisitante(v) === claveVisitante(tarjeta.titular);

  const buscarPorDui = async (dui: string) => {
    const d = dui.trim();
    if (!d) return;
    setBuscandoDui(true);
    try {
      const snap = await getDocs(query(collection(db, "visitas"), where("visitante.dui", "==", d)));
      const docs = snap.docs.map(x => x.data() as Visita).filter(x => x.visitante);
      docs.sort((a, b) => (toDate(b.creadoEn)?.getTime() ?? 0) - (toDate(a.creadoEn)?.getTime() ?? 0));
      const prev = docs[0]?.visitante;
      if (prev) setNuevo(n => ({ ...n, nombre: prev.nombre, parentesco: prev.parentesco, dui: d, telefono: prev.telefono ?? n.telefono }));
    } finally {
      setBuscandoDui(false);
    }
  };

  const registrarEntrada = async (visitante: VisitanteInfo, agregarALista: boolean) => {
    if (!profile) return;
    setGuardando(true);
    const limpio = limpiarVisitante(visitante);
    try {
      if (agregarALista && tarjeta.id) {
        const yaEsta = tarjeta.listaBlanca.some(v => claveVisitante(v) === claveVisitante(limpio));
        if (!yaEsta) {
          await updateDoc(doc(db, "tarjetas_visita", tarjeta.id), {
            listaBlanca: [...tarjeta.listaBlanca, limpio],
            actualizadoEn: Timestamp.now(),
          });
        }
      }

      if (visitaProgramadaId) {
        // Convierte una visita programada en "en curso" con la ubicación vigente del paciente.
        const ubic = await ubicacionPaciente(tarjeta.pacienteId);
        await updateDoc(doc(db, "visitas", visitaProgramadaId), {
          visitante: limpio, esTitular: esTitular(limpio), estado: "en_curso",
          entradaEn: Timestamp.now(), entradaPorId: profile.uid, entradaPorNombre: profile.nombre,
          servicio: ubic?.servicio ?? tarjeta.servicio, cama: ubic?.cama ?? tarjeta.cama ?? "",
        });
      } else {
        await crearVisitaEntrada(tarjeta, limpio, { id: profile.uid, nombre: profile.nombre });
      }
      notify("success", `Entrada registrada · ${limpio.nombre}`);
      onClose();
    } catch {
      notify("error", "No se pudo registrar la entrada");
      setGuardando(false);
    }
  };

  const nuevoValido = nuevo.nombre.trim() && nuevo.parentesco.trim();

  return (
    <ModalShell onClose={onClose} titulo={`Entrada · ${tarjeta.pacienteNombre}`} icon={DoorOpen} ancho="max-w-lg">
      <p className="text-xs text-slate-500 -mt-2 mb-3">Tarjeta {tarjeta.codigo} · {tarjeta.servicio} · Cama {tarjeta.cama || "—"}</p>

      {!modoNuevo ? (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">¿Quién está usando la tarjeta?</p>
          {tarjeta.listaBlanca.map((v, i) => (
            <button key={i} onClick={() => registrarEntrada(v, false)} disabled={guardando}
              className="w-full text-left px-3.5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all disabled:opacity-50">
              <span className="flex items-center gap-2">
                {esTitular(v) && <User size={14} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
                <span className="font-medium text-slate-800 dark:text-slate-200">{v.nombre}</span>
                <span className="text-xs text-slate-500">· {v.parentesco}{esTitular(v) ? " · titular" : ""}</span>
              </span>
              {v.dui && <span className="block text-xs text-slate-400 mt-0.5 ml-6">{v.dui}</span>}
            </button>
          ))}
          <button onClick={() => setModoNuevo(true)}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:border-amber-400 hover:text-amber-700 dark:hover:text-amber-400 transition-all">
            <UserPlus size={16} /> Registrar otro familiar
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <button onClick={() => setModoNuevo(false)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            <ArrowLeft size={14} /> Volver a la lista
          </button>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Registrar nuevo familiar</p>
          <div className="relative">
            <input className={inputCls} placeholder="DUI / documento (autollena si ya visitó antes)"
              value={nuevo.dui} onChange={e => setNuevo({ ...nuevo, dui: e.target.value })}
              onBlur={e => buscarPorDui(e.target.value)} />
            {buscandoDui && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">buscando…</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Nombre completo *" value={nuevo.nombre}
              onChange={e => setNuevo({ ...nuevo, nombre: e.target.value.toUpperCase() })} />
            <ParentescoSelect value={nuevo.parentesco} onChange={p => setNuevo({ ...nuevo, parentesco: p })} />
            <input className={inputCls + " sm:col-span-2"} placeholder="Teléfono" value={nuevo.telefono}
              onChange={e => setNuevo({ ...nuevo, telefono: e.target.value })} />
          </div>
          <button onClick={() => registrarEntrada(nuevo, true)} disabled={guardando || !nuevoValido}
            className="w-full py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors">
            {guardando ? "Registrando…" : "Registrar entrada"}
          </button>
        </div>
      )}
    </ModalShell>
  );
}

// ── Modal: Detalle de visita (+ comentarios) ──────────────────────────────────

function DetalleVisitaModal({ visita, onClose, onRegistrarEntrada }: {
  visita: Visita; onClose: () => void; onRegistrarEntrada: () => void;
}) {
  const notify = useFeedback();
  const { profile } = useAuth();
  const [comentarios, setComentarios] = useState(visita.comentarios ?? "");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const guardarComentario = async () => {
    if (!visita.id) return;
    setGuardando(true);
    try {
      await updateDoc(doc(db, "visitas", visita.id), { comentarios: comentarios.trim() });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
      notify("success", "Comentario guardado");
    } catch {
      notify("error", "No se pudo guardar el comentario");
    } finally {
      setGuardando(false);
    }
  };

  const salida = async () => {
    if (!profile) return;
    try { await registrarSalida(visita, { id: profile.uid, nombre: profile.nombre }); notify("success", "Salida registrada"); onClose(); }
    catch { notify("error", "No se pudo registrar la salida"); }
  };
  const cancelar = async () => {
    if (!visita.id) return;
    try {
      await updateDoc(doc(db, "visitas", visita.id), { estado: "cancelada" });
      notify("success", "Visita cancelada");
      onClose();
    } catch {
      notify("error", "No se pudo cancelar la visita");
    }
  };

  const esHoy = visita.fecha === hoyStr();

  if (confirmCancel) {
    return (
      <ModalShell onClose={() => setConfirmCancel(false)} titulo="Cancelar Visita" icon={AlertTriangle} ancho="max-w-sm">
        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            ¿Estás seguro que deseas cancelar esta visita programada?
          </p>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setConfirmCancel(false)} className="flex-1 py-2 text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">
              No, volver
            </button>
            <button onClick={cancelar} className="flex-1 py-2 text-sm font-semibold rounded-xl text-white bg-rose-600 hover:bg-rose-500 transition-colors">
              Sí, cancelar
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} titulo={`Visita · ${visita.expediente}`} icon={DoorOpen} ancho="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <EstadoBadge estado={visita.estado} />
          <div className="flex items-center gap-3">
             <span className="text-xs text-slate-500 flex items-center gap-1"><CalendarDays size={13} /> {fmtFechaStr(visita.fecha)}</span>
             {visita.estado === "programada" && (
                <button onClick={() => setConfirmCancel(true)} className="text-xs font-semibold text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 transition-colors bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2.5 py-1 rounded-md" title="Cancelar visita">
                  <Ban size={12} /> Cancelar
                </button>
             )}
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800 space-y-2.5">
          <Info label="Paciente" value={visita.pacienteNombre} />
          <Info label="Ubicación" value={`${visita.servicio} · Cama ${visita.cama || "—"}`} />
          {visita.visitante && (
            <Info label="Visitante" value={`${visita.visitante.nombre} · ${visita.visitante.parentesco}${visita.esTitular ? " (titular)" : ""}`} />
          )}
          {visita.visitante?.dui && <Info label="Documento" value={visita.visitante.dui} />}
          {visita.visitante?.telefono && <Info label="Teléfono" value={visita.visitante.telefono} />}
          {visita.entradaEn && <Info label="Entrada" value={fmtHora(visita.entradaEn) + (visita.entradaPorNombre ? ` · por ${visita.entradaPorNombre}` : "")} />}
          {visita.salidaEn && <Info label="Salida" value={fmtHora(visita.salidaEn) + (visita.cierreAutomatico ? " (cierre automático)" : "") + (visita.salidaPorNombre ? ` · por ${visita.salidaPorNombre}` : "")} />}
          {!visita.entradaPorNombre && <Info label="Registró" value={visita.registradoPorNombre} />}
        </div>

        {/* Comentarios */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            <MessageSquare size={13} /> Comentarios
          </label>
          <textarea value={comentarios} onChange={e => setComentarios(e.target.value)} rows={3}
            placeholder="Agregar notas sobre la visita…" className={inputCls + " resize-none"} />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={guardarComentario} disabled={guardando || comentarios.trim() === (visita.comentarios ?? "").trim()}
              className="px-3 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors">
              {guardando ? "Guardando…" : "Guardar comentario"}
            </button>
            {guardado && <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle2 size={13} /> Guardado</span>}
          </div>
        </div>

        {/* Acciones según estado */}
        {(visita.estado === "programada" && esHoy || visita.estado === "en_curso") && (
          <div className="flex flex-col sm:flex-row gap-2 border-t border-slate-200 dark:border-slate-800 mt-1 pt-4">
            {visita.estado === "programada" && esHoy && (
              <button onClick={onRegistrarEntrada}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-xl transition-colors">
                <LogIn size={16} /> Registrar entrada
              </button>
            )}
            {visita.estado === "en_curso" && (
              <button onClick={salida}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 rounded-xl transition-colors">
                <LogOut size={16} /> Registrar salida
              </button>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 dark:text-slate-200 font-medium text-right">{value}</span>
    </div>
  );
}

// ── Modal: Detalle de tarjeta (+ gestión de lista blanca) ─────────────────────

function TarjetaDetalleModal({ tarjeta, onClose }: { tarjeta: TarjetaVisita; onClose: () => void }) {
  const notify = useFeedback();
  const [lista, setLista] = useState<VisitanteInfo[]>(tarjeta.listaBlanca);
  const [modoNuevo, setModoNuevo] = useState(false);
  const [nuevo, setNuevo] = useState<VisitanteInfo>({ nombre: "", parentesco: "", dui: "", telefono: "" });
  const [guardando, setGuardando] = useState(false);
  const [buscandoDui, setBuscandoDui] = useState(false);

  const esTitular = (v: VisitanteInfo) => claveVisitante(v) === claveVisitante(tarjeta.titular);

  const buscarPorDui = async (dui: string) => {
    const d = dui.trim();
    if (!d) return;
    setBuscandoDui(true);
    try {
      const snap = await getDocs(query(collection(db, "visitas"), where("visitante.dui", "==", d)));
      const docs = snap.docs.map(x => x.data() as Visita).filter(x => x.visitante);
      docs.sort((a, b) => (toDate(b.creadoEn)?.getTime() ?? 0) - (toDate(a.creadoEn)?.getTime() ?? 0));
      const prev = docs[0]?.visitante;
      if (prev) setNuevo(n => ({ ...n, nombre: prev.nombre, parentesco: prev.parentesco, dui: d, telefono: prev.telefono ?? n.telefono }));
    } finally {
      setBuscandoDui(false);
    }
  };

  const persistir = async (nueva: VisitanteInfo[]) => {
    if (!tarjeta.id) return false;
    setGuardando(true);
    try {
      await updateDoc(doc(db, "tarjetas_visita", tarjeta.id), { listaBlanca: nueva, actualizadoEn: Timestamp.now() });
      setLista(nueva);
      return true;
    } catch {
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const agregar = async () => {
    const limpio = limpiarVisitante(nuevo);
    if (!limpio.nombre || !limpio.parentesco) return;
    if (lista.some(v => claveVisitante(v) === claveVisitante(limpio))) {
      notify("error", "Esa persona ya está en la lista");
      setModoNuevo(false);
      return;
    }
    const ok = await persistir([...lista, limpio]);
    if (ok) {
      notify("success", `${limpio.nombre} agregada a la lista`);
      setNuevo({ nombre: "", parentesco: "", dui: "", telefono: "" });
      setModoNuevo(false);
    } else {
      notify("error", "No se pudo agregar");
    }
  };

  const quitar = async (v: VisitanteInfo) => {
    if (esTitular(v)) return;
    const ok = await persistir(lista.filter(x => claveVisitante(x) !== claveVisitante(v)));
    notify(ok ? "success" : "error", ok ? "Persona quitada de la lista" : "No se pudo quitar");
  };

  const nuevoValido = nuevo.nombre.trim() && nuevo.parentesco.trim();

  return (
    <ModalShell onClose={onClose} titulo={`Tarjeta ${tarjeta.codigo}`} icon={CreditCard} ancho="max-w-lg">
      <div className="space-y-4">
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{tarjeta.pacienteNombre}</p>
          <p className="text-xs text-slate-500 mt-0.5">Exp. {tarjeta.expediente} · {tarjeta.servicio} · Cama {tarjeta.cama || "—"}</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lista blanca · {lista.length}</p>
            {!modoNuevo && (
              <button onClick={() => setModoNuevo(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800 dark:text-blue-300 hover:text-amber-500 transition-colors">
                <Plus size={14} /> Agregar persona
              </button>
            )}
          </div>

          <div className="space-y-2">
            {lista.map((v, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">
                    {esTitular(v) && <User size={13} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
                    <span className="truncate">{v.nombre}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {v.parentesco}{esTitular(v) ? " · titular" : ""}{v.dui ? ` · ${v.dui}` : ""}{v.telefono ? ` · ${v.telefono}` : ""}
                  </p>
                </div>
                {!esTitular(v) && (
                  <button onClick={() => quitar(v)} disabled={guardando}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors flex-shrink-0"
                    aria-label="Quitar de la lista blanca">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {modoNuevo && (
          <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nueva persona autorizada</p>
            <div className="relative">
              <input className={inputCls} placeholder="DUI / documento (autollena si ya visitó antes)"
                value={nuevo.dui} onChange={e => setNuevo({ ...nuevo, dui: e.target.value })}
                onBlur={e => buscarPorDui(e.target.value)} />
              {buscandoDui && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">buscando…</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input className={inputCls} placeholder="Nombre completo *" value={nuevo.nombre}
                onChange={e => setNuevo({ ...nuevo, nombre: e.target.value.toUpperCase() })} />
              <ParentescoSelect value={nuevo.parentesco} onChange={p => setNuevo({ ...nuevo, parentesco: p })} />
              <input className={inputCls + " sm:col-span-2"} placeholder="Teléfono" value={nuevo.telefono}
                onChange={e => setNuevo({ ...nuevo, telefono: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setModoNuevo(false); setNuevo({ nombre: "", parentesco: "", dui: "", telefono: "" }); }}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Cancelar
              </button>
              <button onClick={agregar} disabled={guardando || !nuevoValido}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors">
                {guardando ? "Guardando…" : "Agregar a la lista"}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ── Shell de modal reutilizable ───────────────────────────────────────────────

function ModalShell({ titulo, icon: Icon, onClose, children, ancho = "max-w-md" }: {
  titulo: string; icon: React.ElementType; onClose: () => void; children: React.ReactNode; ancho?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-[95vw] ${ancho} max-h-[90vh] flex flex-col`}>
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-shrink-0">
          <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 min-w-0">
            <Icon size={18} className="text-blue-700 dark:text-blue-400 flex-shrink-0" /> <span className="truncate">{titulo}</span>
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Modal: Tarjeta Oficial (Carnet) ──────────────────────────────────────────

function TarjetaCarnetModal({ tarjeta, onClose }: { tarjeta: TarjetaVisita; onClose: () => void }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose} style={{ perspective: '1000px' }}>
      <div 
        className="relative w-[340px] h-[520px] cursor-pointer"
        onClick={e => { e.stopPropagation(); setFlipped(!flipped); }}
        style={{ animation: 'notif-in 0.25s ease-out' }}
      >
        <div 
          className="w-full h-full relative transition-transform duration-700"
          style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* FRONT FACE */}
          <div 
            className="absolute inset-0 bg-slate-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ backfaceVisibility: 'hidden' }}
          >
            {/* Header - Navy Blue */}
            <div className="bg-[#001A33] px-4 py-5 flex items-center justify-center border-b-[6px] border-[#C2A14D]">
              <img src="/logo_hnes_sidebar.png" alt="Hospital Logo" className="h-16 object-contain brightness-0 invert opacity-90" />
            </div>
            
            {/* Body */}
            <div className="flex-1 flex flex-col items-center p-6 text-center relative z-10">
              <div className="text-[#001A33] font-bold text-[22px] tracking-tight leading-tight mb-2">
                TARJETA DE VISITA
              </div>
              <div className="w-16 h-1.5 bg-[#C2A14D] rounded-full mb-6"></div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 w-full mb-4 relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-1.5 h-full bg-[#001A33]"></div>
                 <p className="text-[11px] uppercase font-bold text-slate-400 tracking-wider mb-1">Paciente</p>
                 <p className="text-base font-bold text-slate-800 leading-snug">{tarjeta.pacienteNombre}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 w-full">
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-3 flex flex-col items-center justify-center">
                   <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Expediente</p>
                   <p className="text-lg font-black text-[#001A33]">{tarjeta.expediente}</p>
                </div>
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-3 flex flex-col items-center justify-center">
                   <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Identificador</p>
                   <p className="text-lg font-black text-[#C2A14D]">{tarjeta.codigo}</p>
                </div>
              </div>

              <div className="mt-auto pt-6 w-full text-center space-y-2">
                <p className="text-sm text-slate-600 font-medium uppercase tracking-wide">{tarjeta.servicio}</p>
                {tarjeta.cama && <p className="text-sm font-bold text-slate-700 bg-slate-200 inline-block px-4 py-1.5 rounded-full border border-slate-300 shadow-sm">Cama {tarjeta.cama}</p>}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-[#001A33] h-10 flex items-center justify-center">
               <p className="text-[10px] text-white/50 uppercase">Toca para girar</p>
            </div>
          </div>

          {/* BACK FACE */}
          <div 
            className="absolute inset-0 bg-slate-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            {/* Header */}
            <div className="bg-[#001A33] px-4 py-4 flex items-center justify-center border-b-[6px] border-[#C2A14D]">
              <p className="text-white font-bold text-sm tracking-widest uppercase">Autorizados</p>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col p-5 overflow-y-auto bg-white">
              {tarjeta.listaBlanca.length === 0 ? (
                <p className="text-sm text-slate-400 text-center mt-10">Sin autorizados registrados.</p>
              ) : (
                <ul className="space-y-3">
                  {tarjeta.listaBlanca.map((v, i) => (
                    <li key={i} className="pb-3 border-b border-slate-100 last:border-0">
                      <p className="text-sm font-bold text-[#001A33]">{v.nombre}</p>
                      <p className="text-xs font-medium text-slate-500 mt-0.5">{v.dui || "Sin documento"} • {v.parentesco}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="bg-[#001A33] h-10 flex items-center justify-center">
              <p className="text-[10px] text-white/50 uppercase">Toca para girar</p>
            </div>
          </div>
        </div>
        
        {/* Close Button */}
        <button onClick={e => { e.stopPropagation(); onClose(); }} className="absolute -top-3 -right-3 p-2 bg-slate-800 hover:bg-slate-900 text-white rounded-full transition-colors z-[70] shadow-lg">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
