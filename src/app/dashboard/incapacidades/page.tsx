"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FileText, Clock, CheckCircle2, Search, X, AlertTriangle } from "lucide-react";
import type { EstadoIncapacidad, SolicitudIncapacidad } from "@/types";
import { formatFecha, toDate } from "@/lib/pacientes/helpers";

type Filtro = EstadoIncapacidad | "todos";

/** Clave de día local (sin hora) para agrupar/contar por fecha. */
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
/** Clave de posible duplicado: mismo expediente el mismo día de creación. */
const dupKey = (s: SolicitudIncapacidad) => `${s.pacienteExpediente}|${dayKey(s.creadoEn)}`;

const FILTROS: { value: Filtro; label: string }[] = [
  { value: "pendiente", label: "Pendientes" },
  { value: "emitida",   label: "Emitidas" },
  { value: "todos",     label: "Todas" },
];

export default function IncapacidadesPage() {
  const router = useRouter();
  const [solicitudes, setSolicitudes] = useState<SolicitudIncapacidad[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "incapacidades"), orderBy("creadoEn", "desc"));
    return onSnapshot(q, (snap) => {
      const lista = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          fechaAlta: toDate(data.fechaAlta) ?? new Date(),
          fechaDesde: toDate(data.fechaDesde) ?? new Date(),
          fechaHasta: toDate(data.fechaHasta) ?? new Date(),
          creadoEn: toDate(data.creadoEn) ?? new Date(),
          emitidaEn: toDate(data.emitidaEn),
        } as SolicitudIncapacidad;
      });
      setSolicitudes(lista);
      setLoading(false);
    });
  }, []);

  const filtradas = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    // Rango por Fecha de alta. Se parsea como hora local (sin sufijo Z) para no
    // correr el día en El Salvador (UTC-6).
    const desde = fechaDesde ? new Date(fechaDesde + "T00:00:00") : null;
    const hasta = fechaHasta ? new Date(fechaHasta + "T23:59:59") : null;
    return solicitudes.filter((s) => {
      if (filtro !== "todos" && s.estado !== filtro) return false;
      if (desde && s.fechaAlta < desde) return false;
      if (hasta && s.fechaAlta > hasta) return false;
      if (!term) return true;
      return (
        s.pacienteExpediente.toLowerCase().includes(term) ||
        s.pacienteNombre.toLowerCase().includes(term) ||
        s.medicoNombre.toLowerCase().includes(term)
      );
    });
  }, [solicitudes, filtro, busqueda, fechaDesde, fechaHasta]);

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente").length;

  // Total creadas hoy + claves de posibles duplicados (mismo paciente, mismo día).
  // Se calcula sobre TODAS las solicitudes para no perder la marca al filtrar.
  const { totalHoy, duplicadoKeys } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of solicitudes) counts.set(dupKey(s), (counts.get(dupKey(s)) ?? 0) + 1);
    const dup = new Set<string>();
    counts.forEach((n, k) => { if (n >= 2) dup.add(k); });
    const hoy = dayKey(new Date());
    const total = solicitudes.filter((s) => dayKey(s.creadoEn) === hoy).length;
    return { totalHoy: total, duplicadoKeys: dup };
  }, [solicitudes]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-50 dark:bg-amber-950 rounded-xl flex items-center justify-center border border-amber-200 dark:border-amber-900">
            <FileText size={17} className="text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Incapacidades
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl">
            <FileText size={14} className="text-slate-400" />
            {totalHoy} {totalHoy === 1 ? "incapacidad" : "incapacidades"} hoy
          </div>
          {pendientes > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-3 py-1.5 rounded-xl">
              <Clock size={14} />
              {pendientes} pendientes de emitir
            </div>
          )}
        </div>
      </div>

      {/* Filtros */}
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

      {/* Buscador y filtro por fecha de alta */}
      <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por expediente, paciente o médico..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Alta desde</span>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 shrink-0">Hasta</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        {(busqueda || fechaDesde || fechaHasta) && (
          <button
            onClick={() => { setBusqueda(""); setFechaDesde(""); setFechaHasta(""); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
          >
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Leyenda de duplicados */}
      {duplicadoKeys.size > 0 && (
        <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle size={13} className="flex-shrink-0" />
          <span>Las filas en rojo son posibles duplicados: mismo paciente con más de una solicitud el mismo día.</span>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <FileText size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">
            {solicitudes.length === 0
              ? "No hay solicitudes de incapacidad."
              : "Sin coincidencias para los filtros actuales."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <Th>Expediente</Th>
                  <Th>Paciente</Th>
                  <Th>Médico solicitante</Th>
                  <Th>Días</Th>
                  <Th>Fecha alta</Th>
                  <Th>Estado</Th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtradas.map((s) => {
                  const esDuplicado = duplicadoKeys.has(dupKey(s));
                  return (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/dashboard/incapacidades/${s.id}`)}
                    className={`cursor-pointer transition-colors ${
                      esDuplicado
                        ? "bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/60"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold font-mono text-slate-900 dark:text-slate-100">
                        {s.pacienteExpediente}
                      </p>
                      {esDuplicado && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950 border border-red-200 dark:border-red-900 px-1.5 py-0.5 rounded-full">
                          <AlertTriangle size={9} /> Duplicado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{s.pacienteNombre}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{s.servicioPaciente}{s.camaPaciente && ` · Cama ${s.camaPaciente}`}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 text-xs">
                      Dr. {s.medicoNombre}
                      {s.medicoJvpm && <span className="block text-slate-500 mt-0.5 font-mono text-[10px]">JVPM {s.medicoJvpm}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      <span className="font-semibold">{s.diasIncapacidad}</span>
                      <span className="text-xs text-slate-500 ml-1">{s.diasIncapacidad === 1 ? "día" : "días"}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                      {formatFecha(s.fechaAlta)}
                    </td>
                    <td className="px-4 py-3">
                      {s.estado === "pendiente" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-full">
                          <Clock size={10} /> Pendiente
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={10} /> Emitida
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        Abrir →
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
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
