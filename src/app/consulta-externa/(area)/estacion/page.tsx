"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ListOrdered, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hoyLocalISO } from "@/lib/esdomed/expedientesProgramados";
import { esCuentaEstacion } from "@/lib/accesoConsultaExterna";
import { ESTACIONES_CE, especialidadesDeEstacion, estacionPorId, esEstacionCE, type EstacionCEId } from "@/lib/consultaExterna/especialidades";
import { AccionNoAplica, ejecutarAccion, escucharCitasEstacion } from "@/lib/consultaExterna/estacionDatos";
import type { AccionCE } from "@/lib/consultaExterna/circuito";
import type { CitaCEConId } from "@/lib/consultaExterna/tipos";
import { EstacionVista } from "@/components/consultaExterna/EstacionVista";
import { PedirQuienAtiende, useQuienAtiende } from "@/components/consultaExterna/QuienAtiende";

// Estación de enfermería de una especialidad. La cuenta de estación ve la suya;
// ESDOMED y admin eligen cuál ver (y pueden operar en ella, p. ej. para probar).

const CLAVE_ESTACION = "ce:estacion-elegida";

export default function EstacionEspecialidadPage() {
  const { user, profile } = useAuth();
  const hoy = hoyLocalISO();
  const cuentaEstacion = esCuentaEstacion(profile);

  const [elegida, setElegida] = useState<EstacionCEId>("cardiologia");
  useEffect(() => {
    if (cuentaEstacion) return;
    try {
      const v = localStorage.getItem(CLAVE_ESTACION);
      // Preferencia guardada en este navegador (no existe en SSR).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (esEstacionCE(v)) setElegida(v);
    } catch { /* sin almacenamiento */ }
  }, [cuentaEstacion]);
  const elegir = (id: EstacionCEId) => {
    setElegida(id);
    try { localStorage.setItem(CLAVE_ESTACION, id); } catch { /* sin almacenamiento */ }
  };

  const estacionId: EstacionCEId | null = cuentaEstacion ? (profile?.estacionCE ?? null) : elegida;
  const estacion = estacionId ? estacionPorId(estacionId) : undefined;

  const atiende = useQuienAtiende(cuentaEstacion ? user?.uid : undefined, hoy);
  const nombreQuien = cuentaEstacion ? atiende.nombre : profile?.nombre ?? "";

  const [citas, setCitas] = useState<CitaCEConId[] | null>(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [ocupadas, setOcupadas] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState("");
  const [recienId, setRecienId] = useState<string | null>(null);
  const [ahoraMs, setAhoraMs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAhoraMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!estacionId) return;
    // Al cambiar de estación se vacía la lista mientras llega la nueva.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCitas(null);
    setErrorCarga("");
    return escucharCitasEstacion(
      hoy,
      estacionId,
      setCitas,
      (e) => {
        console.error("No se pudieron leer las citas de la estación", e);
        setErrorCarga("No se pudieron leer las citas. Revise la conexión y recargue la página.");
      },
    );
  }, [hoy, estacionId]);

  const accion = async (cita: CitaCEConId, a: AccionCE) => {
    if (!user) return;
    setAviso("");
    setOcupadas((s) => new Set(s).add(cita.id));
    try {
      await ejecutarAccion(cita.id, a, { uid: user.uid, nombre: nombreQuien || profile?.nombre || "" });
      if (a === "llego") setRecienId(cita.id);
    } catch (e) {
      console.error("No se pudo registrar la acción", e);
      setAviso(
        e instanceof AccionNoAplica
          ? e.message
          : "No se pudo registrar. Revise la conexión e intente de nuevo.",
      );
    } finally {
      setOcupadas((s) => {
        const n = new Set(s);
        n.delete(cita.id);
        return n;
      });
    }
  };

  if (cuentaEstacion && !estacion) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Esta cuenta no tiene estación asignada. Pida al administrador que la asigne en Usuarios.
        </p>
      </div>
    );
  }
  if (cuentaEstacion && atiende.nombre === null) return null;
  if (cuentaEstacion && !atiende.nombre && estacion) {
    return <PedirQuienAtiende estacion={estacion.nombre} onListo={atiende.guardar} />;
  }

  const especialidades = estacionId ? especialidadesDeEstacion(estacionId) : [];
  const recien = recienId ? citas?.find((c) => c.id === recienId) ?? null : null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
            <ListOrdered size={17} className="text-blue-600 dark:text-cyan-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Estación {estacion?.nombre}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {especialidades.map((e) => `${e.nombre} (${e.prefijo})`).join(" · ")}
            </p>
          </div>
        </div>
        {cuentaEstacion ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
            <UserRound size={15} className="text-blue-600 dark:text-cyan-300" aria-hidden="true" />
            <span className="text-slate-700 dark:text-slate-200">Atiende: <strong>{atiende.nombre}</strong></span>
            <button type="button" onClick={atiende.cambiar} className="ml-1 text-xs font-medium text-blue-700 hover:underline dark:text-cyan-300">
              Cambiar
            </button>
          </div>
        ) : (
          <div role="tablist" aria-label="Estación" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {ESTACIONES_CE.map((e) => (
              <button
                key={e.id}
                type="button"
                role="tab"
                aria-selected={e.id === estacionId}
                onClick={() => elegir(e.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  e.id === estacionId
                    ? "bg-white text-blue-800 shadow-sm dark:bg-slate-950 dark:text-cyan-200"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                {e.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      {aviso && (
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          {aviso}
        </div>
      )}

      {errorCarga ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{errorCarga}</p>
      ) : citas === null ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : citas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          No hay citas cargadas hoy para esta estación. ESDOMED carga la agenda del día desde el SIS.
        </p>
      ) : estacion ? (
        <EstacionVista
          estacion={estacion}
          citas={citas}
          ocupadas={ocupadas}
          ahoraMs={ahoraMs}
          recienLlegada={recien}
          onAccion={accion}
          onCerrarRecien={() => setRecienId(null)}
        />
      ) : null}
    </div>
  );
}
