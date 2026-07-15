"use client";

import type { CondicionEgresoIncapacidad } from "@/types";
import { altaAntesDelIngreso, calcularDiasHospitalizacion, calcularFechaHasta, formatFechaCorta, parseDateInput } from "@/lib/incapacidades/helpers";
import { DateField } from "@/components/ui/DateField";

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm";

const labelCls = "block text-xs font-medium text-slate-500 mb-1.5";

const textareaCls = `${inputCls} min-h-[80px] resize-y`;

export interface IncapacidadFormValue {
  fechaAlta: string;       // YYYY-MM-DD
  diasExtras: string;      // días adicionales que da el médico post-alta
  diagnosticoEgreso: string;
  tratamientoAlta: string;
  condicionEgreso: CondicionEgresoIncapacidad;
  recomendaciones: string;
  seguimiento: string;
}

interface Props {
  value: IncapacidadFormValue;
  onChange: (next: IncapacidadFormValue) => void;
  fechaIngreso?: Date;          // requerido en hospitalización; ausente en emergencia
  emergencia?: boolean;          // emergencia: días = total prescrito, sin estancia
  disabled?: boolean;
}

export function IncapacidadFormFields({ value, onChange, fechaIngreso, emergencia, disabled }: Props) {
  const set = <K extends keyof IncapacidadFormValue>(k: K, v: IncapacidadFormValue[K]) =>
    onChange({ ...value, [k]: v });

  const fAlta = value.fechaAlta ? parseDateInput(value.fechaAlta) : null;
  const diasNum = parseInt(value.diasExtras, 10);
  const diasValido = !isNaN(diasNum) && diasNum >= 0;

  // Hospitalización: total = días de estancia + adicionales (fechaDesde = ingreso).
  // Emergencia: total = solo los días prescritos (fechaDesde = la fecha de inicio).
  // Comparación por DÍA calendario: ingreso y alta el mismo día es válido
  // (alta voluntaria / retiro el mismo día) y cuenta 1 día de estancia.
  const altaAntesDqIngreso = !emergencia && fAlta !== null && !!fechaIngreso && altaAntesDelIngreso(fAlta, fechaIngreso);

  const diasHosp = !emergencia && fAlta && fechaIngreso && !altaAntesDqIngreso
    ? calcularDiasHospitalizacion(fechaIngreso, fAlta)
    : null;

  const fechaHasta = emergencia
    ? (fAlta && diasValido && diasNum >= 1 ? calcularFechaHasta(fAlta, diasNum - 1) : null)
    : (fAlta && diasValido && !altaAntesDqIngreso ? calcularFechaHasta(fAlta, diasNum) : null);

  const diasTotal = emergencia
    ? (diasValido ? diasNum : null)
    : (diasHosp !== null && diasValido ? diasHosp + diasNum : null);

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">
        Datos de la incapacidad
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>{emergencia ? "Fecha de inicio *" : "Fecha de alta *"}</label>
          <DateField
            value={value.fechaAlta}
            onChange={(v) => set("fechaAlta", v)}
            placeholder={emergencia ? "Fecha de inicio" : "Fecha de alta"}
            ariaLabel={emergencia ? "Fecha de inicio" : "Fecha de alta"}
            disabled={disabled}
          />
          {altaAntesDqIngreso && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              No puede ser anterior a la fecha de ingreso.
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>{emergencia ? "Días de incapacidad *" : "Días adicionales post-alta *"}</label>
          <input
            type="number"
            min="0"
            max="365"
            value={value.diasExtras}
            onChange={(e) => set("diasExtras", e.target.value)}
            disabled={disabled}
            className={inputCls}
            placeholder="Ej: 7"
          />
        </div>
        <div>
          <label className={labelCls}>Condición de egreso</label>
          <select
            value={value.condicionEgreso}
            onChange={(e) => set("condicionEgreso", e.target.value as CondicionEgresoIncapacidad)}
            disabled={disabled}
            className={inputCls}
          >
            <option value="vivo">Vivo</option>
            <option value="muerto">Muerto</option>
          </select>
        </div>
      </div>

      {/* Período calculado */}
      <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 rounded-xl p-3">
        <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2.5">
          Período de incapacidad (calculado)
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className={labelCls}>Desde</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {emergencia
                ? (fAlta ? formatFechaCorta(fAlta) : <span className="text-slate-400">—</span>)
                : (fechaIngreso ? formatFechaCorta(fechaIngreso) : <span className="text-slate-400">—</span>)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">{emergencia ? "Inicio" : "Fecha de ingreso"}</p>
          </div>
          <div>
            <p className={labelCls}>Hasta</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {fechaHasta ? formatFechaCorta(fechaHasta) : <span className="text-slate-400">—</span>}
            </p>
            {emergencia
              ? (fAlta && diasValido && diasNum >= 1 && (
                  <p className="text-[10px] text-slate-400 mt-0.5">Inicio + {diasNum - 1} días</p>
                ))
              : (fAlta && !altaAntesDqIngreso && diasValido && (
                  <p className="text-[10px] text-slate-400 mt-0.5">Alta + {diasNum} días</p>
                ))}
          </div>
          <div>
            <p className={labelCls}>Total días</p>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {diasTotal !== null ? diasTotal : <span className="text-slate-400 font-normal">—</span>}
            </p>
            {emergencia
              ? (diasValido && <p className="text-[10px] text-slate-400 mt-0.5">{diasNum} días de incapacidad</p>)
              : (diasHosp !== null && diasValido && (
                  <p className="text-[10px] text-slate-400 mt-0.5">{diasHosp} hosp. + {diasNum} adic.</p>
                ))}
          </div>
        </div>
      </div>

      <div>
        <label className={labelCls}>Diagnóstico de egreso *</label>
        <textarea
          value={value.diagnosticoEgreso}
          onChange={(e) => set("diagnosticoEgreso", e.target.value)}
          disabled={disabled}
          className={textareaCls}
          placeholder='Ej: "P1. Bloqueo AV completo resuelto post retiro de marcapasos temporal P2. DM2..."'
        />
      </div>

      <div>
        <label className={labelCls}>Tratamiento al alta *</label>
        <textarea
          value={value.tratamientoAlta}
          onChange={(e) => set("tratamientoAlta", e.target.value)}
          disabled={disabled}
          className={textareaCls}
          placeholder="Lista de medicamentos, referencias, citas..."
        />
      </div>

      <div>
        <label className={labelCls}>Recomendaciones (opcional)</label>
        <textarea
          value={value.recomendaciones}
          onChange={(e) => set("recomendaciones", e.target.value)}
          disabled={disabled}
          className={textareaCls}
        />
      </div>

      <div>
        <label className={labelCls}>Seguimiento (opcional)</label>
        <textarea
          value={value.seguimiento}
          onChange={(e) => set("seguimiento", e.target.value)}
          disabled={disabled}
          className={textareaCls}
          placeholder="Establecimiento, Monitoreo telefónico, Otros..."
        />
      </div>
    </section>
  );
}
