import type { UserProfile } from "@/types";

export function esJefeCuidadosCriticos(profile?: UserProfile | null) {
  return profile?.role === "medico" && profile.tipoMedico === "jefe_uci_ucin";
}

export function puedeVerModuloCuidadosCriticos(profile?: UserProfile | null) {
  return profile?.role === "admin" || esJefeCuidadosCriticos(profile);
}

export const puedeVerIndicadoresCuidadosCriticos = puedeVerModuloCuidadosCriticos;
