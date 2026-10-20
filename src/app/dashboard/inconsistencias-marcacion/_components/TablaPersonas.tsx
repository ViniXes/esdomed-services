"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  desgloseMinutos,
  formatoDinero,
  formatoDuracion,
  indiceDiaSemana,
  DIAS_SEMANA_CORTOS,
  TIPO_INCIDENCIA_LABEL,
  type DiaConContexto,
  type ResumenPersona,
} from "@/lib/inconsistenciasMarcacion/analisis";
import { useColoresGrafica } from "./Graficos";

const fechaCorta = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${DIAS_SEMANA_CORTOS[indiceDiaSemana(iso)]} ${d}/${m}`;
};

/**
 * Ranking por persona (de mayor a menor descuento). Es también la vista en
 * tabla de las gráficas: cada fila se despliega con sus días.
 */
export function TablaPersonas({
  personas,
  mesesEnAlcance,
}: {
  personas: ResumenPersona[];
  /** >1 en "Todo el año": muestra la columna de meses con descuento. */
  mesesEnAlcance: number;
}) {
  const c = useColoresGrafica();
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const maximo = Math.max(...personas.map((p) => p.total), 0.01);
  const varios = mesesEnAlcance > 1;

  const alternar = (codigo: string) =>
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(codigo)) s.delete(codigo);
      else s.add(codigo);
      return s;
    });

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">
          Por persona
          <span className="ml-2 font-normal text-slate-400">· de mayor a menor descuento · toca una fila para ver sus días</span>
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <Th>Persona</Th>
              <Th center>Días</Th>
              <Th center>Marcas olvidadas</Th>
              <Th center>Sin marca</Th>
              <Th center>Tardanza / salida temprana</Th>
              {varios && <Th center>Meses</Th>}
              <Th right>Descontado</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {personas.map((p) => {
              const abierto = abiertos.has(p.codigoMarcacion);
              const olvidadas = p.porTipo.omision_entrada.eventos + p.porTipo.omision_salida.eventos;
              const Chevron = abierto ? ChevronDown : ChevronRight;
              return (
                <Fragment key={p.codigoMarcacion}>
                  <tr
                    onClick={() => alternar(p.codigoMarcacion)}
                    className={`cursor-pointer transition-colors ${abierto ? "bg-blue-50/60 dark:bg-blue-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}`}
                  >
                    <td className="min-w-[18rem] px-4 py-2.5">
                      <button
                        type="button"
                        aria-expanded={abierto}
                        className="flex items-start gap-2 text-left"
                        onClick={(e) => {
                          e.stopPropagation();
                          alternar(p.codigoMarcacion);
                        }}
                      >
                        <Chevron size={15} className="mt-0.5 shrink-0 text-slate-400" />
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-800 dark:text-slate-200">{p.nombre}</span>
                          <span className="block text-xs text-slate-500">
                            <span className="font-mono">{p.codigoMarcacion}</span> · {p.plaza}
                          </span>
                        </span>
                      </button>
                    </td>
                    <Td>{p.dias.length}</Td>
                    <Td>{olvidadas || "—"}</Td>
                    <Td>{p.porTipo.sin_marcacion.eventos || "—"}</Td>
                    <Td>{p.porTipo.minutos.eventos ? formatoDuracion(p.porTipo.minutos.minutos) : "—"}</Td>
                    {varios && <Td>{p.meses.length} de {mesesEnAlcance}</Td>}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-3">
                        <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 sm:block" aria-hidden="true">
                          <div className="h-full rounded-full" style={{ width: `${(p.total / maximo) * 100}%`, background: c.unica }} />
                        </div>
                        <span className="w-20 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatoDinero(p.total)}</span>
                      </div>
                    </td>
                  </tr>
                  {abierto && (
                    <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                      <td colSpan={varios ? 7 : 6} className="px-4 pb-4 pt-1">
                        <DetalleDias dias={p.dias} conMes={varios} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetalleDias({ dias, conMes }: { dias: DiaConContexto[]; conMes: boolean }) {
  const ordenados = [...dias].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
            <th className="px-3 py-2 text-left font-semibold">{conMes ? "Fecha" : "Día"}</th>
            <th className="px-3 py-2 text-left font-semibold">Horario</th>
            <th className="px-3 py-2 text-left font-semibold">Entrada</th>
            <th className="px-3 py-2 text-left font-semibold">Salida</th>
            <th className="px-3 py-2 text-left font-semibold">Incidencia</th>
            <th className="px-3 py-2 text-right font-semibold">Tiempo</th>
            <th className="px-3 py-2 text-right font-semibold">Monto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {ordenados.map((d) => {
            const { tarde, temprano } = desgloseMinutos(d);
            return (
              <tr key={`${d.periodo}-${d.fecha}-${d.horario}`}>
                <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">
                  {fechaCorta(d.fecha)}{conMes && <span className="text-slate-400">/{d.fecha.slice(2, 4)}</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums text-slate-500">{d.horario}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Marca hora={d.entrada} desvio={tarde ? `+${tarde} min` : null} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Marca hora={d.salida} desvio={temprano ? `−${temprano} min` : null} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{etiquetaIncidencia(d.tipo, tarde, temprano)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300">{formatoDuracion(d.minutos)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatoDinero(d.monto)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** En los días de minutos dice qué pasó según el horario (estimación); si no, el tipo. */
function etiquetaIncidencia(tipo: DiaConContexto["tipo"], tarde: number, temprano: number): string {
  if (tipo !== "minutos") return TIPO_INCIDENCIA_LABEL[tipo];
  if (tarde && temprano) return "Llegó tarde y salió antes";
  if (tarde) return "Llegó tarde";
  if (temprano) return "Salió antes de hora";
  return TIPO_INCIDENCIA_LABEL.minutos;
}

/** Hora marcada; "00:00" es que no hay marca (rose = error), y el desvío del horario va en amber. */
function Marca({ hora, desvio }: { hora: string; desvio: string | null }) {
  if (hora === "00:00") {
    return (
      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
        Sin marca
      </span>
    );
  }
  return (
    <span className="tabular-nums text-slate-700 dark:text-slate-300">
      {hora}
      {desvio && <span className="ml-1.5 font-semibold text-amber-700 dark:text-amber-400">{desvio}</span>}
    </span>
  );
}

function Th({ children, center, right }: { children: React.ReactNode; center?: boolean; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${center ? "text-center" : right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-400">{children}</td>;
}
