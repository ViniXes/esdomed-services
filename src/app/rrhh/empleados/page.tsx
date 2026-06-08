"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Search, Upload, Users, ChevronRight, UserPlus } from "lucide-react";
import type { Empleado } from "@/types";
import { toDate } from "@/lib/pacientes/helpers";

const TOPE_VISIBLE = 100;

export default function EmpleadosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "empleados"), orderBy("nombre")));
        if (cancelado) return;
        setEmpleados(snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ...data, fechaIngreso: toDate(data.fechaIngreso) } as Empleado;
        }));
      } catch {
        if (!cancelado) setEmpleados([]);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return empleados;
    return empleados.filter((e) =>
      e.nombre.toLowerCase().includes(q) ||
      e.codigo.toLowerCase().includes(q) ||
      (e.departamento ?? "").toLowerCase().includes(q) ||
      (e.cargo ?? "").toLowerCase().includes(q),
    );
  }, [empleados, busqueda]);

  const visibles = filtrados.slice(0, TOPE_VISIBLE);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Empleados</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {cargando ? "Cargando…" : `${empleados.length} en el padrón`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/rrhh/empleados/importar"
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
          >
            <Upload size={14} /> Importar
          </Link>
          <Link
            href="/rrhh/empleados/nuevo"
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors flex-shrink-0"
          >
            <UserPlus size={14} /> Nuevo
          </Link>
        </div>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, código, cargo o departamento…"
          className="w-full pl-9 pr-3 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
      </div>

      {cargando ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : empleados.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            {visibles.map((e) => (
              <Link
                key={e.codigo}
                href={`/rrhh/empleados/${encodeURIComponent(e.codigo)}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 w-16 flex-shrink-0">{e.codigo}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{e.nombre}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {e.cargo ?? "—"}{e.departamento ? ` · ${e.departamento}` : ""}
                  </p>
                </div>
                {!e.activo && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex-shrink-0">Inactivo</span>
                )}
                <ChevronRight size={15} className="text-slate-300 flex-shrink-0" />
              </Link>
            ))}
          </div>
          {filtrados.length > TOPE_VISIBLE && (
            <p className="text-center text-xs text-slate-400">
              Mostrando {TOPE_VISIBLE} de {filtrados.length}. Afina la búsqueda para ver más.
            </p>
          )}
          {filtrados.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">Sin coincidencias para “{busqueda}”.</p>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
        <Users size={22} className="text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Aún no hay empleados</p>
      <p className="text-sm text-slate-500 mt-1">Importa el padrón para empezar.</p>
      <Link href="/rrhh/empleados/importar" className="inline-flex items-center gap-2 mt-4 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors">
        <Upload size={15} /> Importar padrón
      </Link>
    </div>
  );
}
