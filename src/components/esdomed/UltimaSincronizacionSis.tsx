"use client";

import { Clock } from "lucide-react";
import { useSincronizacionSis } from "@/contexts/SincronizacionSisContext";

const formato = new Intl.DateTimeFormat("es-SV", {
  timeZone: "America/Guatemala",
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function UltimaSincronizacionSis() {
  const { sincronizadoEn, cargando, error } = useSincronizacionSis();
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" role="status">
      <Clock size={16} className="shrink-0 text-blue-500" aria-hidden="true" />
      <p>
        <span className="font-medium">Hora de última sincronización con SIS: </span>
        {cargando ? "Consultando…" : error ? "No se pudo consultar" : sincronizadoEn !== null ? (
          <time dateTime={new Date(sincronizadoEn).toISOString()}>{formato.format(sincronizadoEn)}</time>
        ) : "Aún no hay importaciones registradas"}
      </p>
    </div>
  );
}
