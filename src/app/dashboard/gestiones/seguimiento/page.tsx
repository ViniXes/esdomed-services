"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, setDoc, Timestamp, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { GestionTS, Paciente, RastreoTS } from "@/types";
import {
  ACCIONES_SEGUIMIENTO, ESTADO_RASTREO_COLOR, ESTADO_RASTREO_LABEL,
  habilitaSeguimiento, keyAccionSeguimiento,
  type AccionSeguimiento, type EstadoRastreo,
} from "@/lib/trabajosocial/catalogos";
import { GestionesTabs } from "../_components/GestionesTabs";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ListChecks, Loader2, Lock,
  Phone, PhoneCall, Search, StickyNote, Stethoscope, Users, Video, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const selectCls =
  "appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";

// Ícono de cada acción rápida (llave = tipo|modalidad del catálogo).
const ICONO_ACCION: Record<string, LucideIcon> = {
  "seguimiento_familiar|videollamada": Video,
  "seguimiento_familiar|llamada": Phone,
  "llamada_con_medico|llamada": Stethoscope,
  "seguimiento_sts|llamada": PhoneCall,
  "visita_familiar|presencial": Users,
};

const ACCION_KEYS = new Set(ACCIONES_SEGUIMIENTO.map((a) => a.key));

// Máximo de pacientes por página en la lista del día.
const PAGE_SIZE = 25;

const hoyStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};
const inicioMesStr = () => hoyStr().slice(0, 8) + "01";
const nombrePac = (p: Paciente) => `${p.apellidos}, ${p.nombres}`;
const toMillis = (ts: unknown) => (ts as { toMillis?: () => number })?.toMillis?.() ?? 0;

type FiltroRapido = "pendientes" | "atendidos" | "bloqueados" | "todos";

export default function SeguimientoPage() {
  const { profile } = useAuth();

  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [rastreos, setRastreos] = useState<Map<string, RastreoTS>>(new Map());
  const [gestionesMes, setGestionesMes] = useState<GestionTS[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [servicioFiltro, setServicioFiltro] = useState("");
  const [filtro, setFiltro] = useState<FiltroRapido>("pendientes");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ tipo: "success" | "error"; msg: string } | null>(null);

  // Pacientes activos creados por ESDOMED (mismo universo que Rastreo/Panorama).
  useEffect(() => {
    const q = query(collection(db, "pacientes"), where("estado", "==", "activo"));
    return onSnapshot(q, (s) => {
      setPacientes(s.docs.map((d) => ({ id: d.id, ...d.data() } as Paciente)));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  // Rastreos — el gate (contactado) y los datos de contacto del familiar.
  useEffect(() => {
    return onSnapshot(collection(db, "rastreos_ts"), (s) => {
      const m = new Map<string, RastreoTS>();
      s.docs.forEach((d) => m.set(d.id, { id: d.id, ...d.data() } as RastreoTS));
      setRastreos(m);
    }, (err) => { if (err.code === "permission-denied") setPermissionError(true); });
  }, []);

  // Gestiones del mes en curso — de aquí salen las marcas de hoy y los totales
  // mensuales por paciente (rango sobre un solo campo: sin índice compuesto).
  useEffect(() => {
    const q = query(collection(db, "gestiones_ts"), where("fecha", ">=", inicioMesStr()));
    return onSnapshot(q, (s) => {
      setPermissionError(false);
      setGestionesMes(s.docs.map((d) => ({ id: d.id, ...d.data() } as GestionTS)));
    }, (err) => { if (err.code === "permission-denied") setPermissionError(true); });
  }, []);

  // Índices por expediente: marcas de hoy, totales del mes y "mi última de hoy"
  // por acción (para poder deshacer una marca propia equivocada).
  const { hoyPorExp, mesPorExp, miasHoyPorExp } = useMemo(() => {
    const hoyS = hoyStr();
    const hoy = new Map<string, Map<string, number>>();
    const mes = new Map<string, Map<string, number>>();
    const mias = new Map<string, Map<string, GestionTS>>();
    const inc = (m: Map<string, Map<string, number>>, exp: string, k: string) => {
      const sub = m.get(exp) ?? new Map<string, number>();
      sub.set(k, (sub.get(k) ?? 0) + 1);
      m.set(exp, sub);
    };
    for (const g of gestionesMes) {
      const k = keyAccionSeguimiento(g);
      if (!ACCION_KEYS.has(k)) continue;
      inc(mes, g.expediente, k);
      if (g.fecha !== hoyS) continue;
      inc(hoy, g.expediente, k);
      if (g.trabajadoraId === profile?.uid) {
        const sub = mias.get(g.expediente) ?? new Map<string, GestionTS>();
        const prev = sub.get(k);
        if (!prev || toMillis(g.creadoEn) > toMillis(prev.creadoEn)) sub.set(k, g);
        mias.set(g.expediente, sub);
      }
    }
    return { hoyPorExp: hoy, mesPorExp: mes, miasHoyPorExp: mias };
  }, [gestionesMes, profile?.uid]);

  const estadoRastreoDe = useCallback(
    (exp: string): EstadoRastreo | "pendiente" => rastreos.get(exp)?.estado ?? "pendiente",
    [rastreos],
  );
  const habilitado = useCallback(
    (exp: string) => habilitaSeguimiento(rastreos.get(exp)?.estado),
    [rastreos],
  );
  const atendidoHoy = useCallback(
    (exp: string) => (hoyPorExp.get(exp)?.size ?? 0) > 0,
    [hoyPorExp],
  );

  const serviciosPresentes = useMemo(() => {
    const set = new Set<string>();
    pacientes.forEach((p) => set.add(p.servicioActual || "Sin servicio"));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [pacientes]);

  // Stats globales (sobre todos los activos, no sobre el filtro).
  const stats = useMemo(() => {
    let hab = 0, aten = 0, bloq = 0, pend = 0;
    for (const p of pacientes) {
      const h = habilitado(p.expediente);
      const a = atendidoHoy(p.expediente);
      if (h) hab++; else bloq++;
      if (a) aten++;
      if (h && !a) pend++;
    }
    return { habilitados: hab, atendidos: aten, pendientes: pend, bloqueados: bloq };
  }, [pacientes, habilitado, atendidoHoy]);

  // Lista plana (servicio → nombre): el orden natural de "bajar la lista".
  const lista = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return pacientes
      .filter((p) => {
        const servicio = p.servicioActual || "Sin servicio";
        if (servicioFiltro && servicio !== servicioFiltro) return false;
        const hab = habilitado(p.expediente);
        const aten = atendidoHoy(p.expediente);
        if (filtro === "pendientes" && !(hab && !aten)) return false;
        if (filtro === "atendidos" && !aten) return false;
        if (filtro === "bloqueados" && hab) return false;
        if (!t) return true;
        return (
          p.expediente.toLowerCase().includes(t) ||
          nombrePac(p).toLowerCase().includes(t) ||
          servicio.toLowerCase().includes(t)
        );
      })
      .sort((a, b) =>
        (a.servicioActual || "").localeCompare(b.servicioActual || "") ||
        nombrePac(a).localeCompare(nombrePac(b)),
      );
  }, [pacientes, busqueda, servicioFiltro, filtro, habilitado, atendidoHoy]);

  // Paginación (patrón estándar del proyecto: reset render-time + pageSafe).
  const totalPages = Math.max(1, Math.ceil(lista.length / PAGE_SIZE));
  const filtrosKey = `${busqueda}|${servicioFiltro}|${filtro}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) { setFiltrosPrevios(filtrosKey); setPage(1); }
  const pageSafe = Math.min(page, totalPages);
  const paginados = lista.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  // ── Acciones ────────────────────────────────────────────────────────────────

  // Marca una acción del día: escribe una gestión normal (alimenta productividad,
  // bitácora y totales sin captura adicional).
  const marcar = useCallback(async (p: Paciente, a: AccionSeguimiento, nota?: string) => {
    if (!profile) return;
    const nuevo: Record<string, unknown> = {
      expediente: p.expediente,
      pacienteNombre: nombrePac(p),
      servicio: p.servicioActual || undefined,
      estadoPaciente: "actual",
      vinculadoPadron: true,
      tipo: a.tipo,
      resultadoVisita: a.resultadoVisita,
      modalidad: a.modalidad,
      notas: nota?.trim() || undefined,
      fecha: hoyStr(),
      trabajadoraId: profile.uid,
      trabajadoraNombre: profile.nombre,
      creadoEn: Timestamp.now(),
    };
    const payload = Object.fromEntries(Object.entries(nuevo).filter(([, v]) => v !== undefined));
    await addDoc(collection(db, "gestiones_ts"), payload);
  }, [profile]);

  // Deshace MI última marca de hoy de esa acción (equivocaciones al pasar lista).
  const deshacer = useCallback(async (p: Paciente, a: AccionSeguimiento) => {
    const mia = miasHoyPorExp.get(p.expediente)?.get(a.key);
    if (!mia?.id) return;
    await deleteDoc(doc(db, "gestiones_ts", mia.id));
  }, [miasHoyPorExp]);

  // Válvula de escape del gate: marcar "Contactado" de un toque sin pasar por el
  // formulario de Rastreo (regla de la UTS: es su decisión, no una imposición).
  const marcarContactado = useCallback(async (p: Paciente) => {
    if (!profile) return;
    const existe = rastreos.has(p.expediente);
    await setDoc(doc(db, "rastreos_ts", p.expediente), {
      expediente: p.expediente,
      pacienteId: p.id ?? null,
      pacienteNombre: nombrePac(p),
      servicio: p.servicioActual ?? null,
      cama: p.camaActual ?? null,
      vinculadoPadron: true,
      estado: "contactado",
      fechaContacto: hoyStr(),
      trabajadoraId: profile.uid,
      trabajadoraNombre: profile.nombre,
      actualizadoEn: Timestamp.now(),
      ...(existe ? {} : { creadoEn: Timestamp.now() }),
    }, { merge: true });
  }, [profile, rastreos]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
          <ListChecks size={13} /> Trabajo Social
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Seguimiento del día</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Pasa lista de los pacientes contactados: cada marca registra la gestión del día — sin volver a escribir al paciente
        </p>
      </div>

      <GestionesTabs />

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer las gestiones o rastreos. Pide al administrador que despliegue las reglas de <strong>gestiones_ts</strong> y <strong>rastreos_ts</strong>.
        </div>
      )}

      {/* Stats clicables */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {([
          { k: "pendientes" as FiltroRapido, label: "Pendientes hoy", n: stats.pendientes, cls: "text-amber-600 dark:text-amber-400" },
          { k: "atendidos" as FiltroRapido, label: "Atendidos hoy", n: stats.atendidos, cls: "text-emerald-600 dark:text-emerald-400" },
          { k: "todos" as FiltroRapido, label: "Habilitados", n: stats.habilitados, cls: "text-slate-800 dark:text-slate-200" },
          { k: "bloqueados" as FiltroRapido, label: "Sin rastreo", n: stats.bloqueados, cls: "text-slate-500 dark:text-slate-400" },
        ]).map((s) => (
          <button
            key={s.k}
            onClick={() => setFiltro(s.k)}
            className={`text-left bg-white dark:bg-slate-900 border rounded-2xl px-4 py-3 transition-colors ${
              filtro === s.k ? "border-blue-400 dark:border-blue-700 ring-1 ring-blue-400/40" : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold font-heading tabular-nums ${s.cls}`}>{s.n}</p>
          </button>
        ))}
      </div>

      {/* Controles */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por expediente, paciente o servicio…" className={inputCls + " pl-9"} />
        </div>
        <select value={servicioFiltro} onChange={(e) => setServicioFiltro(e.target.value)} className={selectCls}>
          <option value="">Todos los servicios</option>
          {serviciosPresentes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-sm text-slate-400 py-16 text-center">Cargando pacientes activos…</p>
      ) : lista.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <ListChecks size={32} className="mx-auto mb-3 opacity-40" />
          {filtro === "pendientes" && stats.habilitados > 0 && stats.pendientes === 0 ? (
            <p className="text-sm">No queda ningún paciente pendiente hoy — lista completa.</p>
          ) : filtro === "pendientes" && stats.habilitados === 0 ? (
            <>
              <p className="text-sm">Aún no hay pacientes habilitados para seguimiento.</p>
              <p className="text-xs mt-1">
                Un paciente aparece aquí cuando su rastreo está <strong>Contactado</strong> — empieza en la pestaña{" "}
                <Link href="/dashboard/gestiones/rastreo" className="text-blue-600 dark:text-blue-400 underline">Rastreo</Link>.
              </p>
            </>
          ) : (
            <p className="text-sm">Ningún paciente coincide con el filtro.</p>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
          {paginados.map((p) => (
            <FilaSeguimiento
              key={p.id}
              paciente={p}
              rastreo={rastreos.get(p.expediente)}
              estadoRastreo={estadoRastreoDe(p.expediente)}
              hoy={hoyPorExp.get(p.expediente)}
              mes={mesPorExp.get(p.expediente)}
              mias={miasHoyPorExp.get(p.expediente)}
              onMarcar={async (a, nota) => {
                try {
                  await marcar(p, a, nota);
                  setToast({ tipo: "success", msg: `${a.chip} — ${nombrePac(p)}` });
                } catch {
                  setToast({ tipo: "error", msg: "No se pudo registrar la marca" });
                }
              }}
              onDeshacer={async (a) => {
                try {
                  await deshacer(p, a);
                  setToast({ tipo: "success", msg: "Marca eliminada" });
                } catch {
                  setToast({ tipo: "error", msg: "No se pudo deshacer la marca" });
                }
              }}
              onContactar={async () => {
                try {
                  await marcarContactado(p);
                  setToast({ tipo: "success", msg: `Contactado — ${nombrePac(p)}` });
                } catch {
                  setToast({ tipo: "error", msg: "No se pudo marcar como contactado" });
                }
              }}
            />
          ))}
        </div>
      )}

      {!loading && lista.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-slate-500 shrink-0">
            {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, lista.length)} de{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">{lista.length}</span>
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(Math.max(1, pageSafe - 1))} disabled={pageSafe === 1} className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={14} /></button>
            <span className="text-xs text-slate-500 px-2 tabular-nums">{pageSafe} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, pageSafe + 1))} disabled={pageSafe === totalPages} className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[210] flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-xl text-sm font-medium bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
          style={{ borderLeftWidth: 4, borderLeftColor: toast.tipo === "success" ? "#10b981" : "#f43f5e" }}>
          {toast.tipo === "success" ? <CheckCircle2 size={16} className="text-emerald-500" /> : <AlertTriangle size={16} className="text-rose-500" />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

// ── Fila de paciente (pasar lista) ───────────────────────────────────────────
function FilaSeguimiento({
  paciente: p, rastreo, estadoRastreo, hoy, mes, mias, onMarcar, onDeshacer, onContactar,
}: {
  paciente: Paciente;
  rastreo?: RastreoTS;
  estadoRastreo: EstadoRastreo | "pendiente";
  hoy?: Map<string, number>;
  mes?: Map<string, number>;
  mias?: Map<string, GestionTS>;
  onMarcar: (a: AccionSeguimiento, nota?: string) => Promise<void>;
  onDeshacer: (a: AccionSeguimiento) => Promise<void>;
  onContactar: () => Promise<void>;
}) {
  const bloqueado = !habilitaSeguimiento(estadoRastreo === "pendiente" ? undefined : estadoRastreo);
  const [notaAbierta, setNotaAbierta] = useState(false);
  const [nota, setNota] = useState("");
  const [ocupada, setOcupada] = useState<string | null>(null); // key de la acción en curso

  const familiar = rastreo?.familiarNombre || p.responsable?.nombre || "";
  const telefono = rastreo?.telefono || p.responsable?.telefono || p.telefono || "";

  const clic = async (a: AccionSeguimiento) => {
    if (ocupada) return;
    setOcupada(a.key);
    try {
      await onMarcar(a, nota || undefined);
      setNota("");
      setNotaAbierta(false);
    } finally {
      setOcupada(null);
    }
  };
  const quitar = async (a: AccionSeguimiento) => {
    if (ocupada) return;
    setOcupada(a.key);
    try { await onDeshacer(a); } finally { setOcupada(null); }
  };

  const totalMes = ACCIONES_SEGUIMIENTO
    .map((a) => ({ a, n: mes?.get(a.key) ?? 0 }))
    .filter((x) => x.n > 0);

  return (
    <div className="px-4 py-3">
      <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 lg:gap-4">
        {/* Identidad + contacto */}
        <div className="min-w-0 lg:w-[300px] lg:shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-slate-500">{p.expediente}</span>
            {bloqueado && (
              estadoRastreo === "pendiente" ? (
                <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border text-slate-500 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">Sin rastrear</span>
              ) : (
                <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${ESTADO_RASTREO_COLOR[estadoRastreo]}`}>{ESTADO_RASTREO_LABEL[estadoRastreo]}</span>
              )
            )}
          </div>
          <p className="font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">{nombrePac(p)}</p>
          <p className="text-xs text-slate-500 truncate">
            {p.servicioActual || "Sin servicio"}{p.camaActual ? ` · Cama ${p.camaActual}` : ""}
          </p>
          {(familiar || telefono) && (
            <p className="text-xs text-slate-500 truncate mt-0.5">
              <Phone size={10} className="inline mr-1 text-slate-400" />
              {[familiar, telefono.split("\n")[0]].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/* Chips de acciones / gate */}
        {bloqueado ? (
          <div className="flex items-center gap-2.5 flex-wrap flex-1">
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <Lock size={12} /> Sin contacto efectivo en rastreo
            </span>
            <button
              onClick={onContactar}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 hover:border-emerald-400 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <CheckCircle2 size={12} /> Marcar contactado
            </button>
            <Link
              href="/dashboard/gestiones/rastreo"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Ir a Rastreo
            </Link>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {ACCIONES_SEGUIMIENTO.map((a) => {
                const Icono = ICONO_ACCION[a.key] ?? PhoneCall;
                const nHoy = hoy?.get(a.key) ?? 0;
                const miaHoy = !!mias?.get(a.key);
                const cargando = ocupada === a.key;
                return (
                  <span key={a.key} className="inline-flex items-stretch">
                    <button
                      onClick={() => clic(a)}
                      disabled={!!ocupada}
                      title={nHoy > 0 ? `${a.chip} — ${nHoy} hoy (toca para agregar otra)` : `Registrar: ${a.chip}`}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 border transition-colors disabled:opacity-60 ${
                        miaHoy ? "rounded-l-lg" : "rounded-lg"
                      } ${
                        nHoy > 0
                          ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                          : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400"
                      }`}
                    >
                      {cargando ? <Loader2 size={13} className="animate-spin" /> : <Icono size={13} />}
                      {a.chip}
                      {nHoy > 0 && <span className="font-bold tabular-nums">{nHoy}</span>}
                    </button>
                    {miaHoy && (
                      <button
                        onClick={() => quitar(a)}
                        disabled={!!ocupada}
                        title="Deshacer mi última marca de hoy"
                        className="inline-flex items-center px-1 rounded-r-lg border border-l-0 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-600/70 hover:text-rose-500 transition-colors disabled:opacity-60"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </span>
                );
              })}
              <button
                onClick={() => setNotaAbierta((v) => !v)}
                title="Agregar una nota a la próxima marca"
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg border transition-colors ${
                  notaAbierta || nota
                    ? "bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300"
                    : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-amber-400"
                }`}
              >
                <StickyNote size={12} /> Nota
              </button>
            </div>

            {/* Nota — se adjunta a la próxima acción que se marque */}
            {notaAbierta && (
              <div className="mt-2">
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder="Escribe la nota y luego toca la acción a registrar — la nota se adjunta a esa marca…"
                  className={inputCls + " resize-y text-xs"}
                />
              </div>
            )}

            {/* Totales del mes por paciente (los "TOTAL MENSUAL" del Excel) */}
            <p className="text-[11px] text-slate-400 mt-1.5">
              {totalMes.length === 0
                ? "Sin seguimientos este mes"
                : <>Este mes: {totalMes.map(({ a, n }, i) => (
                    <span key={a.key}>{i > 0 && " · "}<span className="text-slate-500 dark:text-slate-400 font-medium">{a.chip} ×{n}</span></span>
                  ))}</>}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
