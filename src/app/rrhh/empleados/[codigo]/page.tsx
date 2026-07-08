"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import {
  ArrowLeft, FilePlus2, Briefcase, Building2, CalendarClock, AlertTriangle,
} from "lucide-react";
import type { Empleado, Licencia } from "@/types";
import { toDate, formatFecha } from "@/lib/pacientes/helpers";
import { antiguedadAnios, saldosEmpleado, type SaldoBolsa } from "@/lib/rrhh/saldos";
import { BOLSA_LABEL, categoriaLabel } from "@/lib/rrhh/catalogo";
import { formatCantidad, formatCantidadCorto, horasAEquivalenteDias } from "@/lib/rrhh/formato";
import { LicenciaDetalleCard } from "@/components/rrhh/LicenciaDetalleCard";

function mapLicencia(id: string, data: Record<string, unknown>): Licencia {
  return {
    id,
    ...data,
    fechaInicial: toDate(data.fechaInicial) ?? new Date(),
    fechaFinal: toDate(data.fechaFinal) ?? new Date(),
    creadoEn: toDate(data.creadoEn) ?? new Date(),
  } as Licencia;
}

export default function EmpleadoDetallePage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo: codigoParam } = use(params);
  const codigo = decodeURIComponent(codigoParam);

  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [licencias, setLicencias] = useState<Licencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [seleccionada, setSeleccionada] = useState<Licencia | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "empleados", codigo));
        if (cancelado) return;
        if (!snap.exists()) { setError("Empleado no encontrado"); setCargando(false); return; }
        const data = snap.data();
        setEmpleado({ id: snap.id, ...data, fechaIngreso: toDate(data.fechaIngreso) } as Empleado);

        const lsnap = await getDocs(query(collection(db, "licencias"), where("empleadoCodigo", "==", codigo)));
        if (cancelado) return;
        const ls = lsnap.docs.map((d) => mapLicencia(d.id, d.data()));
        ls.sort((a, b) => b.fechaInicial.getTime() - a.fechaInicial.getTime());
        setLicencias(ls);
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [codigo]);

  const aniosDisponibles = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    licencias.forEach((l) => set.add(l.anio));
    return [...set].sort((a, b) => b - a);
  }, [licencias]);

  const saldos = useMemo(
    () => (empleado ? saldosEmpleado(empleado, licencias, anio) : []),
    [empleado, licencias, anio],
  );

  const licenciasAnio = useMemo(
    () => licencias.filter((l) => l.anio === anio),
    [licencias, anio],
  );

  if (cargando) {
    return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (error || !empleado) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-slate-500">{error ?? "No se pudo cargar el empleado."}</p>
        <Link href="/rrhh/empleados" className="text-sm text-blue-600 hover:underline mt-2 inline-block">← Volver</Link>
      </div>
    );
  }

  const anios = antiguedadAnios(empleado.fechaIngreso);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/rrhh/empleados" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors mt-0.5" aria-label="Volver">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">{empleado.codigo}</span>
            {!empleado.activo && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">Inactivo</span>}
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading leading-tight">{empleado.nombre}</h1>
        </div>
        <Link
          href={`/rrhh/licencias/nueva?empleado=${encodeURIComponent(empleado.codigo)}`}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors flex-shrink-0"
        >
          <FilePlus2 size={14} /> <span className="hidden sm:inline">Registrar licencia</span>
        </Link>
      </div>

      {/* Datos */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 grid sm:grid-cols-3 gap-3">
        <Dato icon={Briefcase} label="Cargo" value={empleado.cargo} />
        <Dato icon={Building2} label="Departamento" value={empleado.departamento} />
        <Dato icon={CalendarClock} label="Antigüedad" value={`${anios} año${anios === 1 ? "" : "s"}${empleado.fechaIngreso ? ` · desde ${formatFecha(empleado.fechaIngreso)}` : ""}`} />
      </section>

      {/* Saldos */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">Saldos por bolsa</h2>
          <select
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {aniosDisponibles.map((a) => <option key={a} value={a}>Año {a}</option>)}
          </select>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {saldos.map((s) => <SaldoCard key={s.bolsa} saldo={s} />)}
        </div>
        {!empleado.fechaIngreso && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle size={13} /> Sin fecha de ingreso: el tope de incapacidad usa el mínimo (1 año). Corrige el padrón.
          </p>
        )}
      </section>

      {/* Historial */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">
          Historial {anio} <span className="text-slate-400 font-normal">({licenciasAnio.length})</span>
        </h2>
        {licenciasAnio.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
            Sin licencias registradas en {anio}.
          </p>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            {licenciasAnio.map((l) => (
              <button
                key={l.id}
                onClick={() => setSeleccionada(l)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    {categoriaLabel(l.categoria)}
                    {l.esProrroga && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">Prórroga</span>}
                    {l.excedeTope && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">Excede tope</span>}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {l.unidad === "horas"
                      ? `${formatFecha(l.fechaInicial)} · ${l.horaInicio}–${l.horaFin}`
                      : `${formatFecha(l.fechaInicial)} – ${formatFecha(l.fechaFinal)}`}
                    {l.diagnostico?.descripcion ? ` · ${l.diagnostico.descripcion}` : ""}
                  </p>
                </div>
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
          </div>
        )}
      </section>

      {seleccionada && (
        <LicenciaDetalleCard
          licencia={seleccionada}
          onClose={() => setSeleccionada(null)}
          ocultarEnlaceEmpleado
        />
      )}
    </div>
  );
}

function Dato({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{value ?? "—"}</p>
      </div>
    </div>
  );
}

function SaldoCard({ saldo }: { saldo: SaldoBolsa }) {
  const pct = saldo.tope > 0 ? Math.min(100, Math.round((saldo.usado / saldo.tope) * 100)) : 0;
  const agotado = saldo.disponible === 0;
  const alto = pct >= 80;
  const barra = agotado ? "bg-red-500" : alto ? "bg-amber-500" : "bg-emerald-500";
  const sufijo = saldo.unidad === "horas" ? " h" : "";
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide leading-tight h-7">{BOLSA_LABEL[saldo.bolsa]}</p>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{saldo.disponible}</span>
        <span className="text-xs text-slate-400">/ {saldo.tope}{sufijo} disp.</span>
      </div>
      <div className="mt-2 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${barra} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">{saldo.usado}{sufijo} usados</p>
      {saldo.unidad === "horas" && (
        <p className="text-[10px] text-slate-400 mt-0.5">≈ {horasAEquivalenteDias(saldo.disponible)} disponibles</p>
      )}
    </div>
  );
}
