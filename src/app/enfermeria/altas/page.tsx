"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { collection, addDoc, getDocs, query, where, Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useServicios } from "@/contexts/ServiciosContext";
import { claveServicio, mismoServicio } from "@/lib/servicios";
import { altasAbiertasDe, notificacionAltaAbierta, fmtCuando, type DuplicadoInfo } from "@/lib/altas/duplicados";
import {
  Activity, AlertCircle, Ambulance, BedDouble, CheckCircle2, ChevronRight, Clock3, DoorOpen,
  FileWarning, Hash, History, House, Info, Layers, Loader2, LogIn, RotateCcw, Search, Send, X,
} from "lucide-react";
import type { Paciente, TipoAltaVivo } from "@/types";

type Modo = "servicio" | "expediente";
type AltaAbierta = NonNullable<DuplicadoInfo>;

const TIPOS_ALTA: { value: TipoAltaVivo; label: string; desc: string; icon: typeof House }[] = [
  { value: "domicilio",   label: "Alta a domicilio", desc: "El paciente regresa a su casa",        icon: House },
  { value: "exigida",     label: "Alta exigida",     desc: "A petición del paciente o la familia", icon: FileWarning },
  { value: "referido",    label: "Referido",         desc: "Enviado a otro establecimiento",       icon: Ambulance },
  { value: "fuga",        label: "Fuga",             desc: "Se retiró sin autorización",           icon: DoorOpen },
  { value: "in_extremis", label: "In extremis",      desc: "Sale en estado grave o terminal",      icon: Activity },
];

// Estados "abiertos" de una notificación, en palabras de enfermería.
const ESTADO_ABIERTA: Record<string, string> = {
  pendiente: "pendiente de ESDOMED",
  observada: "devuelta para corrección",
  deposito: "en depósito",
  suspendida: "suspendida",
};

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

// Servicios usados hace poco en este equipo (localStorage): atajo, nunca preselección.
const LS_RECIENTES = "enf_altas_servicios_recientes";
const MAX_RECIENTES = 3;

function leerRecientes(): string[] {
  try {
    const lista = JSON.parse(localStorage.getItem(LS_RECIENTES) ?? "[]");
    return Array.isArray(lista) ? lista.filter(s => typeof s === "string").slice(0, MAX_RECIENTES) : [];
  } catch {
    return [];
  }
}
function guardarReciente(s: string): string[] {
  const lista = [s, ...leerRecientes().filter(r => !mismoServicio(r, s))].slice(0, MAX_RECIENTES);
  try {
    localStorage.setItem(LS_RECIENTES, JSON.stringify(lista));
  } catch {
    /* modo privado / cuota llena: los recientes son un atajo, no rompen el flujo */
  }
  return lista;
}

// Camas en orden de sala (01, 02 … 10); los pacientes sin cama al final.
function ordenarPorCama(a: Paciente, b: Paciente): number {
  if (!a.camaActual !== !b.camaActual) return a.camaActual ? -1 : 1;
  return (a.camaActual ?? "").localeCompare(b.camaActual ?? "", "es", { numeric: true })
    || (a.apellidos ?? "").localeCompare(b.apellidos ?? "", "es");
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function aFecha(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const ts = v as { toDate?: () => Date };
  return ts.toDate ? ts.toDate() : null;
}

const fmtFecha = (d: Date | null) =>
  d ? d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" }) : "";

function aPaciente(d: { id: string; data: () => unknown }): Paciente {
  return { id: d.id, ...(d.data() as Omit<Paciente, "id">) };
}

function PasoTitulo({ n, titulo, detalle }: { n: number; titulo: string; detalle: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white">{n}</span>
      <div>
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{titulo}</p>
        <p className="text-xs text-slate-500">{detalle}</p>
      </div>
    </div>
  );
}

export default function EnfermeriaAltasPage() {
  const { user, profile } = useAuth();
  const { servicios } = useServicios();
  const esGenerico = !!profile?.generico;

  const [modo, setModo] = useState<Modo>("expediente");

  // Camino 1: servicio → cama
  const [servicio, setServicio] = useState("");
  const [servQuery, setServQuery] = useState("");
  const [servOpen, setServOpen] = useState(false);
  const [enfocarServicio, setEnfocarServicio] = useState(false);
  const [recientes, setRecientes] = useState<string[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [abiertas, setAbiertas] = useState<Record<string, AltaAbierta>>({});
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");
  const [filtro, setFiltro] = useState("");
  const peticion = useRef(0);

  // Camino 2: expediente
  const [expediente, setExpediente] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultadosExp, setResultadosExp] = useState<Paciente[]>([]);
  const [avisoExp, setAvisoExp] = useState("");
  const [enfocarExpediente, setEnfocarExpediente] = useState(false);

  // Paciente elegido + datos del alta
  const [sel, setSel] = useState<Paciente | null>(null);
  const [selAbierta, setSelAbierta] = useState<DuplicadoInfo>(null);
  const [verificando, setVerificando] = useState(false);
  const verificacion = useRef(0);
  const [tipoAlta, setTipoAlta] = useState<TipoAltaVivo | "">("");
  const [persona, setPersona] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [enviado, setEnviado] = useState<{ nombre: string; cama: string; servicio: string; tipo: string } | null>(null);
  const tarjetaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setRecientes(leerRecientes()), 0);
    return () => clearTimeout(t);
  }, []);

  // Al elegir una cama del fondo la cuadrícula se pliega: volver al inicio de la
  // tarjeta solo si quedó fuera de la vista.
  const subirAlInicio = () =>
    requestAnimationFrame(() => {
      const el = tarjetaRef.current;
      if (!el || el.getBoundingClientRect().top >= 0) return;
      const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "start", behavior: reducir ? "auto" : "smooth" });
    });

  const cargarServicio = async (s: string) => {
    const id = ++peticion.current;
    setServicio(s);
    setServQuery(s);
    setServOpen(false);
    setEnfocarServicio(false);
    setFiltro("");
    setPacientes([]);
    setAbiertas({});
    setErrorCarga("");
    setCargando(true);
    setRecientes(guardarReciente(s));
    try {
      const snap = await getDocs(query(collection(db, "pacientes"), where("servicioActual", "==", s)));
      const activos = snap.docs.map(aPaciente).filter(p => p.estado === "activo").sort(ordenarPorCama);
      const abiertasSrv = await altasAbiertasDe(activos.map(p => p.id!));
      if (id !== peticion.current) return;
      setPacientes(activos);
      setAbiertas(abiertasSrv);
    } catch {
      if (id === peticion.current) setErrorCarga("No se pudieron cargar los pacientes de este servicio.");
    } finally {
      if (id === peticion.current) setCargando(false);
    }
  };

  const cambiarServicio = () => {
    peticion.current++;
    setServicio("");
    setServQuery("");
    setPacientes([]);
    setAbiertas({});
    setErrorCarga("");
    setCargando(false);
    setFiltro("");
    setEnfocarServicio(true);
    setServOpen(true);
  };

  const limpiarSeleccion = () => {
    verificacion.current++;
    setSel(null);
    setSelAbierta(null);
    setVerificando(false);
    setTipoAlta("");
    setNotas("");
    setError("");
  };

  const cambiarModo = (m: Modo) => {
    if (m === modo) return;
    limpiarSeleccion();
    setModo(m);
  };

  const elegir = async (p: Paciente) => {
    limpiarSeleccion();
    setSel(p);
    setResultadosExp([]);
    subirAlInicio();
    // Por servicio, la cama ya trae su estado; por expediente se verifica aquí,
    // antes de llenar nada, para no descubrir el duplicado al final.
    if (abiertas[p.id!]) { setSelAbierta(abiertas[p.id!]); return; }
    if (modo === "servicio") return;
    const id = ++verificacion.current;
    setVerificando(true);
    try {
      const dup = await notificacionAltaAbierta(p.id!);
      if (id === verificacion.current) setSelAbierta(dup);
    } catch {
      /* si falla, el envío vuelve a verificar */
    } finally {
      if (id === verificacion.current) setVerificando(false);
    }
  };

  const buscarExpediente = async () => {
    const t = expediente.trim();
    if (!t || buscando) return;
    setBuscando(true);
    setAvisoExp("");
    setResultadosExp([]);
    try {
      const snap = await getDocs(query(collection(db, "pacientes"), where("expediente", "==", t)));
      const activos = snap.docs.map(aPaciente).filter(p => p.estado === "activo");
      if (activos.length === 1) {
        await elegir(activos[0]);
      } else if (activos.length > 1) {
        setResultadosExp(activos.sort(ordenarPorCama));
      } else {
        setAvisoExp(snap.size > 0
          ? `El expediente ${t} existe, pero el paciente no tiene un ingreso activo. Si ya salió, no hace falta notificar el alta.`
          : `No se encontró ningún paciente con el expediente ${t}. Revise el número o búsquelo por servicio y cama.`);
      }
    } catch {
      setAvisoExp("No se pudo buscar. Revise la conexión e intente de nuevo.");
    } finally {
      setBuscando(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !sel || !tipoAlta || selAbierta) return;
    // Cuentas genéricas (compartidas por servicio): exigir el nombre real de quien notifica.
    if (esGenerico && !persona.trim()) { setError("Escriba el nombre de quien notifica."); return; }
    setSaving(true);
    setError("");
    try {
      // Re-chequeo al enviar: alguien pudo notificarla mientras se llenaba el paso 2.
      const dup = await notificacionAltaAbierta(sel.id!);
      if (dup) {
        setSelAbierta(dup);
        setAbiertas(prev => ({ ...prev, [sel.id!]: dup }));
        return;
      }
      const nombre = `${sel.apellidos}, ${sel.nombres}`;
      await addDoc(collection(db, "notificaciones_altas"), {
        notificadoPorId: user.uid,
        notificadoPorNombre: profile.nombre,
        notificadoPorRol: profile.role,
        pacienteId: sel.id!,
        pacienteExpediente: sel.expediente,
        pacienteNombre: nombre,
        servicio: sel.servicioActual,
        cama: sel.camaActual ?? "",
        tipoAlta,
        notas: notas.trim() || null,
        ...(esGenerico ? { notificadoPorPersona: persona.trim() } : {}),
        estado: "pendiente",
        rectificacionUsada: false,
        creadoEn: Timestamp.now(),
      });
      setAbiertas(prev => ({
        ...prev,
        [sel.id!]: { por: esGenerico ? persona.trim() : profile.nombre, cuando: new Date(), estado: "pendiente" },
      }));
      setEnviado({
        nombre,
        cama: sel.camaActual ?? "",
        servicio: sel.servicioActual,
        tipo: TIPOS_ALTA.find(t => t.value === tipoAlta)?.label ?? "Alta",
      });
      limpiarSeleccion();
      subirAlInicio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la notificación. Intente de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  // Tras enviar: seguir en las camas del mismo servicio…
  const otraEnServicio = () => {
    const s = enviado ? (servicios.find(x => mismoServicio(x, enviado.servicio)) ?? enviado.servicio) : servicio;
    setEnviado(null);
    setModo("servicio");
    setExpediente("");
    setAvisoExp("");
    if (s) cargarServicio(s);
  };

  // …o empezar de cero por expediente, el camino principal (el nombre de quien
  // notifica se conserva).
  const nuevaBusqueda = () => {
    peticion.current++;
    setEnviado(null);
    setModo("expediente");
    setEnfocarExpediente(true);
    setServicio("");
    setServQuery("");
    setPacientes([]);
    setAbiertas({});
    setErrorCarga("");
    setCargando(false);
    setFiltro("");
    setExpediente("");
    setResultadosExp([]);
    setAvisoExp("");
  };

  // Derivados
  const servQ = claveServicio(servQuery);
  const serviciosFiltrados = servQ ? servicios.filter(s => claveServicio(s).includes(servQ)) : servicios;
  const recientesVivos = recientes
    .map(r => servicios.find(s => mismoServicio(s, r)))
    .filter((s): s is string => !!s);
  const q = normalizar(filtro);
  const visibles = q
    ? pacientes.filter(p =>
        normalizar(p.camaActual ?? "").includes(q)
        || normalizar(`${p.apellidos} ${p.nombres}`).includes(q)
        || (p.expediente ?? "").includes(q))
    : pacientes;
  const notificadasSrv = pacientes.filter(p => abiertas[p.id!]).length;

  const paso1Listo = !!sel && !selAbierta && !verificando;
  const paso2Listo = paso1Listo && !!tipoAlta && (!esGenerico || !!persona.trim());
  const tipoSel = TIPOS_ALTA.find(t => t.value === tipoAlta);

  const estadoPaso = (hecho: boolean, actual: boolean) =>
    hecho
      ? "bg-emerald-500 text-white"
      : actual
        ? "bg-cyan-600 text-white"
        : "bg-slate-100 text-slate-400 dark:bg-slate-800";

  const PASOS = [
    { titulo: "Identificar", detalle: "Por expediente, o por servicio y cama.", hecho: paso1Listo || !!enviado, actual: true },
    { titulo: "Tipo de alta", detalle: "Elija cómo sale el paciente.", hecho: paso2Listo || !!enviado, actual: paso1Listo },
    { titulo: "Notificar", detalle: "ESDOMED y Trabajo Social reciben el aviso.", hecho: !!enviado, actual: paso2Listo },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Encabezado de tarea */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-5 shadow-lg shadow-cyan-950/20 md:px-7 md:py-6">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
              <LogIn size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white md:text-2xl font-heading">Notificar alta vivo</h1>
              <p className="mt-1 max-w-xl text-sm text-cyan-50/90">Busque al paciente, elija el tipo de alta y envíe el aviso a ESDOMED y Trabajo Social.</p>
            </div>
          </div>
          <Link
            href="/enfermeria/movimientos"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/20"
          >
            <History size={16} /> Ver altas enviadas
          </Link>
        </div>
      </section>

      <div ref={tarjetaRef} className="scroll-mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-6">
        <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
          {/* Guía de pasos (escritorio) */}
          <aside className="hidden self-start rounded-2xl border border-cyan-100 bg-gradient-to-b from-cyan-50/80 via-white to-white p-4 dark:border-cyan-900/60 dark:from-cyan-950/30 dark:via-slate-900 dark:to-slate-900 lg:block">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Flujo guiado</p>
            <ol className="space-y-4">
              {PASOS.map((p, i) => (
                <li key={p.titulo} className="flex gap-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${estadoPaso(p.hecho, p.actual)}`}>
                    {p.hecho ? <CheckCircle2 size={15} /> : i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{p.titulo}</p>
                    <p className="mt-0.5 text-xs leading-4 text-slate-500">{p.detalle}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-xl border border-cyan-100 bg-white/80 p-3 text-xs leading-4 text-slate-500 dark:border-cyan-900/60 dark:bg-slate-900/70 dark:text-slate-400">
              <Info size={14} className="mb-1.5 text-cyan-600 dark:text-cyan-300" />
              Las camas con un alta ya notificada aparecen en ámbar: no hace falta enviarla otra vez.
            </div>
          </aside>

          <div className="min-w-0">
            {enviado ? (
              /* Confirmación: sin modal, lista para la siguiente alta */
              <div className="flex flex-col items-center py-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40">
                  <CheckCircle2 size={28} className="text-emerald-600 dark:text-emerald-400" />
                </span>
                <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">Alta notificada</h2>
                <p className="mt-1 max-w-md text-sm text-slate-500">
                  {enviado.tipo} de <span className="font-semibold text-slate-700 dark:text-slate-200">{enviado.nombre}</span>
                  {enviado.cama ? <>, cama <span className="font-semibold text-slate-700 dark:text-slate-200">{enviado.cama}</span></> : null}.
                  {" "}ESDOMED y Trabajo Social ya recibieron el aviso.
                </p>
                <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
                  <button
                    type="button"
                    onClick={nuevaBusqueda}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-700/20 transition-all hover:bg-blue-600 active:scale-[0.99]"
                  >
                    <Hash size={16} /> Notificar otra alta
                  </button>
                  <button
                    type="button"
                    onClick={otraEnServicio}
                    className="flex w-full flex-col items-center rounded-xl border border-slate-200 px-4 py-2.5 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold"><BedDouble size={15} /> Otra alta en este servicio</span>
                    <span className="mt-0.5 max-w-full truncate text-xs text-slate-500 dark:text-slate-400">{enviado.servicio}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Paso 1: identificar */}
                <div className="space-y-3">
                  <PasoTitulo n={1} titulo="Identificar al paciente" detalle="Elija cómo quiere buscarlo." />

                  {!sel ? (
                    <>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {([
                          { v: "expediente", l: "Por expediente", d: "Escriba el número de expediente", icon: Hash },
                          { v: "servicio", l: "Por servicio y cama", d: "Elija el servicio y toque la cama", icon: BedDouble },
                        ] as { v: Modo; l: string; d: string; icon: typeof BedDouble }[]).map(({ v, l, d, icon: Icon }) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => cambiarModo(v)}
                            aria-pressed={modo === v}
                            className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                              modo === v
                                ? "border-cyan-300 bg-cyan-50 text-cyan-900 shadow-sm shadow-cyan-950/5 dark:border-cyan-700 dark:bg-cyan-950/35 dark:text-cyan-100"
                                : "border-slate-200 bg-white text-slate-600 hover:border-cyan-200 hover:bg-cyan-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-800"
                            }`}
                          >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${modo === v ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-cyan-100 group-hover:text-cyan-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-cyan-950"}`}>
                              <Icon size={18} />
                            </span>
                            <span>
                              <span className="block text-sm font-semibold">{l}</span>
                              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{d}</span>
                            </span>
                            {modo === v && <CheckCircle2 size={16} className="ml-auto shrink-0 text-cyan-600 dark:text-cyan-300" />}
                          </button>
                        ))}
                      </div>

                      {modo === "servicio" ? (
                        !servicio ? (
                          /* Elegir servicio */
                          <div className="space-y-2.5">
                            <div className="relative">
                              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                value={servQuery}
                                autoFocus={enfocarServicio}
                                onChange={e => { setServQuery(e.target.value); setServOpen(true); }}
                                onFocus={() => setServOpen(true)}
                                onBlur={() => window.setTimeout(() => setServOpen(false), 150)}
                                onKeyDown={e => {
                                  if (e.key === "Enter" && serviciosFiltrados.length > 0) { e.preventDefault(); cargarServicio(serviciosFiltrados[0]); }
                                  if (e.key === "Escape") setServOpen(false);
                                }}
                                placeholder="Escriba el nombre del servicio..."
                                aria-label="Servicio"
                                className={`${inputCls} pl-9 pr-8`}
                              />
                              {servQuery && (
                                <button
                                  type="button"
                                  onClick={() => { setServQuery(""); setServOpen(true); }}
                                  aria-label="Borrar búsqueda"
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                >
                                  <X size={14} />
                                </button>
                              )}
                              {servOpen && (
                                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                                  {serviciosFiltrados.length === 0 ? (
                                    <p className="px-3 py-2 text-sm text-slate-400">Ningún servicio coincide con “{servQuery}”.</p>
                                  ) : (
                                    serviciosFiltrados.map(s => (
                                      <button
                                        key={s}
                                        type="button"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => cargarServicio(s)}
                                        className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-cyan-50 dark:text-slate-200 dark:hover:bg-slate-700/60"
                                      >
                                        {s}
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                            {recientesVivos.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="mr-0.5 text-xs text-slate-500">Usados hace poco:</span>
                                {recientesVivos.map(s => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => cargarServicio(s)}
                                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/40 dark:hover:text-cyan-200"
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Camas del servicio */
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 py-2.5 dark:border-cyan-900/60 dark:bg-cyan-950/25">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-600 text-white"><Layers size={16} /></span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{servicio}</p>
                                  <p className="text-xs text-slate-500">
                                    {cargando
                                      ? "Cargando camas..."
                                      : `${pacientes.length} ${pacientes.length === 1 ? "paciente" : "pacientes"}${notificadasSrv ? ` · ${notificadasSrv} con alta ya notificada` : ""}`}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={cambiarServicio}
                                className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-cyan-700 transition-colors hover:bg-cyan-100 dark:text-cyan-300 dark:hover:bg-cyan-900/40"
                              >
                                Cambiar servicio
                              </button>
                            </div>

                            {cargando ? (
                              <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                                <Loader2 size={16} className="animate-spin text-cyan-600" /> Cargando camas del servicio...
                              </div>
                            ) : errorCarga ? (
                              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                                <AlertCircle size={16} className="shrink-0 text-red-500" />
                                <p className="flex-1 text-sm text-red-700 dark:text-red-300">{errorCarga}</p>
                                <button type="button" onClick={() => cargarServicio(servicio)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:underline dark:text-red-300">
                                  <RotateCcw size={13} /> Reintentar
                                </button>
                              </div>
                            ) : pacientes.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
                                <BedDouble size={22} className="mx-auto text-slate-300 dark:text-slate-600" />
                                <p className="mt-2 text-sm text-slate-500">No hay pacientes activos en este servicio.</p>
                                <p className="mt-0.5 text-xs text-slate-400">Si el paciente está aquí, búsquelo por expediente.</p>
                              </div>
                            ) : (
                              <>
                                {pacientes.length > 12 && (
                                  <div className="relative">
                                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                      type="text"
                                      value={filtro}
                                      onChange={e => setFiltro(e.target.value)}
                                      placeholder="Filtrar por cama o apellido"
                                      aria-label="Filtrar camas"
                                      className={`${inputCls} py-2 pl-8`}
                                    />
                                  </div>
                                )}
                                {visibles.length === 0 ? (
                                  <p className="px-1 py-2 text-sm text-slate-400">Ninguna cama coincide con “{filtro}”.</p>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                                    {visibles.map(p => {
                                      const abierta = abiertas[p.id!];
                                      return (
                                        <button
                                          key={p.id}
                                          type="button"
                                          disabled={!!abierta}
                                          onClick={() => elegir(p)}
                                          title={abierta ? `Alta ya notificada${abierta.por ? ` por ${abierta.por}` : ""}` : undefined}
                                          className={`flex flex-col rounded-xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                                            abierta
                                              ? "cursor-not-allowed border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20"
                                              : "border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/60 hover:shadow-sm active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/30"
                                          }`}
                                        >
                                          <span className="flex items-center justify-between gap-2">
                                            <span className={`text-lg font-bold leading-none tabular-nums font-heading ${abierta ? "text-amber-800 dark:text-amber-200" : p.camaActual ? "text-slate-900 dark:text-slate-100" : "text-slate-400"}`}>
                                              {p.camaActual || "Sin cama"}
                                            </span>
                                            {abierta
                                              ? <Clock3 size={15} className="shrink-0 text-amber-500" />
                                              : <BedDouble size={15} className="shrink-0 text-slate-300 dark:text-slate-600" />}
                                          </span>
                                          <span className={`mt-2 block truncate text-sm font-semibold ${abierta ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-200"}`}>{p.apellidos}</span>
                                          <span className="block truncate text-xs text-slate-500">{p.nombres}</span>
                                          <span className="mt-1.5 block text-[11px] text-slate-400">Exp. {p.expediente}</span>
                                          {abierta && (
                                            <span className="mt-2 block rounded-md bg-amber-100 px-1.5 py-1 text-[11px] font-medium leading-tight text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                                              Alta ya notificada · {ESTADO_ABIERTA[abierta.estado ?? ""] ?? "en trámite"}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )
                      ) : (
                        /* Buscar por expediente */
                        <div className="space-y-3">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-800/50 sm:flex sm:gap-2">
                            <input
                              type="text"
                              value={expediente}
                              onChange={e => { setExpediente(e.target.value); setAvisoExp(""); }}
                              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); buscarExpediente(); } }}
                              autoFocus={enfocarExpediente}
                              placeholder="Número de expediente (ej. 1234-26)"
                              aria-label="Número de expediente"
                              className={`${inputCls} bg-white dark:bg-slate-900`}
                            />
                            <button
                              type="button"
                              onClick={buscarExpediente}
                              disabled={buscando || !expediente.trim()}
                              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-cyan-500 dark:disabled:bg-cyan-800 sm:mt-0 sm:w-auto"
                            >
                              {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                              Buscar
                            </button>
                          </div>

                          {avisoExp && (
                            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                              <Info size={16} className="mt-0.5 shrink-0 text-cyan-600 dark:text-cyan-300" />
                              <p className="text-sm text-slate-600 dark:text-slate-300">{avisoExp}</p>
                            </div>
                          )}

                          {resultadosExp.length > 1 && (
                            <div className="space-y-2">
                              <p className="text-xs text-slate-500">Este expediente tiene más de un ingreso activo. Elija el correcto:</p>
                              {resultadosExp.map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => elegir(p)}
                                  className="w-full rounded-xl border border-slate-200 p-4 text-left transition-all hover:border-cyan-300 hover:bg-cyan-50/50 dark:border-slate-700 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/30"
                                >
                                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{p.apellidos}, {p.nombres}</p>
                                  <p className="mt-0.5 text-xs text-slate-500">{p.servicioActual} — Cama {p.camaActual || "sin asignar"}</p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    /* Paciente seleccionado */
                    <div className="space-y-3">
                      <div className="relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-blue-50/80 to-white p-4 dark:border-cyan-800 dark:from-cyan-950/40 dark:via-blue-950/20 dark:to-slate-900">
                        <div className="absolute bottom-0 left-0 top-0 w-1 bg-gradient-to-b from-cyan-500 to-blue-600" />
                        <div className="flex items-start gap-3 pl-1">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm shadow-cyan-600/30"><CheckCircle2 size={19} /></span>
                          <div className="min-w-0 flex-1">
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300">Paciente seleccionado</p>
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{sel.apellidos}, {sel.nombres}</p>
                            <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                              Expediente {sel.expediente}
                              {aFecha(sel.fechaIngreso) && <span className="font-normal text-slate-500"> · ingresó el {fmtFecha(aFecha(sel.fechaIngreso))}</span>}
                            </p>
                            <div className="mt-2 flex items-center gap-2 text-sm">
                              <BedDouble size={13} className="shrink-0 text-slate-400" />
                              <span className="text-slate-700 dark:text-slate-300">
                                <span className="font-medium">{sel.servicioActual}</span>
                                {sel.camaActual
                                  ? <> — Cama <span className="font-medium">{sel.camaActual}</span></>
                                  : <span className="text-amber-600 dark:text-amber-400"> — sin cama asignada</span>}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {verificando && (
                        <p className="flex items-center gap-2 text-xs text-slate-500">
                          <Loader2 size={13} className="animate-spin text-cyan-600" /> Revisando si ya tiene un alta notificada...
                        </p>
                      )}

                      {selAbierta && (
                        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
                          <Clock3 size={17} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                          <div className="text-sm">
                            <p className="font-semibold text-amber-900 dark:text-amber-100">Este paciente ya tiene un alta notificada</p>
                            <p className="mt-0.5 text-amber-800/90 dark:text-amber-200/80">
                              Está {ESTADO_ABIERTA[selAbierta.estado ?? ""] ?? "en trámite"}
                              {selAbierta.por ? `; la envió ${selAbierta.por}` : ""}
                              {selAbierta.cuando ? ` (${fmtCuando(selAbierta.cuando)})` : ""}. No hace falta enviarla otra vez.
                            </p>
                            <Link href="/enfermeria/movimientos" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:underline dark:text-amber-200">
                              Ver su estado en Movimientos <ChevronRight size={13} />
                            </Link>
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={limpiarSeleccion}
                        className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 transition-colors hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-100"
                      >
                        {modo === "servicio" ? "Elegir otra cama" : "Buscar otro expediente"} <ChevronRight size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Pasos 2 y 3 */}
                {sel && paso1Listo && (
                  <form onSubmit={handleSubmit} className="space-y-5 border-t border-slate-200 pt-6 dark:border-slate-800">
                    <PasoTitulo n={2} titulo="Tipo de alta" detalle="Toque la opción que corresponde." />

                    <div className="grid grid-cols-2 gap-2">
                      {TIPOS_ALTA.map(({ value, label, desc, icon: Icon }) => {
                        const activo = tipoAlta === value;
                        const principal = value === "domicilio";
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setTipoAlta(value)}
                            aria-pressed={activo}
                            className={`group flex items-center gap-3 rounded-xl border text-left transition-all ${principal ? "col-span-2 p-4" : "p-3"} ${
                              activo
                                ? "border-cyan-300 bg-cyan-50 text-cyan-900 shadow-sm shadow-cyan-950/5 dark:border-cyan-700 dark:bg-cyan-950/35 dark:text-cyan-100"
                                : "border-slate-200 bg-white text-slate-700 hover:border-cyan-200 hover:bg-cyan-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-800"
                            }`}
                          >
                            <span className={`hidden shrink-0 items-center justify-center rounded-xl sm:flex ${principal ? "h-10 w-10" : "h-8 w-8"} ${activo ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-cyan-100 group-hover:text-cyan-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-cyan-950"}`}>
                              <Icon size={principal ? 20 : 16} />
                            </span>
                            <span className="min-w-0">
                              <span className={`block font-semibold ${principal ? "text-base" : "text-sm"}`}>{label}</span>
                              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{desc}</span>
                            </span>
                            {activo && <CheckCircle2 size={17} className="ml-auto shrink-0 text-cyan-600 dark:text-cyan-300" />}
                          </button>
                        );
                      })}
                    </div>

                    {esGenerico && (
                      <div>
                        <label htmlFor="persona" className="mb-1.5 block text-xs font-medium text-slate-500">
                          ¿Quién notifica? <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="persona"
                          type="text"
                          value={persona}
                          onChange={e => setPersona(e.target.value)}
                          placeholder="Nombre de la enfermera o enfermero"
                          className={inputCls}
                        />
                        <p className="mt-1 text-[11px] text-slate-400">
                          Esta cuenta es compartida. Su nombre se conserva para las siguientes altas mientras no cierre esta página.
                        </p>
                      </div>
                    )}

                    <div>
                      <label htmlFor="notas" className="mb-1.5 block text-xs font-medium text-slate-500">
                        Nota <span className="font-normal text-slate-400">(opcional)</span>
                      </label>
                      <textarea
                        id="notas"
                        value={notas}
                        onChange={e => setNotas(e.target.value)}
                        rows={2}
                        placeholder="Algo que ESDOMED o Trabajo Social deba saber"
                        className={`${inputCls} resize-none`}
                      />
                    </div>

                    {/* Paso 3: notificar */}
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/25">
                      <PasoTitulo
                        n={3}
                        titulo="Notificar"
                        detalle={tipoSel
                          ? `${tipoSel.label} de ${sel.apellidos}, ${sel.nombres}${sel.camaActual ? ` (cama ${sel.camaActual})` : ""}.`
                          : "Elija primero el tipo de alta."}
                      />
                      {error && (
                        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                          <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
                          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={saving || !paso2Listo}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-700/20 transition-all hover:bg-blue-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={17} className="animate-spin" /> : <Send size={16} />}
                        {saving ? "Notificando..." : "Notificar alta"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
