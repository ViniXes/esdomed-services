"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, query, where, getCountFromServer } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowRightLeft, HeartPulse, Printer, ChevronRight } from "lucide-react";
import { InicioTrabajoSocial } from "@/components/InicioTrabajoSocial";
import { UltimaSincronizacionSis } from "@/components/esdomed/UltimaSincronizacionSis";
import { EquipoDelDia, TurnoDeHoy, grupoActual, useJornadaEquipo } from "@/components/esdomed/JornadaEquipo";
import { TramitesInicio } from "@/components/esdomed/TramitesInicio";
import { esPersonalPlan } from "@/lib/esdomed/plan";

const MODULE_CONFIG = {
  traslado:  { label: "Traslados",   color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950", border: "border-blue-200 dark:border-blue-900", dot: "bg-blue-500", icon: ArrowRightLeft, href: "/dashboard/traslados" },
  fallecido: { label: "Fallecidos",  color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950", border: "border-rose-200 dark:border-rose-900", dot: "bg-rose-500", icon: HeartPulse,     href: "/dashboard/fallecidos" },
  impresion: { label: "Impresiones", color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-950", border: "border-cyan-200 dark:border-cyan-900", dot: "bg-cyan-500", icon: Printer,        href: "/dashboard/impresiones" },
};

// Solo el personal de ESDOMED y el admin leen planes_trabajo (firestore.rules).
const ROLES_PLAN = new Set(["esdomed", "asistente_esdomed", "admin"]);

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function DashboardPage() {
  const { profile } = useAuth();
  // Trabajo Social tiene su propio inicio (sus pendientes y accesos), no el
  // panel de ESDOMED; así tampoco dispara los conteos de ESDOMED.
  if (profile?.role === "trabajo_social") return <InicioTrabajoSocial />;
  return <PanelEsdomed />;
}

function PanelEsdomed() {
  const { profile } = useAuth();
  const router = useRouter();

  // DIMES no tiene panel de inicio: va a su única vista.
  useEffect(() => {
    if (profile?.role === "medico_licenciado_dimes") router.replace("/dashboard/solicitudes-usuarios-sis");
  }, [profile, router]);

  const [counts, setCounts] = useState({
    traslado:  { pend: 0, total: 0 },
    fallecido: { pend: 0, total: 0 },
    impresion: { pend: 0, total: 0 },
  });

  const vePlan = !!profile && ROLES_PLAN.has(profile.role);
  const jornada = useJornadaEquipo(vePlan);
  const persona = { uid: profile?.uid, codigoMarcacion: profile?.codigoMarcacion };
  const grupo = vePlan ? grupoActual(jornada, persona) : "";

  useEffect(() => {
    if (!profile || profile.role === "medico" || profile.role === "medico_licenciado_dimes" || profile.role === "psicologia" || profile.role === "enfermeria") return;
    let activo = true;
    const FUENTES = [
      { tipo: "traslado" as const,  coll: "traslados" },
      { tipo: "fallecido" as const, coll: "notificaciones_fallecidos" },
      { tipo: "impresion" as const, coll: "solicitudes_impresion" },
    ];
    // Contadores por agregación (no lee los documentos).
    FUENTES.forEach(async ({ tipo, coll }) => {
      try {
        const [tot, pend] = await Promise.all([
          getCountFromServer(collection(db, coll)),
          getCountFromServer(query(collection(db, coll), where("estado", "==", "pendiente"))),
        ]);
        if (activo) setCounts(prev => ({ ...prev, [tipo]: { total: tot.data().count, pend: pend.data().count } }));
      } catch { /* ignore */ }
    });
    return () => { activo = false; };
  }, [profile]);

  const totalPendientes = counts.traslado.pend + counts.fallecido.pend + counts.impresion.pend;

  const stats = [
    { tipo: "traslado" as const,  pendientes: counts.traslado.pend,  total: counts.traslado.total },
    { tipo: "fallecido" as const, pendientes: counts.fallecido.pend, total: counts.fallecido.total },
    { tipo: "impresion" as const, pendientes: counts.impresion.pend, total: counts.impresion.total },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">

      {/* Hero: saludo + el turno propio de hoy */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-6 text-white shadow-lg shadow-cyan-950/15 md:px-7 md:py-7">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/10" />
        <div className="absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-teal-300/10 blur-2xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-cyan-100/80">{greeting()},</p>
            <h1 className="mt-0.5 text-2xl font-bold font-heading tracking-tight md:text-3xl">{profile?.nombre}</h1>
            <p className="mt-2 text-sm text-cyan-50/80">
              Estadística y Documentos Médicos{grupo ? ` · ${grupo}` : ""}
            </p>
            {totalPendientes > 0 && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden="true" />
                {totalPendientes} pendiente{totalPendientes !== 1 ? "s" : ""} en total
              </p>
            )}
          </div>
          {vePlan && (
            <TurnoDeHoy
              jornada={jornada}
              persona={persona}
              esPersonalPlan={esPersonalPlan(profile?.role ?? "", profile?.codigoMarcacion)}
            />
          )}
        </div>
      </div>

      {(profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin") && (
        <UltimaSincronizacionSis />
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.map(({ tipo, pendientes, total }) => {
          const cfg = MODULE_CONFIG[tipo];
          const Icon = cfg.icon;
          const pct = total > 0 ? Math.round((pendientes / total) * 100) : 0;
          return (
            <Link prefetch={false} key={tipo} href={cfg.href} className="group block">
              <div className={`bg-white dark:bg-slate-900 rounded-2xl border ${cfg.border} p-4 hover:shadow-md transition-all duration-200 group-hover:-translate-y-0.5`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center`}>
                    <Icon size={18} className={cfg.color} />
                  </div>
                  <span className={`text-3xl font-bold font-heading ${pendientes > 0 ? cfg.color : "text-slate-300 dark:text-slate-600"}`}>
                    {pendientes}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{cfg.label}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-500">{total} total · {pct}% pendiente</p>
                  <ChevronRight size={14} className="text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors" />
                </div>
                <div className="mt-2.5 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${cfg.dot}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Tu equipo: quién viene, a qué hora, permisos, emergencia y apoyo diurno */}
      {vePlan && (
        <EquipoDelDia jornada={jornada} persona={persona}>
          <TramitesInicio />
        </EquipoDelDia>
      )}
    </div>
  );
}
