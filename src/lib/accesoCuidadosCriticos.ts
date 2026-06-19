import type { UserProfile } from "@/types";

function normalizarIdentidad(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function puedeVerModuloCuidadosCriticos(profile?: UserProfile | null) {
  if (profile?.role !== "admin") return false;
  const identidad = normalizarIdentidad(`${profile.nombre ?? ""} ${profile.email ?? ""} ${profile.username ?? ""}`);
  return identidad.includes("alfonso") && identidad.includes("montes");
}

export const puedeVerIndicadoresCuidadosCriticos = puedeVerModuloCuidadosCriticos;
