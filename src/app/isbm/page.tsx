"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, UserPlus, Users, BedDouble, ArrowRight, CircleDollarSign } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabase } from "@/lib/isbm/supabase";
import { hoyISO } from "@/lib/isbm/api";
import { formatoDolares } from "@/lib/isbm/types";

interface Stats {
  afiliados: number;
  ingresosActivos: number;
  censosHoy: number;
  censosHoyCerrados: number;
  cobrableHoy: number;
}

export default function IsbmInicioPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const sb = getSupabase();
        const hoy = hoyISO();
        const [af, ing, censos] = await Promise.all([
          sb.from("afiliaciones").select("*", { count: "exact", head: true }).eq("activo", true),
          sb.from("ingresos").select("*", { count: "exact", head: true }).eq("condicion_egreso", "PENDIENTE"),
          sb.from("censo_diario").select("dia_cerrado, total_cobrable_dia").eq("fecha", hoy),
        ]);
        if (cancelado) return;
        const filas = censos.data ?? [];
        setStats({
          afiliados: af.count ?? 0,
          ingresosActivos: ing.count ?? 0,
          censosHoy: filas.length,
          censosHoyCerrados: filas.filter((c) => c.dia_cerrado).length,
          cobrableHoy: filas.reduce((s, c) => s + (c.total_cobrable_dia ?? 0), 0),
        });
      } catch (e) {
        if (!cancelado) setError((e as Error).message);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Convenios ISBM · HNES</p>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
          Bienvenido{profile?.nombre ? `, ${profile.nombre.split(" ")[0]}` : ""}
        </h1>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
          {error} — verifica tu acceso al módulo (claim ISBM) o la conexión a Supabase.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Afiliados" value={stats?.afiliados} loading={cargando} />
        <StatCard icon={BedDouble} label="Ingresos activos" value={stats?.ingresosActivos} loading={cargando} />
        <StatCard
          icon={CalendarCheck}
          label="Censo de hoy"
          value={stats?.censosHoy}
          sub={stats ? `${stats.censosHoyCerrados} cerrados` : undefined}
          loading={cargando}
        />
        <StatCard
          icon={CircleDollarSign}
          label="Cobrable hoy"
          texto={stats ? formatoDolares(stats.cobrableHoy) : undefined}
          sub="días cerrados"
          loading={cargando}
        />
      </div>

      <section className="grid sm:grid-cols-2 gap-3">
        <AccionCard
          href="/isbm/censo"
          icon={CalendarCheck}
          title="Censo diario"
          desc="Visitas AM/PM, servicios de facturación y cierre del día."
        />
        <AccionCard
          href="/isbm/afiliaciones"
          icon={UserPlus}
          title="Afiliaciones"
          desc="Afilia pacientes activos de la plataforma al convenio ISBM."
        />
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, texto, sub, loading,
}: { icon: typeof Users; label: string; value?: number; texto?: string; sub?: string; loading: boolean }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-slate-400 mb-2">
        <Icon size={15} />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      {loading ? (
        <div className="h-7 w-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
          {texto ?? value ?? 0}
        </p>
      )}
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function AccionCard({
  href, icon: Icon, title, desc,
}: { href: string; icon: typeof Users; title: string; desc: string }) {
  return (
    <Link prefetch={false}
      href={href}
      className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-start gap-3 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-sm transition-all"
    >
      <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
        <Icon size={17} className="text-blue-600 dark:text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
          {title}
          <ArrowRight size={13} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}
