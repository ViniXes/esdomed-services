"use client";

import { CargaExpedientesCreados } from "@/components/consultaExterna/CargaExpedientesCreados";

// Misma carga que Pacientes → "Expedientes creados CE", dentro del portal de
// Consulta Externa para las digitadoras (agenda_ce), que no tienen el panel de ESDOMED.
export default function ExpedientesCreadosConsultaExternaPage() {
  return <CargaExpedientesCreados />;
}
