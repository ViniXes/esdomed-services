"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Clock, Loader2, Megaphone, Search, X } from "lucide-react";
import {
  accionesDe,
  compararCola,
  ETIQUETA_ACCION,
  ETIQUETA_ESTADO,
  nombreConsultorio,
  type AccionCE,
  type EstadoCitaCE,
} from "@/lib/consultaExterna/circuito";
import { buscarCitas } from "@/lib/consultaExterna/busqueda";
import type { CitaCEConId } from "@/lib/consultaExterna/tipos";

// Pantalla de trabajo de la enfermera de una estación: marca llegadas y llama
// a cada paciente directo al consultorio de su médico (la preconsulta se
// coordina de palabra). Solo presenta: los datos y las acciones los pone la
// página, así se puede probar sin Firestore.

const llegadaMs = (c: CitaCEConId) => c.llegadaEn?.toMillis?.() ?? null;
const ordenCola = (a: CitaCEConId, b: CitaCEConId) =>
  compararCola(
    { franjaInicio: a.franjaInicio, numero: a.numero, llegadaMs: llegadaMs(a) },
    { franjaInicio: b.franjaInicio, numero: b.numero, llegadaMs: llegadaMs(b) },
  );
const minutosDesde = (ms: number | null | undefined, ahora: number) =>
  ms ? Math.max(0, Math.floor((ahora - ms) / 60000)) : null;

const btnPrincipal =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500";
const btnSecundario =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
const btnEnlace =
  "rounded px-1.5 py-1 text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline disabled:opacity-60 dark:text-slate-400 dark:hover:text-white";

interface Props {
  citas: CitaCEConId[];
  ocupadas: Set<string>;
  ahoraMs: number;
  recienLlegada: CitaCEConId | null;
  onAccion: (cita: CitaCEConId, accion: AccionCE) => void;
  onCerrarRecien: () => void;
}

export function EstacionVista({ citas, ocupadas, ahoraMs, recienLlegada, onAccion, onCerrarRecien }: Props) {
  const cuenta = (e: EstadoCitaCE) => citas.filter((c) => c.estado === e).length;
  const sinLlegar = citas.filter((c) => c.estado === "citado").sort(ordenCola);
  const noRespondieron = citas.filter((c) => c.estado === "no_respondio").sort(ordenCola);
  const atendidos = citas.filter((c) => c.estado === "atendido").sort((a, b) => a.numero - b.numero);

  // Una cola por médico: cada uno atiende a sus pacientes en su consultorio.
  // Se muestran todos los médicos del día, aunque nadie espere todavía.
  const medicos = useMemo(() => {
    const mapa = new Map<string, CitaCEConId[]>();
    for (const c of citas) {
      const k = `${c.medico}|${c.consultorio}`;
      mapa.set(k, [...(mapa.get(k) ?? []), c]);
    }
    return [...mapa.values()]
      .map((grupo) => {
        const ordenadas = [...grupo].sort(ordenCola);
        return {
          clave: `${grupo[0].medico}|${grupo[0].consultorio}`,
          medico: grupo[0].medico,
          consultorio: nombreConsultorio(grupo[0].consultorio, grupo[0].especialidadId),
          llamados: ordenadas.filter((c) => c.estado === "llamado"),
          espera: ordenadas.filter((c) => c.estado === "espera"),
          sinLlegar: grupo.filter((c) => c.estado === "citado").length,
          atendidos: grupo.filter((c) => c.estado === "atendido").length,
          inicio: grupo.map((c) => c.franjaInicio).sort()[0] ?? "",
        };
      })
      .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.medico.localeCompare(b.medico));
  }, [citas]);

  return (
    <div className="space-y-5">
      <BuscadorLlegada citas={citas} ocupadas={ocupadas} onAccion={onAccion} />

      {recienLlegada && (
        <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900 dark:bg-emerald-950/40">
          <CheckCircle2 size={24} className="flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-emerald-800 dark:text-emerald-200">
              Llegó <strong>{recienLlegada.paciente}</strong>. Dígale su código:
            </p>
            <p className="font-mono text-3xl font-extrabold tracking-tight text-emerald-900 dark:text-emerald-100">{recienLlegada.codigo}</p>
          </div>
          <button type="button" onClick={onCerrarRecien} className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/50" aria-label="Cerrar aviso">
            <X size={18} />
          </button>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Sin llegar", cuenta("citado")],
          ["En espera", cuenta("espera")],
          ["Llamados", cuenta("llamado")],
          ["Pasaron a consulta", cuenta("atendido")],
          ["No respondieron", cuenta("no_respondio")],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{k}</dt>
            <dd className="font-heading text-xl font-bold tabular-nums text-slate-900 dark:text-white">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {medicos.map((m) => {
          const vacio = !m.llamados.length && !m.espera.length;
          return (
            <section key={m.clave} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <header className="mb-3 border-b border-slate-200 pb-2 dark:border-slate-800">
                <h2 className="font-heading text-base font-bold text-slate-900 dark:text-slate-100">{m.medico}</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {m.consultorio}
                  {m.sinLlegar ? ` · ${m.sinLlegar} sin llegar` : ""}
                  {m.atendidos ? ` · ${m.atendidos} ${m.atendidos === 1 ? "ya pasó" : "ya pasaron"}` : ""}
                </p>
              </header>
              <div className="space-y-2">
                {vacio ? (
                  <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">Nadie en espera.</p>
                ) : (
                  <>
                    {m.llamados.map((c) => (
                      <TarjetaCita key={c.id} cita={c} ocupada={ocupadas.has(c.id)} ahoraMs={ahoraMs} onAccion={onAccion} />
                    ))}
                    {m.espera.map((c, i) => (
                      <TarjetaCita key={c.id} cita={c} sugerida={i === 0} ocupada={ocupadas.has(c.id)} ahoraMs={ahoraMs} onAccion={onAccion} />
                    ))}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Desplegable titulo={`Sin llegar (${sinLlegar.length})`}>
        {sinLlegar.map((c) => (
          <FilaSimple key={c.id} cita={c} ocupada={ocupadas.has(c.id)} accion="llego" onAccion={onAccion} />
        ))}
      </Desplegable>
      {noRespondieron.length > 0 && (
        <Desplegable titulo={`No respondieron (${noRespondieron.length})`} abierto>
          {noRespondieron.map((c) => (
            <FilaSimple key={c.id} cita={c} ocupada={ocupadas.has(c.id)} accion="regreso" onAccion={onAccion} />
          ))}
        </Desplegable>
      )}
      {atendidos.length > 0 && (
        <Desplegable titulo={`Pasaron a consulta (${atendidos.length})`}>
          {atendidos.map((c) => (
            <FilaSimple key={c.id} cita={c} ocupada={false} onAccion={onAccion} />
          ))}
        </Desplegable>
      )}
    </div>
  );
}

// ─── Piezas ─────────────────────────────────────────────────────────────────

function TarjetaCita({
  cita: c, sugerida, ocupada, ahoraMs, onAccion,
}: {
  cita: CitaCEConId;
  sugerida?: boolean;
  ocupada: boolean;
  ahoraMs: number;
  onAccion: (cita: CitaCEConId, accion: AccionCE) => void;
}) {
  const llamado = c.estado === "llamado";
  const espera = minutosDesde(llegadaMs(c), ahoraMs);
  const desdeLlamado = minutosDesde(c.ultimoLlamadoEn?.toMillis?.(), ahoraMs);
  const [principal, ...otras] = accionesDe(c.estado);
  const secundarias = otras.filter((a) => a === "volver_a_llamar");
  const enlaces = otras.filter((a) => a !== "volver_a_llamar");

  return (
    <article
      className={`rounded-xl border bg-white p-3 shadow-sm dark:bg-slate-900 ${
        llamado ? "border-cyan-400 ring-1 ring-cyan-300/60 dark:border-cyan-600 dark:ring-cyan-700/50" : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex items-start gap-3">
        <p className="w-16 flex-shrink-0 font-mono text-lg font-extrabold leading-tight text-blue-700 dark:text-cyan-300">{c.codigo}</p>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{c.paciente}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Exp. {c.expediente} · Cita {c.franjaInicio}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {sugerida && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white dark:bg-cyan-600">Sigue</span>
            )}
            {c.primeraVez && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-cyan-300">Primera vez</span>
            )}
            {llamado && (
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
                <Megaphone size={11} aria-hidden="true" />
                Llamado{c.llamadas && c.llamadas > 1 ? ` · ${c.llamadas} veces` : ""}
                {desdeLlamado === null ? "" : desdeLlamado === 0 ? " · ahora" : ` · hace ${desdeLlamado} min`}
              </span>
            )}
            {!llamado && espera !== null && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                espera >= 60
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}>
                <Clock size={11} aria-hidden="true" />
                Espera {espera} min
              </span>
            )}
          </div>
        </div>
      </div>
      {principal && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={ocupada} onClick={() => onAccion(c, principal)} className={btnPrincipal}>
            {ocupada && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {ETIQUETA_ACCION[principal]}
          </button>
          {secundarias.map((a) => (
            <button key={a} type="button" disabled={ocupada} onClick={() => onAccion(c, a)} className={btnSecundario}>
              {ETIQUETA_ACCION[a]}
            </button>
          ))}
          <span className="ml-auto flex flex-wrap gap-1">
            {enlaces.map((a) => (
              <button key={a} type="button" disabled={ocupada} onClick={() => onAccion(c, a)} className={btnEnlace}>
                {ETIQUETA_ACCION[a]}
              </button>
            ))}
          </span>
        </div>
      )}
    </article>
  );
}

function FilaSimple({
  cita: c, ocupada, accion, onAccion,
}: {
  cita: CitaCEConId;
  ocupada: boolean;
  accion?: AccionCE;
  onAccion: (cita: CitaCEConId, accion: AccionCE) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-14 flex-shrink-0 font-mono text-sm font-bold text-blue-700 dark:text-cyan-300">{c.codigo}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-800 dark:text-slate-100">{c.paciente}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Cita {c.franjaInicio} · {c.medico}
          {c.primeraVez ? " · Primera vez" : ""}
        </p>
      </div>
      {accion && (
        <button type="button" disabled={ocupada} onClick={() => onAccion(c, accion)} className={btnSecundario}>
          {ocupada && <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden="true" />}
          {ETIQUETA_ACCION[accion]}
        </button>
      )}
    </li>
  );
}

function Desplegable({ titulo, abierto, children }: { titulo: string; abierto?: boolean; children: React.ReactNode }) {
  return (
    <details open={abierto} className="group rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {titulo}
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">{children}</ul>
    </details>
  );
}

/** Buscar por código, expediente, DUI o nombre y marcar la llegada. */
export function BuscadorLlegada({
  citas, ocupadas, onAccion, mostrarEspecialidad,
}: {
  citas: CitaCEConId[];
  ocupadas: Set<string>;
  onAccion: (cita: CitaCEConId, accion: AccionCE) => void;
  mostrarEspecialidad?: boolean;
}) {
  const [q, setQ] = useState("");
  const resultados = buscarCitas(citas, q);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Marcar llegada</p>
      <label className="relative block">
        <span className="sr-only">Buscar la cita para marcar la llegada</span>
        <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Código, expediente, DUI o nombre"
          className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Limpiar búsqueda">
            <X size={16} />
          </button>
        )}
      </label>
      {q.trim().length >= 2 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {resultados.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Sin coincidencias en las citas de hoy.</li>
          ) : (
            resultados.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-14 flex-shrink-0 font-mono text-sm font-bold text-blue-700 dark:text-cyan-300">{c.codigo}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.paciente}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Exp. {c.expediente} · Cita {c.franjaInicio}
                    {mostrarEspecialidad ? ` · ${c.especialidad}` : ` · ${c.medico}`}
                    {c.primeraVez ? " · Primera vez" : ""}
                  </p>
                </div>
                {c.estado === "citado" ? (
                  <button
                    type="button"
                    disabled={ocupadas.has(c.id)}
                    onClick={() => { onAccion(c, "llego"); setQ(""); }}
                    className={btnPrincipal}
                  >
                    Llegó
                  </button>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {ETIQUETA_ESTADO[c.estado]}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
