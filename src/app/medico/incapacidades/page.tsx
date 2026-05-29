"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { FileText, Plus, CheckCircle2, Clock, Pencil } from "lucide-react";
import type { SolicitudIncapacidad } from "@/types";
import { toDate, formatFecha } from "@/lib/pacientes/helpers";

export default function MedicoIncapacidadesPage() {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState<SolicitudIncapacidad[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "incapacidades"), where("medicoId", "==", user.uid));
    return onSnapshot(q, (s) => {
      const docs = s.docs
        .map((d) => {
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
        })
        .sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime());
      setSolicitudes(docs);
      setLoading(false);
    });
  }, [user]);

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente").length;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-50 dark:bg-amber-950 rounded-xl flex items-center justify-center border border-amber-200 dark:border-amber-900">
            <FileText size={17} className="text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Incapacidades
          </h1>
        </div>
        <Link
          href="/medico/incapacidades/nueva"
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={15} /> Nueva solicitud
        </Link>
      </div>

      {pendientes > 0 && (
        <div className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-3 py-1.5 rounded-xl mb-4 w-fit">
          <Clock size={14} />
          {pendientes} esperando emisión
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : solicitudes.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <FileText size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">No has solicitado incapacidades.</p>
          <Link
            href="/medico/incapacidades/nueva"
            className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
          >
            <Plus size={14} /> Solicitar la primera
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {solicitudes.map((s) => (
            <div
              key={s.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-amber-300 dark:hover:border-amber-900 transition-all shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-[15px]">
                      {s.pacienteNombre}
                    </p>
                    {s.estado === "pendiente" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-full">
                        <Clock size={10} /> Pendiente
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={10} /> Emitida
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Exp. <span className="font-mono">{s.pacienteExpediente}</span>
                    {" · "}
                    {s.diasIncapacidad} {s.diasIncapacidad === 1 ? "día" : "días"}
                    {" · "}
                    Alta {formatFecha(s.fechaAlta)}
                  </p>
                  {s.estado === "emitida" && s.emitidaPorNombre && (
                    <p className="text-xs text-green-700 dark:text-green-400 mt-1.5">
                      Emitida por {s.emitidaPorNombre}
                      {s.emitidaEn && ` · ${formatFecha(s.emitidaEn)}`}
                    </p>
                  )}
                </div>
                {s.estado === "pendiente" && (
                  <Link
                    href={`/medico/incapacidades/${s.id}/editar`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors flex-shrink-0"
                  >
                    <Pencil size={12} />
                    Editar
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
