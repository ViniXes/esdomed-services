"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { crearReporteBugSimmow, type FlujoReporteBug } from "@/lib/simmow/reportesBugs";

/**
 * Canal oficial para reportar un posible error de programación de la
 * herramienta SIMMOW (no un reclamo — ver terminosSimmow.ts sección 5). Botón
 * flotante fijo, visible solo dentro de /dashboard/simmow.
 */
export function ReportarErrorSimmow() {
  const { user, profile } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [flujo, setFlujo] = useState<FlujoReporteBug>("hospitalaria");
  const [descripcion, setDescripcion] = useState("");
  const [expediente, setExpediente] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !profile) return null;

  const enviar = async () => {
    if (!descripcion.trim() || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await crearReporteBugSimmow({
        uid: user.uid,
        nombreUsuario: profile.nombre,
        flujo,
        descripcion: descripcion.trim(),
        expediente: expediente.trim(),
      });
      setEnviado(true);
      setDescripcion("");
      setExpediente("");
    } catch {
      setError("No se pudo enviar el reporte. Intente de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {abierto && (
        <div className="mb-4 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-80 max-w-[calc(100vw-3rem)] animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Reportar un error de la herramienta</h3>
            <button
              onClick={() => setAbierto(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {enviado ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Check className="h-8 w-8 text-green-600" />
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Reporte enviado — quedó registrado para revisión. Recuerde: esto es un reporte técnico, no un
                reclamo, y no lo exime de la responsabilidad por datos ya grabados antes de enviarlo.
              </p>
              <button
                onClick={() => {
                  setEnviado(false);
                  setAbierto(false);
                }}
                className="text-xs text-blue-600 hover:underline mt-1"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Use esto solo para un posible error de programación de la herramienta (no un dato mal traído del
                reporte del SIS, eso se corrige a mano en SIMMOW). Es un reporte técnico, no un reclamo.
              </p>
              <select
                value={flujo}
                onChange={(e) => setFlujo(e.target.value as FlujoReporteBug)}
                className="w-full text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-900 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-100"
              >
                <option value="hospitalaria">Atención Hospitalaria</option>
                <option value="ambulatoria">Atención Ambulatoria</option>
                <option value="otro">Otro</option>
              </select>
              <input
                value={expediente}
                onChange={(e) => setExpediente(e.target.value)}
                placeholder="Expediente (opcional)"
                className="w-full text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-900 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-100"
              />
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Describa qué campo o comportamiento no es correcto…"
                rows={4}
                className="w-full text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-900 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-100"
              />
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              <button
                onClick={enviar}
                disabled={!descripcion.trim() || enviando}
                className="w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enviando ? "Enviando…" : "Enviar reporte"}
              </button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setAbierto(!abierto)}
        className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 shadow-2xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center hover:scale-105 hover:shadow-blue-500/20 active:scale-95 transition-all"
        title="Reportar un error de la herramienta"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vault-tec.png" alt="Reportar error" className="w-full h-full object-cover" />
      </button>
    </div>
  );
}
