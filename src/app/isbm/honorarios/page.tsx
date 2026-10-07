"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, Building2, Users, Search, RefreshCw, Info, AlertTriangle } from "lucide-react";
import { IsbmPageHeading } from "../_components/IsbmPageHeading";
import { IsbmEmptyState, IsbmFilter, IsbmStats, IsbmTableHeading, isbmStyles as ui } from "../_components/IsbmUi";
import { hoyISO } from "@/lib/isbm/api";
import { formatoDolares } from "@/lib/isbm/types";
import { censosParaHonorarios } from "@/lib/isbm/honorarios-api";
import { resumirHonorarios, type CensoParaHonorarios } from "@/lib/isbm/honorarios";

const campo = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export default function HonorariosPage() {
  const [mes, setMes] = useState(hoyISO().slice(0, 7));
  const [censos, setCensos] = useState<CensoParaHonorarios[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [pagina, setPagina] = useState(1);
  useEffect(() => {
    let vigente = true;
    const t = setTimeout(async () => {
      setCensos(null); setError("");
      try {
        const lista = await censosParaHonorarios(mes);
        if (vigente) setCensos(lista);
      } catch (e) { if (vigente) setError((e as Error).message); }
    }, 0);
    return () => { vigente = false; clearTimeout(t); };
  }, [mes, revision]);
  const resumen = useMemo(() => resumirHonorarios(censos ?? []), [censos]);
  const medicos = resumen.medicos.filter(m => m.nombre.toLocaleLowerCase("es").includes(busqueda.trim().toLocaleLowerCase("es")));
  const paginas = Math.max(1, Math.ceil(medicos.length / 10));
  const actual = Math.min(pagina, paginas);
  const filas = medicos.slice((actual - 1) * 10, actual * 10);
  const cargando = censos === null && !error;
  const monto = (centavos: number) => censos ? formatoDolares(centavos / 100) : "—";

  return <div className={`${ui.page} mx-auto max-w-6xl space-y-6 p-4 md:p-6`}>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <IsbmPageHeading title="Honorarios" description="Participación médica y preparación de la liquidación mensual." icon={BadgeDollarSign} />
      <div className="flex items-end gap-2"><IsbmFilter label="Mes de atención"><input aria-label="Mes de honorarios" type="month" value={mes} onChange={e => { if (e.target.value) { setMes(e.target.value); setCensos(null); setPagina(1); } }} className={campo} /></IsbmFilter><button aria-label="Actualizar honorarios" disabled={cargando} onClick={() => { setCensos(null); setError(""); setRevision(r => r + 1); }} className="rounded-xl border border-slate-200 bg-white p-3 text-slate-500 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"><RefreshCw size={18} /></button></div>
    </div>
    <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"><Info size={20} className="mt-0.5 shrink-0" /><div><p className="text-sm font-semibold">Vista preliminar de honorarios</p><p className="mt-1 text-xs leading-5">El modelo original propone 30% para los profesionales y 70% para el hospital. Esta vista usa los censos cerrados del mes; la liquidación definitiva depende del paquete pagado y del criterio de distribución que confirme Convenios. Los importes son estimaciones y aún no se registran pagos desde esta sección.</p></div></div>
    <IsbmStats items={[
      { label: "Base del mes", value: monto(resumen.baseCentavos), detail: `${resumen.diasCenso} días-paciente cerrados`, icon: BadgeDollarSign },
      { label: "Profesionales · 30%", value: monto(resumen.profesionalesCentavos), detail: "Fondo estimado antes de liquidación", icon: Users, tone: "warning" },
      { label: "Hospital · 70%", value: monto(resumen.hospitalCentavos), detail: "Participación estimada del hospital", icon: Building2 },
    ]} />
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}
    {(resumen.sinMedico > 0 || resumen.sinTotal > 0) && <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"><AlertTriangle size={20} className="shrink-0" /><p>Hay {resumen.sinMedico} días-paciente sin médico tratante y {resumen.sinTotal} sin total cobrable. Completa esos datos antes de distribuir montos; por ahora solo se muestra la participación identificada.</p></div>}
    <div className={ui.toolbar}><div className={ui.search}><IsbmFilter label="Buscar médico"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input aria-label="Buscar médico en honorarios" value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }} placeholder="Nombre del médico…" className={`${campo} pl-9`} /></div></IsbmFilter></div><p className="text-xs text-slate-500">{resumen.medicos.length} médicos · {resumen.diasIdentificados} participaciones identificadas</p></div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <IsbmTableHeading title="Participación por médico" count={censos ? medicos.length : undefined}>Propuesta por días como tratante</IsbmTableHeading>
      {cargando ? <p role="status" className="p-10 text-center text-sm text-slate-500">Consultando el mes…</p> : error ? <IsbmEmptyState icon={BadgeDollarSign} title="No se pudo cargar el período">Usa Actualizar honorarios para volver a intentarlo.</IsbmEmptyState> : !medicos.length ? <IsbmEmptyState icon={Users} title={resumen.medicos.length ? "No encontramos ese médico" : "Sin participación médica registrada"}>{resumen.medicos.length ? "Prueba con otro nombre." : resumen.diasCenso ? "Los censos cerrados del mes todavía no tienen médico tratante identificado." : "La participación aparecerá cuando haya censos cerrados con médico tratante en el mes seleccionado."}</IsbmEmptyState> : <>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800"><th className="px-4 py-3">Médico tratante</th><th className="px-4 py-3 text-right">Días-paciente</th><th className="px-4 py-3 text-right">Participación</th><th className="px-4 py-3 text-right">Honorario estimado</th></tr></thead><tbody>{filas.map(m => <tr key={m.nombre} className="border-b border-slate-100 last:border-0 dark:border-slate-800"><td className="px-4 py-4 font-medium text-slate-900 dark:text-slate-100">{m.nombre}</td><td className="px-4 py-4 text-right tabular-nums text-slate-600 dark:text-slate-300">{m.dias}</td><td className="px-4 py-4 text-right tabular-nums text-slate-600 dark:text-slate-300">{m.porcentaje.toLocaleString("es-SV", { maximumFractionDigits: 2 })}%</td><td className="px-4 py-4 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">{m.estimadoCentavos === null ? "Por completar" : formatoDolares(m.estimadoCentavos / 100)}</td></tr>)}</tbody></table></div>
        <nav aria-label="Paginación de médicos" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800"><span>{(actual-1)*10+1}–{Math.min(actual*10, medicos.length)} de {medicos.length} médicos</span><div className="flex items-center gap-3"><button disabled={actual === 1} onClick={() => setPagina(actual-1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40 dark:border-slate-700">Anterior</button><span>{actual} de {paginas}</span><button disabled={actual === paginas} onClick={() => setPagina(actual+1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40 dark:border-slate-700">Siguiente</button></div></nav>
      </>}
    </section>
    <details className="rounded-2xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900"><summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">Cómo está pensado el registro de honorarios</summary><div className="mt-3 space-y-3 text-xs leading-5 text-slate-500"><p>Primero se registra el pago del paquete mensual recibido del ISBM. Con ese monto se genera un período de liquidación y se conserva la base del reparto 30/70.</p><p>Después se asigna el honorario de cada profesional según el criterio aprobado. El prototipo original usa días como médico tratante en censos cerrados: atender a dos pacientes un mismo día cuenta como dos días-paciente.</p><p>Finalmente, UFI registra el pago individual, su fecha y quién lo registró. El período conserva los nombres, la participación y los montos del momento de la liquidación. Las visitas AM/PM por sí solas no representan pagos.</p></div></details>
  </div>;
}
