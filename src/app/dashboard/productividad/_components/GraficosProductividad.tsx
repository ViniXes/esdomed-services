"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const PALETA_PRODUCTIVIDAD = ["#3b82f6", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#06b6d4", "#84cc16", "#ec4899"];

export interface PuntoDato {
  nombre: string;
  valor: number;
}

const tarjetaCls = "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4";
const gridCls = "stroke-slate-200 dark:stroke-slate-700";
const ejeTick = { fill: "#94a3b8" };

function tooltipStyle() {
  return {
    contentStyle: { backgroundColor: "var(--tw-tooltip-bg, #0f172a)", border: "none", borderRadius: 8, fontSize: 12 },
    itemStyle: { color: "#f1f5f9" },
    labelStyle: { color: "#f1f5f9" },
  };
}

/**
 * Uses the golden angle so each extra person receives a visibly different
 * colour instead of cycling through the eight colours used by bar charts.
 */
function colorDePersona(index: number): string {
  return `hsl(${Math.round((index * 137.508) % 360)} 74% 52%)`;
}

export function GraficoPastel({ titulo, datos }: { titulo: string; datos: PuntoDato[] }) {
  const [nombreSeleccionado, setNombreSeleccionado] = useState<string | null>(null);
  const conDatos = datos.filter(d => d.valor > 0);
  const total = conDatos.reduce((suma, dato) => suma + dato.valor, 0);
  const indiceSeleccionado = conDatos.findIndex(dato => dato.nombre === nombreSeleccionado);
  const seleccionado = indiceSeleccionado >= 0 ? conDatos[indiceSeleccionado] : null;
  const porcentajeSeleccionado = seleccionado ? Math.round((seleccionado.valor / total) * 100) : 0;
  const datosVisuales = seleccionado
    ? [
        seleccionado,
        ...(total > seleccionado.valor ? [{ nombre: "Resto del equipo", valor: total - seleccionado.valor }] : []),
      ]
    : conDatos;

  const seleccionarPersona = (nombre: string) => {
    setNombreSeleccionado(actual => actual === nombre ? null : nombre);
  };

  return (
    <div className={tarjetaCls}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{titulo}</p>
        {conDatos.length > 0 && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {total} total
          </span>
        )}
      </div>
      {conDatos.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16">Sin datos en el periodo.</p>
      ) : (
        <>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={datosVisuales} dataKey="valor" nameKey="nombre" innerRadius={58} outerRadius={94} paddingAngle={1.5} stroke="var(--tw-pie-stroke, #fff)" strokeWidth={1}>
                  {datosVisuales.map((entrada, index) => (
                    <Cell key={entrada.nombre} fill={seleccionado ? index === 0 ? colorDePersona(indiceSeleccionado) : "#cbd5e1" : colorDePersona(index)} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle()} formatter={(valor?: number | string | readonly (number | string)[]) => [`${valor ?? 0}`, "Registros"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {seleccionado && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 dark:border-blue-900/60 dark:bg-blue-950/30">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-100" title={seleccionado.nombre}>{seleccionado.nombre}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400"><span className="font-bold tabular-nums text-blue-700 dark:text-blue-300">{seleccionado.valor} registros</span> · {porcentajeSeleccionado}% del total</p>
              </div>
              <button type="button" onClick={() => setNombreSeleccionado(null)} className="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100">
                Ver todas
              </button>
            </div>
          )}

          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Detalle por persona · toca un nombre para enfocarlo</p>
            <div className="grid max-h-44 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2" aria-label={`Detalle de ${titulo}`}>
              {conDatos.map((entrada, index) => {
                const porcentaje = Math.round((entrada.valor / total) * 100);
                const esSeleccionado = seleccionado?.nombre === entrada.nombre;
                return (
                  <button
                    key={entrada.nombre}
                    type="button"
                    onClick={() => seleccionarPersona(entrada.nombre)}
                    aria-pressed={esSeleccionado}
                    aria-label={esSeleccionado ? `Quitar filtro de ${entrada.nombre}` : `Enfocar ${entrada.nombre} en la gráfica`}
                    className={`flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors ${esSeleccionado ? "bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:ring-blue-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorDePersona(index) }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300" title={entrada.nombre}>{entrada.nombre}</span>
                    <span className="shrink-0 font-bold tabular-nums text-slate-700 dark:text-slate-100">{entrada.valor}</span>
                    <span className="w-8 shrink-0 text-right tabular-nums text-slate-400">{porcentaje}%</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function GraficoBarras({ titulo, datos, color = PALETA_PRODUCTIVIDAD[0], sufijo = "" }: { titulo: string; datos: PuntoDato[]; color?: string; sufijo?: string }) {
  const conDatos = datos.filter(d => d.valor > 0);
  return (
    <div className={tarjetaCls}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">{titulo}</p>
      {conDatos.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16">Sin datos en el periodo.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(180, conDatos.length * 40)}>
          <BarChart data={conDatos} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className={gridCls} />
            <XAxis type="number" tick={{ ...ejeTick, fontSize: 11 }} allowDecimals={false} />
            <YAxis type="category" dataKey="nombre" width={140} tick={{ ...ejeTick, fontSize: 11 }} />
            <Tooltip {...tooltipStyle()} formatter={(valor?: number | string | readonly (number | string)[]) => [`${valor ?? 0}${sufijo}`, ""]} />
            <Bar dataKey="valor" fill={color} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function GraficoBarrasHorizontalCorto({ titulo, datos, color = PALETA_PRODUCTIVIDAD[0] }: { titulo: string; datos: PuntoDato[]; color?: string }) {
  return (
    <div className={tarjetaCls}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">{titulo}</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={datos} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className={gridCls} />
          <XAxis dataKey="nombre" tick={{ ...ejeTick, fontSize: 11 }} />
          <YAxis tick={{ ...ejeTick, fontSize: 11 }} allowDecimals={false} />
          <Tooltip {...tooltipStyle()} />
          <Bar dataKey="valor" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const MESES_MONITOREO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export interface RegistroMonitoreo {
  nombre: string;
  fecha: Date;
}

export function TarjetaMonitoreoHorario({
  titulo,
  registros,
  datos,
  mostrarHoras = false,
  color = PALETA_PRODUCTIVIDAD[0],
}: {
  titulo: string;
  registros: RegistroMonitoreo[];
  /** La gráfica a mostrar: franjas horarias o conteo por día, ya decidido por la página. */
  datos: PuntoDato[];
  /** Revela la tabla de horas exactas (checkbox de la pagina). Solo tiene sentido cuando hay una persona filtrada. */
  mostrarHoras?: boolean;
  color?: string;
}) {
  const ordenados = [...registros].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  const totalMes = registros.length;

  return (
    <div className={tarjetaCls}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{titulo}</p>
        <p className="shrink-0 text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
          {totalMes} <span className="text-[10px] font-normal uppercase text-slate-400">en el mes</span>
        </p>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={datos} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className={gridCls} />
          <XAxis dataKey="nombre" tick={{ ...ejeTick, fontSize: 9 }} interval={0} />
          <YAxis tick={{ ...ejeTick, fontSize: 11 }} allowDecimals={false} />
          <Tooltip {...tooltipStyle()} />
          <Bar dataKey="valor" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {mostrarHoras && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
          {ordenados.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">Sin registros en el periodo.</p>
          ) : (
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                  <th className="text-left px-2 py-1.5 font-semibold text-slate-500 dark:text-slate-400">Nombre</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-slate-500 dark:text-slate-400">Hora</th>
                  <th className="text-center px-2 py-1.5 font-semibold text-slate-500 dark:text-slate-400">Año</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-slate-500 dark:text-slate-400">Mes</th>
                  <th className="text-center px-2 py-1.5 font-semibold text-slate-500 dark:text-slate-400">Día</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {ordenados.map((registro, index) => (
                  <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">{registro.nombre}</td>
                    <td className="px-2 py-1.5 tabular-nums text-slate-500 dark:text-slate-400">{registro.fecha.toLocaleTimeString("es-SV", { hour12: false })}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums text-slate-500 dark:text-slate-400">{registro.fecha.getFullYear()}</td>
                    <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">{MESES_MONITOREO[registro.fecha.getMonth()]}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums text-slate-500 dark:text-slate-400">{registro.fecha.getDate()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
