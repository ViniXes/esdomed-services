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
} from "lucide-react";
import { TIPO_MEDICO_CRITICO_LABEL } from "@/lib/cuidadosCriticos";

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
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <p className="text-sm text-slate-500">{greeting()},</p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading">
          {profile?.nombre?.startsWith("Dr") ? profile.nombre : `Dr. ${profile?.nombre}`}
        </h1>
        {(profile?.tipoMedico || profile?.servicio) && (
          <p className="text-sm text-slate-500 mt-0.5">
            {profile.tipoMedico
              ? `${TIPO_MEDICO_CRITICO_LABEL[profile.tipoMedico]} · ${profile.servicios?.length ?? 0} unidades`
              : profile.servicio}
          </p>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Acciones rápidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { href: "/medico/traslados/nueva", label: "Solicitar traslado",  desc: "Nueva solicitud de cama o servicio", icon: ArrowRightLeft, color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-50 dark:bg-blue-950",   border: "border-blue-200 dark:border-blue-900",   hoverBorder: "hover:border-blue-400" },
            { href: "/medico/fallecidos",      label: "Notificar fallecido", desc: "Registrar defunción de paciente",    icon: HeartPulse,     color: "text-rose-600 dark:text-rose-400",   bg: "bg-rose-50 dark:bg-rose-950",   border: "border-rose-200 dark:border-rose-900",   hoverBorder: "hover:border-rose-400" },
            { href: "/medico/impresiones",     label: "Subir impresión",     desc: "Enviar PDF para imprimir",           icon: Printer,        color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950", border: "border-violet-200 dark:border-violet-900", hoverBorder: "hover:border-violet-400" },
          ].map(({ href, label, desc, icon: Icon, color, bg, border, hoverBorder }) => (
            <Link key={href} href={href}
              className={`group flex items-center gap-4 bg-white dark:bg-slate-900 rounded-2xl border ${border} ${hoverBorder} p-4 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5`}
            >
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
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Mis solicitudes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

          <Link href="/medico/traslados" className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-900 p-4 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-blue-50 dark:bg-blue-950 rounded-lg flex items-center justify-center">
                  <ArrowRightLeft size={14} className="text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Traslados</span>
              </div>
              <ChevronRight size={14} className="text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors" />
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <StatPill label="Pend." value={trasladoStats.pendientes} icon={Clock} color="text-amber-600 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-950" />
              <StatPill label="Apro." value={trasladoStats.aprobados} icon={CheckCircle2} color="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-950" />
              <StatPill label="Rech." value={trasladoStats.rechazados} icon={XCircle} color="text-red-500 dark:text-red-400" bg="bg-red-50 dark:bg-red-950" />
            </div>
          </Link>

          <Link href="/medico/fallecidos" className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-rose-200 dark:hover:border-rose-900 p-4 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-rose-50 dark:bg-rose-950 rounded-lg flex items-center justify-center">
                  <HeartPulse size={14} className="text-rose-600 dark:text-rose-400" />
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Fallecidos</span>
              </div>
              <ChevronRight size={14} className="text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors" />
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-center">
              <StatPill label="Pendiente" value={fallecidoStats.pendientes} icon={Clock} color="text-amber-600 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-950" />
              <StatPill label="Confirmado" value={fallecidoStats.confirmados} icon={CheckCircle2} color="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-950" />
            </div>
          </Link>

          <Link href="/medico/impresiones" className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-violet-200 dark:hover:border-violet-900 p-4 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-violet-50 dark:bg-violet-950 rounded-lg flex items-center justify-center">
                  <Printer size={14} className="text-violet-600 dark:text-violet-400" />
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Impresiones</span>
              </div>
              <ChevronRight size={14} className="text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors" />
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-center">
              <StatPill label="Pendiente" value={impresionStats.pendientes} icon={Clock} color="text-amber-600 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-950" />
              <StatPill label="Impreso" value={impresionStats.impresos} icon={CheckCircle2} color="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-950" />
            </div>
          </Link>
        </div>
      </div>

      {/* Recent activity */}
      {recent.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
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
    </div>
  );
}

function StatPill({ label, value, icon: Icon, color, bg }: {
  label: string; value: number; icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className={`${bg} rounded-lg py-1.5 px-1`}>
      <div className={`flex items-center justify-center gap-1 ${color}`}>
        <Icon size={11} />
        <span className="text-sm font-bold font-heading">{value}</span>
      </div>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{label}</p>
    </div>
  );
}
