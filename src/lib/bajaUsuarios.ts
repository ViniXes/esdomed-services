import type { TipoBajaUsuario, UserProfile } from "@/types";

// Catálogo de tipos de baja de un usuario (UserProfile.baja.tipo). El tipo
// "fallecimiento" tiene un efecto visible: la persona se muestra "En memoria"
// (tarjeta dorada con estrella) en Personal de trabajo (/dashboard/personal).

export const TIPOS_BAJA: { value: TipoBajaUsuario; label: string }[] = [
  { value: "fallecimiento", label: "Fallecimiento" },
  { value: "retiro", label: "Retiro o renuncia" },
  { value: "traslado", label: "Traslado a otra institución" },
  { value: "otro", label: "Otro" },
];

export const TIPO_BAJA_LABEL: Record<TipoBajaUsuario, string> = {
  fallecimiento: "Fallecimiento",
  retiro: "Retiro o renuncia",
  traslado: "Traslado a otra institución",
  otro: "Otro",
};

export function esTipoBaja(valor: unknown): valor is TipoBajaUsuario {
  return TIPOS_BAJA.some((t) => t.value === valor);
}

/** Compañero fallecido: dado de baja por fallecimiento. Se muestra "en memoria". */
export function esEnMemoria(u: Pick<UserProfile, "activo" | "baja">): boolean {
  return u.activo === false && u.baja?.tipo === "fallecimiento";
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" (la fecha de baja es una fecha calendario, sin hora). */
export function fechaBajaCorta(iso?: string): string {
  return iso ? iso.split("-").reverse().join("/") : "";
}
