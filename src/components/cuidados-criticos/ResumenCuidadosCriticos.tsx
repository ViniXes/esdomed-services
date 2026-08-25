import { Activity, BedDouble, CalendarDays, UsersRound } from "lucide-react";
import { servicioCanonicoCuidadosCriticos, TIPO_ATENCION_CRITICA_LABEL } from "@/lib/cuidadosCriticos";
import type { AtencionCuidadosCriticos } from "@/types";

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const timestamp = value as { toDate?: () => Date };
  return timestamp.toDate?.() ?? new Date(value as string);
}

function esHoy(value: unknown): boolean {
  const fecha = toDate(value);
  if (!fecha) return false;
  const hoy = new Date();
  return fecha.toDateString() === hoy.toDateString();
}

export function ResumenCuidadosCriticos({
  atenciones,
  pacientesActivos,
}: {
  atenciones: AtencionCuidadosCriticos[];
  pacientesActivos?: number;
}) {
  const pacientes = new Set(atenciones.map(a => a.pacienteId)).size;
  const hoy = atenciones.filter(a => esHoy(a.fechaAtencion)).length;
  const porTipo = Object.entries(
    atenciones.reduce<Record<string, number>>((acc, item) => {
      acc[item.tipoAtencion] = (acc[item.tipoAtencion] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const porServicio = Object.entries(
    atenciones.reduce<Record<string, number>>((acc, item) => {
      const servicio = servicioCanonicoCuidadosCriticos(item.servicio);
      acc[servicio] = (acc[servicio] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const maxTipo = Math.max(...porTipo.map(([, total]) => total), 1);
  const maxServicio = Math.max(...porServicio.map(([, total]) => total), 1);

  const stats = [
    { label: "Pacientes activos", value: pacientesActivos ?? "—", icon: BedDouble, color: "text-blue-600 dark:text-blue-400" },
    { label: "Pacientes atendidos", value: pacientes, icon: UsersRound, color: "text-teal-600 dark:text-teal-400" },
    { label: "Atenciones registradas", value: atenciones.length, icon: Activity, color: "text-violet-600 dark:text-violet-400" },
    { label: "Atenciones de hoy", value: hoy, icon: CalendarDays, color: "text-amber-600 dark:text-amber-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <Icon size={16} className={color} />
            </div>
            <p className="mt-2 text-3xl font-bold font-heading text-slate-900 dark:text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Distribution title="Atenciones por tipo" rows={porTipo.map(([key, total]) => ({
          label: TIPO_ATENCION_CRITICA_LABEL[key as keyof typeof TIPO_ATENCION_CRITICA_LABEL] ?? key,
          total,
        }))} max={maxTipo} />
        <Distribution title="Atenciones por servicio" rows={porServicio.map(([label, total]) => ({ label, total }))} max={maxServicio} />
      </div>
    </div>
  );
}

function Distribution({
  title,
  rows,
  max,
}: {
  title: string;
  rows: { label: string; total: number }[];
  max: number;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-bold font-heading text-slate-900 dark:text-slate-100">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">Aún no hay registros.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.slice(0, 10).map(row => (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-slate-600 dark:text-slate-300" title={row.label}>{row.label}</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{row.total}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max((row.total / max) * 100, 4)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
