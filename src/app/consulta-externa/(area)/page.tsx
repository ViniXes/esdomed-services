"use client";

import Link from "next/link";
import { ChevronRight, ClipboardCheck, DoorOpen, FileUp, Stethoscope } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { navItemsConsultaExterna } from "@/lib/navConsultaExterna";
import { EN_CONSTRUCCION } from "@/lib/accesoConsultaExterna";

// Inicio del subsistema. Por ahora explica el circuito del día; cuando haya
// agenda cargada mostrará los conteos (citados, presentes, llamados, atendidos).

const PASOS = [
  {
    icon: FileUp,
    titulo: "Carga de citas",
    quien: "ESDOMED",
    texto: "Se sube la Programación de citas por día del SIS y cada cita recibe su código (p. ej. HE-12).",
  },
  {
    icon: DoorOpen,
    titulo: "Llegada",
    quien: "Recepción ESDOMED · Estación",
    texto: "Primera vez se marca en recepción de ESDOMED; subsecuente, en la estación de su especialidad.",
  },
  {
    icon: Stethoscope,
    titulo: "Llamado al consultorio",
    quien: "Enfermera de la estación",
    texto: "Lo llama directo al consultorio de su médico; la pantalla muestra el código y lo anuncia por voz. Ella decide el orden; la agenda sugiere.",
  },
];

function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function InicioConsultaExternaPage() {
  const { profile } = useAuth();
  const accesos = navItemsConsultaExterna(profile).filter((i) => i.href !== "/consulta-externa");
  const hoy = new Date().toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-7">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-6 text-white shadow-lg shadow-cyan-950/15 md:px-7 md:py-7">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/10" />
        <div className="absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-teal-300/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-cyan-100/80">{saludo()},</p>
            <h1 className="mt-0.5 text-2xl font-bold font-heading tracking-tight md:text-3xl">{profile?.nombre}</h1>
            <p className="mt-2 text-sm text-cyan-50/80">
              Consulta Externa · <span className="first-letter:uppercase inline-block">{hoy}</span>
            </p>
          </div>
          <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-cyan-50 sm:flex">
            <ClipboardCheck size={27} strokeWidth={1.7} aria-hidden="true" />
          </div>
        </div>
        {EN_CONSTRUCCION && (
          <p className="relative mt-4 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-cyan-50">
            En construcción
          </p>
        )}
      </div>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">El circuito del día</h2>
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {PASOS.map(({ icon: Icon, titulo, quien, texto }, i) => (
            <li key={titulo} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-cyan-300">
                  <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Paso {i + 1}</p>
                  <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100">{titulo}</p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{texto}</p>
              <p className="mt-3 text-xs font-medium text-blue-700 dark:text-cyan-300">{quien}</p>
            </li>
          ))}
        </ol>
      </section>

      {accesos.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Accesos rápidos</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      )}
    </div>
  );
}
