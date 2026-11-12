"use client";

// Incapacidades emitidas por área (ESDOMED/admin). El reporte vive en
// ReporteIncapacidadesPorArea: los médicos de Emergencia usan el mismo, fijo en
// su área, desde /medico/emergencia/incapacidades.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ReporteIncapacidadesPorArea } from "@/components/incapacidades/ReporteIncapacidadesPorArea";

export default function IncapacidadesPorAreaPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const esEsdomed = profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";

  useEffect(() => {
    if (!authLoading && profile && !esEsdomed) router.replace("/dashboard");
  }, [authLoading, profile, esEsdomed, router]);

  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!esEsdomed) return null;

  return (
    <ReporteIncapacidadesPorArea
      titulo="Incapacidades por área"
      subtitulo="Cuántas emitió ESDOMED en un período, por servicio del paciente"
      hrefDetalle={(id) => `/dashboard/incapacidades/${id}`}
    />
  );
}
