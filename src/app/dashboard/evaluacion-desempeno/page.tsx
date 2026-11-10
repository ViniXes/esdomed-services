"use client";

// Evaluación de personal (solo admin): listado de las evaluaciones del
// desempeño hechas con el formulario MINSAL. Una sola lectura de la colección;
// el filtro por periodo y la búsqueda son en memoria.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardPen, Plus, Printer, Search } from "lucide-react";
import { collection, getDocs, type Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { COLECCION_EVALUACIONES_DESEMPENO, PUNTAJE_MAXIMO, type EvaluacionDesempeno } from "@/lib/evaluacionDesempeno";

const aFecha = (v: unknown) => ((v as Timestamp | null | undefined)?.toDate ? (v as Timestamp).toDate() : new Date(0));

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es").trim();

const COLOR_CALIFICACION: Record<string, string> = {
  Excelente: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  "Muy Bueno": "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  Bueno: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900",
  Insatisfactorio: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
};

export default function EvaluacionPersonalPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const esAdmin = profile?.role === "admin";

  const [lista, setLista] = useState<EvaluacionDesempeno[] | null>(null);
  const [error, setError] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (!authLoading && profile && !esAdmin) router.replace("/dashboard");
  }, [authLoading, profile, esAdmin, router]);

  useEffect(() => {
    if (!esAdmin) return;
    let cancelado = false;
    getDocs(collection(db, COLECCION_EVALUACIONES_DESEMPENO))
      .then((snap) => {
        if (cancelado) return;
        setLista(
          snap.docs
            .map((d) => {
              const data = d.data();
              return { ...(data as EvaluacionDesempeno), id: d.id, creadoEn: aFecha(data.creadoEn), actualizadoEn: aFecha(data.actualizadoEn) };
            })
            .sort((a, b) => b.actualizadoEn.getTime() - a.actualizadoEn.getTime()),
        );
      })
      .catch(() => {
        if (!cancelado) setError("No se pudieron cargar las evaluaciones.");
      });
    return () => {
      cancelado = true;
    };
  }, [esAdmin]);

  const periodos = useMemo(() => [...new Set((lista ?? []).map((e) => e.periodo))].sort().reverse(), [lista]);
  const visibles = useMemo(() => {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    return (lista ?? []).filter((e) => {
      if (periodo && e.periodo !== periodo) return false;
      const texto = normalizar(`${e.empleadoNombre} ${e.datos?.cargoNombramiento ?? ""} ${e.calificacion ?? ""}`);
      return palabras.every((p) => texto.includes(p));
    });
  }, [lista, periodo, busqueda]);

  if (authLoading || !profile) return null;
  if (!esAdmin) return null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-6 text-white shadow-lg shadow-cyan-950/15 md:px-7">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/10" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">Administración</p>
            <h1 className="mt-1 text-2xl font-bold font-heading">Evaluación de personal</h1>
            <p className="mt-1 text-sm text-cyan-50/85">Formulario de evaluación del desempeño del MINSAL, listo para imprimir y firmar.</p>
          </div>
          <Link
            href="/dashboard/evaluacion-desempeno/nueva"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-800 shadow-sm transition-colors hover:bg-cyan-50"
          >
            <Plus size={16} /> Nueva evaluación
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, cargo o calificación"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">Todos los periodos</option>
          {periodos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {lista === null && !error ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <ClipboardPen size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm text-slate-500">
            {lista?.length ? "Ninguna evaluación coincide con el filtro." : "Todavía no hay evaluaciones registradas."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibles.map((e) => (
              <li key={e.id} className="flex items-stretch">
                <Link
                  href={`/dashboard/evaluacion-desempeno/${e.id}`}
                  className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center dark:hover:bg-slate-800/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{e.empleadoNombre}</p>
                    <p className="truncate text-xs text-slate-500">
                      {e.periodo} · {e.datos?.cargoNombramiento || "Sin cargo"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {e.calificacion ? (
                      <>
                        <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                          {e.puntaje}/{PUNTAJE_MAXIMO}
                        </span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${COLOR_CALIFICACION[e.calificacion]}`}>
                          {e.calificacion}
                        </span>
                      </>
                    ) : (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                        Incompleta
                      </span>
                    )}
                  </div>
                </Link>
                <Link
                  href={`/dashboard/evaluacion-desempeno/${e.id}?imprimir=1`}
                  title="Imprimir hoja de evaluación"
                  aria-label={`Imprimir evaluación de ${e.empleadoNombre}`}
                  className="flex shrink-0 items-center border-l border-slate-100 px-4 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:border-slate-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
                >
                  <Printer size={17} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
