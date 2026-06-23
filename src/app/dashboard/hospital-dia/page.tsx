"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Syringe, Plus, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import type { RegistroHospitalDia } from "@/types";
import { calcularEdad, formatFecha, nombreCompleto, toDate } from "@/lib/pacientes/helpers";

const LIMIT = 500;
const PAGE_SIZE = 50;

export default function HospitalDiaPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [registros, setRegistros] = useState<RegistroHospitalDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, "hospital_dia"),
      orderBy("creadoEn", "desc"),
      limit(LIMIT),
    );
    const unsub = onSnapshot(q, (snap) => {
      setRegistros(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          fechaNacimiento: toDate(data.fechaNacimiento),
          creadoEn: toDate(data.creadoEn) ?? new Date(),
        } as RegistroHospitalDia;
      }));
      setLoading(false);
    });
    return unsub;
  }, [profile]);

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    if (!term) return registros;
    return registros.filter((r) =>
      r.expediente?.toLowerCase().includes(term) ||
      r.dui?.toLowerCase().includes(term) ||
      nombreCompleto(r).toLowerCase().includes(term)
    );
  }, [registros, busqueda]);

  const filtrosKey = busqueda;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) { setFiltrosPrevios(filtrosKey); setPage(1); }

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginados = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-cyan-50 dark:bg-cyan-950 rounded-xl flex items-center justify-center border border-cyan-200 dark:border-cyan-900">
            <Syringe size={17} className="text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
              Hospital Día
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Pacientes crónicos que solo vienen a procedimientos. Solo se les crea el expediente.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 px-3 py-1.5 rounded-xl">
            {registros.length} pacientes
          </span>
          <Link
            href="/dashboard/hospital-dia/nuevo"
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={15} />
            Nuevo paciente
          </Link>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por expediente, DUI o nombre..."
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-9 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
        {busqueda && (
          <button
            onClick={() => setBusqueda("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Limpiar"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <Syringe size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            {registros.length === 0
              ? "Aún no hay pacientes de Hospital Día registrados."
              : "Sin coincidencias para la búsqueda."}
          </p>
          {registros.length === 0 && (
            <Link
              href="/dashboard/hospital-dia/nuevo"
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
            >
              <Plus size={14} /> Registrar el primero
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <Th>Expediente</Th>
                  <Th>Paciente</Th>
                  <Th>Teléfono</Th>
                  <Th>Registrado</Th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginados.map((r) => {
                  const edad = calcularEdad(r.fechaNacimiento);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/dashboard/hospital-dia/${r.expediente}`)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold font-mono text-slate-900 dark:text-slate-100">{r.expediente}</p>
                        {r.dui && <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{r.dui}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{nombreCompleto(r)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {edad !== null ? `${edad} años` : "—"}
                          {r.genero && <> · {r.genero === "masculino" ? "M" : r.genero === "femenino" ? "F" : "O"}</>}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{r.telefono || "—"}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{formatFecha(r.creadoEn)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">Ver / editar →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between gap-4">
            <span className="text-xs text-slate-500 shrink-0">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtrados.length)} de{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">{filtrados.length}</span>
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-slate-500 px-2 tabular-nums">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  );
}
