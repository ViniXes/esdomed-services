"use client";

import Link from "next/link";
import { CalendarClock, CalendarDays, ArrowRight, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { labelPeriodo, PERIODO_ACTUAL } from "@/lib/esdomed/plan";

export default function EsdomedHorariosInicio() {
  const { profile } = useAuth();
  const puedePlanificar = profile?.role === "asistente_esdomed" || profile?.role === "admin";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
          <Clock size={12} /> Horarios ESDOMED
        </div>
        <h1 className="mt-3 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-heading">
          Hola, {profile?.nombre?.split(" ")[0] ?? "bienvenido"}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Consulta tu horario laboral{puedePlanificar ? " o gestiona el plan de trabajo del mes." : "."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/esdomed-horarios/mi-horario"
          className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 transition-all hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg hover:shadow-blue-100/50 dark:hover:shadow-none"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300">
            <CalendarClock size={22} />
          </div>
          <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-white">Mi horario</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Revisa tus turnos del mes: hora de entrada, salida y descansos.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
            Ver {labelPeriodo(PERIODO_ACTUAL)} <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        {puedePlanificar && (
          <Link
            href="/esdomed-horarios/planes"
            className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 transition-all hover:border-fuchsia-300 dark:hover:border-fuchsia-700 hover:shadow-lg hover:shadow-fuchsia-100/50 dark:hover:shadow-none"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-fuchsia-50 dark:bg-fuchsia-950 text-fuchsia-600 dark:text-fuchsia-300">
              <CalendarDays size={22} />
            </div>
            <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-white">Planes de trabajo</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Crea y edita el rol mensual del personal. Genera el PDF para RH.
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-400">
              Gestionar planes <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
