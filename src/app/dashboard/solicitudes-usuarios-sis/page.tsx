"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ClipboardList, Clock3, Search, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CARGOS_USUARIO_SIS, ESTADO_SOLICITUD_SIS_LABEL, type EstadoSolicitudSis } from "@/lib/solicitudesUsuarioSis";

type Solicitud = {
  id: string; nombre: string; dui: string; correo: string; telefono: string; cargo: string; numeroJunta?: string | null;
  yaTuvoUsuario: string; especialidad: string; otraEspecialidad?: string | null; otroCargo?: string | null; esResidente: string; servicio: string; autorizadoPor: string;
  estado: EstadoSolicitudSis; usuarioSis?: string | null; notaAdmin?: string | null; creadoEn: string | null; actualizadoEn: string | null;
  estadoActualizadoPorNombre?: string | null; estadoActualizadoEn?: string | null;
};

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
const estadoCls: Record<EstadoSolicitudSis, string> = {
  pendiente: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  en_proceso: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  creado: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  rechazado: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};

function fecha(value?: string | null) { return value ? new Date(value).toLocaleString("es-SV", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—"; }
function etiquetaCargo(solicitud: Solicitud) { return solicitud.otroCargo || CARGOS_USUARIO_SIS.find((cargo) => cargo.value === solicitud.cargo)?.label || solicitud.cargo; }

export default function SolicitudesUsuariosSisPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<EstadoSolicitudSis | "todas">("pendiente");
  const [seleccionada, setSeleccionada] = useState<Solicitud | null>(null);
  const [estado, setEstado] = useState<EstadoSolicitudSis>("pendiente");
  const [usuarioSis, setUsuarioSis] = useState("");
  const [notaAdmin, setNotaAdmin] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    if (!user) return;
    setCargando(true); setError("");
    try {
      const res = await fetch("/api/solicitudes-usuarios-sis", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudieron cargar las solicitudes.");
      setSolicitudes(await res.json());
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudieron cargar las solicitudes."); }
    finally { setCargando(false); }
  };

  useEffect(() => { if (!loading && profile?.role !== "admin") router.replace("/dashboard"); }, [loading, profile, router]);
  useEffect(() => { if (profile?.role === "admin") void cargar(); }, [profile?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (s: Solicitud) => { setSeleccionada(s); setEstado(s.estado); setUsuarioSis(s.usuarioSis ?? ""); setNotaAdmin(s.notaAdmin ?? ""); };
  const guardar = async () => {
    if (!seleccionada || !user) return;
    setGuardando(true); setError("");
    try {
      const res = await fetch(`/api/solicitudes-usuarios-sis/${seleccionada.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ estado, usuarioSis, notaAdmin }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudo guardar el cambio.");
      setSeleccionada(null); await cargar();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar el cambio."); }
    finally { setGuardando(false); }
  };

  const visibles = useMemo(() => solicitudes.filter((s) => {
    const q = busqueda.trim().toLowerCase();
    return (filtro === "todas" || s.estado === filtro) && (!q || [s.nombre, s.dui, s.servicio, s.especialidad, s.cargo].some((v) => v.toLowerCase().includes(q)));
  }), [solicitudes, busqueda, filtro]);
  const conteo = (e: EstadoSolicitudSis) => solicitudes.filter((s) => s.estado === e).length;

  if (loading || profile?.role !== "admin") return null;
  return <div className="mx-auto max-w-6xl p-4 md:p-6">
    <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-300"><ClipboardList size={19} /></span><div><h1 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">Solicitudes de usuarios SIS</h1><p className="text-xs text-slate-500">Registro de solicitudes y seguimiento de creación en SIS.</p></div></div><button onClick={() => void cargar()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Actualizar</button></div>
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">{(["pendiente", "en_proceso", "creado", "rechazado"] as EstadoSolicitudSis[]).map((e) => <button key={e} onClick={() => setFiltro(e)} className={`rounded-xl border p-3 text-left transition ${estadoCls[e]} ${filtro === e ? "ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-slate-950" : "opacity-80 hover:opacity-100"}`}><p className="text-xs">{ESTADO_SOLICITUD_SIS_LABEL[e]}</p><p className="mt-1 text-2xl font-bold">{conteo(e)}</p></button>)}</div>
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row"><div className="relative flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className={`${inputCls} pl-9`} placeholder="Buscar por nombre, DUI, cargo, servicio o especialidad..." /></div><select value={filtro} onChange={(e) => setFiltro(e.target.value as EstadoSolicitudSis | "todas")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><option value="todas">Todos los estados</option>{(["pendiente", "en_proceso", "creado", "rechazado"] as EstadoSolicitudSis[]).map((e) => <option key={e} value={e}>{ESTADO_SOLICITUD_SIS_LABEL[e]}</option>)}</select></div>
    {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</p>}
    {cargando ? <p className="py-16 text-center text-sm text-slate-400">Cargando solicitudes...</p> : visibles.length === 0 ? <p className="py-16 text-center text-sm text-slate-400">No hay solicitudes que coincidan.</p> : <div className="space-y-3">{visibles.map((s) => <button key={s.id} onClick={() => abrir(s)} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900 dark:text-slate-100">{s.nombre}</p><span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${estadoCls[s.estado]}`}>{ESTADO_SOLICITUD_SIS_LABEL[s.estado]}</span></div><p className="mt-1 text-xs text-slate-500">DUI {s.dui} · {s.correo} · {s.telefono}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{etiquetaCargo(s)} · {s.otraEspecialidad || s.especialidad} · {s.servicio}</p></div><div className="shrink-0 text-xs text-slate-400 sm:text-right"><p>Solicitado</p><p>{fecha(s.creadoEn)}</p>{s.usuarioSis && <p className="mt-1 font-medium text-emerald-600 dark:text-emerald-400">Usuario SIS: {s.usuarioSis}</p>}</div></div></button>)}</div>}
    {seleccionada && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"><div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-cyan-600 dark:text-cyan-300">Solicitud SIS</p><h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{seleccionada.nombre}</h2></div><button onClick={() => setSeleccionada(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><XCircle size={21} /></button></div><div className="mb-5 grid grid-cols-1 gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/60 sm:grid-cols-2"><Dato label="DUI" value={seleccionada.dui} /><Dato label="Teléfono" value={seleccionada.telefono} /><Dato label="Correo" value={seleccionada.correo} /><Dato label="Cargo" value={etiquetaCargo(seleccionada)} /><Dato label="Junta / registro" value={seleccionada.numeroJunta || "—"} /><Dato label="Usuario SIS previo" value={seleccionada.yaTuvoUsuario === "si" ? "Sí" : "No"} /><Dato label="Especialidad" value={seleccionada.otraEspecialidad || seleccionada.especialidad} /><Dato label="Médico residente" value={seleccionada.esResidente === "si" ? "Sí" : "No"} /><Dato label="Servicio" value={seleccionada.servicio} /><Dato label="Autoriza" value={seleccionada.autorizadoPor} /></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs font-medium text-slate-500">Estado</label><div className="relative"><select value={estado} onChange={(e) => setEstado(e.target.value as EstadoSolicitudSis)} className={inputCls}>{(["pendiente", "en_proceso", "creado", "rechazado"] as EstadoSolicitudSis[]).map((e) => <option key={e} value={e}>{ESTADO_SOLICITUD_SIS_LABEL[e]}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /></div></div><div><label className="mb-1.5 block text-xs font-medium text-slate-500">Usuario asignado en SIS {estado === "creado" ? "*" : ""}</label><input value={usuarioSis} onChange={(e) => setUsuarioSis(e.target.value)} className={inputCls} placeholder="Ej. jperez" /></div><div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-medium text-slate-500">Nota administrativa</label><textarea value={notaAdmin} onChange={(e) => setNotaAdmin(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Observación para el seguimiento de la solicitud..." /></div></div><div className="mt-5 flex gap-2"><button disabled={guardando} onClick={() => setSeleccionada(null)} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button><button disabled={guardando} onClick={() => void guardar()} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50">{guardando ? <Clock3 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}{guardando ? "Guardando..." : "Guardar seguimiento"}</button></div></div></div>}
  </div>;
}

function Dato({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p><p className="mt-0.5 break-words text-sm font-medium text-slate-800 dark:text-slate-200">{value}</p></div>; }
