"use client";

import { AtencionesEmergenciaConsulta } from "@/components/emergencia/AtencionesEmergenciaConsulta";

// Portal médico: consulta de solo lectura. No importa ni enlaza a la ficha de
// ESDOMED (los médicos no tienen acceso a /dashboard/pacientes).
export default function EmergenciaMedicoPage() {
  return <AtencionesEmergenciaConsulta />;
}
