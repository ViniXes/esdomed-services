"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, query, where, orderBy, onSnapshot, getDocs, getCountFromServer,
  limit, Timestamp, QueryConstraint, QueryDocumentSnapshot, DocumentData,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { FileText, Clock, CheckCircle2, Search, X, AlertTriangle, History } from "lucide-react";
import type { EstadoIncapacidad, SolicitudIncapacidad } from "@/types";
import { formatFecha, toDate } from "@/lib/pacientes/helpers";
import { DateField } from "@/components/ui/DateField";

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

function mapDoc(d: QueryDocumentSnapshot<DocumentData>): SolicitudIncapacidad {
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
}

export default function IncapacidadesPage() {
  const router = useRouter();

  // Zona 1: pendientes en vivo (worklist). Vista por defecto: pequeña y
  // siempre al día, aparece al instante cuando un médico solicita una.
  const [pendientesLive, setPendientesLive] = useState<SolicitudIncapacidad[]>([]);
  const [loadingPend, setLoadingPend] = useState(true);
  const [busquedaPendientes, setBusquedaPendientes] = useState("");

  const [filtro, setFiltro] = useState<Filtro>("pendiente");

  // Zona 2: Emitidas / Todas — bajo demanda (NO en vivo). La colección sigue
  // creciendo, así que exige expediente o rango de fecha antes de consultar.
  const [busquedaExpediente, setBusquedaExpediente] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [resultados, setResultados] = useState<SolicitudIncapacidad[] | null>(null); // null = aún no se busca
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState("");

  const [totalHoy, setTotalHoy] = useState<number | null>(null);

  // Solo las pendientes, en vivo. Sin orderBy en la consulta para no exigir
  // índice compuesto (estado + creadoEn); se ordena en cliente.
  useEffect(() => {
    const q = query(collection(db, "incapacidades"), where("estado", "==", "pendiente"));
    return onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map(mapDoc);
        docs.sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime());
        setPendientesLive(docs);
        setLoadingPend(false);
      },
      () => setLoadingPend(false),
    );
  }, []);

  // Contador "hoy" por agregación (getCountFromServer): no lee documentos, no es en vivo.
  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const r = await getCountFromServer(
          query(collection(db, "incapacidades"), where("creadoEn", ">=", Timestamp.fromDate(hoy))),
        );
        if (activo) setTotalHoy(r.data().count);
      } catch {
        if (activo) setTotalHoy(null);
      }
    })();
    return () => { activo = false; };
  }, []);

  const dentroDelRango = (d: Date) => {
    if (!fechaDesde && !fechaHasta) return true;
    if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
    if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    return true;
  };

  // Búsqueda de incapacidades anteriores: una sola lectura (getDocs), no un listener.
  const buscar = async () => {
    const exp = busquedaExpediente.trim();
    if (!exp && !fechaDesde && !fechaHasta) return;
    setBuscando(true);
    setErrorBusqueda("");
    try {
      let docs: SolicitudIncapacidad[];
      if (exp) {
        // Por expediente: todas las incapacidades de ese paciente (cualquier
        // estado/fecha). Sin orderBy para no exigir índice compuesto.
        const snap = await getDocs(query(collection(db, "incapacidades"), where("pacienteExpediente", "==", exp)));
        docs = snap.docs.map(mapDoc).filter((s) => dentroDelRango(s.fechaAlta));
      } else {
        // Por rango de Fecha de alta (todo sobre el mismo campo → sin índice compuesto).
        const constraints: QueryConstraint[] = [];
        if (fechaDesde) constraints.push(where("fechaAlta", ">=", Timestamp.fromDate(new Date(fechaDesde + "T00:00:00"))));
        if (fechaHasta) constraints.push(where("fechaAlta", "<=", Timestamp.fromDate(new Date(fechaHasta + "T23:59:59"))));
        constraints.push(orderBy("fechaAlta", "desc"));
        constraints.push(limit(500));
        const snap = await getDocs(query(collection(db, "incapacidades"), ...constraints));
        docs = snap.docs.map(mapDoc);
      }
      docs.sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime());
      setResultados(docs);
    } catch (e) {
      setErrorBusqueda((e as Error).message || "No se pudo completar la búsqueda.");
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  const limpiarBusqueda = () => {
    setBusquedaExpediente(""); setFechaDesde(""); setFechaHasta("");
    setResultados(null); setErrorBusqueda("");
  };

  const sinCriterio = !busquedaExpediente.trim() && !fechaDesde && !fechaHasta;

  const filtradasPendientes = useMemo(() => {
    const term = busquedaPendientes.trim().toLowerCase();
    if (!term) return pendientesLive;
    return pendientesLive.filter((s) =>
      s.pacienteExpediente.toLowerCase().includes(term) ||
      s.pacienteNombre.toLowerCase().includes(term) ||
      s.medicoNombre.toLowerCase().includes(term),
    );
  }, [pendientesLive, busquedaPendientes]);

  // Resultados de búsqueda acotados por el tab activo: Emitidas filtra por
  // estado; Todas muestra el resultado completo de la búsqueda.
  const resultadosFiltrados = useMemo(() => {
    if (resultados === null) return null;
    if (filtro === "emitida") return resultados.filter((s) => s.estado === "emitida");
    return resultados;
  }, [resultados, filtro]);

  const listaMostrada = useMemo(
    () => (filtro === "pendiente" ? filtradasPendientes : (resultadosFiltrados ?? [])),
    [filtro, filtradasPendientes, resultadosFiltrados],
  );

  const duplicadoKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of listaMostrada) counts.set(dupKey(s), (counts.get(dupKey(s)) ?? 0) + 1);
    const dup = new Set<string>();
    counts.forEach((n, k) => { if (n >= 2) dup.add(k); });
    return dup;
  }, [listaMostrada]);

  let contenidoTabla: React.ReactNode;
  if (filtro === "pendiente" && loadingPend) {
    contenidoTabla = (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  } else if (filtro !== "pendiente" && resultadosFiltrados === null) {
    contenidoTabla = (
      <p className="text-sm text-slate-400 py-16 text-center">
        Escribe un expediente o elige un rango de fechas y pulsa Buscar.
      </p>
    );
  } else if (filtro !== "pendiente" && buscando) {
    contenidoTabla = (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  } else if (listaMostrada.length === 0) {
    contenidoTabla = (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
        <FileText size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
        <p className="text-sm text-slate-500">
          {filtro === "pendiente" ? "No hay incapacidades pendientes." : "Sin resultados para esa búsqueda."}
        </p>
      </div>
    );
  } else {
    contenidoTabla = (
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
              {listaMostrada.map((s) => {
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
        {filtro !== "pendiente" && (
          <p className="text-xs text-slate-500 px-4 py-2 border-t border-slate-100 dark:border-slate-800">{listaMostrada.length} resultado(s)</p>
        )}
      </div>
    );
  }

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
          {totalHoy !== null && (
            <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl">
              <FileText size={14} className="text-slate-400" />
              {totalHoy} {totalHoy === 1 ? "incapacidad" : "incapacidades"} hoy
            </div>
          )}
          {pendientesLive.length > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-3 py-1.5 rounded-xl">
              <Clock size={14} />
              {pendientesLive.length} pendientes de emitir
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

      {/* Buscador: texto libre sobre pendientes (en vivo) o búsqueda bajo demanda (Emitidas/Todas) */}
      {filtro === "pendiente" ? (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={busquedaPendientes}
            onChange={(e) => setBusquedaPendientes(e.target.value)}
            placeholder="Buscar entre las pendientes por expediente, paciente o médico…"
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <History size={14} className="text-slate-400 flex-shrink-0" />
            <p className="text-xs text-slate-500">
              Busca por expediente (trae todas las de ese paciente) o por rango de fecha de alta. La búsqueda se hace bajo demanda para no releer toda la colección.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={busquedaExpediente}
                onChange={(e) => setBusquedaExpediente(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") buscar(); }}
                placeholder="Buscar por expediente…"
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 shrink-0">Alta desde</span>
              <DateField value={fechaDesde} onChange={setFechaDesde} placeholder="Alta desde" ariaLabel="Filtrar alta desde" clearable />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 shrink-0">Hasta</span>
              <DateField value={fechaHasta} onChange={setFechaHasta} placeholder="Alta hasta" ariaLabel="Filtrar alta hasta" clearable />
            </div>
            <button
              onClick={buscar}
              disabled={buscando || sinCriterio}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              <Search size={13} /> {buscando ? "Buscando…" : "Buscar"}
            </button>
            {(busquedaExpediente || fechaDesde || fechaHasta || resultados !== null) && (
              <button
                onClick={limpiarBusqueda}
                className="flex items-center gap-1 px-2.5 py-2 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
              >
                <X size={12} /> Limpiar
              </button>
            )}
          </div>
          {errorBusqueda && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {errorBusqueda}
            </div>
          )}
        </div>
      )}

      {/* Leyenda de duplicados */}
      {duplicadoKeys.size > 0 && (
        <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle size={13} className="flex-shrink-0" />
          <span>Las filas en rojo son posibles duplicados: mismo paciente con más de una solicitud el mismo día.</span>
        </div>
      )}

      {contenidoTabla}
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
