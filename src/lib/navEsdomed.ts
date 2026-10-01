import {
  Activity, Ambulance, ArrowRightLeft, BarChart3, BedDouble, Briefcase, Building2, CalendarClock,
  CalendarRange, ChartColumn, ChartPie, ClipboardCheck, ClipboardList, ClipboardPen, Contact,
  DoorOpen, FileClock, FileCode2, FileInput, FileSearch, FileText, FolderOpen, HandHeart, HeartPulse,
  History, LayoutDashboard, LayoutGrid, ListChecks, LogIn, NotebookPen, Phone, PhoneCall, Printer, Radar,
  SearchCheck, Send, Settings, ShieldAlert, ShieldCheck, Siren, Stethoscope, Syringe, Table2, TrendingUp,
  UserCheck, UserPlus, Users, UserSearch, UsersRound,
} from "lucide-react";
import type { NavItem } from "@/components/Sidebar";
import type { Pendientes } from "@/contexts/NotificacionesContext";
import type { UserProfile } from "@/types";
import { construirMenu, type SeccionNav } from "@/lib/navRegistro";
import { esJefeCuidadosCriticos, puedeVerModuloCuidadosCriticos } from "@/lib/accesoCuidadosCriticos";

type Perfil = UserProfile | null | undefined;

// ── Quién ve qué (mismas reglas que tenía el layout de /dashboard) ──
// El auxiliar administrativo ESDOMED comparte los permisos operativos de ESDOMED.
const esEsdomed = (p: Perfil) => p?.role === "esdomed" || p?.role === "asistente_esdomed";
const esAdmin = (p: Perfil) => p?.role === "admin";
const esdomedOAdmin = (p: Perfil) => esEsdomed(p) || esAdmin(p);
// SIMMOW es solo del rol esdomed puntual + admin — NO asistente_esdomed
// (pedido explícito del usuario, no sigue el agrupamiento esEsdomed habitual).
const veSimmow = (p: Perfil) => p?.role === "esdomed" || esAdmin(p);
// Solicitudes SIS y aprobación de trámites: superusuario + auxiliar administrativo.
const adminOAsistente = (p: Perfil) => esAdmin(p) || p?.role === "asistente_esdomed";

// Menú de ESDOMED y admin por tarea, en acordeón como los portales de área.
// Pacientes va primero (pedido del usuario); luego las bandejas (lo que llega
// de los médicos y demás áreas).
// Nota: las entradas sin predicado (Traslados, Traslado a otro hospital,
// Fallecidos, Impresiones) también las ve el jefe UCI/UCIN que entra al
// dashboard, igual que antes de pasar al registro.
const MENU_ESDOMED: SeccionNav[] = [
  {
    entradas: [
      { href: "/dashboard", label: "Inicio", icon: LayoutDashboard, exact: true, visibleSi: p => !esJefeCuidadosCriticos(p) },
    ],
  },
  {
    titulo: "Pacientes",
    icon: Contact,
    visibleSi: esdomedOAdmin,
    entradas: [
      { href: "/dashboard/buscar-paciente", label: "Buscar paciente", icon: UserSearch },
      { href: "/dashboard/control-ingresos", label: "Control de ingresos", icon: FileInput },
      { href: "/dashboard/pacientes", label: "Pacientes", icon: BedDouble },
      { href: "/dashboard/hospital-dia", label: "Hospital Día", icon: Syringe },
      { href: "/dashboard/busqueda-telefono", label: "Búsqueda de teléfono", icon: Phone, visibleSi: esAdmin },
    ],
  },
  {
    titulo: "Solicitudes y avisos",
    icon: Send,
    entradas: [
      { href: "/dashboard/traslados", label: "Traslados", icon: ArrowRightLeft, globo: "traslados" },
      { href: "/dashboard/traslados-externos", label: "Traslado a otro hospital", icon: Building2, globo: "trasladosExternos" },
      { href: "/dashboard/fallecidos", label: "Fallecidos", icon: HeartPulse, tone: "rose", globo: "fallecidos" },
      { href: "/dashboard/altas-vivos", label: "Verificación de Altas", icon: LogIn, globo: "altas", visibleSi: esdomedOAdmin },
      // Consulta de solo lectura: sin globo (ESDOMED no recibe los casos, los recibe el comité).
      { href: "/dashboard/conapina-fgr", label: "Avisos CONAPINA / FGR", icon: ShieldAlert, visibleSi: esdomedOAdmin },
    ],
  },
  {
    titulo: "Documentos",
    icon: FolderOpen,
    entradas: [
      { href: "/dashboard/impresiones", label: "Impresiones", icon: Printer, globo: "impresiones" },
      { href: "/dashboard/incapacidades", label: "Incapacidades", icon: FileText, globo: "incapacidades", visibleSi: esdomedOAdmin },
      // Constancias de egresos anteriores a la app, cargadas del FIEH y asignadas a un médico.
      { href: "/dashboard/incapacidades/reposicion", label: "Reposición de incapacidad", icon: FileClock, visibleSi: esdomedOAdmin },
      { href: "/dashboard/anexo5", label: "Anexo 5", icon: ClipboardList, globo: "anexo5", visibleSi: esdomedOAdmin },
      { href: "/dashboard/simmow", label: "SIMMOW", icon: FileCode2, globo: "simmowReportes", visibleSi: veSimmow },
    ],
  },
  {
    titulo: "Emergencia",
    icon: Siren,
    visibleSi: esdomedOAdmin,
    entradas: [
      { href: "/dashboard/emergencia", label: "Atendidos en emergencia", icon: Ambulance },
      { href: "/dashboard/emergencia/egresos", label: "Egresos de emergencia", icon: DoorOpen },
    ],
  },
  {
    titulo: "Cuidados críticos",
    icon: Activity,
    visibleSi: puedeVerModuloCuidadosCriticos,
    entradas: [
      { href: "/medico/cuidados-criticos", label: "Registro UCI / UCIN", icon: ClipboardPen },
      // Globo: solicitudes de eliminación de fichas (lo resuelve el admin).
      { href: "/dashboard/cuidados-criticos", label: "Matriz UCI / UCIN", icon: LayoutGrid, globo: "cuidadosCriticosEliminacion" },
      { href: "/dashboard/cuidados-criticos/indicadores", label: "Indicadores UCI / UCIN", icon: BarChart3 },
    ],
  },
  {
    // El admin ve las vistas de gestiones (el menú de TS propiamente dicho vive
    // en navTrabajoSocial).
    titulo: "Trabajo Social",
    icon: HandHeart,
    visibleSi: esAdmin,
    entradas: [
      { href: "/dashboard/gestiones/asignaciones", label: "Asignaciones", icon: UserCheck },
      { href: "/dashboard/gestiones/rastreo", label: "Rastreo", icon: Radar },
      { href: "/dashboard/gestiones/seguimiento", label: "Seguimiento", icon: ListChecks },
      { href: "/dashboard/gestiones", label: "Registro de gestiones", icon: NotebookPen },
      { href: "/dashboard/gestiones/productividad", label: "Productividad de TS", icon: BarChart3 },
      { href: "/dashboard/gestiones/bitacora", label: "Bitácora del paciente", icon: FileClock },
    ],
  },
  {
    titulo: "Reportes",
    icon: ChartPie,
    visibleSi: esdomedOAdmin,
    entradas: [
      { href: "/dashboard/reportes", label: "Reportería de egresos", icon: ChartColumn },
      { href: "/dashboard/reportes/tabuladores", label: "Tabuladores", icon: Table2 },
      { href: "/dashboard/reportes/tablas-totales", label: "Tablas totales", icon: LayoutGrid },
      { href: "/dashboard/reportes/traslados", label: "Traslados de cama", icon: ArrowRightLeft },
      { href: "/dashboard/productividad/esdomed", label: "Productividad", icon: TrendingUp },
    ],
  },
  {
    titulo: "Mi área",
    icon: Briefcase,
    visibleSi: esdomedOAdmin,
    entradas: [
      { href: "/esdomed-horarios/mi-horario", label: "Mi horario", icon: CalendarClock },
      { href: "/dashboard/personal", label: "Personal de trabajo", icon: UsersRound },
      { href: "/horarios", label: "Horarios por área", icon: CalendarRange },
      { href: "/dashboard/mis-tramites", label: "Trámites de Personal", icon: ClipboardList },
      { href: "/dashboard/directorio-extensiones", label: "Directorio de extensiones", icon: PhoneCall },
    ],
  },
  {
    titulo: "Administración",
    icon: ShieldCheck,
    visibleSi: adminOAsistente,
    entradas: [
      { href: "/dashboard/usuarios", label: "Usuarios", icon: Users, visibleSi: esAdmin },
      { href: "/dashboard/registros-medicos", label: "Registros de médicos", icon: Stethoscope, visibleSi: esAdmin },
      { href: "/dashboard/solicitudes-usuarios-sis", label: "Solicitudes SIS", icon: UserPlus, globo: "solicitudesSis" },
      { href: "/dashboard/aprobacion-tramites", label: "Gestión de Trámites", icon: ClipboardCheck },
      { href: "/dashboard/configuracion/servicios", label: "Configuración", icon: Settings, visibleSi: esAdmin },
    ],
  },
  {
    // Trazabilidad: quién buscó y consultó qué paciente.
    titulo: "Auditoría",
    icon: History,
    visibleSi: esAdmin,
    entradas: [
      { href: "/dashboard/historial-busquedas", label: "Historial de búsquedas", icon: SearchCheck },
      { href: "/dashboard/historial-consultas", label: "Historial de consultas", icon: FileSearch },
    ],
  },
];

// DIMES no tiene rutas alternativas: solo su bandeja SIS de solo lectura.
const MENU_DIMES: SeccionNav[] = [
  {
    entradas: [{ href: "/dashboard/solicitudes-usuarios-sis", label: "Solicitudes SIS", icon: UserPlus, globo: "solicitudesSis" }],
  },
];

// Menú del dashboard para ESDOMED, admin, DIMES y el jefe UCI/UCIN. Trabajo
// Social tiene el suyo en navTrabajoSocial.
export function navItemsEsdomed(profile: Perfil, pendientes: Pendientes): NavItem[] {
  return construirMenu(profile?.role === "medico_licenciado_dimes" ? MENU_DIMES : MENU_ESDOMED, profile, pendientes);
}
