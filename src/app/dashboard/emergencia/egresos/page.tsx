"use client";

import { AtencionesEmergenciaConsulta } from "@/components/emergencia/AtencionesEmergenciaConsulta";

export default function EgresosEmergenciaDashboardPage() {
  return (
    <AtencionesEmergenciaConsulta
      vista="egresos"
      fichaHref={(pacienteId) => `/dashboard/pacientes/${pacienteId}`}
    />
  );
}
