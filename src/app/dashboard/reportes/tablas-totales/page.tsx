"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { LayoutGrid, Users, Download, AlertTriangle, BedDouble, Printer, ArrowLeft, RefreshCw } from "lucide-react";
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

// Paleta institucional: azul navy (masculino) + dorado/arena (femenino). En modo
// oscuro el navy se aclara para que contraste sobre las tarjetas oscuras.
const PALETA = {
  light: { m: "#1c1e4d", f: "#c9a892", otro: "#94a3b8", track: "#eef1f4" },
  dark:  { m: "#8c90df", f: "#cbb19c", otro: "#64748b", track: "#33414f" },
};

const NAVY = "var(--color-institutional-navy)";
const ARENA = "var(--color-institutional-warm)";

export default function TablasTotalesPage() {
  const { profile, loading: authLoading } = useAuth();
  const { dark } = useTheme();
  const router = useRouter();
  const col = dark ? PALETA.dark : PALETA.light;
  const esEsdomed =
    profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";

  const [activos, setActivos] = useState<{ servicio: string; genero: Genero }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [mostrarPDF, setMostrarPDF] = useState(false);

  useEffect(() => {
    if (!authLoading && profile && !esEsdomed) router.replace("/dashboard");
  }, [authLoading, profile, esEsdomed, router]);

  // Una sola lectura (no en vivo) — es un reporte. Botón "Actualizar" para recargar.
  const cargar = useCallback(async () => {
    if (!esEsdomed) return;
    setCargando(true);
    setError(null);
    try {
      const snap = await getDocs(query(collection(db, "pacientes"), where("estado", "==", "activo")));
      setActivos(snap.docs.map((d) => {
        const data = d.data() as Paciente;
        return { servicio: (data.servicioActual || "Sin servicio").trim(), genero: data.genero };
      }));
    } catch (e) {
      setError(`No se pudo cargar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setCargando(false);
    }
  }, [esEsdomed]);

  useEffect(() => {
    const t = setTimeout(() => { cargar(); }, 0);
    return () => clearTimeout(t);
  }, [cargar]);

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
    const filas = Array.from(mapa.values()).sort((x, y) => y.total - x.total || x.servicio.localeCompare(y.servicio));
    return { filas, totales: tot };
  }, [activos]);

  const tieneOtro = totales.otro > 0;

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
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

  return (
    <>
    <div className={`p-4 md:p-6 max-w-7xl mx-auto space-y-5 ${mostrarPDF ? "print:hidden" : ""}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center border"
            style={{ background: `${col.m}1a`, borderColor: `${col.m}40`, color: dark ? ARENA : NAVY }}
          >
            <LayoutGrid size={17} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Tablas totales</h1>
            <p className="text-xs text-slate-500">Pacientes ingresados por servicio, con desglose por sexo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Actualizar"
          >
            <RefreshCw size={15} className={cargando ? "animate-spin" : ""} />
            Actualizar
          </button>
          <button
            onClick={() => setMostrarPDF(true)}
            disabled={cargando || filas.length === 0}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border transition-colors disabled:opacity-50"
            style={{ borderColor: `${NAVY}40`, color: dark ? ARENA : NAVY }}
          >
            <Printer size={15} />
            Exportar PDF
          </button>
          <button
            onClick={exportarExcel}
            disabled={exportando || cargando || filas.length === 0}
            className="flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-opacity hover:opacity-90 disabled:opacity-50 shadow-sm"
            style={{ background: NAVY }}
          >
            <Download size={15} />
            {exportando ? "Generando..." : "Exportar a Excel"}
          </button>
        </div>
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
            <Kpi icon={Users} label="Total ingresados" value={totales.total} accent={dark ? "#a2acba" : "#313945"} />
            <Kpi label="Masculino" value={totales.masculino} dot={col.m} accent={dark ? ARENA : NAVY} />
            <Kpi label="Femenino" value={totales.femenino} dot={col.f} accent={col.f} />
            <Kpi icon={BedDouble} label="Servicios ocupados" value={filas.length} accent={dark ? ARENA : NAVY} />
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
                  <TarjetaServicio key={f.servicio} fila={f} tieneOtro={tieneOtro} col={col} />
                ))}
              </div>

              {/* Tabla de totales */}
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <h3
                  className="text-sm font-semibold px-4 pt-4 pb-3 font-heading"
                  style={{ color: dark ? ARENA : NAVY }}
                >
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
                          <td className="px-4 py-2.5 text-center tabular-nums font-medium" style={{ color: col.m }}>{f.masculino}</td>
                          <td className="px-4 py-2.5 text-center tabular-nums font-medium" style={{ color: dark ? col.f : "#9a7b5f" }}>{f.femenino}</td>
                          {tieneOtro && <td className="px-4 py-2.5 text-center text-slate-500 tabular-nums">{f.otro}</td>}
                          <td className="px-4 py-2.5 text-center font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{f.total}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-semibold">
                        <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100">Total</td>
                        <td className="px-4 py-2.5 text-center tabular-nums" style={{ color: col.m }}>{totales.masculino}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums" style={{ color: dark ? col.f : "#9a7b5f" }}>{totales.femenino}</td>
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

    {/* ── Vista PDF: SOLO las tarjetas (sin la tabla del final) ── */}
    {mostrarPDF && (
      <div className="fixed inset-0 z-50 bg-slate-200 overflow-y-auto print:bg-white print:static print:inset-auto print:overflow-visible">
        {/* Toolbar — oculta al imprimir */}
        <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <button onClick={() => setMostrarPDF(false)} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors">
              <ArrowLeft size={15} /> Cerrar
            </button>
            <p className="text-xs text-slate-500">Vista previa — Tarjetas por servicio</p>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              <Printer size={14} /> Imprimir / Guardar PDF
            </button>
          </div>
        </div>

        {/* Hoja */}
        <div className="py-6 px-4 print:p-0">
          <div className="tablas-pdf bg-white shadow-lg max-w-[27cm] mx-auto print:shadow-none print:max-w-none p-8 print:p-0 text-slate-900">
            <div className="flex items-end justify-between border-b-2 pb-3 mb-4" style={{ borderColor: NAVY }}>
              <div>
                <h2 className="text-lg font-bold" style={{ color: NAVY }}>Pacientes ingresados por servicio</h2>
                <p className="text-xs text-slate-500">
                  Hospital Nacional El Salvador · {new Date().toLocaleDateString("es-SV", { day: "2-digit", month: "long", year: "numeric" })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold leading-none text-slate-900 tabular-nums">{totales.total}</p>
                <p className="text-[11px] text-slate-500">ingresados · {filas.length} servicios</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 mb-4">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: PALETA.light.m }} /> Masculino {totales.masculino}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: PALETA.light.f }} /> Femenino {totales.femenino}</span>
              {tieneOtro && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: PALETA.light.otro }} /> Otro {totales.otro}</span>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {filas.map((f) => <TarjetaPrint key={f.servicio} fila={f} tieneOtro={tieneOtro} />)}
            </div>
          </div>
        </div>

        <style jsx global>{`
          @media print {
            @page { size: A4 landscape; margin: 12mm; }
            aside, [class*="md:hidden fixed top-0"] { display: none !important; }
            main { padding: 0 !important; overflow: visible !important; }
            html, body { background: white !important; }
          }
          .tablas-pdf, .tablas-pdf * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        `}</style>
      </div>
    )}
    </>
  );
}

type Col = typeof PALETA.light;

function TarjetaServicio({ fila, tieneOtro, col }: { fila: FilaServicio; tieneOtro: boolean; col: Col }) {
  return (
    <div className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-4 transition-colors hover:border-[var(--color-institutional-warm)]/60">
      <Donut m={fila.masculino} f={fila.femenino} otro={fila.otro} total={fila.total} col={col} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-800 dark:text-slate-100 leading-snug truncate" title={fila.servicio}>
          {fila.servicio}
        </p>
        <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-2.5">
          {fila.total} ingresado{fila.total === 1 ? "" : "s"}
        </p>
        <div className="flex flex-col gap-1.5">
          <Leyenda color={col.m} label="Masculino" value={fila.masculino} />
          <Leyenda color={col.f} label="Femenino" value={fila.femenino} />
          {tieneOtro && fila.otro > 0 && <Leyenda color={col.otro} label="Otro" value={fila.otro} />}
        </div>
      </div>
    </div>
  );
}

function Donut({ m, f, otro, total, col, textClassName = "fill-slate-900 dark:fill-slate-100" }: {
  m: number; f: number; otro: number; total: number; col: Col; textClassName?: string;
}) {
  const size = 76, sw = 10, r = (size - sw) / 2, c = 2 * Math.PI * r, cx = size / 2;
  const segs = [
    { v: m, color: col.m },
    { v: f, color: col.f },
    { v: otro, color: col.otro },
  ].filter((s) => s.v > 0);
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={col.track} strokeWidth={sw} />
      {total > 0 && segs.map((s, i) => {
        const len = (s.v / total) * c;
        const el = (
          <circle
            key={i} cx={cx} cy={cx} r={r} fill="none"
            stroke={s.color} strokeWidth={sw} strokeLinecap="butt"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc}
          />
        );
        acc += len;
        return el;
      })}
      <text
        x={cx} y={cx} transform={`rotate(90 ${cx} ${cx})`}
        textAnchor="middle" dominantBaseline="central"
        className={`${textClassName} font-bold`} fontSize="20"
      >
        {total}
      </text>
    </svg>
  );
}

function Leyenda({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-slate-500 flex-1">{label}</span>
      <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{value}</span>
    </div>
  );
}

// Tarjeta para la vista PDF: colores fijos claros (independiente del tema) para
// que el impreso salga siempre legible sobre hoja blanca.
function TarjetaPrint({ fila, tieneOtro }: { fila: FilaServicio; tieneOtro: boolean }) {
  return (
    <div className="border border-slate-300 rounded-xl p-3 flex items-center gap-3 break-inside-avoid">
      <Donut m={fila.masculino} f={fila.femenino} otro={fila.otro} total={fila.total} col={PALETA.light} textClassName="fill-slate-900" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900 text-[13px] leading-snug truncate" title={fila.servicio}>{fila.servicio}</p>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{fila.total} ingresado{fila.total === 1 ? "" : "s"}</p>
        <div className="flex flex-col gap-1">
          <LeyendaPrint color={PALETA.light.m} label="Masculino" value={fila.masculino} />
          <LeyendaPrint color={PALETA.light.f} label="Femenino" value={fila.femenino} />
          {tieneOtro && fila.otro > 0 && <LeyendaPrint color={PALETA.light.otro} label="Otro" value={fila.otro} />}
        </div>
      </div>
    </div>
  );
}

function LeyendaPrint({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-slate-500 flex-1">{label}</span>
      <span className="font-semibold text-slate-900 tabular-nums">{value}</span>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent, dot }: {
  icon?: typeof Users; label: string; value: string | number; accent: string; dot?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-1.5" style={{ color: accent }}>
        {Icon ? <Icon size={13} /> : dot ? <span className="w-2.5 h-2.5 rounded-full" style={{ background: dot }} /> : null}
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
