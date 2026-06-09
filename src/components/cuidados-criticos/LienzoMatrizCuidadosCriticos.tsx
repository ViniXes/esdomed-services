"use client";

import { camposMatrizPorTipo, VALOR_NO_REGISTRADO, valorComoTexto, type DatosMatrizCuidadosCriticos } from "@/lib/matrizCuidadosCriticos";
import type { FichaCuidadosCriticos, TipoMedicoCuidadosCriticos } from "@/types";

interface Props {
  tipo?: TipoMedicoCuidadosCriticos;
  datos?: DatosMatrizCuidadosCriticos;
  fichas?: FichaCuidadosCriticos[];
}

export function LienzoMatrizCuidadosCriticos({ tipo = "ucin", datos, fichas }: Props) {
  const campos = camposMatrizPorTipo(tipo);
  const filas = fichas ?? (datos ? [{ id: "vista", datos } as FichaCuidadosCriticos] : []);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="min-w-max border-collapse text-xs">
        <thead className="bg-slate-100 dark:bg-slate-800">
          <tr>
            {campos.map(campo => (
              <th key={campo.key} className="max-w-56 border-r border-slate-200 px-3 py-2 text-left font-semibold text-slate-700 last:border-r-0 dark:border-slate-700 dark:text-slate-200">
                {campo.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, index) => (
            <tr key={fila.id ?? index} className="bg-white dark:bg-slate-900">
              {campos.map(campo => (
                <td key={campo.key} className="max-w-56 border-r border-t border-slate-200 px-3 py-2 align-top text-slate-700 last:border-r-0 dark:border-slate-700 dark:text-slate-300">
                  <span className="block max-h-20 overflow-hidden whitespace-pre-wrap">{valorCampo(fila, campo.key)}</span>
                </td>
              ))}
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={campos.length} className="px-4 py-8 text-center text-slate-400">
                Aún no hay fichas registradas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function valorCampo(fila: FichaCuidadosCriticos, key: string) {
  const directo = valorComoTexto(fila.datos?.[key]);
  if (directo) return directo;
  if (key === "registro") return fila.pacienteExpediente;
  if (key === "nombres") return fila.pacienteNombre.split(",").slice(1).join(",").trim();
  if (key === "apellidos") return fila.pacienteNombre.split(",")[0]?.trim() ?? "";
  return VALOR_NO_REGISTRADO;
}
