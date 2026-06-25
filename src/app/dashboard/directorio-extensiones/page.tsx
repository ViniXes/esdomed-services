"use client";

import { useMemo, useState } from "react";
import { PhoneCall, Search, X, Star } from "lucide-react";
import { DIRECTORIO_EXTENSIONES, type CategoriaExtensiones } from "@/lib/directorioExtensiones";

const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type SeccionFiltro = "todas" | "hospitalaria" | "administrativa";

const FILTROS: { label: string; value: SeccionFiltro }[] = [
  { label: "Todas", value: "todas" },
  { label: "Hospitalarias", value: "hospitalaria" },
  { label: "Administrativas", value: "administrativa" },
];

export default function DirectorioExtensionesPage() {
  const [busqueda, setBusqueda] = useState("");
  const [seccion, setSeccion] = useState<SeccionFiltro>("todas");

  const categorias = useMemo<CategoriaExtensiones[]>(() => {
    const q = norm(busqueda.trim());
    return DIRECTORIO_EXTENSIONES
      .filter(c => seccion === "todas" || c.seccion === seccion)
      .map(c => {
        if (!q) return c;
        // Si la categoría coincide por nombre, se muestra completa; si no, se filtran sus entradas.
        if (norm(c.nombre).includes(q)) return c;
        const entradas = c.entradas.filter(e => norm(e.nombre).includes(q) || e.extension.includes(q));
        return { ...c, entradas };
      })
      .filter(c => c.entradas.length > 0);
  }, [busqueda, seccion]);

  const totalExtensiones = categorias.reduce((n, c) => n + c.entradas.length, 0);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
          <PhoneCall size={17} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Directorio de extensiones</h1>
          <p className="text-xs text-slate-500 mt-0.5">Extensiones fijas · Hospital Nacional El Salvador</p>
        </div>
      </div>

      {/* Conmutador destacado */}
      <p className="text-xs text-slate-400 mb-5 ml-12">
        Conmutador general: <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">2100</span>
      </p>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar área, servicio o extensión (ej. uci, farmacia, 2160)..."
            className="w-full pl-9 pr-9 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
          />
          {busqueda && (
            <button onClick={() => setBusqueda("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <X size={15} />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {FILTROS.map(f => (
            <button key={f.value} onClick={() => setSeccion(f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                seccion === f.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {categorias.length === 0 ? (
        <p className="text-sm text-slate-500 py-16 text-center">
          Sin resultados para “{busqueda}”.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-400 mb-3">{totalExtensiones} extensión(es) en {categorias.length} área(s)</p>
          {/* Masonry por columnas para evitar huecos entre tarjetas de distinto alto */}
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 [column-fill:_balance]">
            {categorias.map(c => (
              <CategoriaCard key={c.nombre} categoria={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CategoriaCard({ categoria }: { categoria: CategoriaExtensiones }) {
  const destacado = categoria.destacado;
  return (
    <div className={`break-inside-avoid mb-4 rounded-xl border shadow-sm overflow-hidden ${
      destacado
        ? "border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/30"
        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
    }`}>
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${
        destacado
          ? "border-blue-200 dark:border-blue-900 bg-blue-100/60 dark:bg-blue-900/30"
          : "border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
      }`}>
        {destacado && <Star size={13} className="text-blue-500 fill-blue-500 shrink-0" />}
        <h2 className={`text-sm font-bold ${destacado ? "text-blue-800 dark:text-blue-300" : "text-slate-800 dark:text-slate-200"}`}>
          {categoria.nombre}
        </h2>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {categoria.entradas.map((e, i) => (
          <li key={`${e.extension}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="text-sm text-slate-700 dark:text-slate-300 min-w-0">{e.nombre}</span>
            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 rounded px-2 py-0.5 shrink-0">
              {e.extension}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
