"use client";

import Link from "next/link";
import { X, CalendarRange, Stethoscope, FileText, ShieldAlert, User2, Clock } from "lucide-react";
import type { Licencia } from "@/types";
import { formatFecha, formatFechaHora } from "@/lib/pacientes/helpers";
import { categoriaLabel, BOLSA_LABEL } from "@/lib/rrhh/catalogo";
import { formatCantidad } from "@/lib/rrhh/formato";

interface Props {
  licencia: Licencia;
  onClose: () => void;
  /** Oculta el enlace al empleado (p. ej. si ya estás en su ficha). */
  ocultarEnlaceEmpleado?: boolean;
}

export function LicenciaDetalleCard({ licencia: l, onClose, ocultarEnlaceEmpleado }: Props) {
  const tipoDoc = l.tipoDocumento === "resolucion" ? "Resolución" : "Acuerdo";
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-start justify-between gap-3 rounded-t-2xl">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 uppercase tracking-widest">{tipoDoc}</p>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading leading-tight">
              {categoriaLabel(l.categoria)}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {l.esProrroga && <Chip className="bg-slate-100 dark:bg-slate-800 text-slate-500">Prórroga</Chip>}
              {l.excedeTope
                ? <Chip className="bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">Excede tope</Chip>
                : <Chip className="bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">Dentro del tope</Chip>}
              <Chip className={l.conGoce ? "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}>
                {l.conGoce ? "Con goce" : "Sin goce"}
              </Chip>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Empleado */}
          <Fila icon={User2} label="Empleado">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{l.empleadoNombre}</p>
            <p className="text-xs text-slate-500">
              <span className="font-mono">{l.empleadoCodigo}</span>
              {l.empleadoCargo && <> · {l.empleadoCargo}</>}
              {l.empleadoDepartamento && <> · {l.empleadoDepartamento}</>}
            </p>
            {!ocultarEnlaceEmpleado && (
              <Link
                href={`/rrhh/empleados/${encodeURIComponent(l.empleadoCodigo)}`}
                className="text-xs font-medium text-blue-600 hover:underline mt-0.5 inline-block"
              >
                Ver ficha del empleado →
              </Link>
            )}
          </Fila>

          {/* Periodo */}
          <Fila icon={CalendarRange} label="Periodo">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              {l.unidad === "horas"
                ? <>{formatFecha(l.fechaInicial)} · {l.horaInicio}–{l.horaFin}</>
                : <>{formatFecha(l.fechaInicial)} – {formatFecha(l.fechaFinal)}</>}
            </p>
            <p className="text-xs text-slate-500">
              <strong className="text-slate-700 dark:text-slate-200">{formatCantidad(l.cantidad, l.unidad)}</strong> · año {l.anio}
            </p>
          </Fila>

          {/* Desglose de goce */}
          <Fila icon={FileText} label="Detalle">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Mini label="Con goce" value={formatCantidad(l.cantidadConGoce, l.unidad)} />
              <Mini label="Sin goce" value={formatCantidad(l.cantidadSinGoce, l.unidad)} accent={l.cantidadSinGoce > 0} />
              <Mini label="Total" value={formatCantidad(l.cantidad, l.unidad)} />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">Bolsa: {BOLSA_LABEL[l.bolsa]}</p>
          </Fila>

          {/* Diagnóstico */}
          {l.diagnostico?.descripcion && (
            <Fila icon={Stethoscope} label="Diagnóstico">
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {l.diagnostico.codigo && (
                  <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 mr-1.5">{l.diagnostico.codigo}</span>
                )}
                {l.diagnostico.descripcion}
              </p>
            </Fila>
          )}

          {/* Justificación (exceso) */}
          {l.excedeTope && l.justificacion && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                <ShieldAlert size={13} /> Justificación del exceso
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-300 whitespace-pre-wrap">{l.justificacion}</p>
            </div>
          )}

          {/* Observaciones */}
          {l.observaciones && (
            <Fila icon={FileText} label="Observaciones">
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{l.observaciones}</p>
            </Fila>
          )}

          {/* Trazabilidad */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
            <Clock size={12} />
            Registrado por {l.registradoPorNombre} · {formatFechaHora(l.creadoEn)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${className}`}>{children}</span>;
}

function Fila({ icon: Icon, label, children }: { icon: typeof User2; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
        {children}
      </div>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg py-1.5 px-1">
      <p className={`text-sm font-bold tabular-nums ${accent ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-slate-100"}`}>{value}</p>
      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
    </div>
  );
}
