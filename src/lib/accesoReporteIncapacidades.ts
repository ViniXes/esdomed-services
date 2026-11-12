import type { UserProfile } from "@/types";
import { mismoServicio } from "@/lib/servicios";

// "Reporte de incapacidades" del portal médico: el mismo reporte que ESDOMED ve
// en "Incapacidades por área", fijo en Emergencia. Lo ven todos los médicos de
// Emergencia, con las incapacidades de todos (no solo las propias).

export function puedeVerReporteIncapacidades(profile?: UserProfile | null) {
  return profile?.role === "medico" && mismoServicio(profile.servicio, "Emergencia");
}
