"use client";

import Link from "next/link";
import { ArrowUpRight, Inbox, Activity, Megaphone, Users, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const tareas = [
  { href: "conapina-fgr", icon: Inbox, title: "Recibir avisos", description: "Revise lo notificado por el área médica y deje constancia de la recepción.", action: "Abrir bandeja" },
  { href: "lesiones-ingresos", icon: Activity, title: "Revisar ingresos", description: "Examine los ingresos con lesión e identifique los casos que requieren aviso.", action: "Revisar expedientes" },
  { href: "solicitudes", icon: Megaphone, title: "Dar seguimiento", description: "Solicite avisos al área médica y consulte cuáles siguen pendientes.", action: "Ver solicitudes" },
];

export default function ComiteLesionesHome() {
  const { profile } = useAuth();
  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8 lg:p-10">
      <header className="mb-8 border-b border-slate-200 pb-6 dark:border-slate-700">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-cyan-700 dark:text-cyan-300">Gestión hospitalaria / Comité</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Comité de lesiones</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Recepción de avisos, revisión de ingresos y seguimiento con el área médica.</p>
      </header>
      <section className="mb-8 flex flex-col justify-between gap-5 rounded-2xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-950/40 sm:flex-row sm:items-center">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-blue-700 dark:text-blue-300">Bandeja de recepción</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Revise los avisos por recibir</h2><p className="mt-2 text-sm text-slate-500">Consulte los casos pendientes y registre su recepción en el comité.</p></div>
        <Link href="/comite-lesiones/conapina-fgr" className="inline-flex shrink-0 items-center justify-center gap-3 rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800">Ir a la bandeja <ArrowUpRight size={17} /></Link>
      </section>
      <h2 className="mb-4 text-lg font-semibold">Trabajo del comité</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {tareas.map(({ href, icon: Icon, title, description, action }, i) => (
          <Link key={href} href={`/comite-lesiones/${href}`} className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-colors hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-400">
            <div className="mb-6 flex items-center justify-between"><Icon size={23} className="text-blue-700 dark:text-blue-300" /><span className="font-mono text-xs text-slate-400">0{i + 1}</span></div>
            <h3 className="text-lg font-semibold">{title}</h3><p className="mb-6 mt-2 text-sm leading-6 text-slate-500">{description}</p>
            <span className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-semibold text-blue-700 dark:border-slate-700 dark:text-blue-300">{action}<ArrowUpRight size={17} /></span>
          </Link>
        ))}
      </div>
      <h2 className="mb-4 mt-8 text-lg font-semibold">Consulta y análisis</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/comite-lesiones/ingresos-adolescentes" className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 text-sm font-medium dark:border-slate-700 dark:bg-slate-900"><Users size={21} className="text-slate-500" />Ingresos de adolescentes<ArrowUpRight size={16} className="ml-auto" /></Link>
        {profile?.role === "comite_lesiones" && <Link href="/comite-lesiones/reportes" className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 text-sm font-medium dark:border-slate-700 dark:bg-slate-900"><BarChart3 size={21} className="text-slate-500" />Reportes del comité<ArrowUpRight size={16} className="ml-auto" /></Link>}
      </div>
    </div>
  );
}
