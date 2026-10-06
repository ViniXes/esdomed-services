"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, UserPlus, Users, BedDouble, ArrowRight, CircleDollarSign, ShieldCheck, Receipt, Table2, BookOpenText } from "lucide-react";
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
  autorizacionesPendientes: number;
}

export default function IsbmInicioPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const sb = getSupabase();
        const hoy = hoyISO();
        const [af, ing, censos, autorizaciones] = await Promise.all([
          sb.from("afiliaciones").select("*", { count: "exact", head: true }).eq("activo", true),
          sb.from("ingresos").select("*", { count: "exact", head: true }).eq("condicion_egreso", "PENDIENTE"),
          sb.from("censo_diario").select("dia_cerrado, total_cobrable_dia").eq("fecha", hoy),
          sb.from("autorizaciones_servicio").select("*", { count: "exact", head: true }).eq("estado", "PENDIENTE"),
        ]);
        if (cancelado) return;
        const fallo = [af, ing, censos, autorizaciones].find((r) => r.error);
        if (fallo?.error) throw fallo.error;
        const filas = censos.data ?? [];
        setStats({
          afiliados: af.count ?? 0,
          ingresosActivos: ing.count ?? 0,
          censosHoy: filas.length,
          censosHoyCerrados: filas.filter((c) => c.dia_cerrado).length,
          autorizacionesPendientes: autorizaciones.count ?? 0,
          cobrableHoy: filas.filter((c) => c.dia_cerrado).reduce((s, c) => s + (c.total_cobrable_dia ?? 0), 0),
        });
      } catch {
        if (!cancelado) {
          setStats(null);
          setError("No se pudo cargar el resumen.");
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [revision]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] p-5 text-white shadow-lg shadow-cyan-950/15 md:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/10" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-100">Convenios ISBM · HNES</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl font-heading">Bienvenido{profile?.nombre ? ", " + profile.nombre.split(" ")[0] : ""}</h1>
            <p className="mt-2 max-w-xl text-sm text-cyan-50">Gestiona la atención diaria, las autorizaciones y la facturación del convenio.</p>
            <span className="mt-4 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">{profile?.role === "isbm_jefe" || profile?.role === "admin" ? "Vista de jefatura" : profile?.role === "isbm_supervisor" ? "Vista de supervisión" : "Gestión operativa"}</span>
          </div>
          <Link prefetch={false} href="/isbm/censo" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#1a4e70] hover:bg-cyan-50"><CalendarCheck size={17} aria-hidden="true" /> Abrir censo</Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400">Resumen de actividad</h2>
        <button disabled={cargando} onClick={() => { setCargando(true); setError(""); setRevision((r) => r + 1); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-cyan-300">{cargando ? "Actualizando…" : "Actualizar resumen"}</button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
          No se pudo cargar el resumen. Vuelve a intentarlo; si persiste, solicita una revisión de tu acceso al módulo.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Afiliados activos" value={stats?.afiliados} loading={cargando} />
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
          sub="Solo días cerrados"
          loading={cargando}
        />
      </div>

      {stats && !cargando && (
        <section aria-label="Pendientes de gestión" className="grid gap-3 sm:grid-cols-2">
          <AccionCard href="/isbm/autorizaciones" icon={ShieldCheck} title={stats.autorizacionesPendientes + " autorizaciones pendientes"} desc="Revisa las solicitudes que requieren resolución." />
          <AccionCard href="/isbm/censo" icon={CalendarCheck} title={(stats.censosHoy - stats.censosHoyCerrados) + " días de censo por cerrar"} desc="Completa las visitas y el cierre del censo de hoy." />
        </section>
      )}

      <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400">Accesos rápidos</h2>
      <section aria-label="Accesos rápidos" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
        <AccionCard href="/isbm/autorizaciones" icon={ShieldCheck} title="Autorizaciones" desc="Consulta solicitudes pendientes y resoluciones." />
        <AccionCard href="/isbm/cargos" icon={Receipt} title="Cargos" desc="Consulta servicios, observaciones y montos facturables." />
        <AccionCard href="/isbm/tabuladores" icon={Table2} title="Tabuladores" desc="Consolida cargos por paciente y exporta a Excel." />
        <AccionCard href="/isbm/aranceles" icon={BookOpenText} title="Aranceles" desc="Consulta precios y reglas de autorización." />
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, texto, sub, loading,
}: { icon: typeof Users; label: string; value?: number; texto?: string; sub?: string; loading: boolean }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 mb-2">
        <Icon size={15} />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      {loading ? (
        <div role="status" aria-label={"Cargando " + label} className="h-7 w-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
          {texto ?? value ?? "—"}
        </p>
      )}
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function AccionCard({
  href, icon: Icon, title, desc,
}: { href: string; icon: typeof Users; title: string; desc: string }) {
  return (
    <Link prefetch={false}
      href={href}
      className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-start gap-3 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-sm transition-[border-color,box-shadow]"
    >
      <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
        <Icon aria-hidden="true" size={17} className="text-blue-600 dark:text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
          {title}
          <ArrowRight size={13} className="text-slate-300 group-hover:text-blue-500" aria-hidden="true" />
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}
