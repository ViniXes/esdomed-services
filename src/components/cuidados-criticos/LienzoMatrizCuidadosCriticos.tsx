"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { aplicarCalculosBasicos, camposMatrizPorTipo, fichaPendienteCierreCuidadosCriticos, VALOR_NO_REGISTRADO, valorComoTexto, type DatosMatrizCuidadosCriticos } from "@/lib/matrizCuidadosCriticos";
import type { FichaCuidadosCriticos, TipoMedicoCuidadosCriticos } from "@/types";

interface Props {
  tipo?: TipoMedicoCuidadosCriticos;
  datos?: DatosMatrizCuidadosCriticos;
  fichas?: FichaCuidadosCriticos[];
  expedienteHref?: (ficha: FichaCuidadosCriticos) => string | undefined;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshLabel?: string;
}

const PAGE_SIZE_OPTIONS = [100, 200, 300] as const;
const DEFAULT_PAGE_SIZE = 200;

export function LienzoMatrizCuidadosCriticos({
  tipo = "ucin",
  datos,
  fichas,
  expedienteHref,
  onRefresh,
  refreshing = false,
  refreshLabel = "Actualizar matriz",
}: Props) {
  const [exportando, setExportando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const campos = useMemo(() => camposMatrizPorTipo(tipo), [tipo]);
  const fichasOriginales = useMemo(
    () => fichas ?? (datos ? [{ id: "vista", datos } as FichaCuidadosCriticos] : []),
    [datos, fichas],
  );
  const filas = useMemo(() => fichasOriginales.map(ficha => ({
    ...ficha,
    datos: aplicarCalculosBasicos(ficha.datos ?? {}),
  })), [fichasOriginales]);
  const busquedaNormalizada = normalizarBusqueda(busqueda);
  const filasFiltradas = useMemo(() => {
    if (!busquedaNormalizada) return filas;
    return filas.filter(fila => textoBusquedaFila(fila, campos).includes(busquedaNormalizada));
  }, [busquedaNormalizada, campos, filas]);
  const totalPaginas = Math.max(1, Math.ceil(filasFiltradas.length / pageSize));
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * pageSize;
  const fin = Math.min(inicio + pageSize, filasFiltradas.length);
  const filasPagina = filasFiltradas.slice(inicio, fin);

  useEffect(() => {
    setPagina(1);
  }, [busquedaNormalizada, pageSize]);

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const exportarExcel = async () => {
    if (filasFiltradas.length === 0 || exportando) return;

    try {
      setExportando(true);
      const XLSX = await import("xlsx");
      const registros = filasFiltradas.map(fila =>
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-64 flex-1">
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400" htmlFor="buscar-matriz-cuidados">
            Buscar en matriz
          </label>
          <div className="relative max-w-xl">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="buscar-matriz-cuidados"
              value={busqueda}
              onChange={event => setBusqueda(event.target.value)}
              placeholder="Expediente, nombre, servicio, diagnostico o cualquier dato..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pl-9 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Filas
            <select
              value={pageSize}
              onChange={event => setPageSize(Number(event.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {PAGE_SIZE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>

          <Paginacion
            pagina={paginaActual}
            totalPaginas={totalPaginas}
            inicio={filasFiltradas.length === 0 ? 0 : inicio + 1}
            fin={fin}
            total={filasFiltradas.length}
            totalOriginal={filas.length}
            onAnterior={() => setPagina(actual => Math.max(1, actual - 1))}
            onSiguiente={() => setPagina(actual => Math.min(totalPaginas, actual + 1))}
          />

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title={refreshLabel}
              aria-label={refreshLabel}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-300"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </button>
          )}

          <button
            type="button"
            onClick={exportarExcel}
            disabled={filasFiltradas.length === 0 || exportando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download size={14} />
            {exportando ? "Generando..." : "Descargar Excel"}
          </button>
        </div>
      </div>

      <div className="scrollbar-matriz-cuidados overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
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
            {filasPagina.map((fila, index) => (
              <tr key={fila.id ?? `fila-${inicio + index}`} className="bg-white dark:bg-slate-900">
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
            {filasFiltradas.length === 0 && (
              <tr>
                <td colSpan={campos.length} className="px-4 py-8 text-center text-slate-400">
                  {filas.length === 0 ? "Aun no hay fichas registradas." : "No hay filas que coincidan con la busqueda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filasFiltradas.length > 0 && (
        <div className="flex justify-end">
          <Paginacion
            pagina={paginaActual}
            totalPaginas={totalPaginas}
            inicio={inicio + 1}
            fin={fin}
            total={filasFiltradas.length}
            totalOriginal={filas.length}
            onAnterior={() => setPagina(actual => Math.max(1, actual - 1))}
            onSiguiente={() => setPagina(actual => Math.min(totalPaginas, actual + 1))}
          />
        </div>
      )}
    </div>
  );
}

function Paginacion({
  pagina,
  totalPaginas,
  inicio,
  fin,
  total,
  totalOriginal,
  onAnterior,
  onSiguiente,
}: {
  pagina: number;
  totalPaginas: number;
  inicio: number;
  fin: number;
  total: number;
  totalOriginal: number;
  onAnterior: () => void;
  onSiguiente: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span className="whitespace-nowrap">
        {inicio}-{fin} de {total}{total !== totalOriginal ? ` filtradas (${totalOriginal} total)` : ""}
      </span>
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
        <button
          type="button"
          onClick={onAnterior}
          disabled={pagina <= 1}
          className="inline-flex h-8 w-8 items-center justify-center text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Pagina anterior"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="inline-flex h-8 min-w-20 items-center justify-center border-x border-slate-300 px-2 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
          {pagina} / {totalPaginas}
        </span>
        <button
          type="button"
          onClick={onSiguiente}
          disabled={pagina >= totalPaginas}
          className="inline-flex h-8 w-8 items-center justify-center text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Pagina siguiente"
        >
          <ChevronRight size={15} />
        </button>
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

function textoBusquedaFila(fila: FichaCuidadosCriticos, campos: ReturnType<typeof camposMatrizPorTipo>) {
  const valores = campos.map(campo => valorCampo(fila, campo.key));
  valores.push(fila.pacienteExpediente, fila.pacienteNombre, fila.servicio, fila.cama ?? "");
  return normalizarBusqueda(valores.join(" "));
}

function normalizarBusqueda(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function fechaArchivo() {
  return new Date().toISOString().slice(0, 10);
}
