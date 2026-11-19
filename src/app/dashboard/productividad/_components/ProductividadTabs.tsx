"use client";

import { CalendarCheck2, ShieldCheck, Stethoscope } from "lucide-react";

export type GrupoProductividad = "operativos" | "administrativos" | "consultaExterna";

type Props = {
  grupo: GrupoProductividad;
  onChange: (grupo: GrupoProductividad) => void;
  puedeVerAdministrativos: boolean;
  puedeVerConsultaExterna?: boolean;
};

/** Selector interno del único módulo de Productividad; no crea rutas adicionales. */
export function ProductividadTabs({ grupo, onChange, puedeVerAdministrativos, puedeVerConsultaExterna = false }: Props) {
  const opciones = [
    { id: "operativos" as const, label: "Operativos", icon: Stethoscope },
    ...(puedeVerAdministrativos ? [{ id: "administrativos" as const, label: "Administrativos", icon: ShieldCheck }] : []),
    ...(puedeVerConsultaExterna ? [{ id: "consultaExterna" as const, label: "Consulta Externa", icon: CalendarCheck2 }] : []),
  ];

  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
      {opciones.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            grupo === id
              ? "bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Icon size={15} /> {label}
        </button>
      ))}
    </div>
  );
}
