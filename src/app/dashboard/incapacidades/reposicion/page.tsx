"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, limit, onSnapshot, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import {
  FileClock, Plus, Search, Clock, CheckCircle2, Stethoscope, RefreshCw, ArrowLeft,
} from "lucide-react";
import type { SolicitudIncapacidad } from "@/types";
import { formatFecha } from "@/lib/pacientes/helpers";
import { mapIncapacidadData } from "@/lib/incapacidades/helpers";

type Tab = "con_medico" | "por_emitir" | "emitidas";

const TABS: { value: Tab; label: string }[] = [
  { value: "con_medico", label: "Con el médico" },
  { value: "por_emitir", label: "Listas para emitir" },
  { value: "emitidas", label: "Emitidas" },
];

const porCreacion = (a: SolicitudIncapacidad, b: SolicitudIncapacidad) =>
  b.creadoEn.getTime() - a.creadoEn.getTime();

/**
 * Bandeja ESDOMED de reposiciones: constancias de egresos anteriores a la app,
 * cargadas desde el FIEH y asignadas a un médico. Una vez el médico completa
 * los datos clínicos, la reposición pasa a "pendiente" y se emite desde el
 * detalle normal de incapacidades.
 */
export default function ReposicionIncapacidadPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("con_medico");
  const [busqueda, setBusqueda] = useState("");

  // En curso (con el médico o listas para emitir): en vivo. Son pocas por diseño.
  const [enCurso, setEnCurso] = useState<SolicitudIncapacidad[]>([]);
  const [loadingEnCurso, setLoadingEnCurso] = useState(true);

  // Emitidas: bajo demanda (la colección crece), con refresco manual.
  const [emitidas, setEmitidas] = useState<SolicitudIncapacidad[] | null>(null);
  const [loadingEmitidas, setLoadingEmitidas] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "incapacidades"),
      where("origen", "==", "reposicion"),
      where("estado", "in", ["pendiente_medico", "pendiente"]),
    );
    return onSnapshot(
      q,
      (snap) => {
        setEnCurso(snap.docs.map((d) => mapIncapacidadData(d.id, d.data())).sort(porCreacion));
        setLoadingEnCurso(false);
      },
      () => setLoadingEnCurso(false),
    );
  }, []);

  const cargarEmitidas = async () => {
    setLoadingEmitidas(true);
    try {
      const snap = await getDocs(query(
        collection(db, "incapacidades"),
        where("origen", "==", "reposicion"),
        where("estado", "==", "emitida"),
        limit(200),
      ));
      setEmitidas(snap.docs.map((d) => mapIncapacidadData(d.id, d.data())).sort(porCreacion));
    } catch {
      setEmitidas([]);
    } finally {
      setLoadingEmitidas(false);
    }
  };

  // Emitidas se leen la primera vez que se abre esa pestaña (ver onClick de los tabs).
  const cambiarTab = (t: Tab) => {
    setTab(t);
    if (t === "emitidas" && emitidas === null && !loadingEmitidas) cargarEmitidas();
  };

  const conMedico = useMemo(() => enCurso.filter((s) => s.estado === "pendiente_medico"), [enCurso]);
  const porEmitir = useMemo(() => enCurso.filter((s) => s.estado === "pendiente"), [enCurso]);

  const lista = useMemo(() => {
    const base = tab === "con_medico" ? conMedico : tab === "por_emitir" ? porEmitir : (emitidas ?? []);
    const t = busqueda.trim().toLowerCase();
    if (!t) return base;
    return base.filter((s) =>
      s.pacienteExpediente.toLowerCase().includes(t) ||
      s.pacienteNombre.toLowerCase().includes(t) ||
      (s.medicoNombre ?? "").toLowerCase().includes(t) ||
      (s.reposicion?.creadaPorNombre ?? "").toLowerCase().includes(t),
    );
  }, [tab, conMedico, porEmitir, emitidas, busqueda]);

  const cargando = tab === "emitidas" ? loadingEmitidas : loadingEnCurso;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            prefetch={false}
            href="/dashboard/incapacidades"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            aria-label="Volver a incapacidades"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
            <FileClock size={17} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
              Reposición de incapacidad
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Egresos anteriores a la app: se cargan desde el FIEH, un médico completa los datos y ESDOMED la emite.
            </p>
          </div>
        </div>
        <Link
          prefetch={false}
          href="/dashboard/incapacidades/reposicion/nueva"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
        >
          <Plus size={16} /> Nueva reposición
        </Link>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Tile icon={Stethoscope} tone="amber" n={conMedico.length} label="Con el médico" />
        <Tile icon={Clock} tone="blue" n={porEmitir.length} label="Listas para emitir" />
        <Tile icon={CheckCircle2} tone="emerald" n={emitidas?.length ?? null} label="Emitidas (últimas 200)" />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const n = t.value === "con_medico" ? conMedico.length : t.value === "por_emitir" ? porEmitir.length : null;
          return (
            <button
              key={t.value}
              onClick={() => cambiarTab(t.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {t.label}{n !== null && n > 0 && <span className="ml-1.5 tabular-nums opacity-80">({n})</span>}
            </button>
          );
        })}
        {tab === "emitidas" && (
          <button
            onClick={cargarEmitidas}
            disabled={loadingEmitidas}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw size={12} className={loadingEmitidas ? "animate-spin" : ""} />
            Actualizar
          </button>
        )}
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por expediente, paciente, médico o quien la cargó…"
          className="w-full pl-9 pr-3 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
      </div>

      {/* Tabla */}
      {cargando ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : lista.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <FileClock size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            {tab === "con_medico"
              ? "No hay reposiciones esperando al médico."
              : tab === "por_emitir"
                ? "No hay reposiciones listas para emitir."
                : "No hay reposiciones emitidas."}
          </p>
          {tab === "con_medico" && (
            <Link
              prefetch={false}
              href="/dashboard/incapacidades/reposicion/nueva"
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
            >
              <Plus size={14} /> Cargar la primera
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
                  <Th>Ingreso → Egreso</Th>
                  <Th>Médico asignado</Th>
                  <Th>Cargada por</Th>
                  <Th>Estado</Th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {lista.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/dashboard/incapacidades/${s.id}`)}
                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold font-mono text-slate-900 dark:text-slate-100">{s.pacienteExpediente}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{s.pacienteNombre}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{s.servicioPaciente}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatFecha(s.fechaDesde)} → {formatFecha(s.fechaAlta)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                      Dr. {s.medicoNombre}
                      {s.medicoJvpm && <span className="block text-slate-500 mt-0.5 font-mono text-[10px]">JVPM {s.medicoJvpm}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {s.reposicion?.creadaPorNombre ?? "—"}
                      <span className="block text-slate-400 mt-0.5">{formatFecha(s.creadoEn)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={s.estado} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">Abrir →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 px-4 py-2 border-t border-slate-100 dark:border-slate-800">
            {lista.length} {lista.length === 1 ? "reposición" : "reposiciones"}
          </p>
        </div>
      )}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: SolicitudIncapacidad["estado"] }) {
  if (estado === "emitida") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 px-2 py-0.5 rounded-full">
        <CheckCircle2 size={10} /> Emitida
      </span>
    );
  }
  if (estado === "pendiente_medico") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-full">
        <Stethoscope size={10} /> Con el médico
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 px-2 py-0.5 rounded-full">
      <Clock size={10} /> Lista para emitir
    </span>
  );
}

function Tile({
  icon: Icon, tone, n, label,
}: {
  icon: typeof Clock; tone: "amber" | "blue" | "emerald"; n: number | null; label: string;
}) {
  const cls = {
    amber: "border-amber-100 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/25",
    blue: "border-blue-100 bg-blue-50/70 dark:border-blue-900/60 dark:bg-blue-950/25",
    emerald: "border-emerald-100 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/25",
  }[tone];
  const iconCls = { amber: "bg-amber-500", blue: "bg-blue-600", emerald: "bg-emerald-500" }[tone];
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${cls}`}>
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-white ${iconCls}`}>
        <Icon size={16} />
      </span>
      <div>
        <p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{n === null ? "—" : n}</p>
        <p className="mt-1 text-[11px] font-medium text-slate-500">{label}</p>
      </div>
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
