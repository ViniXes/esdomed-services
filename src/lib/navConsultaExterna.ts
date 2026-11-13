import { CalendarDays, FileUp, LayoutDashboard, ListOrdered, Megaphone, Tv, UserPlus } from "lucide-react";
import type { NavItem } from "@/components/Sidebar";
import type { UserProfile } from "@/types";
import type { Pendientes } from "@/contexts/NotificacionesContext";
import { construirMenu, type EntradaNav, type SeccionNav } from "@/lib/navRegistro";
import { esCuentaEstacion, gestionaConsultaExterna } from "@/lib/accesoConsultaExterna";

type Perfil = UserProfile | null | undefined;

// Menú del subsistema de Consulta Externa (/consulta-externa). Es un subsistema
// como Mi horario: layout y menú propios, y "Volver al panel" para quien tiene
// el panel de ESDOMED (la cuenta de estación no lo tiene; este es su portal).
//
// La pantalla de llamados (/consulta-externa/pantalla) no está en el menú: va a
// pantalla completa, sin menú, y se abre desde "Pantallas de llamados".

export const MENU_CONSULTA_EXTERNA: SeccionNav[] = [
  {
    entradas: [{ href: "/consulta-externa", label: "Inicio", icon: LayoutDashboard, exact: true }],
  },
  {
    titulo: "Agenda del día",
    icon: CalendarDays,
    visibleSi: gestionaConsultaExterna,
    entradas: [
      { href: "/consulta-externa/agenda", label: "Cargar citas del SIS", icon: FileUp },
      { href: "/consulta-externa/recepcion", label: "Recepción primera vez", icon: UserPlus },
    ],
  },
  {
    titulo: "Llamados",
    icon: Megaphone,
    entradas: [
      { href: "/consulta-externa/estacion", label: "Estación de especialidad", icon: ListOrdered },
      { href: "/consulta-externa/pantallas", label: "Pantallas de llamados", icon: Tv, visibleSi: gestionaConsultaExterna },
    ],
  },
];

export const ENTRADAS_CONSULTA_EXTERNA: EntradaNav[] = MENU_CONSULTA_EXTERNA.flatMap((s) =>
  s.entradas.map((e) => ({ ...e, visibleSi: (p: Perfil) => (!s.visibleSi || s.visibleSi(p)) && (!e.visibleSi || e.visibleSi(p)) })),
);

// Sin globos todavía: el subsistema no usa NotificacionesContext.
const SIN_PENDIENTES = {} as Pendientes;

export function navItemsConsultaExterna(profile: Perfil): NavItem[] {
  return construirMenu(MENU_CONSULTA_EXTERNA, profile, SIN_PENDIENTES);
}

/** Salida al panel principal; la cuenta de estación no tiene otro panel. */
export function regresoConsultaExterna(profile: Perfil): { href: string; label: string } | undefined {
  if (!profile || esCuentaEstacion(profile)) return undefined;
  return { href: "/dashboard", label: "Volver al panel" };
}
