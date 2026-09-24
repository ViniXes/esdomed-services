"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Download, KeyRound, Paperclip, Search, Trash2, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ESTADO_SOLICITUD_LLAVE_SIS_LABEL } from "@/lib/solicitudesLlavesSis";
import type { EstadoSolicitudLlaveSis } from "@/types";

type Solicitud = {
  id: string; medicoNombre: string; medicoJvpm?: string | null; medicoServicios?: string[]; estado: EstadoSolicitudLlaveSis;
  notaAdmin?: string | null; creadoEn: string | null; actualizadoEn: string | null; estadoActualizadoPorNombre?: string | null;
  llaveGeneradaPorNombre?: string | null; llaveGeneradaEn?: string | null; llaveSisEntregadaPorNombre?: string | null; llaveSisEntregadaEn?: string | null;
  llaveSisArchivoNombre?: string | null; llaveSisArchivoTamano?: number | null; llaveSisArchivoSubidoPorNombre?: string | null; llaveSisArchivoSubidoEn?: string | null;
};

const estados: EstadoSolicitudLlaveSis[] = ["pendiente", "en_proceso", "llave_generada", "entregada", "rechazada"];
const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
const estadoCls: Record<EstadoSolicitudLlaveSis, string> = {
  pendiente: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  en_proceso: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  llave_generada: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
  entregada: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  rechazada: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};
function fecha(value?: string | null) { return value ? new Date(value).toLocaleString("es-SV", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—"; }
function tamano(bytes?: number | null) { return bytes ? `${(bytes / 1024).toFixed(bytes < 1024 * 1024 ? 0 : 1)} ${bytes < 1024 * 1024 ? "KB" : "MB"}` : ""; }

export function ReposicionesFirmaSis({ volverUsuarios }: { volverUsuarios: () => void }) {
  const { user, profile } = useAuth();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<EstadoSolicitudLlaveSis | "todas">("pendiente");
  const [seleccionada, setSeleccionada] = useState<Solicitud | null>(null);
  const [estado, setEstado] = useState<EstadoSolicitudLlaveSis>("pendiente");
  const [notaAdmin, setNotaAdmin] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);

  const cargar = async () => {
    if (!user) return;
    setCargando(true); setError("");
    try {
      const res = await fetch("/api/solicitudes-reposicion-llave-sis", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar las reposiciones.");
      setSolicitudes(data);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudieron cargar las reposiciones."); }
    finally { setCargando(false); }
  };
  useEffect(() => { if (profile?.role === "admin") void cargar(); }, [profile?.role, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (solicitud: Solicitud) => { setSeleccionada(solicitud); setEstado(solicitud.estado); setNotaAdmin(solicitud.notaAdmin ?? ""); setArchivo(null); };
  const guardar = async () => {
    if (!user || !seleccionada) return;
    setGuardando(true); setError("");
    try {
      const token = await user.getIdToken();
      const seguimiento = await fetch(`/api/solicitudes-reposicion-llave-sis/${seleccionada.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ estado, notaAdmin }) });
      if (!seguimiento.ok) throw new Error((await seguimiento.json().catch(() => ({}))).error || "No se pudo guardar la reposición.");
      if (archivo) {
        const form = new FormData(); form.set("archivo", archivo);
        const respaldo = await fetch(`/api/solicitudes-reposicion-llave-sis/${seleccionada.id}/llave`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
        if (!respaldo.ok) throw new Error((await respaldo.json().catch(() => ({}))).error || "Se guardó el seguimiento, pero no el respaldo.");
      }
      setSeleccionada(null); await cargar();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar la reposición."); }
    finally { setGuardando(false); }
  };
  const descargar = async (solicitud: Solicitud) => {
    if (!user) return;
    setGuardando(true); setError("");
    try {
      const res = await fetch(`/api/solicitudes-reposicion-llave-sis/${solicitud.id}/llave`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo descargar la llave.");
      const url = URL.createObjectURL(await res.blob()); const enlace = document.createElement("a"); enlace.href = url; enlace.download = solicitud.llaveSisArchivoNombre || "llave-sis"; enlace.click(); URL.revokeObjectURL(url);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo descargar la llave."); }
    finally { setGuardando(false); }
  };
  const eliminar = async (solicitud: Solicitud) => {
    if (!user || !window.confirm("¿Eliminar el respaldo de esta llave SIS? Esta acción no se puede deshacer.")) return;
    setGuardando(true); setError("");
    try {
      const res = await fetch(`/api/solicitudes-reposicion-llave-sis/${solicitud.id}/llave`, { method: "DELETE", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo eliminar la llave.");
      setSeleccionada(null); await cargar();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo eliminar la llave."); }
    finally { setGuardando(false); }
  };
  const visibles = useMemo(() => solicitudes.filter((solicitud) => { const q = busqueda.trim().toLowerCase(); return (filtro === "todas" || solicitud.estado === filtro) && (!q || [solicitud.medicoNombre, solicitud.medicoJvpm ?? "", ...(solicitud.medicoServicios ?? [])].some((valor) => valor.toLowerCase().includes(q))); }), [solicitudes, busqueda, filtro]);
  const conteo = (item: EstadoSolicitudLlaveSis) => solicitudes.filter((solicitud) => solicitud.estado === item).length;

  return <div className="mx-auto max-w-6xl p-4 md:p-6">
    <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300"><KeyRound size={19} /></span><div><h1 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">Solicitudes SIS</h1><p className="text-xs text-slate-500">Reposiciones de firma médica y respaldo privado de llaves.</p></div></div><button onClick={() => void cargar()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Actualizar</button></div>
    <div className="mb-5 flex w-full gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm dark:border-slate-800 dark:bg-slate-900"><button onClick={volverUsuarios} className="flex-1 rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">Solicitudes de usuarios SIS</button><button className="flex-1 rounded-lg bg-violet-100 px-3 py-2 font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">Reposiciones de firma médica</button></div>
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">{estados.map((item) => <button key={item} onClick={() => setFiltro(item)} className={`rounded-xl border p-3 text-left transition ${estadoCls[item]} ${filtro === item ? "ring-2 ring-offset-1 ring-violet-500 dark:ring-offset-slate-950" : "opacity-80 hover:opacity-100"}`}><p className="text-xs">{ESTADO_SOLICITUD_LLAVE_SIS_LABEL[item]}</p><p className="mt-1 text-2xl font-bold">{conteo(item)}</p></button>)}</div>
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row"><div className="relative flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} className={`${inputCls} pl-9`} placeholder="Buscar por médico, JVPM o servicio..." /></div><select value={filtro} onChange={(event) => setFiltro(event.target.value as EstadoSolicitudLlaveSis | "todas")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><option value="todas">Todos los estados</option>{estados.map((item) => <option key={item} value={item}>{ESTADO_SOLICITUD_LLAVE_SIS_LABEL[item]}</option>)}</select></div>
    {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</p>}
    {cargando ? <p className="py-16 text-center text-sm text-slate-400">Cargando reposiciones...</p> : visibles.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900">No hay reposiciones para el filtro seleccionado.</p> : <div className="space-y-3">{visibles.map((solicitud) => <button key={solicitud.id} onClick={() => abrir(solicitud)} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-violet-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-violet-800"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900 dark:text-slate-100">{solicitud.medicoNombre}</p><span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${estadoCls[solicitud.estado]}`}>{ESTADO_SOLICITUD_LLAVE_SIS_LABEL[solicitud.estado]}</span>{solicitud.llaveSisArchivoNombre && <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300">Respaldo adjunto</span>}</div><p className="mt-1 text-xs text-slate-500">JVPM: {solicitud.medicoJvpm || "—"} · {(solicitud.medicoServicios ?? []).join(" / ") || "Sin servicio"}</p></div><div className="text-xs text-slate-400 sm:text-right"><p>Solicitada</p><p>{fecha(solicitud.creadoEn)}</p></div></div></button>)}</div>}
    {seleccionada && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"><div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-300">Reposición de firma médica</p><h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{seleccionada.medicoNombre}</h2></div><button onClick={() => setSeleccionada(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><XCircle size={21} /></button></div><div className="mb-5 grid grid-cols-1 gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/60 sm:grid-cols-2"><Dato label="Médico solicitante" value={seleccionada.medicoNombre} /><Dato label="JVPM" value={seleccionada.medicoJvpm || "—"} /><Dato label="Servicio" value={(seleccionada.medicoServicios ?? []).join(" / ") || "—"} /><Dato label="Solicitada" value={fecha(seleccionada.creadoEn)} />{seleccionada.llaveGeneradaEn && <Dato label="Llave generada por" value={`${seleccionada.llaveGeneradaPorNombre || "—"} · ${fecha(seleccionada.llaveGeneradaEn)}`} />}{seleccionada.llaveSisEntregadaEn && <Dato label="Entregada por" value={`${seleccionada.llaveSisEntregadaPorNombre || "—"} · ${fecha(seleccionada.llaveSisEntregadaEn)}`} />}</div><div className="grid grid-cols-1 gap-4"><div><label className="mb-1.5 block text-xs font-medium text-slate-500">Estado</label><select value={estado} onChange={(event) => setEstado(event.target.value as EstadoSolicitudLlaveSis)} className={inputCls}>{estados.map((item) => <option key={item} value={item}>{ESTADO_SOLICITUD_LLAVE_SIS_LABEL[item]}</option>)}</select></div><div className="rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950/30"><p className="text-sm font-semibold text-violet-900 dark:text-violet-100">Respaldo de llave SIS</p>{seleccionada.llaveSisArchivoNombre && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-white/70 px-3 py-2 text-xs dark:border-violet-900 dark:bg-slate-900/40"><span className="min-w-0 truncate text-violet-900 dark:text-violet-100">{seleccionada.llaveSisArchivoNombre} {tamano(seleccionada.llaveSisArchivoTamano) && `· ${tamano(seleccionada.llaveSisArchivoTamano)}`}</span><span className="flex gap-2"><button type="button" onClick={() => void descargar(seleccionada)} disabled={guardando} className="inline-flex items-center gap-1 font-semibold text-violet-700 hover:underline disabled:opacity-50"><Download size={13} /> Descargar</button><button type="button" onClick={() => void eliminar(seleccionada)} disabled={guardando} className="inline-flex items-center gap-1 font-semibold text-red-700 hover:underline disabled:opacity-50"><Trash2 size={13} /> Eliminar</button></span></div>}<label className={`mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-violet-300 bg-white/50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-white dark:border-violet-800 dark:bg-slate-900/30 dark:text-violet-200 ${!["llave_generada", "entregada"].includes(estado) ? "opacity-60" : ""}`}><Paperclip size={15} />{archivo ? archivo.name : seleccionada.llaveSisArchivoNombre ? "Reemplazar llave SIS" : "Adjuntar llave SIS"}<input type="file" disabled={!["llave_generada", "entregada"].includes(estado)} className="sr-only" onChange={(event) => setArchivo(event.target.files?.[0] || null)} /></label><p className="mt-2 text-[11px] text-violet-700 dark:text-violet-300">Disponible al marcar la llave como generada. Solo administradores pueden descargar, actualizar o eliminar el respaldo.</p></div><div><label className="mb-1.5 block text-xs font-medium text-slate-500">Nota administrativa</label><textarea value={notaAdmin} onChange={(event) => setNotaAdmin(event.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Observación para el seguimiento..." /></div></div><div className="mt-5 flex gap-2"><button disabled={guardando} onClick={() => setSeleccionada(null)} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button><button disabled={guardando} onClick={() => void guardar()} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-700 py-2.5 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50">{guardando ? <Clock3 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}{guardando ? "Guardando..." : "Guardar seguimiento"}</button></div></div></div>}
  </div>;
}

function Dato({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p><p className="mt-0.5 break-words text-sm font-medium text-slate-800 dark:text-slate-200">{value}</p></div>; }
