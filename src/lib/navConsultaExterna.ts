import { BarChart3, CalendarClock, CalendarDays, CalendarPlus, ClipboardCheck, FileClock, FileUp, HandHeart, IdCard, LayoutDashboard, ListOrdered, Megaphone, UserPen, MessageSquareText, NotebookPen, Tv, UserPlus } from "lucide-react";
import type { NavItem } from "@/components/Sidebar";
import type { UserProfile } from "@/types";
import type { Pendientes } from "@/contexts/NotificacionesContext";
import { construirMenu, type EntradaNav, type SeccionNav } from "@/lib/navRegistro";
import {
  esAgendaCE,
  esCuentaEstacion,
  esTrabajoSocialCE,
  gestionaConsultaExterna,
  registraCitas2027,
  registraGestionesTSCE,
  subeExpedientesCreadosCE,
  veCatalogoTarjetas,
  veLlamadosCE,
} from "@/lib/accesoConsultaExterna";

type Perfil = UserProfile | null | undefined;

// Menú del subsistema de Consulta Externa (/consulta-externa). Es un subsistema
// como Mi horario: layout y menú propios, y "Volver al panel" para quien tiene
// el panel de ESDOMED (la cuenta de estación no lo tiene; este es su portal).
//
// La pantalla de llamados (/consulta-externa/pantalla) no está en el menú: va a
// pantalla completa, sin menú, y se abre desde "Pantallas de llamados".
// "Mensaje a pantalla" sí está, pero también abre sin menú (es la única página
// de la cuenta de mensajes, que la usa desde el celular).

export const MENU_CONSULTA_EXTERNA: SeccionNav[] = [
  {
    // agenda_ce solo ve la pestaña de citas 2027; Trabajo Social, solo lo suyo.
    entradas: [{ href: "/consulta-externa", label: "Inicio", icon: LayoutDashboard, exact: true, visibleSi: (p) => !esAgendaCE(p) && !esTrabajoSocialCE(p) }],
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
    // Una sola pantalla: formulario arriba y lista abajo, como Control de ingresos.
    // El catálogo de agendas se abre desde un botón de esa pantalla (solo gestión).
    entradas: [
      { href: "/consulta-externa/citas-2027", label: "Citas 2027", icon: CalendarPlus, visibleSi: registraCitas2027 },
      // Reporte SIS "Expedientes creados": lo suben las digitadoras de Consulta Externa.
      { href: "/consulta-externa/expedientes-creados", label: "Expedientes creados", icon: ClipboardCheck, visibleSi: subeExpedientesCreadosCE },
      // Actualizaciones de datos hechas en el SIS (solo el registro, para productividad).
      { href: "/consulta-externa/actualizaciones", label: "Actualizaciones", icon: UserPen, visibleSi: subeExpedientesCreadosCE },
      // Pacientes con DUI en cualquier agenda cargada del SIS (con DUI = ya tiene tarjeta). También agenda_ce.
      { href: "/consulta-externa/tarjetas", label: "Catálogo de tarjetas", icon: IdCard, visibleSi: veCatalogoTarjetas },
      // agenda_ce consulta su horario en el plan de trabajo ESDOMED (solo lectura).
      { href: "/esdomed-horarios/mi-horario", label: "Mi horario", icon: CalendarClock, visibleSi: esAgendaCE },
    ],
  },
  {
    // Trabajo Social de Consulta Externa. La jefatura lo consulta desde su propio
    // menú (navTrabajoSocial), no desde aquí.
    titulo: "Trabajo Social",
    icon: HandHeart,
    visibleSi: registraGestionesTSCE,
    entradas: [
      { href: "/consulta-externa/trabajo-social", label: "Registro de gestiones", icon: NotebookPen },
      { href: "/consulta-externa/trabajo-social/bitacora", label: "Bitácora del paciente", icon: FileClock },
      { href: "/consulta-externa/trabajo-social/productividad", label: "Productividad", icon: BarChart3 },
    ],
  },
  {
    titulo: "Llamados",
    icon: Megaphone,
    visibleSi: veLlamadosCE,
    entradas: [
      { href: "/consulta-externa/mensajes", label: "Mensaje a pantalla", icon: MessageSquareText },
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
  if (!profile || esCuentaEstacion(profile) || esAgendaCE(profile) || esTrabajoSocialCE(profile)) return undefined;
  return { href: "/dashboard", label: "Volver al panel" };
}
