"use client";

// Piezas visuales del tablero de censos. Las barras muestran siempre su cifra:
// el dato no depende de pasar el mouse, que en celular no existe. El color solo
// significa algo: un tono para cantidades, rampa para escalas y los colores de
// estado únicamente donde el formulario ya los usa (triage, condición).

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LucideIcon } from "lucide-react";
import { GRUPOS_EDAD, SIN_DATO } from "@/lib/emergencia/resumenCenso";

export const MARCA = "bg-blue-700 dark:bg-cyan-400";
export const MARCA_SIN_DATO = "bg-slate-300 dark:bg-slate-600";
// Validada con 4 pasos: con más, los tonos vecinos dejan de distinguirse.
export const RAMPA = [
  "bg-blue-400 dark:bg-cyan-700",
  "bg-blue-500 dark:bg-cyan-600",
  "bg-blue-600 dark:bg-cyan-400",
  "bg-blue-800 dark:bg-cyan-300",
];
const FEMENINO = "bg-blue-800 dark:bg-cyan-300";
const MASCULINO = "bg-cyan-600 dark:bg-cyan-600";

export const cifra = (n: number) => n.toLocaleString("es-SV");

export function porcentaje(n: number, total: number) {
  if (!total || !n) return "0 %";
  const p = (n / total) * 100;
  return p < 1 ? "< 1 %" : `${Math.round(p)} %`;
}

export interface FilaDato {
  etiqueta: string;
  valor: number;
  clase?: string;
}

export function Tarjeta({ titulo, subtitulo, className = "", children }: {
  titulo: string;
  subtitulo?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm shadow-slate-900/5 ${className}`}>
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-heading">{titulo}</h2>
      {subtitulo && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitulo}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const TONO_KPI = {
  neutro: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  critico: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

export function Kpi({ etiqueta, valor, detalle, icon: Icon, tono = "neutro" }: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  icon: LucideIcon;
  tono?: keyof typeof TONO_KPI;
}) {
  return (
    <div className="min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm shadow-slate-900/5">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONO_KPI[tono]}`}>
          <Icon size={14} />
        </span>
        <p className="min-w-0 text-xs font-medium leading-tight text-slate-500 dark:text-slate-400">{etiqueta}</p>
      </div>
      <p className="mt-2 text-2xl font-bold leading-none text-slate-900 dark:text-slate-100 font-heading">{valor}</p>
      {detalle && <p className="mt-1.5 text-xs leading-snug text-slate-500 dark:text-slate-400">{detalle}</p>}
    </div>
  );
}

const SinRegistros = () => <p className="py-6 text-center text-sm text-slate-400">Sin registros en el periodo.</p>;

/** Barras horizontales: lista larga plegada, con su Sin dato aparte para no encabezar el ranking. */
export function Barras({ filas, total, sinDato = 0, maximo = 8 }: {
  filas: FilaDato[];
  total: number;
  sinDato?: number;
  maximo?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const mayor = Math.max(1, ...filas.map((f) => f.valor));
  const visibles = abierto ? filas : filas.slice(0, maximo);
  if (filas.length === 0 && !sinDato) return <SinRegistros />;
  return (
    <div className="space-y-2.5">
      {visibles.map((f) => (
        <div key={f.etiqueta}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 break-words text-slate-700 dark:text-slate-300">{f.etiqueta}</span>
            <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{cifra(f.valor)}</span> · {porcentaje(f.valor, total)}
            </span>
          </div>
          <div className="mt-1 h-2">
            <div
              className={`h-full rounded-r ${f.clase ?? MARCA}`}
              style={{ width: `${Math.max((f.valor / mayor) * 100, f.valor ? 1 : 0)}%` }}
            />
          </div>
        </div>
      ))}
      {filas.length > maximo && (
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          className="text-xs font-medium text-blue-700 dark:text-cyan-300 hover:underline"
        >
          {abierto ? "Ver menos" : `Ver los ${filas.length}`}
        </button>
      )}
      {sinDato > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">{cifra(sinDato)} sin dato ({porcentaje(sinDato, total)})</p>}
    </div>
  );
}

/** Una parte del total en una sola barra. La cifra va dentro solo si cabe; la leyenda siempre la trae. */
export function BarraSegmentada({ partes, total }: {
  partes: (FilaDato & { textoClase?: string })[];
  total: number;
}) {
  const visibles = partes.filter((p) => p.valor > 0);
  if (visibles.length === 0) return <SinRegistros />;
  return (
    <div>
      <div className="flex h-7 gap-0.5" role="img" aria-label={visibles.map((p) => `${p.etiqueta}: ${p.valor}`).join(", ")}>
        {visibles.map((p) => {
          const parte = (p.valor / total) * 100;
          return (
            <div
              key={p.etiqueta}
              title={`${p.etiqueta}: ${cifra(p.valor)}`}
              className={`flex min-w-0 items-center overflow-hidden rounded px-1.5 text-xs font-semibold ${p.clase ?? MARCA} ${p.textoClase ?? "text-white dark:text-slate-950"}`}
              style={{ flexGrow: p.valor, flexBasis: 0 }}
            >
              {parte >= 14 && `${Math.round(parte)} %`}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 space-y-1.5">
        {visibles.map((p) => (
          <li key={p.etiqueta} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-300">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${p.clase ?? MARCA}`} />
              <span className="min-w-0 break-words">{p.etiqueta}</span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{cifra(p.valor)}</span> · {porcentaje(p.valor, total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pirámide de edades: los mayores arriba, con la cifra junto a cada barra. */
export function Piramide({ conteo = {}, sexo = {} }: {
  conteo?: Record<string, number>;
  sexo?: Record<string, number>;
}) {
  const grupos = [...GRUPOS_EDAD].reverse().map((g) => ({
    grupo: g,
    femenino: conteo[`${g}|femenino`] ?? 0,
    masculino: conteo[`${g}|masculino`] ?? 0,
  }));
  const mayor = Math.max(1, ...grupos.flatMap((g) => [g.femenino, g.masculino]));
  const ubicados = grupos.reduce((s, g) => s + g.femenino + g.masculino, 0);
  const total = Object.values(conteo).reduce((s, n) => s + n, 0);
  if (total === 0) return <SinRegistros />;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
        <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${FEMENINO}`} />Femenino <strong className="font-semibold text-slate-900 dark:text-slate-100">{cifra(sexo.femenino ?? 0)}</strong></span>
        <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${MASCULINO}`} />Masculino <strong className="font-semibold text-slate-900 dark:text-slate-100">{cifra(sexo.masculino ?? 0)}</strong></span>
      </div>
      <div className="space-y-1.5">
        {grupos.map((g) => (
          <div key={g.grupo} className="grid grid-cols-[1fr_3rem_1fr] items-center gap-1.5 text-xs">
            <div className="flex items-center justify-end gap-1.5">
              <span className="tabular-nums text-slate-500 dark:text-slate-400">{cifra(g.femenino)}</span>
              <div className="min-w-0 flex-1">
                <div className={`ml-auto h-3 rounded-l ${FEMENINO}`} style={{ width: `${(g.femenino / mayor) * 100}%` }} />
              </div>
            </div>
            <span className="text-center font-medium tabular-nums text-slate-600 dark:text-slate-300">{g.grupo}</span>
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <div className={`h-3 rounded-r ${MASCULINO}`} style={{ width: `${(g.masculino / mayor) * 100}%` }} />
              </div>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">{cifra(g.masculino)}</span>
            </div>
          </div>
        ))}
      </div>
      {total > ubicados && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{cifra(total - ubicados)} sin edad o sexo</p>}
    </div>
  );
}

function TooltipEvolucion({ active, payload, label }: {
  active?: boolean;
  payload?: readonly { value?: unknown }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <p className="font-semibold text-slate-900 dark:text-slate-100">{cifra(Number(payload[0].value))}</p>
      <p className="text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

export function Evolucion({ puntos }: { puntos: { etiqueta: string; valor: number }[] }) {
  if (puntos.every((p) => p.valor === 0)) return <SinRegistros />;
  return (
    <div className="[--marca-tablero:var(--color-blue-700)] dark:[--marca-tablero:var(--color-cyan-400)]">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={puntos} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} minTickGap={12} tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <YAxis allowDecimals={false} tickFormatter={cifra} tickLine={false} axisLine={false} width={44} tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <Tooltip cursor={{ fill: "rgba(148, 163, 184, 0.15)" }} content={TooltipEvolucion} />
            <Bar dataKey="valor" fill="var(--marca-tablero)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        <summary className="cursor-pointer select-none">Ver las cifras</summary>
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
          {puntos.map((p) => (
            <div key={p.etiqueta} className="rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-800/60">
              <span className="block">{p.etiqueta}</span>
              <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{cifra(p.valor)}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

/** Separa el Sin dato de lo que sí se puede ordenar. */
export function filasDe(conteo: Record<string, number> = {}, etiquetas: Record<string, string> = {}) {
  return {
    filas: Object.entries(conteo)
      .filter(([clave]) => clave !== SIN_DATO)
      .map(([clave, valor]): FilaDato => ({ etiqueta: etiquetas[clave] ?? clave, valor }))
      .sort((a, b) => b.valor - a.valor || a.etiqueta.localeCompare(b.etiqueta, "es")),
    sinDato: conteo[SIN_DATO] ?? 0,
  };
}
