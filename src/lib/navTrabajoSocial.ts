import {
  Activity, BarChart3, CheckCheck, ClipboardCheck, DoorOpen, FileClock, HeartPulse,
  Inbox, ListChecks, LogIn, Megaphone, NotebookPen, Radar, ShieldAlert, UserCheck, UserSearch,
} from "lucide-react";
import type { NavItem } from "@/components/Sidebar";

interface BadgesTrabajoSocial {
  fallecidos: number;
  altas: number;
  conapina: number;
}

// Menú de Trabajo Social, compartido entre el layout de /dashboard y el del
// Comité de Lesiones: Trabajo Social apoya ese trámite y usa las mismas vistas
// de /comite-lesiones (avisos, ingresos por lesión y solicitudes a médicos —
// NO ingresos adolescentes ni reportes, que siguen siendo del comité). Al
// mostrar ambas áreas el mismo menú, cruzar de una a otra es transparente.
// Mismo patrón que navPsicologia.
export function navItemsTrabajoSocial(pendientes: BadgesTrabajoSocial): NavItem[] {
  const G_PROCESOS_ESDOMED = "Procesos con ESDOMED";
  const G_GESTIONES_ALTAS = "Gestiones de Altas";
  const G_TRABAJO_SOCIAL = "Trabajo Social";
  const G_LESIONES = "Lesiones intencionales";

  return [
    // ── Procesos con ESDOMED ── flujos de TS que dependen de o responden a ESDOMED.
    { href: "/dashboard/buscar-paciente", label: "Buscar Paciente", icon: UserSearch, group: G_PROCESOS_ESDOMED },
    // TS usa la vista de revisión (estilo Psicología), no la de ESDOMED.
    { href: "/dashboard/defunciones", label: "Defunciones", icon: HeartPulse, tone: "rose", badge: pendientes.fallecidos, group: G_PROCESOS_ESDOMED },
    { href: "/dashboard/recepciones", label: "Recepciones", icon: Inbox, group: G_PROCESOS_ESDOMED },
    { href: "/dashboard/altas-vivos", label: "Verificación de Altas", icon: LogIn, badge: pendientes.altas, group: G_PROCESOS_ESDOMED },

    // ── Gestiones de Altas ── Notificación + Confirmación.
    { href: "/dashboard/notificacion-altas", label: "Notificación de Prealta", icon: ClipboardCheck, group: G_GESTIONES_ALTAS },
    { href: "/dashboard/confirmacion-alta", label: "Confirmación de Alta", icon: CheckCheck, group: G_GESTIONES_ALTAS },

    // ── Trabajo Social ── cada flujo con entrada propia.
    { href: "/dashboard/gestiones/asignaciones", label: "Asignaciones", icon: UserCheck, group: G_TRABAJO_SOCIAL },
    { href: "/dashboard/gestiones/rastreo", label: "Rastreo", icon: Radar, group: G_TRABAJO_SOCIAL },
    { href: "/dashboard/gestiones/seguimiento", label: "Seguimiento", icon: ListChecks, group: G_TRABAJO_SOCIAL },
    // exact: /dashboard/gestiones es prefijo de las demás rutas del grupo.
    { href: "/dashboard/gestiones", label: "Registro de gestiones", icon: NotebookPen, group: G_TRABAJO_SOCIAL, exact: true },
    { href: "/dashboard/gestiones/productividad", label: "Productividad", icon: BarChart3, group: G_TRABAJO_SOCIAL },
    { href: "/dashboard/gestiones/bitacora", label: "Bitácora", icon: FileClock, group: G_TRABAJO_SOCIAL },
    { href: "/dashboard/visitas", label: "Visitas", icon: DoorOpen, group: G_TRABAJO_SOCIAL },

    // ── Lesiones intencionales ── vistas del Comité de Lesiones que TS apoya.
    { href: "/comite-lesiones/conapina-fgr", label: "Avisos CONAPINA / FGR", icon: ShieldAlert, badge: pendientes.conapina, group: G_LESIONES },
    { href: "/comite-lesiones/lesiones-ingresos", label: "Ingresos por lesión", icon: Activity, group: G_LESIONES },
    { href: "/comite-lesiones/solicitudes", label: "Avisos pendientes a notificar / Solicitudes al área médica", icon: Megaphone, group: G_LESIONES },
  ];
}
