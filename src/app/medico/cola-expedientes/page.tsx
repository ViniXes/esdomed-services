"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  collection, query, orderBy, onSnapshot, limit, where, getDocs, Timestamp, QueryConstraint,
  doc, updateDoc, serverTimestamp, deleteField,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import { censosDeAtenciones } from "@/lib/emergencia/resumenCensoDatos";
import { mismoServicio } from "@/lib/servicios";
import { Ambulance, Download } from "lucide-react";
import { Icon } from "@iconify/react";
import medicalKit from "@iconify-icons/solar/medical-kit-linear";
import calendar from "@iconify-icons/solar/calendar-minimalistic-linear";
import pulse from "@iconify-icons/solar/pulse-linear";
import user from "@iconify-icons/solar/user-rounded-linear";
import history from "@iconify-icons/solar/history-linear";
import magnifer from "@iconify-icons/solar/magnifer-linear";
import closeCircle from "@iconify-icons/solar/close-circle-linear";
import addCircle from "@iconify-icons/solar/add-circle-linear";
import clipboardList from "@iconify-icons/solar/clipboard-list-linear";
import hospital from "@iconify-icons/solar/hospital-linear";
import pen from "@iconify-icons/solar/pen-2-linear";
import checkCircle from "@iconify-icons/solar/check-circle-linear";

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
  // Marca de un médico: esta atención no lleva censo (la fila deja de
  // resaltarse y no cuenta como pendiente). Las reglas solo dejan al médico
  // tocar este campo, con su uid y la hora del servidor.
  censoNoAplica?: { porUid: string; porNombre?: string; en?: unknown };
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
  verificado: boolean;
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
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-slate-600 dark:text-slate-300 border border-dashed border-slate-300 dark:border-slate-600 whitespace-nowrap">
        Censo pendiente
      </span>
    );
  }
  return censo.estado === "cerrado" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 whitespace-nowrap">
      {CENSO_TIPO_LABEL[censo.tipo]} · Completado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900 whitespace-nowrap">
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

// Estado de la columna Censo cuando un médico marcó "No aplica censo".
function BadgeNoAplica({ quien }: { quien?: string }) {
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
        No aplica censo
      </span>
      {quien && <span title={`Marcó ${quien}`} className="max-w-[170px] truncate text-[11px] text-slate-500 dark:text-slate-400">Marcó {quien}</span>}
    </span>
  );
}

// Casilla "No aplica censo". En la tabla vive en su propia columna (sin texto
// visible: lo da el encabezado); en la tarjeta de celular lleva su texto.
// Solo se ofrece mientras la atención no tenga censo: si ya lo tiene, aplica.
function CasillaNoAplica({ ingreso, censo, verificado, enTarjeta = false, onNoAplica }: {
  ingreso: ControlIngreso;
  censo: CensoEstado | null;
  verificado: boolean;
  enTarjeta?: boolean;
  onNoAplica: (marcar: boolean) => Promise<void>;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(false);
  const noAplica = !!ingreso.censoNoAplica;
  const quien = ingreso.censoNoAplica?.porNombre?.trim();

  if (censo || (!verificado && !noAplica)) return null;

  const alternar = async () => {
    if (guardando) return;
    setGuardando(true);
    setError(false);
    try {
      await onNoAplica(!noAplica);
    } catch (err) {
      console.error("No se pudo guardar la marca No aplica censo", err);
      setError(true);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <span className={`inline-flex flex-col ${enTarjeta ? "items-start" : "items-center"}`}>
      <label
        title={noAplica ? (quien ? `Marcado por ${quien}` : "Marcado: no aplica censo") : "Marca si esta atención no lleva censo"}
        className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors ${
          enTarjeta ? "px-2" : "min-w-11"
        } ${
          noAplica
            ? "text-slate-700 dark:text-slate-200"
            : "text-slate-500 hover:bg-slate-900/5 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
        } ${guardando ? "cursor-wait opacity-60" : ""}`}
      >
        <input
          type="checkbox"
          checked={noAplica}
          disabled={guardando}
          onChange={alternar}
          aria-label={enTarjeta ? undefined : `No aplica censo, expediente ${ingreso.expediente}`}
          className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-blue-800 dark:accent-blue-400"
        />
        {enTarjeta && "No aplica censo"}
      </label>
      {enTarjeta && noAplica && quien && (
        <span className="-mt-2 max-w-[220px] truncate pb-1 pl-8 text-[11px] text-slate-500 dark:text-slate-400">Marcó {quien}</span>
      )}
      {error && (
        <span role="alert" className="text-[11px] font-medium text-rose-600 dark:text-rose-400">No se pudo guardar</span>
      )}
    </span>
  );
}

function MenuCensoFila({ ingreso, censo, verificado, consultando, ocultarNoAplica = false }: {
  ingreso: ControlIngreso;
  censo: CensoEstado | null;
  verificado: boolean;
  consultando: boolean;
  // En la tarjeta de celular la casilla ya dice "No aplica censo" y quién.
  ocultarNoAplica?: boolean;
}) {
  const router = useRouter();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const noAplica = !!ingreso.censoNoAplica;

  useEffect(() => {
    if (!pos) return;
    const cerrarClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPos(null);
    };
    const cerrar = () => setPos(null);
    const cerrarTeclado = (e: KeyboardEvent) => { if (e.key === "Escape") setPos(null); };
    document.addEventListener("mousedown", cerrarClick);
    document.addEventListener("keydown", cerrarTeclado);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", cerrarClick);
      document.removeEventListener("keydown", cerrarTeclado);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [pos]);

  const abrir = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (pos) return setPos(null);
    const r = e.currentTarget.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - MENU_CENSO_W, window.innerWidth - MENU_CENSO_W - 8));
    const menuHeight = 210;
    const top = Math.max(8, r.bottom + menuHeight > window.innerHeight ? r.top - menuHeight - 6 : r.bottom + 6);
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
  // no se permite volver a registrarlo (ni en el otro censo). Si existe censo,
  // manda el censo aunque alguien haya marcado "No aplica".
  // Marcada "No aplica censo": sin botón (se desmarca desde la casilla).
  if (noAplica && !censo) return ocultarNoAplica ? null : <BadgeNoAplica quien={ingreso.censoNoAplica?.porNombre?.trim()} />;
  if (!verificado) {
    return <span className="text-xs text-slate-500 dark:text-slate-400">{consultando ? "Consultando censo…" : "Estado no consultado"}</span>;
  }
  if (censo) {
    return (
      <span className="inline-flex items-center gap-1">
        <BadgeCenso censo={censo} />
        <Link
          href={`/medico/censos/${censo.tipo === "demanda" ? "demanda-espontanea" : "referidos"}?editar=${censo.id}`}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500"
          aria-label="Editar registro de censo"
          title="Editar registro de censo"
        >
          <Icon icon={pen} width={15} />
        </Link>
      </span>
    );
  }

  return (
    <div ref={ref} className="inline-flex flex-wrap items-center gap-1.5">
      <button
        onClick={abrir}
        title="Registrar en censo"
        aria-label="Registrar en censo"
        aria-expanded={!!pos}
        className={`inline-flex min-h-11 items-center gap-1.5 px-3 rounded-lg border text-sm font-semibold text-white shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
          pos
            ? "bg-blue-900 border-blue-900 dark:bg-blue-800 dark:border-blue-800"
            : "bg-blue-800 border-blue-800 hover:bg-blue-700 hover:border-blue-700 dark:bg-blue-700 dark:border-blue-700 dark:hover:bg-blue-600"
        }`}
      >
        <Icon icon={addCircle} width={17} />
        Registrar censo
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
            <div className="w-8 h-8 bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon icon={clipboardList} width={18} className="text-cyan-600 dark:text-cyan-300" />
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
            <div className="w-8 h-8 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon icon={hospital} width={18} className="text-blue-800 dark:text-blue-300" />
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

function fechaIsoLocal(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Origen de la atención: lo que no es Emergencia entró directo a un servicio,
// aunque ESDOMED no haya marcado la casilla "directo" (el servicio manda).
const esDeEmergencia = (i: ControlIngreso) => mismoServicio(i.servicio, "Emergencia");

// Estado de censo para resaltar la fila. "desconocido" = aún no se sabe (o el
// usuario no ve censos): esa fila no se resalta ni entra a "pendientes".
// "no-aplica" = un médico marcó que la atención no lleva censo.
type EstadoCensoFila = "sin-censo" | "en-proceso" | "completado" | "no-aplica" | "desconocido";
const esPendienteCenso = (e: EstadoCensoFila) => e === "sin-censo" || e === "en-proceso";

// En oscuro la rampa amber del tema es el beige MINSAL (globals.css): como
// relleno sobre el fondo azul pizarra se ve gris. Por eso en oscuro la fila
// pendiente se ELEVA (slate-800) y el color lo pone una barra beige clara.
const FILA_CENSO_CLS: Record<EstadoCensoFila, string> = {
  "sin-censo": "bg-amber-100/70 hover:bg-amber-100 dark:bg-slate-700/60 dark:hover:bg-slate-700/85",
  "en-proceso": "bg-amber-50/70 hover:bg-amber-50 dark:bg-slate-800/70 dark:hover:bg-slate-700/50",
  completado: "hover:bg-blue-50/55 dark:hover:bg-slate-800/60",
  "no-aplica": "hover:bg-blue-50/55 dark:hover:bg-slate-800/60",
  desconocido: "hover:bg-blue-50/55 dark:hover:bg-slate-800/60",
};
// Barra lateral (sombra interior: no mueve el contenido ni el ancho de la tabla).
const BARRA_CENSO_CLS: Record<EstadoCensoFila, string> = {
  "sin-censo": "shadow-[inset_4px_0_0_var(--color-amber-500)] dark:shadow-[inset_5px_0_0_var(--color-amber-400)]",
  "en-proceso": "shadow-[inset_4px_0_0_var(--color-amber-300)] dark:shadow-[inset_5px_0_0_var(--color-amber-700)]",
  completado: "",
  "no-aplica": "",
  desconocido: "",
};

// Filtros de la cola. Se guardan en la pestaña (sessionStorage) para que
// sigan puestos al volver del formulario de censo.
type FiltroDia = "ambos" | "hoy" | "ayer";
type FiltroOrigen = "todos" | "emergencia" | "directos";
type FiltrosCola = { dia: FiltroDia; origen: FiltroOrigen; soloPendientes: boolean };
const FILTROS_INICIALES: FiltrosCola = { dia: "ambos", origen: "todos", soloPendientes: false };
const CLAVE_FILTROS = "colaExpedientes:filtros";

function leerFiltrosGuardados(): FiltrosCola | null {
  try {
    const raw = window.sessionStorage.getItem(CLAVE_FILTROS);
    if (!raw) return null;
    const f = JSON.parse(raw) as Partial<FiltrosCola>;
    return {
      dia: f.dia === "hoy" || f.dia === "ayer" ? f.dia : "ambos",
      origen: f.origen === "emergencia" || f.origen === "directos" ? f.origen : "todos",
      soloPendientes: f.soloPendientes === true,
    };
  } catch {
    return null;
  }
}

function Segmentado<T extends string>({ etiqueta, valor, opciones, onCambio }: {
  etiqueta: string;
  valor: T;
  opciones: { valor: T; label: string; conteo?: number }[];
  onCambio: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex max-w-full items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {opciones.map(o => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambio(o.valor)}
            className={`inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
              activo
                ? "bg-blue-800 text-white shadow-sm dark:bg-blue-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            }`}
          >
            {o.label}
            {o.conteo !== undefined && (
              <span className={`hidden rounded-full px-1.5 text-[11px] font-semibold tabular-nums sm:inline ${activo ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"}`}>
                {o.conteo}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function ColaExpedientesPage() {
  const { profile } = useAuth();
  // Trabajo Social entra por /dashboard/cola-expedientes (re-export) a
  // consultar: no registra censos (las reglas tampoco le dejan leerlos), pero
  // sí descarga en Excel lo que está viendo.
  const soloConsulta = profile?.role !== "medico";
  const [exportando, setExportando] = useState(false);
  const [errorExport, setErrorExport] = useState("");
  const [ingresos, setIngresos] = useState<ControlIngreso[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtros, setFiltros] = useState<FiltrosCola>(FILTROS_INICIALES);
  const { dia, origen } = filtros;
  // Trabajo Social no ve censos: el filtro de pendientes no aplica.
  const soloPendientes = filtros.soloPendientes && !soloConsulta;
  const cambiarFiltros = (cambio: Partial<FiltrosCola>) => {
    setFiltros(prev => {
      const sig = { ...prev, ...cambio };
      try { window.sessionStorage.setItem(CLAVE_FILTROS, JSON.stringify(sig)); } catch { /* sin persistencia */ }
      return sig;
    });
  };
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const [conexion, setConexion] = useState<"cargando" | "cache" | "en-vivo" | "error">("cargando");
  const [errorHistorico, setErrorHistorico] = useState("");
  const consultaHistorica = useRef(0);
  const [vista, setVista] = useState<"recientes" | "historico">("recientes");
  const [expHistorico, setExpHistorico] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [historicos, setHistoricos] = useState<ControlIngreso[] | null>(null);
  const [buscandoHistoricos, setBuscandoHistoricos] = useState(false);
  const [censosDemanda, setCensosDemanda] = useState<CensoLookup>({ verificado: false, porCi: new Map(), porExpSinCi: new Map() });
  const [censosReferido, setCensosReferido] = useState<CensoLookup>({ verificado: false, porCi: new Map(), porExpSinCi: new Map() });
  // Estado de censo de las filas del Histórico: una lectura junto con la búsqueda.
  const [censosHistorico, setCensosHistorico] = useState<{ estado: "cargando" | "listo" | "error"; porCi: Map<string, CensoEstado> }>({ estado: "listo", porCi: new Map() });

  // Restaura los filtros de la pestaña al montar EN EL CLIENTE: la página se
  // pre-renderiza en el servidor (sin sessionStorage), así que un initializer
  // de useState no vería el valor guardado y rompería la hidratación.
  useEffect(() => {
    const guardados = leerFiltrosGuardados();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga única desde una fuente externa al montar
    if (guardados) setFiltros(guardados);
  }, []);

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
    return onSnapshot(q, { includeMetadataChanges: true }, s => {
      setIngresos(s.docs.map(d => ({ id: d.id, ...d.data() } as ControlIngreso)));
      setConexion(s.metadata.fromCache ? "cache" : "en-vivo");
      if (!s.metadata.fromCache) setUltimaActualizacion(new Date());
    }, () => setConexion("error"));
  }, []);

  // Estado de censo por expediente, acotado a la misma ventana ayer+hoy
  // (volumen chico: ~50 registros/día entre ambos censos). Alimenta los
  // badges y el bloqueo del botón "+" cuando ya hay censo.
  useEffect(() => {
    if (soloConsulta) return;
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
        { includeMetadataChanges: true },
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
          setter({ verificado: !s.metadata.fromCache && s.size < 600, porCi, porExpSinCi });
        },
        () => setter({ verificado: false, porCi: new Map(), porExpSinCi: new Map() }),
      );
    const u1 = sub("censo_demanda_espontanea", setCensosDemanda);
    const u2 = sub("censo_referidos", setCensosReferido);
    return () => { u1(); u2(); };
  }, [soloConsulta]);

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
    const delHistorico = ingreso.id ? censosHistorico.porCi.get(ingreso.id) : undefined;
    if (delHistorico) return delHistorico;
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

  // El Histórico no entra en la vista en vivo: el estado de censo de sus filas
  // se lee una vez al buscar. Si falla, igual se deja registrar: el formulario
  // abre el censo que ya exista y la transacción de guardarCenso() impide el duplicado.
  const cargarCensosHistorico = async (docs: ControlIngreso[], consulta: number) => {
    const ids = docs.flatMap(i => (i.id ? [i.id] : []));
    if (ids.length === 0) return setCensosHistorico({ estado: "listo", porCi: new Map() });
    setCensosHistorico({ estado: "cargando", porCi: new Map() });
    try {
      const encontrados = await censosDeAtenciones(ids);
      const porCi = new Map<string, CensoEstado>();
      encontrados.forEach((c, ci) => porCi.set(ci, {
        tipo: c.tipo === "demanda" ? "demanda" : "referido",
        estado: c.registro.estadoRegistro === "cerrado" ? "cerrado" : "abierto",
        id: c.id,
      }));
      if (consulta === consultaHistorica.current) setCensosHistorico({ estado: "listo", porCi });
    } catch (err) {
      console.error("No se pudo consultar el estado de censo del histórico", err);
      if (consulta === consultaHistorica.current) setCensosHistorico({ estado: "error", porCi: new Map() });
    }
  };

  // Búsqueda histórica: por expediente exacto (sin orderBy, para no exigir
  // índice compuesto; se ordena en cliente) o por rango de fechas.
  const buscarHistoricos = async () => {
    const exp = expHistorico.trim();
    if (buscandoHistoricos || (!exp && !fechaDesde && !fechaHasta)) return;
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      setErrorHistorico("La fecha desde debe ser anterior o igual a la fecha hasta.");
      return;
    }
    const consulta = ++consultaHistorica.current;
    setErrorHistorico("");
    setHistoricos(null);
    setCensosHistorico({ estado: "listo", porCi: new Map() });
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
      if (consulta === consultaHistorica.current) {
        setHistoricos(docs);
        if (!soloConsulta) void cargarCensosHistorico(docs, consulta);
      }
    } catch {
      if (consulta === consultaHistorica.current) setErrorHistorico("No se pudo consultar el histórico. Intenta buscar de nuevo.");
    } finally {
      if (consulta === consultaHistorica.current) setBuscandoHistoricos(false);
    }
  };

  const limpiarHistoricos = () => {
    consultaHistorica.current++;
    setBuscandoHistoricos(false);
    setErrorHistorico("");
    setExpHistorico(""); setFechaDesde(""); setFechaHasta("");
    setHistoricos(null);
    setCensosHistorico({ estado: "listo", porCi: new Map() });
  };

  const base = dia === "hoy" ? hoy : dia === "ayer" ? ayer : ingresos;
  const recientesFiltrados = base.filter(i => {
    if (!busqueda) return true;
    const q = busqueda.trim().toLowerCase();
    return (
      (i.expediente?.toLowerCase() ?? "").includes(q) ||
      (i.dui?.toLowerCase() ?? "").includes(q) ||
      (i.apellidos?.toLowerCase() ?? "").includes(q) ||
      (i.nombres?.toLowerCase() ?? "").includes(q)
    );
  });
  // Lo que hay en la vista antes de los filtros de origen y de censo.
  const universo = vista === "recientes" ? recientesFiltrados : (historicos ?? []);
  // Ayer y hoy los cubren las suscripciones en vivo; el resto del Histórico, la
  // lectura que acompaña a la búsqueda (también cuando falla: ver cargarCensosHistorico).
  const consultandoCenso = vista === "historico" && censosHistorico.estado === "cargando";
  const enVentanaViva = (ingreso: ControlIngreso) => esFechaHoy(ingreso.creadoEn) || esFechaAyer(ingreso.creadoEn);
  const vivosVerificados = censosDemanda.verificado && censosReferido.verificado;
  const censoVerificado = (ingreso: ControlIngreso) =>
    (enVentanaViva(ingreso) && vivosVerificados) ||
    (vista === "historico" && !consultandoCenso);

  // Para resaltar solo se afirma "sin censo" cuando de verdad se consultó: si
  // la lectura del Histórico falló, la fila no se pinta como pendiente.
  const estados = new Map<ControlIngreso, EstadoCensoFila>();
  universo.forEach(i => {
    let estado: EstadoCensoFila = "desconocido";
    if (!soloConsulta) {
      const censo = censoDe(i);
      if (censo) estado = censo.estado === "cerrado" ? "completado" : "en-proceso";
      else if (i.censoNoAplica) estado = "no-aplica";
      else if ((enVentanaViva(i) && vivosVerificados) || (vista === "historico" && censosHistorico.estado === "listo")) estado = "sin-censo";
    }
    estados.set(i, estado);
  });
  const estadoDe = (i: ControlIngreso) => estados.get(i) ?? "desconocido";

  const conteoEmergencia = universo.filter(esDeEmergencia).length;
  const porOrigen = origen === "todos"
    ? universo
    : universo.filter(i => esDeEmergencia(i) === (origen === "emergencia"));
  const pendientesCenso = porOrigen.filter(i => esPendienteCenso(estadoDe(i)));
  const sinCensoCount = pendientesCenso.filter(i => estadoDe(i) === "sin-censo").length;
  const lista = soloPendientes ? pendientesCenso : porOrigen;

  // "No aplica censo": se guarda en el mismo registro de la cola, que ya se
  // escucha en vivo (cero lecturas extra). El Histórico no es en vivo, así
  // que ahí se refleja a mano y se revierte si la escritura falla.
  const marcarNoAplica = async (ingreso: ControlIngreso, marcar: boolean) => {
    if (!ingreso.id || !profile) throw new Error("Sin sesión o sin id de la atención");
    const anterior = ingreso.censoNoAplica;
    const reflejar = (valor: ControlIngreso["censoNoAplica"]) =>
      setHistoricos(prev => prev && prev.map(i => (i.id === ingreso.id ? { ...i, censoNoAplica: valor } : i)));
    reflejar(marcar ? { porUid: profile.uid, porNombre: profile.nombre ?? "", en: new Date() } : undefined);
    try {
      await updateDoc(doc(db, "control_ingresos", ingreso.id), {
        censoNoAplica: marcar
          ? { porUid: profile.uid, porNombre: profile.nombre ?? "", en: serverTimestamp() }
          : deleteField(),
      });
    } catch (err) {
      reflejar(anterior);
      throw err;
    }
  };

  const hayFiltros = (vista === "recientes" && dia !== "ambos") || origen !== "todos" || soloPendientes;
  const quitarFiltros = () =>
    cambiarFiltros(vista === "recientes" ? FILTROS_INICIALES : { origen: "todos", soloPendientes: false });

  // Exporta lo que está en pantalla: ayer/hoy con la búsqueda y el filtro
  // aplicados, o el resultado del histórico. El archivo lleva el rango real
  // de fechas de los registros.
  const exportarExcel = async () => {
    if (exportando || lista.length === 0) return;
    setExportando(true);
    setErrorExport("");
    try {
      const XLSX = await import("xlsx");
      const filas = lista.map(i => ({
        Fecha: formatFecha(i.creadoEn),
        Hora: formatHora(i.creadoEn),
        Expediente: i.expediente,
        DUI: i.dui ?? "",
        Apellidos: i.apellidos,
        Nombres: i.nombres,
        Edad: i.edad ?? "",
        Género: i.genero === "masculino" ? "Masculino" : i.genero === "femenino" ? "Femenino" : "",
        Servicio: i.servicio,
        "Tipo de ingreso": esDeEmergencia(i) ? "Triage" : "Directo a servicio",
        "Registrado por": i.responsableIngresoNombre ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(filas);
      ws["!cols"] = [
        { wch: 11 }, { wch: 9 }, { wch: 11 }, { wch: 12 }, { wch: 24 }, { wch: 24 },
        { wch: 6 }, { wch: 10 }, { wch: 28 }, { wch: 17 }, { wch: 28 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Expedientes");
      const fechas = lista.map(i => fechaIsoLocal(tsToDate(i.creadoEn))).sort();
      const desde = fechas[0];
      const hasta = fechas[fechas.length - 1];
      XLSX.writeFile(wb, `cola_expedientes_${desde === hasta ? desde : `${desde}_a_${hasta}`}.xlsx`);
    } catch {
      setErrorExport("No se pudo generar el Excel. Intenta de nuevo.");
    } finally {
      setExportando(false);
    }
  };

  const enProcesoCount = pendientesCenso.length - sinCensoCount;
  const barraFiltros = (
    <div className="flex flex-wrap items-center gap-2">
      {vista === "recientes" && (
        <Segmentado<FiltroDia>
          etiqueta="Día"
          valor={dia}
          onCambio={v => cambiarFiltros({ dia: v })}
          opciones={[
            { valor: "ambos", label: "Ambos días" },
            { valor: "hoy", label: "Hoy" },
            { valor: "ayer", label: "Ayer" },
          ]}
        />
      )}
      <Segmentado<FiltroOrigen>
        etiqueta="Origen del paciente"
        valor={origen}
        onCambio={v => cambiarFiltros({ origen: v })}
        opciones={[
          { valor: "todos", label: "Todos", conteo: universo.length },
          { valor: "emergencia", label: "Solo Emergencia", conteo: conteoEmergencia },
          { valor: "directos", label: "Directos", conteo: universo.length - conteoEmergencia },
        ]}
      />
      {!soloConsulta && (
        <button
          type="button"
          aria-pressed={soloPendientes}
          onClick={() => cambiarFiltros({ soloPendientes: !soloPendientes })}
          title={`${sinCensoCount} sin registrar · ${enProcesoCount} en proceso`}
          className={`inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
            soloPendientes
              ? "border-amber-700 bg-amber-700 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-amber-950"
              : pendientesCenso.length > 0
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          <Icon icon={clipboardList} width={16} />
          Pendientes de censo
          <span className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
            soloPendientes
              ? "bg-white/25 dark:bg-amber-950/15"
              : pendientesCenso.length > 0
                ? "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200"
                : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"
          }`}>
            {pendientesCenso.length}
          </span>
        </button>
      )}
      {hayFiltros && (
        <button
          type="button"
          onClick={quitarFiltros}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <Icon icon={closeCircle} width={15} /> Quitar filtros
        </button>
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">

      {/* Header */}
      <div className="rounded-2xl border border-blue-100 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-800 shrink-0 text-white shadow-lg shadow-blue-500/20">
            <Ambulance size={25} strokeWidth={2.1} />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">{soloConsulta ? "Emergencia · consulta" : "Tablero médico"}</p>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading leading-tight md:text-2xl">
              Cola de expedientes
            </h1>
            <p className="text-xs text-slate-500">Expedientes registrados por ESDOMED — consulta en tiempo real</p>
          </div>
        </div>
        <div role="status" className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${conexion === "en-vivo" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
          <span className={`h-2 w-2 rounded-full ${conexion === "en-vivo" ? "bg-emerald-500" : "bg-slate-400"}`} />
          {conexion === "en-vivo" ? "En vivo" : conexion === "cargando" ? "Conectando…" : conexion === "cache" ? "Esperando conexión" : "Conexión interrumpida"}
          {ultimaActualizacion && conexion === "en-vivo" && (
            <span className="hidden border-l border-emerald-200 pl-2 md:inline dark:border-emerald-900">
              {formatHora(ultimaActualizacion)}
            </span>
          )}
        </div>
        </div>
      </div>

      {/* Resumen compacto */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "Expedientes de hoy", valor: hoy.length, icono: pulse },
          { label: "Expedientes de ayer", valor: ayer.length, icono: calendar },
        ].map(({ label, valor, icono }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><Icon icon={icono} width={20} /></span>
            <div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{conexion === "cargando" || (conexion === "error" && !ultimaActualizacion) ? "—" : valor}</p>
            </div>
          </div>
        ))}
        <div className="col-span-2 flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 sm:col-span-1">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"><Icon icon={user} width={20} /></span>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Último expediente</p>
            <p className="truncate font-mono text-xl font-semibold text-blue-800 dark:text-blue-300">{ultimo?.expediente ?? "—"}</p>
            {ultimo && <p className="text-xs text-slate-500">{formatFecha(ultimo.creadoEn)} · {formatHora(ultimo.creadoEn)}</p>}
          </div>
        </div>
      </div>

      {/* Tabs Recientes / Histórico (+ Excel en modo consulta) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex items-center gap-1 rounded-2xl border border-blue-100 bg-white p-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {([
          { key: "recientes", label: "Ayer y hoy", icon: pulse },
          { key: "historico", label: "Histórico", icon: history },
        ] as const).map(({ key, label, icon }) => (
          <button
            key={key}
            aria-pressed={vista === key}
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
      {soloConsulta && (
        <button
          type="button"
          onClick={exportarExcel}
          disabled={exportando || lista.length === 0}
          title="Descargar en Excel los registros que se muestran"
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={15} />
          {exportando ? "Generando…" : "Exportar a Excel"}
        </button>
      )}
      </div>
      {errorExport && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{errorExport}</p>
      )}

      {/* Tabla */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">

        {/* Toolbar */}
        {vista === "recientes" ? (
          <div className="space-y-3 bg-slate-50/80 px-4 py-3.5 dark:bg-slate-900">
          <div className="space-y-2 md:flex md:items-center md:gap-3 md:space-y-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300"><Icon icon={medicalKit} width={17} /></div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-heading truncate">
                {dia === "hoy" ? "Registros de hoy" : dia === "ayer" ? "Registros de ayer" : "Registros de ayer y hoy"}
              </span>
              <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">
                ({lista.length}{lista.length !== universo.length && ` de ${universo.length}`})
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 md:w-64 md:flex-none">
                <Icon icon={magnifer} width={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  aria-label="Buscar por expediente, DUI o paciente"
                  placeholder="Expediente, DUI o paciente…"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-7 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                {busqueda && (
                  <button aria-label="Limpiar búsqueda" onClick={() => setBusqueda("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <Icon icon={closeCircle} width={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
          {barraFiltros}
          </div>
        ) : (
          <div className="space-y-2 bg-slate-50/80 px-4 py-3.5 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"><Icon icon={history} width={17} /></div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-heading truncate">
                Buscar en fechas anteriores
              </span>
              {historicos !== null && (
                <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">
                  ({lista.length}{lista.length !== historicos.length && ` de ${historicos.length}`})
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[150px] md:max-w-[200px]">
                <Icon icon={magnifer} width={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  aria-label="Expediente exacto para consultar el histórico"
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
                className="flex items-center gap-1 rounded-xl bg-blue-800 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-500/25 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
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
            {historicos !== null && <div className="pt-1">{barraFiltros}</div>}
          </div>
        )}

        {vista === "recientes" && conexion === "error" && (
          <p role="alert" className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">No se pudo actualizar la cola. {ultimaActualizacion ? "Los registros mostrados pueden estar desactualizados." : "Recarga la página para intentar conectar de nuevo."}</p>
        )}
        {vista === "historico" && errorHistorico && (
          <p role="alert" className="border-t border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{errorHistorico}</p>
        )}
        {!soloConsulta && vista === "historico" && censosHistorico.estado === "error" && lista.length > 0 && (
          <p role="alert" className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">No se pudo consultar el estado de censo de estas atenciones. Si registras una que ya tiene censo, el formulario abrirá el registro existente.</p>
        )}
        {((vista === "recientes" && conexion === "cargando") || (vista === "historico" && buscandoHistoricos)) ? (
          <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm text-slate-500">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent motion-reduce:animate-none" />
            {vista === "recientes" ? "Cargando expedientes…" : "Buscando expedientes…"}
          </div>
        ) : lista.length === 0 && universo.length > 0 ? (
          // Hay registros, pero los filtros de origen/censo los dejan fuera.
          <div role="status" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            {soloPendientes && porOrigen.some(i => estadoDe(i) === "desconocido") ? (
              <p className="text-sm text-slate-500">
                {consultandoCenso || (vista === "recientes" && !vivosVerificados)
                  ? "Consultando el estado de censo…"
                  : "No se pudo confirmar el estado de censo de estas atenciones."}
              </p>
            ) : soloPendientes && porOrigen.length > 0 ? (
              <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <Icon icon={checkCircle} width={20} />
                No quedan censos pendientes{origen === "emergencia" ? " de Emergencia" : origen === "directos" ? " de directos" : ""} en esta vista.
              </p>
            ) : (
              <p className="text-sm text-slate-500">Ningún expediente coincide con los filtros.</p>
            )}
            <button
              type="button"
              onClick={quitarFiltros}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Icon icon={closeCircle} width={15} /> Quitar filtros
            </button>
          </div>
        ) : lista.length === 0 && !(vista === "historico" && errorHistorico) && !(vista === "recientes" && conexion === "error") ? (
          <p role="status" className="text-sm text-slate-500 py-12 text-center">
            {vista === "historico"
              ? historicos === null
                ? "Define un expediente o un rango de fechas y presiona Buscar."
                : "Sin resultados para esa búsqueda."
              : ingresos.length === 0
                ? conexion === "cache" ? "Esperando conexión para consultar los expedientes." : "No hay expedientes registrados ayer ni hoy."
                : busqueda.trim()
                  ? "Sin resultados para la búsqueda."
                  : dia === "hoy" ? "Aún no hay expedientes registrados hoy." : "No hay expedientes registrados ayer."}
          </p>
        ) : lista.length > 0 ? (
          <>
            {/* Tabla md+ */}
            <div className="hidden md:block overflow-x-auto">
              <table className={`w-full text-sm ${soloConsulta ? "min-w-[760px]" : "min-w-[860px]"}`}>
                <caption className="sr-only">{vista === "recientes" ? "Cola de expedientes recientes" : "Resultados del histórico de expedientes"}</caption>
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/50">
                    {["Paciente", "Expediente", "Fecha y hora", "Servicio", ...(soloConsulta ? [] : ["Censo"])].map(titulo => (
                      <th key={titulo} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{titulo}</th>
                    ))}
                    {!soloConsulta && (
                      <th scope="col" className="w-24 px-2 py-3 text-center text-xs font-semibold leading-tight text-slate-500">No aplica censo</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lista.map(ingreso => {
                    const estado = estadoDe(ingreso);
                    return (
                    <tr key={ingreso.id} className={`transition-colors ${FILA_CENSO_CLS[estado]}`}>
                      <td className={`px-4 py-3 min-w-[180px] ${BARRA_CENSO_CLS[estado]}`}>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{ingreso.apellidos}, {ingreso.nombres}</p>
                        <p className="mt-1 text-xs text-slate-500">DUI: <span className="font-mono">{ingreso.dui || "—"}</span></p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
                            {ingreso.expediente}
                          </span>
                          {!esDeEmergencia(ingreso) && (
                            <span className="rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300">
                              Directo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-xs text-slate-600 dark:text-slate-300">{formatFecha(ingreso.creadoEn)}</p>
                        <p className="mt-1 font-mono text-xs text-slate-500">{formatHora(ingreso.creadoEn)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {ingreso.servicio}
                        </span>
                      </td>
                      {!soloConsulta && (
                        <td className="px-4 py-3 text-left whitespace-nowrap">
                          <MenuCensoFila ingreso={ingreso} censo={censoDe(ingreso)} verificado={censoVerificado(ingreso)} consultando={consultandoCenso} />
                        </td>
                      )}
                      {!soloConsulta && (
                        <td className="px-2 py-3 text-center">
                          <CasillaNoAplica ingreso={ingreso} censo={censoDe(ingreso)} verificado={censoVerificado(ingreso)} onNoAplica={marcar => marcarNoAplica(ingreso, marcar)} />
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Cards mobile */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {lista.map(ingreso => {
                const estado = estadoDe(ingreso);
                return (
                <div key={ingreso.id} className={`px-4 py-3 transition-colors ${FILA_CENSO_CLS[estado]} ${BARRA_CENSO_CLS[estado]}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
                          {ingreso.expediente}
                        </span>
                        {!esDeEmergencia(ingreso) && (
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
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {ingreso.servicio}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-right">
                        <p className="text-xs font-mono text-slate-500">{formatFecha(ingreso.creadoEn)}</p>
                        <p className="text-xs font-mono text-slate-400">{formatHora(ingreso.creadoEn)}</p>
                      </div>
                    </div>
                  </div>
                  {!soloConsulta && (
                    <div className={`mt-3 border-t pt-3 ${esPendienteCenso(estado) ? "border-amber-200/80 dark:border-amber-900/60" : "border-slate-100 dark:border-slate-800"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <MenuCensoFila ingreso={ingreso} censo={censoDe(ingreso)} verificado={censoVerificado(ingreso)} consultando={consultandoCenso} ocultarNoAplica />
                        <CasillaNoAplica ingreso={ingreso} censo={censoDe(ingreso)} verificado={censoVerificado(ingreso)} enTarjeta onNoAplica={marcar => marcarNoAplica(ingreso, marcar)} />
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
