import {
  Clock, HeartPulse, Inbox, LogOut, LogIn, UserSearch,
  ShieldAlert, Activity, Megaphone, Users,
} from "lucide-react";
import type { NavItem } from "@/components/Sidebar";

interface BadgesPsicologia {
  fallecidos: number;
  recepciones: number;
  conapina: number;
}

// Menú de Psicología, compartido entre su layout y el del Comité de Lesiones:
// Psicología apoya ese trámite y usa las mismas vistas de /comite-lesiones
// (salvo Reportes, que sigue siendo solo del comité). Al mostrar ambas áreas
// el mismo menú, cruzar de una a otra es transparente para el usuario.
export function navItemsPsicologia(pendientes: BadgesPsicologia): NavItem[] {
  return [
    { href: "/psicologia/buscar-paciente",   label: "Buscar Paciente",   icon: UserSearch },
    { href: "/psicologia/pacientes-activos", label: "Pacientes activos", icon: Clock },
    { href: "/psicologia/altas",             label: "Altas efectivas",   icon: LogOut },
    { href: "/psicologia/altas-vivos",       label: "Verificación de Altas", icon: LogIn },
    { href: "/psicologia/fallecidos",        label: "Fallecidos",        icon: HeartPulse, tone: "rose", badge: pendientes.fallecidos },
    { href: "/psicologia/recepciones",       label: "Recepciones",       icon: Inbox,      badge: pendientes.recepciones },
    { href: "/comite-lesiones/conapina-fgr",          label: "Avisos CONAPINA / FGR", icon: ShieldAlert, badge: pendientes.conapina, group: "Lesiones intencionales" },
    { href: "/comite-lesiones/lesiones-ingresos",     label: "Ingresos por lesión",   icon: Activity,    group: "Lesiones intencionales" },
    { href: "/comite-lesiones/solicitudes",           label: "Avisos pendientes a notificar / Solicitudes al área médica", icon: Megaphone, group: "Lesiones intencionales" },
    { href: "/comite-lesiones/ingresos-adolescentes", label: "Ingresos adolescentes", icon: Users,       group: "Lesiones intencionales" },
  ];
}
