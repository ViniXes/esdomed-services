"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

export function GraficoPastel({ titulo, datos }: { titulo: string; datos: PuntoDato[] }) {
  const conDatos = datos.filter(d => d.valor > 0);
  return (
    <div className={tarjetaCls}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">{titulo}</p>
      {conDatos.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16">Sin datos en el periodo.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={conDatos} dataKey="valor" nameKey="nombre" innerRadius={55} outerRadius={90} paddingAngle={2}>
              {conDatos.map((entrada, index) => (
                <Cell key={entrada.nombre} fill={PALETA_PRODUCTIVIDAD[index % PALETA_PRODUCTIVIDAD.length]} />
              ))}
            </Pie>
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11 }} />
            <Tooltip {...tooltipStyle()} />
          </PieChart>
        </ResponsiveContainer>
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
            <Tooltip {...tooltipStyle()} formatter={valor => [`${valor}${sufijo}`, ""]} />
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
