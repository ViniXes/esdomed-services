"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { AlertTriangle, CalendarX, Check, ChevronDown, GitMerge, Loader2, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ESPECIALIDADES_CE } from "@/lib/consultaExterna/especialidades";
import { ETIQUETA_ESTADO, normalizarEstado } from "@/lib/consultaExterna/circuito";
import {
  FECHA_GENERICA_ISO,
  FECHA_GENERICA_TEXTO,
  NOMBRE_ESTADO_FG,
  citaDeHoyFG,
  coincideFiltroEstadoFG,
  edadEnAnios,
  filtrarFechaGenerica,
  proximaCitaFG,
  resumenFechaGenerica,
  validarUnificacion,
  type EstadoFechaGenerica,
  type FiltroEstadoFG,
  type MarcaFG,
  type OrdenFG,
  type PacienteFechaGenerica,
} from "@/lib/consultaExterna/fechaGenerica";

// PROVISIONAL (pedido del usuario, 2026-11-24). Como el Catálogo de tarjetas,
// pero para los pacientes que en las agendas del SIS vienen sin DUI, la mayoría
// con la fecha de nacimiento genérica 10/10/2000 (edad falsa). Una sola lista
// (pedido del usuario: dos tablas confundían); el filtro "Cita hoy" deja solo a
// los pendientes que vienen hoy: que tengan datos faltantes no quiere decir que
// no vengan, y así nadie les crea otro expediente ni los atrasa. Al corregirlos en el SIS se
// marcan aquí y salen de los pendientes; también salen solos cuando vuelven a
// aparecer con DUI en una agenda cargada. Cuando no queden, se quita (ver CLAUDE.md).

const PAGINA = 50;
const tarjeta = "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";

type Datos = { hoy: string; pacientes: PacienteFechaGenerica[]; reporteCargadoEn: number | null; fuenteReporte: string };
type Marcar = (expediente: string, estado: MarcaFG["estado"], unificadoCon?: string) => Promise<string | null>;

function fechaCorta(iso: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-SV", { day: "numeric", month: "short", year: "numeric" });
}
const fechaHora = (ms: number) => new Date(ms).toLocaleString("es-SV", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const TONO_ESTADO: Record<EstadoFechaGenerica, string> = {
  pendiente: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  corregido: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  unificado: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  con_dui: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
};

export function FechaGenerica() {
  const { user } = useAuth();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [consulta, setConsulta] = useState("");
  const [estado, setEstado] = useState<FiltroEstadoFG>("pendiente");
  const [especialidadId, setEspecialidadId] = useState("");
  const [orden, setOrden] = useState<OrdenFG>("proxima");
  const [limite, setLimite] = useState(PAGINA);
  const [abierta, setAbierta] = useState("");

  const llamar = async (init?: RequestInit) => {
    if (!user) throw new Error("Sesión no iniciada.");
    const r = await fetch("/api/consulta-externa/fecha-generica", {
      ...init,
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "No se pudo completar.");
    return data;
  };

  const cargar = async () => {
    setCargando(true);
    setError("");
    try {
      setDatos(await llamar());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la lista.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => { void cargar(); }, 0);
    return () => window.clearTimeout(t);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Marca lo hecho en el SIS; devuelve un error para mostrar en la ficha, o null. */
  const marcar: Marcar = async (expediente, nuevo, unificadoCon = "") => {
    try {
      const { marca } = (await llamar({ method: "POST", body: JSON.stringify({ expediente, estado: nuevo, unificadoCon }) })) as { marca: MarcaFG };
      setDatos((d) => (d ? {
        ...d,
        pacientes: d.pacientes.map((p) => {
          if (p.expediente !== expediente) return p;
          const sinResolucion: PacienteFechaGenerica = { ...p, estado: marca.estado };
          delete sinResolucion.unificadoCon;
          delete sinResolucion.resuelto;
          return { ...sinResolucion, ...(marca.unificadoCon ? { unificadoCon: marca.unificadoCon } : {}), ...(marca.resuelto ? { resuelto: marca.resuelto } : {}) };
        }),
      } : d));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "No se pudo guardar.";
    }
  };

  const q = useDeferredValue(consulta);
  const hoy = datos?.hoy ?? "";
  const pacientes = datos?.pacientes ?? [];
  const resumen = resumenFechaGenerica(pacientes);
  const resueltos = resumen.corregido + resumen.unificado + resumen.con_dui;
  const resultados = datos ? filtrarFechaGenerica(pacientes, q, { estado, especialidadId, orden, hoyISO: hoy }) : [];
  const visibles = resultados.slice(0, limite);
  // Cita hoy: la agenda cargada en services manda; si aún no se cargó, la del reporte.
  const conCitaHoy = pacientes.filter((p) => p.estado === "pendiente" && citaDeHoyFG(p, hoy));
  const conteoEspecialidad = (id: string) =>
    pacientes.filter((p) => p.citas.some((c) => c.especialidadId === id) && coincideFiltroEstadoFG(p, estado, hoy)).length;
  // Si la búsqueda no encuentra nada con el filtro elegido, cuántos hay en toda la lista.
  const enTodos = q.trim().length >= 2 && resultados.length === 0 && datos
    ? filtrarFechaGenerica(pacientes, q, { estado: "todos", especialidadId: "", orden, hoyISO: hoy }).length
    : 0;
  const reiniciar = () => setLimite(PAGINA);
  const avance = resumen.total ? Math.round((resueltos / resumen.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
            <CalendarX size={17} className="text-blue-600 dark:text-cyan-300" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">Pacientes sin DUI y fecha genérica</h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Sin DUI en las agendas del SIS; la mayoría con fecha de nacimiento {FECHA_GENERICA_TEXTO} (edad falsa). Pestaña provisional.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-white disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw size={14} className={cargando ? "animate-spin" : ""} aria-hidden="true" />
          Actualizar
        </button>
      </div>

      <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
        <p>
          Antes de crear un expediente nuevo, busque aquí al paciente. Si está en la lista, <strong>ya tiene expediente</strong>:
          corrija en el SIS su fecha de nacimiento y documento en ese mismo expediente y márquelo aquí. No le cree otro.
        </p>
      </div>

      {error && (
        <div className="flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {!datos ? (
        !error && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            Leyendo la lista…
          </div>
        )
      ) : resumen.total === 0 ? (
        <div className={`${tarjeta} px-6 py-12 text-center`}>
          <CalendarX size={28} className="mx-auto text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">No hay pacientes sin DUI</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ningún paciente de las agendas cargadas viene sin DUI.</p>
        </div>
      ) : (
        <>
          <section className={`${tarjeta} p-4 md:p-5`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Quedan por corregir</p>
                <p className="font-heading text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {resumen.pendiente.toLocaleString("es-SV")}
                  <span className="text-base font-medium text-slate-400"> de {resumen.total.toLocaleString("es-SV")}</span>
                </p>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {resumen.corregido} corregidos · {resumen.unificado} unificados · {resumen.con_dui} ya con DUI
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={avance} aria-valuemin={0} aria-valuemax={100} aria-label="Avance">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${avance}%` }} />
            </div>
          </section>

          <section className={`${tarjeta} space-y-4 p-4 md:p-5`}>
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={consulta}
                onChange={(e) => { setConsulta(e.target.value); reiniciar(); }}
                placeholder="Expediente o nombre"
                aria-label="Buscar por expediente o nombre"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-11 text-base text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white [&::-webkit-search-cancel-button]:hidden"
              />
              {consulta && (
                <button type="button" onClick={() => { setConsulta(""); reiniciar(); }} aria-label="Borrar la búsqueda"
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200">
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
              {([
                ["cita_hoy", `Cita hoy ${conCitaHoy.length}`],
                ["pendiente", `Pendientes ${resumen.pendiente}`],
                ["resueltos", `Resueltos ${resueltos}`],
                ["todos", `Todos ${resumen.total}`],
              ] as const).map(([id, etiqueta]) => (
                <Chip key={id} activo={estado === id} onClick={() => { setEstado(id); reiniciar(); }}>{etiqueta}</Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por especialidad">
              <Chip activo={!especialidadId} onClick={() => { setEspecialidadId(""); reiniciar(); }}>Todas las especialidades</Chip>
              {ESPECIALIDADES_CE.map((e) => {
                const n = conteoEspecialidad(e.id);
                if (!n) return null;
                return (
                  <Chip key={e.id} activo={especialidadId === e.id} onClick={() => { setEspecialidadId(especialidadId === e.id ? "" : e.id); reiniciar(); }}>
                    {e.nombre} <span className="tabular-nums opacity-70">{n}</span>
                  </Chip>
                );
              })}
            </div>
          </section>

          <section aria-live="polite">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">{resultados.length.toLocaleString("es-SV")} pacientes</p>
              <div className="inline-flex flex-shrink-0 rounded-xl bg-slate-200/60 p-1 dark:bg-slate-800" role="group" aria-label="Ordenar">
                {([["proxima", "Próxima cita"], ["nombre", "Por apellido"]] as const).map(([o, etiqueta]) => (
                  <button key={o} type="button" aria-pressed={orden === o} onClick={() => { setOrden(o); reiniciar(); }}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${orden === o
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}>
                    {etiqueta}
                  </button>
                ))}
              </div>
            </div>

            {resultados.length === 0 ? (
              <div className={`${tarjeta} px-6 py-10 text-center`}>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {estado === "cita_hoy" && !q.trim() ? "Hoy no viene ningún paciente pendiente" : "Ningún paciente coincide con este filtro"}
                </p>
                {enTodos > 0 ? (
                  <button type="button" onClick={() => { setEstado("todos"); reiniciar(); }}
                    className="mt-2 text-sm font-semibold text-blue-700 underline dark:text-cyan-300">
                    Hay {enTodos} en Todos: ver
                  </button>
                ) : (
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pruebe con otra parte del nombre o con el expediente.</p>
                )}
              </div>
            ) : (
              <ul className={`${tarjeta} divide-y divide-slate-100 overflow-hidden dark:divide-slate-800`}>
                {visibles.map((p) => (
                  <FilaPaciente key={p.expediente} p={p} hoy={hoy} abierta={abierta === p.expediente}
                    onAlternar={() => setAbierta((a) => (a === p.expediente ? "" : p.expediente))} marcar={marcar} />
                ))}
              </ul>
            )}

            {resultados.length > limite && (
              <button type="button" onClick={() => setLimite((l) => l + PAGINA)}
                className="mt-3 w-full rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                Mostrar {Math.min(PAGINA, resultados.length - limite)} más · quedan {(resultados.length - limite).toLocaleString("es-SV")}
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={activo} onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${activo
        ? "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-500"
        : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600"}`}>
      {children}
    </button>
  );
}

function FilaPaciente({
  p, hoy, abierta, onAlternar, marcar,
}: {
  p: PacienteFechaGenerica;
  hoy: string;
  abierta: boolean;
  onAlternar: () => void;
  marcar: Marcar;
}) {
  const proxima = proximaCitaFG(p, hoy);
  const citaHoy = citaDeHoyFG(p, hoy);
  const id = `fg-${p.expediente}`;
  const etiquetaEstado = p.estado === "unificado" && p.unificadoCon ? `Unificado con ${p.unificadoCon}` : NOMBRE_ESTADO_FG[p.estado];
  return (
    <li>
      <button type="button" onClick={onAlternar} aria-expanded={abierta} aria-controls={id}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <span className="hidden w-24 flex-shrink-0 font-mono text-sm font-bold text-blue-700 dark:text-cyan-300 sm:block">{p.expediente}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug text-slate-900 dark:text-white sm:truncate">{p.paciente || "Sin nombre"}</span>
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400 sm:truncate">
            <span className="font-mono font-bold text-blue-700 dark:text-cyan-300 sm:hidden">{p.expediente} · </span>
            {citaHoy
              ? <strong className="font-semibold text-blue-700 dark:text-cyan-300">Cita hoy: {citaHoy.especialidad}{citaHoy.medico ? ` · ${citaHoy.medico}` : ""}</strong>
              : proxima ? <>Próxima cita: {fechaCorta(proxima.fecha)} · {proxima.especialidad}</> : "Sin cita próxima"}
            {p.fechaGenerica && <> · Fecha {FECHA_GENERICA_TEXTO}</>}
          </span>
        </span>
        <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONO_ESTADO[p.estado]}`}>{etiquetaEstado}</span>
        <ChevronDown size={16} className={`flex-shrink-0 text-slate-400 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {abierta && <FichaPaciente id={id} p={p} hoy={hoy} marcar={marcar} />}
    </li>
  );
}

function FichaPaciente({ id, p, hoy, marcar }: { id: string; p: PacienteFechaGenerica; hoy: string; marcar: Marcar }) {
  const [destino, setDestino] = useState("");
  const [abrirUnificar, setAbrirUnificar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const ejecutar = async (estado: MarcaFG["estado"], unificadoCon = "") => {
    if (estado === "unificado") {
      const problema = validarUnificacion(p.expediente, unificadoCon);
      if (problema) { setError(problema); return; }
    }
    setGuardando(true);
    setError("");
    const fallo = await marcar(p.expediente, estado, unificadoCon);
    setGuardando(false);
    if (fallo) setError(fallo);
    else { setAbrirUnificar(false); setDestino(""); }
  };

  const datos: [string, string][] = [
    ["Expediente", p.expediente],
    ["Documento", "Sin DUI en el SIS"],
    ...(p.fechaGenerica
      ? ([
        ["Fecha de nacimiento en el SIS", `${FECHA_GENERICA_TEXTO} (genérica)`],
        ["Edad que muestra el SIS", hoy ? `${edadEnAnios(FECHA_GENERICA_ISO, hoy)} años (no es real)` : "—"],
      ] as [string, string][])
      : ([["Fecha de nacimiento", "No viene en el reporte de fecha genérica: revísela en el SIS"]] as [string, string][])),
  ];

  return (
    <div id={id} className="border-t border-slate-100 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/30">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        {datos.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{k}</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Citas</h3>
      <ul className="divide-y divide-slate-200/70 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {p.citas.map((c) => (
          <li key={`${c.fecha}-${c.especialidad}-${c.origen}`}
            className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${c.fecha < hoy ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"}`}>
            <span>
              {c.fecha === hoy ? <strong className="text-blue-700 dark:text-cyan-300">Hoy</strong> : fechaCorta(c.fecha)} · {c.especialidad}{c.medico ? ` · ${c.medico}` : ""}
              {c.origen === "reporte" && <span className="text-xs text-slate-400"> (según el reporte)</span>}
            </span>
            {c.estado && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {ETIQUETA_ESTADO[normalizarEstado(c.estado)] ?? c.estado}
              </span>
            )}
          </li>
        ))}
        {p.citas.length === 0 && <li className="px-3 py-2 text-slate-500">Sin citas.</li>}
      </ul>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        {p.estado === "pendiente" ? (
          <>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">¿Ya se corrigió en el SIS?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => void ejecutar("corregido")} disabled={guardando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
                {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Datos corregidos en el SIS
              </button>
              <button type="button" onClick={() => { setAbrirUnificar((v) => !v); setError(""); }} disabled={guardando}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <GitMerge size={14} />Se unificó con otro expediente
              </button>
            </div>
            {abrirUnificar && (
              <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void ejecutar("unificado", destino); }}>
                <input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Expediente con el que quedó (12345-26)" autoFocus
                  className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                <button type="submit" disabled={guardando}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
                  {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Guardar
                </button>
              </form>
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-semibold">{p.estado === "unificado" && p.unificadoCon ? `Unificado con ${p.unificadoCon}` : NOMBRE_ESTADO_FG[p.estado]}</span>
              {p.estado === "con_dui" && <span className="text-slate-500"> · ya aparece con DUI en una agenda cargada (Catálogo de tarjetas)</span>}
              {p.resuelto && (p.resuelto.origen === "sis"
                ? <span className="text-slate-500"> · según el reporte del SIS</span>
                : <span className="text-slate-500"> · {p.resuelto.porNombre}, {fechaHora(p.resuelto.en)}</span>)}
            </p>
            <button type="button" onClick={() => void ejecutar("pendiente")} disabled={guardando}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              {guardando ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}Volver a pendiente
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      </div>
    </div>
  );
}
