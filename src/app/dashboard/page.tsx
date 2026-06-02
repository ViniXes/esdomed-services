"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { SolicitudTraslado, NotificacionFallecido, SolicitudImpresion } from "@/types";
import { ArrowRightLeft, HeartPulse, Printer, ChevronRight, ChevronLeft, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

type RecentItem = {
  id: string;
  tipo: "traslado" | "fallecido" | "impresion";
  titulo: string;
  subtitulo: string;
  medico: string;
  estado: string;
  ts: unknown;
};

const MODULE_CONFIG = {
  traslado:  { label: "Traslados",   color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-50 dark:bg-blue-950",   border: "border-blue-200 dark:border-blue-900",  dot: "bg-blue-500",   icon: ArrowRightLeft, href: "/dashboard/traslados" },
  fallecido: { label: "Fallecidos",  color: "text-rose-600 dark:text-rose-400",   bg: "bg-rose-50 dark:bg-rose-950",   border: "border-rose-200 dark:border-rose-900",  dot: "bg-rose-500",   icon: HeartPulse,     href: "/dashboard/fallecidos" },
  impresion: { label: "Impresiones", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950", border: "border-violet-200 dark:border-violet-900", dot: "bg-violet-500", icon: Printer,        href: "/dashboard/impresiones" },
};

const ESTADO_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pendiente:   { icon: Clock,          color: "text-amber-500",  label: "Pendiente" },
  en_revision: { icon: AlertCircle,    color: "text-blue-500",   label: "En revisión" },
  aprobado:    { icon: CheckCircle2,   color: "text-green-500",  label: "Aprobado" },
  rechazado:   { icon: XCircle,        color: "text-red-500",    label: "Rechazado" },
  confirmado:  { icon: CheckCircle2,   color: "text-green-500",  label: "Confirmado" },
  impreso:     { icon: CheckCircle2,   color: "text-green-500",  label: "Impreso" },
};

function timeAgo(ts: unknown): string {
  if (!ts) return "—";
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora mismo";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const router = useRouter();

  // Trabajo Social no tiene panel de inicio: va directo a sus defunciones.
  useEffect(() => {
    if (profile?.role === "trabajo_social") router.replace("/dashboard/defunciones");
  }, [profile, router]);

  const [traslados, setTraslados] = useState<SolicitudTraslado[]>([]);
  const [fallecidos, setFallecidos] = useState<NotificacionFallecido[]>([]);
  const [impresiones, setImpresiones] = useState<SolicitudImpresion[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!profile || profile.role === "medico" || profile.role === "psicologia" || profile.role === "enfermeria") return;
    const q1 = query(collection(db, "traslados"), orderBy("creadoEn", "desc"), limit(50));
    const q2 = query(collection(db, "notificaciones_fallecidos"), orderBy("creadoEn", "desc"), limit(50));
    const q3 = query(collection(db, "solicitudes_impresion"), orderBy("creadoEn", "desc"), limit(50));
    const u1 = onSnapshot(q1, s => setTraslados(s.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudTraslado))));
    const u2 = onSnapshot(q2, s => setFallecidos(s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido))));
    const u3 = onSnapshot(q3, s => setImpresiones(s.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudImpresion))));
    return () => { u1(); u2(); u3(); };
  }, []);

  const pendTraslados  = traslados.filter(t => t.estado === "pendiente").length;
  const pendFallecidos = fallecidos.filter(f => f.estado === "pendiente").length;
  const pendImpresiones = impresiones.filter(i => i.estado === "pendiente").length;
  const totalPendientes = pendTraslados + pendFallecidos + pendImpresiones;

  const allRecent: RecentItem[] = [
    ...traslados.map(t => ({
      id: t.id!, tipo: "traslado" as const,
      titulo: t.pacienteNombre || `Exp. ${t.pacienteExpediente}`, 
      subtitulo: t.tipoTraslado === "intercambio" ? "Intercambio de camas" : `${t.servicioOrigen} → ${t.tipoTraslado === "interno" ? t.servicioOrigen : t.servicioDestino}`,
      medico: t.medicoNombre, estado: t.estado, ts: t.creadoEn,
    })),
    ...fallecidos.map(f => ({
      id: f.id!, tipo: "fallecido" as const,
      titulo: f.pacienteNombre, subtitulo: `${f.servicio} / Cama ${f.cama}`,
      medico: f.medicoNombre, estado: f.estado, ts: f.creadoEn,
    })),
    ...impresiones.map(i => ({
      id: i.id!, tipo: "impresion" as const,
      titulo: i.descripcion, subtitulo: `${i.copias} copia(s)`,
      medico: i.medicoNombre, estado: i.estado, ts: i.creadoEn,
    })),
  ].sort((a, b) => {
    const at = (a.ts as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
    const bt = (b.ts as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
    return bt - at;
  });

  const ITEMS_PER_PAGE = 8;
  const totalPages = Math.ceil(allRecent.length / ITEMS_PER_PAGE) || 1;
  const currentRecent = allRecent.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Auto-correct page if items change and current page is out of bounds
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [allRecent.length, currentPage, totalPages]);

  const stats = [
    { tipo: "traslado" as const,  pendientes: pendTraslados,   total: traslados.length },
    { tipo: "fallecido" as const, pendientes: pendFallecidos,  total: fallecidos.length },
    { tipo: "impresion" as const, pendientes: pendImpresiones, total: impresiones.length },
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <p className="text-sm text-slate-500">{greeting()},</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading">{profile?.nombre}</h1>
        </div>
        {totalPendientes > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400 px-3.5 py-2 rounded-xl text-sm font-medium self-start sm:self-auto">
            <Clock size={15} />
            {totalPendientes} pendiente{totalPendientes !== 1 ? "s" : ""} en total
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.map(({ tipo, pendientes, total }) => {
          const cfg = MODULE_CONFIG[tipo];
          const Icon = cfg.icon;
          const pct = total > 0 ? Math.round((pendientes / total) * 100) : 0;
          return (
            <Link key={tipo} href={cfg.href} className="group block">
              <div className={`bg-white dark:bg-slate-900 rounded-2xl border ${cfg.border} p-4 hover:shadow-md transition-all duration-200 group-hover:-translate-y-0.5`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center`}>
                    <Icon size={18} className={cfg.color} />
                  </div>
                  <span className={`text-3xl font-bold font-heading ${pendientes > 0 ? cfg.color : "text-slate-300 dark:text-slate-600"}`}>
                    {pendientes}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{cfg.label}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-500">{total} total · {pct}% pendiente</p>
                  <ChevronRight size={14} className="text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors" />
                </div>
                <div className="mt-2.5 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${cfg.dot}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Activity feed */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 font-heading">Actividad reciente</h2>
          <span className="text-xs text-slate-500">{allRecent.length} registros</span>
        </div>

        {allRecent.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slate-500 text-sm">Sin actividad registrada aún.</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {currentRecent.map((item) => {
                const mod = MODULE_CONFIG[item.tipo];
                const est = ESTADO_CONFIG[item.estado] ?? ESTADO_CONFIG["pendiente"];
                const EstIcon = est.icon;
                return (
                  <li key={`${item.tipo}-${item.id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${mod.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[11px] font-semibold uppercase tracking-wide ${mod.color}`}>{mod.label}</span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="text-xs text-slate-500 truncate">Dr. {item.medico}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate mt-0.5">{item.titulo}</p>
                      <p className="text-xs text-slate-500 truncate">{item.subtitulo}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className={`flex items-center gap-1 text-xs font-medium ${est.color}`}>
                        <EstIcon size={11} />
                        <span className="hidden sm:inline">{est.label}</span>
                      </div>
                      <span className="text-[11px] text-slate-500">{timeAgo(item.ts)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <span className="text-xs text-slate-500">
                  Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, allRecent.length)} de {allRecent.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} className="text-slate-600 dark:text-slate-400" />
                  </button>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 px-2">
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={16} className="text-slate-600 dark:text-slate-400" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
