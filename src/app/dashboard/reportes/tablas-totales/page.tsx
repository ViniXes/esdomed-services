"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutGrid, Users, Download, AlertTriangle, BedDouble } from "lucide-react";
import type { Genero, Paciente } from "@/types";

interface FilaServicio {
  servicio: string;
  total: number;
  masculino: number;
  femenino: number;
  otro: number;
}

const generoDe = (g?: Genero): "masculino" | "femenino" | "otro" =>
  g === "masculino" ? "masculino" : g === "femenino" ? "femenino" : "otro";

export default function TablasTotalesPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const esEsdomed =
    profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";

  const [activos, setActivos] = useState<{ servicio: string; genero: Genero }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (!authLoading && profile && !esEsdomed) router.replace("/dashboard");
  }, [authLoading, profile, esEsdomed, router]);

  // Pacientes ingresados (estado activo) — en vivo.
  useEffect(() => {
    if (!esEsdomed) return;
    const q = query(collection(db, "pacientes"), where("estado", "==", "activo"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setActivos(snap.docs.map((d) => {
          const data = d.data() as Paciente;
          return { servicio: (data.servicioActual || "Sin servicio").trim(), genero: data.genero };
        }));
        setCargando(false);
      },
      (e) => { setError(`No se pudo cargar: ${e.message}`); setCargando(false); },
    );
    return unsub;
  }, [esEsdomed]);

  const { filas, totales } = useMemo(() => {
    const mapa = new Map<string, FilaServicio>();
    const tot: Omit<FilaServicio, "servicio"> = { total: 0, masculino: 0, femenino: 0, otro: 0 };
    for (const a of activos) {
      const g = generoDe(a.genero);
      if (!mapa.has(a.servicio)) mapa.set(a.servicio, { servicio: a.servicio, total: 0, masculino: 0, femenino: 0, otro: 0 });
      const fila = mapa.get(a.servicio)!;
      fila.total++; fila[g]++;
      tot.total++; tot[g]++;
    }
    // Orden: por total descendente, luego alfabético.
    const filas = Array.from(mapa.values()).sort((x, y) => y.total - x.total || x.servicio.localeCompare(y.servicio));
    return { filas, totales: tot };
  }, [activos]);

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const tieneOtro = totales.otro > 0;
      const aoa: (string | number)[][] = [
        ["Pacientes ingresados por servicio"],
        [`Generado: ${new Date().toLocaleString("es-SV", { hour12: false })}`],
        [],
        ["Servicio", "Masculino", "Femenino", ...(tieneOtro ? ["Otro"] : []), "Total"],
      ];
      filas.forEach((f) => aoa.push([
        f.servicio, f.masculino, f.femenino, ...(tieneOtro ? [f.otro] : []), f.total,
      ]));
      aoa.push(["Total", totales.masculino, totales.femenino, ...(tieneOtro ? [totales.otro] : []), totales.total]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ingresados por servicio");
      XLSX.writeFile(wb, `ingresados_por_servicio.xlsx`);
    } catch (e) {
      setError(`No se pudo exportar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setExportando(false);
    }
  };

  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!esEsdomed) return null;

  const tieneOtro = totales.otro > 0;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-950 rounded-xl flex items-center justify-center border border-indigo-200 dark:border-indigo-900">
            <LayoutGrid size={17} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Tablas totales</h1>
            <p className="text-xs text-slate-500">Pacientes ingresados por servicio, con desglose por sexo</p>
          </div>
        </div>
        <button
          onClick={exportarExcel}
          disabled={exportando || cargando || filas.length === 0}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
        >
          <Download size={15} />
          {exportando ? "Generando..." : "Exportar a Excel"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={Users} label="Total ingresados" value={totales.total} color="text-slate-600 dark:text-slate-300" />
            <Kpi label="Masculino" value={totales.masculino} color="text-blue-600 dark:text-blue-400" dot="bg-blue-500" />
            <Kpi label="Femenino" value={totales.femenino} color="text-pink-600 dark:text-pink-400" dot="bg-pink-500" />
            <Kpi icon={BedDouble} label="Servicios ocupados" value={filas.length} color="text-emerald-600 dark:text-emerald-400" />
          </div>

          {filas.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
              <LayoutGrid size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm text-slate-500">No hay pacientes ingresados actualmente.</p>
            </div>
          ) : (
            <>
              {/* Tarjetas por servicio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filas.map((f) => (
                  <TarjetaServicio key={f.servicio} fila={f} tieneOtro={tieneOtro} />
                ))}
              </div>

              {/* Tabla de totales */}
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-4 pt-4 pb-3 font-heading">
                  Totales por servicio
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                        <Th>Servicio</Th>
                        <Th center>Masculino</Th>
                        <Th center>Femenino</Th>
                        {tieneOtro && <Th center>Otro</Th>}
                        <Th center>Total</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filas.map((f) => (
                        <tr key={f.servicio} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{f.servicio}</td>
                          <td className="px-4 py-2.5 text-center text-blue-600 dark:text-blue-400 tabular-nums">{f.masculino}</td>
                          <td className="px-4 py-2.5 text-center text-pink-600 dark:text-pink-400 tabular-nums">{f.femenino}</td>
                          {tieneOtro && <td className="px-4 py-2.5 text-center text-slate-500 tabular-nums">{f.otro}</td>}
                          <td className="px-4 py-2.5 text-center font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{f.total}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-semibold">
                        <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100">Total</td>
                        <td className="px-4 py-2.5 text-center text-blue-600 dark:text-blue-400 tabular-nums">{totales.masculino}</td>
                        <td className="px-4 py-2.5 text-center text-pink-600 dark:text-pink-400 tabular-nums">{totales.femenino}</td>
                        {tieneOtro && <td className="px-4 py-2.5 text-center text-slate-500 tabular-nums">{totales.otro}</td>}
                        <td className="px-4 py-2.5 text-center text-slate-900 dark:text-slate-100 tabular-nums">{totales.total}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function TarjetaServicio({ fila, tieneOtro }: { fila: FilaServicio; tieneOtro: boolean }) {
  const pct = (n: number) => (fila.total ? (n / fila.total) * 100 : 0);
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-snug">{fila.servicio}</p>
        <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-none">{fila.total}</span>
      </div>

      {/* Barra de proporción M / F / Otro */}
      <div className="h-1.5 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex">
        <div className="bg-blue-500 h-full" style={{ width: `${pct(fila.masculino)}%` }} />
        <div className="bg-pink-500 h-full" style={{ width: `${pct(fila.femenino)}%` }} />
        {tieneOtro && <div className="bg-slate-400 h-full" style={{ width: `${pct(fila.otro)}%` }} />}
      </div>

      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span className="text-slate-500">M</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{fila.masculino}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
          <span className="text-slate-500">F</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{fila.femenino}</span>
        </span>
        {tieneOtro && (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span className="text-slate-500">Otro</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{fila.otro}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, color, dot }: {
  icon?: typeof Users; label: string; value: string | number; color: string; dot?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-slate-500 mb-1.5">
        {Icon ? <Icon size={13} className={color} /> : dot ? <span className={`w-2.5 h-2.5 rounded-full ${dot}`} /> : null}
        <p className="text-[11px] font-medium uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
    </div>
  );
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${center ? "text-center" : "text-left"}`}>
      {children}
    </th>
  );
}
