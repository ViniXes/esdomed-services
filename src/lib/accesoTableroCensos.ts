import type { UserProfile } from "@/types";
import { mismoServicio } from "@/lib/servicios";

// El tablero de censos es del personal médico de Emergencia. El admin entra por
// la ruta directa, porque el menú de Emergencia no se le muestra.

export function puedeVerTableroCensos(profile?: UserProfile | null) {
  return profile?.role === "admin"
    || (profile?.role === "medico" && mismoServicio(profile.servicio, "Emergencia"));
}

/** Cuántas atenciones lleva cada persona: no se muestra a todo el equipo. */
export function puedeVerDetallePersonal(profile?: UserProfile | null) {
  return profile?.role === "admin" || profile?.veDetallePersonalCensos === true;
}
