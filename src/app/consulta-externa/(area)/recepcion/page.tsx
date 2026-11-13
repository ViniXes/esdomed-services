"use client";

import { UserPlus } from "lucide-react";
import { EnConstruccion } from "@/components/consultaExterna/EnConstruccion";

export default function RecepcionPrimeraVezPage() {
  return (
    <EnConstruccion
      titulo="Recepción primera vez"
      subtitulo="Ventanilla de ESDOMED · pacientes que vienen por primera vez"
      icono={UserPlus}
      queHara={[
        "Buscar la cita de hoy por expediente, DUI o nombre.",
        "Marcar «Llegó» y entregar al paciente su código de llamado.",
        "El paciente aparece de inmediato en la estación de su especialidad, marcado como primera vez.",
      ]}
    />
  );
}
