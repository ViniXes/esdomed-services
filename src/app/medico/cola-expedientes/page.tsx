"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  collection, query, orderBy, onSnapshot, limit, where, getDocs, Timestamp, QueryConstraint,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { DateField } from "@/components/ui/DateField";
import { Ambulance } from "lucide-react";
import { Icon } from "@iconify/react";
import medicalKit from "@iconify-icons/solar/medical-kit-linear";
import calendar from "@iconify-icons/solar/calendar-minimalistic-linear";
import pulse from "@iconify-icons/solar/pulse-linear";
import user from "@iconify-icons/solar/user-rounded-linear";
import clock from "@iconify-icons/solar/clock-circle-linear";
import history from "@iconify-icons/solar/history-linear";
import magnifer from "@iconify-icons/solar/magnifer-linear";
import closeCircle from "@iconify-icons/solar/close-circle-linear";
import addCircle from "@iconify-icons/solar/add-circle-linear";
import clipboardList from "@iconify-icons/solar/clipboard-list-linear";
import hospital from "@iconify-icons/solar/hospital-linear";
import pen from "@iconify-icons/solar/pen-2-linear";

type ControlIngreso = {
  id?: string;
  expediente: string;
  dui?: string;
  apellidos: string;
  nombres: string;
  edad?: number;
  genero?: "masculino" | "femenino";
  servicio: string;
  ingresoDirectoServicio?: boolean;
  responsableIngresoNombre: string;
  creadoEn: Date;
};

function tsToDate(ts: unknown): Date {
  return ((ts as unknown) as { toDate?: () => Date }).toDate?.() ?? (ts as Date);
}

function formatFecha(ts: unknown) {
  if (!ts) return "—";
  return tsToDate(ts).toLocaleDateString("es-HN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function formatHora(ts: unknown) {
  if (!ts) return "—";
  return tsToDate(ts).toLocaleTimeString("es-HN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function esFechaHoy(ts: unknown): boolean {
  const d = tsToDate(ts);
  const hoy = new Date();
  return d.getFullYear() === hoy.getFullYear() &&
    d.getMonth() === hoy.getMonth() &&
    d.getDate() === hoy.getDate();
}

// Estado de censo de una ATENCIÓN (registro de la cola) dentro de la ventana
// ayer+hoy. Un paciente puede consultar varias veces, así que el censo se
// vincula al registro exacto de control_ingresos (controlIngresoId); para
// censos digitados sin pasar por la cola se cae al expediente + mismo día.
type CensoEstado = { tipo: "demanda" | "referido"; estado: "abierto" | "cerrado"; id: string };

type CensoLookup = {
  porCi: Map<string, { id: string; estado: "abierto" | "cerrado" }>;
  porExpSinCi: Map<string, { id: string; estado: "abierto" | "cerrado"; fecha: Date }[]>;
};

function esMismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const CENSO_TIPO_LABEL: Record<CensoEstado["tipo"], string> = {
  demanda: "Demanda",
  referido: "Referido",
};

// Badge del estado de censo de la fila: pendiente / en proceso / completado.
function BadgeCenso({ censo }: { censo: CensoEstado | null }) {
  if (!censo) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide text-slate-400 border border-dashed border-slate-300 dark:border-slate-600 whitespace-nowrap">
        Censo pendiente
      </span>
    );
  }
  return censo.estado === "cerrado" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 whitespace-nowrap">
      {CENSO_TIPO_LABEL[censo.tipo]} · Completado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900 whitespace-nowrap">
      {CENSO_TIPO_LABEL[censo.tipo]} · En proceso
    </span>
  );
}

// Botón "+" de cada registro del tablero: registrar ESA atención en uno de
// los dos censos de emergencia llevándose la identidad ya digitada por
// ESDOMED (expediente, nombre, edad, género). El menú se dibuja con posición
// fija para que no lo recorte el overflow horizontal de la tabla.
// Si el expediente ya está en un censo, el botón se sustituye por el badge:
// un paciente no se registra en los dos censos.
const MENU_CENSO_W = 288;

function MenuCensoFila({ ingreso, censo }: { ingreso: ControlIngreso; censo: CensoEstado | null }) {
  const router = useRouter();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const cerrarClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPos(null);
    };
    const cerrar = () => setPos(null);
    document.addEventListener("mousedown", cerrarClick);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", cerrarClick);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [pos]);

  const abrir = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (pos) return setPos(null);
    const r = e.currentTarget.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - MENU_CENSO_W, window.innerWidth - MENU_CENSO_W - 8));
    // Abre hacia arriba si no cabe abajo (~150px de menú).
    const top = r.bottom + 150 > window.innerHeight ? r.top - 150 - 6 : r.bottom + 6;
    setPos({ top, left });
  };

  const irACenso = (censo: "demanda-espontanea" | "referidos") => {
    setPos(null);
    const p = new URLSearchParams({ exp: ingreso.expediente });
    // Vincula el censo a ESTE registro de la cola (un paciente puede tener
    // varias consultas; el censo se diferencia por atención).
    if (ingreso.id) p.set("ci", ingreso.id);
    const nombre = `${ingreso.nombres ?? ""} ${ingreso.apellidos ?? ""}`.replace(/\s+/g, " ").trim();
    if (nombre) p.set("nombre", nombre);
    if (typeof ingreso.edad === "number") p.set("edad", String(ingreso.edad));
    if (ingreso.genero === "masculino" || ingreso.genero === "femenino") p.set("genero", ingreso.genero);
    // El momento de la atención hereda la fecha/hora en que ESDOMED registró
    // el expediente (mismo registro del que salen nombre, edad y sexo).
    if (ingreso.creadoEn) p.set("fecha", String(tsToDate(ingreso.creadoEn).getTime()));
    router.push(`/medico/censos/${censo}?${p.toString()}`);
  };

  // Ya registrado en un censo: se muestra el estado con lápiz para editarlo;
  // no se permite volver a registrarlo (ni en el otro censo).
  if (censo) {
    return (
      <span className="inline-flex items-center gap-1">
        <BadgeCenso censo={censo} />
        <Link
          href={`/medico/censos/${censo.tipo === "demanda" ? "demanda-espontanea" : "referidos"}?editar=${censo.id}`}
          className="inline-flex p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
          aria-label="Editar registro de censo"
          title="Editar registro de censo"
        >
          <Icon icon={pen} width={15} />
        </Link>
      </span>
    );
  }

  return (
    <div ref={ref} className="inline-flex items-center gap-1.5">
      <BadgeCenso censo={null} />
      <button
        onClick={abrir}
        title="Registrar en censo"
        aria-label="Registrar en censo"
        className={`p-1.5 rounded-lg border transition-colors ${
          pos
            ? "bg-blue-600 text-white border-blue-600"
            : "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 hover:bg-blue-600 hover:text-white hover:border-blue-600"
        }`}
      >
        <Icon icon={addCircle} width={17} />
      </button>

      {pos && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_CENSO_W }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden z-50"
        >
          <p className="px-4 pt-2.5 pb-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 truncate">
            {ingreso.expediente} · {ingreso.nombres} {ingreso.apellidos}
          </p>
          <button
            onClick={() => irACenso("demanda-espontanea")}
            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="w-8 h-8 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-900 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon icon={clipboardList} width={18} className="text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Censo de demanda espontánea</p>
              <p className="text-xs text-slate-500 mt-0.5">Paciente que consulta sin referencia</p>
            </div>
          </button>
          <div className="border-t border-slate-100 dark:border-slate-800" />
          <button
            onClick={() => irACenso("referidos")}
            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-900 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon icon={hospital} width={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Censo de referidos</p>
              <p className="text-xs text-slate-500 mt-0.5">Paciente referido de otro establecimiento</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

function esFechaAyer(ts: unknown): boolean {
  const d = tsToDate(ts);
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  return d.getFullYear() === ayer.getFullYear() &&
    d.getMonth() === ayer.getMonth() &&
    d.getDate() === ayer.getDate();
}

export default function ColaExpedientesPage() {
  const [ingresos, setIngresos] = useState<ControlIngreso[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [soloAyer, setSoloAyer] = useState(false);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const [vista, setVista] = useState<"recientes" | "historico">("recientes");
  const [expHistorico, setExpHistorico] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [historicos, setHistoricos] = useState<ControlIngreso[] | null>(null);
  const [buscandoHistoricos, setBuscandoHistoricos] = useState(false);
  const [censosDemanda, setCensosDemanda] = useState<CensoLookup>({ porCi: new Map(), porExpSinCi: new Map() });
  const [censosReferido, setCensosReferido] = useState<CensoLookup>({ porCi: new Map(), porExpSinCi: new Map() });

  // Vista en vivo acotada a ayer + hoy (mismo campo en where/orderBy, no exige
  // índice compuesto). Fechas anteriores se consultan bajo demanda en la
  // pestaña Histórico con una lectura única.
  useEffect(() => {
    const inicioAyer = new Date();
    inicioAyer.setDate(inicioAyer.getDate() - 1);
    inicioAyer.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, "control_ingresos"),
      where("creadoEn", ">=", Timestamp.fromDate(inicioAyer)),
      orderBy("creadoEn", "desc"),
      limit(400),
    );
    return onSnapshot(q, s => {
      setIngresos(s.docs.map(d => ({ id: d.id, ...d.data() } as ControlIngreso)));
      setUltimaActualizacion(new Date());
    });
  }, []);

  // Estado de censo por expediente, acotado a la misma ventana ayer+hoy
  // (volumen chico: ~50 registros/día entre ambos censos). Alimenta los
  // badges y el bloqueo del botón "+" cuando ya hay censo.
  useEffect(() => {
    const inicioAyer = new Date();
    inicioAyer.setDate(inicioAyer.getDate() - 1);
    inicioAyer.setHours(0, 0, 0, 0);
    const sub = (col: string, setter: (m: CensoLookup) => void) =>
      onSnapshot(
        query(
          collection(db, col),
          where("fecha", ">=", Timestamp.fromDate(inicioAyer)),
          orderBy("fecha", "desc"),
          limit(600),
        ),
        s => {
          const porCi = new Map<string, { id: string; estado: "abierto" | "cerrado" }>();
          const porExpSinCi = new Map<string, { id: string; estado: "abierto" | "cerrado"; fecha: Date }[]>();
          s.docs.forEach(d => {
            const data = d.data();
            const estado: "abierto" | "cerrado" = data.estadoRegistro === "cerrado" ? "cerrado" : "abierto";
            if (typeof data.controlIngresoId === "string" && data.controlIngresoId) {
              if (!porCi.has(data.controlIngresoId)) porCi.set(data.controlIngresoId, { id: d.id, estado });
            } else if (typeof data.expediente === "string") {
              const lista = porExpSinCi.get(data.expediente) ?? [];
              lista.push({ id: d.id, estado, fecha: tsToDate(data.fecha) });
              porExpSinCi.set(data.expediente, lista);
            }
          });
          setter({ porCi, porExpSinCi });
        },
        () => { /* sin permisos/reglas aún: los badges simplemente no se muestran */ },
      );
    const u1 = sub("censo_demanda_espontanea", setCensosDemanda);
    const u2 = sub("censo_referidos", setCensosReferido);
    return () => { u1(); u2(); };
  }, []);

  // El match es por ATENCIÓN: primero por el vínculo exacto al registro de la
  // cola; si el censo se digitó sin pasar por la cola (sin vínculo), se cae a
  // expediente + mismo día del registro.
  const censoDe = (ingreso: ControlIngreso): CensoEstado | null => {
    const fuentes: { tipo: CensoEstado["tipo"]; l: CensoLookup }[] = [
      { tipo: "demanda", l: censosDemanda },
      { tipo: "referido", l: censosReferido },
    ];
    for (const { tipo, l } of fuentes) {
      const c = ingreso.id ? l.porCi.get(ingreso.id) : undefined;
      if (c) return { tipo, estado: c.estado, id: c.id };
    }
    const dia = tsToDate(ingreso.creadoEn);
    for (const { tipo, l } of fuentes) {
      const c = l.porExpSinCi.get(ingreso.expediente)?.find(x => esMismoDia(x.fecha, dia));
      if (c) return { tipo, estado: c.estado, id: c.id };
    }
    return null;
  };

  const hoy  = ingresos.filter(i => esFechaHoy(i.creadoEn));
  const ayer = ingresos.filter(i => esFechaAyer(i.creadoEn));
  const ultimo = ingresos[0] ?? null;

  // Búsqueda histórica: por expediente exacto (sin orderBy, para no exigir
  // índice compuesto; se ordena en cliente) o por rango de fechas.
  const buscarHistoricos = async () => {
    const exp = expHistorico.trim();
    if (!exp && !fechaDesde && !fechaHasta) return;
    setBuscandoHistoricos(true);
    try {
      let docs: ControlIngreso[];
      if (exp) {
        const snap = await getDocs(query(collection(db, "control_ingresos"), where("expediente", "==", exp), limit(200)));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ControlIngreso));
        if (fechaDesde) docs = docs.filter(i => tsToDate(i.creadoEn) >= new Date(fechaDesde + "T00:00:00"));
        if (fechaHasta) docs = docs.filter(i => tsToDate(i.creadoEn) <= new Date(fechaHasta + "T23:59:59"));
        docs.sort((a, b) => tsToDate(b.creadoEn).getTime() - tsToDate(a.creadoEn).getTime());
      } else {
        const constraints: QueryConstraint[] = [];
        if (fechaDesde) constraints.push(where("creadoEn", ">=", Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"))));
        if (fechaHasta) constraints.push(where("creadoEn", "<=", Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"))));
        constraints.push(orderBy("creadoEn", "desc"), limit(500));
        const snap = await getDocs(query(collection(db, "control_ingresos"), ...constraints));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ControlIngreso));
      }
      setHistoricos(docs);
    } finally {
      setBuscandoHistoricos(false);
    }
  };

  const limpiarHistoricos = () => {
    setExpHistorico(""); setFechaDesde(""); setFechaHasta("");
    setHistoricos(null);
  };

  const base = soloAyer ? ayer : ingresos;
  const recientesFiltrados = base.filter(i => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (
      (i.expediente?.toLowerCase() ?? "").includes(q) ||
      (i.dui?.toLowerCase() ?? "").includes(q) ||
      (i.apellidos?.toLowerCase() ?? "").includes(q) ||
      (i.nombres?.toLowerCase() ?? "").includes(q)
    );
  });
  const lista = vista === "recientes" ? recientesFiltrados : (historicos ?? []);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/70 to-indigo-50/80 px-5 py-5 shadow-sm dark:border-blue-900/60 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/40 md:px-6">
        <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-indigo-200/35 blur-2xl dark:bg-indigo-500/10" />
        <div className="absolute right-24 bottom-0 h-24 w-24 rounded-full bg-cyan-200/35 blur-xl dark:bg-cyan-500/10" />
        <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#2b8ca8] to-[#1a4e70] text-white shadow-lg shadow-blue-500/20">
            <Ambulance size={25} strokeWidth={2.1} />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">Tablero médico</p>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading leading-tight md:text-2xl">
              Cola de expedientes
            </h1>
            <p className="text-xs text-slate-500">Expedientes registrados por ESDOMED — consulta en tiempo real</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm backdrop-blur-sm dark:border-emerald-900 dark:bg-slate-900/80 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="hidden sm:inline">En vivo</span>
          {ultimaActualizacion && (
            <span className="hidden border-l border-emerald-200 pl-2 text-emerald-600/75 md:inline dark:border-emerald-900 dark:text-emerald-400/75">
              · {ultimaActualizacion.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </span>
          )}
        </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="group relative overflow-hidden rounded-2xl border border-blue-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-blue-900/60 dark:bg-slate-900">
          <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-[2rem] bg-blue-50 dark:bg-blue-950/50" />
          <div className="relative mb-3 flex items-center justify-between"><span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300"><Icon icon={calendar} width={18} /></span><span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">24 h</span></div>
          <p className="text-xs font-medium text-slate-500 mb-1">Expedientes de ayer</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 font-heading">{ayer.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">Registros del día anterior</p>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-indigo-900/60 dark:bg-slate-900">
          <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-[2rem] bg-indigo-50 dark:bg-indigo-950/50" />
          <div className="relative mb-3 flex items-center justify-between"><span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"><Icon icon={pulse} width={18} /></span><span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Hoy</span></div>
          <p className="text-xs font-medium text-slate-500 mb-1">Expedientes de hoy</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 font-heading">{hoy.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">Registros del día actual</p>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border border-cyan-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-cyan-900/60 dark:bg-slate-900">
          <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-[2rem] bg-cyan-50 dark:bg-cyan-950/50" />
          <div className="relative mb-3 flex items-center justify-between"><span className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-300"><Icon icon={user} width={18} /></span><span className="text-[10px] font-bold uppercase tracking-wider text-cyan-500">Actual</span></div>
          <p className="text-xs font-medium text-slate-500 mb-1">Último expediente</p>
          <p className="text-2xl font-bold text-cyan-700 dark:text-cyan-300 font-mono truncate">
            {ultimo?.expediente ?? "—"}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Registro más reciente</p>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-emerald-900/60 dark:bg-slate-900">
          <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-[2rem] bg-emerald-50 dark:bg-emerald-950/50" />
          <div className="relative mb-3 flex items-center justify-between"><span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"><Icon icon={clock} width={18} /></span><span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">En vivo</span></div>
          <p className="text-xs font-medium text-slate-500 mb-1">Hora del último</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            {ultimo ? formatHora(ultimo.creadoEn) : "—"}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Hora de registro</p>
        </div>
      </div>

      {/* Tabs Recientes / Histórico */}
      <div className="inline-flex items-center gap-1 rounded-2xl border border-blue-100 bg-white p-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {([
          { key: "recientes", label: "Ayer y hoy", icon: pulse },
          { key: "historico", label: "Histórico", icon: history },
        ] as const).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setVista(key)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              vista === key
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <Icon icon={icon} width={key === "recientes" ? 15 : 16} className={vista === key ? "text-white" : key === "recientes" ? "text-emerald-500" : ""} />
            {label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">

        {/* Toolbar */}
        {vista === "recientes" ? (
          <div className="space-y-2 bg-gradient-to-r from-blue-50/80 via-white to-violet-50/60 px-4 py-3.5 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/60 md:flex md:items-center md:gap-3 md:space-y-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300"><Icon icon={medicalKit} width={17} /></div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-heading truncate">
                Registros de ayer y hoy
              </span>
              <span className="text-xs text-slate-400 flex-shrink-0">({lista.length})</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 md:w-56 md:flex-none">
                <Icon icon={magnifer} width={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Expediente, DUI o paciente…"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-7 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                {busqueda && (
                  <button onClick={() => setBusqueda("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <Icon icon={closeCircle} width={15} />
                  </button>
                )}
              </div>
              {/* Ayer toggle */}
              <button
                onClick={() => setSoloAyer(v => !v)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  soloAyer
                    ? "border-[#4f5ee8] bg-[#4f5ee8] text-white shadow-sm shadow-blue-500/25"
                    : "border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
                }`}
              >
                {soloAyer ? "Ver ambos días" : "Solo ayer"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 bg-gradient-to-r from-indigo-50/80 via-white to-blue-50/60 px-4 py-3.5 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/60">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"><Icon icon={history} width={17} /></div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-heading truncate">
                Buscar en fechas anteriores
              </span>
              {historicos !== null && (
                <span className="text-xs text-slate-400 flex-shrink-0">({historicos.length})</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[150px] md:max-w-[200px]">
                <Icon icon={magnifer} width={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Expediente exacto…"
                  value={expHistorico}
                  onChange={e => setExpHistorico(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); buscarHistoricos(); } }}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm font-mono text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 shrink-0">Desde</span>
                <DateField value={fechaDesde} onChange={setFechaDesde} placeholder="Desde" ariaLabel="Fecha desde" clearable />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 shrink-0">Hasta</span>
                <DateField value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" ariaLabel="Fecha hasta" clearable />
              </div>
              <button
                onClick={buscarHistoricos}
                disabled={buscandoHistoricos || (!expHistorico.trim() && !fechaDesde && !fechaHasta)}
                className="flex items-center gap-1 rounded-xl bg-[#4f5ee8] px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-500/25 transition-colors hover:bg-[#5b6bf0] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon icon={magnifer} width={17} /> {buscandoHistoricos ? "Buscando…" : "Buscar"}
              </button>
              {historicos !== null && (
                <button
                  onClick={limpiarHistoricos}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
                >
                  <Icon icon={closeCircle} width={15} /> Limpiar
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Indica un expediente exacto (ej. 123-25), un rango de fechas, o ambos.
            </p>
          </div>
        )}

        {lista.length === 0 ? (
          <p className="text-sm text-slate-500 py-12 text-center">
            {vista === "historico"
              ? historicos === null
                ? "Define un expediente o un rango de fechas y presiona Buscar."
                : "Sin resultados para esa búsqueda."
              : ingresos.length === 0
                ? "No hay expedientes registrados en las últimas 24-48 horas."
                : "Sin resultados para la búsqueda."}
          </p>
        ) : (
          <>
            {/* Tabla md+ */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[880px]">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[120px]">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[90px]">Hora</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[110px]">Expediente</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[120px]">DUI</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[180px]">Paciente</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[220px]">Servicio</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[240px]">Censo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lista.map(ingreso => (
                    <tr key={ingreso.id} className="transition-colors hover:bg-blue-50/55 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                        {formatFecha(ingreso.creadoEn)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                        {formatHora(ingreso.creadoEn)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
                            {ingreso.expediente}
                          </span>
                          {ingreso.ingresoDirectoServicio && (
                            <span className="rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300">
                              Directo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 font-mono">
                        {ingreso.dui || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {ingreso.apellidos}, {ingreso.nombres}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                          {ingreso.servicio}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-left whitespace-nowrap">
                        <MenuCensoFila ingreso={ingreso} censo={censoDe(ingreso)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards mobile */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {lista.map(ingreso => (
                <div key={ingreso.id} className="px-4 py-3 transition-colors hover:bg-blue-50/55 dark:hover:bg-slate-800/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
                          {ingreso.expediente}
                        </span>
                        {ingreso.ingresoDirectoServicio && (
                          <span className="rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300">
                            Directo
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                        {ingreso.apellidos}, {ingreso.nombres}
                      </p>
                      {ingreso.dui && (
                        <p className="text-xs text-slate-500 font-mono mt-0.5">DUI: {ingreso.dui}</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                          {ingreso.servicio}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-2">
                      <div className="text-right">
                        <p className="text-xs font-mono text-slate-500">{formatFecha(ingreso.creadoEn)}</p>
                        <p className="text-xs font-mono text-slate-400">{formatHora(ingreso.creadoEn)}</p>
                      </div>
                      <MenuCensoFila ingreso={ingreso} censo={censoDe(ingreso)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
