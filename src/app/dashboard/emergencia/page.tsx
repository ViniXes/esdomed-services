"use client";

import { AtencionesEmergenciaConsulta } from "@/components/emergencia/AtencionesEmergenciaConsulta";

export default function EmergenciaDashboardPage() {
  return (
    <AtencionesEmergenciaConsulta
      permiteImportar
      fichaHref={(pacienteId) => `/dashboard/pacientes/${pacienteId}`}
    />
  );
}
