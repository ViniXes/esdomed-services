import {
  BarChart3, CheckCheck, ClipboardCheck, Contact, DoorOpen, FileClock, FileStack, HandHeart, HeartCrack,
  HeartPulse, Inbox, LayoutDashboard, ListChecks, LogIn, NotebookPen, Radar, UserCheck, UserSearch, UsersRound,
} from "lucide-react";
import type { NavItem } from "@/components/Sidebar";
import type { Pendientes } from "@/contexts/NotificacionesContext";
import type { UserProfile } from "@/types";
import { construirMenu, type SeccionNav } from "@/lib/navRegistro";
import { SECCION_LESIONES } from "@/lib/navComiteLesiones";

// Menú de Trabajo Social por tarea, en acordeón como el portal médico. Las
// gestiones del día van primero; las altas juntan la prealta y confirmación
// propias de TS con la verificación de ESDOMED.
const MENU_TRABAJO_SOCIAL: SeccionNav[] = [
  {
    // /dashboard muestra a TS su propio inicio (no el panel de ESDOMED).
    entradas: [{ href: "/dashboard", label: "Inicio", icon: LayoutDashboard, exact: true }],
  },
  {
    titulo: "Gestiones",
    icon: HandHeart,
    entradas: [
      { href: "/dashboard/gestiones/asignaciones", label: "Asignaciones", icon: UserCheck },
      { href: "/dashboard/gestiones/rastreo", label: "Rastreo", icon: Radar },
      { href: "/dashboard/gestiones/seguimiento", label: "Seguimiento", icon: ListChecks },
      { href: "/dashboard/gestiones", label: "Registro de gestiones", icon: NotebookPen },
      { href: "/dashboard/gestiones/productividad", label: "Productividad", icon: BarChart3 },
    ],
  },
  {
    titulo: "Altas",
    icon: DoorOpen,
    entradas: [
      { href: "/dashboard/notificacion-altas", label: "Notificación de Prealta", icon: ClipboardCheck },
      { href: "/dashboard/confirmacion-alta", label: "Confirmación de Alta", icon: CheckCheck },
      { href: "/dashboard/altas-vivos", label: "Verificación de Altas", icon: LogIn, globo: "altas" },
    ],
  },
  {
    titulo: "Defunciones",
    icon: HeartCrack,
    tone: "rose",
    entradas: [
      // TS usa la vista de revisión (estilo Psicología), no la de ESDOMED.
      { href: "/dashboard/defunciones", label: "Fallecidos", icon: HeartPulse, tone: "rose", globo: "fallecidos" },
      { href: "/dashboard/recepciones", label: "Recepciones", icon: Inbox },
    ],
  },
  {
    titulo: "Pacientes",
    icon: Contact,
    entradas: [
      { href: "/dashboard/buscar-paciente", label: "Buscar paciente", icon: UserSearch },
      // La de los médicos, en consulta: sin registrar censos, con Excel.
      { href: "/dashboard/cola-expedientes", label: "Cola de expedientes", icon: FileStack },
      { href: "/dashboard/gestiones/bitacora", label: "Bitácora del paciente", icon: FileClock },
      { href: "/dashboard/visitas", label: "Visitas", icon: UsersRound },
    ],
  },
  // Avisos, ingresos por lesión y solicitudes a médicos (el resto lo filtra la
  // propia entrada).
  SECCION_LESIONES,
];

// Menú de Trabajo Social, compartido entre el layout de /dashboard y el del
// Comité de Lesiones: TS apoya ese trámite y usa las mismas vistas de
// /comite-lesiones. Al mostrar ambas áreas el mismo menú, cruzar de una a otra
// es transparente. Mismo patrón que navPsicologia.
export function navItemsTrabajoSocial(profile: UserProfile | null | undefined, pendientes: Pendientes): NavItem[] {
  return construirMenu(MENU_TRABAJO_SOCIAL, profile, pendientes);
}
