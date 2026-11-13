"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, UserPlus, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hoyLocalISO } from "@/lib/esdomed/expedientesProgramados";
import { AccionNoAplica, ejecutarAccion, leerCitasDelDia } from "@/lib/consultaExterna/estacionDatos";
import { ETIQUETA_ESTADO, type AccionCE } from "@/lib/consultaExterna/circuito";
import { estacionPorId } from "@/lib/consultaExterna/especialidades";
import type { CitaCEConId } from "@/lib/consultaExterna/tipos";
import { BuscadorLlegada } from "@/components/consultaExterna/EstacionVista";

// Recepción de ESDOMED: el paciente de primera vez se presenta aquí; se marca
// su llegada y se le da su código y la estación a la que debe ir. Lee las
// citas del día una vez (botón Actualizar), no en vivo.

export default function RecepcionPrimeraVezPage() {
  const { user, profile } = useAuth();
  const hoy = hoyLocalISO();
  const [citas, setCitas] = useState<CitaCEConId[] | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupadas, setOcupadas] = useState<Set<string>>(new Set());
  const [recien, setRecien] = useState<CitaCEConId | null>(null);

  const cargar = useCallback(async () => {
    setError("");
    try {
      setCitas(await leerCitasDelDia(hoy));
    } catch (e) {
      console.error("No se pudieron leer las citas del día", e);
      setError("No se pudieron leer las citas de hoy. Revise la conexión.");
      setCitas([]);
    }
  }, [hoy]);

  useEffect(() => {
    // Lectura única al abrir; luego, con Actualizar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const accion = async (cita: CitaCEConId, a: AccionCE) => {
    if (!user) return;
    setAviso("");
    setOcupadas((s) => new Set(s).add(cita.id));
    try {
      await ejecutarAccion(cita.id, a, { uid: user.uid, nombre: profile?.nombre ?? "" });
      const actualizada = { ...cita, estado: "espera" as const };
      setCitas((prev) => prev?.map((c) => (c.id === cita.id ? actualizada : c)) ?? prev);
      setRecien(actualizada);
    } catch (e) {
      console.error("No se pudo marcar la llegada", e);
      setAviso(e instanceof AccionNoAplica ? e.message : "No se pudo marcar la llegada. Revise la conexión e intente de nuevo.");
      if (e instanceof AccionNoAplica) cargar();
    } finally {
      setOcupadas((s) => {
        const n = new Set(s);
        n.delete(cita.id);
        return n;
      });
    }
  };

  const primeraVez = (citas ?? []).filter((c) => c.primeraVez).sort((a, b) => a.franjaInicio.localeCompare(b.franjaInicio));

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
            <UserPlus size={17} className="text-blue-600 dark:text-cyan-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Recepción primera vez</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Marque la llegada y entregue al paciente su código</p>
          </div>
        </div>
        <button
          type="button"
          onClick={cargar}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw size={15} aria-hidden="true" />
          Actualizar
        </button>
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
      {aviso && (
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          {aviso}
        </div>
      )}

      {citas === null ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : citas.length === 0 && !error ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          No hay citas cargadas hoy. Cargue primero la agenda del día desde el SIS.
        </p>
      ) : (
        <>
          <BuscadorLlegada citas={citas} ocupadas={ocupadas} onAccion={accion} mostrarEspecialidad />

          {recien && (
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900 dark:bg-emerald-950/40">
              <CheckCircle2 size={24} className="flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-emerald-800 dark:text-emerald-200">
                  Llegó <strong>{recien.paciente}</strong>. Su código es
                </p>
                <p className="font-mono text-3xl font-extrabold tracking-tight text-emerald-900 dark:text-emerald-100">{recien.codigo}</p>
                <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
                  Indíquele que pase a la <strong>estación de {estacionPorId(recien.estacionId)?.nombre}</strong>.
                </p>
              </div>
              <button type="button" onClick={() => setRecien(null)} className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/50" aria-label="Cerrar aviso">
                <X size={18} />
              </button>
            </div>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">
              Primera vez de hoy ({primeraVez.length})
            </h2>
            {primeraVez.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">Hoy no hay citas de primera vez.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {primeraVez.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-14 flex-shrink-0 font-mono text-sm font-bold text-blue-700 dark:text-cyan-300">{c.codigo}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.paciente}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Exp. {c.expediente} · {c.especialidad} · Cita {c.franjaInicio} · {c.medico}
                      </p>
                    </div>
                    {c.estado === "citado" ? (
                      <button
                        type="button"
                        disabled={ocupadas.has(c.id)}
                        onClick={() => accion(c, "llego")}
                        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                      >
                        Llegó
                      </button>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        {ETIQUETA_ESTADO[c.estado]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
