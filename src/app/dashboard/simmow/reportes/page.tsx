"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  listarReportesBugsSimmow,
  actualizarEstadoReporteBugSimmow,
  type ReporteBugSimmow,
  type EstadoReporteBug,
} from "@/lib/simmow/reportesBugs";

const ETIQUETA_FLUJO: Record<string, string> = {
  hospitalaria: "Atención Hospitalaria",
  ambulatoria: "Atención Ambulatoria",
  otro: "Otro",
};

const ETIQUETA_ESTADO: Record<EstadoReporteBug, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  no_es_error: "No es error",
};

const ESTILO_ESTADO: Record<EstadoReporteBug, string> = {
  pendiente: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  confirmado: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  no_es_error: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

/**
 * Revisión (solo admin) de los reportes técnicos enviados desde
 * ReportarErrorSimmow.tsx — marcar "confirmado" o "no es error" cierra el
 * ciclo que exigen los términos de uso de la herramienta (terminosSimmow.ts,
 * secciones 3-5): un dato mal grabado solo puede excusarse con un reporte de
 * este canal que además haya sido confirmado aquí.
 */
export default function ReportesSimmowPage() {
  const router = useRouter();
  const { profile, loading } = useAuth();
  const [reportes, setReportes] = useState<ReporteBugSimmow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [guardandoId, setGuardandoId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && profile && profile.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile || profile.role !== "admin") return;
    listarReportesBugsSimmow().then((r) => {
      setReportes(r);
      setCargando(false);
    });
  }, [profile]);

  if (!profile || profile.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const resolver = async (id: string, estado: EstadoReporteBug) => {
    setGuardandoId(id);
    try {
      await actualizarEstadoReporteBugSimmow(id, estado, notas[id] ?? "", profile.nombre);
      setReportes(await listarReportesBugsSimmow());
    } finally {
      setGuardandoId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <button
        onClick={() => router.push("/dashboard/simmow")}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4"
      >
        <ArrowLeft size={14} /> Volver a SIMMOW
      </button>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">
        Reportes de errores — Herramienta SIMMOW
      </h1>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
        Reportes técnicos enviados por el personal. Marque cada uno como confirmado o no es error para cerrar el
        ciclo que exigen los términos de uso de la herramienta.
      </p>

      {cargando ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : reportes.length === 0 ? (
        <p className="text-sm text-slate-500">No hay reportes.</p>
      ) : (
        <div className="space-y-3">
          {reportes.map((r) => (
            <div
              key={r.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {r.nombreUsuario} · {ETIQUETA_FLUJO[r.flujo] ?? r.flujo}
                  {r.expediente && <span className="text-slate-400"> · Exp. {r.expediente}</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTILO_ESTADO[r.estado]}`}>
                  {ETIQUETA_ESTADO[r.estado]}
                </span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap mb-2">{r.descripcion}</p>
              <p className="text-xs text-slate-400 mb-3">
                {r.fecha ? r.fecha.toLocaleString("es-SV") : "—"}
                {r.resueltoPor && ` · Resuelto por ${r.resueltoPor}`}
              </p>

              {r.estado === "pendiente" && (
                <div className="space-y-2">
                  <textarea
                    value={notas[r.id] ?? ""}
                    onChange={(e) => setNotas((n) => ({ ...n, [r.id]: e.target.value }))}
                    placeholder="Nota (opcional)…"
                    rows={2}
                    className="w-full text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-100"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolver(r.id, "confirmado")}
                      disabled={guardandoId === r.id}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50"
                    >
                      Confirmar error
                    </button>
                    <button
                      onClick={() => resolver(r.id, "no_es_error")}
                      disabled={guardandoId === r.id}
                      className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium disabled:opacity-50"
                    >
                      No es error
                    </button>
                  </div>
                </div>
              )}
              {r.notaAdmin && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">Nota: {r.notaAdmin}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
