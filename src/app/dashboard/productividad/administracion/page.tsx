"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ClipboardCheck, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ProductividadTabs } from "../_components/ProductividadTabs";
import { GraficoBarras, GraficoBarrasHorizontalCorto, GraficoPastel, type PuntoDato } from "../_components/GraficosProductividad";

type RegistroUsuarioSis = {
  id: string;
  solicitante: string;
  usuarioSis: string;
  creadoPorId: string;
  creadoPorNombre: string;
  creadoEn: string;
};

type RegistroLlavesSis = {
  id: string;
  solicitante: string;
  usuarioSis: string;
  enviadoPorId: string;
  enviadoPorNombre: string;
  enviadoEn: string;
};

function mesActual() {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
}

function etiquetaFecha(fecha: string) {
  return new Intl.DateTimeFormat("es-SV", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/El_Salvador",
  }).format(new Date(fecha));
}

export default function ProductividadAdministracionPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [mes, setMes] = useState(mesActual);
  const [registros, setRegistros] = useState<RegistroUsuarioSis[]>([]);
  const [llavesEnviadas, setLlavesEnviadas] = useState<RegistroLlavesSis[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && profile?.role !== "admin") router.replace("/dashboard");
  }, [authLoading, profile, router]);

  const cargar = async () => {
    if (!user || profile?.role !== "admin") return;
    setCargando(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const respuesta = await fetch(`/api/productividad/usuarios-sis?mes=${encodeURIComponent(mes)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await respuesta.json();
      if (!respuesta.ok) throw new Error(data.error || "No se pudo cargar la productividad.");
      setRegistros(data.registros ?? []);
      setLlavesEnviadas(data.llavesEnviadas ?? []);
    } catch (err) {
      setRegistros([]);
      setLlavesEnviadas([]);
      setError(err instanceof Error ? err.message : "No se pudo cargar la productividad.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, [user, profile?.role, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  const porAdministrador = useMemo(() => {
    const conteos = new Map<string, number>();
    registros.forEach((registro) => {
      conteos.set(registro.creadoPorNombre, (conteos.get(registro.creadoPorNombre) ?? 0) + 1);
    });
    return Array.from(conteos, ([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor || a.nombre.localeCompare(b.nombre));
  }, [registros]);

  const porLlaves = useMemo(() => {
    const conteos = new Map<string, number>();
    llavesEnviadas.forEach((registro) => {
      conteos.set(registro.enviadoPorNombre, (conteos.get(registro.enviadoPorNombre) ?? 0) + 1);
    });
    return Array.from(conteos, ([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor || a.nombre.localeCompare(b.nombre));
  }, [llavesEnviadas]);

  const responsables = useMemo(() => new Set([
    ...registros.map((registro) => registro.creadoPorNombre),
    ...llavesEnviadas.map((registro) => registro.enviadoPorNombre),
  ]).size, [registros, llavesEnviadas]);

  const porDia = useMemo(() => {
    const [, mesTexto] = mes.split("-");
    const dias = new Date(Number(mes.slice(0, 4)), Number(mesTexto), 0).getDate();
    const conteos = new Array<number>(dias).fill(0);
    registros.forEach((registro) => {
      const dia = Number(new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "America/El_Salvador" }).format(new Date(registro.creadoEn)));
      if (dia >= 1 && dia <= dias) conteos[dia - 1]++;
    });
    llavesEnviadas.forEach((registro) => {
      const dia = Number(new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "America/El_Salvador" }).format(new Date(registro.enviadoEn)));
      if (dia >= 1 && dia <= dias) conteos[dia - 1]++;
    });
    return conteos.map((valor, index) => ({ nombre: String(index + 1), valor }));
  }, [mes, registros, llavesEnviadas]);

  if (!profile || profile.role !== "admin") {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>;
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><ShieldCheck size={13} /> Productividad</div>
          <h1 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">Administración · Usuarios SIS</h1>
          <p className="mt-0.5 text-xs text-slate-500">Creaciones y entrega de llaves, incluidas las reposiciones, atribuidas de forma permanente a quien realizó cada etapa.</p>
        </div>
        <div className="flex items-center gap-2">
          <input aria-label="Mes de productividad" type="month" value={mes} onChange={(event) => setMes(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
          <button onClick={() => void cargar()} disabled={cargando} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><RefreshCw size={15} className={cargando ? "animate-spin" : ""} /> Actualizar</button>
        </div>
      </div>

      <ProductividadTabs />

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}

      <div className="grid gap-4 md:grid-cols-4">
        <Resumen icon={Users} etiqueta="Usuarios SIS creados" valor={registros.length} tono="text-cyan-600 dark:text-cyan-300" />
        <Resumen icon={ClipboardCheck} etiqueta="Llaves SIS entregadas" valor={llavesEnviadas.length} tono="text-violet-600 dark:text-violet-300" />
        <Resumen icon={ShieldCheck} etiqueta="Responsables con productividad" valor={responsables} tono="text-indigo-600 dark:text-indigo-300" />
        <Resumen icon={ClipboardCheck} etiqueta="Día con más actividades" valor={Math.max(0, ...porDia.map((dato) => dato.valor))} tono="text-emerald-600 dark:text-emerald-300" />
      </div>

      {cargando ? <div className="flex justify-center py-20"><div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div> : <>
        <div className="grid gap-5 xl:grid-cols-2">
          <GraficoBarras titulo="Usuarios SIS creados por administrador" datos={porAdministrador} color="#0891b2" />
          <GraficoBarras titulo="Llaves SIS entregadas por administrador" datos={porLlaves} color="#7c3aed" />
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <GraficoPastel titulo="Participación en creaciones" datos={porAdministrador} />
          <GraficoBarrasHorizontalCorto titulo="Actividades por día" datos={porDia} color="#4f46e5" />
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800"><BarChart3 size={16} className="text-cyan-600 dark:text-cyan-300" /><h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Detalle de creaciones SIS</h2></div>
          {registros.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">No hay creaciones SIS registradas en este mes.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/60 dark:text-slate-400"><tr><th className="px-4 py-3">Solicitante</th><th className="px-4 py-3">Usuario SIS</th><th className="px-4 py-3">Creado por</th><th className="px-4 py-3">Fecha y hora</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{registros.map((registro) => <tr key={registro.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"><td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{registro.solicitante}</td><td className="px-4 py-3 font-mono text-xs text-emerald-700 dark:text-emerald-300">{registro.usuarioSis}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{registro.creadoPorNombre}</td><td className="px-4 py-3 text-slate-500 dark:text-slate-400">{etiquetaFecha(registro.creadoEn)}</td></tr>)}</tbody></table></div>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800"><ClipboardCheck size={16} className="text-violet-600 dark:text-violet-300" /><h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Detalle de llaves SIS entregadas</h2></div>
          {llavesEnviadas.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">No hay entregas de llaves SIS registradas en este mes.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/60 dark:text-slate-400"><tr><th className="px-4 py-3">Solicitante</th><th className="px-4 py-3">Usuario SIS</th><th className="px-4 py-3">Entregado por</th><th className="px-4 py-3">Fecha y hora</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{llavesEnviadas.map((registro) => <tr key={registro.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"><td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{registro.solicitante}</td><td className="px-4 py-3 font-mono text-xs text-violet-700 dark:text-violet-300">{registro.usuarioSis || "—"}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{registro.enviadoPorNombre}</td><td className="px-4 py-3 text-slate-500 dark:text-slate-400">{etiquetaFecha(registro.enviadoEn)}</td></tr>)}</tbody></table></div>}
        </section>
      </>}
    </div>
  );
}

function Resumen({ icon: Icon, etiqueta, valor, tono }: { icon: typeof Users; etiqueta: string; valor: number; tono: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className={`mb-2 inline-flex rounded-lg bg-slate-50 p-2 dark:bg-slate-800 ${tono}`}><Icon size={18} /></div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{etiqueta}</p><p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{valor}</p></div>;
}
