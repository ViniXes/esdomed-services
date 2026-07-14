"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arrayRemove, arrayUnion, doc, increment, onSnapshot, Timestamp, writeBatch } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { IntentoContactoTS, Paciente, RastreoTS } from "@/types";
import {
  CANALES_RASTREO, CANAL_RASTREO_LABEL, ESTADO_RASTREO_COLOR, ESTADO_RASTREO_LABEL,
  type CanalRastreo, type EstadoRastreo,
} from "@/lib/trabajosocial/catalogos";
import {
  reconstruirResumenRastreo, refResumenRastreo, resumenRastreoSet,
  type EntradaResumenRastreo, type MapaResumenRastreo,
} from "@/lib/trabajosocial/resumenTS";
import {
  consultarPacientesActivos, getPacientesActivosCache, getPacientesActivosCacheEn,
} from "@/lib/trabajosocial/pacientesActivosCache";
import { GestionesTabs } from "../_components/GestionesTabs";
import { DateField } from "@/components/ui/DateField";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, History, Loader2, Plus, Radar,
  RefreshCw, RotateCcw, Search, Trash2, X,
} from "lucide-react";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const selectCls =
  "w-full appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";
// Celda estándar de la tabla-hoja (misma densidad compacta de una hoja de cálculo).
const tdCls = "px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap";
const thCls = "px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap";

const ESTADOS: EstadoRastreo[] = ["en_gestion", "contactado", "no_efectivo", "alta", "defuncion", "no_aplica"];

// Máximo de pacientes por página en la tabla de rastreo.
const PAGE_SIZE = 20;

const hoyStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};
const nombrePac = (p: Paciente) => `${p.apellidos}, ${p.nombres}`;
// "YYYY-MM-DD" → "DD/MM/YY" (formato compacto de la bitácora).
const fmtDia = (f: string) => {
  const [y, m, d] = f.split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : f;
};

type Filtro = "pendientes" | "contactados" | "no_efectivo" | "todos";

export default function RastreoPage() {
  const { profile } = useAuth();
  const esAdmin = profile?.role === "admin";

  const [pacientes, setPacientes] = useState<Paciente[]>(() => getPacientesActivosCache() ?? []);
  const [loading, setLoading] = useState(() => getPacientesActivosCache() === null);
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(() => getPacientesActivosCacheEn());
  // Tablero: UN doc resumen (ts_resumen/rastreo) — leerlo entero = 1 lectura.
  const [resumen, setResumen] = useState<MapaResumenRastreo>({});
  const [permissionError, setPermissionError] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [page, setPage] = useState(1);
  const [reconstruyendo, setReconstruyendo] = useState(false);

  // Modal de captura
  const [sel, setSel] = useState<Paciente | null>(null);
  // Detalle del rastreo del paciente abierto: listener de UN doc (1 lectura +
  // deltas), vivo mientras el modal esté abierto (la bitácora se comparte).
  const [detalle, setDetalle] = useState<RastreoTS | null>(null);
  const [detalleListo, setDetalleListo] = useState(false);
  const camposInicializados = useRef(false);
  const [estado, setEstado] = useState<EstadoRastreo>("en_gestion");
  const [canales, setCanales] = useState<CanalRastreo[]>([]);
  const [familiar, setFamiliar] = useState("");
  const [parentesco, setParentesco] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [dui, setDui] = useState<"menor" | "no_dui" | null>(null);
  const [fechaContacto, setFechaContacto] = useState(hoyStr());
  const [hora, setHora] = useState("");
  const [duracion, setDuracion] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ tipo: "success" | "error"; msg: string } | null>(null);

  // Bitácora de intentos de contacto (se agregan al instante, sin pasar por Guardar).
  const [intentoFecha, setIntentoFecha] = useState(hoyStr());
  const [intentoNota, setIntentoNota] = useState("");
  const [agregandoIntento, setAgregandoIntento] = useState(false);

  // Pacientes activos creados por ESDOMED — origen del worklist de rastreo.
  // Lectura puntual bajo demanda (caché compartida entre las pestañas de
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

  // Tablero de rastreo en vivo (1 doc): estado/contacto de todos los expedientes.
  useEffect(() => {
    return onSnapshot(refResumenRastreo(), (s) => {
      setPermissionError(false);
      setResumen((s.data()?.porExp as MapaResumenRastreo | undefined) ?? {});
    }, (err) => { if (err.code === "permission-denied") setPermissionError(true); });
  }, []);

  // Detalle del paciente abierto (canales, bitácora, notas): se lee SOLO al
  // abrir su modal. Los campos del formulario se inicializan con el primer
  // snapshot; los siguientes solo refrescan la bitácora (no pisan lo tecleado).
  useEffect(() => {
    if (!sel) return;
    camposInicializados.current = false;
    const p = sel;
    return onSnapshot(doc(db, "rastreos_ts", p.expediente), (s) => {
      const r = s.exists() ? ({ id: s.id, ...s.data() } as RastreoTS) : null;
      setDetalle(r);
      setDetalleListo(true);
      if (camposInicializados.current) return;
      camposInicializados.current = true;
      setEstado(r?.estado ?? "en_gestion");
      setCanales(r?.canalesIntentados ?? []);
      setFamiliar(r?.familiarNombre ?? p.responsable?.nombre ?? "");
      setParentesco(r?.parentesco ?? p.responsable?.parentesco ?? "");
      setTelefono(r?.telefono ?? p.responsable?.telefono ?? p.telefono ?? "");
      setDireccion(r?.direccionActual ?? p.responsable?.direccion ?? p.direccion ?? "");
      setDui(r?.duiPaciente ?? null);
      setFechaContacto(r?.fechaContacto ?? hoyStr());
      setHora(r?.horaContacto ?? "");
      setDuracion(r?.duracionMin != null ? String(r.duracionMin) : "");
      setNotas(r?.notas ?? "");
    }, () => setDetalleListo(true));
  }, [sel]);

  const estadoDe = useCallback(
    (exp: string): EstadoRastreo | "pendiente" => resumen[exp]?.e ?? "pendiente",
    [resumen],
  );

  // Fila 1 de su hoja de Excel: los totales del tablero.
  const stats = useMemo(() => {
    let sin = 0, ges = 0, cont = 0, noef = 0;
    for (const p of pacientes) {
      const e = estadoDe(p.expediente);
      if (e === "pendiente") sin++;
      else if (e === "en_gestion") ges++;
      else if (e === "contactado") cont++;
      else if (e === "no_efectivo") noef++;
    }
    return { total: pacientes.length, sin, ges, pend: sin + ges, cont, noef };
  }, [pacientes, estadoDe]);

  const lista = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return pacientes
      .filter((p) => {
        const e = estadoDe(p.expediente);
        if (filtro === "pendientes" && !(e === "pendiente" || e === "en_gestion")) return false;
        if (filtro === "contactados" && e !== "contactado") return false;
        if (filtro === "no_efectivo" && e !== "no_efectivo") return false;
        if (!t) return true;
        const r = resumen[p.expediente];
        return (
          p.expediente.toLowerCase().includes(t) ||
          nombrePac(p).toLowerCase().includes(t) ||
          (p.servicioActual ?? "").toLowerCase().includes(t) ||
          (r?.f ?? "").toLowerCase().includes(t)
        );
      })
      .sort((a, b) => nombrePac(a).localeCompare(nombrePac(b)));
  }, [pacientes, estadoDe, resumen, busqueda, filtro]);

  // Paginación (20 por página). Reinicia a la página 1 al cambiar filtros;
  // pageSafe protege contra la lista en vivo que se encoge.
  const totalPages = Math.max(1, Math.ceil(lista.length / PAGE_SIZE));
  const filtrosKey = `${busqueda}|${filtro}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) { setFiltrosPrevios(filtrosKey); setPage(1); }
  const pageSafe = Math.min(page, totalPages);
  const paginados = lista.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const abrir = (p: Paciente) => {
    setDetalle(null);
    setDetalleListo(false);
    setSel(p);
    setIntentoFecha(hoyStr());
    setIntentoNota("");
  };

  const toggleCanal = (c: CanalRastreo) =>
    setCanales((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const bitacora = useMemo(() => {
    const items = detalle?.intentosContacto ?? [];
    return [...items].sort((a, b) =>
      b.fecha.localeCompare(a.fecha) ||
      ((b.creadoEn as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0) -
      ((a.creadoEn as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0),
    );
  }, [detalle?.intentosContacto]);

  // Agrega un intento a la bitácora de inmediato (arrayUnion: nunca pisa el
  // historial). Detalle + entrada del tablero se escriben en el MISMO batch.
  const agregarIntento = async () => {
    if (!sel || !profile || !intentoNota.trim()) return;
    setAgregandoIntento(true);
    try {
      const existe = !!detalle;
      const item: IntentoContactoTS = {
        fecha: intentoFecha || hoyStr(),
        nota: intentoNota.trim(),
        trabajadoraId: profile.uid,
        trabajadoraNombre: profile.nombre,
        creadoEn: Timestamp.now() as unknown as Date,
      };
      const batch = writeBatch(db);
      batch.set(doc(db, "rastreos_ts", sel.expediente), {
        expediente: sel.expediente,
        pacienteId: sel.id ?? null,
        pacienteNombre: nombrePac(sel),
        servicio: sel.servicioActual ?? null,
        cama: sel.camaActual ?? null,
        vinculadoPadron: true,
        intentosContacto: arrayUnion(item),
        trabajadoraId: profile.uid,
        trabajadoraNombre: profile.nombre,
        actualizadoEn: Timestamp.now(),
        ...(existe ? {} : { estado: "en_gestion", creadoEn: Timestamp.now() }),
      }, { merge: true });
      resumenRastreoSet(batch, sel.expediente, existe
        ? { i: increment(1), u: hoyStr() }
        : { e: "en_gestion", i: increment(1), u: hoyStr() });
      await batch.commit();
      setIntentoNota("");
      setIntentoFecha(hoyStr());
    } catch {
      setToast({ tipo: "error", msg: "No se pudo agregar el intento" });
    } finally {
      setAgregandoIntento(false);
    }
  };

  // Quita un intento propio (equivocaciones). arrayRemove exige el objeto exacto.
  const quitarIntento = async (item: IntentoContactoTS) => {
    if (!sel || !profile) return;
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "rastreos_ts", sel.expediente), {
        intentosContacto: arrayRemove(item),
        trabajadoraId: profile.uid,
        trabajadoraNombre: profile.nombre,
        actualizadoEn: Timestamp.now(),
      }, { merge: true });
      resumenRastreoSet(batch, sel.expediente, { i: increment(-1) });
      await batch.commit();
    } catch {
      setToast({ tipo: "error", msg: "No se pudo quitar el intento" });
    }
  };

  const guardar = async () => {
    if (!sel || !profile) return;
    setSaving(true);
    try {
      const existe = !!detalle;
      const data: Record<string, unknown> = {
        expediente: sel.expediente,
        pacienteId: sel.id ?? null,
        pacienteNombre: nombrePac(sel),
        genero: sel.genero ?? null,
        servicio: sel.servicioActual ?? null,
        cama: sel.camaActual ?? null,
        vinculadoPadron: true,
        familiarNombre: familiar.trim() || null,
        parentesco: parentesco.trim() || null,
        telefono: telefono.trim() || null,
        direccionActual: direccion.trim() || null,
        duiPaciente: dui,
        estado,
        canalesIntentados: canales,
        intentos: canales.length,
        notas: notas.trim() || null,
        trabajadoraId: profile.uid,
        trabajadoraNombre: profile.nombre,
        actualizadoEn: Timestamp.now(),
        fechaContacto: estado === "contactado" ? (fechaContacto || hoyStr()) : null,
        horaContacto: estado === "contactado" ? (hora.trim() || null) : null,
        duracionMin: estado === "contactado" && duracion ? Number(duracion) : null,
        ...(existe ? {} : { creadoEn: Timestamp.now() }),
      };
      const entrada: EntradaResumenRastreo = {
        e: estado,
        i: detalle?.intentosContacto?.length ?? 0,
        u: hoyStr(),
        f: familiar.trim() || null,
        p: parentesco.trim() || null,
        t: telefono.trim() || null,
        d: direccion.trim() || null,
        dui,
      };
      const batch = writeBatch(db);
      batch.set(doc(db, "rastreos_ts", sel.expediente), data, { merge: true });
      resumenRastreoSet(batch, sel.expediente, entrada);
      await batch.commit();
      setToast({ tipo: "success", msg: "Rastreo actualizado" });
      setSel(null);
    } catch {
      setToast({ tipo: "error", msg: "No se pudo guardar el rastreo" });
    } finally {
      setSaving(false);
    }
  };

  // Red de seguridad (solo admin): rehace el doc resumen desde rastreos_ts.
  const reconstruir = async () => {
    setReconstruyendo(true);
    try {
      const n = await reconstruirResumenRastreo();
      setToast({ tipo: "success", msg: `Tablero reconstruido (${n} rastreos)` });
    } catch {
      setToast({ tipo: "error", msg: "No se pudo reconstruir el tablero" });
    } finally {
      setReconstruyendo(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const Badge = ({ e }: { e: EstadoRastreo | "pendiente" }) =>
    e === "pendiente" ? (
      <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900">
        Sin rastrear
      </span>
    ) : (
      <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${ESTADO_RASTREO_COLOR[e]}`}>
        {ESTADO_RASTREO_LABEL[e]}
      </span>
    );

  const DuiBadge = ({ v }: { v: EntradaResumenRastreo["dui"] }) =>
    !v ? null : (
      <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900">
        {v === "menor" ? "MENOR" : "SIN DUI"}
      </span>
    );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
            <Radar size={13} /> Trabajo Social
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Rastreo de pacientes</h1>
          <p className="text-xs text-slate-500 mt-0.5">Localiza al paciente y su familiar responsable — la meta: que nadie quede sin rastrear</p>
        </div>
        <div className="flex items-center gap-2">
          {esAdmin && (
            <button
              onClick={reconstruir}
              disabled={reconstruyendo}
              title="Rehace el tablero leyendo la colección de rastreos (usar solo si los contadores no cuadran)"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
            >
              <RotateCcw size={14} className={reconstruyendo ? "animate-spin" : ""} />
              Reconstruir tablero
            </button>
          )}
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
      </div>

      <GestionesTabs />

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer el tablero de rastreo. Pide al administrador que despliegue las reglas de <strong>ts_resumen</strong> y <strong>rastreos_ts</strong>.
        </div>
      )}

      {/* Regla de negocio */}
      <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>
          El rastreo ya <strong>no bloquea</strong> el seguimiento: si una gestión con el familiar se registra primero,
          el contacto se marca solo. Este tablero existe para que ningún paciente activo quede <strong>sin familiar localizado</strong>.
        </span>
      </div>

      {/* Stats — la fila de totales de su hoja */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { k: "todos" as Filtro, label: "Activos", n: stats.total, sub: "censo ESDOMED", cls: "text-slate-800 dark:text-slate-200" },
          { k: "pendientes" as Filtro, label: "Por rastrear", n: stats.pend, sub: `${stats.sin} sin iniciar · ${stats.ges} en gestión`, cls: "text-amber-600 dark:text-amber-400" },
          { k: "contactados" as Filtro, label: "Contactados", n: stats.cont, sub: "con familiar localizado", cls: "text-emerald-600 dark:text-emerald-400" },
          { k: "no_efectivo" as Filtro, label: "No efectivos", n: stats.noef, sub: "sin lograr contacto", cls: "text-rose-600 dark:text-rose-400" },
        ].map((s) => (
          <button
            key={s.k}
            onClick={() => setFiltro(s.k)}
            className={`text-left bg-white dark:bg-slate-900 border rounded-2xl px-4 py-3 transition-colors ${
              filtro === s.k ? "border-blue-400 dark:border-blue-700 ring-1 ring-blue-400/40" : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold font-heading tabular-nums ${s.cls}`}>{s.n}</p>
            <p className="text-[10px] text-slate-400 truncate">{s.sub}</p>
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por expediente, paciente, familiar o servicio…"
          className={inputCls + " pl-9"}
        />
      </div>

      {/* Tabla-hoja (escritorio) / tarjetas (móvil) */}
      {loading ? (
        <p className="text-sm text-slate-400 py-16 text-center">Cargando pacientes activos…</p>
      ) : lista.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Radar size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No hay pacientes que coincidan con el filtro.</p>
        </div>
      ) : (
        <>
          {/* Escritorio: las columnas de su hoja de RASTREO, en su orden */}
          <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900">
                  <th className={thCls + " sticky left-0 z-10 bg-slate-50 dark:bg-slate-900"}>Exp.</th>
                  <th className={thCls + " sticky left-[88px] z-10 bg-slate-50 dark:bg-slate-900"}>Paciente</th>
                  <th className={thCls + " text-center"}>Gén.</th>
                  <th className={thCls}>Familiar</th>
                  <th className={thCls}>Parentesco</th>
                  <th className={thCls}>Teléfono</th>
                  <th className={thCls}>Servicio</th>
                  <th className={thCls}>Cama</th>
                  <th className={thCls}>Dirección</th>
                  <th className={thCls}>Contacto</th>
                  <th className={thCls + " text-center"}>Int.</th>
                  <th className={thCls + " text-center"} title="Disponible en Seguimiento">Seg.</th>
                  <th className={thCls} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginados.map((p) => {
                  const r = resumen[p.expediente];
                  const e = estadoDe(p.expediente);
                  const fam = r?.f ?? p.responsable?.nombre ?? "";
                  const par = r?.p ?? p.responsable?.parentesco ?? "";
                  const tel = (r?.t ?? p.responsable?.telefono ?? p.telefono ?? "").split("\n")[0];
                  const dir = r?.d ?? p.direccion ?? "";
                  return (
                    <tr
                      key={p.id}
                      onClick={() => abrir(p)}
                      className="group cursor-pointer hover:bg-blue-50/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className={tdCls + " sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-blue-50/50 dark:group-hover:bg-slate-800/40 font-mono text-[11px] text-slate-500 w-[88px]"}>
                        {p.expediente}
                      </td>
                      <td className={tdCls + " sticky left-[88px] z-10 bg-white dark:bg-slate-900 group-hover:bg-blue-50/50 dark:group-hover:bg-slate-800/40 font-semibold text-slate-800 dark:text-slate-200 max-w-[220px]"}>
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{nombrePac(p)}</span>
                          <DuiBadge v={r?.dui ?? null} />
                        </span>
                      </td>
                      <td className={tdCls + " text-center text-slate-400"}>{p.genero || "—"}</td>
                      <td className={tdCls + " max-w-[180px]"}><span className="block truncate" title={fam || undefined}>{fam || "—"}</span></td>
                      <td className={tdCls + " max-w-[110px]"}><span className="block truncate">{par || "—"}</span></td>
                      <td className={tdCls + " tabular-nums max-w-[130px]"}><span className="block truncate" title={tel || undefined}>{tel || "—"}</span></td>
                      <td className={tdCls + " max-w-[140px]"}><span className="block truncate">{p.servicioActual || "—"}</span></td>
                      <td className={tdCls}>{p.camaActual || "—"}</td>
                      <td className={tdCls + " max-w-[190px]"}><span className="block truncate" title={dir || undefined}>{dir || "—"}</span></td>
                      <td className={tdCls}><Badge e={e} /></td>
                      <td className={tdCls + " text-center tabular-nums"}>
                        {(r?.i ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 text-slate-500"><History size={11} />{r!.i}</span>
                        ) : "—"}
                      </td>
                      <td className={tdCls + " text-center"}>
                        {e === "contactado"
                          ? <CheckCircle2 size={15} className="inline text-emerald-500" aria-label="Disponible en Seguimiento" />
                          : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className={tdCls + " text-right"}>
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          {e === "pendiente" ? "Rastrear" : "Actualizar"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas compactas */}
          <div className="md:hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
            {paginados.map((p) => {
              const r = resumen[p.expediente];
              const e = estadoDe(p.expediente);
              const fam = r?.f ?? p.responsable?.nombre ?? "";
              const tel = (r?.t ?? p.responsable?.telefono ?? p.telefono ?? "").split("\n")[0];
              return (
                <button
                  key={p.id}
                  onClick={() => abrir(p)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-slate-500">{p.expediente}</span>
                      <Badge e={e} />
                      <DuiBadge v={r?.dui ?? null} />
                      {(r?.i ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                          <History size={11} /> {r!.i} intento{r!.i === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">{nombrePac(p)}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {p.servicioActual || "—"}{p.camaActual ? ` · Cama ${p.camaActual}` : ""}
                    </p>
                    {(fam || tel) && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{[fam, tel].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {e === "pendiente" ? "Rastrear" : "Actualizar"}
                  </span>
                </button>
              );
            })}
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

      {/* Modal de captura */}
      {sel && (
        <div className="fixed inset-0 z-50 flex justify-center items-start pt-8 px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden mb-10">
            <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-slate-500">{sel.expediente}</p>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">{nombrePac(sel)}</h2>
                <p className="text-xs text-slate-500">{sel.servicioActual || "—"}{sel.camaActual ? ` · Cama ${sel.camaActual}` : ""}</p>
              </div>
              <button onClick={() => setSel(null)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0">
                <X size={20} />
              </button>
            </div>

            {!detalleListo ? (
              <div className="p-10 flex items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Cargando rastreo…
              </div>
            ) : (
            <div className="p-6 space-y-4">
              {/* Datos de contacto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Familiar / responsable</label>
                  <input value={familiar} onChange={(e) => setFamiliar(e.target.value)} className={inputCls} placeholder="Nombre del familiar" />
                </div>
                <div>
                  <label className={labelCls}>Parentesco</label>
                  <input value={parentesco} onChange={(e) => setParentesco(e.target.value)} className={inputCls} placeholder="Hija, esposo…" />
                </div>
                <div>
                  <label className={labelCls}>Teléfono</label>
                  <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputCls} placeholder="0000-0000" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Dirección actual</label>
                  <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputCls} placeholder="Dirección del paciente / familia" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Documento del paciente</label>
                  <select value={dui ?? ""} onChange={(e) => setDui((e.target.value || null) as "menor" | "no_dui" | null)} className={selectCls}>
                    <option value="">Tiene DUI</option>
                    <option value="menor">Menor de edad</option>
                    <option value="no_dui">Nunca emitió DUI</option>
                  </select>
                </div>
              </div>

              {/* Canales intentados */}
              <div>
                <label className={labelCls}>Canales usados para localizar</label>
                <div className="flex flex-wrap gap-2">
                  {CANALES_RASTREO.map((c) => {
                    const on = canales.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleCanal(c)}
                        className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                          on
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-300"
                        }`}
                      >
                        {CANAL_RASTREO_LABEL[c]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bitácora de intentos de contacto (por fecha, se guarda al instante) */}
              <div>
                <label className={labelCls}>
                  Intentos de contacto <span className="text-slate-400 normal-case font-normal">(bitácora por fecha)</span>
                </label>
                <div className="flex gap-2">
                  <DateField
                    value={intentoFecha}
                    onChange={setIntentoFecha}
                    ariaLabel="Fecha del intento"
                    className="w-[145px] shrink-0"
                  />
                  <input
                    value={intentoNota}
                    onChange={(e) => setIntentoNota(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarIntento(); } }}
                    placeholder="No contestó / número equivocado / se dejó recado…"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={agregarIntento}
                    disabled={agregandoIntento || !intentoNota.trim()}
                    title="Agregar intento a la bitácora"
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {agregandoIntento ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Agregar
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Se guarda al instante — no hace falta pulsar &quot;Guardar rastreo&quot;.</p>
                {bitacora.length > 0 && (
                  <ul className="mt-2 space-y-1 max-h-44 overflow-y-auto pr-1">
                    {bitacora.map((it) => (
                      <li
                        key={`${it.fecha}|${(it.creadoEn as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0}|${it.trabajadoraId}`}
                        className="flex items-start gap-2 text-xs bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-lg px-2.5 py-1.5"
                      >
                        <History size={12} className="mt-0.5 text-slate-400 shrink-0" />
                        <span className="font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">{fmtDia(it.fecha)}</span>
                        <span className="flex-1 min-w-0 text-slate-600 dark:text-slate-400 break-words">{it.nota}</span>
                        <span className="hidden sm:inline text-slate-400 whitespace-nowrap">{it.trabajadoraNombre?.split(" ")[0]}</span>
                        {it.trabajadoraId === profile?.uid && (
                          <button
                            type="button"
                            onClick={() => quitarIntento(it)}
                            title="Quitar mi intento"
                            className="shrink-0 text-slate-300 hover:text-rose-500 transition-colors"
                            aria-label="Quitar intento"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Estado */}
              <div>
                <label className={labelCls}>Estado del rastreo</label>
                <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoRastreo)} className={selectCls}>
                  {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_RASTREO_LABEL[e]}</option>)}
                </select>
                {estado === "contactado" ? (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
                    <CheckCircle2 size={12} /> El paciente aparecerá como contactado en Seguimiento y Panorama.
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                    <AlertTriangle size={12} /> Seguirá contando como pendiente de contacto familiar.
                  </p>
                )}
              </div>

              {/* Datos del contacto efectivo */}
              {estado === "contactado" && (
                <div className="grid grid-cols-3 gap-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 rounded-xl p-3">
                  <div>
                    <label className={labelCls}>Fecha</label>
                    <DateField value={fechaContacto} onChange={setFechaContacto} placeholder="Fecha" ariaLabel="Fecha de contacto" />
                  </div>
                  <div>
                    <label className={labelCls}>Hora</label>
                    <input value={hora} onChange={(e) => setHora(e.target.value)} placeholder="10:30" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Duración (min)</label>
                    <input type="number" min={0} inputMode="numeric" value={duracion} onChange={(e) => setDuracion(e.target.value)} placeholder="—" className={inputCls} />
                  </div>
                </div>
              )}

              {/* Notas */}
              <div>
                <label className={labelCls}>Notas del proceso <span className="text-slate-400 normal-case font-normal">(paso a paso, dificultades)</span></label>
                <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className={inputCls + " resize-y"} placeholder="Detalle de los intentos de contacto…" />
              </div>
            </div>
            )}

            {detalleListo && (
              <div className="px-6 pb-6 flex justify-end gap-3">
                <button onClick={() => setSel(null)} disabled={saving} className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button onClick={guardar} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl transition-colors">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Guardar rastreo
                </button>
              </div>
            )}
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
