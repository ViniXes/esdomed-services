"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, orderBy, onSnapshot, limit } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { SolicitudTraslado, NotificacionFallecido, SolicitudImpresion } from "@/types";
import {
  ArrowRightLeft, HeartPulse, Printer,
  Clock, CheckCircle2, XCircle, Plus, ChevronRight,
  Activity, BedDouble, FileClock, Stethoscope,
  BookOpen, FileText, ExternalLink,
} from "lucide-react";
import { TIPO_MEDICO_CRITICO_LABEL } from "@/lib/cuidadosCriticos";

// Guías y material de apoyo colgados en public/documentos. Se abren en otra
// pestaña; para sumar uno nuevo basta copiar el archivo y agregarlo aquí.
const DOCUMENTOS = [
  {
    href: "/documentos/tutorial-notificacion-avisos.pdf",
    titulo: "Tutorial: notificación de avisos CONAPINA / FGR",
    desc: "Paso a paso para notificar los avisos desde el portal, con el directorio de las juntas de protección",
  },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

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

export default function MedicoDashboardPage() {
  const { user, profile } = useAuth();
  const [traslados, setTraslados] = useState<SolicitudTraslado[]>([]);
  const [fallecidos, setFallecidos] = useState<NotificacionFallecido[]>([]);
  const [impresiones, setImpresiones] = useState<SolicitudImpresion[]>([]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const q1 = query(collection(db, "traslados"), where("medicoId", "==", uid), orderBy("creadoEn", "desc"), limit(20));
    const q2 = query(collection(db, "notificaciones_fallecidos"), where("medicoId", "==", uid), orderBy("creadoEn", "desc"), limit(20));
    const q3 = query(collection(db, "solicitudes_impresion"), where("medicoId", "==", uid), orderBy("creadoEn", "desc"), limit(20));
    const u1 = onSnapshot(q1, s => setTraslados(s.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudTraslado))));
    const u2 = onSnapshot(q2, s => setFallecidos(s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido))));
    const u3 = onSnapshot(q3, s => setImpresiones(s.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudImpresion))));
    return () => { u1(); u2(); u3(); };
  }, [user]);

  const trasladoStats = {
    pendientes: traslados.filter(t => t.estado === "pendiente" || t.estado === "en_revision").length,
    aprobados:  traslados.filter(t => t.estado === "aprobado").length,
    rechazados: traslados.filter(t => t.estado === "rechazado").length,
  };
  const fallecidoStats = {
    pendientes:  fallecidos.filter(f => f.estado === "pendiente").length,
    confirmados: fallecidos.filter(f => f.estado === "confirmado").length,
  };
  const impresionStats = {
    pendientes: impresiones.filter(i => i.estado === "pendiente").length,
    impresos:   impresiones.filter(i => i.estado === "impreso").length,
  };

  const recent = [
    ...traslados.slice(0, 5).map(t => ({
      id: t.id!, tipo: "traslado" as const,
      titulo: t.pacienteNombre || `Exp. ${t.pacienteExpediente}`, 
      subtitulo: t.tipoTraslado === "intercambio" ? "Intercambio de camas" : `${t.servicioOrigen} → ${t.tipoTraslado === "interno" ? t.servicioOrigen : t.servicioDestino}`,
      estado: t.estado, ts: t.creadoEn,
    })),
    ...impresiones.slice(0, 5).map(i => ({
      id: i.id!, tipo: "impresion" as const,
      titulo: i.descripcion, subtitulo: `${i.copias} copia(s)`,
      estado: i.estado, ts: i.creadoEn,
    })),
  ]
    .sort((a, b) => {
      const at = (a.ts as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
      const bt = (b.ts as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
      return bt - at;
    })
    .slice(0, 5);

  const STATE_STYLE: Record<string, string> = {
    pendiente:   "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900",
    en_revision: "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900",
    aprobado:    "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900",
    rechazado:   "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900",
    confirmado:  "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900",
    impreso:     "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900",
  };
  const STATE_LABEL: Record<string, string> = {
    pendiente: "Pendiente", en_revision: "En revisión", aprobado: "Aprobado",
    rechazado: "Rechazado", confirmado: "Confirmado", impreso: "Impreso",
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-7">

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-6 text-white shadow-lg shadow-cyan-950/15 md:px-7 md:py-7">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/10" />
        <div className="absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-teal-300/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-50">
              <Activity size={13} aria-hidden="true" />
              Portal médico
            </div>
            <p className="text-sm text-cyan-100/80">{greeting()},</p>
            <h1 className="mt-0.5 text-2xl font-bold font-heading tracking-tight md:text-3xl">
              {profile?.nombre?.startsWith("Dr") ? profile.nombre : `Dr. ${profile?.nombre}`}
            </h1>
            {(profile?.tipoMedico || profile?.servicio) && (
              <p className="mt-2 text-sm text-cyan-50/80">
                {profile.tipoMedico
                  ? `${TIPO_MEDICO_CRITICO_LABEL[profile.tipoMedico]} · ${profile.servicios?.length ?? 0} unidades`
                  : profile.servicio}
              </p>
            )}
          </div>
          <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-cyan-50 sm:flex">
            <Stethoscope size={27} strokeWidth={1.7} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Acciones rápidas</h2>
            <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">Inicia una gestión clínica con un solo paso.</p>
          </div>
          <span className="hidden rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 sm:inline">Nueva gestión</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { href: "/medico/traslados/nueva", label: "Solicitar traslado",  desc: "Nueva solicitud de cama o servicio", icon: ArrowRightLeft, color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-50 dark:bg-blue-950",   border: "border-blue-200 dark:border-blue-900",   hoverBorder: "hover:border-blue-400" },
            { href: "/medico/fallecidos",      label: "Notificar fallecido", desc: "Registrar defunción de paciente",    icon: HeartPulse,     color: "text-rose-600 dark:text-rose-400",   bg: "bg-rose-50 dark:bg-rose-950",   border: "border-rose-200 dark:border-rose-900",   hoverBorder: "hover:border-rose-400" },
            { href: "/medico/impresiones",     label: "Subir impresión",     desc: "Enviar PDF para imprimir",           icon: Printer,        color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950", border: "border-violet-200 dark:border-violet-900", hoverBorder: "hover:border-violet-400" },
          ].map(({ href, label, desc, icon: Icon, color, bg, border, hoverBorder }) => (
            <Link prefetch={false} key={href} href={href}
              className={`group relative flex items-center gap-4 overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border ${border} ${hoverBorder} p-4 shadow-sm hover:shadow-lg hover:shadow-slate-200/70 dark:hover:shadow-none transition-all duration-200 hover:-translate-y-0.5`}
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-transparent opacity-70" />
              <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={20} className={color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                  {label}
                  <Plus size={13} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                </p>
                <p className="text-xs text-slate-500 truncate">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Mis solicitudes</h2>
            <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">Consulta el estado de tus gestiones activas.</p>
          </div>
          <FileClock size={17} className="text-teal-600 dark:text-teal-400" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

          <Link prefetch={false} href="/medico/traslados" className="group relative overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-cyan-300 dark:hover:border-cyan-800 p-4 shadow-sm hover:shadow-lg hover:shadow-cyan-950/5 transition-all duration-200 hover:-translate-y-0.5">
            <div className="absolute left-0 top-0 h-full w-1 bg-cyan-500" />
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-cyan-50 dark:bg-cyan-950/70 rounded-xl flex items-center justify-center">
                  <BedDouble size={18} className="text-cyan-700 dark:text-cyan-300" strokeWidth={1.9} />
                </div>
                <div>
                  <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Traslados</span>
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-cyan-700/70 dark:text-cyan-300/70">Camas y servicios</span>
                </div>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-all group-hover:translate-x-0.5 group-hover:bg-cyan-50 group-hover:text-cyan-700 dark:bg-slate-800 dark:text-slate-500 dark:group-hover:bg-cyan-950 dark:group-hover:text-cyan-300">
                <ChevronRight size={15} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <StatPill label="Pend." value={trasladoStats.pendientes} icon={Clock} color="text-amber-700 dark:text-amber-300" bg="bg-amber-50 dark:bg-amber-950/60" border="border-amber-100 dark:border-amber-900/60" />
              <StatPill label="Apro." value={trasladoStats.aprobados} icon={CheckCircle2} color="text-emerald-700 dark:text-emerald-300" bg="bg-emerald-50 dark:bg-emerald-950/60" border="border-emerald-100 dark:border-emerald-900/60" />
              <StatPill label="Rech." value={trasladoStats.rechazados} icon={XCircle} color="text-rose-700 dark:text-rose-300" bg="bg-rose-50 dark:bg-rose-950/60" border="border-rose-100 dark:border-rose-900/60" />
            </div>
          </Link>

          <Link prefetch={false} href="/medico/fallecidos" className="group relative overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-800 p-4 shadow-sm hover:shadow-lg hover:shadow-rose-950/5 transition-all duration-200 hover:-translate-y-0.5">
            <div className="absolute left-0 top-0 h-full w-1 bg-rose-500" />
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-rose-50 dark:bg-rose-950/70 rounded-xl flex items-center justify-center">
                  <HeartPulse size={18} className="text-rose-700 dark:text-rose-300" strokeWidth={1.9} />
                </div>
                <div>
                  <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Fallecidos</span>
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-rose-700/70 dark:text-rose-300/70">Notificaciones clínicas</span>
                </div>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-all group-hover:translate-x-0.5 group-hover:bg-rose-50 group-hover:text-rose-700 dark:bg-slate-800 dark:text-slate-500 dark:group-hover:bg-rose-950 dark:group-hover:text-rose-300">
                <ChevronRight size={15} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-center">
              <StatPill label="Pendiente" value={fallecidoStats.pendientes} icon={Clock} color="text-amber-700 dark:text-amber-300" bg="bg-amber-50 dark:bg-amber-950/60" border="border-amber-100 dark:border-amber-900/60" />
              <StatPill label="Confirmado" value={fallecidoStats.confirmados} icon={CheckCircle2} color="text-emerald-700 dark:text-emerald-300" bg="bg-emerald-50 dark:bg-emerald-950/60" border="border-emerald-100 dark:border-emerald-900/60" />
            </div>
          </Link>

          <Link prefetch={false} href="/medico/impresiones" className="group relative overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800 p-4 shadow-sm hover:shadow-lg hover:shadow-indigo-950/5 transition-all duration-200 hover:-translate-y-0.5">
            <div className="absolute left-0 top-0 h-full w-1 bg-indigo-500" />
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-950/70 rounded-xl flex items-center justify-center">
                  <Printer size={18} className="text-indigo-700 dark:text-indigo-300" strokeWidth={1.9} />
                </div>
                <div>
                  <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Impresiones</span>
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-indigo-700/70 dark:text-indigo-300/70">Documentos solicitados</span>
                </div>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-all group-hover:translate-x-0.5 group-hover:bg-indigo-50 group-hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-500 dark:group-hover:bg-indigo-950 dark:group-hover:text-indigo-300">
                <ChevronRight size={15} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-center">
              <StatPill label="Pendiente" value={impresionStats.pendientes} icon={Clock} color="text-amber-700 dark:text-amber-300" bg="bg-amber-50 dark:bg-amber-950/60" border="border-amber-100 dark:border-amber-900/60" />
              <StatPill label="Impreso" value={impresionStats.impresos} icon={CheckCircle2} color="text-emerald-700 dark:text-emerald-300" bg="bg-emerald-50 dark:bg-emerald-950/60" border="border-emerald-100 dark:border-emerald-900/60" />
            </div>
          </Link>
        </div>
      </div>

      {/* Recent activity */}
      {recent.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 font-heading text-sm">Mis solicitudes recientes</h2>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {recent.map((item) => (
              <li key={`${item.tipo}-${item.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${item.tipo === "traslado" ? "bg-blue-50 dark:bg-blue-950" : "bg-violet-50 dark:bg-violet-950"}`}>
                  {item.tipo === "traslado"
                    ? <ArrowRightLeft size={13} className="text-blue-500 dark:text-blue-400" />
                    : <Printer size={13} className="text-violet-500 dark:text-violet-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.titulo}</p>
                  <p className="text-xs text-slate-500 truncate">{item.subtitulo}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`text-[11px] font-medium border rounded-full px-2 py-0.5 ${STATE_STYLE[item.estado] ?? "bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"}`}>
                    {STATE_LABEL[item.estado] ?? item.estado}
                  </span>
                  <span className="text-[11px] text-slate-500">{timeAgo(item.ts)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Documentos */}
      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Documentos</h2>
            <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">Guías y material de apoyo del servicio.</p>
          </div>
          <BookOpen size={17} className="text-teal-600 dark:text-teal-400" aria-hidden="true" />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {DOCUMENTOS.map((doc) => (
              <li key={doc.href}>
                <a
                  href={doc.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-4 px-5 py-4 hover:bg-blue-50/60 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
                    <FileText size={18} className="text-blue-600 dark:text-blue-300" strokeWidth={1.9} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-blue-900 dark:group-hover:text-white transition-colors">
                      {doc.titulo}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{doc.desc}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="hidden rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:inline">
                      PDF
                    </span>
                    <ExternalLink
                      size={15}
                      className="text-slate-400 group-hover:text-blue-600 dark:group-hover:text-cyan-300 transition-colors"
                      aria-hidden="true"
                    />
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, icon: Icon, color, bg, border }: {
  label: string; value: number; icon: React.ElementType; color: string; bg: string; border: string;
}) {
  return (
    <div className={`${bg} ${border} rounded-xl border px-2 py-2 text-left`}>
      <div className={`flex items-center gap-1.5 ${color}`}>
        <Icon size={13} strokeWidth={2.25} />
        <span className="text-base font-bold font-heading leading-none">{value}</span>
      </div>
      <p className="mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate">{label}</p>
    </div>
  );
}
