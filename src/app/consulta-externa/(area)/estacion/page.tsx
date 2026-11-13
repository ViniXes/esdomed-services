"use client";

import { ListOrdered } from "lucide-react";
import { EnConstruccion } from "@/components/consultaExterna/EnConstruccion";

export default function EstacionEspecialidadPage() {
  return (
    <EnConstruccion
      titulo="Estación de especialidad"
      subtitulo="Enfermería · llegadas, preconsulta y llamados al consultorio"
      icono={ListOrdered}
      queHara={[
        "Al iniciar el turno, pedir el nombre de la enfermera (la cuenta es compartida por la estación).",
        "Marcar la llegada de los pacientes subsecuentes; los de primera vez llegan ya marcados desde recepción.",
        "Dos columnas: «Esperando preconsulta» y «Listos para consultorio», ordenadas por franja y hora de llegada.",
        "El sistema sugiere el siguiente según la agenda, pero la enfermera elige: Llamar, Volver a llamar, No respondió, Atendido.",
        "Cada llamado aparece en todas las pantallas con su código y destino, y se anuncia por voz.",
      ]}
    />
  );
}
