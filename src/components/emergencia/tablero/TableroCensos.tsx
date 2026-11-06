"use client";

// Tablero de censos de emergencia: solo presentación. La carga de datos vive en
// la página, para que el mismo tablero se pueda probar con datos de ejemplo.

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, BarChart3, BookOpenText, Building2, ClipboardList, Clock, Loader2, RefreshCw,
} from "lucide-react";
import type { ResumenCensoMes, TipoCenso } from "@/types";
import {
  comparacionMensual, mesesDelTablero, serieDiaria, sumarResumenes,
} from "@/lib/emergencia/resumenCenso";
import type { DesajusteResumen } from "@/lib/emergencia/resumenCensoDatos";
import { cifra } from "@/components/emergencia/tablero/piezas";
import { VistaDemanda, VistaReferidos } from "@/components/emergencia/tablero/VistasCenso";

const TODO = "todo";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function nombreMes(mes: string, corto = false) {
  const [anio, m] = mes.split("-").map(Number);
  const nombre = MESES[m - 1];
  return corto ? `${nombre.slice(0, 3)} ${String(anio).slice(2)}` : `${nombre} ${anio}`;
}

function textoComparacion(c: ReturnType<typeof comparacionMensual>) {
  if (!c) return undefined;
  const sentido = c.cambioPct === 0 ? "Igual" : `${c.cambioPct > 0 ? "+" : ""}${c.cambioPct} %`;
  const base = c.enCurso ? "los mismos días de" : "";
  return `${sentido} vs ${base} ${nombreMes(c.mesPrevio).split(" ")[0]}`.replace(/\s+/g, " ");
}

const PESTANAS = [
  { tipo: "demanda", etiqueta: "Demanda espontánea", icon: ClipboardList },
  { tipo: "referidos", etiqueta: "Referidos", icon: Building2 },
] as const;

export function TableroCensos({
  tipo, onTipo, resumenes, desajustes, hoy, cargando, recalculando, error, leidoEn, verPersonal, onActualizar, onRecalcular,
}: {
  tipo: TipoCenso;
  onTipo: (t: TipoCenso) => void;
  resumenes: ResumenCensoMes[] | null;
  desajustes: DesajusteResumen[];
  hoy: string;
  cargando: boolean;
  recalculando: boolean;
  error: string | null;
  leidoEn: Date | null;
  verPersonal: boolean;
  onActualizar: () => void;
  onRecalcular: () => void;
}) {
  const mesActual = hoy.slice(0, 7);
  const meses = mesesDelTablero(mesActual);
  const [seleccion, setSeleccion] = useState(mesActual);

  const lista = resumenes ?? [];
  const elegidos = seleccion === TODO ? lista : lista.filter((r) => r.mes === seleccion);
  const resumen = sumarResumenes(elegidos);

  const porDia = seleccion !== TODO;
  const puntos = porDia
    ? serieDiaria(resumen.conteos, seleccion, hoy)
    : [...meses].reverse().map((m) => ({
        etiqueta: nombreMes(m, true),
        valor: lista.find((r) => r.mes === m)?.total ?? 0,
      }));
  const comparacion = porDia ? comparacionMensual(lista, seleccion, hoy) : null;

  const abiertos = resumen.conteos.estado?.abierto ?? 0;
  const faltantes = Object.entries(resumen.conteos.faltante ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([campo, n]) => `${campo} (${cifra(n)})`)
    .join(", ");

  const props = {
    resumen,
    puntos,
    subtituloEvolucion: porDia ? `Por día · ${nombreMes(seleccion)}` : "Por mes, desde noviembre de 2026",
    detalleTotal: textoComparacion(comparacion),
    verPersonal,
  };

  return (
    <div className="w-full p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-5 shadow-lg shadow-cyan-950/15 md:px-7 md:py-6">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
              <BarChart3 size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white md:text-2xl font-heading">Tablero de censos de emergencia</h1>
              <p className="mt-1 max-w-xl text-sm text-cyan-50/90">Se alimenta de cada censo guardado, desde noviembre de 2026.</p>
            </div>
          </div>
          <Link
            href="/medico/censos"
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/25 transition-colors hover:bg-white/20"
          >
            <BookOpenText size={16} /> Libro de censos
          </Link>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          {PESTANAS.map(({ tipo: t, etiqueta, icon: Icon }) => (
            <button
              key={t}
              type="button"
              onClick={() => onTipo(t)}
              aria-pressed={tipo === t}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tipo === t
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Icon size={14} className={tipo === t ? "text-cyan-600 dark:text-cyan-300" : ""} />
              {etiqueta}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {leidoEn && (
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {leidoEn.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/El_Salvador" })}
            </span>
          )}
          <button
            type="button"
            onClick={onActualizar}
            disabled={cargando}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {cargando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Actualizar
          </button>
        </div>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Periodo">
        {[...meses, ...(meses.length > 1 ? [TODO] : [])].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setSeleccion(m)}
            aria-pressed={seleccion === m}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium first-letter:uppercase transition-colors ${
              seleccion === m
                ? "border-blue-800 bg-blue-800 text-white dark:border-blue-700 dark:bg-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {m === TODO ? "Todo el periodo" : nombreMes(m)}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {desajustes.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle size={14} className="flex-shrink-0" />
          <span className="min-w-0 flex-1">
            El tablero no coincide con los censos: {desajustes.map((d) => `${nombreMes(d.mes)} tiene ${cifra(d.enResumen)} y hay ${cifra(d.enCensos)} registrados`).join("; ")}.
          </span>
          <button
            type="button"
            onClick={onRecalcular}
            disabled={recalculando}
            className="flex items-center gap-1.5 rounded-lg bg-amber-100 dark:bg-amber-900 px-2.5 py-1 text-xs font-semibold hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors disabled:opacity-50"
          >
            {recalculando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Recalcular
          </button>
        </div>
      )}

      {resumenes === null ? (
        !error && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )
      ) : resumen.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-14 text-center">
          <BarChart3 size={26} className="mx-auto text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100 font-heading">Todavía no hay atenciones en este periodo</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            El tablero se va llenando solo con cada censo que se guarda desde la cola de expedientes.
          </p>
          <Link href="/medico/cola-expedientes" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 dark:text-cyan-300 hover:underline">
            <ArrowLeft size={14} /> Ir a la cola de expedientes
          </Link>
        </div>
      ) : (
        <div className={`space-y-3 transition-opacity ${cargando ? "opacity-60" : ""}`}>
          {abiertos > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              <Clock size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong className="font-semibold">{cifra(abiertos)} por cerrar.</strong>{" "}
                Sus datos pendientes salen como Sin dato{faltantes ? `; lo que más falta: ${faltantes}` : ""}.
              </span>
            </p>
          )}
          {tipo === "demanda" ? <VistaDemanda {...props} /> : <VistaReferidos {...props} />}
        </div>
      )}
    </div>
  );
}
