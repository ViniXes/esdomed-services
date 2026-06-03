"use client";

import { useEffect, useMemo, useState, useRef, useCallback, createContext, useContext } from "react";
import {
  collection, query, where, orderBy, onSnapshot, getDocs, getDoc,
  addDoc, updateDoc, doc, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BuscadorPacienteActivo } from "@/components/pacientes/BuscadorPacienteActivo";
import { PARENTESCOS } from "@/lib/parentescos";
import type { Paciente, TarjetaVisita, Visita, VisitanteInfo } from "@/types";
import {
  DoorOpen, Plus, X, LogIn, LogOut, Star, UserPlus, IdCard,
  Search, CheckCircle2, CalendarDays, MessageSquare, CreditCard, Ban, Trash2,
  AlertTriangle, ArrowLeft, ArrowRight,
} from "lucide-react";

// ── Estilos compartidos ───────────────────────────────────────────────────────

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 transition";
const selectCls =
  "w-full appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 transition cursor-pointer";

// ── Utilidades ────────────────────────────────────────────────────────────────

function fechaStr(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

function hoyStr(): string {
  return fechaStr(new Date());
}

function mananaStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return fechaStr(d);
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

async function cargarTarjeta(id: string): Promise<TarjetaVisita | null> {
  const d = await getDoc(doc(db, "tarjetas_visita", id));
  return d.exists() ? ({ id: d.id, ...d.data() } as TarjetaVisita) : null;
}

type TabId = "hoy" | "agenda" | "tarjetas" | "historial";

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
  const [tab, setTab] = useState<TabId>("hoy");
  const [permissionError, setPermissionError] = useState(false);

  const [visitasHoy, setVisitasHoy] = useState<Visita[]>([]);
  const [agenda, setAgenda] = useState<Visita[]>([]);
  const [agendaFecha, setAgendaFecha] = useState(mananaStr());
  const [tarjetas, setTarjetas] = useState<TarjetaVisita[]>([]);
  const [tarjetaTexto, setTarjetaTexto] = useState("");
  const [histFecha, setHistFecha] = useState(hoyStr());
  const [histTexto, setHistTexto] = useState("");
  const [histVisitas, setHistVisitas] = useState<Visita[]>([]);

  // Modales
  const [adding, setAdding] = useState(false);
  const [picker, setPicker] = useState<{ tarjeta: TarjetaVisita; visitaProgramadaId?: string } | null>(null);
  const [detalle, setDetalle] = useState<Visita | null>(null);
  const [tarjetaSel, setTarjetaSel] = useState<TarjetaVisita | null>(null);

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
    try {
      await registrarSalida(v);
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

  useEffect(() => {
    if (tab !== "agenda") return;
    const q = query(collection(db, "visitas"), where("fecha", "==", agendaFecha));
    return onSnapshot(q, s => setAgenda(s.docs.map(d => ({ id: d.id, ...d.data() } as Visita))));
  }, [tab, agendaFecha]);

  useEffect(() => {
    if (tab !== "tarjetas") return;
    const q = query(collection(db, "tarjetas_visita"), orderBy("creadoEn", "desc"));
    return onSnapshot(q, s => setTarjetas(s.docs.map(d => ({ id: d.id, ...d.data() } as TarjetaVisita))));
  }, [tab]);

  useEffect(() => {
    if (tab !== "historial") return;
    const q = query(collection(db, "visitas"), where("fecha", "==", histFecha));
    return onSnapshot(q, s => {
      const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as Visita));
      docs.sort((a, b) => (toDate(b.entradaEn ?? b.creadoEn)?.getTime() ?? 0) - (toDate(a.entradaEn ?? a.creadoEn)?.getTime() ?? 0));
      setHistVisitas(docs);
    });
  }, [tab, histFecha]);

  const programadas = visitasHoy.filter(v => v.estado === "programada");
  const enCurso     = visitasHoy.filter(v => v.estado === "en_curso");
  const finalizadas = visitasHoy.filter(v => v.estado === "finalizada");

  // Visitas programadas de la fecha elegida en la Agenda
  const agendaProgramadas = useMemo(
    () => agenda.filter(v => v.estado === "programada"),
    [agenda]
  );

  const tarjetasFiltradas = useMemo(() => {
    const t = tarjetaTexto.trim().toLowerCase();
    if (!t) return tarjetas;
    return tarjetas.filter(tj =>
      tj.expediente.toLowerCase().includes(t) ||
      tj.pacienteNombre.toLowerCase().includes(t) ||
      tj.codigo.toLowerCase().includes(t) ||
      (tj.titular.dui ?? "").toLowerCase().includes(t) ||
      tj.listaBlanca.some(v => (v.dui ?? "").toLowerCase().includes(t) || v.nombre.toLowerCase().includes(t))
    );
  }, [tarjetas, tarjetaTexto]);

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

  const abrirEntrada = async (v: Visita) => {
    const tarjeta = await cargarTarjeta(v.tarjetaId);
    if (tarjeta) { setDetalle(null); setPicker({ tarjeta, visitaProgramadaId: v.id }); }
  };

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
            <p className="text-xs text-slate-500 mt-0.5">Control de entradas, salidas y agenda de visitas</p>
          </div>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-xl transition-colors"
        >
          <Plus size={16} /> Nueva visita
        </button>
      </div>

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer visitas. Pide al administrador que agregue <strong>trabajo_social</strong> a las reglas de Firestore.
        </div>
      )}

      {/* Tabs — control segmentado, sin scroll (envuelve en pantallas chicas) */}
      <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
        {([["hoy", "Hoy"], ["agenda", "Agenda"], ["tarjetas", "Tarjetas"], ["historial", "Historial"]] as [TabId, string][]).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTab(val)}
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
            <Contador label="Programadas" valor={programadas.length} color="text-slate-700 dark:text-slate-300" icon={CalendarDays} />
            <Contador label="En curso" valor={enCurso.length} color="text-blue-700 dark:text-blue-400" icon={LogIn} />
            <Contador label="Finalizadas" valor={finalizadas.length} color="text-slate-500" icon={CheckCircle2} />
          </div>

          {visitasHoy.length === 0 && !permissionError ? (
            <EmptyState texto="No hay visitas registradas hoy." sub="Usa “Nueva visita” para registrar una entrada o agendar." />
          ) : (
            <div className="space-y-6">
              {enCurso.length > 0 && (
                <Seccion titulo="En curso">
                  <Grid>{enCurso.map(v => <VisitaCard key={v.id} v={v} onClick={() => setDetalle(v)} onSalida={() => handleSalida(v)} />)}</Grid>
                </Seccion>
              )}
              {programadas.length > 0 && (
                <Seccion titulo="Programadas · por ingresar">
                  <Grid>{programadas.map(v => <VisitaCard key={v.id} v={v} onClick={() => setDetalle(v)} onEntrada={() => abrirEntrada(v)} />)}</Grid>
                </Seccion>
              )}
              {finalizadas.length > 0 && (
                <Seccion titulo="Finalizadas">
                  <Grid>{finalizadas.map(v => <VisitaCard key={v.id} v={v} onClick={() => setDetalle(v)} />)}</Grid>
                </Seccion>
              )}
            </div>
          )}
        </>
      )}

      {/* ── AGENDA ── */}
      {tab === "agenda" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <CalendarDays size={15} />
              <input type="date" value={agendaFecha} onChange={e => setAgendaFecha(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </label>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">{fmtFechaStr(agendaFecha)}</span>
            <button onClick={() => setAgendaFecha(mananaStr())}
              className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-amber-500">Mañana</button>
            <span className="ml-auto text-sm text-slate-500">{agendaProgramadas.length} programada(s)</span>
          </div>

          {agendaProgramadas.length === 0 ? (
            <EmptyState texto="No hay visitas programadas para esta fecha." sub="Al crear una visita puedes elegir la fecha." />
          ) : (
            <Grid>{agendaProgramadas.map(v => <VisitaCard key={v.id} v={v} onClick={() => setDetalle(v)} />)}</Grid>
          )}
        </>
      )}

      {/* ── TARJETAS ── */}
      {tab === "tarjetas" && (
        <>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={tarjetaTexto} onChange={e => setTarjetaTexto(e.target.value)}
              placeholder="Buscar por nombre del paciente, expediente, DUI o código…"
              className={inputCls + " pl-9"} />
          </div>

          {tarjetas.length === 0 ? (
            <EmptyState texto="Aún no hay tarjetas creadas." sub="Se crean automáticamente al registrar la primera visita de un paciente." />
          ) : tarjetasFiltradas.length === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center">Ningún paciente coincide con la búsqueda — aún no tiene tarjeta creada.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tarjetasFiltradas.map(t => <TarjetaCard key={t.id} t={t} onClick={() => setTarjetaSel(t)} />)}
            </div>
          )}
        </>
      )}

      {/* ── HISTORIAL ── */}
      {tab === "historial" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <CalendarDays size={15} />
              <input type="date" value={histFecha} onChange={e => setHistFecha(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </label>
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={histTexto} onChange={e => setHistTexto(e.target.value)}
                placeholder="Filtrar por expediente, paciente, servicio o visitante…"
                className={inputCls + " pl-9"} />
            </div>
            <span className="text-sm text-slate-500">{histFiltradas.length} registros</span>
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
                            {v.esTitular && <Star size={12} className="text-amber-500 fill-amber-500" />}
                            {v.visitante?.nombre ?? "—"}
                          </p>
                          <p className="text-xs text-slate-500">{v.visitante?.parentesco}{v.visitante?.dui ? ` · ${v.visitante.dui}` : ""}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{v.entradaEn ? fmtHora(v.entradaEn) : "—"}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{v.salidaEn ? fmtHora(v.salidaEn) : "—"}</td>
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

      {adding && profile && (
        <NuevaVisitaModal
          onClose={() => setAdding(false)}
          onEntradaAhora={(tarjeta) => { setAdding(false); setPicker({ tarjeta }); }}
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

async function registrarSalida(v: Visita) {
  if (!v.id) return;
  await updateDoc(doc(db, "visitas", v.id), { salidaEn: Timestamp.now(), estado: "finalizada" });
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
            {v.esTitular && <Star size={12} className="text-amber-500 fill-amber-500" />}
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

function TarjetaCard({ t, onClick }: { t: TarjetaVisita; onClick: () => void }) {
  return (
    <div onClick={onClick}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2.5 cursor-pointer hover:border-amber-400 dark:hover:border-amber-700 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-sm font-bold text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-800 px-2 py-1 rounded-lg">
          <CreditCard size={13} /> {t.codigo}
        </span>
        {t.estado !== "activa" && <span className="text-[11px] font-semibold text-slate-400">{t.estado}</span>}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{t.pacienteNombre}</p>
        <p className="text-xs text-slate-500">{t.servicio} · Cama {t.cama || "—"}</p>
      </div>
      <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
          Lista blanca · {t.listaBlanca.length}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {t.listaBlanca.map((v, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-lg">
              {claveVisitante(v) === claveVisitante(t.titular) && <Star size={10} className="text-amber-500 fill-amber-500" />}
              {v.nombre}
            </span>
          ))}
        </div>
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

// ── Indicador de pasos (wizard) ───────────────────────────────────────────────

function Pasos({ actual, labels }: { actual: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {labels.map((l, i) => {
        const n = i + 1;
        const activo = n === actual;
        const hecho = n < actual;
        return (
          <div key={l} className="flex items-center gap-2">
            <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
              activo ? "bg-blue-800 text-white" : hecho ? "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
            }`}>{hecho ? <CheckCircle2 size={14} /> : n}</span>
            <span className={`text-xs font-medium ${activo ? "text-slate-800 dark:text-slate-200" : "text-slate-400"}`}>{l}</span>
            {n < labels.length && <span className="w-5 h-px bg-slate-200 dark:bg-slate-700" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Modal: Nueva visita (wizard: paciente → detalles) ─────────────────────────

function NuevaVisitaModal({ onClose, onEntradaAhora }: {
  onClose: () => void;
  onEntradaAhora: (tarjeta: TarjetaVisita) => void;
}) {
  const { profile } = useAuth();
  const notify = useFeedback();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [tarjeta, setTarjeta] = useState<TarjetaVisita | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [titular, setTitular] = useState<VisitanteInfo>({ nombre: "", parentesco: "", dui: "", telefono: "" });
  const [fecha, setFecha] = useState(hoyStr());
  // Cuántas tarjetas existen ya para este expediente (de internamientos previos),
  // para numerar la secuencia del código en reingresos.
  const [previasCount, setPreviasCount] = useState(0);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!paciente) { if (!cancel) { setTarjeta(null); setPreviasCount(0); } return; }
      setBuscando(true);
      const snap = await getDocs(query(collection(db, "tarjetas_visita"), where("expediente", "==", paciente.expediente)));
      if (cancel) return;
      const todas = snap.docs.map(d => ({ id: d.id, ...d.data() } as TarjetaVisita));
      const actual =
        todas.find(t => t.pacienteId === paciente.id && t.estado === "activa") ??
        todas.find(t => t.pacienteId === paciente.id) ??
        null;
      setTarjeta(actual);
      setPreviasCount(todas.length);
      setBuscando(false);
    })();
    return () => { cancel = true; };
  }, [paciente]);

  const crearTarjeta = async (): Promise<TarjetaVisita | null> => {
    if (!paciente || !paciente.id || !profile) return null;
    const limpio = limpiarVisitante(titular);
    const nombreCompleto = `${paciente.apellidos}, ${paciente.nombres}`;
    const codigo = codigoTarjeta(paciente.expediente, paciente.nombres, paciente.apellidos, previasCount + 1);
    const ref = await addDoc(collection(db, "tarjetas_visita"), {
      codigo,
      pacienteId: paciente.id,
      expediente: paciente.expediente,
      pacienteNombre: nombreCompleto,
      servicio: paciente.servicioActual,
      cama: paciente.camaActual ?? "",
      titular: limpio,
      listaBlanca: [limpio],
      estado: "activa",
      creadoEn: Timestamp.now(),
      creadoPor: profile.uid,
      creadoPorNombre: profile.nombre,
    });
    return {
      id: ref.id, codigo,
      pacienteId: paciente.id, expediente: paciente.expediente, pacienteNombre: nombreCompleto,
      servicio: paciente.servicioActual, cama: paciente.camaActual ?? "", titular: limpio,
      listaBlanca: [limpio], estado: "activa", creadoEn: new Date(),
      creadoPor: profile.uid, creadoPorNombre: profile.nombre,
    };
  };

  const resolverTarjeta = async (): Promise<TarjetaVisita | null> => {
    if (tarjeta) return tarjeta;
    if (!titular.nombre.trim() || !titular.parentesco.trim()) return null;
    return crearTarjeta();
  };

  const agendar = async () => {
    if (!profile) return;
    setGuardando(true);
    try {
      const tj = await resolverTarjeta();
      if (!tj) { notify("error", "Faltan datos del titular"); return; }
      await addDoc(collection(db, "visitas"), {
        fecha,
        tarjetaId: tj.id,
        pacienteId: tj.pacienteId,
        expediente: tj.expediente,
        pacienteNombre: tj.pacienteNombre,
        servicio: tj.servicio,
        cama: tj.cama ?? "",
        estado: "programada",
        programada: true,
        registradoPorId: profile.uid,
        registradoPorNombre: profile.nombre,
        creadoEn: Timestamp.now(),
      });
      notify("success", `Visita agendada · ${fmtFechaStr(fecha)}`);
      onClose();
    } catch {
      notify("error", "No se pudo agendar la visita");
    } finally {
      setGuardando(false);
    }
  };

  const entradaAhora = async () => {
    setGuardando(true);
    try {
      const tj = await resolverTarjeta();
      if (tj) onEntradaAhora(tj);
      else notify("error", "Faltan datos del titular");
    } catch {
      notify("error", "No se pudo continuar");
    } finally {
      setGuardando(false);
    }
  };

  const esHoy = fecha === hoyStr();
  const titularValido = !!tarjeta || (titular.nombre.trim() && titular.parentesco.trim());

  return (
    <ModalShell onClose={onClose} titulo="Nueva visita" icon={UserPlus} ancho="max-w-lg">
      <Pasos actual={paso} labels={["Paciente", "Detalles"]} />

      {/* Paso 1 — Paciente */}
      {paso === 1 && (
        <div className="space-y-4">
          <BuscadorPacienteActivo value={paciente} onSelect={setPaciente} accent="amber" />
          <button onClick={() => setPaso(2)} disabled={!paciente || buscando}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors">
            {buscando ? "Verificando tarjeta…" : <>Siguiente <ArrowRight size={16} /></>}
          </button>
        </div>
      )}

      {/* Paso 2 — Detalles */}
      {paso === 2 && paciente && (
        <div className="space-y-4">
          <button onClick={() => setPaso(1)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            <ArrowLeft size={14} /> {paciente.apellidos}, {paciente.nombres} · Exp. {paciente.expediente} (cambiar)
          </button>

          {tarjeta ? (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-sm">
              <p className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-medium">
                <IdCard size={15} /> Tarjeta {tarjeta.codigo} · titular {tarjeta.titular.nombre}
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">{tarjeta.listaBlanca.length} persona(s) en la lista blanca</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Titular (responsable principal)</p>
              <p className="text-[11px] text-slate-400">
                Se creará la tarjeta {codigoTarjeta(paciente.expediente, paciente.nombres, paciente.apellidos, previasCount + 1)}
                {previasCount > 0 && ` · internamiento #${previasCount + 1} de este expediente`}
              </p>
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
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Fecha de la visita</label>
            <input type="date" min={hoyStr()} value={fecha} onChange={e => setFecha(e.target.value)}
              className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={agendar} disabled={guardando || !titularValido}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl border border-amber-600 text-blue-800 dark:text-blue-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-50 transition-colors">
              <CalendarDays size={16} /> Agendar
            </button>
            {esHoy && (
              <button onClick={entradaAhora} disabled={guardando || !titularValido}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors">
                <LogIn size={16} /> Entrada ahora
              </button>
            )}
          </div>
          {!esHoy && <p className="text-[11px] text-slate-400 text-center">La entrada se registra el día de la visita desde la pestaña “Hoy”.</p>}
        </div>
      )}
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

      const base = { visitante: limpio, esTitular: esTitular(limpio), estado: "en_curso" as const, entradaEn: Timestamp.now() };

      if (visitaProgramadaId) {
        await updateDoc(doc(db, "visitas", visitaProgramadaId), base);
      } else {
        await addDoc(collection(db, "visitas"), {
          fecha: hoyStr(), tarjetaId: tarjeta.id, pacienteId: tarjeta.pacienteId,
          expediente: tarjeta.expediente, pacienteNombre: tarjeta.pacienteNombre,
          servicio: tarjeta.servicio, cama: tarjeta.cama ?? "", programada: false,
          registradoPorId: profile.uid, registradoPorNombre: profile.nombre,
          creadoEn: Timestamp.now(), ...base,
        });
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
                {esTitular(v) && <Star size={14} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
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
  const [comentarios, setComentarios] = useState(visita.comentarios ?? "");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

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
    try { await registrarSalida(visita); notify("success", "Salida registrada"); onClose(); }
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

  return (
    <ModalShell onClose={onClose} titulo={`Visita · ${visita.expediente}`} icon={DoorOpen} ancho="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <EstadoBadge estado={visita.estado} />
          <span className="text-xs text-slate-500 flex items-center gap-1"><CalendarDays size={13} /> {fmtFechaStr(visita.fecha)}</span>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800 space-y-2.5">
          <Info label="Paciente" value={visita.pacienteNombre} />
          <Info label="Ubicación" value={`${visita.servicio} · Cama ${visita.cama || "—"}`} />
          {visita.visitante && (
            <Info label="Visitante" value={`${visita.visitante.nombre} · ${visita.visitante.parentesco}${visita.esTitular ? " (titular)" : ""}`} />
          )}
          {visita.visitante?.dui && <Info label="Documento" value={visita.visitante.dui} />}
          {visita.visitante?.telefono && <Info label="Teléfono" value={visita.visitante.telefono} />}
          {visita.entradaEn && <Info label="Entrada" value={fmtHora(visita.entradaEn)} />}
          {visita.salidaEn && <Info label="Salida" value={fmtHora(visita.salidaEn) + (visita.cierreAutomatico ? " (cierre automático)" : "")} />}
          <Info label="Registró" value={visita.registradoPorNombre} />
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
          {visita.estado === "programada" && (
            <button onClick={cancelar}
              className="inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-300 dark:border-slate-700 rounded-xl transition-colors">
              <Ban size={15} /> Cancelar
            </button>
          )}
        </div>
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
                    {esTitular(v) && <Star size={13} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
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
