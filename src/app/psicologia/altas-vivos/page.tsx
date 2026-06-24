"use client";

import { AltasVivosView } from "@/components/altas/AltasVivosView";

// Psicología consulta el informe de Verificación de Altas (solo lectura + Excel;
// las acciones de procesar/observar/crear están gateadas por rol en la vista).
export default function AltasVivosPsicologiaPage() {
  return <AltasVivosView />;
}
