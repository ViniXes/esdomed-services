import {
  Activity, LayoutDashboard, ArrowRightLeft, BarChart3, HeartPulse, Printer, FileText, FileClock,
  FileStack, ClipboardList, Phone, Table2, UserSearch, Ambulance, Building2, BookOpenText,
  ShieldAlert, Megaphone, Users,
  KeyRound,
} from "lucide-react";
import type { NavItem } from "@/components/Sidebar";
import type { UserProfile } from "@/types";
import { apoyaComiteLesiones } from "@/lib/accesoComiteLesiones";

interface BadgesMedico {
  solicitudesLesion: number;
  reposiciones: number;
  conapina: number;
}

const baseNavItems: NavItem[] = [
  { href: "/medico",                 label: "Inicio",          icon: LayoutDashboard, exact: true, tone: "blue" },
  { href: "/medico/cola-expedientes", label: "Cola de expedientes", icon: FileStack, tone: "indigo" },
  { href: "/medico/buscar-paciente", label: "Buscar Paciente", icon: UserSearch, tone: "cyan" },
  {
    href: "/medico/emergencia",
    label: "Atendidos en emergencia",
    icon: Ambulance,
    tone: "blue",
    children: [
      { href: "/medico/emergencia/egresos", label: "Egresos de emergencia", icon: HeartPulse },
      { href: "/medico/censos", label: "Censos de emergencia", icon: BookOpenText, exact: true },
    ],
  },
  { href: "/medico/busqueda-telefono", label: "Busqueda de telefono", icon: Phone, tone: "teal" },
  { href: "/medico/traslados",       label: "Traslados",       icon: ArrowRightLeft, tone: "cyan" },
  { href: "/medico/traslado-externo", label: "Traslado a otro hospital", icon: Building2, tone: "blue" },
  { href: "/medico/fallecidos",      label: "Fallecidos",      icon: HeartPulse, tone: "rose" },
  { href: "/medico/conapina-fgr",    label: "CONAPINA / FGR",  icon: ShieldAlert, tone: "blue" },
  { href: "/medico/impresiones",     label: "Impresiones",     icon: Printer, tone: "violet" },
  { href: "/medico/reposicion-llave-sis", label: "Reposición de llave SIS", icon: KeyRound, tone: "violet" },
  {
    href: "/medico/incapacidades",
    label: "Incapacidades",
    icon: FileText,
    tone: "blue",
    // Bandeja de reposiciones: incapacidades de egresos anteriores a la app que
    // ESDOMED cargó del FIEH y asignó a este médico para que las complete.
    children: [
      { href: "/medico/incapacidades/reposicion", label: "Reposición de incapacidad", icon: FileClock },
    ],
  },
  { href: "/medico/anexo5/nueva",    label: "Anexo 5",         icon: ClipboardList, tone: "cyan" },
];

// Grupo "Lesiones intencionales" para los médicos que apoyan al comité: las
// MISMAS vistas que ve el comité (incluidos Ingresos adolescentes y Reportes),
// como grupo plano al final del menú — igual que en Psicología y Trabajo
// Social. NO como ítem desplegable: se probó y al usuario le pareció confuso.
// (El Sidebar pinta primero los ítems sin grupo y luego los grupos.)
function itemsComiteLesiones(pendientes: BadgesMedico): NavItem[] {
  const G_LESIONES = "Lesiones intencionales";
  return [
    { href: "/comite-lesiones/conapina-fgr",          label: "Avisos CONAPINA / FGR", icon: ShieldAlert, tone: "blue",   badge: pendientes.conapina, group: G_LESIONES },
    { href: "/comite-lesiones/lesiones-ingresos",     label: "Ingresos por lesión",   icon: Activity,    tone: "cyan",   group: G_LESIONES },
    { href: "/comite-lesiones/solicitudes",           label: "Avisos pendientes a notificar / Solicitudes al área médica", icon: Megaphone, tone: "blue", group: G_LESIONES },
    { href: "/comite-lesiones/ingresos-adolescentes", label: "Ingresos adolescentes", icon: Users,       tone: "cyan",   group: G_LESIONES },
    { href: "/comite-lesiones/reportes",              label: "Reportes",              icon: BarChart3,   tone: "blue",   group: G_LESIONES },
  ];
}

// Menú del portal médico, compartido entre su layout y el de /comite-lesiones
// (donde entran los médicos que apoyan al comité con su propio menú, para que
// el cruce entre áreas sea transparente). Mismo patrón que navPsicologia y
// navTrabajoSocial.
export function navItemsMedico(profile: UserProfile | null | undefined, pendientes: BadgesMedico): NavItem[] {
  const esAdmin = profile?.role === "admin";
  const tipoMedicoNavegacion = esAdmin ? "uci_ucin" : profile?.tipoMedico;
  const esJefeUciUcin = profile?.tipoMedico === "jefe_uci_ucin";

  const items: NavItem[] = tipoMedicoNavegacion
    ? [
        baseNavItems[0],
        { href: "/medico/cuidados-criticos", label: "Registro UCI / UCIN", icon: Activity, exact: true, tone: "blue" },
        { href: "/medico/cuidados-criticos/registros", label: "Mis registros UCI / UCIN", icon: Table2, tone: "teal" },
        ...((esAdmin || esJefeUciUcin) ? [{ href: "/dashboard/cuidados-criticos/indicadores", label: "Indicadores UCI / UCIN", icon: BarChart3, tone: "blue" as const }] : []),
        ...(esAdmin ? [] : baseNavItems.slice(1)),
      ]
    : baseNavItems;

  // El globo del ítem CONAPINA/FGR son las solicitudes de notificación que el
  // comité difunde a todos los médicos y siguen pendientes. El de Incapacidades
  // (y su subítem) son las reposiciones asignadas a este médico por completar.
  const conGlobos = items.map(i => {
    if (i.href === "/medico/conapina-fgr") return { ...i, badge: pendientes.solicitudesLesion };
    if (i.href === "/medico/incapacidades") {
      return {
        ...i,
        badge: pendientes.reposiciones,
        children: i.children?.map(c => (c.href === "/medico/incapacidades/reposicion" ? { ...c, badge: pendientes.reposiciones } : c)),
      };
    }
    return i;
  });

  return apoyaComiteLesiones(profile) ? [...conGlobos, ...itemsComiteLesiones(pendientes)] : conGlobos;
}
