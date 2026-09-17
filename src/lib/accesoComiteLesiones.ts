import type { UserProfile } from "@/types";

// Quién entra al módulo del Comité de Lesiones Intencionales y con qué alcance.
// El acceso va por ROL (comite_lesiones, psicologia, trabajo_social) salvo para
// los médicos, que es por PERSONA: la marca `apoyaComiteLesiones` del perfil
// (se activa desde /dashboard/usuarios; las reglas la leen del mismo perfil).

/** Médico marcado para apoyar al comité. */
export function apoyaComiteLesiones(profile?: UserProfile | null) {
  return profile?.role === "medico" && profile.apoyaComiteLesiones === true;
}

/** Ve el módulo COMPLETO (incluye Ingresos adolescentes y Reportes). */
export function veComiteCompleto(profile?: UserProfile | null) {
  return profile?.role === "comite_lesiones" || apoyaComiteLesiones(profile);
}
