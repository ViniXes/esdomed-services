"use client";

import {
  Bar, BarChart, CartesianGrid, LabelList, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps,
} from "recharts";
import { useTheme } from "@/contexts/ThemeContext";
import { DIAS_SEMANA_CORTOS, formatoDinero, type Contador } from "@/lib/inconsistenciasMarcacion/analisis";

// Paleta de las gráficas, de las rampas institucionales (blue = azul HNES,
// cyan = acento). Validada con el checker de daltonismo (ΔE ≥ 21 entre las dos
// series en ambos modos). El azul HNES es poco saturado a propósito: no pasa
// el piso de croma genérico, por eso cada gráfica lleva leyenda y la tabla por
// persona es su equivalente legible.
export const COLORES_GRAFICA = {
  light: { turno: "#245d7c", minutos: "#45aac6", unica: "#2f7092", grid: "#e2e8f0", eje: "#94a3b8", cursor: "rgba(15,23,42,0.05)", superficie: "#ffffff" },
  dark: { turno: "#4b93b5", minutos: "#9fd7e6", unica: "#7ab4cf", grid: "#1e293b", eje: "#64748b", cursor: "rgba(255,255,255,0.05)", superficie: "#0f172a" },
};

export function useColoresGrafica() {
  const { dark } = useTheme();
  return dark ? COLORES_GRAFICA.dark : COLORES_GRAFICA.light;
}

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const tarjetaCls = "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4";
const tooltipCls =
  "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs shadow-lg";

export function Leyenda({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

const dineroCorto = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`);

// ─── Descuento por mes (columnas apiladas: turno completo + minutos) ─────────

export interface PuntoMes {
  periodo: string;
  mes: number;
  total: number;
  turnoCompleto: number;
  minutos: number;
  personas: number;
}

export function GraficoMeses({
  datos,
  seleccionado,
  onSeleccionar,
}: {
  datos: PuntoMes[];
  /** periodo resaltado; null = todos con el mismo peso */
  seleccionado: string | null;
  onSeleccionar: (periodo: string) => void;
}) {
  const c = useColoresGrafica();
  const filas = datos.map((d) => ({ ...d, etiqueta: MESES_CORTOS[d.mes - 1] }));
  const opacidad = (periodo: string) => (seleccionado && seleccionado !== periodo ? 0.35 : 1);

  return (
    <div className={tarjetaCls}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">Descuento por mes</h3>
          <p className="text-xs text-slate-500">Toca un mes para verlo en detalle</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Leyenda color={c.turno} label="Turno completo" />
          <Leyenda color={c.minutos} label="Minutos" />
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas} margin={{ top: 22, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="etiqueta" tick={{ fill: c.eje, fontSize: 12 }} axisLine={{ stroke: c.grid }} tickLine={false} />
            <YAxis tick={{ fill: c.eje, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={dineroCorto} width={52} />
            <Tooltip
              cursor={{ fill: c.cursor }}
              content={({ active, payload }) => {
                const p = active && payload?.[0] ? (payload[0].payload as PuntoMes & { etiqueta: string }) : null;
                if (!p) return null;
                return (
                  <div className={tooltipCls}>
                    <p className="mb-1 font-semibold text-slate-800 dark:text-slate-100">
                      {MESES_LARGOS[p.mes - 1]} · {formatoDinero(p.total)}
                    </p>
                    <FilaTooltip color={c.turno} label="Turno completo" valor={formatoDinero(p.turnoCompleto)} />
                    <FilaTooltip color={c.minutos} label="Minutos" valor={formatoDinero(p.minutos)} />
                    <p className="mt-1 text-slate-500">{p.personas} persona{p.personas === 1 ? "" : "s"}</p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="turnoCompleto"
              stackId="m"
              fill={c.turno}
              stroke={c.superficie}
              strokeWidth={1}
              maxBarSize={36}
              cursor="pointer"
              onClick={(d) => onSeleccionar(d.payload.periodo)}
              shape={(props: BarShapeProps) => <Rectangle {...props} fillOpacity={opacidad(props.payload.periodo)} />}
            />
            <Bar
              dataKey="minutos"
              stackId="m"
              fill={c.minutos}
              stroke={c.superficie}
              strokeWidth={1}
              maxBarSize={36}
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(d) => onSeleccionar(d.payload.periodo)}
              shape={(props: BarShapeProps) => <Rectangle {...props} fillOpacity={opacidad(props.payload.periodo)} />}
            >
              <LabelList
                dataKey="total"
                position="top"
                formatter={(v: unknown) => formatoDinero(Number(v))}
                style={{ fill: c.eje, fontSize: 11, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function FilaTooltip({ color, label, valor }: { color: string; label: string; valor: string }) {
  return (
    <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} aria-hidden="true" />
      <span className="flex-1">{label}</span>
      <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{valor}</span>
    </p>
  );
}

// ─── Días con incidencia por día de la semana (una sola serie) ───────────────

export function GraficoDiaSemana({ datos }: { datos: Contador[] }) {
  const c = useColoresGrafica();
  const filas = datos.map((d, i) => ({ dia: DIAS_SEMANA_CORTOS[i], eventos: d.eventos, monto: d.monto }));
  const total = datos.reduce((a, d) => a + d.eventos, 0);

  return (
    <div className={tarjetaCls}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">Días con incidencia por día de la semana</h3>
        <p className="text-xs text-slate-500">Según el día en que inicia el turno</p>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas} margin={{ top: 22, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="dia" tick={{ fill: c.eje, fontSize: 12 }} axisLine={{ stroke: c.grid }} tickLine={false} />
            <YAxis tick={{ fill: c.eje, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: c.cursor }}
              content={({ active, payload }) => {
                const p = active && payload?.[0] ? (payload[0].payload as (typeof filas)[number]) : null;
                if (!p) return null;
                return (
                  <div className={tooltipCls}>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{p.dia}</p>
                    <p className="text-slate-600 dark:text-slate-300">
                      {p.eventos} día{p.eventos === 1 ? "" : "s"} · {total ? Math.round((p.eventos / total) * 100) : 0}% · {formatoDinero(p.monto)}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="eventos" fill={c.unica} radius={[4, 4, 0, 0]} maxBarSize={28}>
              <LabelList dataKey="eventos" position="top" style={{ fill: c.eje, fontSize: 11, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
