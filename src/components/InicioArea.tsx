"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificaciones, type Pendientes } from "@/contexts/NotificacionesContext";

// Inicio de los portales de área (Psicología, Trabajo Social): misma familia
// visual que el inicio del médico. Los pendientes salen de los contadores que
// NotificacionesContext ya mantiene para los globos del menú, así que esta
// página no agrega lecturas de Firestore.

export interface PendienteInicio {
  href: string;
  label: string;
  icon: LucideIcon;
  globo: keyof Pendientes;
  /** rose solo para fallecidos/defunciones. */
  tone?: "rose";
}

export interface AccesoInicio {
  href: string;
  label: string;
  icon: LucideIcon;
}

function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function InicioArea({
  area, icono: IconoArea, pendientes, accesos,
}: {
  area: string;
  icono: LucideIcon;
  pendientes: PendienteInicio[];
  accesos: AccesoInicio[];
}) {
  const { profile } = useAuth();
  const { pendientes: conteos } = useNotificaciones();

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-7">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-6 text-white shadow-lg shadow-cyan-950/15 md:px-7 md:py-7">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/10" />
        <div className="absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-teal-300/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-cyan-100/80">{saludo()},</p>
            <h1 className="mt-0.5 text-2xl font-bold font-heading tracking-tight md:text-3xl">{profile?.nombre}</h1>
            <p className="mt-2 text-sm text-cyan-50/80">{area}</p>
          </div>
          <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-cyan-50 sm:flex">
            <IconoArea size={27} strokeWidth={1.7} aria-hidden="true" />
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Pendientes</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {pendientes.map(({ href, label, icon: Icon, globo, tone }) => {
            const n = conteos[globo];
            return (
              <Link
                prefetch={false}
                key={href}
                href={href}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg hover:shadow-cyan-950/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-800 dark:hover:shadow-none"
              >
                <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${
                  tone === "rose"
                    ? "bg-rose-50 text-rose-600 dark:bg-rose-950/70 dark:text-rose-300"
                    : "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-cyan-300"
                }`}>
                  <Icon size={20} strokeWidth={1.9} />
                </div>
                <div className="min-w-0 flex-1">
                  {/* Ámbar = hay trabajo pendiente; en cero, neutro. */}
                  <p className={`font-heading text-2xl font-bold leading-none tabular-nums ${
                    n > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"
                  }`}>
                    {n}
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
                </div>
                <ChevronRight size={16} className="flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-600 dark:text-slate-600 dark:group-hover:text-cyan-300" />
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Accesos rápidos</h2>
        {/* Tres accesos llenan una fila de tres; cuatro, una de cuatro. */}
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${accesos.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
          {accesos.map(({ href, label, icon: Icon }) => (
            <Link
              prefetch={false}
              key={href}
              href={href}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg hover:shadow-cyan-950/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-800 dark:hover:shadow-none"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-cyan-300">
                <Icon size={18} strokeWidth={1.9} />
              </div>
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
              <ChevronRight size={16} className="flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-600 dark:text-slate-600 dark:group-hover:text-cyan-300" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
