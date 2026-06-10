"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PlanTrabajo } from "@/types";
import { labelPeriodo, periodosCercanos, PERIODO_ACTUAL } from "@/lib/esdomed/plan";
import { getHorario, esMarcaEspecial } from "@/lib/esdomed/horarios";
import { CalendarDays, ChevronRight, Plus, Users, Clock } from "lucide-react";

function TurnoActualWidget({ planes }: { planes: PlanTrabajo[] }) {
  const planActual = planes.find((p) => p.periodo === PERIODO_ACTUAL);
  
  const gruposDeTurno = useMemo(() => {
    if (!planActual) return [];
    const hoy = new Date();
    const diaIdx = hoy.getDate() - 1;
    
    const countByGroup = new Map<string, number>();
    
    planActual.filas.forEach(f => {
      const celda = (f.asignaciones[diaIdx] ?? "").trim().toUpperCase();
      if (celda && !esMarcaEspecial(celda)) {
        const h = getHorario(celda);
        if (h && (h.tipo === "Turno Operativo" || h.tipo === "Turno Hospitalario")) {
          const g = f.grupo?.trim();
          if (g) countByGroup.set(g, (countByGroup.get(g) || 0) + 1);
        }
      }
    });

    return Array.from(countByGroup.entries())
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [planActual]);

  if (!planActual || gruposDeTurno.length === 0) return null;

  return (
    <div className="rounded-2xl border border-teal-200 dark:border-teal-900/50 bg-teal-50/50 dark:bg-teal-950/20 p-4 mb-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-teal-400/10 dark:bg-teal-400/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
        </div>
        <h2 className="text-sm font-bold text-teal-800 dark:text-teal-300 uppercase tracking-wider flex items-center gap-1.5">
          <Clock size={14} /> Equipos de turno hoy
        </h2>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {gruposDeTurno.map(([grupo, count]) => (
          <div key={grupo} className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-teal-100 dark:border-teal-800 shadow-sm rounded-xl px-3.5 py-2 z-10">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{grupo}</span>
            <span className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
            <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
              {count} {count === 1 ? "persona" : "personas"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          <CalendarDays size={13} /> Planes de trabajo
        </div>
        <h1 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-heading">
          Rol mensual del personal
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Selecciona un mes para editar la cuadrícula de turnos y generar el PDF para RH.
        </p>
      </div>

      {!loading && <TurnoActualWidget planes={planes} />}

      {/* Abrir / crear un mes */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Abrir o crear un mes</p>
        <div className="flex gap-2">
          <select
            value={nuevoPeriodo}
            onChange={(e) => setNuevoPeriodo(e.target.value)}
            className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#c9a892]"
          >
            {periodosDisponibles.map((p) => (
              <option key={p} value={p}>{labelPeriodo(p)}</option>
            ))}
          </select>
          <button
            onClick={() => router.push(`/esdomed-horarios/planes/${nuevoPeriodo}`)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors active:scale-[0.98] dark:bg-[var(--color-institutional-navy)] dark:hover:bg-blue-800 dark:ring-1 dark:ring-[#c9a892]/35"
          >
            <Plus size={16} /> Abrir
          </button>
        </div>
      </div>

      {/* Lista de planes existentes */}
      <p className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Meses guardados</p>
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
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
              className="group flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3.5 transition-all hover:border-amber-300 dark:hover:border-[#c9a892]/50 hover:shadow-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
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
