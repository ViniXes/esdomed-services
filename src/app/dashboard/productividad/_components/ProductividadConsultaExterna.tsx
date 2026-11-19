"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// Vista PROVISIONAL de la productividad de Consulta Externa (expedientes
// creados según el reporte del SIS). El diseño final, con listas y gráficos
// como Operativos, se hará con el usuario; por ahora solo deja ver lo que se
// va guardando día a día.

type Registro = {
  expediente: string; pacienteNombre: string; creadoPorSis: string;
  creadoPorNombre: string | null; fechaCreacion: string; personaNueva: boolean;
};

const selectCls = "appearance-none rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const mesActual = () => { const f = new Date(); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`; };

export function ProductividadConsultaExterna({ activa }: { activa: boolean }) {
  const { user } = useAuth();
  const [mes, setMes] = useState(mesActual);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [mesCargado, setMesCargado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const cargar = async (forzar = false) => {
    if (!user || (!forzar && mesCargado === mes)) return;
    setCargando(true); setError("");
    try {
      const r = await fetch(`/api/productividad/expedientes-ce?mes=${encodeURIComponent(mes)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "No se pudo cargar la productividad de Consulta Externa.");
      setRegistros(data.registros ?? []);
      setMesCargado(mes);
    } catch (e) {
      setRegistros([]);
      setError(e instanceof Error ? e.message : "No se pudo cargar la productividad de Consulta Externa.");
    } finally { setCargando(false); }
  };

  useEffect(() => {
    if (!activa || mesCargado === mes) return;
    const t = window.setTimeout(() => { void cargar(); }, 0);
    return () => window.clearTimeout(t);
  }, [activa, user, mes, mesCargado]); // eslint-disable-line react-hooks/exhaustive-deps

  const porPersona = useMemo(() => {
    const m = new Map<string, { nombre: string; sinUsuario: boolean; total: number; nuevosPadron: number }>();
    for (const r of registros) {
      const nombre = r.creadoPorNombre ?? r.creadoPorSis;
      const f = m.get(nombre) ?? { nombre, sinUsuario: !r.creadoPorNombre, total: 0, nuevosPadron: 0 };
      f.total++; if (r.personaNueva) f.nuevosPadron++;
      m.set(nombre, f);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
  }, [registros]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="Mes" type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className={selectCls} />
        <button type="button" onClick={() => void cargar(true)} disabled={cargando}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          <RefreshCw size={15} className={cargando ? "animate-spin" : ""} />Actualizar
        </button>
      </div>
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
        Vista provisional: los expedientes creados en Consulta Externa se van guardando con cada carga del reporte del SIS. La vista con listas y gráficos está pendiente de diseño.
      </p>
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{error}</p>}
      {cargando ? <p className="py-16 text-center text-sm text-slate-400">Cargando...</p> : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Expedientes creados por persona</p>
            <span className="text-xs font-semibold text-slate-500">{registros.length} expedientes</span>
          </div>
          {porPersona.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">No hay expedientes cargados para este mes.</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500 dark:border-slate-800">
                  <th className="px-4 py-2">Nombre</th><th className="px-4 py-2 text-center">Expedientes creados</th><th className="px-4 py-2 text-center">Nuevos en el padrón</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {porPersona.map((p) => (
                  <tr key={p.nombre}>
                    <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-100">
                      {p.nombre}{p.sinUsuario && <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-400">(sin usuario en services)</span>}
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums">{p.total}</td>
                    <td className="px-4 py-2 text-center tabular-nums text-slate-500">{p.nuevosPadron}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
