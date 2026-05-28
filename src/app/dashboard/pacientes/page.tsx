"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  collection, query, where, orderBy, onSnapshot, limit, QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BedDouble, Plus, Search, Clock, Filter, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { EstadoPaciente, Paciente } from "@/types";
import {
  ESTADO_BADGE, ESTADO_LABEL, calcularEdad, diasEstancia, formatFecha,
  nombreCompleto, toDate,
} from "@/lib/pacientes/helpers";

type FiltroEstado = EstadoPaciente | "todos";

const FILTROS: { value: FiltroEstado; label: string }[] = [
  { value: "activo",          label: "Activos" },
  { value: "alta_vivo",       label: "Alta vivo" },
  { value: "alta_fallecido",  label: "Fallecidos" },
  { value: "alta_voluntaria", label: "Alta vol." },
  { value: "referido",        label: "Referidos" },
  { value: "fuga",            label: "Fugas" },
  { value: "todos",           label: "Todos" },
];

const LIMIT_HISTORICO = 300;
const PAGE_SIZE = 50;

export default function PacientesPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroEstado>("activo");
  const [servicioFiltro, setServicioFiltro] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!profile) return;
    const constraints: QueryConstraint[] = [];
    if (filtro !== "todos") constraints.push(where("estado", "==", filtro));
    constraints.push(orderBy("fechaIngreso", "desc"));
    // Activos: sin límite (acotado por capacidad hospitalaria)
    // Históricos: límite razonable para no descargar toda la colección
    if (filtro !== "activo") constraints.push(limit(LIMIT_HISTORICO));

    const q = query(collection(db, "pacientes"), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      const lista = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
          fechaEgreso: toDate(data.fechaEgreso),
          fechaNacimiento: toDate(data.fechaNacimiento),
          creadoEn: toDate(data.creadoEn) ?? new Date(),
        } as Paciente;
      });
      setPacientes(lista);
      setLoading(false);
    });
    return unsub;
  }, [profile, filtro]);

  // ── Búsqueda y filtro por servicio (en cliente, sobre lo cargado) ──
  const serviciosUnicos = useMemo(() => {
    const set = new Set<string>();
    pacientes.forEach((p) => p.servicioActual && set.add(p.servicioActual));
    return Array.from(set).sort();
  }, [pacientes]);

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    return pacientes.filter((p) => {
      if (servicioFiltro && p.servicioActual !== servicioFiltro) return false;
      if (!term) return true;
      const hay =
        p.expediente?.toLowerCase().includes(term) ||
        p.dui?.toLowerCase().includes(term) ||
        nombreCompleto(p).toLowerCase().includes(term);
      return !!hay;
    });
  }, [pacientes, busqueda, servicioFiltro]);

  // Resetear página al cambiar cualquier filtro
  useEffect(() => setPage(1), [filtro, servicioFiltro, busqueda]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginados = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activosCount = useMemo(
    () => pacientes.filter((p) => p.estado === "activo").length,
    [pacientes]
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-50 dark:bg-emerald-950 rounded-xl flex items-center justify-center border border-emerald-200 dark:border-emerald-900">
            <BedDouble size={17} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Gestión de pacientes
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {filtro === "activo" && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 px-3 py-1.5 rounded-xl">
              <Clock size={14} />
              {activosCount} hospitalizados
            </div>
          )}
          <Link
            href="/dashboard/pacientes/nuevo"
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={15} />
            Nuevo ingreso
          </Link>
        </div>
      </div>

      {/* Filtros estado */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filtro === f.value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Buscador + filtro servicio */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por expediente, DUI o nombre..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>
        <div className="relative sm:w-64">
          <Filter
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <select
            value={servicioFiltro}
            onChange={(e) => setServicioFiltro(e.target.value)}
            className="w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm"
          >
            <option value="">Todos los servicios</option>
            {serviciosUnicos.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <BedDouble size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            {pacientes.length === 0
              ? "Aún no hay pacientes registrados."
              : "Sin coincidencias para los filtros actuales."}
          </p>
          {pacientes.length === 0 && (
            <Link
              href="/dashboard/pacientes/nuevo"
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
            >
              <Plus size={14} /> Crear el primer ingreso
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
                  <Th>Servicio / Cama</Th>
                  <Th>Ingreso</Th>
                  <Th>Estancia</Th>
                  <Th>Estado</Th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginados.map((p) => {
                  const edad = calcularEdad(p.fechaNacimiento);
                  const dias = diasEstancia(p.fechaIngreso, p.fechaEgreso);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/dashboard/pacientes/${p.id}`)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold font-mono text-slate-900 dark:text-slate-100">
                          {p.expediente}
                        </p>
                        {p.dui && (
                          <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{p.dui}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {nombreCompleto(p)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {edad !== null ? `${edad} años` : "—"}
                          {p.genero && <> · {p.genero === "masculino" ? "M" : p.genero === "femenino" ? "F" : "O"}</>}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700 dark:text-slate-300 text-sm">{p.servicioActual}</p>
                        {p.camaActual && (
                          <p className="text-xs text-slate-500 mt-0.5">Cama {p.camaActual}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                        {formatFecha(p.fechaIngreso)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                        {dias} {dias === 1 ? "día" : "días"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${ESTADO_BADGE[p.estado]}`}
                        >
                          {ESTADO_LABEL[p.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          Ver detalle →
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between gap-4">
            {/* Contador */}
            <span className="text-xs text-slate-500 shrink-0">
              {filtrados.length === 0 ? "0 resultados" : (
                <>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtrados.length)}
                  {" "}de{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-300">{filtrados.length}</span>
                  {filtrados.length < pacientes.length && <> (filtrados de {pacientes.length})</>}
                </>
              )}
            </span>

            {/* Controles de página */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>

                {/* Números de página */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                  .reduce<(number | "…")[]>((acc, n, idx, arr) => {
                    if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "…" ? (
                      <span key={`ellipsis-${idx}`} className="w-7 text-center text-xs text-slate-400">…</span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setPage(item as number)}
                        className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                          page === item
                            ? "bg-blue-600 text-white"
                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {/* Aviso de techo histórico */}
            {filtro !== "activo" && pacientes.length === LIMIT_HISTORICO && (
              <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">
                Límite de {LIMIT_HISTORICO} — afina filtros
              </span>
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
