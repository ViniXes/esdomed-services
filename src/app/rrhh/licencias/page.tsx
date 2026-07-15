"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, limit, orderBy, query } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { Search, FilePlus2, FileText } from "lucide-react";
import type { Licencia } from "@/types";
import { toDate, formatFecha } from "@/lib/pacientes/helpers";
import { categoriaLabel } from "@/lib/rrhh/catalogo";
import { formatCantidadCorto, formatCantidad } from "@/lib/rrhh/formato";
import { LicenciaDetalleCard } from "@/components/rrhh/LicenciaDetalleCard";

const TOPE = 300;

export default function LicenciasPage() {
  const [licencias, setLicencias] = useState<Licencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState<Licencia | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "licencias"), orderBy("creadoEn", "desc"), limit(TOPE)));
        if (cancelado) return;
        setLicencias(snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id, ...data,
            fechaInicial: toDate(data.fechaInicial) ?? new Date(),
            fechaFinal: toDate(data.fechaFinal) ?? new Date(),
            creadoEn: toDate(data.creadoEn) ?? new Date(),
          } as Licencia;
        }));
      } catch {
        if (!cancelado) setLicencias([]);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return licencias;
    return licencias.filter((l) =>
      l.empleadoNombre.toLowerCase().includes(q) ||
      l.empleadoCodigo.toLowerCase().includes(q) ||
      categoriaLabel(l.categoria).toLowerCase().includes(q),
    );
  }, [licencias, busqueda]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Licencias</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {cargando ? "Cargando…" : `${licencias.length === TOPE ? "Últimas " : ""}${licencias.length} registros`}
          </p>
        </div>
        <Link prefetch={false}
          href="/rrhh/licencias/nueva"
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors flex-shrink-0"
        >
          <FilePlus2 size={14} /> <span className="hidden sm:inline">Registrar</span>
        </Link>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por empleado, código o tipo…"
          className="w-full pl-9 pr-3 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
      </div>

      {cargando ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : licencias.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
            <FileText size={22} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Sin licencias registradas</p>
          <Link prefetch={false} href="/rrhh/licencias/nueva" className="inline-flex items-center gap-2 mt-4 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors">
            <FilePlus2 size={15} /> Registrar la primera
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filtradas.map((l) => (
            <button
              key={l.id}
              onClick={() => setSeleccionada(l)}
              className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{l.empleadoNombre}</p>
                <p className="text-xs text-slate-500 truncate">
                  <span className="font-mono">{l.empleadoCodigo}</span> · {categoriaLabel(l.categoria)} · {formatFecha(l.fechaInicial)}–{formatFecha(l.fechaFinal)}
                </p>
              </div>
              {l.excedeTope && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 flex-shrink-0">Excede</span>}
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{formatCantidadCorto(l.cantidad, l.unidad)}</p>
                <p className="text-[11px] text-slate-400">
                  {l.cantidadSinGoce > 0 && l.cantidadConGoce > 0
                    ? `${formatCantidad(l.cantidadConGoce, l.unidad)} c/g · ${formatCantidad(l.cantidadSinGoce, l.unidad)} s/g`
                    : (l.conGoce ? "con goce" : "sin goce")}
                </p>
              </div>
            </button>
          ))}
          {filtradas.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">Sin coincidencias para “{busqueda}”.</p>
          )}
        </div>
      )}

      {seleccionada && (
        <LicenciaDetalleCard licencia={seleccionada} onClose={() => setSeleccionada(null)} />
      )}
    </div>
  );
}
