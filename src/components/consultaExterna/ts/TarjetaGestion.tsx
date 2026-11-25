"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import {
  DIAS_SIN_MOVIMIENTO, diasSinMovimiento, labelPoblacion, nombreArea, tituloGestion, type GestionTSCE, type NotaTSCE,
} from "@/lib/consultaExterna/trabajoSocial";
import { AdjuntosGestion } from "./Adjuntos";
import { RUTAS_TS, mensaje, useTS } from "./contexto";
import { Evolucion } from "./Evolucion";
import { IconoTipo } from "./iconos";
import { Aviso, Estado, botonSecundario, fechaCorta, haceDias } from "./ui";

// Dos formas de mostrar una gestión en una lista. Ninguna la cambia: las notas,
// los cierres y las correcciones se hacen en su pantalla de seguimiento.

const paciente = (g: GestionTSCE) => (
  <span className="block text-[15px] font-semibold leading-snug text-slate-900 dark:text-white">
    {g.paciente}
    {g.expediente && <span className="ml-2 font-mono text-xs font-bold text-blue-700 dark:text-cyan-300">{g.expediente}</span>}
  </span>
);

const resumen = (g: GestionTSCE, hoy: string) => (
  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
    {fechaCorta(g.fecha)} · {g.creadoPorNombre} · {g.totalNotas} {g.totalNotas === 1 ? "nota" : "notas"}
    {g.estado === "en_proceso" && <> · último movimiento {haceDias(diasSinMovimiento(g, hoy))}</>}
    {g.estado !== "en_proceso" && g.fechaCierre && <> · cerrada {fechaCorta(g.fechaCierre)}</>}
    {(g.adjuntos?.length ?? 0) > 0 && <> · {g.adjuntos.length} {g.adjuntos.length === 1 ? "adjunto" : "adjuntos"}</>}
  </span>
);

/** Fila que abre el seguimiento de la gestión. La usan las listas de quien registra. */
export function FilaGestion({ gestion: g, hoy, mostrarPaciente = true, conEstado = false }: {
  gestion: GestionTSCE;
  hoy: string;
  mostrarPaciente?: boolean;
  /** En la lista de las que están en proceso el estado sobra; ahí solo se marca la que lleva días quieta. */
  conEstado?: boolean;
}) {
  const quieta = g.estado === "en_proceso" && diasSinMovimiento(g, hoy) >= DIAS_SIN_MOVIMIENTO;
  const marca = conEstado
    ? <Estado estado={g.estado} />
    : quieta && <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Sin movimiento</span>;
  return (
    <li>
      <Link
        prefetch={false}
        href={RUTAS_TS.gestion(g.id)}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 sm:flex">
          <IconoTipo tipo={g.tipo} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          {mostrarPaciente && paciente(g)}
          <span className={`block ${mostrarPaciente ? "text-sm text-slate-700 dark:text-slate-200" : "text-[15px] font-semibold text-slate-900 dark:text-white"}`}>{tituloGestion(g)}</span>
          {resumen(g, hoy)}
          {/* En celular la marca baja al texto: a la derecha lo dejaba en una columna angosta. */}
          {marca && <span className="mt-1.5 flex sm:hidden">{marca}</span>}
        </span>
        {marca && <span className="hidden flex-shrink-0 sm:flex">{marca}</span>}
        <ChevronRight size={16} className="flex-shrink-0 text-slate-400" aria-hidden="true" />
      </Link>
    </li>
  );
}

interface Props {
  gestion: GestionTSCE;
  hoy: string;
  /** Notas ya leídas (bitácora); si no, se leen al abrir. */
  notas?: NotaTSCE[];
  abiertaInicial?: boolean;
  mostrarPaciente?: boolean;
}

/** Gestión que se despliega para leer su evolución. La usan la bitácora y la productividad. */
export function TarjetaGestion({ gestion: g, hoy, notas: notasIniciales, abiertaInicial = false, mostrarPaciente = true }: Props) {
  const { llamar, registra } = useTS();
  const [abierta, setAbierta] = useState(abiertaInicial);
  const [leidas, setLeidas] = useState<NotaTSCE[] | null>(notasIniciales ?? null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");

  const leerNotas = async () => {
    setLeyendo(true);
    setError("");
    try {
      setLeidas((await llamar<{ notas: NotaTSCE[] }>(`/notas?gestion=${encodeURIComponent(g.id)}`)).notas);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setLeyendo(false);
    }
  };

  const alternar = () => {
    if (!abierta && !leidas) void leerNotas();
    setAbierta(!abierta);
  };

  return (
    <li>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierta}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <span className="min-w-0 flex-1">
          {mostrarPaciente && paciente(g)}
          <span className={`block ${mostrarPaciente ? "text-sm text-slate-700 dark:text-slate-200" : "text-[15px] font-semibold text-slate-900 dark:text-white"}`}>{tituloGestion(g)}</span>
          {resumen(g, hoy)}
        </span>
        <Estado estado={g.estado} />
        <ChevronDown size={16} className={`mt-1 flex-shrink-0 text-slate-400 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {abierta && (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/30">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold">Área:</span> {nombreArea(g.area)}
            {g.medico && <> · <span className="font-semibold">Médico:</span> {g.medico}</>}
            {g.procedencia === "red" && <> · <span className="font-semibold">Procedencia:</span> {g.establecimiento}</>}
            {g.poblacion.length > 0 && <> · {g.poblacion.map(labelPoblacion).join(", ")}</>}
            {g.origen === "manual" && <> · paciente escrito a mano</>}
          </p>

          {g.estado === "no_procede" && <Aviso tipo="alerta"><span className="font-semibold">No procede:</span> {g.motivoNoProcede}</Aviso>}
          {leyendo && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" aria-hidden="true" />Leyendo las notas…</p>}
          {error && <Aviso tipo="error">{error}</Aviso>}
          {leidas && <Evolucion gestion={g} notas={leidas} hoy={hoy} />}
          <AdjuntosGestion gestion={g} />

          {registra && (
            <div className="flex justify-end">
              <Link prefetch={false} href={RUTAS_TS.gestion(g.id)} className={`${botonSecundario} bg-white dark:bg-slate-900`}>
                {g.estado === "en_proceso" ? "Dar seguimiento" : "Abrir la gestión"}<ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
