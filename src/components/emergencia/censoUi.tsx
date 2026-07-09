"use client";

// Piezas de formulario compartidas por los dos censos de emergencia
// (demanda espontánea y referidos). Filosofía: todo lo posible se elige
// con chips/selects — el texto libre es la excepción, no la regla.

import { CheckCircle2, Clock, Plus, Trash2 } from "lucide-react";
import { CIE10Combobox } from "@/components/ui/CIE10Combobox";
import type { DiagnosticoCIE, EstadoRegistroCenso } from "@/types";

export const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm disabled:opacity-50";

export const labelCls = "block text-xs font-medium text-slate-500 mb-1.5";

export function Field({ label, required, children, className = "" }: {
  label: string; required?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label className={labelCls}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Estado de digitación (derivado al guardar) ───────────────────────────────

export function EstadoRegistroBadge({ estado, faltantes }: {
  estado: EstadoRegistroCenso;
  faltantes?: string[];
}) {
  if (estado === "cerrado") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 whitespace-nowrap">
        <CheckCircle2 size={11} /> Terminado
      </span>
    );
  }
  return (
    <span
      title={faltantes?.length ? `Falta: ${faltantes.join(", ")}` : undefined}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900 whitespace-nowrap cursor-help"
    >
      <Clock size={11} /> Falta por cerrar
    </span>
  );
}

// Resumen en vivo para el pie del formulario: qué falta para cerrar.
export function FaltantesHint({ faltantes }: { faltantes: string[] }) {
  if (faltantes.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 size={13} /> Registro completo — se guardará como <strong>Terminado</strong>.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
      <Clock size={13} className="mt-0.5 shrink-0" />
      <span>
        Se guardará como <strong>Falta por cerrar</strong> — pendiente: {faltantes.join(", ")}.
      </span>
    </p>
  );
}

// ── Chips de selección única ─────────────────────────────────────────────────

export function ChipSelect<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; chip?: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const activo = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              activo
                ? o.chip ?? "bg-blue-600 text-white border-blue-600"
                : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Sí / No como par de chips.
export function SiNoChips({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <ChipSelect
      options={[{ value: "si", label: "Sí" }, { value: "no", label: "No" }]}
      value={value ? "si" : "no"}
      onChange={(v) => onChange(v === "si")}
    />
  );
}

// ── Chips multiselección (procedimientos) ────────────────────────────────────

export function ChipMulti({ options, value, onChange }: {
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (o: string) =>
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange([])}
        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
          value.length === 0
            ? "bg-slate-700 dark:bg-slate-600 text-white border-slate-700 dark:border-slate-600"
            : "bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
        }`}
      >
        Ninguno
      </button>
      {options.map((o) => {
        const activo = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              activo
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

// ── Select nativo con catálogo ───────────────────────────────────────────────

export function SelectCatalogo({ options, value, onChange, placeholder = "— Seleccionar" }: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} cursor-pointer appearance-none`}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ── Staff: texto libre normalizado a MAYÚSCULAS ──────────────────────────────
// Pendiente la lista oficial de médicos de emergencia; cuando exista, este
// input vuelve a sugerir nombres desde el catálogo (datalist).

export function StaffInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      placeholder={placeholder ?? "DR. APELLIDO"}
      className={inputCls}
    />
  );
}

// ── Diagnósticos CIE-10 (uno principal + agregables) ─────────────────────────

export function DiagnosticosEditor({ value, onChange }: {
  value: DiagnosticoCIE[];
  onChange: (v: DiagnosticoCIE[]) => void;
}) {
  const lista = value.length ? value : [{ codigo: "", descripcion: "" }];
  const set = (idx: number, d: DiagnosticoCIE) => onChange(lista.map((x, i) => (i === idx ? d : x)));
  const quitar = (idx: number) => onChange(lista.filter((_, i) => i !== idx));
  return (
    <div className="space-y-2">
      {lista.map((d, idx) => (
        <div key={idx} className="flex gap-2 items-start">
          <div className="flex-1 min-w-0">
            <CIE10Combobox value={d} onChange={(v) => set(idx, v)} />
          </div>
          {lista.length > 1 && (
            <button
              type="button"
              onClick={() => quitar(idx)}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors flex-shrink-0 mt-0.5"
              aria-label="Quitar diagnóstico"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...lista, { codigo: "", descripcion: "" }])}
        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 font-medium"
      >
        <Plus size={12} /> Agregar otro diagnóstico
      </button>
    </div>
  );
}
