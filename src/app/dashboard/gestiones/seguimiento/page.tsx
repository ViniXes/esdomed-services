"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, deleteField, doc, onSnapshot, query, Timestamp, updateDoc, where, writeBatch,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { GestionTS, Paciente } from "@/types";
import {
  ACCIONES_SEGUIMIENTO, ESTADO_RASTREO_COLOR, ESTADO_RASTREO_LABEL, esTipoVisita,
  GRUPOS_GESTION_TS, keyAccionSeguimiento, labelTipoGestion,
  TIPOS_GESTION_TS, type AccionSeguimiento, type EstadoRastreo,
} from "@/lib/trabajosocial/catalogos";
import {
  refResumenRastreo, refResumenSeguimiento, resumenRastreoSet, resumenSeguimientoInc,
  type MapaResumenRastreo, type MapaResumenSeguimiento,
} from "@/lib/trabajosocial/resumenTS";
import {
  consultarPacientesActivos, getPacientesActivosCache, getPacientesActivosCacheEn,
} from "@/lib/trabajosocial/pacientesActivosCache";
import { GestionesTabs } from "../_components/GestionesTabs";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ListChecks, Loader2,
  Phone, PhoneCall, Plus, RefreshCw, Search, StickyNote, Stethoscope, Users, Video, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const selectCls =
  "appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";
const tdCls = "px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap align-middle";
const thCls = "px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap";

// Ícono de cada acción rápida (llave = tipo|modalidad del catálogo).
const ICONO_ACCION: Record<string, LucideIcon> = {
  "seguimiento_familiar|videollamada": Video,
  "seguimiento_familiar|llamada": Phone,
  "llamada_con_medico|llamada": Stethoscope,
  "seguimiento_sts|llamada": PhoneCall,
  "visita_familiar|presencial": Users,
};

// Encabezado corto de columna por acción — el vocabulario de su hoja de Excel.
const COLUMNA_ACCION: Record<string, string> = {
  "seguimiento_familiar|videollamada": "Videollamada",
  "seguimiento_familiar|llamada": "Llam. familiar",
  "llamada_con_medico|llamada": "Llam. médico",
  "seguimiento_sts|llamada": "Seg. STS",
  "visita_familiar|presencial": "Visita",
};

const ACCION_KEYS = new Set(ACCIONES_SEGUIMIENTO.map((a) => a.key));

// Máximo de pacientes por página en la lista del día.
const PAGE_SIZE = 25;

const hoyStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};
const mesStr = () => hoyStr().slice(0, 7);
const nombrePac = (p: Paciente) => `${p.apellidos}, ${p.nombres}`;
const toMillis = (ts: unknown) => (ts as { toMillis?: () => number })?.toMillis?.() ?? 0;

type FiltroRapido = "pendientes" | "atendidos" | "adicionales" | "sin_contacto" | "todos";

export default function SeguimientoPage() {
  const { profile } = useAuth();

  const [pacientes, setPacientes] = useState<Paciente[]>(() => getPacientesActivosCache() ?? []);
  const [loading, setLoading] = useState(() => getPacientesActivosCache() === null);
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(() => getPacientesActivosCacheEn());
  // Tablero de rastreo: UN doc resumen (estado + familiar/teléfono por expediente).
  const [rastreos, setRastreos] = useState<MapaResumenRastreo>({});
  // Gestiones de HOY (acotado por naturaleza: el día, no el mes).
  const [gestionesHoy, setGestionesHoy] = useState<GestionTS[]>([]);
  // Totales del mes por paciente: UN doc resumen (los "TOTAL MENSUAL" del Excel).
  const [resumenMes, setResumenMes] = useState<MapaResumenSeguimiento>({});
  const [permissionError, setPermissionError] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [servicioFiltro, setServicioFiltro] = useState("");
  const [filtro, setFiltro] = useState<FiltroRapido>("pendientes");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ tipo: "success" | "error"; msg: string } | null>(null);

  // Pacientes activos creados por ESDOMED (mismo universo que Rastreo/Panorama).
  // Lectura puntual bajo demanda con caché compartida entre pestañas.
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

  // Tablero de rastreo (1 doc): estado del contacto + datos del familiar.
  useEffect(() => {
    return onSnapshot(refResumenRastreo(), (s) => {
      setRastreos((s.data()?.porExp as MapaResumenRastreo | undefined) ?? {});
    }, (err) => { if (err.code === "permission-denied") setPermissionError(true); });
  }, []);

  // Marcas de HOY en vivo (coordinación del turno entre trabajadoras).
  useEffect(() => {
    const q = query(collection(db, "gestiones_ts"), where("fecha", "==", hoyStr()));
    return onSnapshot(q, (s) => {
      setPermissionError(false);
      setGestionesHoy(s.docs.map((d) => ({ id: d.id, ...d.data() } as GestionTS)));
    }, (err) => { if (err.code === "permission-denied") setPermissionError(true); });
  }, []);

  // Totales del mes por paciente (1 doc, mantenido con increment() en cada marca).
  useEffect(() => {
    return onSnapshot(refResumenSeguimiento(mesStr()), (s) => {
      setResumenMes((s.data()?.porExp as MapaResumenSeguimiento | undefined) ?? {});
    }, () => { /* opcional: sin totales del mes la vista sigue funcionando */ });
  }, []);

  // Índices por expediente sobre las gestiones de hoy: marcas por acción,
  // "mi última de hoy" (para deshacer/nota) y las gestiones ADICIONALES.
  const { hoyPorExp, miasHoyPorExp, adicionalesHoyPorExp } = useMemo(() => {
    const hoy = new Map<string, Map<string, number>>();
    const mias = new Map<string, Map<string, GestionTS>>();
    const adicionales = new Map<string, GestionTS[]>();
    for (const g of gestionesHoy) {
      const k = keyAccionSeguimiento(g);
      if (!ACCION_KEYS.has(k)) {
        adicionales.set(g.expediente, [...(adicionales.get(g.expediente) ?? []), g]);
        continue;
      }
      const sub = hoy.get(g.expediente) ?? new Map<string, number>();
      sub.set(k, (sub.get(k) ?? 0) + 1);
      hoy.set(g.expediente, sub);
      if (g.trabajadoraId === profile?.uid) {
        const m = mias.get(g.expediente) ?? new Map<string, GestionTS>();
        const prev = m.get(k);
        if (!prev || toMillis(g.creadoEn) > toMillis(prev.creadoEn)) m.set(k, g);
        mias.set(g.expediente, m);
      }
    }
    return { hoyPorExp: hoy, miasHoyPorExp: mias, adicionalesHoyPorExp: adicionales };
  }, [gestionesHoy, profile?.uid]);

  const estadoRastreoDe = useCallback(
    (exp: string): EstadoRastreo | "pendiente" => rastreos[exp]?.e ?? "pendiente",
    [rastreos],
  );
  // "Sin contacto familiar": rastreo pendiente/en gestión/no efectivo. No incluye
  // alta/defunción/no aplica (estados deliberados, no deuda de rastreo).
  const sinContacto = useCallback((exp: string) => {
    const e = estadoRastreoDe(exp);
    return e === "pendiente" || e === "en_gestion" || e === "no_efectivo";
  }, [estadoRastreoDe]);
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
    let aten = 0, pend = 0, sinC = 0, adic = 0;
    for (const p of pacientes) {
      const a = atendidoHoy(p.expediente);
      if (a) aten++; else pend++;
      if (sinContacto(p.expediente)) sinC++;
      if ((adicionalesHoyPorExp.get(p.expediente)?.length ?? 0) > 0) adic++;
    }
    return { total: pacientes.length, atendidos: aten, pendientes: pend, sinContacto: sinC, adicionales: adic };
  }, [pacientes, atendidoHoy, sinContacto, adicionalesHoyPorExp]);

  // Lista plana (servicio → nombre): el orden natural de "bajar la lista".
  const lista = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return pacientes
      .filter((p) => {
        const servicio = p.servicioActual || "Sin servicio";
        if (servicioFiltro && servicio !== servicioFiltro) return false;
        const aten = atendidoHoy(p.expediente);
        if (filtro === "pendientes" && aten) return false;
        if (filtro === "atendidos" && !aten) return false;
        if (filtro === "adicionales" && (adicionalesHoyPorExp.get(p.expediente)?.length ?? 0) === 0) return false;
        if (filtro === "sin_contacto" && !sinContacto(p.expediente)) return false;
        if (!t) return true;
        const r = rastreos[p.expediente];
        return (
          p.expediente.toLowerCase().includes(t) ||
          nombrePac(p).toLowerCase().includes(t) ||
          servicio.toLowerCase().includes(t) ||
          (r?.f ?? "").toLowerCase().includes(t)
        );
      })
      .sort((a, b) =>
        (a.servicioActual || "").localeCompare(b.servicioActual || "") ||
        nombrePac(a).localeCompare(nombrePac(b)),
      );
  }, [pacientes, busqueda, servicioFiltro, filtro, atendidoHoy, sinContacto, adicionalesHoyPorExp, rastreos]);

  // Paginación (patrón estándar del proyecto: reset render-time + pageSafe).
  const totalPages = Math.max(1, Math.ceil(lista.length / PAGE_SIZE));
  const filtrosKey = `${busqueda}|${servicioFiltro}|${filtro}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) { setFiltrosPrevios(filtrosKey); setPage(1); }
  const pageSafe = Math.min(page, totalPages);
  const paginados = lista.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  // ── Acciones ────────────────────────────────────────────────────────────────

  // Marca una acción del día. Un solo batch atómico: gestión + total del mes +
  // (si hacía falta) el contacto de rastreo — registrar una gestión CON el
  // familiar demuestra el contacto, así que el rastreo se completa solo.
  // Devuelve true si además marcó el contacto.
  const marcar = useCallback(async (p: Paciente, a: AccionSeguimiento): Promise<boolean> => {
    if (!profile) return false;
    const hoyS = hoyStr();
    const nuevo: Record<string, unknown> = {
      expediente: p.expediente,
      pacienteNombre: nombrePac(p),
      servicio: p.servicioActual || undefined,
      estadoPaciente: "actual",
      vinculadoPadron: true,
      tipo: a.tipo,
      resultadoVisita: a.resultadoVisita,
      modalidad: a.modalidad,
      fecha: hoyS,
      trabajadoraId: profile.uid,
      trabajadoraNombre: profile.nombre,
      creadoEn: Timestamp.now(),
    };
    const payload = Object.fromEntries(Object.entries(nuevo).filter(([, v]) => v !== undefined));
    const batch = writeBatch(db);
    batch.set(doc(collection(db, "gestiones_ts")), payload);
    resumenSeguimientoInc(batch, mesStr(), p.expediente, a.key, 1);
    const est = rastreos[p.expediente]?.e;
    const autoContacto = est === undefined || est === "en_gestion" || est === "no_efectivo";
    if (autoContacto) {
      batch.set(doc(db, "rastreos_ts", p.expediente), {
        expediente: p.expediente,
        pacienteId: p.id ?? null,
        pacienteNombre: nombrePac(p),
        servicio: p.servicioActual ?? null,
        cama: p.camaActual ?? null,
        vinculadoPadron: true,
        estado: "contactado",
        fechaContacto: hoyS,
        trabajadoraId: profile.uid,
        trabajadoraNombre: profile.nombre,
        actualizadoEn: Timestamp.now(),
        ...(est === undefined ? { creadoEn: Timestamp.now() } : {}),
      }, { merge: true });
      resumenRastreoSet(batch, p.expediente, { e: "contactado", u: hoyS });
    }
    await batch.commit();
    return autoContacto;
  }, [profile, rastreos]);

  // Registra una gestión ADICIONAL (cualquier tipo del catálogo). No implica
  // contacto con el familiar → NO toca el rastreo ni los totales de acciones.
  const marcarAdicional = useCallback(async (p: Paciente, tipo: string) => {
    if (!profile || !tipo) return;
    const nuevo: Record<string, unknown> = {
      expediente: p.expediente,
      pacienteNombre: nombrePac(p),
      servicio: p.servicioActual || undefined,
      estadoPaciente: "actual",
      vinculadoPadron: true,
      tipo,
      resultadoVisita: esTipoVisita(tipo) ? "realizada" : undefined,
      modalidad: "presencial",
      fecha: hoyStr(),
      trabajadoraId: profile.uid,
      trabajadoraNombre: profile.nombre,
      creadoEn: Timestamp.now(),
    };
    const payload = Object.fromEntries(Object.entries(nuevo).filter(([, v]) => v !== undefined));
    await addDoc(collection(db, "gestiones_ts"), payload);
  }, [profile]);

  // Agrega/edita la nota de MI última marca de hoy de esa acción (el flujo es
  // marcar primero y anotar después; texto vacío borra la nota).
  const guardarNota = useCallback(async (p: Paciente, a: AccionSeguimiento, texto: string) => {
    const mia = miasHoyPorExp.get(p.expediente)?.get(a.key);
    if (!mia?.id) return;
    await updateDoc(doc(db, "gestiones_ts", mia.id), {
      notas: texto.trim() || deleteField(),
    });
  }, [miasHoyPorExp]);

  // Deshace MI última marca de hoy de esa acción (resta también el total del mes).
  const deshacer = useCallback(async (p: Paciente, a: AccionSeguimiento) => {
    const mia = miasHoyPorExp.get(p.expediente)?.get(a.key);
    if (!mia?.id) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, "gestiones_ts", mia.id));
    resumenSeguimientoInc(batch, mesStr(), p.expediente, a.key, -1);
    await batch.commit();
  }, [miasHoyPorExp]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Callbacks por paciente para las filas (tabla y tarjeta comparten lógica).
  const handlersDe = (p: Paciente): HandlersFila => ({
    onMarcar: async (a) => {
      try {
        const auto = await marcar(p, a);
        setToast({
          tipo: "success",
          msg: auto ? `${a.chip} — contacto familiar registrado en Rastreo` : `${a.chip} — ${nombrePac(p)}`,
        });
      } catch {
        setToast({ tipo: "error", msg: "No se pudo registrar la marca" });
      }
    },
    onNota: async (a, texto) => {
      try {
        await guardarNota(p, a, texto);
        setToast({ tipo: "success", msg: texto.trim() ? "Nota guardada" : "Nota eliminada" });
      } catch {
        setToast({ tipo: "error", msg: "No se pudo guardar la nota" });
      }
    },
    onAdicional: async (tipo) => {
      try {
        await marcarAdicional(p, tipo);
        setToast({ tipo: "success", msg: `${labelTipoGestion(tipo)} — ${nombrePac(p)}` });
      } catch {
        setToast({ tipo: "error", msg: "No se pudo registrar la gestión adicional" });
      }
    },
    onDeshacer: async (a) => {
      try {
        await deshacer(p, a);
        setToast({ tipo: "success", msg: "Marca eliminada" });
      } catch {
        setToast({ tipo: "error", msg: "No se pudo deshacer la marca" });
      }
    },
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
            <ListChecks size={13} /> Trabajo Social
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Seguimiento del día</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pasa lista de los pacientes activos: cada marca registra la gestión del día — sin volver a escribir al paciente
          </p>
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

      <GestionesTabs />

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer las gestiones o el tablero. Pide al administrador que despliegue las reglas de <strong>gestiones_ts</strong>, <strong>rastreos_ts</strong> y <strong>ts_resumen</strong>.
        </div>
      )}

      {/* Regla de negocio (el gate invertido) */}
      <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>
          Todos los pacientes activos pueden recibir gestiones. Al marcar una acción <strong>con el familiar</strong>,
          el rastreo se completa como <strong>Contactado</strong> automáticamente — los marcados en ámbar siguen pendientes de rastreo.
        </span>
      </div>

      {/* Stats clicables */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {([
          { k: "pendientes" as FiltroRapido, label: "Pendientes hoy", n: stats.pendientes, cls: "text-amber-600 dark:text-amber-400" },
          { k: "atendidos" as FiltroRapido, label: "Atendidos hoy", n: stats.atendidos, cls: "text-emerald-600 dark:text-emerald-400" },
          { k: "adicionales" as FiltroRapido, label: "Gestiones adicionales", n: stats.adicionales, cls: "text-violet-600 dark:text-violet-400" },
          { k: "sin_contacto" as FiltroRapido, label: "Sin contacto familiar", n: stats.sinContacto, cls: "text-rose-600 dark:text-rose-400" },
          { k: "todos" as FiltroRapido, label: "Activos", n: stats.total, cls: "text-slate-800 dark:text-slate-200" },
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
            placeholder="Buscar por expediente, paciente, familiar o servicio…" className={inputCls + " pl-9"} />
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
          {filtro === "pendientes" && stats.total > 0 && stats.pendientes === 0 ? (
            <p className="text-sm">No queda ningún paciente pendiente hoy — lista completa.</p>
          ) : (
            <p className="text-sm">Ningún paciente coincide con el filtro.</p>
          )}
        </div>
      ) : (
        <>
          {/* Escritorio: tabla-hoja con una columna por acción (como su Excel) */}
          <div className="hidden lg:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900">
                  <th className={thCls + " sticky left-0 z-10 bg-slate-50 dark:bg-slate-900"}>Exp.</th>
                  <th className={thCls + " sticky left-[88px] z-10 bg-slate-50 dark:bg-slate-900"}>Paciente</th>
                  <th className={thCls}>Servicio</th>
                  <th className={thCls}>Cama</th>
                  <th className={thCls}>Familiar</th>
                  <th className={thCls}>Teléfono</th>
                  <th className={thCls}>Rastreo</th>
                  {ACCIONES_SEGUIMIENTO.map((a) => (
                    <th key={a.key} className={thCls + " text-center"} title={a.chip}>{COLUMNA_ACCION[a.key] ?? a.chip}</th>
                  ))}
                  <th className={thCls + " text-center"} title="Otra gestión del catálogo">Otra</th>
                  <th className={thCls + " text-center"} title="Total del mes (5 acciones)">Mes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginados.map((p) => (
                  <FilaTabla
                    key={p.id}
                    paciente={p}
                    entrada={rastreos[p.expediente]}
                    estadoRastreo={estadoRastreoDe(p.expediente)}
                    hoy={hoyPorExp.get(p.expediente)}
                    mes={resumenMes[p.expediente]}
                    mias={miasHoyPorExp.get(p.expediente)}
                    adicionales={adicionalesHoyPorExp.get(p.expediente)}
                    {...handlersDe(p)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil / tablet: tarjetas con los mismos chips */}
          <div className="lg:hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
            {paginados.map((p) => (
              <FilaTarjeta
                key={p.id}
                paciente={p}
                entrada={rastreos[p.expediente]}
                estadoRastreo={estadoRastreoDe(p.expediente)}
                hoy={hoyPorExp.get(p.expediente)}
                mes={resumenMes[p.expediente]}
                mias={miasHoyPorExp.get(p.expediente)}
                adicionales={adicionalesHoyPorExp.get(p.expediente)}
                {...handlersDe(p)}
              />
            ))}
          </div>
        </>
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

// ── Tipos compartidos por las filas ──────────────────────────────────────────
interface HandlersFila {
  onMarcar: (a: AccionSeguimiento) => Promise<void>;
  onDeshacer: (a: AccionSeguimiento) => Promise<void>;
  onNota: (a: AccionSeguimiento, texto: string) => Promise<void>;
  onAdicional: (tipo: string) => Promise<void>;
}
interface PropsFila extends HandlersFila {
  paciente: Paciente;
  entrada?: { f?: string | null; p?: string | null; t?: string | null };
  estadoRastreo: EstadoRastreo | "pendiente";
  hoy?: Map<string, number>;
  mes?: Record<string, number>;
  mias?: Map<string, GestionTS>;
  adicionales?: GestionTS[];
}

// Estado local compartido por ambas presentaciones (tabla y tarjeta).
function useFilaSeguimiento(props: PropsFila) {
  const { mias, onMarcar, onDeshacer, onNota, onAdicional } = props;
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [notaKey, setNotaKey] = useState<string | null>(null);
  const [notaTexto, setNotaTexto] = useState("");
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [adicionalAbierto, setAdicionalAbierto] = useState(false);
  const [tipoAdicional, setTipoAdicional] = useState("");
  const [guardandoAdicional, setGuardandoAdicional] = useState(false);

  const clic = async (a: AccionSeguimiento) => {
    if (ocupada) return;
    setOcupada(a.key);
    try { await onMarcar(a); } finally { setOcupada(null); }
  };
  const quitar = async (a: AccionSeguimiento) => {
    if (ocupada) return;
    setOcupada(a.key);
    try {
      await onDeshacer(a);
      if (notaKey === a.key) setNotaKey(null);
    } finally { setOcupada(null); }
  };
  const abrirNota = (a: AccionSeguimiento) => {
    if (notaKey === a.key) { setNotaKey(null); return; }
    setNotaTexto(mias?.get(a.key)?.notas ?? "");
    setNotaKey(a.key);
  };
  const guardarNota = async () => {
    const accion = ACCIONES_SEGUIMIENTO.find((a) => a.key === notaKey);
    if (!accion) return;
    setGuardandoNota(true);
    try {
      await onNota(accion, notaTexto);
      setNotaKey(null);
    } finally { setGuardandoNota(false); }
  };
  const registrarAdicional = async () => {
    if (!tipoAdicional) return;
    setGuardandoAdicional(true);
    try {
      await onAdicional(tipoAdicional);
      setTipoAdicional("");
      setAdicionalAbierto(false);
    } finally { setGuardandoAdicional(false); }
  };

  return {
    ocupada, notaKey, notaTexto, setNotaTexto, guardandoNota,
    adicionalAbierto, setAdicionalAbierto, tipoAdicional, setTipoAdicional, guardandoAdicional,
    clic, quitar, abrirNota, guardarNota, registrarAdicional, setNotaKey,
  };
}

const BadgeRastreo = ({ e }: { e: EstadoRastreo | "pendiente" }) =>
  e === "pendiente" ? (
    <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900">
      Sin rastrear
    </span>
  ) : (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${ESTADO_RASTREO_COLOR[e]}`}>
      {ESTADO_RASTREO_LABEL[e]}
    </span>
  );

// Chip de acción con segmentos de nota/deshacer sobre MI marca de hoy.
function ChipAccion({
  a, nHoy, mia, ocupada, notaAbierta, compacto, onClic, onNota, onQuitar,
}: {
  a: AccionSeguimiento;
  nHoy: number;
  mia?: GestionTS;
  ocupada: string | null;
  notaAbierta: boolean;
  compacto?: boolean;
  onClic: () => void;
  onNota: () => void;
  onQuitar: () => void;
}) {
  const Icono = ICONO_ACCION[a.key] ?? PhoneCall;
  const cargando = ocupada === a.key;
  return (
    <span className="inline-flex items-stretch">
      <button
        onClick={onClic}
        disabled={!!ocupada}
        title={nHoy > 0 ? `${a.chip} — ${nHoy} hoy (toca para agregar otra)` : `Registrar: ${a.chip}`}
        className={`inline-flex items-center gap-1.5 text-xs font-medium border transition-colors disabled:opacity-60 ${
          compacto ? "px-2 py-1.5 justify-center" : "px-2.5 py-1.5"
        } ${mia ? "rounded-l-lg" : "rounded-lg"} ${
          nHoy > 0
            ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
            : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400"
        }`}
      >
        {cargando ? <Loader2 size={13} className="animate-spin" /> : <Icono size={13} />}
        {!compacto && a.chip}
        {nHoy > 0 && <span className="font-bold tabular-nums">{nHoy}</span>}
      </button>
      {mia && (
        <>
          <button
            onClick={onNota}
            disabled={!!ocupada}
            title={mia.notas ? `Editar nota: ${mia.notas}` : "Agregar nota a mi marca de hoy"}
            className={`inline-flex items-center px-1.5 border border-l-0 border-emerald-300 dark:border-emerald-800 transition-colors disabled:opacity-60 ${
              mia.notas || notaAbierta
                ? "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400"
                : "bg-emerald-50 dark:bg-emerald-950 text-emerald-600/70 hover:text-amber-500"
            }`}
          >
            <StickyNote size={11} />
          </button>
          <button
            onClick={onQuitar}
            disabled={!!ocupada}
            title="Deshacer mi última marca de hoy"
            className="inline-flex items-center px-1 rounded-r-lg border border-l-0 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-600/70 hover:text-rose-500 transition-colors disabled:opacity-60"
          >
            <X size={11} />
          </button>
        </>
      )}
    </span>
  );
}

// Editores compartidos (nota de una marca / selector de gestión adicional).
function EditoresFila({ fila }: { fila: ReturnType<typeof useFilaSeguimiento> }) {
  const accionNota = ACCIONES_SEGUIMIENTO.find((a) => a.key === fila.notaKey);
  return (
    <>
      {fila.adicionalAbierto && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={fila.tipoAdicional}
            onChange={(e) => fila.setTipoAdicional(e.target.value)}
            autoFocus
            className={selectCls + " flex-1 min-w-[220px]"}
          >
            <option value="">— Selecciona el tipo de gestión</option>
            {GRUPOS_GESTION_TS.map((grupo) => (
              <optgroup key={grupo} label={grupo}>
                {TIPOS_GESTION_TS.filter((t) => t.grupo === grupo).map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            onClick={fila.registrarAdicional}
            disabled={!fila.tipoAdicional || fila.guardandoAdicional}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {fila.guardandoAdicional ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Registrar
          </button>
          <button
            onClick={() => { fila.setAdicionalAbierto(false); fila.setTipoAdicional(""); }}
            disabled={fila.guardandoAdicional}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      )}
      {fila.notaKey && accionNota && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-slate-500">
            Nota para <span className="font-semibold text-slate-600 dark:text-slate-300">{accionNota.chip}</span> — mi marca de hoy
          </p>
          <textarea
            value={fila.notaTexto}
            onChange={(e) => fila.setNotaTexto(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Detalle de la gestión… (dejar vacío borra la nota)"
            className={inputCls + " resize-y text-xs"}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => fila.setNotaKey(null)}
              disabled={fila.guardandoNota}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={fila.guardarNota}
              disabled={fila.guardandoNota}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {fila.guardandoNota ? <Loader2 size={12} className="animate-spin" /> : <StickyNote size={12} />}
              Guardar nota
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Gestiones de hoy que NO son de los 5 chips (registradas aquí, en Registro o Panorama).
function LineaAdicionales({ adicionales }: { adicionales?: GestionTS[] }) {
  if (!adicionales || adicionales.length === 0) return null;
  return (
    <p className="text-[11px] text-violet-600 dark:text-violet-400 mt-1.5">
      Gestiones adicionales hoy:{" "}
      {adicionales.map((g, i) => (
        <span key={g.id ?? i} title={g.notas ?? undefined}>
          {i > 0 && " · "}
          <span className="font-medium">{labelTipoGestion(g.tipo)}</span>
          {g.trabajadoraNombre ? ` (${g.trabajadoraNombre.split(" ")[0]})` : ""}
        </span>
      ))}
    </p>
  );
}

// ── Fila de la tabla-hoja (escritorio) ───────────────────────────────────────
function FilaTabla(props: PropsFila) {
  const { paciente: p, entrada, estadoRastreo, hoy, mes, mias, adicionales } = props;
  const fila = useFilaSeguimiento(props);

  const familiar = entrada?.f || p.responsable?.nombre || "";
  const parentesco = entrada?.p || p.responsable?.parentesco || "";
  const telefono = (entrada?.t || p.responsable?.telefono || p.telefono || "").split("\n")[0];
  const totalMes = ACCIONES_SEGUIMIENTO.reduce((n, a) => n + (mes?.[a.key] ?? 0), 0);
  const expandido = fila.notaKey !== null || fila.adicionalAbierto;

  return (
    <>
      <tr className="group hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
        <td className={tdCls + " sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50/60 dark:group-hover:bg-slate-800/30 font-mono text-[11px] text-slate-500 w-[88px]"}>
          {p.expediente}
        </td>
        <td className={tdCls + " sticky left-[88px] z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50/60 dark:group-hover:bg-slate-800/30 font-semibold text-slate-800 dark:text-slate-200 max-w-[200px]"}>
          <span className="block truncate" title={nombrePac(p)}>{nombrePac(p)}</span>
        </td>
        <td className={tdCls + " max-w-[130px]"}><span className="block truncate">{p.servicioActual || "—"}</span></td>
        <td className={tdCls}>{p.camaActual || "—"}</td>
        <td className={tdCls + " max-w-[170px]"}>
          <span className="block truncate" title={familiar || undefined}>{familiar || "—"}</span>
          {parentesco && <span className="block text-[10px] text-slate-400 truncate">{parentesco}</span>}
        </td>
        <td className={tdCls + " tabular-nums max-w-[120px]"}><span className="block truncate" title={telefono || undefined}>{telefono || "—"}</span></td>
        <td className={tdCls}><BadgeRastreo e={estadoRastreo} /></td>
        {ACCIONES_SEGUIMIENTO.map((a) => (
          <td key={a.key} className={tdCls + " text-center"}>
            <ChipAccion
              a={a}
              compacto
              nHoy={hoy?.get(a.key) ?? 0}
              mia={mias?.get(a.key)}
              ocupada={fila.ocupada}
              notaAbierta={fila.notaKey === a.key}
              onClic={() => fila.clic(a)}
              onNota={() => fila.abrirNota(a)}
              onQuitar={() => fila.quitar(a)}
            />
          </td>
        ))}
        <td className={tdCls + " text-center"}>
          <button
            onClick={() => fila.setAdicionalAbierto(!fila.adicionalAbierto)}
            disabled={!!fila.ocupada}
            title={(adicionales?.length ?? 0) > 0
              ? `Gestiones adicionales hoy: ${adicionales!.map((g) => labelTipoGestion(g.tipo)).join(", ")}`
              : "Registrar otra gestión del catálogo"}
            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg border transition-colors disabled:opacity-60 ${
              (adicionales?.length ?? 0) > 0 || fila.adicionalAbierto
                ? "bg-violet-50 dark:bg-violet-950 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300"
                : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-violet-400"
            }`}
          >
            <Plus size={13} />
            {(adicionales?.length ?? 0) > 0 && <span className="font-bold tabular-nums">{adicionales!.length}</span>}
          </button>
        </td>
        <td className={tdCls + " text-center tabular-nums font-semibold text-slate-700 dark:text-slate-300"}>
          {totalMes > 0 ? totalMes : "—"}
        </td>
      </tr>
      {(expandido || (adicionales?.length ?? 0) > 0) && (
        <tr className="bg-slate-50/40 dark:bg-slate-800/20">
          <td colSpan={9 + ACCIONES_SEGUIMIENTO.length} className="px-4 pb-2 pt-0">
            <LineaAdicionales adicionales={adicionales} />
            <EditoresFila fila={fila} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Tarjeta (móvil / tablet) ─────────────────────────────────────────────────
function FilaTarjeta(props: PropsFila) {
  const { paciente: p, entrada, estadoRastreo, hoy, mes, mias, adicionales } = props;
  const fila = useFilaSeguimiento(props);

  const familiar = entrada?.f || p.responsable?.nombre || "";
  const telefono = (entrada?.t || p.responsable?.telefono || p.telefono || "").split("\n")[0];
  const totalMes = ACCIONES_SEGUIMIENTO
    .map((a) => ({ a, n: mes?.[a.key] ?? 0 }))
    .filter((x) => x.n > 0);

  return (
    <div className="px-4 py-3">
      <div className="flex flex-col gap-2.5">
        {/* Identidad + contacto */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-slate-500">{p.expediente}</span>
            {estadoRastreo !== "contactado" && <BadgeRastreo e={estadoRastreo} />}
          </div>
          <p className="font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">{nombrePac(p)}</p>
          <p className="text-xs text-slate-500 truncate">
            {p.servicioActual || "Sin servicio"}{p.camaActual ? ` · Cama ${p.camaActual}` : ""}
          </p>
          {(familiar || telefono) && (
            <p className="text-xs text-slate-500 truncate mt-0.5">
              <Phone size={10} className="inline mr-1 text-slate-400" />
              {[familiar, telefono].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/* Chips de acciones */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {ACCIONES_SEGUIMIENTO.map((a) => (
              <ChipAccion
                key={a.key}
                a={a}
                nHoy={hoy?.get(a.key) ?? 0}
                mia={mias?.get(a.key)}
                ocupada={fila.ocupada}
                notaAbierta={fila.notaKey === a.key}
                onClic={() => fila.clic(a)}
                onNota={() => fila.abrirNota(a)}
                onQuitar={() => fila.quitar(a)}
              />
            ))}
            <button
              onClick={() => fila.setAdicionalAbierto(!fila.adicionalAbierto)}
              disabled={!!fila.ocupada}
              title="Registrar otra gestión del catálogo para este paciente"
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-60 ${
                (adicionales?.length ?? 0) > 0 || fila.adicionalAbierto
                  ? "bg-violet-50 dark:bg-violet-950 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300"
                  : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-violet-400"
              }`}
            >
              <Plus size={13} />
              Gestión adicional
              {(adicionales?.length ?? 0) > 0 && <span className="font-bold tabular-nums">{adicionales!.length}</span>}
            </button>
          </div>

          <EditoresFila fila={fila} />
          <LineaAdicionales adicionales={adicionales} />

          {/* Totales del mes por paciente (los "TOTAL MENSUAL" del Excel) */}
          <p className="text-[11px] text-slate-400 mt-1.5">
            {totalMes.length === 0
              ? "Sin seguimientos este mes"
              : <>Este mes: {totalMes.map(({ a, n }, i) => (
                  <span key={a.key}>{i > 0 && " · "}<span className="text-slate-500 dark:text-slate-400 font-medium">{a.chip} ×{n}</span></span>
                ))}</>}
          </p>
        </div>
      </div>
    </div>
  );
}
