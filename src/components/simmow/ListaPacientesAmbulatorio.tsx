"use client";

import { useMemo, useState } from "react";
import { Search, AlertTriangle } from "lucide-react";
import type { PacienteAmbulatorio } from "@/lib/simmow/ambulatorioTypes";

interface Props {
  pacientes: PacienteAmbulatorio[];
  onSeleccionar: (paciente: PacienteAmbulatorio) => void;
}

export function ListaPacientesAmbulatorio({ pacientes, onSeleccionar }: Props) {
  const [query, setQuery] = useState("");

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pacientes;
    return pacientes.filter(
      (p) =>
        p.expediente.toLowerCase().includes(q) ||
        p.datos.paciente.toLowerCase().includes(q) ||
        p.datos.medicoNombre.toLowerCase().includes(q)
    );
  }, [pacientes, query]);

  const incompletos = pacientes.filter((p) => !(p.enPacientesAtendidos && p.enRegistroDiario)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por expediente, nombre o médico..."
            className="w-full pl-8 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <span className="text-xs text-slate-500 whitespace-nowrap">
          {filtrados.length} de {pacientes.length} pacientes
        </span>
      </div>

      {incompletos > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            {incompletos} paciente{incompletos === 1 ? "" : "s"} solo aparece{incompletos === 1 ? "" : "n"} en uno de
            los dos reportes — le{incompletos === 1 ? "" : "s"} faltarán datos clínicos o de identidad al revisar.
          </span>
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-3 py-2">Expediente</th>
              <th className="text-left font-medium px-3 py-2">Paciente</th>
              <th className="text-left font-medium px-3 py-2">Médico</th>
              <th className="text-left font-medium px-3 py-2">Dx principal</th>
              <th className="text-left font-medium px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtrados.map((p) => (
              <tr
                key={p.expediente}
                onClick={() => onSeleccionar(p)}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{p.expediente}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p.datos.paciente || "—"}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p.datos.medicoNombre || "—"}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                  {p.datos.diagPrincipalCodigo ? `${p.datos.diagPrincipalCodigo} — ${p.datos.diagPrincipalTexto}` : "—"}
                </td>
                <td className="px-3 py-2 space-x-1.5">
                  {!(p.enPacientesAtendidos && p.enRegistroDiario) && (
                    <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      incompleto
                    </span>
                  )}
                  {p.advertencias.length > 0 && (
                    <span
                      className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400"
                      title={p.advertencias.join(" / ")}
                    >
                      revisar
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400 text-sm">
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
