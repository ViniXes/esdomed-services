"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { GraficoBarras, GraficoPastel, type PuntoDato } from "./GraficosProductividad";

type Actividad = {
  id: string;
  tipo: string;
  etiqueta: string;
  responsableId: string;
  responsableNombre: string;
  fecha: string;
  solicitante: string;
  usuarioSis: string;
};

const TIPOS = [
  { id: "usuarios_creados", label: "Usuarios SIS creados", tono: "cyan" },
  { id: "usuarios_gestionados", label: "Gestiones de usuarios SIS", tono: "blue" },
  { id: "llaves_generadas", label: "Llaves o firmas generadas", tono: "violet" },
  { id: "llaves_entregadas", label: "Llaves o firmas entregadas", tono: "emerald" },
  { id: "llaves_gestionadas", label: "Gestiones de llaves o firmas", tono: "amber" },
] as const;

const selectCls = "appearance-none rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

function mesActual() {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

function etiquetaFecha(fecha: string) {
  return new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeStyle: "short", timeZone: "America/El_Salvador" }).format(new Date(fecha));
}

/** El mismo patrón visual de resumen, tabla y filtros de la productividad operativa. */
export function ProductividadAdministrativa() {
  const { user } = useAuth();
  const [mes, setMes] = useState(mesActual);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [responsable, setResponsable] = useState("todas");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = async () => {
    if (!user) return;
    setCargando(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const respuesta = await fetch(`/api/productividad/usuarios-sis?mes=${encodeURIComponent(mes)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await respuesta.json();
      if (!respuesta.ok) throw new Error(data.error || "No se pudo cargar la productividad administrativa.");
      setActividades(data.actividades ?? []);
    } catch (causa) {
      setActividades([]);
      setError(causa instanceof Error ? causa.message : "No se pudo cargar la productividad administrativa.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    const temporizador = window.setTimeout(() => { void cargar(); }, 0);
    return () => window.clearTimeout(temporizador);
  }, [user, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  const responsables = useMemo(() => Array.from(new Set(actividades.map((actividad) => actividad.responsableNombre))).filter(Boolean).sort((a, b) => a.localeCompare(b)), [actividades]);
  const visibles = useMemo(() => responsable === "todas" ? actividades : actividades.filter((actividad) => actividad.responsableNombre === responsable), [actividades, responsable]);
  const porTipo = useMemo(() => new Map(TIPOS.map(({ id }) => [id, visibles.filter((actividad) => actividad.tipo === id).length])), [visibles]);
  const porPersona = useMemo<PuntoDato[]>(() => Array.from(visibles.reduce((mapa, actividad) => mapa.set(actividad.responsableNombre, (mapa.get(actividad.responsableNombre) ?? 0) + 1), new Map<string, number>()), ([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor || a.nombre.localeCompare(b.nombre)), [visibles]);

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const hoja = XLSX.utils.aoa_to_sheet([
      ["Productividad administrativa", mes],
      [],
      ["Responsable", "Actividad", "Solicitante", "Usuario SIS", "Fecha"],
      ...visibles.map((actividad) => [actividad.responsableNombre, actividad.etiqueta, actividad.solicitante, actividad.usuarioSis, etiquetaFecha(actividad.fecha)]),
    ]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Administrativos");
    XLSX.writeFile(libro, `productividad_administrativa_${mes}.xlsx`);
  };

  return <>
    <div className="flex flex-wrap items-center gap-3">
      <input aria-label="Mes de productividad" type="month" value={mes} onChange={(event) => event.target.value && setMes(event.target.value)} className={selectCls} />
      <label className="flex items-center gap-2 text-sm text-slate-500">
        Personal:
        <select value={responsable} onChange={(event) => setResponsable(event.target.value)} className={selectCls}>
          <option value="todas">Todo el personal administrativo</option>
          {responsables.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
        </select>
      </label>
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={() => void cargar()} disabled={cargando} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><RefreshCw size={15} className={cargando ? "animate-spin" : ""} /> Actualizar</button>
        {!cargando && <button type="button" onClick={() => void exportarExcel()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Download size={15} /> Exportar Excel</button>}
      </div>
    </div>

    {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}

    {cargando ? <p className="py-16 text-center text-sm text-slate-400">Cargando...</p> : <>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {TIPOS.map(({ id, label, tono }) => <TarjetaTotal key={id} label={label} valor={porTipo.get(id) ?? 0} tono={tono} />)}
        <TarjetaTotal label="Total de actividades" valor={visibles.length} tono="slate" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <GraficoBarras titulo="Productividad administrativa por persona" datos={porPersona} color="#3b82f6" />
        <GraficoPastel titulo="Participación por persona" datos={porPersona} />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-bold text-slate-800 dark:text-slate-100">Detalle por empleado</p><p className="text-xs text-slate-500 dark:text-slate-400">Cada fila representa una actividad realmente registrada.</p></div>
          <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><BarChart3 size={14} /> {visibles.length} actividades</span>
        </div>
        {visibles.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">No hay actividades administrativas registradas para este filtro.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] border-collapse text-sm"><thead><tr className="border-b border-slate-200 bg-white text-left dark:border-slate-800 dark:bg-slate-900"><th className="px-4 py-3 text-[11px] font-bold uppercase text-slate-500">Responsable</th><th className="px-4 py-3 text-[11px] font-bold uppercase text-slate-500">Actividad</th><th className="px-4 py-3 text-[11px] font-bold uppercase text-slate-500">Referencia</th><th className="px-4 py-3 text-[11px] font-bold uppercase text-slate-500">Fecha</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{visibles.map((actividad) => <tr key={`${actividad.tipo}-${actividad.id}`} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/70"><td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{actividad.responsableNombre}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{actividad.etiqueta}</td><td className="px-4 py-3 text-slate-500 dark:text-slate-400">{actividad.solicitante || actividad.usuarioSis || "—"}</td><td className="px-4 py-3 text-slate-500 dark:text-slate-400">{etiquetaFecha(actividad.fecha)}</td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </>;
}

function TarjetaTotal({ label, valor, tono }: { label: string; valor: number; tono: string }) {
  const barras: Record<string, string> = { cyan: "bg-cyan-500", blue: "bg-blue-500", violet: "bg-violet-500", emerald: "bg-emerald-500", amber: "bg-amber-500", slate: "bg-slate-500" };
  return <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"><div className={`absolute inset-x-0 top-0 h-1 ${barras[tono]}`} /><p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 font-heading text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{valor}</p></div>;
}
