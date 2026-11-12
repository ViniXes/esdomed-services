"use client";

// Reporte de incapacidades de Emergencia para los médicos de Emergencia: el
// mismo reporte de "Incapacidades por área" de ESDOMED, fijo en Emergencia
// (mismos números que esa fila), con las incapacidades de todos los médicos.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ReporteIncapacidadesPorArea } from "@/components/incapacidades/ReporteIncapacidadesPorArea";
import { puedeVerReporteIncapacidades } from "@/lib/accesoReporteIncapacidades";

export default function ReporteIncapacidadesEmergenciaPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const puedeVer = puedeVerReporteIncapacidades(profile);

  useEffect(() => {
    if (!loading && !puedeVer) router.replace("/medico");
  }, [loading, puedeVer, router]);

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!puedeVer) return null;

  return (
    <ReporteIncapacidadesPorArea
      titulo="Reporte de incapacidades"
      subtitulo="Incapacidades de Emergencia que ESDOMED emitió en un período"
      areaFija="Emergencia"
    />
  );
}
