"use client";

// Asignaciones — el reparto diario de expedientes de la UTS.
//
// Cada día la supervisora distribuye entre las colaboradoras los expedientes
// activos que NO tienen nada hecho: ni rastreo, ni contacto por ninguna vía
// (videollamada, llamada a familiar, llamada con médico, seguimiento STS,
// visita). Cada colaboradora entra aquí y ve lo que le tocó.
//
// Costo de lecturas: la colaboradora paga **2 documentos** (el reparto del día y
// el resumen del día) — por eso la asignación guarda un snapshot del paciente
// (nombre/servicio/cama), para no bajar el censo ni el padrón. La supervisora sí
// necesita el censo para armar la bolsa, pero es la caché de módulo que ya
// comparten Rastreo y Seguimiento (una lectura por sesión).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, getDoc, getDocs, query, setDoc, Timestamp, where,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import type { Paciente } from "@/types";
import { ESTADO_RASTREO_COLOR, ESTADO_RASTREO_LABEL, type EstadoRastreo } from "@/lib/trabajosocial/catalogos";
import {
  asignarExpedientes, quitarAsignaciones, reconstruirResumenDia, refAsignaciones,
  refEquipoTS, refResumenDia, refResumenRastreo, tuvoGestionesEse,
  type EntradaAsignacion, type EquipoTS, type MapaAsignaciones,
  type MapaResumenRastreo, type MapaResumenSeguimiento,
} from "@/lib/trabajosocial/resumenTS";
import {
  consultarPacientesActivos, getPacientesActivosCache, getPacientesActivosCacheEn,
} from "@/lib/trabajosocial/pacientesActivosCache";
import { pedirAperturaSeguimiento } from "@/lib/trabajosocial/seleccionPaciente";
import {
  AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, Loader2, RefreshCw,
  Search, Settings2, Shuffle, Split, UserCheck, UserMinus, Users, X,
} from "lucide-react";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const selectCls =
  "appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";

const pad = (n: number) => `${n}`.padStart(2, "0");
const aTexto = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoyStr = () => aTexto(new Date());
const nombrePac = (p: Paciente) => `${p.apellidos}, ${p.nombres}`;

interface Colaboradora {
  uid: string;
  nombre: string;
}

// Caché de módulo: el roster de la UTS cambia con muy poca frecuencia.
let cacheColaboradoras: Colaboradora[] | null = null;
async function consultarColaboradoras(): Promise<Colaboradora[]> {
  if (cacheColaboradoras) return cacheColaboradoras;
  const snap = await getDocs(query(collection(db, "usuarios"), where("role", "==", "trabajo_social")));
  cacheColaboradoras = snap.docs
    .map((d) => ({ uid: d.id, nombre: (d.data().nombre as string) ?? "(sin nombre)" }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  return cacheColaboradoras;
}

type Vista = "mias" | "repartir" | "reparto";
type FiltroBolsa = "sin_nada" | "sin_rastreo" | "todos";

export default function AsignacionesPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const esAdmin = profile?.role === "admin";

  const [fecha, setFecha] = useState(hoyStr);
  const [vista, setVista] = useState<Vista>("mias");

  const [equipo, setEquipo] = useState<EquipoTS | null>(null);
  const [asignaciones, setAsignaciones] = useState<MapaAsignaciones>({});
  const [dia, setDia] = useState<MapaResumenSeguimiento>({});
  const [diaPorTrabajadora, setDiaPorTrabajadora] = useState<MapaResumenSeguimiento>({});
  const [rastreos, setRastreos] = useState<MapaResumenRastreo>({});
  const [censo, setCenso] = useState<Paciente[]>(() => getPacientesActivosCache() ?? []);
  const [censoEn, setCensoEn] = useState<Date | null>(() => getPacientesActivosCacheEn());
  const [colaboradoras, setColaboradoras] = useState<Colaboradora[]>(() => cacheColaboradoras ?? []);

  const [cargando, setCargando] = useState(true);
  const [cargandoCenso, setCargandoCenso] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [toast, setToast] = useState<{ tipo: "success" | "error"; msg: string } | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [servicioFiltro, setServicioFiltro] = useState("");
  const [filtroBolsa, setFiltroBolsa] = useState<FiltroBolsa>("sin_nada");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [destinos, setDestinos] = useState<Set<string>>(new Set());
  const [configAbierta, setConfigAbierta] = useState(false);
  const bolsaCargada = useRef(false);

  const esSupervisora = esAdmin || (!!profile && !!equipo?.supervisoras?.[profile.uid]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Tableros del día: 2 documentos (reparto + resumen) + equipo. Nada más.
  const cargarDia = useCallback(async (f: string) => {
    setCargando(true);
    try {
      const [asigSnap, diaSnap, equipoSnap] = await Promise.all([
        getDoc(refAsignaciones(f)),
        getDoc(refResumenDia(f)),
        getDoc(refEquipoTS()),
      ]);
      setPermissionError(false);
      setAsignaciones((asigSnap.data()?.porExp as MapaAsignaciones | undefined) ?? {});
      setDia((diaSnap.data()?.porExp as MapaResumenSeguimiento | undefined) ?? {});
      setDiaPorTrabajadora((diaSnap.data()?.porTrabajadora as MapaResumenSeguimiento | undefined) ?? {});
      setEquipo((equipoSnap.data() as EquipoTS | undefined) ?? {});
    } catch (err) {
      if ((err as { code?: string }).code === "permission-denied") setPermissionError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void cargarDia(fecha), 0);
    return () => clearTimeout(t);
  }, [cargarDia, fecha]);

  // Lo que necesita SOLO la supervisora para armar la bolsa: censo activo,
  // tablero de rastreo y el roster de colaboradoras.
  const cargarBolsa = useCallback(async () => {
    setCargandoCenso(true);
    try {
      const [pacientes, rastreoSnap, equipoTS] = await Promise.all([
        getPacientesActivosCache() ?? consultarPacientesActivos(),
        getDoc(refResumenRastreo()),
        consultarColaboradoras(),
      ]);
      setCenso(pacientes);
      setCensoEn(getPacientesActivosCacheEn());
      setRastreos((rastreoSnap.data()?.porExp as MapaResumenRastreo | undefined) ?? {});
      setColaboradoras(equipoTS);
      bolsaCargada.current = true;
    } catch {
      setToast({ tipo: "error", msg: "No se pudo cargar el censo para repartir" });
    } finally {
      setCargandoCenso(false);
    }
  }, []);

  const refrescarCenso = useCallback(async () => {
    setCargandoCenso(true);
    try {
      setCenso(await consultarPacientesActivos());
      setCensoEn(getPacientesActivosCacheEn());
    } finally {
      setCargandoCenso(false);
    }
  }, []);

  // Al entrar a "Repartir" siempre hay que traer el tablero de rastreo aunque el
  // censo ya venga de la caché: sin él la bolsa creería que nadie está contactado.
  const irAVista = useCallback((v: Vista) => {
    setVista(v);
    setMarcados(new Set());
    if (v === "repartir" && !bolsaCargada.current) void cargarBolsa();
  }, [cargarBolsa]);

  // ── Derivados ──────────────────────────────────────────────────────────────
  const mias = useMemo(() => {
    if (!profile) return [];
    return Object.entries(asignaciones)
      .filter(([, a]) => a.u === profile.uid)
      .map(([exp, a]) => ({ exp, ...a }))
      .sort((a, b) => (a.s ?? "").localeCompare(b.s ?? "") || a.p.localeCompare(b.p));
  }, [asignaciones, profile]);

  const miasHechas = useMemo(
    () => mias.filter((m) => tuvoGestionesEse(dia, m.exp)).length,
    [dia, mias],
  );

  const serviciosPresentes = useMemo(() => {
    const set = new Set<string>();
    censo.forEach((p) => set.add(p.servicioActual || "Sin servicio"));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [censo]);

  // Bolsa repartible: por defecto los que no tienen NADA hecho en el día.
  const bolsa = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return censo
      .filter((p) => {
        const exp = p.expediente;
        if (asignaciones[exp]) return false; // ya repartido
        const servicio = p.servicioActual || "Sin servicio";
        if (servicioFiltro && servicio !== servicioFiltro) return false;
        const conGestionHoy = tuvoGestionesEse(dia, exp);
        const est = rastreos[exp]?.e;
        // "Sin rastreo": nunca se abrió o sigue sin contacto efectivo. Los estados
        // deliberados (alta / defunción / no aplica) NO son deuda de rastreo.
        // Los dos filtros están ANIDADOS: "sin rastreo" es un subconjunto de "sin
        // nada hoy". Si "sin nada hoy" exigiera además no tener rastreo, a partir
        // del segundo día la bolsa quedaría casi vacía (los ya contactados nunca
        // volverían a aparecer) y no se podría repartir el seguimiento diario.
        const sinRastreo = est === undefined || est === "en_gestion" || est === "no_efectivo";
        if (filtroBolsa !== "todos" && conGestionHoy) return false;
        if (filtroBolsa === "sin_rastreo" && !sinRastreo) return false;
        if (!t) return true;
        return exp.toLowerCase().includes(t) || nombrePac(p).toLowerCase().includes(t);
      })
      .sort((a, b) =>
        (a.servicioActual || "").localeCompare(b.servicioActual || "") ||
        nombrePac(a).localeCompare(nombrePac(b)));
  }, [asignaciones, busqueda, censo, dia, filtroBolsa, rastreos, servicioFiltro]);

  // Reparto del día agrupado por colaboradora.
  const reparto = useMemo(() => {
    const m = new Map<string, { nombre: string; items: { exp: string; a: EntradaAsignacion }[] }>();
    for (const [exp, a] of Object.entries(asignaciones)) {
      const g = m.get(a.u) ?? { nombre: a.n, items: [] };
      g.items.push({ exp, a });
      m.set(a.u, g);
    }
    return [...m.entries()]
      .map(([uid, g]) => {
        const hechos = g.items.filter((i) => tuvoGestionesEse(dia, i.exp)).length;
        const gestionesHoy = Object.values(diaPorTrabajadora[uid] ?? {}).reduce((s, n) => s + (n ?? 0), 0);
        return {
          uid,
          nombre: g.nombre,
          items: g.items.sort((a, b) => a.a.p.localeCompare(b.a.p)),
          hechos,
          gestionesHoy,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [asignaciones, dia, diaPorTrabajadora]);

  const totalAsignados = Object.keys(asignaciones).length;

  // ── Acciones ───────────────────────────────────────────────────────────────
  const alternarMarcado = (exp: string) => {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(exp)) next.delete(exp);
      else next.add(exp);
      return next;
    });
  };

  const asignar = useCallback(async () => {
    if (!profile || marcados.size === 0 || destinos.size === 0) return;
    setGuardando(true);
    try {
      const equipoDestino = colaboradoras.filter((c) => destinos.has(c.uid));
      const porExp = new Map(censo.map((p) => [p.expediente, p]));
      // Orden estable (el de la bolsa) para que el reparto salga por servicio.
      const exps = bolsa.map((p) => p.expediente).filter((e) => marcados.has(e));
      const entradas: MapaAsignaciones = {};
      exps.forEach((exp, i) => {
        const p = porExp.get(exp);
        const destino = equipoDestino[i % equipoDestino.length];
        entradas[exp] = {
          u: destino.uid,
          n: destino.nombre,
          p: p ? nombrePac(p) : exp,
          s: p?.servicioActual ?? null,
          c: p?.camaActual ?? null,
          i: p?.id ?? null,
          por: profile.nombre,
          en: Timestamp.now(),
        };
      });
      await asignarExpedientes(fecha, entradas);
      setAsignaciones((prev) => ({ ...prev, ...entradas }));
      setMarcados(new Set());
      setToast({
        tipo: "success",
        msg: equipoDestino.length === 1
          ? `${exps.length} expedientes asignados a ${equipoDestino[0].nombre}`
          : `${exps.length} expedientes repartidos entre ${equipoDestino.length} colaboradoras`,
      });
    } catch {
      setToast({ tipo: "error", msg: "No se pudo guardar el reparto" });
    } finally {
      setGuardando(false);
    }
  }, [bolsa, censo, colaboradoras, destinos, fecha, marcados, profile]);

  const quitar = useCallback(async (exps: string[]) => {
    if (!exps.length) return;
    setGuardando(true);
    try {
      await quitarAsignaciones(fecha, exps);
      setAsignaciones((prev) => {
        const next = { ...prev };
        exps.forEach((e) => delete next[e]);
        return next;
      });
      setToast({ tipo: "success", msg: exps.length === 1 ? "Asignación retirada" : `${exps.length} asignaciones retiradas` });
    } catch {
      setToast({ tipo: "error", msg: "No se pudo retirar la asignación" });
    } finally {
      setGuardando(false);
    }
  }, [fecha]);

  const recalcularDia = useCallback(async () => {
    setGuardando(true);
    try {
      const n = await reconstruirResumenDia(fecha);
      const snap = await getDoc(refResumenDia(fecha));
      setDia((snap.data()?.porExp as MapaResumenSeguimiento | undefined) ?? {});
      setDiaPorTrabajadora((snap.data()?.porTrabajadora as MapaResumenSeguimiento | undefined) ?? {});
      setToast({ tipo: "success", msg: `Resumen del día recalculado (${n} gestiones)` });
    } catch {
      setToast({ tipo: "error", msg: "No se pudo recalcular el resumen del día" });
    } finally {
      setGuardando(false);
    }
  }, [fecha]);

  const alternarSupervisora = useCallback(async (c: Colaboradora) => {
    const actuales = { ...(equipo?.supervisoras ?? {}) };
    if (actuales[c.uid]) delete actuales[c.uid];
    else actuales[c.uid] = c.nombre;
    try {
      await setDoc(refEquipoTS(), { supervisoras: actuales, actualizadoEn: Timestamp.now() });
      setEquipo({ supervisoras: actuales });
      setToast({ tipo: "success", msg: "Supervisión actualizada" });
    } catch {
      setToast({ tipo: "error", msg: "No se pudo actualizar la supervisión" });
    }
  }, [equipo]);

  // La asignación ya trae el paciente resuelto (nombre, servicio, cama, estancia):
  // se lo entrega a Seguimiento para que abra con los 6 botones a la vista, sin
  // que la colaboradora tenga que buscarlo y sin una sola lectura extra.
  const abrirEnSeguimiento = (exp: string, a: EntradaAsignacion) => {
    pedirAperturaSeguimiento({
      expediente: exp,
      nombre: a.p,
      servicio: a.s ?? undefined,
      cama: a.c ?? undefined,
      ingresoId: a.i ?? undefined,
      estadoPaciente: "actual",
    });
    router.push(`/dashboard/gestiones/seguimiento?exp=${encodeURIComponent(exp)}`);
  };

  const esHoy = fecha === hoyStr();

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
            <UserCheck size={13} /> Trabajo Social
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Asignaciones</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {esSupervisora
              ? "Reparte los expedientes del día entre las colaboradoras."
              : "Los expedientes que te asignaron para el día."}
          </p>
        </div>
        <DateField
          value={fecha}
          onChange={(f) => { if (f) { setFecha(f); setMarcados(new Set()); } }}
          maxDate={new Date()}
          ariaLabel="Fecha del reparto"
          className="w-[190px]"
        />
      </div>

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer los tableros. Pide al administrador que despliegue las reglas de <strong>ts_resumen</strong>.
        </div>
      )}

      {/* Segmented control */}
      {esSupervisora && (
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
          {([
            { k: "mias" as Vista, label: "Mis asignaciones", n: mias.length },
            { k: "repartir" as Vista, label: "Repartir", n: undefined },
            { k: "reparto" as Vista, label: "Reparto del día", n: totalAsignados },
          ]).map((t) => (
            <button
              key={t.k}
              onClick={() => irAVista(t.k)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                vista === t.k
                  ? "bg-[#1c1e4d] text-white dark:bg-[var(--color-institutional-navy)]"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {t.label}
              {t.n !== undefined && t.n > 0 && <span className="ml-1.5 text-xs tabular-nums opacity-80">{t.n}</span>}
            </button>
          ))}
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-slate-400 py-16 text-center">Cargando el reparto del día…</p>
      ) : vista === "mias" ? (
        /* ── Mis asignaciones ─────────────────────────────────────────────── */
        <div className="space-y-3">
          {mias.length > 0 && (
            <div className="grid grid-cols-3 gap-2.5">
              {([
                { label: "Asignados", n: mias.length, cls: "text-slate-800 dark:text-slate-200" },
                { label: "Atendidos", n: miasHechas, cls: "text-emerald-600 dark:text-emerald-400" },
                { label: "Pendientes", n: mias.length - miasHechas, cls: "text-amber-600 dark:text-amber-400" },
              ]).map((s) => (
                <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{s.label}</p>
                  <p className={`text-2xl font-bold font-heading tabular-nums ${s.cls}`}>{s.n}</p>
                </div>
              ))}
            </div>
          )}

          {mias.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <ClipboardList size={34} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                No tienes expedientes asignados {esHoy ? "hoy" : "ese día"}.
              </p>
            </div>
          ) : (
            <ul className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
              {mias.map((m) => {
                const hecho = tuvoGestionesEse(dia, m.exp);
                return (
                  <li key={m.exp}>
                    <button
                      onClick={() => abrirEnSeguimiento(m.exp, m)}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        hecho
                          ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400"
                      }`}>
                        {hecho ? <CheckCircle2 size={17} /> : <ClipboardList size={17} />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-500">{m.exp}</span>
                          {hecho && <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Atendido</span>}
                        </span>
                        <span className="block font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">{m.p}</span>
                        <span className="block text-[11px] text-slate-500 truncate">
                          {m.s || "Sin servicio"}{m.c ? ` · Cama ${m.c}` : ""}
                          {m.por ? ` · asignó ${m.por}` : ""}
                        </span>
                      </span>
                      <ChevronRight size={16} className="text-slate-400 shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : vista === "repartir" ? (
        /* ── Repartir ─────────────────────────────────────────────────────── */
        <div className="space-y-3">
          {/* Filtros */}
          <div className="flex flex-col lg:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por expediente o paciente…"
                className={inputCls + " pl-9"}
              />
            </div>
            <select value={servicioFiltro} onChange={(e) => setServicioFiltro(e.target.value)} className={selectCls}>
              <option value="">Todos los servicios</option>
              {serviciosPresentes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
              {([
                { k: "sin_nada" as FiltroBolsa, label: "Sin nada hoy" },
                { k: "sin_rastreo" as FiltroBolsa, label: "Sin rastreo" },
                { k: "todos" as FiltroBolsa, label: "Todos" },
              ]).map((f) => (
                <button
                  key={f.k}
                  onClick={() => { setFiltroBolsa(f.k); setMarcados(new Set()); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filtroBolsa === f.k
                      ? "bg-[#1c1e4d] text-white dark:bg-[var(--color-institutional-navy)]"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => void refrescarCenso()}
              disabled={cargandoCenso}
              title={censoEn ? `Censo actualizado a las ${censoEn.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" })}` : "Actualizar censo"}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={cargandoCenso ? "animate-spin" : ""} />
              Censo
            </button>
          </div>

          <p className="text-xs text-slate-500">
            {filtroBolsa === "sin_nada" && "Activos sin ninguna gestión registrada en el día."}
            {filtroBolsa === "sin_rastreo" && "Activos sin gestión en el día y que además siguen sin contacto efectivo en rastreo."}
            {filtroBolsa === "todos" && "Todos los activos que todavía no se han repartido hoy, tengan o no gestión."}
            {" "}<span className="font-semibold text-slate-600 dark:text-slate-400">{bolsa.length}</span> disponibles.
          </p>

          {/* Destinos + acción */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Repartir entre {destinos.size > 0 && <span className="text-slate-700 dark:text-slate-300">({destinos.size})</span>}
              </p>
              {destinos.size > 0 && (
                <button onClick={() => setDestinos(new Set())} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                  Limpiar
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {colaboradoras.length === 0 && (
                <span className="text-xs text-slate-400">
                  {cargandoCenso ? "Cargando colaboradoras…" : "No hay usuarias con rol de Trabajo Social."}
                </span>
              )}
              {colaboradoras.map((c) => {
                const activa = destinos.has(c.uid);
                const yaTiene = reparto.find((r) => r.uid === c.uid)?.items.length ?? 0;
                return (
                  <button
                    key={c.uid}
                    onClick={() => setDestinos((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.uid)) next.delete(c.uid);
                      else next.add(c.uid);
                      return next;
                    })}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      activa
                        ? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400"
                    }`}
                  >
                    {c.nombre}
                    {yaTiene > 0 && <span className="tabular-nums opacity-70">· {yaTiene}</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500">
                {marcados.size} {marcados.size === 1 ? "expediente marcado" : "expedientes marcados"}
              </span>
              <button
                onClick={() => void asignar()}
                disabled={guardando || marcados.size === 0 || destinos.size === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1c1e4d] hover:bg-[#2f48aa] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {guardando ? <Loader2 size={15} className="animate-spin" /> : destinos.size > 1 ? <Split size={15} /> : <UserCheck size={15} />}
                {destinos.size > 1
                  ? `Repartir ${marcados.size} entre ${destinos.size}`
                  : `Asignar ${marcados.size}`}
              </button>
            </div>
          </div>

          {/* Bolsa */}
          {cargandoCenso && censo.length === 0 ? (
            <p className="text-sm text-slate-400 py-16 text-center">Cargando el censo de pacientes activos…</p>
          ) : bolsa.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Users size={34} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No hay expedientes que repartir con este filtro.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900">
                <button
                  onClick={() => setMarcados((prev) =>
                    prev.size === bolsa.length ? new Set() : new Set(bolsa.map((p) => p.expediente)))}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600"
                >
                  <Shuffle size={13} />
                  {marcados.size === bolsa.length ? "Quitar selección" : `Marcar los ${bolsa.length}`}
                </button>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[560px] overflow-y-auto">
                {bolsa.map((p) => {
                  const marcado = marcados.has(p.expediente);
                  const est = rastreos[p.expediente]?.e as EstadoRastreo | undefined;
                  return (
                    <li key={p.expediente}>
                      <button
                        onClick={() => alternarMarcado(p.expediente)}
                        className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors ${
                          marcado ? "bg-blue-50/70 dark:bg-blue-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                          marcado
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-slate-300 dark:border-slate-600"
                        }`}>
                          {marcado && <CheckCircle2 size={13} />}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 w-[68px] shrink-0">{p.expediente}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{nombrePac(p)}</span>
                          <span className="block text-[11px] text-slate-500 truncate">
                            {p.servicioActual || "Sin servicio"}{p.camaActual ? ` · Cama ${p.camaActual}` : ""}
                          </span>
                        </span>
                        <span className={`shrink-0 inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                          est ? ESTADO_RASTREO_COLOR[est] : "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900"
                        }`}>
                          {est ? ESTADO_RASTREO_LABEL[est] : "Sin rastrear"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      ) : (
        /* ── Reparto del día ──────────────────────────────────────────────── */
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-slate-600 dark:text-slate-400">{totalAsignados}</span> expedientes repartidos entre{" "}
              <span className="font-semibold text-slate-600 dark:text-slate-400">{reparto.length}</span> colaboradoras.
            </p>
            <button
              onClick={() => void recalcularDia()}
              disabled={guardando}
              title="Recalcula el resumen del día leyendo las gestiones reales (red de seguridad si un contador quedó desfasado)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {guardando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Recalcular el día
            </button>
          </div>

          {reparto.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Users size={34} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Todavía no se ha repartido nada {esHoy ? "hoy" : "ese día"}.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {reparto.map((r) => (
                <div key={r.uid} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">{r.nombre}</p>
                    <p className="text-[11px] text-slate-500">
                      <span className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{r.hechos}</span>
                      {" de "}<span className="tabular-nums">{r.items.length}</span> atendidos
                      {" · "}{r.gestionesHoy} {r.gestionesHoy === 1 ? "gestión" : "gestiones"} en el día
                    </p>
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${r.items.length ? (r.hechos / r.items.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[320px] overflow-y-auto">
                    {r.items.map(({ exp, a }) => {
                      const hecho = tuvoGestionesEse(dia, exp);
                      return (
                        <li key={exp} className="flex items-center gap-2 px-3 py-2">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${hecho ? "bg-emerald-500" : "bg-amber-400"}`} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{a.p}</span>
                            <span className="block text-[10px] text-slate-500 truncate">{exp} · {a.s || "Sin servicio"}</span>
                          </span>
                          <button
                            onClick={() => void quitar([exp])}
                            disabled={guardando}
                            title="Quitar del reparto"
                            className="p-1 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-50"
                          >
                            <UserMinus size={13} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Configuración de supervisión (solo superusuario) */}
      {esAdmin && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <button
            onClick={() => { setConfigAbierta((o) => !o); if (colaboradoras.length === 0) void cargarBolsa(); }}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300"
          >
            <Settings2 size={15} className="text-slate-400" />
            Quién puede repartir
            <span className="ml-auto text-xs font-normal text-slate-500">
              {Object.keys(equipo?.supervisoras ?? {}).length || "sin definir"}
            </span>
          </button>
          {configAbierta && (
            <div className="px-4 pb-4 space-y-2">
              <p className="text-xs text-slate-500">
                Marca a las supervisoras de la UTS. Solo ellas (y el superusuario) ven las pestañas de reparto.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {colaboradoras.map((c) => {
                  const activa = !!equipo?.supervisoras?.[c.uid];
                  return (
                    <button
                      key={c.uid}
                      onClick={() => void alternarSupervisora(c)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        activa
                          ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400"
                      }`}
                    >
                      {activa ? <UserCheck size={13} /> : <X size={13} className="opacity-40" />}
                      {c.nombre}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
