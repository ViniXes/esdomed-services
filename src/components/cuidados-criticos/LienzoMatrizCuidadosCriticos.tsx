"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { useState } from "react";
import { camposMatrizPorTipo, fichaPendienteCierreCuidadosCriticos, VALOR_NO_REGISTRADO, valorComoTexto, type DatosMatrizCuidadosCriticos } from "@/lib/matrizCuidadosCriticos";
import type { FichaCuidadosCriticos, TipoMedicoCuidadosCriticos } from "@/types";

interface Props {
  tipo?: TipoMedicoCuidadosCriticos;
  datos?: DatosMatrizCuidadosCriticos;
  fichas?: FichaCuidadosCriticos[];
  expedienteHref?: (ficha: FichaCuidadosCriticos) => string | undefined;
}

export function LienzoMatrizCuidadosCriticos({ tipo = "ucin", datos, fichas, expedienteHref }: Props) {
  const [exportando, setExportando] = useState(false);
  const campos = camposMatrizPorTipo(tipo);
  const filas = fichas ?? (datos ? [{ id: "vista", datos } as FichaCuidadosCriticos] : []);

  const exportarExcel = async () => {
    if (filas.length === 0 || exportando) return;

    try {
      setExportando(true);
      const XLSX = await import("xlsx");
      const registros = filas.map(fila =>
        Object.fromEntries(campos.map(campo => [campo.label, valorCampo(fila, campo.key)]))
      );
      const hoja = XLSX.utils.json_to_sheet(registros);
      hoja["!cols"] = campos.map(campo => ({ wch: Math.min(Math.max(campo.label.length + 2, 14), 38) }));

      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, "Matriz UCI UCIN");
      XLSX.writeFile(libro, `matriz-${tipo}-${fechaArchivo()}.xlsx`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={exportarExcel}
          disabled={filas.length === 0 || exportando}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Download size={14} />
          {exportando ? "Generando..." : "Descargar Excel"}
        </button>
      </div>

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
                {campos.map(campo => {
                  const valor = valorCampo(fila, campo.key);
                  const href = campo.key === "registro" ? expedienteHref?.(fila) : undefined;
                  const expedientePendiente = href && fichaPendienteCierreCuidadosCriticos(fila);
                  return (
                    <td key={campo.key} className="max-w-56 border-r border-t border-slate-200 px-3 py-2 align-top text-slate-700 last:border-r-0 dark:border-slate-700 dark:text-slate-300">
                      {href ? (
                        <Link
                          href={href}
                          className={`block max-h-20 overflow-hidden whitespace-pre-wrap font-semibold underline-offset-2 hover:underline ${
                            expedientePendiente
                              ? "text-rose-500 dark:text-rose-300"
                              : "text-blue-600 dark:text-blue-300"
                          }`}
                        >
                          {valor}
                        </Link>
                      ) : (
                        <span className="block max-h-20 overflow-hidden whitespace-pre-wrap">{valor}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={campos.length} className="px-4 py-8 text-center text-slate-400">
                  Aun no hay fichas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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

function fechaArchivo() {
  return new Date().toISOString().slice(0, 10);
}
