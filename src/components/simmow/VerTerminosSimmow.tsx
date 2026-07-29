"use client";

import { useState } from "react";
import { FileText, X } from "lucide-react";
import {
  TERMINOS_SIMMOW_VERSION,
  TERMINOS_SIMMOW_FECHA,
  TERMINOS_SIMMOW_INTRO,
  TERMINOS_SIMMOW_SECCIONES,
} from "@/lib/simmow/terminosSimmow";

/**
 * La aceptación de los términos de SIMMOW es una sola vez (TerminosSimmowGate),
 * pero el personal puede querer releerlos después para saber el alcance real
 * de la herramienta — este botón los muestra en cualquier momento, solo
 * lectura (sin checkbox ni posibilidad de "des-aceptar").
 */
export function VerTerminosSimmow() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <FileText size={13} />
        Ver términos de uso
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start gap-3">
              <div className="shrink-0 mt-0.5 p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <FileText size={20} />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-slate-900 dark:text-slate-100 font-heading text-lg">
                  Términos y condiciones de uso — Herramienta SIMMOW
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Versión {TERMINOS_SIMMOW_VERSION} · Vigente desde el {TERMINOS_SIMMOW_FECHA} · Ya aceptados — solo
                  lectura
                </p>
              </div>
              <button
                onClick={() => setAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-sm text-slate-700 dark:text-slate-300">
              <p className="text-slate-600 dark:text-slate-400">{TERMINOS_SIMMOW_INTRO}</p>
              {TERMINOS_SIMMOW_SECCIONES.map((s) => (
                <section key={s.titulo} className="space-y-1.5">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{s.titulo}</h3>
                  {s.parrafos.map((p, i) => (
                    <p key={i} className="leading-relaxed text-slate-600 dark:text-slate-400">
                      {p}
                    </p>
                  ))}
                </section>
              ))}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setAbierto(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
