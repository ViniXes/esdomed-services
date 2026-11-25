"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
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
 * Aviso fijo y discreto (esquina inferior) solo para el personal operativo con
 * la evaluación por iniciar o en curso: nadie más lo ve. No se cierra (pedido
 * del usuario): fuera de la página de la prueba siempre muestra el contador y el
 * botón para ir a ella. En la página de la prueba no sale (ahí ya está todo).
 */
export function AvisoEvaluacion() {
  const { activa, info, desfaseMs, recargar } = useEvaluacionEnLinea();
  const pathname = usePathname();
  // En la prueba del admin el aviso sale igual, aunque la evaluación esté cerrada.
  const porIniciar = (activa || info?.prueba === true) && info?.elegible === true && info.estado === "por_iniciar";
  const enCurso = info?.elegible === true && info.estado === "en_curso";
  const visible = porIniciar || enCurso;
  const paraEntrar = useRestante(porIniciar ? info?.limiteMs : undefined, desfaseMs);
  const restante = useRestante(visible ? info?.finMs : undefined, desfaseMs);
  const seAcabo = visible && Boolean(info?.finMs) && restante <= 0;

  // Al acabarse el tiempo se vuelve a preguntar: el servidor la entrega sola
  // (pasado el minuto de margen) y el aviso se va.
  useEffect(() => {
    if (!seAcabo) return;
    void recargar();
    const t = setTimeout(() => void recargar(), 65_000);
    return () => clearTimeout(t);
  }, [seAcabo, recargar]);

  if (!visible || pathname === RUTA_EVALUACION_EN_LINEA) return null;

  const titulo = enCurso ? "Tu prueba está en curso" : "Accede a tu prueba";
  return (
    <div
      role="status"
      aria-labelledby="aviso-evaluacion-titulo"
      className="fixed bottom-3 right-3 z-50 w-[calc(100%-1.5rem)] max-w-xs rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
    >
      <div className="flex items-center gap-2">
        <PuntoEnVivo />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Evaluación en línea</p>
      </div>
      <p id="aviso-evaluacion-titulo" className="mt-1.5 font-heading text-sm font-bold text-slate-900 dark:text-slate-100">{titulo}</p>
      {seAcabo ? (
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">Se acabó el tiempo: se entrega con lo que marcaste.</p>
      ) : porIniciar && paraEntrar > 0 ? (
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
          Prepárate: se habilita en <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{mmss(paraEntrar)}</span> y tendrás {MINUTOS_DURACION} minutos para responderla.
        </p>
      ) : (
        <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-400">
          {enCurso ? "Te quedan" : "Ya está habilitada y tu tiempo corre: te quedan"} <span className="font-semibold tabular-nums">{mmss(restante)}</span>.
        </p>
      )}
      {!seAcabo && (
        <Link
          href={RUTA_EVALUACION_EN_LINEA}
          prefetch={false}
          className="mt-2.5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          {enCurso ? "Volver a la prueba" : "Ir a la prueba"} <ArrowRight size={16} aria-hidden />
        </Link>
      )}
    </div>
  );
}
