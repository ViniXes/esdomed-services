"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { ArrowLeft, Printer } from "lucide-react";
import type { PlanTrabajo } from "@/types";
import { labelPeriodo } from "@/lib/esdomed/plan";
import { getAreaTrabajo, planAreaDocId } from "@/lib/areas-trabajo";
import { PlanPrintLayout } from "@/components/esdomed-horarios/PlanPrintLayout";

// Rol impreso (formato oficial RH) del plan mensual de un área del hospital.
export default function ImprimirPlanAreaPage({ params }: { params: Promise<{ area: string; periodo: string }> }) {
  const { area: areaId, periodo } = use(params);
  const area = getAreaTrabajo(areaId);
  const router = useRouter();
  const [plan, setPlan] = useState<PlanTrabajo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!area) {
      setError("Área no encontrada.");
      setLoading(false);
      return;
    }
    getDoc(doc(db, "planes_trabajo_areas", planAreaDocId(area.id, periodo)))
      .then((snap) => {
        if (!snap.exists()) {
          setError("No hay un plan guardado para este mes.");
        } else {
          setPlan({ id: snap.id, ...snap.data() } as PlanTrabajo);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }, [area, periodo]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !plan || !area) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6">
        <p className="text-sm text-slate-500 mb-3">{error ?? "No se pudo cargar el plan"}</p>
        <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline">← Volver</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-200 overflow-y-auto print:bg-white print:static print:inset-auto print:overflow-visible">
      {/* Toolbar — oculto al imprimir */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors">
            <ArrowLeft size={15} /> Volver
          </button>
          <p className="text-xs text-slate-500">Rol de turnos · {area.corto} · {labelPeriodo(periodo)}</p>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 bg-[#1a4e70] hover:bg-[#16425f] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Printer size={14} /> Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {/* Hoja */}
      <div className="py-6 px-4 print:p-0">
        <div className="bg-white shadow-lg mx-auto w-fit min-w-full print:shadow-none print:w-auto print:min-w-0">
          <PlanPrintLayout plan={plan} departamento={area.nombre} />
        </div>
      </div>

      {/* CSS global de impresión: horizontal + oculta sidebar/barras del layout */}
      <style jsx global>{`
        @page {
          size: landscape;
          margin: 8mm;
        }
        @media print {
          aside,
          [class*="md:hidden fixed top-0"] {
            display: none !important;
          }
          main {
            padding: 0 !important;
            overflow: visible !important;
          }
          html, body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}
