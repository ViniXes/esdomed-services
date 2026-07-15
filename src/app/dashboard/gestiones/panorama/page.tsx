"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { GestionTS, Paciente } from "@/types";
import {
  ESTADO_RASTREO_COLOR, ESTADO_RASTREO_LABEL, habilitaSeguimiento, labelTipoGestion,
  TIPOS_GESTION_TS, type EstadoRastreo, type GrupoGestionTS,
} from "@/lib/trabajosocial/catalogos";
import { refResumenRastreo, type MapaResumenRastreo } from "@/lib/trabajosocial/resumenTS";
import {
  consultarPacientesActivos, getPacientesActivosCache, getPacientesActivosCacheEn,
} from "@/lib/trabajosocial/pacientesActivosCache";
import {
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, LayoutDashboard, Lock, NotebookPen, RefreshCw, Search, User, X,
} from "lucide-react";

// ── Helpers ─────────────────────────────────────────────────────────────────
const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const selectCls =
  "appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";

const nombrePac = (p: Paciente) => `${p.apellidos}, ${p.nombres}`;

const hoyStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};
const haceDiasStr = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};
const toMillis = (ts: unknown) => (ts as { toMillis?: () => number })?.toMillis?.() ?? 0;

// Fecha "YYYY-MM-DD" → etiqueta relativa corta (hoy / ayer / DD mmm).
const fmtFechaRel = (fecha: string): string => {
  if (fecha === hoyStr()) return "hoy";
  if (fecha === haceDiasStr(1)) return "ayer";
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("es-HN", { day: "2-digit", month: "short" });
};

// Grupo de catálogo al que pertenece un tipo de gestión (para el pipeline).
const GRUPO_DE_TIPO: Record<string, GrupoGestionTS> = Object.fromEntries(
  TIPOS_GESTION_TS.map((t) => [t.id, t.grupo]),
);

// Etapas del pipeline visibles en cada paciente (además de Rastreo, que es el paso 0).
const ETAPAS: { key: GrupoGestionTS; label: string }[] = [
  { key: "Seguimiento", label: "Seguimiento" },
  { key: "Visitas", label: "Visitas" },
  { key: "Documentos", label: "Documentos" },
  { key: "Altas", label: "Alta" },
];

// Máximo de servicios (grupos) por página en el panorama.
const PAGE_SIZE = 20;

type FiltroRapido = "todos" | "sin_rastreo" | "contactados" | "gestion_hoy";

interface ResumenGestion {
  tipo: string;
  trabajadoraNombre: string;
  fecha: string;
  creadoEn: unknown;
}

export default function PanoramaPage() {
  const { profile } = useAuth();

  const [pacientes, setPacientes] = useState<Paciente[]>(() => getPacientesActivosCache() ?? []);
  const [loading, setLoading] = useState(() => getPacientesActivosCache() === null);
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(() => getPacientesActivosCacheEn());
  const [rastreos, setRastreos] = useState<MapaResumenRastreo>({});
  const [gestiones, setGestiones] = useState<GestionTS[]>([]);
  const [permissionError, setPermissionError] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [servicioFiltro, setServicioFiltro] = useState("");
  const [soloMios, setSoloMios] = useState(false);
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>("todos");
  // Grupos EXPANDIDos (por servicio). Vacío = todos colapsados por defecto.
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  // Pacientes activos creados por ESDOMED (mismo universo que Rastreo/Seguimiento).
  // Lectura puntual bajo demanda (caché compartida entre las 3 pestañas de
  // Gestiones + Visitas) en lugar de un listener en vivo sin límite.
  const consultarPacientes = useCallback(async () => {
    setLoading(true);
    try {
      setPacientes(await consultarPacientesActivos());
      setActualizadoEn(getPacientesActivosCacheEn());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getPacientesActivosCache() !== null) return;
    const t = setTimeout(consultarPacientes, 0);
    return () => clearTimeout(t);
  }, [consultarPacientes]);

  // Tablero de rastreo: UN doc resumen (ts_resumen/rastreo) en vez de la
  // colección completa — leerlo entero cuesta 1 lectura y no crece con la historia.
  useEffect(() => {
    return onSnapshot(refResumenRastreo(), (s) => {
      setPermissionError(false);
      setRastreos((s.data()?.porExp as MapaResumenRastreo | undefined) ?? {});
    }, (err) => { if (err.code === "permission-denied") setPermissionError(true); });
  }, []);

  // Gestiones recientes (últimos 30 días) — acotado por costo de lecturas.
  useEffect(() => {
    const desde = haceDiasStr(30);
    const q = query(collection(db, "gestiones_ts"), where("fecha", ">=", desde));
    return onSnapshot(q, (s) => {
      setGestiones(s.docs.map((d) => ({ id: d.id, ...d.data() } as GestionTS)));
    }, () => { /* si falla, el panorama sigue con rastreo */ });
  }, []);

  // Índices derivados de las gestiones recientes.
  const { ultimaPorExp, gruposPorExp, hoyPorExp, misExp } = useMemo(() => {
    const ultima = new Map<string, ResumenGestion>();
    const grupos = new Map<string, Set<GrupoGestionTS>>();
    const hoy = new Set<string>();
    const mios = new Set<string>();
    const hoyS = hoyStr();
    for (const g of gestiones) {
      const exp = g.expediente;
      // Última gestión por creadoEn.
      const prev = ultima.get(exp);
      if (!prev || toMillis(g.creadoEn) > toMillis(prev.creadoEn)) {
        ultima.set(exp, { tipo: g.tipo, trabajadoraNombre: g.trabajadoraNombre, fecha: g.fecha, creadoEn: g.creadoEn });
      }
      // Grupos tocados (pipeline).
      const grp = GRUPO_DE_TIPO[g.tipo];
      if (grp) {
        const set = grupos.get(exp) ?? new Set<GrupoGestionTS>();
        set.add(grp);
        grupos.set(exp, set);
      }
      if (g.fecha === hoyS) hoy.add(exp);
      if (g.trabajadoraId === profile?.uid) mios.add(exp);
    }
    return { ultimaPorExp: ultima, gruposPorExp: grupos, hoyPorExp: hoy, misExp: mios };
  }, [gestiones, profile?.uid]);

  const estadoRastreoDe = useCallback(
    (exp: string): EstadoRastreo | "pendiente" => rastreos[exp]?.e ?? "pendiente",
    [rastreos],
  );

  // Lista de servicios presentes entre los activos (para el filtro).
  const serviciosPresentes = useMemo(() => {
    const set = new Set<string>();
    pacientes.forEach((p) => set.add(p.servicioActual || "Sin servicio"));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [pacientes]);

  // Stats globales (sobre todos los activos, no sobre el filtro).
  const stats = useMemo(() => {
    let sinRastreo = 0, contactados = 0, conHoy = 0;
    for (const p of pacientes) {
      const e = estadoRastreoDe(p.expediente);
      if (e === "pendiente" || e === "en_gestion") sinRastreo++;
      if (e === "contactado") contactados++;
      if (hoyPorExp.has(p.expediente)) conHoy++;
    }
    return { total: pacientes.length, sinRastreo, contactados, conHoy };
  }, [pacientes, estadoRastreoDe, hoyPorExp]);

  // Filtrado + agrupación por servicio.
  const grupos = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const filtrados = pacientes.filter((p) => {
      const servicio = p.servicioActual || "Sin servicio";
      if (servicioFiltro && servicio !== servicioFiltro) return false;
      if (soloMios && !misExp.has(p.expediente)) return false;
      const e = estadoRastreoDe(p.expediente);
      if (filtroRapido === "sin_rastreo" && !(e === "pendiente" || e === "en_gestion")) return false;
      if (filtroRapido === "contactados" && e !== "contactado") return false;
      if (filtroRapido === "gestion_hoy" && !hoyPorExp.has(p.expediente)) return false;
      if (t && !(
        p.expediente.toLowerCase().includes(t) ||
        nombrePac(p).toLowerCase().includes(t) ||
        servicio.toLowerCase().includes(t)
      )) return false;
      return true;
    });

    const porServicio = new Map<string, Paciente[]>();
    for (const p of filtrados) {
      const s = p.servicioActual || "Sin servicio";
      const arr = porServicio.get(s) ?? [];
      arr.push(p);
      porServicio.set(s, arr);
    }
    return [...porServicio.entries()]
      .map(([servicio, pac]) => ({ servicio, pacientes: pac.sort((a, b) => nombrePac(a).localeCompare(nombrePac(b))) }))
      .sort((a, b) => a.servicio.localeCompare(b.servicio));
  }, [pacientes, estadoRastreoDe, busqueda, servicioFiltro, soloMios, filtroRapido, misExp, hoyPorExp]);

  const totalFiltrado = grupos.reduce((n, g) => n + g.pacientes.length, 0);

  // Paginación de los grupos por servicio (20 por página). Colapsados por
  // defecto; reinicia a la página 1 al cambiar filtros.
  const totalPages = Math.max(1, Math.ceil(grupos.length / PAGE_SIZE));
  const filtrosKey = `${busqueda}|${servicioFiltro}|${soloMios}|${filtroRapido}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) { setFiltrosPrevios(filtrosKey); setPage(1); }
  const pageSafe = Math.min(page, totalPages);
  const gruposPagina = grupos.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  const toggleGrupo = (s: string) =>
    setExpandidos((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s); else n.add(s);
      return n;
    });

  const hayFiltro = !!(busqueda || servicioFiltro || soloMios || filtroRapido !== "todos");
  const limpiar = () => { setBusqueda(""); setServicioFiltro(""); setSoloMios(false); setFiltroRapido("todos"); };

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
            <LayoutDashboard size={13} /> Trabajo Social
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Panorama</h1>
        </div>
        <button
          onClick={consultarPacientes}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
          title={actualizadoEn ? `Actualizado a las ${actualizadoEn.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit", hour12: false })}` : "Actualizar"}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Actualizar censo
        </button>
      </div>


      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer los rastreos. Pide al administrador que despliegue la regla de la colección <strong>rastreos_ts</strong>.
        </div>
      )}

      {/* Stats clicables */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {([
          { k: "todos" as FiltroRapido, label: "Activos", n: stats.total, cls: "text-slate-800 dark:text-slate-200" },
          { k: "sin_rastreo" as FiltroRapido, label: "Sin rastrear", n: stats.sinRastreo, cls: "text-amber-600 dark:text-amber-400" },
          { k: "contactados" as FiltroRapido, label: "Contactados", n: stats.contactados, cls: "text-emerald-600 dark:text-emerald-400" },
          { k: "gestion_hoy" as FiltroRapido, label: "Con gestión hoy", n: stats.conHoy, cls: "text-blue-600 dark:text-blue-400" },
        ]).map((s) => (
          <button
            key={s.k}
            onClick={() => setFiltroRapido((f) => (f === s.k ? "todos" : s.k))}
            className={`text-left bg-white dark:bg-slate-900 border rounded-2xl px-4 py-3 transition-colors ${
              filtroRapido === s.k ? "border-blue-400 dark:border-blue-700 ring-1 ring-blue-400/40" : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold font-heading tabular-nums ${s.cls}`}>{s.n}</p>
          </button>
        ))}
      </div>

      {/* Controles */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por expediente, paciente o servicio…" className={inputCls + " pl-9"} />
        </div>
        <select value={servicioFiltro} onChange={(e) => setServicioFiltro(e.target.value)} className={selectCls}>
          <option value="">Todos los servicios</option>
          {serviciosPresentes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          onClick={() => setSoloMios((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
            soloMios
              ? "bg-blue-600 border-blue-600 text-white"
              : "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-300"
          }`}
        >
          <User size={14} /> Solo lo que yo trabajé
        </button>
        {hayFiltro && (
          <button onClick={limpiar}
            className="inline-flex items-center gap-1 px-3 py-2.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Lista agrupada por servicio */}
      {loading ? (
        <p className="text-sm text-slate-400 py-16 text-center">Cargando pacientes activos…</p>
      ) : totalFiltrado === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <LayoutDashboard size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{pacientes.length === 0 ? "No hay pacientes activos." : "Ningún paciente coincide con el filtro."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {gruposPagina.map(({ servicio, pacientes: pac }) => {
            const colapsado = !expandidos.has(servicio);
            return (
              <div key={servicio} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <button onClick={() => toggleGrupo(servicio)}
                  className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <ChevronDown size={15} className={`text-slate-400 transition-transform ${colapsado ? "-rotate-90" : ""}`} />
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200 flex-1 text-left">{servicio}</span>
                  <span className="text-xs font-medium text-slate-400 tabular-nums">{pac.length}</span>
                </button>
                {!colapsado && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                    {pac.map((p) => (
                      <FilaPaciente
                        key={p.id}
                        paciente={p}
                        estadoRastreo={estadoRastreoDe(p.expediente)}
                        gruposTocados={gruposPorExp.get(p.expediente)}
                        ultima={ultimaPorExp.get(p.expediente)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && grupos.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-slate-500 shrink-0">
            {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, grupos.length)} de{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">{grupos.length}</span> servicios
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(Math.max(1, pageSafe - 1))} disabled={pageSafe === 1} className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={14} /></button>
            <span className="text-xs text-slate-500 px-2 tabular-nums">{pageSafe} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, pageSafe + 1))} disabled={pageSafe === totalPages} className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fila de paciente ─────────────────────────────────────────────────────────
function FilaPaciente({
  paciente: p, estadoRastreo, gruposTocados, ultima,
}: {
  paciente: Paciente;
  estadoRastreo: EstadoRastreo | "pendiente";
  gruposTocados?: Set<GrupoGestionTS>;
  ultima?: ResumenGestion;
}) {
  const habilita = habilitaSeguimiento(estadoRastreo === "pendiente" ? undefined : estadoRastreo);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3">
      {/* Identidad */}
      <div className="min-w-0 sm:flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-slate-500">{p.expediente}</span>
          {estadoRastreo === "pendiente" ? (
            <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border text-slate-500 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">Sin rastrear</span>
          ) : (
            <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${ESTADO_RASTREO_COLOR[estadoRastreo]}`}>{ESTADO_RASTREO_LABEL[estadoRastreo]}</span>
          )}
          {habilita ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={11} /> Contacto familiar</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400"><Lock size={11} /> Sin contacto familiar</span>
          )}
        </div>
        <p className="font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">{nombrePac(p)}</p>
        <p className="text-xs text-slate-500">{p.camaActual ? `Cama ${p.camaActual}` : "Sin cama"}</p>
      </div>

      {/* Pipeline */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Etapa label="Rastreo" on={habilita} />
        {ETAPAS.map((e) => <Etapa key={e.key} label={e.label} on={gruposTocados?.has(e.key) ?? false} />)}
      </div>

      {/* Última gestión + acción */}
      <div className="flex items-center justify-between gap-3 sm:w-[300px] sm:shrink-0">
        <div className="min-w-0 flex-1">
          {ultima ? (
            <p className="text-xs text-slate-500 truncate">
              <span className="text-slate-700 dark:text-slate-300 font-medium">{labelTipoGestion(ultima.tipo)}</span>
              {" · "}{ultima.trabajadoraNombre}{" · "}{fmtFechaRel(ultima.fecha)}
            </p>
          ) : (
            <p className="text-xs text-slate-400 italic">Sin gestión reciente</p>
          )}
        </div>
        <Link prefetch={false}
          href={`/dashboard/gestiones?exp=${encodeURIComponent(p.expediente)}`}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <NotebookPen size={12} /> Registrar
        </Link>
      </div>
    </div>
  );
}

function Etapa({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      title={`${label}: ${on ? "hecho" : "pendiente"}`}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
        on
          ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900"
          : "text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
      {label}
    </span>
  );
}
