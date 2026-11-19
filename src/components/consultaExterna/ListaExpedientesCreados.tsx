"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { claveTexto } from "@/lib/consultaExterna/expedientesCreados";

// Lista de los expedientes creados en Consulta Externa (lo que ya se cargó del
// reporte del SIS), por día y con búsqueda por rango de fechas.

type Registro = { expediente: string; pacienteNombre: string; creadoPor: string; fechaCreacion: string; personaNueva: boolean };

const hoyISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
const fechaCorta = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");
const inputCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

export function ListaExpedientesCreados() {
  const { user } = useAuth();
  const [desde, setDesde] = useState(hoyISO);
  const [hasta, setHasta] = useState(hoyISO);
  const [texto, setTexto] = useState("");
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const buscar = async () => {
    if (!user) return;
    setCargando(true); setError("");
    try {
      const r = await fetch(`/api/consulta-externa/expedientes-creados?desde=${desde}&hasta=${hasta}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "No se pudo cargar la lista.");
      setRegistros(data.registros ?? []);
    } catch (e) {
      setRegistros([]);
      setError(e instanceof Error ? e.message : "No se pudo cargar la lista.");
    } finally { setCargando(false); }
  };

  // Primera carga: hoy.
  useEffect(() => {
    const t = window.setTimeout(() => { void buscar(); }, 0);
    return () => window.clearTimeout(t);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const porDia = useMemo(() => {
    const k = claveTexto(texto);
    const filtrados = registros.filter((r) => !k || claveTexto(`${r.expediente} ${r.pacienteNombre} ${r.creadoPor}`).includes(k));
    const dias = new Map<string, Registro[]>();
    for (const r of filtrados) dias.set(r.fechaCreacion, [...(dias.get(r.fechaCreacion) ?? []), r]);
    return Array.from(dias, ([fecha, lista]) => ({ fecha, lista: lista.sort((a, b) => a.pacienteNombre.localeCompare(b.pacienteNombre)) }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [registros, texto]);
  const total = porDia.reduce((s, d) => s + d.lista.length, 0);

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const filas = porDia.flatMap((d) => d.lista.map((r) => [fechaCorta(r.fechaCreacion), r.expediente, r.pacienteNombre, r.creadoPor]));
    const hoja = XLSX.utils.aoa_to_sheet([["Fecha de creación", "Expediente", "Paciente", "Creó expediente"], ...filas]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Expedientes creados");
    XLSX.writeFile(libro, `expedientes_creados_ce_${desde}_${hasta}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500">Desde<input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} className={`mt-1 block ${inputCls}`} /></label>
        <label className="text-xs text-slate-500">Hasta<input type="date" value={hasta} min={desde} onChange={(e) => e.target.value && setHasta(e.target.value)} className={`mt-1 block ${inputCls}`} /></label>
        <button type="button" onClick={() => void buscar()} disabled={cargando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
          {cargando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}Buscar
        </button>
        <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Filtrar por expediente, paciente o quién lo creó"
          className={`min-w-[16rem] flex-1 ${inputCls}`} />
        {total > 0 && (
          <button type="button" onClick={() => void exportar()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <Download size={15} />Excel
          </button>
        )}
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{error}</p>}

      {!cargando && !error && total === 0 && (
        <p className="py-12 text-center text-sm text-slate-400">No hay expedientes cargados en esas fechas.</p>
      )}

      {porDia.map((d) => (
        <section key={d.fecha} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{fechaCorta(d.fecha)}</p>
            <span className="text-xs font-semibold text-slate-500">{d.lista.length} expedientes</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500 dark:border-slate-800">
                  <th className="px-4 py-2">Expediente</th><th className="px-4 py-2">Paciente</th><th className="px-4 py-2">Creó expediente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {d.lista.map((r) => (
                  <tr key={r.expediente}>
                    <td className="px-4 py-2 font-mono text-xs">{r.expediente}</td>
                    <td className="px-4 py-2 text-slate-800 dark:text-slate-100">{r.pacienteNombre}</td>
                    <td className="px-4 py-2 text-slate-500">{r.creadoPor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
