"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, KeyRound, RefreshCw, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { GraficoBarras, GraficoPastel, type PuntoDato } from "./GraficosProductividad";

type ValoresEsdomed = Record<"expedientes" | "defunciones" | "certificados" | "altas" | "documentos" | "simmow" | "traslados" | "carpetasDrive" | "actualizacionesDrive" | "consentimientosDrive" | "emergenciasSimmow", number>;
type FilaEsdomed = { nombre: string; valores: ValoresEsdomed };
type Actividad = { id: string; tipo: string; etiqueta: string; responsableNombre: string; fecha: string; solicitante: string; usuarioSis: string };
type Vista = "resumen" | "graficos" | "sis";

const COLUMNAS = [
  ["expedientes", "Expedientes"], ["defunciones", "Defunciones"], ["certificados", "Certificados"], ["altas", "Altas"], ["documentos", "Docs. alta"], ["simmow", "SIMMOW"], ["traslados", "Traslados"], ["carpetasDrive", "Carpetas Drive"], ["actualizacionesDrive", "Actualiz. Drive"], ["consentimientosDrive", "Consent. Drive"], ["emergenciasSimmow", "Emerg. SIMMOW"],
] as const satisfies readonly (readonly [keyof ValoresEsdomed, string])[];
const SIS = [
  ["usuarios_creados", "Usuarios SIS"], ["usuarios_gestionados", "Gestiones usuarios"], ["llaves_generadas", "Llaves/firma generadas"], ["llaves_entregadas", "Llaves/firma entregadas"], ["llaves_gestionadas", "Gestiones llaves"],
] as const;
const VISTAS: { id: Vista; label: string; icon: typeof BarChart3 }[] = [{ id: "resumen", label: "Resumen", icon: BarChart3 }, { id: "graficos", label: "Gráficos", icon: BarChart3 }, { id: "sis", label: "Usuarios y llaves SIS", icon: KeyRound }];
const selectCls = "appearance-none rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const mesActual = () => { const fecha = new Date(); return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`; };
const fecha = (valor: string) => new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeStyle: "short", timeZone: "America/El_Salvador" }).format(new Date(valor));

/** Misma estructura de Productividad Operativos, ampliada con el trabajo SIS. */
export function ProductividadAdministrativa({ resumenEsdomed }: { resumenEsdomed: FilaEsdomed[] }) {
  const { user } = useAuth();
  const [mes, setMes] = useState(mesActual);
  const [vista, setVista] = useState<Vista>("resumen");
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const cargar = async () => {
    if (!user) return;
    setCargando(true); setError("");
    try {
      const respuesta = await fetch(`/api/productividad/usuarios-sis?mes=${encodeURIComponent(mes)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await respuesta.json();
      if (!respuesta.ok) throw new Error(data.error || "No se pudo cargar la productividad administrativa.");
      setActividades(data.actividades ?? []);
    } catch (causa) { setActividades([]); setError(causa instanceof Error ? causa.message : "No se pudo cargar la productividad administrativa."); }
    finally { setCargando(false); }
  };
  useEffect(() => { const temporizador = window.setTimeout(() => { void cargar(); }, 0); return () => window.clearTimeout(temporizador); }, [user, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  const sisPorPersona = useMemo(() => actividades.reduce((mapa, actividad) => {
    const fila = mapa.get(actividad.responsableNombre) ?? Object.fromEntries(SIS.map(([id]) => [id, 0]));
    fila[actividad.tipo] = (fila[actividad.tipo] ?? 0) + 1; mapa.set(actividad.responsableNombre, fila); return mapa;
  }, new Map<string, Record<string, number>>()), [actividades]);
  const nombres = useMemo(() => Array.from(new Set([...resumenEsdomed.map(fila => fila.nombre), ...sisPorPersona.keys()])).filter(Boolean).sort((a, b) => a.localeCompare(b)), [resumenEsdomed, sisPorPersona]);
  const filas = useMemo(() => nombres.map(nombre => ({ nombre, esdomed: resumenEsdomed.find(fila => fila.nombre === nombre)?.valores ?? Object.fromEntries(COLUMNAS.map(([id]) => [id, 0])) as ValoresEsdomed, sis: sisPorPersona.get(nombre) ?? {} })), [nombres, resumenEsdomed, sisPorPersona]);
  const total = (fila: typeof filas[number]) => Object.values(fila.esdomed).reduce((a, b) => a + b, 0) + Object.values(fila.sis).reduce((a, b) => a + b, 0);
  const porPersona = useMemo<PuntoDato[]>(() => filas.map(fila => ({ nombre: fila.nombre, valor: Object.values(fila.esdomed).reduce((a, b) => a + b, 0) + Object.values(fila.sis).reduce((a, b) => a + b, 0) })).sort((a, b) => b.valor - a.valor), [filas]);
  const porTipo = useMemo<PuntoDato[]>(() => SIS.map(([id, label]) => ({ nombre: label, valor: actividades.filter(actividad => actividad.tipo === id).length })), [actividades]);
  const exportar = async () => { const XLSX = await import("xlsx"); const hoja = XLSX.utils.aoa_to_sheet([["Productividad administrativa", mes], [], ["Nombre", ...COLUMNAS.map(([, label]) => label), ...SIS.map(([, label]) => label), "Total"], ...filas.map(fila => [fila.nombre, ...COLUMNAS.map(([id]) => fila.esdomed[id]), ...SIS.map(([id]) => fila.sis[id] ?? 0), total(fila)])]); const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, "Administrativos"); XLSX.writeFile(libro, `productividad_administrativa_${mes}.xlsx`); };

  return <>
    <div className="flex flex-wrap items-center gap-3"><input aria-label="Mes" type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} className={selectCls} /><button type="button" onClick={() => void cargar()} disabled={cargando} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"><RefreshCw size={15} className={cargando ? "animate-spin" : ""} />Actualizar</button>{!cargando && <button type="button" onClick={() => void exportar()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"><Download size={15} />Exportar Excel</button>}</div>
    {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {cargando ? <p className="py-16 text-center text-sm text-slate-400">Cargando...</p> : <><div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-white/80 p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:grid-cols-3"><>{VISTAS.map(item => <button key={item.id} type="button" onClick={() => setVista(item.id)} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold transition-all sm:text-sm ${vista === item.id ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}><item.icon size={15} />{item.label}</button>)}</></div>
      {vista === "resumen" && <><div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">{SIS.map(([id, label]) => <Tarjeta key={id} label={label} valor={actividades.filter(actividad => actividad.tipo === id).length} />)}<Tarjeta label="Total actividades" valor={porPersona.reduce((suma, item) => suma + item.valor, 0)} /></div><TablaResumen filas={filas} total={total} /></>}
      {vista === "graficos" && <div className="grid gap-4 xl:grid-cols-2"><GraficoBarras titulo="Total de productividad por persona" datos={porPersona} color="#3b82f6" /><GraficoPastel titulo="Actividades SIS por tipo" datos={porTipo} /></div>}
      {vista === "sis" && <TablaSis actividades={actividades} />}
    </>}</>
}

function Tarjeta({ label, valor }: { label: string; valor: number }) { return <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="absolute inset-x-0 top-0 h-1 bg-blue-500" /><p className="text-[11px] font-medium text-slate-500">{label}</p><p className="mt-1 font-heading text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{valor}</p></div>; }
function TablaResumen({ filas, total }: { filas: { nombre: string; esdomed: ValoresEsdomed; sis: Record<string, number> }[]; total: (fila: { nombre: string; esdomed: ValoresEsdomed; sis: Record<string, number> }) => number }) { return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50"><div><p className="text-sm font-bold text-slate-800 dark:text-slate-100">Resumen por persona</p><p className="text-xs text-slate-500">Productividad ESDOMED más usuarios y llaves SIS.</p></div><span className="text-xs font-semibold text-slate-500"><Users size={14} className="mr-1 inline" />{filas.length} personas</span></div><div className="overflow-x-auto"><table className="w-full min-w-[1800px] text-sm"><thead><tr className="border-b border-slate-200 text-left dark:border-slate-800"><th className="sticky left-0 z-10 bg-white px-4 py-3 text-[11px] uppercase text-slate-500 dark:bg-slate-900">Nombre</th>{COLUMNAS.map(([id, label]) => <th key={id} className="px-3 py-3 text-center text-[11px] uppercase text-slate-500">{label}</th>)}{SIS.map(([id, label]) => <th key={id} className="px-3 py-3 text-center text-[11px] uppercase text-slate-500">{label}</th>)}<th className="px-3 py-3 text-center text-[11px] uppercase text-slate-500">Total</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filas.map(fila => <tr key={fila.nombre} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/70"><td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold text-slate-800 dark:bg-slate-900 dark:text-slate-100">{fila.nombre}</td>{COLUMNAS.map(([id]) => <Celda key={id} valor={fila.esdomed[id]} />)}{SIS.map(([id]) => <Celda key={id} valor={fila.sis[id] ?? 0} />)}<Celda valor={total(fila)} /></tr>)}</tbody></table></div></section>; }
function Celda({ valor }: { valor: number }) { return <td className="px-3 py-3 text-center"><span className={valor ? "rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100" : "text-slate-400"}>{valor}</span></td>; }
function TablaSis({ actividades }: { actividades: Actividad[] }) { return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><p className="text-sm font-bold text-slate-800 dark:text-slate-100">Usuarios creados y llaves SIS</p><p className="text-xs text-slate-500">Detalle conjunto de las actividades administrativas.</p></div>{actividades.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">No hay actividades SIS en este periodo.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-slate-200 text-left dark:border-slate-800"><th className="px-4 py-3 text-[11px] uppercase text-slate-500">Responsable</th><th className="px-4 py-3 text-[11px] uppercase text-slate-500">Actividad</th><th className="px-4 py-3 text-[11px] uppercase text-slate-500">Referencia</th><th className="px-4 py-3 text-[11px] uppercase text-slate-500">Fecha</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{actividades.map(actividad => <tr key={`${actividad.tipo}-${actividad.id}`}><td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{actividad.responsableNombre}</td><td className="px-4 py-3">{actividad.etiqueta}</td><td className="px-4 py-3 text-slate-500">{actividad.solicitante || actividad.usuarioSis || "—"}</td><td className="px-4 py-3 text-slate-500">{fecha(actividad.fecha)}</td></tr>)}</tbody></table></div>}</section>; }
