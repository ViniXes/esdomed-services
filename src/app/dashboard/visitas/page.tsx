"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection, query, where, onSnapshot, getDocs, getDoc,
  addDoc, updateDoc, doc, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BuscadorPacienteActivo } from "@/components/pacientes/BuscadorPacienteActivo";
import type { Paciente, TarjetaVisita, Visita, VisitanteInfo } from "@/types";
import {
  DoorOpen, Plus, X, LogIn, LogOut, Star, UserPlus,
  Search, CheckCircle2, CalendarDays, IdCard,
} from "lucide-react";

// ── Utilidades ────────────────────────────────────────────────────────────────

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 transition";

function hoyStr(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dia = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dia}`;
}

function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  return (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
}

function fmtHora(ts: unknown): string {
  const d = toDate(ts);
  return d ? d.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
}

function fmtFecha(ts: unknown): string {
  const d = toDate(ts);
  return d ? d.toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

function nuevoCodigo(): string {
  const uuid = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
  return "TV-" + uuid.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
}

/** Clave para deduplicar visitantes: DUI si existe, si no el nombre normalizado. */
function claveVisitante(v: VisitanteInfo): string {
  return (v.dui?.trim() || v.nombre.trim().toLowerCase());
}

// ── Página ──────────────────────────────────────────────────────────────────

export default function VisitasPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"hoy" | "historial">("hoy");
  const [permissionError, setPermissionError] = useState(false);

  // Lista del día
  const [visitasHoy, setVisitasHoy] = useState<Visita[]>([]);
  // Historial
  const [histFecha, setHistFecha] = useState(hoyStr());
  const [histTexto, setHistTexto] = useState("");
  const [histVisitas, setHistVisitas] = useState<Visita[]>([]);

  // Modales
  const [adding, setAdding] = useState(false);
  const [picker, setPicker] = useState<{ tarjeta: TarjetaVisita; visitaProgramadaId?: string } | null>(null);

  const hoy = hoyStr();

  // Suscripción a las visitas de hoy
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

  // Suscripción al historial (por fecha elegida)
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

  // ── Acciones ────────────────────────────────────────────────────────────────

  const registrarSalida = async (v: Visita) => {
    if (!v.id) return;
    await updateDoc(doc(db, "visitas", v.id), {
      salidaEn: Timestamp.now(),
      estado: "finalizada",
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-teal-50 dark:bg-teal-950 rounded-xl flex items-center justify-center border border-teal-200 dark:border-teal-900">
            <DoorOpen size={17} className="text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Visitas de familiares</h1>
            <p className="text-xs text-slate-500 mt-0.5">Control de entradas y salidas · {fmtFecha(Timestamp.now())}</p>
          </div>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-xl transition-colors"
        >
          <Plus size={16} /> Agregar paciente
        </button>
      </div>

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer visitas. Pide al administrador que agregue <strong>trabajo_social</strong> a las reglas de Firestore.
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        {([["hoy", "Hoy"], ["historial", "Historial"]] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTab(val)}
            className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === val
                ? "border-teal-600 text-teal-700 dark:text-teal-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "hoy" ? (
        <>
          {/* Contadores */}
          <div className="grid grid-cols-3 gap-3">
            <Contador label="Programadas" valor={programadas.length} color="text-slate-700 dark:text-slate-300" icon={CalendarDays} />
            <Contador label="En curso" valor={enCurso.length} color="text-teal-600 dark:text-teal-400" icon={LogIn} />
            <Contador label="Finalizadas" valor={finalizadas.length} color="text-slate-500" icon={CheckCircle2} />
          </div>

          {visitasHoy.length === 0 && !permissionError ? (
            <div className="text-center py-16 text-slate-400">
              <DoorOpen size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No hay visitas registradas hoy.</p>
              <p className="text-xs mt-1">Usa “Agregar paciente” para armar la lista del día.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {enCurso.length > 0 && (
                <Seccion titulo="En curso">
                  {enCurso.map(v => <TarjetaVisitaRow key={v.id} v={v} onSalida={() => registrarSalida(v)} />)}
                </Seccion>
              )}
              {programadas.length > 0 && (
                <Seccion titulo="Programadas · por ingresar">
                  {programadas.map(v => (
                    <TarjetaVisitaRow key={v.id} v={v} onEntrada={async () => {
                      const tarjeta = await cargarTarjeta(v.tarjetaId);
                      if (tarjeta) setPicker({ tarjeta, visitaProgramadaId: v.id });
                    }} />
                  ))}
                </Seccion>
              )}
              {finalizadas.length > 0 && (
                <Seccion titulo="Finalizadas">
                  {finalizadas.map(v => <TarjetaVisitaRow key={v.id} v={v} />)}
                </Seccion>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Filtros de historial */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <CalendarDays size={15} />
              <input type="date" value={histFecha} onChange={e => setHistFecha(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </label>
            <div className="relative flex-1 min-w-[200px]">
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
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Paciente</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Visitante</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Entrada</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Salida</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {histFiltradas.map(v => (
                      <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs text-slate-500">{v.expediente}</p>
                          <p className="font-medium text-slate-800 dark:text-slate-200">{v.pacienteNombre}</p>
                          <p className="text-xs text-slate-500">{v.servicio} · Cama {v.cama ?? "—"}</p>
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
        <AgregarPacienteModal
          onClose={() => setAdding(false)}
          onPickerOpen={(tarjeta) => { setAdding(false); setPicker({ tarjeta }); }}
        />
      )}

      {picker && profile && (
        <ElegirVisitanteModal
          tarjeta={picker.tarjeta}
          visitaProgramadaId={picker.visitaProgramadaId}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// ── Helpers de datos ──────────────────────────────────────────────────────────

async function cargarTarjeta(id: string): Promise<TarjetaVisita | null> {
  const d = await getDoc(doc(db, "tarjetas_visita", id));
  return d.exists() ? ({ id: d.id, ...d.data() } as TarjetaVisita) : null;
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

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
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{titulo}</p>
      {children}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: Visita["estado"] }) {
  const cfg = {
    programada:  { t: "Programada", c: "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" },
    en_curso:    { t: "En curso",   c: "text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950 border-teal-200 dark:border-teal-900" },
    finalizada:  { t: "Finalizada", c: "text-slate-500 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700" },
  }[estado];
  return <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-1 rounded-lg border ${cfg.c}`}>{cfg.t}</span>;
}

function TarjetaVisitaRow({ v, onEntrada, onSalida }: { v: Visita; onEntrada?: () => void; onSalida?: () => void }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">{v.expediente}</p>
          <EstadoBadge estado={v.estado} />
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{v.pacienteNombre}</p>
        <p className="text-xs text-slate-500 mt-0.5">{v.servicio} · Cama {v.cama ?? "—"}</p>
        {v.visitante && (
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 flex items-center gap-1">
            {v.esTitular && <Star size={12} className="text-amber-500 fill-amber-500" />}
            <span className="font-medium">{v.visitante.nombre}</span>
            <span className="text-slate-400">· {v.visitante.parentesco}</span>
            {v.entradaEn && <span className="text-slate-400">· entró {fmtHora(v.entradaEn)}</span>}
            {v.salidaEn && <span className="text-slate-400">· salió {fmtHora(v.salidaEn)}</span>}
          </p>
        )}
      </div>
      <div className="flex-shrink-0">
        {onEntrada && (
          <button onClick={onEntrada}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors">
            <LogIn size={14} /> Registrar entrada
          </button>
        )}
        {onSalida && (
          <button onClick={onSalida}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 rounded-lg transition-colors">
            <LogOut size={14} /> Registrar salida
          </button>
        )}
      </div>
    </div>
  );
}

// ── Modal: Agregar paciente (crea tarjeta si hace falta) ──────────────────────

function AgregarPacienteModal({ onClose, onPickerOpen }: {
  onClose: () => void;
  onPickerOpen: (tarjeta: TarjetaVisita) => void;
}) {
  const { profile } = useAuth();
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [tarjeta, setTarjeta] = useState<TarjetaVisita | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [titular, setTitular] = useState<VisitanteInfo>({ nombre: "", parentesco: "", dui: "", telefono: "" });

  // Al elegir paciente, busca si ya tiene tarjeta activa.
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!paciente) { if (!cancel) setTarjeta(null); return; }
      setBuscando(true);
      // Solo un filtro de igualdad (expediente) para no exigir índice compuesto;
      // el estado se filtra en cliente.
      const snap = await getDocs(query(
        collection(db, "tarjetas_visita"),
        where("expediente", "==", paciente.expediente),
      ));
      if (cancel) return;
      const activa = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as TarjetaVisita))
        .find(t => t.estado === "activa");
      setTarjeta(activa ?? null);
      setBuscando(false);
    })();
    return () => { cancel = true; };
  }, [paciente]);

  const crearTarjeta = async () => {
    if (!paciente || !paciente.id || !profile) return;
    if (!titular.nombre.trim() || !titular.parentesco.trim()) return;
    setCreando(true);
    const limpio: VisitanteInfo = {
      nombre: titular.nombre.trim(),
      parentesco: titular.parentesco.trim(),
      ...(titular.dui?.trim() ? { dui: titular.dui.trim() } : {}),
      ...(titular.telefono?.trim() ? { telefono: titular.telefono.trim() } : {}),
    };
    const ref = await addDoc(collection(db, "tarjetas_visita"), {
      codigo: nuevoCodigo(),
      pacienteId: paciente.id,
      expediente: paciente.expediente,
      pacienteNombre: `${paciente.apellidos}, ${paciente.nombres}`,
      servicio: paciente.servicioActual,
      cama: paciente.camaActual ?? "",
      titular: limpio,
      listaBlanca: [limpio],
      estado: "activa",
      creadoEn: Timestamp.now(),
      creadoPor: profile.uid,
      creadoPorNombre: profile.nombre,
    });
    setCreando(false);
    onPickerOpen({
      id: ref.id, codigo: "", pacienteId: paciente.id, expediente: paciente.expediente,
      pacienteNombre: `${paciente.apellidos}, ${paciente.nombres}`, servicio: paciente.servicioActual,
      cama: paciente.camaActual ?? "", titular: limpio, listaBlanca: [limpio], estado: "activa",
      creadoEn: new Date(), creadoPor: profile.uid, creadoPorNombre: profile.nombre,
    });
  };

  return (
    <ModalShell onClose={onClose} titulo="Agregar paciente a visitas" icon={UserPlus}>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">1 · Buscar paciente internado</p>
          <BuscadorPacienteActivo value={paciente} onSelect={setPaciente} accent="teal" />
        </div>

        {paciente && (
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
            {buscando ? (
              <p className="text-sm text-slate-500">Verificando tarjeta…</p>
            ) : tarjeta ? (
              <div className="space-y-3">
                <div className="bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 rounded-xl p-3 text-sm">
                  <p className="flex items-center gap-1.5 text-teal-800 dark:text-teal-300 font-medium">
                    <IdCard size={15} /> Tarjeta {tarjeta.codigo} · titular {tarjeta.titular.nombre}
                  </p>
                  <p className="text-xs text-teal-700/80 dark:text-teal-400/80 mt-0.5">{tarjeta.listaBlanca.length} persona(s) en la lista blanca</p>
                </div>
                <button onClick={() => onPickerOpen(tarjeta)}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-xl transition-colors">
                  Continuar al registro de visita
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">2 · Datos del titular (responsable principal)</p>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="Nombre completo *" value={titular.nombre}
                    onChange={e => setTitular({ ...titular, nombre: e.target.value })} />
                  <input className={inputCls} placeholder="Parentesco *" value={titular.parentesco}
                    onChange={e => setTitular({ ...titular, parentesco: e.target.value })} />
                  <input className={inputCls} placeholder="DUI / documento" value={titular.dui}
                    onChange={e => setTitular({ ...titular, dui: e.target.value })} />
                  <input className={inputCls} placeholder="Teléfono" value={titular.telefono}
                    onChange={e => setTitular({ ...titular, telefono: e.target.value })} />
                </div>
                <button onClick={crearTarjeta} disabled={creando || !titular.nombre.trim() || !titular.parentesco.trim()}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-xl disabled:opacity-50 transition-colors">
                  {creando ? "Creando tarjeta…" : "Crear tarjeta y continuar"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ── Modal: Elegir visitante (roster + nuevo con búsqueda por DUI) ─────────────

function ElegirVisitanteModal({ tarjeta, visitaProgramadaId, onClose }: {
  tarjeta: TarjetaVisita;
  visitaProgramadaId?: string;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [guardando, setGuardando] = useState(false);
  const [modoNuevo, setModoNuevo] = useState(false);
  const [nuevo, setNuevo] = useState<VisitanteInfo>({ nombre: "", parentesco: "", dui: "", telefono: "" });
  const [buscandoDui, setBuscandoDui] = useState(false);

  const esTitular = (v: VisitanteInfo) => claveVisitante(v) === claveVisitante(tarjeta.titular);

  // Búsqueda por DUI en todo el sistema → autollena si la persona ya visitó antes.
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
    const limpio: VisitanteInfo = {
      nombre: visitante.nombre.trim(),
      parentesco: visitante.parentesco.trim(),
      ...(visitante.dui?.trim() ? { dui: visitante.dui.trim() } : {}),
      ...(visitante.telefono?.trim() ? { telefono: visitante.telefono.trim() } : {}),
    };

    // Si es alguien nuevo, agrégalo a la lista blanca de la tarjeta.
    if (agregarALista && tarjeta.id) {
      const yaEsta = tarjeta.listaBlanca.some(v => claveVisitante(v) === claveVisitante(limpio));
      if (!yaEsta) {
        await updateDoc(doc(db, "tarjetas_visita", tarjeta.id), {
          listaBlanca: [...tarjeta.listaBlanca, limpio],
          actualizadoEn: Timestamp.now(),
        });
      }
    }

    const base = {
      visitante: limpio,
      esTitular: esTitular(limpio),
      estado: "en_curso" as const,
      entradaEn: Timestamp.now(),
    };

    if (visitaProgramadaId) {
      // Convierte la visita programada en una visita en curso.
      await updateDoc(doc(db, "visitas", visitaProgramadaId), base);
    } else {
      // Entrada directa (espontánea).
      await addDoc(collection(db, "visitas"), {
        fecha: hoyStr(),
        tarjetaId: tarjeta.id,
        pacienteId: tarjeta.pacienteId,
        expediente: tarjeta.expediente,
        pacienteNombre: tarjeta.pacienteNombre,
        servicio: tarjeta.servicio,
        cama: tarjeta.cama ?? "",
        programada: false,
        registradoPorId: profile.uid,
        registradoPorNombre: profile.nombre,
        creadoEn: Timestamp.now(),
        ...base,
      });
    }
    setGuardando(false);
    onClose();
  };

  const programarParaHoy = async () => {
    if (!profile) return;
    setGuardando(true);
    await addDoc(collection(db, "visitas"), {
      fecha: hoyStr(),
      tarjetaId: tarjeta.id,
      pacienteId: tarjeta.pacienteId,
      expediente: tarjeta.expediente,
      pacienteNombre: tarjeta.pacienteNombre,
      servicio: tarjeta.servicio,
      cama: tarjeta.cama ?? "",
      estado: "programada",
      programada: true,
      registradoPorId: profile.uid,
      registradoPorNombre: profile.nombre,
      creadoEn: Timestamp.now(),
    });
    setGuardando(false);
    onClose();
  };

  const nuevoValido = nuevo.nombre.trim() && nuevo.parentesco.trim();

  return (
    <ModalShell onClose={onClose} titulo={`Visita · ${tarjeta.pacienteNombre}`} icon={DoorOpen}>
      <p className="text-xs text-slate-500 -mt-2 mb-3">
        Tarjeta {tarjeta.codigo} · {tarjeta.servicio} · Cama {tarjeta.cama ?? "—"}
      </p>

      {!modoNuevo ? (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">¿Quién está usando la tarjeta?</p>
          {tarjeta.listaBlanca.map((v, i) => (
            <button key={i} onClick={() => registrarEntrada(v, false)} disabled={guardando}
              className="w-full text-left px-3.5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-all disabled:opacity-50">
              <span className="flex items-center gap-2">
                {esTitular(v) && <Star size={14} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
                <span className="font-medium text-slate-800 dark:text-slate-200">{v.nombre}</span>
                <span className="text-xs text-slate-500">· {v.parentesco}{esTitular(v) ? " · titular" : ""}</span>
              </span>
              {v.dui && <span className="block text-xs text-slate-400 mt-0.5 ml-6">{v.dui}</span>}
            </button>
          ))}
          <button onClick={() => setModoNuevo(true)}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:border-teal-400 hover:text-teal-700 dark:hover:text-teal-400 transition-all">
            <UserPlus size={16} /> Registrar otro familiar
          </button>

          {!visitaProgramadaId && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 mt-1">
              <button onClick={programarParaHoy} disabled={guardando}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50">
                <CalendarDays size={15} /> Solo agregar a la lista de hoy (sin entrada aún)
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nuevo familiar</p>
          <div className="relative">
            <input className={inputCls} placeholder="DUI / documento (autollena si ya visitó antes)"
              value={nuevo.dui}
              onChange={e => setNuevo({ ...nuevo, dui: e.target.value })}
              onBlur={e => buscarPorDui(e.target.value)} />
            {buscandoDui && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">buscando…</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Nombre completo *" value={nuevo.nombre}
              onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
            <input className={inputCls} placeholder="Parentesco *" value={nuevo.parentesco}
              onChange={e => setNuevo({ ...nuevo, parentesco: e.target.value })} />
            <input className={inputCls + " col-span-2"} placeholder="Teléfono" value={nuevo.telefono}
              onChange={e => setNuevo({ ...nuevo, telefono: e.target.value })} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setModoNuevo(false)}
              className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Volver
            </button>
            <button onClick={() => registrarEntrada(nuevo, true)} disabled={guardando || !nuevoValido}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-xl disabled:opacity-50 transition-colors">
              {guardando ? "Registrando…" : "Registrar entrada"}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── Shell de modal reutilizable ───────────────────────────────────────────────

function ModalShell({ titulo, icon: Icon, onClose, children }: {
  titulo: string; icon: React.ElementType; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-[95vw] max-w-md max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-shrink-0">
          <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Icon size={18} className="text-teal-600 dark:text-teal-400" /> {titulo}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}
