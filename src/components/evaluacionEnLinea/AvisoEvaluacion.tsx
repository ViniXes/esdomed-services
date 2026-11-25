"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import { useEvaluacionEnLinea } from "@/contexts/EvaluacionEnLineaContext";
import { MINUTOS_DURACION, RUTA_EVALUACION_EN_LINEA } from "@/lib/evaluacionEnLinea";
import { PuntoEnVivo } from "@/components/evaluacionEnLinea/PuntoEnVivo";

export const mmss = (restanteMs: number) => {
  const s = Math.max(0, Math.ceil(restanteMs / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Segundos que faltan para el límite, con la hora del servidor. */
export function useRestante(limiteMs: number | undefined, desfaseMs: number) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!limiteMs) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [limiteMs]);
  return limiteMs ? limiteMs - (ahora + desfaseMs) : 0;
}

/**
 * Aviso discreto (esquina inferior) solo para el personal operativo que tiene
 * la evaluación por iniciar: nadie más lo ve. Cuenta los 5 minutos de
 * preparación y, después, los 15 que ya corren; lleva a la prueba. Cerrarlo no
 * la cancela: sigue en el menú.
 */
export function AvisoEvaluacion() {
  const { activa, info, desfaseMs, recargar } = useEvaluacionEnLinea();
  const pathname = usePathname();
  const [cerrado, setCerrado] = useState(false);
  // En la prueba del admin el aviso sale igual, aunque la evaluación esté cerrada.
  const pendiente = (activa || info?.prueba === true) && info?.elegible === true && info.estado === "por_iniciar";
  const paraEntrar = useRestante(pendiente ? info?.limiteMs : undefined, desfaseMs);
  const restante = useRestante(pendiente ? info?.finMs : undefined, desfaseMs);
  const vencio = pendiente && restante <= 0;

  // Al vencer, se vuelve a preguntar (el servidor la marca vencida) y el aviso se va.
  useEffect(() => {
    if (vencio) void recargar();
  }, [vencio, recargar]);

  if (!pendiente || vencio || cerrado || pathname === RUTA_EVALUACION_EN_LINEA) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="aviso-evaluacion-titulo"
      className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      <button
        type="button"
        onClick={() => setCerrado(true)}
        aria-label="Cerrar aviso (la evaluación sigue en el menú)"
        className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
      >
        <X size={16} aria-hidden />
      </button>
      <div className="flex items-center gap-2 pr-8">
        <PuntoEnVivo />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Evaluación en línea</p>
      </div>
      <p id="aviso-evaluacion-titulo" className="mt-2 font-heading text-base font-bold text-slate-900 dark:text-slate-100">Accede a tu prueba</p>
      {paraEntrar > 0 ? (
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
          Prepárate: se habilita en <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{mmss(paraEntrar)}</span> y tendrás {MINUTOS_DURACION} minutos para responderla.
        </p>
      ) : (
        <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-400">
          Ya está habilitada y tu tiempo corre: te quedan <span className="font-semibold tabular-nums">{mmss(restante)}</span>.
        </p>
      )}
      <Link
        href={RUTA_EVALUACION_EN_LINEA}
        prefetch={false}
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500"
      >
        Ir a la prueba <ArrowRight size={16} aria-hidden />
      </Link>
    </div>
  );
}
