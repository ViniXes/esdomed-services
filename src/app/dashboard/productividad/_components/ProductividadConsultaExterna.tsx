"use client";

import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, Download, PieChart as IconoPastel, RefreshCw, Users } from "lucide-react";
import { esPersonalEvaluable } from "@/lib/productividad/personasNoEvaluables";
import {
  citaCuenta, claveNombre, conteoPorDia, productividadPorPersona, totalFilaCE, type FilaProductividadCE,
} from "@/lib/consultaExterna/productividad";
import { GraficoBarras, GraficoBarrasHorizontalCorto, GraficoPastel, type PuntoDato } from "./GraficosProductividad";
import { useProductividadCE } from "./useProductividadCE";

// Productividad de Consulta Externa: expedientes creados (reporte del SIS),
// actualizaciones de datos en el SIS y citas 2027 registradas, por persona. Aquí va el personal
// evaluable con producción en Consulta Externa (hoy, las digitadoras); lo que
// hicieron los administrativos sale en su pestaña, y los creadores del SIS sin
// usuario en services (p. ej. "SIS Referencia Retorno") no se evalúan.

type Vista = "resumen" | "graficos" | "dias";
const VISTAS: { id: Vista; label: string; icon: typeof BarChart3 }[] = [
  { id: "resumen", label: "Resumen", icon: BarChart3 },
  { id: "graficos", label: "Gráficos", icon: IconoPastel },
  { id: "dias", label: "Por día", icon: CalendarDays },
];
const COLUMNAS = [
  ["expedientes", "Expedientes creados"],
  ["nuevosPadron", "Nuevos en el padrón"],
  ["actualizaciones", "Actualizaciones"],
  ["identificacion", "Identificación"],
  ["responsable", "Responsable"],
  ["citas", "Citas registradas"],
] as const satisfies readonly (readonly [keyof FilaProductividadCE, string])[];
const COLOR_EXPEDIENTES = "#3b82f6";
const COLOR_ACTUALIZACIONES = "#06b6d4";
const COLOR_CITAS = "#1A4E70";

const selectCls = "appearance-none rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const botonCls = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";
const mesActual = () => { const f = new Date(); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`; };

export function ProductividadConsultaExterna({ activa, personalAdministrativo }: { activa: boolean; personalAdministrativo: string[] }) {
  const [mes, setMes] = useState(mesActual);
  const [vista, setVista] = useState<Vista>("resumen");
  const [persona, setPersona] = useState("todas");
  const { registros, actualizaciones, citas, cargando, error, recargar } = useProductividadCE(mes, activa);

  const { filas, fuera, sinUsuario } = useMemo(() => {
    const prod = productividadPorPersona(registros, actualizaciones, citas);
    const administrativos = new Set(personalAdministrativo.map(claveNombre));
    const filasCE = prod.filas.filter((f) => esPersonalEvaluable(f.nombre) && !administrativos.has(claveNombre(f.nombre)));
    const otras = prod.filas.filter((f) => !filasCE.includes(f));
    return {
      filas: filasCE,
      fuera: { expedientes: otras.reduce((s, f) => s + f.expedientes, 0), actualizaciones: otras.reduce((s, f) => s + f.actualizaciones, 0), citas: otras.reduce((s, f) => s + f.citas, 0) },
      sinUsuario: prod.sinUsuario,
    };
  }, [registros, actualizaciones, citas, personalAdministrativo]);

  const claves = useMemo(() => new Set(filas.map((f) => f.clave)), [filas]);
  const elegidas = persona === "todas" ? claves : new Set([persona]);
  const fechasExpedientes = registros.filter((r) => r.creadoPorUid && elegidas.has(r.creadoPorUid)).map((r) => r.fechaCreacion);
  const fechasActualizaciones = actualizaciones.filter((a) => elegidas.has(a.hechoPor)).map((a) => a.fecha);
  const fechasCitas = citas.filter((c) => citaCuenta(c) && elegidas.has(c.creadaPor)).map((c) => c.fecha);
  const aPuntos = (d: { dia: number; valor: number }[]): PuntoDato[] => d.map(({ dia, valor }) => ({ nombre: String(dia), valor }));

  const totales = filas.reduce(
    (t, f) => ({ expedientes: t.expedientes + f.expedientes, nuevosPadron: t.nuevosPadron + f.nuevosPadron, actualizaciones: t.actualizaciones + f.actualizaciones, identificacion: t.identificacion + f.identificacion, responsable: t.responsable + f.responsable, citas: t.citas + f.citas }),
    { expedientes: 0, nuevosPadron: 0, actualizaciones: 0, identificacion: 0, responsable: 0, citas: 0 },
  );

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const hoja = XLSX.utils.aoa_to_sheet([
      ["Productividad Consulta Externa", mes],
      [],
      ["Nombre", ...COLUMNAS.map(([, label]) => label), "Total"],
      ...filas.map((f) => [f.nombre, ...COLUMNAS.map(([id]) => f[id]), totalFilaCE(f)]),
    ]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Consulta Externa");
    XLSX.writeFile(libro, `productividad_consulta_externa_${mes}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="Mes" type="month" value={mes} onChange={(e) => { if (e.target.value) { setMes(e.target.value); setPersona("todas"); } }} className={selectCls} />
        <button type="button" onClick={() => void recargar()} disabled={cargando} className={`ml-auto ${botonCls}`}>
          <RefreshCw size={15} className={cargando ? "animate-spin" : ""} />Actualizar
        </button>
        {!cargando && filas.length > 0 && (
          <button type="button" onClick={() => void exportar()} className={botonCls}><Download size={15} />Exportar Excel</button>
        )}
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{error}</p>}

      {cargando ? <p className="py-16 text-center text-sm text-slate-400">Cargando...</p> : (
        <>
          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-white/80 p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            {VISTAS.map((item) => (
              <button key={item.id} type="button" onClick={() => setVista(item.id)}
                className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold transition-all sm:text-sm ${vista === item.id ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"}`}>
                <item.icon size={15} className="shrink-0" />{item.label}
              </button>
            ))}
          </div>

          {vista === "resumen" && (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                <Tarjeta label="Expedientes creados" valor={totales.expedientes} barra="bg-blue-500" />
                <Tarjeta label="Nuevos en el padrón" valor={totales.nuevosPadron} barra="bg-blue-300" />
                <Tarjeta label="Actualizaciones" valor={totales.actualizaciones} barra="bg-cyan-500" />
                <Tarjeta label="Con identificación" valor={totales.identificacion} barra="bg-cyan-400" />
                <Tarjeta label="Con responsable" valor={totales.responsable} barra="bg-cyan-300" />
                <Tarjeta label="Citas registradas" valor={totales.citas} barra="bg-blue-700" />
              </div>
              <TablaResumen filas={filas} />
            </>
          )}

          {vista === "graficos" && (
            <div className="grid gap-4 xl:grid-cols-2">
              <GraficoPastel titulo="Expedientes creados por persona" datos={filas.map((f) => ({ nombre: f.nombre, valor: f.expedientes }))} />
              <GraficoBarras titulo="Actualizaciones por persona" datos={filas.map((f) => ({ nombre: f.nombre, valor: f.actualizaciones }))} color={COLOR_ACTUALIZACIONES} />
              <GraficoBarras titulo="Citas registradas por persona" datos={filas.map((f) => ({ nombre: f.nombre, valor: f.citas }))} color={COLOR_CITAS} />
              <GraficoPastel titulo="Actualizaciones por tipo" datos={[{ nombre: "Identificación", valor: totales.identificacion }, { nombre: "Responsable", valor: totales.responsable }]} />
              <GraficoBarras titulo="Total por persona (expedientes + actualizaciones + citas)" datos={filas.map((f) => ({ nombre: f.nombre, valor: totalFilaCE(f) }))} color={COLOR_EXPEDIENTES} />
            </div>
          )}

          {vista === "dias" && (
            <>
              <label className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-500">Ver:</span>
                <select value={persona} onChange={(e) => setPersona(e.target.value)} className={selectCls}>
                  <option value="todas">Todas las personas</option>
                  {filas.map((f) => <option key={f.clave} value={f.clave}>{f.nombre}</option>)}
                </select>
              </label>
              <div className="grid gap-4 xl:grid-cols-2">
                <GraficoBarrasHorizontalCorto titulo="Expedientes creados por día" datos={aPuntos(conteoPorDia(fechasExpedientes, mes))} color={COLOR_EXPEDIENTES} />
                <GraficoBarrasHorizontalCorto titulo="Actualizaciones por día" datos={aPuntos(conteoPorDia(fechasActualizaciones, mes))} color={COLOR_ACTUALIZACIONES} />
                <GraficoBarrasHorizontalCorto titulo="Citas registradas por día" datos={aPuntos(conteoPorDia(fechasCitas, mes))} color={COLOR_CITAS} />
              </div>
            </>
          )}

          <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
            <p>Una actualización cuenta una vez por paciente y día, aunque se hayan actualizado los dos tipos; las columnas por tipo dicen qué se actualizó. Expedientes por fecha de creación del SIS; citas 2027 por el día en que se registraron, sin las anuladas ni las migradas desde Excel.</p>
            {(fuera.expedientes > 0 || fuera.actualizaciones > 0 || fuera.citas > 0) && (
              <p>Aparte: {fuera.expedientes} expedientes, {fuera.actualizaciones} actualizaciones y {fuera.citas} citas de administrativos y jefatura (los de administrativos salen en su pestaña).</p>
            )}
            {sinUsuario.length > 0 && (
              <p>Sin evaluar: {sinUsuario.map((s) => `${s.nombre} (${s.expedientes})`).join(", ")}, creadores del SIS sin usuario en services.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Tarjeta({ label, valor, barra }: { label: string; valor: number; barra: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className={`absolute inset-x-0 top-0 h-1 ${barra}`} />
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{valor}</p>
    </div>
  );
}

function TablaResumen({ filas }: { filas: FilaProductividadCE[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Resumen por persona</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Expedientes creados en Consulta Externa, actualizaciones de datos en el SIS y citas 2027 registradas.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <Users size={14} />{filas.length} personas
        </span>
      </div>
      {filas.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">No hay producción de Consulta Externa en este mes.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-[11px] font-bold uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">Nombre</th>
                {COLUMNAS.map(([id, label]) => <th key={id} className="px-3 py-3 text-center text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">{label}</th>)}
                <th className="px-3 py-3 text-center text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filas.map((f) => (
                <tr key={f.clave} className="group hover:bg-blue-50/50 dark:hover:bg-slate-800/70">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-3 font-semibold text-slate-800 group-hover:bg-blue-50 dark:bg-slate-900 dark:text-slate-100 dark:group-hover:bg-slate-800">{f.nombre}</td>
                  {COLUMNAS.map(([id]) => <Celda key={id} valor={f[id]} />)}
                  <Celda valor={totalFilaCE(f)} fuerte />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Celda({ valor, fuerte = false }: { valor: number; fuerte?: boolean }) {
  return (
    <td className="px-3 py-3 text-center">
      <span className={`inline-flex min-w-8 justify-center rounded-md px-2 py-1 text-sm tabular-nums ${valor > 0 ? `bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100 ${fuerte ? "font-bold" : "font-semibold"}` : "text-slate-400 dark:text-slate-500"}`}>
        {valor}
      </span>
    </td>
  );
}
