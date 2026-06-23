"use client";

import type { CondicionEgresoIncapacidad } from "@/types";
import { calcularDiasHospitalizacion, calcularFechaHasta, formatFechaCorta, parseDateInput } from "@/lib/incapacidades/helpers";
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
  fechaIngreso: Date;
  disabled?: boolean;
}

export function IncapacidadFormFields({ value, onChange, fechaIngreso, disabled }: Props) {
  const set = <K extends keyof IncapacidadFormValue>(k: K, v: IncapacidadFormValue[K]) =>
    onChange({ ...value, [k]: v });

  const fAlta = value.fechaAlta ? parseDateInput(value.fechaAlta) : null;
  const diasExtrasNum = parseInt(value.diasExtras, 10);
  const altaAntesDqIngreso = fAlta !== null && fAlta < fechaIngreso;

  const diasHosp = fAlta && !altaAntesDqIngreso
    ? calcularDiasHospitalizacion(fechaIngreso, fAlta)
    : null;

  const fechaHasta = fAlta && !isNaN(diasExtrasNum) && diasExtrasNum >= 0 && !altaAntesDqIngreso
    ? calcularFechaHasta(fAlta, diasExtrasNum)
    : null;

  const diasTotal = diasHosp !== null && !isNaN(diasExtrasNum) && diasExtrasNum >= 0
    ? diasHosp + diasExtrasNum
    : null;

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">
        Datos de la incapacidad
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Fecha de alta *</label>
          <DateField
            value={value.fechaAlta}
            onChange={(v) => set("fechaAlta", v)}
            placeholder="Fecha de alta"
            ariaLabel="Fecha de alta"
            disabled={disabled}
          />
          {altaAntesDqIngreso && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              No puede ser anterior a la fecha de ingreso.
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>Días adicionales post-alta *</label>
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
              {formatFechaCorta(fechaIngreso)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Fecha de ingreso</p>
          </div>
          <div>
            <p className={labelCls}>Hasta</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {fechaHasta ? formatFechaCorta(fechaHasta) : <span className="text-slate-400">—</span>}
            </p>
            {fAlta && !altaAntesDqIngreso && !isNaN(diasExtrasNum) && diasExtrasNum >= 0 && (
              <p className="text-[10px] text-slate-400 mt-0.5">Alta + {diasExtrasNum} días</p>
            )}
          </div>
          <div>
            <p className={labelCls}>Total días</p>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {diasTotal !== null ? diasTotal : <span className="text-slate-400 font-normal">—</span>}
            </p>
            {diasHosp !== null && !isNaN(diasExtrasNum) && diasExtrasNum >= 0 && (
              <p className="text-[10px] text-slate-400 mt-0.5">{diasHosp} hosp. + {diasExtrasNum} adic.</p>
            )}
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
