import type { UserProfile } from "@/types";

export function puedeVerModuloCuidadosCriticos(profile?: UserProfile | null) {
  return profile?.role === "admin";
}

export const puedeVerIndicadoresCuidadosCriticos = puedeVerModuloCuidadosCriticos;
