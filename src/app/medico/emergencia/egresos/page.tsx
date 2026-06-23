"use client";

import { AtencionesEmergenciaConsulta } from "@/components/emergencia/AtencionesEmergenciaConsulta";

// Portal médico: egresos de emergencia (vivo/fallecido), solo lectura.
export default function EgresosEmergenciaMedicoPage() {
  return <AtencionesEmergenciaConsulta vista="egresos" />;
}
