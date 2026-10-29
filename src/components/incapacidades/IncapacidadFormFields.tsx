"use client";

import { AlertTriangle } from "lucide-react";
import type { CondicionEgresoIncapacidad } from "@/types";
import { altaAntesDelIngreso, calcularPeriodoIncapacidad, diaSiguiente, formatFechaCorta, parseDateInput } from "@/lib/incapacidades/helpers";
import type { IncapacidadVigente } from "@/lib/incapacidades/continuacion";
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
  // Otra incapacidad del paciente vigente al ingreso/inicio (ver lib/incapacidades/continuacion).
  vigente?: IncapacidadVigente | null;
  continuar?: boolean;           // iniciar al día siguiente de que termine la vigente
  onContinuarChange?: (v: boolean) => void;
}

export function IncapacidadFormFields({
  value, onChange, fechaIngreso, emergencia, disabled, vigente, continuar, onContinuarChange,
}: Props) {
  const set = <K extends keyof IncapacidadFormValue>(k: K, v: IncapacidadFormValue[K]) =>
    onChange({ ...value, [k]: v });

  const fAlta = value.fechaAlta ? parseDateInput(value.fechaAlta) : null;
  const diasNum = parseInt(value.diasExtras, 10);
  const diasValido = !isNaN(diasNum) && diasNum >= (emergencia ? 1 : 0);

  // Comparación por DÍA calendario: ingreso y alta el mismo día es válido
  // (alta voluntaria / retiro el mismo día) y cuenta 1 día de estancia.
  const altaAntesDqIngreso = !emergencia && fAlta !== null && !!fechaIngreso && altaAntesDelIngreso(fAlta, fechaIngreso);

  // Hospitalización: total = estancia + adicionales (hasta = alta + días).
  // Emergencia: el día de inicio cuenta como primer día (hasta = inicio + días − 1).
  // Continuación: arranca al día siguiente de la vigente (calcularPeriodoIncapacidad).
  const enContinuacion = !!vigente && !!continuar;
  const periodo = fAlta && !altaAntesDqIngreso && (emergencia || fechaIngreso)
    ? calcularPeriodoIncapacidad({
        fechaIngreso: emergencia ? undefined : fechaIngreso,
        fechaAlta: fAlta,
        dias: diasValido ? diasNum : (emergencia ? 1 : 0),
        emergencia,
        hastaAnterior: enContinuacion && vigente ? vigente.hasta : null,
      })
    : null;
  const desdeMostrado = periodo?.desde ?? (emergencia ? fAlta : fechaIngreso) ?? null;
  const fechaHasta = periodo && diasValido ? periodo.hasta : null;
  const diasTotal = periodo && diasValido ? periodo.total : null;
  const diasHosp = !emergencia && periodo ? periodo.diasHospitalizacion : null;
  const estanciaCubierta = enContinuacion && !emergencia && diasHosp === 0;

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">
        Datos de la incapacidad
      </h3>

      {vigente && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="flex items-start gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            El paciente tiene una incapacidad vigente {vigente.desde ? `del ${formatFechaCorta(vigente.desde)} al` : "hasta el"} {formatFechaCorta(vigente.hasta)}
          </p>
          <p className="mt-1 pl-6 text-xs text-amber-700 dark:text-amber-400">
            {vigente.medicoNombre
              ? `${vigente.dias} días · Dr. ${vigente.medicoNombre}${vigente.servicio ? ` · ${vigente.servicio}` : ""}. `
              : "Constancia que no está en el sistema, registrada por ESDOMED. "}
            Los patronos rechazan constancias que se traslapan.
          </p>
          <label className="mt-2.5 flex items-start gap-2 pl-6 text-sm text-amber-900 dark:text-amber-200">
            <input
              type="checkbox"
              checked={!!continuar}
              onChange={(e) => onContinuarChange?.(e.target.checked)}
              disabled={disabled}
              className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
            />
            <span>
              Iniciar esta incapacidad el <strong>{formatFechaCorta(diaSiguiente(vigente.hasta))}</strong>, al terminar la anterior.
              <span className="block text-xs text-amber-700 dark:text-amber-400">
                La estancia que ya cubre la anterior no se vuelve a contar; los días que otorgue corren a partir de esa fecha.
              </span>
            </span>
          </label>
        </div>
      )}

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
              {desdeMostrado ? formatFechaCorta(desdeMostrado) : <span className="text-slate-400">—</span>}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {enContinuacion ? "Al terminar la anterior" : emergencia ? "Inicio" : "Fecha de ingreso"}
            </p>
          </div>
          <div>
            <p className={labelCls}>Hasta</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {fechaHasta ? formatFechaCorta(fechaHasta) : <span className="text-slate-400">—</span>}
            </p>
            {fechaHasta && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                {emergencia
                  ? `${diasNum} días contando el día de inicio`
                  : estanciaCubierta ? `Fin de la anterior + ${diasNum} días` : `Alta + ${diasNum} días`}
              </p>
            )}
          </div>
          <div>
            <p className={labelCls}>Total días</p>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {diasTotal !== null ? diasTotal : <span className="text-slate-400 font-normal">—</span>}
            </p>
            {emergencia
              ? (diasValido && <p className="text-[10px] text-slate-400 mt-0.5">{diasNum} días de incapacidad</p>)
              : (diasHosp !== null && diasValido && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {estanciaCubierta ? `${diasNum} adic. (estancia ya cubierta)` : `${diasHosp} hosp. + ${diasNum} adic.`}
                  </p>
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
