import { Clock, Contact, HeartCrack, HeartPulse, Inbox, LayoutDashboard, LogIn, UserSearch } from "lucide-react";
import type { NavItem } from "@/components/Sidebar";
import type { Pendientes } from "@/contexts/NotificacionesContext";
import type { UserProfile } from "@/types";
import { construirMenu, type SeccionNav } from "@/lib/navRegistro";
import { SECCION_LESIONES } from "@/lib/navComiteLesiones";

// Menú de Psicología por tarea, en acordeón como el portal médico. Defunciones
// va primero: revisar fallecidos y confirmar recepciones es el trabajo diario.
const MENU_PSICOLOGIA: SeccionNav[] = [
  {
    entradas: [{ href: "/psicologia", label: "Inicio", icon: LayoutDashboard, exact: true }],
  },
  {
    titulo: "Defunciones",
    icon: HeartCrack,
    tone: "rose",
    entradas: [
      { href: "/psicologia/fallecidos",  label: "Fallecidos",  icon: HeartPulse, tone: "rose", globo: "fallecidos" },
      // Certificados que ESDOMED le entregó a esta persona, por confirmar.
      { href: "/psicologia/recepciones", label: "Recepciones", icon: Inbox, globo: "recepciones" },
    ],
  },
  {
    // "Altas efectivas" se retiró del menú (gastaba muchas consultas y no se
    // usaba); Verificación de Altas quedó aquí para no dejar un grupo de uno.
    titulo: "Pacientes",
    icon: Contact,
    entradas: [
      { href: "/psicologia/buscar-paciente",   label: "Buscar paciente",   icon: UserSearch },
      { href: "/psicologia/pacientes-activos", label: "Pacientes activos", icon: Clock },
      { href: "/psicologia/altas-vivos",       label: "Verificación de Altas", icon: LogIn },
    ],
  },
  // Vistas del comité salvo Reportes (lo filtra la propia entrada).
  SECCION_LESIONES,
];

// Menú de Psicología, compartido entre su layout y el del Comité de Lesiones:
// Psicología apoya ese trámite y usa las mismas vistas de /comite-lesiones.
// Al mostrar ambas áreas el mismo menú, cruzar de una a otra es transparente.
export function navItemsPsicologia(profile: UserProfile | null | undefined, pendientes: Pendientes): NavItem[] {
  return construirMenu(MENU_PSICOLOGIA, profile, pendientes);
}
