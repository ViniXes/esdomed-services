"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarDays, FileStack, Wind, type LucideIcon } from "lucide-react";
import { AREAS_TRABAJO } from "@/lib/areas-trabajo";

// Ícono representativo por área (con respaldo genérico para áreas futuras).
const ICONO_AREA: Record<string, LucideIcon> = {
  esdomed: FileStack,
  "terapia-respiratoria": Wind,
};

export default function SelectorAreasPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      {/* Hero institucional */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-6 py-8 mb-8 text-white">
        <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-cyan-100">
          <CalendarDays size={13} /> Planes de trabajo
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold font-heading">Horarios por área</h1>
        <p className="mt-2 max-w-2xl text-sm text-cyan-50/90">
          Rol mensual de turnos de cada área del hospital: la cuadrícula oficial de códigos de
          horario, lista para consultar, editar e imprimir para RH.
        </p>
      </div>

      <p className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
        Áreas con plan de trabajo
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {AREAS_TRABAJO.map((area) => {
          const Icono = ICONO_AREA[area.id] ?? CalendarDays;
          return (
            <Link
              prefetch={false}
              key={area.id}
              href={area.hrefPropio ?? `/horarios/${area.id}`}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 transition-all hover:border-cyan-300 dark:hover:border-cyan-700 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  <Icono size={24} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                    {area.nombre}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {area.descripcion}
                  </p>
                  {area.hrefPropio && (
                    <span className="mt-2 inline-block rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Módulo propio
                    </span>
                  )}
                </div>
                <ArrowUpRight
                  size={18}
                  className="shrink-0 text-slate-300 dark:text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-cyan-600 dark:group-hover:text-cyan-400"
                />
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-6 px-1 text-xs text-slate-400 dark:text-slate-500">
        ¿Falta un área? Las áreas se incorporan importando su rol de turnos en el formato oficial
        de Excel; consulta con ESDOMED.
      </p>
    </div>
  );
}
