"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ESTADO_SOLICITUD_LLAVE_SIS_LABEL } from "@/lib/solicitudesLlavesSis";
import type { EstadoSolicitudLlaveSis } from "@/types";

type Solicitud = { id: string; estado: EstadoSolicitudLlaveSis; creadoEn: string | null; actualizadoEn: string | null };

const estadoCls: Record<EstadoSolicitudLlaveSis, string> = {
  pendiente: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  en_proceso: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  llave_generada: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
  entregada: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  rechazada: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};

function fecha(valor: string | null) { return valor ? new Date(valor).toLocaleString("es-SV", { dateStyle: "medium", timeStyle: "short" }) : "—"; }

export default function ReposicionLlaveSisPage() {
  const { user, profile, loading } = useAuth();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const cargar = async () => {
    if (!user) return;
    setCargando(true); setError("");
    try {
      const res = await fetch("/api/solicitudes-reposicion-llave-sis", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar el historial.");
      setSolicitudes(data);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo cargar el historial."); }
    finally { setCargando(false); }
  };
  useEffect(() => { if (profile?.role === "medico") void cargar(); }, [profile?.role, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const solicitar = async () => {
    if (!user) return;
    setEnviando(true); setError(""); setOk("");
    try {
      const res = await fetch("/api/solicitudes-reposicion-llave-sis", { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo registrar la solicitud.");
      setOk("Tu solicitud de reposición fue enviada a Administración.");
      await cargar();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar la solicitud."); }
    finally { setEnviando(false); }
  };

  if (loading || profile?.role !== "medico") return null;
  const hayAbierta = solicitudes.some((solicitud) => ["pendiente", "en_proceso", "llave_generada"].includes(solicitud.estado));
  return <div className="mx-auto max-w-3xl p-4 md:p-6">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-7">
      <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"><KeyRound size={21} /></span><div><h1 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">Reposición de llave SIS</h1><p className="mt-1 text-sm text-slate-500">Solicita una nueva llave si perdiste el archivo de firma digital.</p></div></div>
      <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100"><p className="font-semibold">La contraseña no se solicita aquí.</p><p className="mt-1 text-violet-700 dark:text-violet-300">La ingresarás personalmente cuando Administración genere tu llave.</p></div>
      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {ok && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{ok}</p>}
      <button onClick={() => void solicitar()} disabled={enviando || cargando || hayAbierta} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"><KeyRound size={16} />{enviando ? "Enviando solicitud..." : hayAbierta ? "Ya tienes una reposición en trámite" : "Solicitar reposición de llave"}</button>
    </div>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-slate-100">Mis solicitudes</h2><p className="mt-0.5 text-xs text-slate-500">Consulta el avance de tus reposiciones.</p></div><button onClick={() => void cargar()} disabled={cargando} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><RefreshCw size={15} className={cargando ? "animate-spin" : ""} /></button></div>{cargando ? <p className="py-8 text-center text-sm text-slate-400">Cargando solicitudes...</p> : solicitudes.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">Aún no has solicitado una reposición.</p> : <div className="mt-4 space-y-2">{solicitudes.map((solicitud) => <div key={solicitud.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div><p className="text-sm font-medium text-slate-800 dark:text-slate-100">Reposición de llave SIS</p><p className="mt-0.5 text-xs text-slate-500">Solicitada {fecha(solicitud.creadoEn)}</p></div><span className={`rounded-md border px-2 py-1 text-xs font-medium ${estadoCls[solicitud.estado]}`}>{ESTADO_SOLICITUD_LLAVE_SIS_LABEL[solicitud.estado]}</span></div>)}</div>}</section>
  </div>;
}
