import { Hammer } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Página del subsistema de Consulta Externa que aún no se construye: dice qué
// hará, para que el menú ya muestre la estructura completa del flujo.
export function EnConstruccion({
  titulo,
  subtitulo,
  icono: Icono,
  queHara,
  children,
}: {
  titulo: string;
  subtitulo: string;
  icono: LucideIcon;
  queHara: string[];
  children?: React.ReactNode;
}) {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
          <Icono size={17} className="text-blue-600 dark:text-cyan-300" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">{titulo}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitulo}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 md:p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          <Hammer size={14} aria-hidden="true" />
          En construcción
        </div>
        <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">Lo que hará esta pantalla:</p>
        <ul className="mt-2 space-y-2">
          {queHara.map((linea) => (
            <li key={linea} className="flex gap-2.5 text-sm text-slate-600 dark:text-slate-300">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-500 dark:bg-cyan-400" aria-hidden="true" />
              <span>{linea}</span>
            </li>
          ))}
        </ul>
        {children}
      </div>
    </div>
  );
}
