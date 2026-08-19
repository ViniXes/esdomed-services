"use client";

// Seguimiento — la hoja diaria de UN paciente.
//
// Antes esta vista bajaba el censo activo completo (~380 pacientes) y mantenía un
// listener EN VIVO sobre `gestiones_ts where fecha == hoy`, es decir, sobre las
// gestiones del día de TODAS las trabajadoras: cada marca de cualquier compañera
// costaba una lectura a cada pestaña abierta, para pintar una lista de 380 filas
// de las que se trabajan unas pocas decenas.
//
// Ahora se entra por BUSCADOR: abrir la vista no lee nada; buscar usa la caché de
// censo que ya comparten Rastreo y Visitas (0 lecturas si viene de ahí); y
// abrir un paciente lee solo lo suyo — su rastreo (1 doc) y sus gestiones de ESE
// día (`expediente == X && fecha == D`, dos igualdades → sin índice compuesto).
//
// Reglas de negocio de la vista:
//   · La fecha por defecto es hoy y NO se puede registrar en el futuro.
//   · Sí se puede registrar en días pasados (lo que se olvidó anotar), con aviso
//     visible; el resumen mensual se incrementa en el mes de la fecha elegida.
//   · Cada gestión lleva SU propia nota: dos visitas el mismo día son dos
//     registros con dos notas independientes (antes la nota era del "último
//     chip del día" y se compartía).

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  collection, deleteField, doc, getDoc, getDocs, limit, query, Timestamp,
  updateDoc, where, writeBatch,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import type { EstadoPaciente, GestionTS, Paciente, Persona, RastreoTS } from "@/types";
import {
  ACCIONES_SEGUIMIENTO, ESTADO_RASTREO_COLOR, ESTADO_RASTREO_LABEL, esTipoVisita,
  GRUPOS_GESTION_TS, keyAccionSeguimiento, labelTipoGestion, MODALIDAD_GESTION_LABEL,
  TIPOS_GESTION_TS,
  type AccionSeguimiento, type EstadoPacienteGestion, type EstadoRastreo,
  type ModalidadGestion, type ResultadoVisita,
} from "@/lib/trabajosocial/catalogos";
import {
  resumenDiaInc, resumenRastreoSet, resumenSeguimientoInc,
} from "@/lib/trabajosocial/resumenTS";
import {
  consultarPacientesActivos, getPacientesActivosCache,
} from "@/lib/trabajosocial/pacientesActivosCache";
import {
  tomarAperturaSeguimiento, type SeleccionPaciente,
} from "@/lib/trabajosocial/seleccionPaciente";
import {
  AlertTriangle, BedDouble, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight,
  ListChecks, Loader2, Phone, PhoneCall, Plus, Search, StickyNote, Stethoscope,
  Trash2, UserSearch, Users, Video, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const selectCls =
  "appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";

// Ícono y etiqueta corta de cada acción (llave = tipo|modalidad del catálogo).
const ICONO_ACCION: Record<string, LucideIcon> = {
  "seguimiento_familiar|videollamada": Video,
  "seguimiento_familiar|llamada": Phone,
  "llamada_con_medico|llamada": Stethoscope,
  "seguimiento_sts|llamada": PhoneCall,
  "visita_familiar|presencial": Users,
};
const ETIQUETA_ACCION: Record<string, string> = {
  "seguimiento_familiar|videollamada": "Videollamada",
  "seguimiento_familiar|llamada": "Llam. familiar",
  "llamada_con_medico|llamada": "Llam. médico",
  "seguimiento_sts|llamada": "Seg. STS",
  "visita_familiar|presencial": "Visita",
};
const ACCION_POR_KEY = new Map(ACCIONES_SEGUIMIENTO.map((a) => [a.key, a]));

const LS_RECIENTES = "ts_seguimiento_recientes";
const MAX_RECIENTES = 6;

// ── Fechas ("YYYY-MM-DD" local, sin corrimiento UTC) ─────────────────────────
const pad = (n: number) => `${n}`.padStart(2, "0");
const aTexto = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoyStr = () => aTexto(new Date());
const aFecha = (f: string) => {
  const m = f.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
};
const sumarDias = (f: string, n: number) => {
  const d = aFecha(f);
  d.setDate(d.getDate() + n);
  return aTexto(d);
};
const mesDe = (f: string) => f.slice(0, 7);
const fechaLarga = (f: string) =>
  aFecha(f).toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long" });

const toMillis = (ts: unknown) => (ts as { toMillis?: () => number })?.toMillis?.() ?? 0;
const toDate = (ts: unknown) => (ts as { toDate?: () => Date })?.toDate?.() ?? null;
const nombrePac = (p: { apellidos: string; nombres: string }) => `${p.apellidos}, ${p.nombres}`;

// Variantes del expediente aceptadas al buscar en el padrón (4599-26 / 459926).
function candidatosExpediente(valor: string): string[] {
  const original = valor.trim().toUpperCase().replace(/\s+/g, "");
  let normalizado = original;
  if (!original.includes("-")) {
    const soloNumeros = original.replace(/\D/g, "");
    if (soloNumeros.length >= 4) normalizado = `${soloNumeros.slice(0, -2)}-${soloNumeros.slice(-2)}`;
  }
  return Array.from(new Set([original, normalizado].filter(Boolean))).slice(0, 10);
}

// ── Paciente seleccionado ────────────────────────────────────────────────────
// La forma vive en lib/trabajosocial/seleccionPaciente (la comparte Asignaciones
// para entregar el paciente ya resuelto, sin que esta vista tenga que buscarlo).
type Seleccion = SeleccionPaciente;

function estadoGestionDe(e?: EstadoPaciente): EstadoPacienteGestion {
  if (!e) return "na";
  if (e === "activo") return "actual";
  if (e === "alta_fallecido") return "defuncion";
  return "alta";
}

function desdeIngreso(p: Paciente): Seleccion {
  return {
    expediente: p.expediente,
    nombre: nombrePac(p),
    servicio: p.servicioActual || undefined,
    cama: p.camaActual || undefined,
    ingresoId: p.id,
    estadoPaciente: estadoGestionDe(p.estado),
    familiar: p.responsable?.nombre || undefined,
    parentesco: p.responsable?.parentesco || undefined,
    telefono: p.responsable?.telefono || p.telefono || undefined,
  };
}

function desdePersona(p: Persona): Seleccion {
  return {
    expediente: p.expediente,
    nombre: nombrePac(p),
    estadoPaciente: "na",
    familiar: p.responsable?.nombre || undefined,
    parentesco: p.responsable?.parentesco || undefined,
    telefono: p.responsable?.telefono || p.telefono || undefined,
  };
}

// Pacientes abiertos recientemente (localStorage): atajo de vuelta sin lecturas.
function leerRecientes(): Seleccion[] {
  try {
    const raw = localStorage.getItem(LS_RECIENTES);
    const lista = raw ? (JSON.parse(raw) as Seleccion[]) : [];
    return Array.isArray(lista) ? lista.slice(0, MAX_RECIENTES) : [];
  } catch {
    return [];
  }
}
function guardarReciente(s: Seleccion): Seleccion[] {
  const lista = [s, ...leerRecientes().filter((r) => r.expediente !== s.expediente)].slice(0, MAX_RECIENTES);
  try {
    localStorage.setItem(LS_RECIENTES, JSON.stringify(lista));
  } catch {
    /* modo privado / cuota llena: los recientes son un lujo, no rompen el flujo */
  }
  return lista;
}

// `useSearchParams` obliga a un límite de Suspense en el App Router.
export default function SeguimientoPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-400">Cargando…</p>}>
      <SeguimientoVista />
    </Suspense>
  );
}

function SeguimientoVista() {
  const { profile } = useAuth();
  const expDeUrl = useSearchParams().get("exp");

  const [fecha, setFecha] = useState(hoyStr);
  const [termino, setTermino] = useState("");
  const [censo, setCenso] = useState<Paciente[]>(() => getPacientesActivosCache() ?? []);
  const [cargandoCenso, setCargandoCenso] = useState(false);
  const [externos, setExternos] = useState<Seleccion[] | null>(null); // resultados del padrón
  const [buscandoPadron, setBuscandoPadron] = useState(false);
  const [recientes, setRecientes] = useState<Seleccion[]>([]);

  const [sel, setSel] = useState<Seleccion | null>(null);
  const [rastreo, setRastreo] = useState<RastreoTS | null>(null);
  const [gestiones, setGestiones] = useState<GestionTS[]>([]);
  const [cargandoDia, setCargandoDia] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState(false);

  const [otraAbierta, setOtraAbierta] = useState(false);
  const [otraTipo, setOtraTipo] = useState("");
  const [otraModalidad, setOtraModalidad] = useState<ModalidadGestion>("presencial");
  const [otraNota, setOtraNota] = useState("");
  const [notaEditando, setNotaEditando] = useState<string | null>(null);
  const [notaTexto, setNotaTexto] = useState("");
  const [guardandoNota, setGuardandoNota] = useState(false);

  const [toast, setToast] = useState<{ tipo: "success" | "error"; msg: string } | null>(null);
  const deepLinkHecho = useRef(false);

  const hoy = hoyStr();
  const esHoy = fecha === hoy;
  const esFuturo = fecha > hoy;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Diferido para no tocar estado de forma síncrona dentro del efecto.
  useEffect(() => {
    const t = setTimeout(() => setRecientes(leerRecientes()), 0);
    return () => clearTimeout(t);
  }, []);

  const cargarCenso = useCallback(async () => {
    setCargandoCenso(true);
    try {
      setCenso(await consultarPacientesActivos());
    } catch {
      setToast({ tipo: "error", msg: "No se pudo cargar el censo de pacientes activos" });
    } finally {
      setCargandoCenso(false);
    }
  }, []);

  // El censo se baja SOLO cuando de verdad se busca, y una vez por sesión: es la
  // misma caché de módulo que ya usan Rastreo y Visitas.
  useEffect(() => {
    if (termino.trim().length < 2) return;
    if (getPacientesActivosCache() !== null) return;
    const t = setTimeout(cargarCenso, 0);
    return () => clearTimeout(t);
  }, [termino, cargarCenso]);

  const resultados = useMemo(() => {
    const t = termino.trim().toLowerCase();
    if (t.length < 2) return [];
    return censo
      .filter((p) => p.expediente.toLowerCase().includes(t) || nombrePac(p).toLowerCase().includes(t))
      .sort((a, b) => nombrePac(a).localeCompare(nombrePac(b)))
      .slice(0, 8)
      .map(desdeIngreso);
  }, [censo, termino]);

  // ── Carga del paciente / del día ───────────────────────────────────────────
  const cargarGestiones = useCallback(async (exp: string, f: string) => {
    setCargandoDia(true);
    try {
      const snap = await getDocs(query(
        collection(db, "gestiones_ts"),
        where("expediente", "==", exp),
        where("fecha", "==", f),
      ));
      setPermissionError(false);
      setGestiones(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GestionTS)));
    } catch (err) {
      if ((err as { code?: string }).code === "permission-denied") setPermissionError(true);
      setGestiones([]);
    } finally {
      setCargandoDia(false);
    }
  }, []);

  const abrirPaciente = useCallback(async (s: Seleccion) => {
    setSel(s);
    setTermino("");
    setExternos(null);
    setOtraAbierta(false);
    setNotaEditando(null);
    setRastreo(null);
    setRecientes(guardarReciente(s));
    await Promise.all([
      cargarGestiones(s.expediente, fecha),
      getDoc(doc(db, "rastreos_ts", s.expediente))
        .then((d) => setRastreo(d.exists() ? ({ id: d.id, ...d.data() } as RastreoTS) : null))
        .catch(() => setRastreo(null)),
    ]);
  }, [cargarGestiones, fecha]);

  const cambiarFecha = useCallback((f: string) => {
    if (!f || f > hoyStr()) return;
    setFecha(f);
    setNotaEditando(null);
    setOtraAbierta(false);
    if (sel) void cargarGestiones(sel.expediente, f);
  }, [cargarGestiones, sel]);

  // Expediente fuera del censo activo (egresado, ambulatorio, ISBM). Consulta
  // directa por expediente: nunca baja el censo completo.
  const resolverExpediente = useCallback(async (valor: string): Promise<Seleccion[]> => {
    const cands = candidatosExpediente(valor);
    if (!cands.length) return [];
    const snap = await getDocs(query(
      collection(db, "pacientes"), where("expediente", "in", cands), limit(10),
    ));
    const ingresos = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Paciente));
    if (ingresos.length) {
      // Un expediente puede tener N estancias: se ofrece la más reciente.
      const porExp = new Map<string, Paciente>();
      for (const p of ingresos) {
        const prev = porExp.get(p.expediente);
        if (!prev || toMillis(p.fechaIngreso) > toMillis(prev.fechaIngreso)) porExp.set(p.expediente, p);
      }
      return [...porExp.values()].map(desdeIngreso);
    }
    for (const c of cands) {
      const s = await getDoc(doc(db, "personas", c));
      if (s.exists()) return [desdePersona(s.data() as Persona)];
    }
    return [];
  }, []);

  const buscarEnPadron = useCallback(async () => {
    setBuscandoPadron(true);
    try {
      setExternos(await resolverExpediente(termino));
    } catch {
      setToast({ tipo: "error", msg: "No se pudo buscar en el padrón" });
    } finally {
      setBuscandoPadron(false);
    }
  }, [resolverExpediente, termino]);

  // Entrada directa a un paciente. Una sola vez al montar — `abrirPaciente`
  // cambia con la fecha y volvería a dispararse al hojear los días.
  //
  // OJO con dónde se marca la bandera: en desarrollo React monta, limpia y vuelve
  // a montar (StrictMode). Si se marcara al PROGRAMAR el timeout, la limpieza del
  // primer montaje lo cancelaría y el segundo montaje ya se saldría por la guarda
  // — el paciente no se abría nunca. Se marca al EJECUTAR.
  useEffect(() => {
    if (deepLinkHecho.current) return;
    const t = setTimeout(async () => {
      if (deepLinkHecho.current) return;
      deepLinkHecho.current = true;
      // 1) Lo entregó Asignaciones: ya viene resuelto (nombre, servicio, cama,
      //    estancia) → la hoja abre al instante y sin una sola lectura de padrón.
      const entregado = tomarAperturaSeguimiento();
      if (entregado) {
        await abrirPaciente(entregado);
        return;
      }
      // 2) ?exp= (recarga de la página o enlace compartido): hay que resolverlo.
      if (!expDeUrl) return;
      const enCenso = (getPacientesActivosCache() ?? []).find((p) => p.expediente === expDeUrl);
      const s = enCenso ? desdeIngreso(enCenso) : (await resolverExpediente(expDeUrl).catch(() => []))[0];
      if (s) await abrirPaciente(s);
    }, 0);
    return () => clearTimeout(t);
  }, [abrirPaciente, expDeUrl, resolverExpediente]);

  // ── Registro ───────────────────────────────────────────────────────────────
  const registrar = useCallback(async (opts: {
    tipo: string;
    modalidad: ModalidadGestion;
    resultadoVisita?: ResultadoVisita;
    notas?: string;
  }) => {
    if (!profile || !sel || esFuturo) return;
    const key = keyAccionSeguimiento(opts);
    // Marcar una de las 5 acciones familiares DEMUESTRA el contacto: el rastreo
    // se completa solo (solo hacia arriba; nunca pisa alta/defunción/no aplica).
    const esAccion = ACCION_POR_KEY.has(key);

    const nuevo: Record<string, unknown> = {
      expediente: sel.expediente,
      pacienteNombre: sel.nombre,
      servicio: sel.servicio,
      ingresoId: sel.ingresoId,
      estadoPaciente: sel.estadoPaciente,
      vinculadoPadron: true,
      tipo: opts.tipo,
      resultadoVisita: opts.resultadoVisita,
      modalidad: opts.modalidad,
      notas: opts.notas?.trim() || undefined,
      fecha,
      trabajadoraId: profile.uid,
      trabajadoraNombre: profile.nombre,
      creadoEn: Timestamp.now(),
    };
    const payload = Object.fromEntries(Object.entries(nuevo).filter(([, v]) => v !== undefined));

    const batch = writeBatch(db);
    const ref = doc(collection(db, "gestiones_ts"));
    batch.set(ref, payload);
    // El mes sale de la fecha ELEGIDA, no del mes en curso (registro retroactivo).
    if (esAccion) resumenSeguimientoInc(batch, mesDe(fecha), sel.expediente, key, 1);
    resumenDiaInc(batch, fecha, sel.expediente, key, profile.uid, 1);

    const est = rastreo?.estado;
    const autoContacto = esAccion && (est === undefined || est === "en_gestion" || est === "no_efectivo");
    if (autoContacto) {
      batch.set(doc(db, "rastreos_ts", sel.expediente), {
        expediente: sel.expediente,
        pacienteId: sel.ingresoId ?? null,
        pacienteNombre: sel.nombre,
        servicio: sel.servicio ?? null,
        cama: sel.cama ?? null,
        vinculadoPadron: true,
        estado: "contactado",
        fechaContacto: fecha,
        trabajadoraId: profile.uid,
        trabajadoraNombre: profile.nombre,
        actualizadoEn: Timestamp.now(),
        ...(est === undefined ? { creadoEn: Timestamp.now() } : {}),
      }, { merge: true });
      resumenRastreoSet(batch, sel.expediente, { e: "contactado", u: hoyStr() });
    }

    await batch.commit();
    setGestiones((prev) => [...prev, { id: ref.id, ...payload } as GestionTS]);
    if (autoContacto) {
      setRastreo((prev) => ({ ...(prev ?? {}), estado: "contactado", fechaContacto: fecha } as RastreoTS));
    }
    return autoContacto;
  }, [esFuturo, fecha, profile, rastreo, sel]);

  const clicAccion = useCallback(async (a: AccionSeguimiento) => {
    if (ocupada) return;
    setOcupada(a.key);
    try {
      const auto = await registrar({ tipo: a.tipo, modalidad: a.modalidad, resultadoVisita: a.resultadoVisita });
      setToast({
        tipo: "success",
        msg: auto ? `${a.chip} — contacto familiar registrado en Rastreo` : `${a.chip} registrada`,
      });
    } catch {
      setToast({ tipo: "error", msg: "No se pudo registrar la gestión" });
    } finally {
      setOcupada(null);
    }
  }, [ocupada, registrar]);

  const registrarOtra = useCallback(async () => {
    if (!otraTipo || ocupada) return;
    setOcupada("otra");
    try {
      await registrar({
        tipo: otraTipo,
        modalidad: otraModalidad,
        resultadoVisita: esTipoVisita(otraTipo) ? "realizada" : undefined,
        notas: otraNota,
      });
      setToast({ tipo: "success", msg: `${labelTipoGestion(otraTipo)} registrada` });
      setOtraTipo("");
      setOtraNota("");
      setOtraModalidad("presencial");
      setOtraAbierta(false);
    } catch {
      setToast({ tipo: "error", msg: "No se pudo registrar la gestión" });
    } finally {
      setOcupada(null);
    }
  }, [ocupada, otraModalidad, otraNota, otraTipo, registrar]);

  // Nota propia de ESTA gestión (no del día ni de la acción).
  const guardarNota = useCallback(async (g: GestionTS, texto: string) => {
    if (!g.id) return;
    setGuardandoNota(true);
    try {
      await updateDoc(doc(db, "gestiones_ts", g.id), { notas: texto.trim() || deleteField() });
      setGestiones((prev) => prev.map((x) =>
        x.id === g.id ? { ...x, notas: texto.trim() || undefined } : x));
      setNotaEditando(null);
      setToast({ tipo: "success", msg: texto.trim() ? "Nota guardada" : "Nota eliminada" });
    } catch {
      setToast({ tipo: "error", msg: "No se pudo guardar la nota" });
    } finally {
      setGuardandoNota(false);
    }
  }, []);

  const eliminar = useCallback(async (g: GestionTS) => {
    if (!g.id || ocupada) return;
    setOcupada(g.id);
    try {
      const key = keyAccionSeguimiento(g);
      const batch = writeBatch(db);
      batch.delete(doc(db, "gestiones_ts", g.id));
      if (ACCION_POR_KEY.has(key)) resumenSeguimientoInc(batch, mesDe(g.fecha), g.expediente, key, -1);
      resumenDiaInc(batch, g.fecha, g.expediente, key, g.trabajadoraId, -1);
      await batch.commit();
      setGestiones((prev) => prev.filter((x) => x.id !== g.id));
      setToast({ tipo: "success", msg: "Gestión eliminada" });
    } catch {
      setToast({ tipo: "error", msg: "No se pudo eliminar la gestión" });
    } finally {
      setOcupada(null);
    }
  }, [ocupada]);

  // ── Derivados del día ──────────────────────────────────────────────────────
  const ordenadas = useMemo(
    () => [...gestiones].sort((a, b) => toMillis(a.creadoEn) - toMillis(b.creadoEn)),
    [gestiones],
  );
  const conteoPorKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of gestiones) {
      const k = keyAccionSeguimiento(g);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [gestiones]);
  const otrasDelDia = useMemo(
    () => gestiones.filter((g) => !ACCION_POR_KEY.has(keyAccionSeguimiento(g))).length,
    [gestiones],
  );

  const estadoRastreo = (rastreo?.estado ?? undefined) as EstadoRastreo | undefined;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892] mb-1">
            <ListChecks size={13} /> Trabajo Social
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Seguimiento</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Busca al paciente y registra lo que se hizo con él en el día.
          </p>
        </div>

        {/* Selector de día — el futuro queda bloqueado en el propio calendario */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => cambiarFecha(sumarDias(fecha, -1))}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Día anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <DateField
            value={fecha}
            onChange={cambiarFecha}
            maxDate={new Date()}
            ariaLabel="Fecha de la hoja de seguimiento"
            className="w-[190px]"
          />
          <button
            onClick={() => cambiarFecha(sumarDias(fecha, 1))}
            disabled={esHoy}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Día siguiente"
          >
            <ChevronRight size={16} />
          </button>
          {!esHoy && (
            <button
              onClick={() => cambiarFecha(hoy)}
              className="px-3 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Hoy
            </button>
          )}
        </div>
      </div>

      {permissionError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Sin permisos para leer las gestiones. Pide al administrador que despliegue las reglas de <strong>gestiones_ts</strong>, <strong>rastreos_ts</strong> y <strong>ts_resumen</strong>.
        </div>
      )}

      {/* Buscador */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={termino}
            onChange={(e) => { setTermino(e.target.value); setExternos(null); }}
            placeholder="Expediente o nombre del paciente…"
            className={inputCls + " pl-9 py-3 text-base"}
          />
          {termino && (
            <button
              onClick={() => { setTermino(""); setExternos(null); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Limpiar búsqueda"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {termino.trim().length >= 2 && (
          <div className="space-y-1.5">
            {cargandoCenso && (
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Cargando pacientes activos…
              </p>
            )}
            {(externos ?? resultados).map((s) => (
              <button
                key={s.expediente}
                onClick={() => void abrirPaciente(s)}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <span className="font-mono text-[11px] text-slate-500 w-[68px] shrink-0">{s.expediente}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">{s.nombre}</span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {s.servicio || "Sin servicio"}{s.cama ? ` · Cama ${s.cama}` : ""}
                  </span>
                </span>
                <ChevronRight size={15} className="text-slate-400 shrink-0" />
              </button>
            ))}

            {!cargandoCenso && resultados.length === 0 && externos === null && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-1">
                <span>Ningún paciente activo coincide.</span>
                <button
                  onClick={() => void buscarEnPadron()}
                  disabled={buscandoPadron}
                  className="inline-flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                >
                  {buscandoPadron ? <Loader2 size={12} className="animate-spin" /> : <UserSearch size={12} />}
                  Buscar el expediente en el padrón
                </button>
              </div>
            )}
            {externos !== null && externos.length === 0 && (
              <p className="text-xs text-slate-500 pt-1">El expediente no existe en el padrón.</p>
            )}
          </div>
        )}

        {!sel && termino.trim().length < 2 && recientes.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Recientes</p>
            <div className="flex flex-wrap gap-1.5">
              {recientes.map((r) => (
                <button
                  key={r.expediente}
                  onClick={() => void abrirPaciente(r)}
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  <span className="font-mono text-[10px] text-slate-400">{r.expediente}</span>
                  <span className="truncate max-w-[180px]">{r.nombre}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!sel ? (
        <div className="text-center py-16 text-slate-400">
          <UserSearch size={34} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Busca un paciente por expediente o nombre para abrir su hoja del día.</p>
        </div>
      ) : (
        <>
          {/* Ficha del paciente */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] text-slate-500">{sel.expediente}</span>
                  {estadoRastreo ? (
                    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${ESTADO_RASTREO_COLOR[estadoRastreo]}`}>
                      {ESTADO_RASTREO_LABEL[estadoRastreo]}
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900">
                      Sin rastrear
                    </span>
                  )}
                </div>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading truncate mt-0.5">{sel.nombre}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                  <BedDouble size={12} className="text-slate-400" />
                  {sel.servicio || "Sin servicio"}{sel.cama ? ` · Cama ${sel.cama}` : ""}
                </p>
                {(rastreo?.familiarNombre || sel.familiar || rastreo?.telefono || sel.telefono) && (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <Phone size={12} className="text-slate-400" />
                    {[
                      rastreo?.familiarNombre || sel.familiar,
                      rastreo?.parentesco || sel.parentesco,
                      (rastreo?.telefono || sel.telefono || "").split("\n")[0],
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <button
                onClick={() => { setSel(null); setGestiones([]); setRastreo(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                aria-label="Cerrar paciente"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Aviso de fecha pasada */}
          {!esHoy && (
            <div className="flex items-center gap-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
              <CalendarClock size={16} className="shrink-0" />
              <span>
                Estás en <strong className="capitalize">{fechaLarga(fecha)}</strong>. Lo que registres aquí queda con esa fecha.
              </span>
            </div>
          )}

          {/* Acciones grandes */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {ACCIONES_SEGUIMIENTO.map((a) => {
              const Icono = ICONO_ACCION[a.key] ?? PhoneCall;
              const n = conteoPorKey.get(a.key) ?? 0;
              return (
                <button
                  key={a.key}
                  onClick={() => void clicAccion(a)}
                  disabled={!!ocupada}
                  title={n > 0 ? `${a.chip} — ${n} este día (toca para agregar otra)` : `Registrar: ${a.chip}`}
                  className={`relative flex flex-col items-center justify-center gap-2 h-24 rounded-2xl border text-center px-2 transition-colors disabled:opacity-60 ${
                    n > 0
                      ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  {ocupada === a.key
                    ? <Loader2 size={22} className="animate-spin" />
                    : <Icono size={22} strokeWidth={1.75} />}
                  <span className="text-xs font-semibold leading-tight">{ETIQUETA_ACCION[a.key] ?? a.chip}</span>
                  {n > 0 && (
                    <span className="absolute top-1.5 right-2 text-xs font-bold tabular-nums bg-emerald-600 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setOtraAbierta((o) => !o)}
              disabled={!!ocupada}
              title="Registrar otra gestión del catálogo"
              className={`relative flex flex-col items-center justify-center gap-2 h-24 rounded-2xl border text-center px-2 transition-colors disabled:opacity-60 ${
                otrasDelDia > 0 || otraAbierta
                  ? "bg-violet-50 dark:bg-violet-950/60 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-violet-400"
              }`}
            >
              <Plus size={22} strokeWidth={1.75} />
              <span className="text-xs font-semibold leading-tight">Otra</span>
              {otrasDelDia > 0 && (
                <span className="absolute top-1.5 right-2 text-xs font-bold tabular-nums bg-violet-600 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {otrasDelDia}
                </span>
              )}
            </button>
          </div>

          {/* Panel de "Otra gestión" */}
          {otraAbierta && (
            <div className="bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-900 rounded-2xl p-4 space-y-2.5">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <select value={otraTipo} onChange={(e) => setOtraTipo(e.target.value)} autoFocus className={selectCls + " flex-1"}>
                  <option value="">— Selecciona el tipo de gestión</option>
                  {GRUPOS_GESTION_TS.map((grupo) => (
                    <optgroup key={grupo} label={grupo}>
                      {TIPOS_GESTION_TS.filter((t) => t.grupo === grupo).map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <select
                  value={otraModalidad}
                  onChange={(e) => setOtraModalidad(e.target.value as ModalidadGestion)}
                  className={selectCls + " sm:w-[170px]"}
                >
                  {(Object.keys(MODALIDAD_GESTION_LABEL) as ModalidadGestion[]).map((m) => (
                    <option key={m} value={m}>{MODALIDAD_GESTION_LABEL[m]}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={otraNota}
                onChange={(e) => setOtraNota(e.target.value)}
                rows={2}
                placeholder="Nota de esta gestión (opcional)…"
                className={inputCls + " resize-y text-xs"}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setOtraAbierta(false); setOtraTipo(""); setOtraNota(""); }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-3 py-2 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void registrarOtra()}
                  disabled={!otraTipo || ocupada === "otra"}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {ocupada === "otra" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Registrar
                </button>
              </div>
            </div>
          )}

          {/* Gestiones del día */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 font-heading capitalize">
                {esHoy ? "Hoy" : fechaLarga(fecha)}
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {gestiones.length} {gestiones.length === 1 ? "gestión" : "gestiones"}
              </span>
            </div>

            {cargandoDia ? (
              <p className="text-sm text-slate-400 py-10 text-center">Cargando…</p>
            ) : ordenadas.length === 0 ? (
              <p className="text-sm text-slate-400 py-10 text-center">
                Sin gestiones registradas {esHoy ? "hoy" : "ese día"}.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {ordenadas.map((g) => {
                  const key = keyAccionSeguimiento(g);
                  const Icono = ICONO_ACCION[key] ?? Plus;
                  const esMia = g.trabajadoraId === profile?.uid;
                  const captura = toDate(g.creadoEn);
                  const editando = notaEditando === g.id;
                  return (
                    <li key={g.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          ACCION_POR_KEY.has(key)
                            ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
                            : "bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400"
                        }`}>
                          <Icono size={16} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {ACCION_POR_KEY.get(key)?.chip ?? labelTipoGestion(g.tipo)}
                            {!ACCION_POR_KEY.has(key) && (
                              <span className="font-normal text-slate-500"> · {MODALIDAD_GESTION_LABEL[g.modalidad]}</span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {g.trabajadoraNombre}
                            {captura && (
                              <span title={`Registrada el ${captura.toLocaleString("es-SV")}`}>
                                {" · "}{captura.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                            {captura && aTexto(captura) !== g.fecha && (
                              <span className="ml-1.5 text-amber-600 dark:text-amber-400">· registrada después</span>
                            )}
                          </p>

                          {editando ? (
                            <div className="mt-2 space-y-1.5">
                              <textarea
                                value={notaTexto}
                                onChange={(e) => setNotaTexto(e.target.value)}
                                rows={2}
                                autoFocus
                                placeholder="Detalle de esta gestión… (vacío borra la nota)"
                                className={inputCls + " resize-y text-xs"}
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setNotaEditando(null)}
                                  disabled={guardandoNota}
                                  className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => void guardarNota(g, notaTexto)}
                                  disabled={guardandoNota}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {guardandoNota ? <Loader2 size={12} className="animate-spin" /> : <StickyNote size={12} />}
                                  Guardar nota
                                </button>
                              </div>
                            </div>
                          ) : g.notas ? (
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">
                              {g.notas}
                            </p>
                          ) : null}
                        </div>

                        {esMia && !editando && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => { setNotaTexto(g.notas ?? ""); setNotaEditando(g.id ?? null); }}
                              title={g.notas ? "Editar nota" : "Agregar nota"}
                              className={`p-1.5 rounded-lg transition-colors ${
                                g.notas
                                  ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950"
                                  : "text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                              }`}
                            >
                              <StickyNote size={14} />
                            </button>
                            <button
                              onClick={() => void eliminar(g)}
                              disabled={ocupada === g.id}
                              title="Eliminar esta gestión"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors disabled:opacity-50"
                            >
                              {ocupada === g.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
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
