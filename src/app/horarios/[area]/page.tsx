"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { collection, getDocs, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import type { PlanTrabajo } from "@/types";
import { getAreaTrabajo } from "@/lib/areas-trabajo";
import { labelPeriodo, periodosCercanos, PERIODO_ACTUAL } from "@/lib/esdomed/plan";
import { getHorario, esMarcaEspecial } from "@/lib/esdomed/horarios";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  Users,
} from "lucide-react";

/** Personas de turno hoy, agrupadas por franja (código de horario), en cajas colapsables. */
function DeTurnoHoyWidget({ planes }: { planes: PlanTrabajo[] }) {
  const planActual = planes.find((p) => p.periodo === PERIODO_ACTUAL);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const franjas = useMemo(() => {
    if (!planActual) return [];
    const diaIdx = new Date().getDate() - 1;
    const porCodigo = new Map<string, string[]>();
    planActual.filas.forEach((f) => {
      const celda = (f.asignaciones[diaIdx] ?? "").trim().toUpperCase();
      if (!celda || esMarcaEspecial(celda) || !getHorario(celda)) return;
      const nombres = porCodigo.get(celda) ?? [];
      nombres.push(f.nombre);
      porCodigo.set(celda, nombres);
    });
    return Array.from(porCodigo.entries())
      .map(([codigo, nombres]) => ({ codigo, horario: getHorario(codigo)!, nombres }))
      .sort((a, b) => b.nombres.length - a.nombres.length);
  }, [planActual]);

  const toggle = (codigo: string) =>
    setAbiertas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(codigo)) siguiente.delete(codigo);
      else siguiente.add(codigo);
      return siguiente;
    });

  if (!planActual || franjas.length === 0) return null;

  const totalPersonas = franjas.reduce((acc, f) => acc + f.nombres.length, 0);

  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 mb-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400/10 dark:bg-emerald-400/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
      <div className="flex items-center gap-2 mb-4">
        <div className="h-3 w-3 rounded-full bg-emerald-500 shadow-sm" />
        <h2 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
          <Clock size={14} /> De turno hoy
        </h2>
        <span className="ml-auto text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          {totalPersonas} {totalPersonas === 1 ? "persona" : "personas"}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
        {franjas.map(({ codigo, horario, nombres }) => {
          const abierta = abiertas.has(codigo);
          return (
            <div key={codigo} className="bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-800/60 shadow-sm rounded-xl z-10 overflow-hidden">
              <button
                onClick={() => toggle(codigo)}
                aria-expanded={abierta}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30"
              >
                <ChevronDown
                  size={15}
                  className={`shrink-0 text-slate-400 transition-transform duration-200 ${abierta ? "" : "-rotate-90"}`}
                />
                <span className="min-w-0 flex-1 text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                  {codigo}
                  <span className="ml-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {horario.entrada} – {horario.salida}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                  {nombres.length} {nombres.length === 1 ? "persona" : "personas"}
                </span>
              </button>
              {abierta && (
                <div className="flex flex-wrap gap-1.5 px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                  {[...nombres].sort((a, b) => a.localeCompare(b)).map((nombre) => (
                    <span key={nombre} className="inline-flex items-center px-2 py-1 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/50">
                      {nombre}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AreaHomePage() {
  const params = useParams();
  const areaId = String(params.area);
  const area = getAreaTrabajo(areaId);
  const router = useRouter();
  const { profile } = useAuth();
  const puedeEditar = profile?.role === "asistente_esdomed" || profile?.role === "admin";

  const [planes, setPlanes] = useState<PlanTrabajo[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevoPeriodo, setNuevoPeriodo] = useState(PERIODO_ACTUAL);

  const periodosDisponibles = useMemo(() => periodosCercanos(6, 6).reverse(), []);

  useEffect(() => {
    if (!area) return;
    // Igualdad simple sobre areaId: no requiere índice compuesto. Se ordena aquí.
    getDocs(query(collection(db, "planes_trabajo_areas"), where("areaId", "==", area.id)))
      .then((snap) =>
        setPlanes(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as PlanTrabajo))
            .sort((a, b) => b.periodo.localeCompare(a.periodo)),
        ),
      )
      .catch(() => setPlanes([]))
      .finally(() => setLoading(false));
  }, [area]);

  if (!area || area.hrefPropio) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {area ? "Esta área usa su propio módulo de horarios." : "Área no encontrada."}
        </p>
        <Link
          prefetch={false}
          href={area?.hrefPropio ?? "/horarios"}
          className="mt-3 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {area ? "Ir al módulo del área →" : "← Volver al selector de áreas"}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      {/* Hero institucional del área */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-6 py-7 mb-6 text-white">
        <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <Link
          prefetch={false}
          href="/horarios"
          className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-cyan-100 hover:text-white transition-colors"
        >
          <ArrowLeft size={12} /> Áreas
        </Link>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold font-heading">{area.nombre}</h1>
        <p className="mt-2 max-w-2xl text-sm text-cyan-50/90">
          Plan de trabajo mensual del personal del área: consulta la cuadrícula de turnos,
          {puedeEditar ? " edítala" : " revísala"} e imprime el rol oficial para RH.
        </p>
      </div>

      {!loading && <DeTurnoHoyWidget planes={planes} />}

      {/* Abrir / crear un mes */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
          {puedeEditar ? "Abrir o crear un mes" : "Abrir un mes"}
        </p>
        <div className="flex gap-2">
          <select
            value={nuevoPeriodo}
            onChange={(e) => setNuevoPeriodo(e.target.value)}
            className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {periodosDisponibles.map((p) => (
              <option key={p} value={p}>{labelPeriodo(p)}</option>
            ))}
          </select>
          <button
            onClick={() => router.push(`/horarios/${area.id}/planes/${nuevoPeriodo}`)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors active:scale-[0.98]"
          >
            <Plus size={16} /> Abrir
          </button>
        </div>
      </div>

      {/* Meses guardados */}
      <p className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        Meses guardados
      </p>
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : planes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          Todavía no hay planes guardados para esta área.
          {puedeEditar ? " Abre un mes para empezar o importa el Excel del rol." : ""}
        </div>
      ) : (
        <div className="space-y-2">
          {planes.map((plan) => (
            <Link
              prefetch={false}
              key={plan.id}
              href={`/horarios/${area.id}/planes/${plan.periodo}`}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3.5 transition-all hover:border-cyan-300 dark:hover:border-cyan-700 hover:shadow-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
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
