"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PlanTrabajo } from "@/types";
import { labelPeriodo, periodosCercanos, PERIODO_ACTUAL } from "@/lib/esdomed/plan";
import { CalendarDays, ChevronRight, Plus, Users } from "lucide-react";

export default function PlanesPage() {
  const router = useRouter();
  const [planes, setPlanes] = useState<PlanTrabajo[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevoPeriodo, setNuevoPeriodo] = useState(PERIODO_ACTUAL);

  const periodosDisponibles = useMemo(() => periodosCercanos(6, 6).reverse(), []);

  useEffect(() => {
    getDocs(query(collection(db, "planes_trabajo"), orderBy("periodo", "desc")))
      .then((snap) => setPlanes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlanTrabajo))))
      .catch(() => setPlanes([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300">
          <CalendarDays size={13} /> Planes de trabajo
        </div>
        <h1 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-heading">
          Rol mensual del personal
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Selecciona un mes para editar la cuadrícula de turnos y generar el PDF para RH.
        </p>
      </div>

      {/* Abrir / crear un mes */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Abrir o crear un mes</p>
        <div className="flex gap-2">
          <select
            value={nuevoPeriodo}
            onChange={(e) => setNuevoPeriodo(e.target.value)}
            className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
          >
            {periodosDisponibles.map((p) => (
              <option key={p} value={p}>{labelPeriodo(p)}</option>
            ))}
          </select>
          <button
            onClick={() => router.push(`/esdomed-horarios/planes/${nuevoPeriodo}`)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors active:scale-[0.98]"
          >
            <Plus size={16} /> Abrir
          </button>
        </div>
      </div>

      {/* Lista de planes existentes */}
      <p className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Meses guardados</p>
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-fuchsia-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : planes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          Todavía no hay planes guardados. Abre un mes para empezar.
        </div>
      ) : (
        <div className="space-y-2">
          {planes.map((plan) => (
            <Link
              key={plan.id}
              href={`/esdomed-horarios/planes/${plan.periodo}`}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3.5 transition-all hover:border-fuchsia-300 dark:hover:border-fuchsia-700 hover:shadow-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-50 dark:bg-fuchsia-950 text-fuchsia-600 dark:text-fuchsia-300">
                <CalendarDays size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{labelPeriodo(plan.periodo)}</p>
                <p className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Users size={11} /> {plan.filas?.length ?? 0} personas
                  {plan.actualizadoEn && " · actualizado"}
                </p>
              </div>
              <ChevronRight size={18} className="text-slate-300 dark:text-slate-600 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
