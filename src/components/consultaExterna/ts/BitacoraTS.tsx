"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { ArrowLeft, FileClock, RefreshCw, Search } from "lucide-react";
import { coincideCita } from "@/lib/consultaExterna/busqueda";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import type { GestionTSCE, NotaTSCE, PacienteTSCE } from "@/lib/consultaExterna/trabajoSocial";
import { mensaje, useTS } from "./contexto";
import { TarjetaGestion } from "./TarjetaGestion";
import { Aviso, Cargando, Encabezado, Vacio, botonSecundario, fechaCorta, tarjeta } from "./ui";

// Bitácora: solo pacientes con gestiones de Trabajo Social de Consulta Externa,
// de cualquiera de las dos trabajadoras. Nada de hospitalización.

const PAGINA = 50;

export function BitacoraTS() {
  const { llamar } = useTS();
  const [pacientes, setPacientes] = useState<PacienteTSCE[] | null>(null);
  const [error, setError] = useState("");
  const [vuelta, setVuelta] = useState(0);
  const [consulta, setConsulta] = useState("");
  const [limite, setLimite] = useState(PAGINA);
  const [abierto, setAbierto] = useState<PacienteTSCE | null>(null);

  useEffect(() => {
    let vivo = true;
    llamar<{ pacientes: PacienteTSCE[] }>("/pacientes?bitacora=1")
      .then((r) => { if (vivo) { setPacientes(r.pacientes); setError(""); } })
      .catch((e) => { if (vivo) setError(mensaje(e)); });
    return () => { vivo = false; };
  }, [llamar, vuelta]);

  const q = useDeferredValue(consulta).trim();
  if (abierto) return <FichaPaciente paciente={abierto} onVolver={() => { setAbierto(null); setVuelta((v) => v + 1); }} />;

  const resultados = (pacientes ?? []).filter((p) =>
    q.length < 2 || coincideCita({ codigo: "", expediente: p.expediente ?? "", dui: p.dui ?? "", paciente: p.paciente ?? "" }, q));
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <Encabezado icono={FileClock} titulo="Bitácora del paciente" detalle="Pacientes con gestiones de Trabajo Social de Consulta Externa">
        <button type="button" onClick={() => setVuelta((v) => v + 1)} className={botonSecundario}><RefreshCw size={14} aria-hidden="true" />Actualizar</button>
      </Encabezado>

      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={consulta}
          onChange={(e) => { setConsulta(e.target.value); setLimite(PAGINA); }}
          placeholder="Expediente, DUI o nombre"
          aria-label="Buscar en la bitácora"
          autoComplete="off"
          spellCheck={false}
          className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {!pacientes ? (!error && <Cargando />) : pacientes.length === 0 ? (
        <Vacio icono={FileClock} titulo="Aún no hay pacientes en la bitácora" detalle="Aparecen al registrarles la primera gestión." />
      ) : resultados.length === 0 ? (
        <Vacio icono={Search} titulo="Ningún paciente con gestiones coincide" />
      ) : (
        <>
          <ul className={`${tarjeta} divide-y divide-slate-100 overflow-hidden dark:divide-slate-800`}>
            {resultados.slice(0, limite).map((p) => (
              <li key={p.clave}>
                <button type="button" onClick={() => setAbierto(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <span className="hidden w-24 flex-shrink-0 font-mono text-sm font-bold text-blue-700 dark:text-cyan-300 sm:block">{p.expediente || "—"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-slate-900 dark:text-white">{p.paciente}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono sm:hidden">{p.expediente ? `${p.expediente} · ` : ""}</span>
                      {p.dui ? <>DUI <span className="font-mono">{p.dui}</span></> : "Sin DUI"}
                    </span>
                  </span>
                  <span className="flex-shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    <span className="block font-semibold text-slate-800 dark:text-slate-100">{p.gestiones} {p.gestiones === 1 ? "gestión" : "gestiones"}</span>
                    {p.ultimaGestionMs ? fechaCorta(hoySV(new Date(p.ultimaGestionMs))) : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {resultados.length > limite && (
            <button type="button" onClick={() => setLimite((l) => l + PAGINA)} className={`${botonSecundario} w-full`}>
              Mostrar más · quedan {(resultados.length - limite).toLocaleString("es-SV")}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function FichaPaciente({ paciente: p, onVolver }: { paciente: PacienteTSCE; onVolver: () => void }) {
  const { llamar } = useTS();
  const [datos, setDatos] = useState<{ hoy: string; gestiones: GestionTSCE[]; notas: NotaTSCE[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    llamar<{ hoy: string; gestiones: GestionTSCE[]; notas: NotaTSCE[] }>(`/gestiones?paciente=${encodeURIComponent(p.clave)}`)
      .then((r) => { if (vivo) setDatos(r); })
      .catch((e) => { if (vivo) setError(mensaje(e)); });
    return () => { vivo = false; };
  }, [llamar, p.clave]);

  const enProceso = datos?.gestiones.filter((g) => g.estado === "en_proceso").length ?? 0;
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <button type="button" onClick={onVolver} className={botonSecundario}><ArrowLeft size={14} aria-hidden="true" />Bitácora</button>
      <section className={`${tarjeta} p-4 md:p-5`}>
        <h1 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">{p.paciente}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {p.expediente ? <span className="font-mono font-bold">{p.expediente}</span> : "Sin expediente"}
          {p.dui && <> · DUI <span className="font-mono">{p.dui}</span></>}
          {p.ultima && <> · última cita cargada {fechaCorta(p.ultima)}</>}
          {p.medico && <> · {p.medico}</>}
        </p>
        {datos && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {datos.gestiones.length} {datos.gestiones.length === 1 ? "gestión" : "gestiones"} · {enProceso} en proceso · {datos.notas.length} {datos.notas.length === 1 ? "nota" : "notas"}
          </p>
        )}
      </section>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!datos ? (!error && <Cargando />) : datos.gestiones.length === 0 ? (
        <Vacio icono={FileClock} titulo="Este paciente ya no tiene gestiones" />
      ) : (
        <ul className={`${tarjeta} divide-y divide-slate-100 overflow-hidden dark:divide-slate-800`}>
          {datos.gestiones.map((g) => (
            <TarjetaGestion
              key={g.id}
              gestion={g}
              hoy={datos.hoy}
              notas={datos.notas.filter((n) => n.gestionId === g.id)}
              abiertaInicial={datos.gestiones.length <= 3}
              mostrarPaciente={false}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
