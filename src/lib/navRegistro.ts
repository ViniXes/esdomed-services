import type { LucideIcon } from "lucide-react";
import type { NavItem } from "@/components/Sidebar";
import type { Pendientes } from "@/contexts/NotificacionesContext";
import type { UserProfile } from "@/types";

// Registro declarativo del menú lateral. Cada portal describe su menú como
// secciones de entradas; quién ve qué se decide con `visibleSi` sobre el perfil
// que AuthContext ya cargó (0 lecturas extra). Una marca nueva por persona
// (como apoyaComiteLesiones) es un predicado, no otro `if` en cada layout.
//
// Reglas del menú (ver CLAUDE.md → Navegación):
//   - Secciones planas por tarea, máximo ~6 entradas cada una. Sin submenús
//     desplegables (`children`): el usuario los descartó por confusos.
//   - Una vista hermana SIN globo va como pestaña dentro de su página; una con
//     globo (trabajo asignado a esta persona) merece fila propia.
//   - Único tono permitido: rose, para fallecidos/defunciones.

type Perfil = UserProfile | null | undefined;

export interface EntradaNav {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Solo activo en la ruta exacta (p. ej. Inicio, que es prefijo de todo). */
  exact?: boolean;
  /** Contador de NotificacionesContext que se muestra como globo. */
  globo?: keyof Pendientes;
  tone?: "rose";
  /** Sin predicado, la ve todo el que entra al portal. */
  visibleSi?: (profile: Perfil) => boolean;
}

export interface SeccionNav {
  /** Encabezado del grupo. Sin título, las entradas van arriba (Inicio). */
  titulo?: string;
  /** Ícono del botón padre cuando el menú se pinta como acordeón (portales de área). */
  icon?: LucideIcon;
  /** Tono del ícono del padre; solo rose, para el grupo de defunciones. */
  tone?: "rose";
  entradas: EntradaNav[];
  visibleSi?: (profile: Perfil) => boolean;
}

const visible = (x: { visibleSi?: (p: Perfil) => boolean }, profile: Perfil) =>
  !x.visibleSi || x.visibleSi(profile);

/**
 * Arma los NavItem del Sidebar. Sin perfil devuelve un menú vacío: mejor no
 * pintar nada que pintar el menú de otro rol y que salte al cargar el perfil.
 */
export function construirMenu(secciones: SeccionNav[], profile: Perfil, pendientes: Pendientes): NavItem[] {
  if (!profile) return [];
  return secciones
    .filter(s => visible(s, profile))
    .flatMap(s =>
      s.entradas
        .filter(e => visible(e, profile))
        .map(e => ({
          href: e.href,
          label: e.label,
          icon: e.icon,
          exact: e.exact,
          tone: e.tone,
          badge: e.globo ? pendientes[e.globo] : undefined,
          group: s.titulo,
          groupIcon: s.icon,
          groupTone: s.tone,
        })),
    );
}

/**
 * Guard de ruta derivado del mismo registro: una ruta está vetada si cae bajo
 * una entrada (la más específica) que este perfil no ve. Así el menú y el veto
 * no pueden desalinearse.
 */
export function rutaVetada(entradas: EntradaNav[], profile: Perfil, pathname: string): boolean {
  let entrada: EntradaNav | undefined;
  for (const e of entradas) {
    const calza = pathname === e.href || pathname.startsWith(e.href + "/");
    if (calza && (!entrada || e.href.length > entrada.href.length)) entrada = e;
  }
  return !!entrada && !visible(entrada, profile);
}
