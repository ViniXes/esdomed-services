// Piezas de UI compartidas por el panel del admin (/dashboard/inconsistencias-
// marcacion) y la vista del empleado (/dashboard/mis-marcaciones). Sin gráficas:
// la vista del empleado no debe cargar recharts.

import type { Clock } from "lucide-react";

/** Hora marcada; "00:00" es que no hay marca (rose = error), y el desvío del horario va en amber. */
export function Marca({ hora, desvio }: { hora: string; desvio: string | null }) {
  if (hora === "00:00") {
    return (
      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
        Sin marca
      </span>
    );
  }
  return (
    <span className="tabular-nums text-slate-700 dark:text-slate-300">
      {hora}
      {desvio && <span className="ml-1.5 font-semibold text-amber-700 dark:text-amber-400">{desvio}</span>}
    </span>
  );
}

export function Tarjeta({ icon: Icon, label, valor, pie }: { icon: typeof Clock; label: string; valor: string; pie: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-slate-500 mb-1.5">
        <Icon size={13} className="text-blue-600 dark:text-blue-400" />
        <p className="text-[11px] font-medium uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{pie}</p>
    </div>
  );
}
