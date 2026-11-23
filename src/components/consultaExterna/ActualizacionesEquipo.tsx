"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { claveTexto } from "@/lib/consultaExterna/expedientesCreados";
import {
  MAX_DIAS_EQUIPO, TIPOS_ACTUALIZACION, diasDelRango, resumenActualizacionesEquipo,
  type RegistroActualizacionEquipo, type TipoActualizacion,
} from "@/lib/consultaExterna/actualizaciones";

// Vista del admin en Actualizaciones: cuántas registró cada persona hoy, otro
// día o en un rango, por día y con el detalle (pedido del usuario, 2026-11-23).
// Solo lectura: lo registrado se corrige o deshace desde la cuenta de quien lo hizo.

const ZONA = "America/El_Salvador";
const hoyISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
const sumarDias = (iso: string, n: number) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};
const fechaCorta = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");
const hora = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString("es-SV", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" }) : "");
const corto = (t: TipoActualizacion) => TIPOS_ACTUALIZACION.find((x) => x.id === t)?.corto ?? t;
const inputCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const MAX_FILAS_DETALLE = 300;

type Rapido = { id: string; label: string; rango: () => [string, string] };
const RAPIDOS: Rapido[] = [
  { id: "hoy", label: "Hoy", rango: () => [hoyISO(), hoyISO()] },
  { id: "ayer", label: "Ayer", rango: () => { const a = sumarDias(hoyISO(), -1); return [a, a]; } },
  { id: "7", label: "Últimos 7 días", rango: () => [sumarDias(hoyISO(), -6), hoyISO()] },
  { id: "mes", label: "Este mes", rango: () => [`${hoyISO().slice(0, 8)}01`, hoyISO()] },
];

function Tarjeta({ label, valor, barra }: { label: string; valor: number; barra: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <span className={`absolute inset-y-0 left-0 w-1 ${barra}`} />
      <p className="text-[11px] font-medium uppercase text-slate-500">{label}</p>
      <p className="font-heading text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{valor}</p>
    </div>
  );
}

export function ActualizacionesEquipo() {
  const { user } = useAuth();
  const [desde, setDesde] = useState(hoyISO);
  const [hasta, setHasta] = useState(hoyISO);
  const [consultado, setConsultado] = useState<[string, string]>(() => [hoyISO(), hoyISO()]);
  const [registros, setRegistros] = useState<RegistroActualizacionEquipo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [persona, setPersona] = useState("");
  const [texto, setTexto] = useState("");
  const detalleRef = useRef<HTMLElement>(null);

  const buscar = async (d = desde, h = hasta) => {
    if (!user) return;
    const dias = diasDelRango(d, h);
    if (dias === 0) { setError("Revisa las fechas: «Desde» no puede ser posterior a «Hasta»."); return; }
    if (dias > MAX_DIAS_EQUIPO) { setError("Elige un rango de hasta 3 meses."); return; }
    setCargando(true); setError("");
    try {
      const r = await fetch(`/api/consulta-externa/actualizaciones?equipo=1&desde=${d}&hasta=${h}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "No se pudo cargar lo registrado.");
      setRegistros(data.registros ?? []);
      setConsultado([d, h]);
    } catch (e) {
      setRegistros([]);
      setError(e instanceof Error ? e.message : "No se pudo cargar lo registrado.");
    } finally { setCargando(false); }
  };

  // Primera carga: hoy.
  useEffect(() => {
    const t = window.setTimeout(() => { void buscar(); }, 0);
    return () => window.clearTimeout(t);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegirRapido = (r: Rapido) => {
    const [d, h] = r.rango();
    setDesde(d); setHasta(h);
    void buscar(d, h);
  };

  const { personas, dias } = useMemo(() => resumenActualizacionesEquipo(registros), [registros]);
  const totales = useMemo(() => personas.reduce(
    (t, p) => ({ total: t.total + p.total, identificacion: t.identificacion + p.identificacion, responsable: t.responsable + p.responsable }),
    { total: 0, identificacion: 0, responsable: 0 },
  ), [personas]);
  const hoy = hoyISO();
  const variosDias = consultado[0] !== consultado[1];
  const incluyeHoy = variosDias && consultado[0] <= hoy && hoy <= consultado[1];
  const deHoy = dias.find((d) => d.fecha === hoy)?.porPersona ?? {};
  const rapidoActivo = RAPIDOS.find((r) => { const [d, h] = r.rango(); return d === consultado[0] && h === consultado[1]; })?.id;
  const titulo = variosDias ? `del ${fechaCorta(consultado[0])} al ${fechaCorta(consultado[1])}` : consultado[0] === hoy ? "de hoy" : `del ${fechaCorta(consultado[0])}`;

  const detalle = useMemo(() => {
    const k = claveTexto(texto);
    return registros.filter((r) => (!persona || r.hechoPor === persona)
      && (!k || claveTexto(`${r.expediente} ${r.pacienteNombre} ${r.hechoPorNombre}`).includes(k)));
  }, [registros, persona, texto]);

  const verDetalleDe = (uid: string) => {
    setPersona(uid);
    window.setTimeout(() => detalleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
      ["Persona", "Registros", "Identificación", "Responsable", "Días con registros", "Último registro"],
      ...personas.map((p) => [p.nombre, p.total, p.identificacion, p.responsable, p.dias, p.ultimaEn ? `${new Intl.DateTimeFormat("es-SV", { timeZone: ZONA, dateStyle: "short", timeStyle: "short" }).format(p.ultimaEn)}` : ""]),
    ]), "Por persona");
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
      ["Fecha", ...personas.map((p) => p.nombre), "Total"],
      ...dias.map((d) => [fechaCorta(d.fecha), ...personas.map((p) => d.porPersona[p.uid] ?? 0), d.total]),
    ]), "Por día");
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
      ["Fecha", "Hora", "Persona", "Expediente", "Paciente", "Actualizó"],
      ...detalle.map((r) => [fechaCorta(r.fecha), hora(r.hechoEn), r.hechoPorNombre, r.expediente, r.pacienteNombre, r.tipos.map(corto).join(" y ")]),
    ]), "Detalle");
    XLSX.writeFile(libro, `actualizaciones_ce_${consultado[0]}_${consultado[1]}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          {RAPIDOS.map((r) => (
            <button key={r.id} type="button" onClick={() => elegirRapido(r)} disabled={cargando}
              className={`rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 ${rapidoActivo === r.id
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <label className="text-xs text-slate-500">Desde<input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} className={`mt-1 block ${inputCls}`} /></label>
        <label className="text-xs text-slate-500">Hasta<input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => e.target.value && setHasta(e.target.value)} className={`mt-1 block ${inputCls}`} /></label>
        <button type="button" onClick={() => void buscar()} disabled={cargando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
          {cargando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}Consultar
        </button>
        <button type="button" onClick={() => void buscar(consultado[0], consultado[1])} disabled={cargando} title="Volver a leer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          <RefreshCw size={15} />Actualizar
        </button>
        {registros.length > 0 && (
          <button type="button" onClick={() => void exportar()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <Download size={15} />Excel
          </button>
        )}
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{error}</p>}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Tarjeta label={`Registros ${titulo}`} valor={totales.total} barra="bg-blue-600" />
        <Tarjeta label="Personas" valor={personas.length} barra="bg-blue-300" />
        <Tarjeta label="Con identificación" valor={totales.identificacion} barra="bg-cyan-500" />
        <Tarjeta label="Con responsable" valor={totales.responsable} barra="bg-cyan-300" />
      </div>

      {!cargando && !error && registros.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          Nadie registró actualizaciones {titulo}.
        </p>
      ) : (
        <>
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Por persona {titulo}</p>
              <p className="text-xs text-slate-500">Cada paciente cuenta una vez por persona y día, aunque se le hayan actualizado los dos tipos. Toca una fila para ver su detalle.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500 dark:border-slate-800">
                    <th className="px-4 py-2">Persona</th>
                    <th className="px-4 py-2 text-right">Registros</th>
                    {incluyeHoy && <th className="px-4 py-2 text-right">Hoy</th>}
                    <th className="px-4 py-2 text-right">Identificación</th>
                    <th className="px-4 py-2 text-right">Responsable</th>
                    {variosDias && <th className="px-4 py-2 text-right">Días</th>}
                    <th className="px-4 py-2 text-right">Último registro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {personas.map((p) => (
                    <tr key={p.uid} onClick={() => verDetalleDe(p.uid)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">{p.nombre}</td>
                      <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100">{p.total}</td>
                      {incluyeHoy && <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{deHoy[p.uid] ?? 0}</td>}
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{p.identificacion}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{p.responsable}</td>
                      {variosDias && <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{p.dias}</td>}
                      <td className="px-4 py-2 text-right text-xs text-slate-500">
                        {p.ultimaEn ? (variosDias ? `${new Intl.DateTimeFormat("es-SV", { timeZone: ZONA, day: "2-digit", month: "2-digit" }).format(p.ultimaEn)} ${hora(p.ultimaEn)}` : hora(p.ultimaEn)) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {variosDias && dias.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Por día</p>
                <p className="text-xs text-slate-500">Solo los días con registros.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500 dark:border-slate-800">
                      <th className="px-4 py-2">Fecha</th>
                      {personas.map((p) => <th key={p.uid} className="max-w-[10rem] px-4 py-2 text-right normal-case">{p.nombre}</th>)}
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {dias.map((d) => (
                      <tr key={d.fecha}>
                        <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">{fechaCorta(d.fecha)}{d.fecha === hoy && <span className="ml-1.5 text-[11px] font-semibold uppercase text-blue-600 dark:text-blue-400">Hoy</span>}</td>
                        {personas.map((p) => <td key={p.uid} className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{d.porPersona[p.uid] ?? 0}</td>)}
                        <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100">{d.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section ref={detalleRef} className="scroll-mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
              <p className="w-full text-sm font-bold text-slate-800 dark:text-slate-100 sm:w-auto sm:pb-2">Detalle</p>
              <select value={persona} onChange={(e) => setPersona(e.target.value)} className={inputCls}>
                <option value="">Todas las personas</option>
                {personas.map((p) => <option key={p.uid} value={p.uid}>{p.nombre}</option>)}
              </select>
              <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Filtrar por expediente o paciente"
                className={`min-w-[14rem] flex-1 ${inputCls}`} />
              <span className="pb-2 text-xs font-semibold text-slate-500">{detalle.length} registros</span>
            </div>
            {detalle.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Ningún registro coincide con el filtro.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500 dark:border-slate-800">
                      {variosDias && <th className="px-4 py-2">Fecha</th>}
                      <th className="px-4 py-2">Hora</th><th className="px-4 py-2">Persona</th><th className="px-4 py-2">Expediente</th>
                      <th className="px-4 py-2">Paciente</th><th className="px-4 py-2">Actualizó</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detalle.slice(0, MAX_FILAS_DETALLE).map((r) => (
                      <tr key={`${r.fecha}_${r.hechoPor}_${r.expediente}`}>
                        {variosDias && <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{fechaCorta(r.fecha)}</td>}
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{hora(r.hechoEn)}</td>
                        <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{r.hechoPorNombre}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.expediente}</td>
                        <td className="px-4 py-2 text-slate-800 dark:text-slate-100">{r.pacienteNombre || "Sin nombre"}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">{r.tipos.map(corto).join(" y ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detalle.length > MAX_FILAS_DETALLE && (
                  <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 dark:border-slate-800">
                    Se muestran los {MAX_FILAS_DETALLE} más recientes de {detalle.length}. El Excel lleva todos.
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
