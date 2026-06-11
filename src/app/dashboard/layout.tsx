"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  Activity,
  BarChart3,
  BedDouble,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  FileText,
  HeartPulse,
  History,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogIn,
  Phone,
  Printer,
  Settings,
  Users,
  DoorOpen,
  CalendarClock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NotificacionesProvider, useNotificaciones } from "@/contexts/NotificacionesContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { ToastContainer } from "@/components/ui/ToastContainer";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const { pendientes } = useNotificaciones();
  const router = useRouter();

  useEffect(() => {
    if (
      !loading &&
      (!profile ||
        profile.role === "medico" ||
        profile.role === "psicologia" ||
        profile.role === "enfermeria")
    ) {
      router.replace("/login");
    }
  }, [loading, profile, router]);

  const roleLabel =
    profile?.role === "trabajo_social"
      ? "Trabajo Social"
      : profile?.role === "admin"
        ? "Administración"
        : "ESDOMED";

  const esTS = profile?.role === "trabajo_social";
  // El auxiliar administrativo ESDOMED comparte los mismos permisos operativos que ESDOMED.
  const esEsdomed = profile?.role === "esdomed" || profile?.role === "asistente_esdomed";
  const esAsistente = profile?.role === "asistente_esdomed";
  const esAdmin = profile?.role === "admin";
  const verControlIngresos = esEsdomed || esAdmin;
  const verPacientes       = esEsdomed || esAdmin;
  const verIncapacidades   = esEsdomed || esAdmin;
  const verAltasVivos = esEsdomed || esAdmin || esTS;
  const verRegistroAltas = esEsdomed || esAdmin;
  const verConfiguracion = esAdmin;
  const verUsuarios = esAdmin;
  const verBusquedaTelefono = esAdmin;
  const verCuidadosCriticos = esEsdomed || esAdmin;
  const verReportes = esEsdomed || esAdmin;
  const verHorario = esEsdomed || esAdmin;
  // Aprobación de trámites (ver lo subido por todos): superusuario + auxiliar administrativo.
  const verAprobacionTramites = esAdmin || esAsistente;

  // Grupos del menú — operaciones relacionadas se muestran juntas bajo un encabezado.
  const G_PACIENTES = "Gestión de pacientes";
  const G_GESTIONES_ALTAS = "Gestiones de Altas";
  const G_DOCUMENTOS = "Documentos";
  const G_REPORTES = "Reportes";
  const G_PERSONAL = "Mi área";
  const G_ADMIN = "Administración";

  const navItems: NavItem[] = [
    // Trabajo Social no usa el inicio (panel de ESDOMED); entra directo a sus vistas.
    ...(!esTS
      ? [{ href: "/dashboard", label: "Inicio", icon: LayoutDashboard, exact: true }]
      : []),

    // ── Gestión de pacientes ──
    ...(verControlIngresos
      ? [{ href: "/dashboard/control-ingresos", label: "Control ingresos", icon: FileText, group: G_PACIENTES }]
      : []),
    ...(verPacientes
      ? [{ href: "/dashboard/pacientes", label: "Pacientes", icon: BedDouble, group: G_PACIENTES }]
      : []),
    ...(verCuidadosCriticos
      ? [{ href: "/dashboard/cuidados-criticos", label: "Matriz UCI / UCIN", icon: Activity, group: G_PACIENTES }]
      : []),
    ...(verBusquedaTelefono
      ? [{ href: "/dashboard/busqueda-telefono", label: "Busqueda telefono", icon: Phone, group: G_PACIENTES }]
      : []),
    ...(!esTS
      ? [{
          href: "/dashboard/traslados",
          label: "Traslados",
          icon: ArrowRightLeft,
          badge: pendientes.traslados,
          group: G_PACIENTES,
        }]
      : []),
    // ── Gestiones de Altas (TS agrupa Notificación + Verificación) ──
    ...(esTS
      ? [
          {
            href: "/dashboard/notificacion-altas",
            label: "Notificación de Prealta",
            icon: ClipboardCheck,
            group: G_GESTIONES_ALTAS,
          },
          {
            href: "/dashboard/confirmacion-alta",
            label: "Confirmación de Alta",
            icon: CheckCheck,
            group: G_GESTIONES_ALTAS,
          },
        ]
      : []),
    ...(verAltasVivos
      ? [{
          href: "/dashboard/altas-vivos",
          label: "Verificación de Altas",
          icon: LogIn,
          badge: pendientes.altas,
          // Para TS se agrupa con Notificación; para ESDOMED/admin queda en Gestión de pacientes.
          group: esTS ? G_GESTIONES_ALTAS : G_PACIENTES,
        }]
      : []),
    {
      // Trabajo Social usa la vista de revisión (estilo Psicología), no la de ESDOMED.
      href: esTS ? "/dashboard/defunciones" : "/dashboard/fallecidos",
      label: esTS ? "Defunciones" : "Fallecidos",
      icon: HeartPulse,
      badge: pendientes.fallecidos,
      group: G_PACIENTES,
    },
    ...(verRegistroAltas
      ? [{ href: "/dashboard/registro-altas", label: "Registro de Altas", icon: ListChecks, group: G_PACIENTES }]
      : []),
    ...(profile?.role === "trabajo_social"
      ? [{ href: "/dashboard/recepciones", label: "Recepciones", icon: Inbox, group: G_PACIENTES }]
      : []),
    ...(esTS
      ? [{ href: "/dashboard/visitas", label: "Visitas", icon: DoorOpen, group: G_PACIENTES }]
      : []),

    // ── Documentos ──
    ...(!esTS
      ? [{ href: "/dashboard/impresiones", label: "Impresiones", icon: Printer, badge: pendientes.impresiones, group: G_DOCUMENTOS }]
      : []),
    ...(verIncapacidades
      ? [
          { href: "/dashboard/incapacidades", label: "Incapacidades", icon: FileText, badge: pendientes.incapacidades, group: G_DOCUMENTOS },
          { href: "/dashboard/anexo5", label: "Anexo 5", icon: ClipboardList, badge: pendientes.anexo5, group: G_DOCUMENTOS },
        ]
      : []),

    // ── Reportes ──
    ...(verReportes
      ? [{ href: "/dashboard/reportes", label: "Reportería de egresos", icon: BarChart3, group: G_REPORTES }]
      : []),

    // ── Mi área (horarios) ──
    ...(verHorario
      ? [
          { href: "/esdomed-horarios/mi-horario", label: "Mi horario", icon: CalendarClock, group: G_PERSONAL },
          { href: "/dashboard/mis-tramites", label: "Trámites de Personal", icon: ClipboardList, group: G_PERSONAL }
        ]
      : []),

    // ── Administración ──
    ...(verUsuarios
      ? [{ href: "/dashboard/usuarios", label: "Usuarios", icon: Users, group: G_ADMIN }]
      : []),
    ...(verAprobacionTramites
      ? [{ href: "/dashboard/aprobacion-tramites", label: "Gestión de Trámites", icon: ClipboardCheck, group: G_ADMIN }]
      : []),
    ...(verConfiguracion
      ? [
          { href: "/dashboard/configuracion/servicios", label: "Configuración", icon: Settings, group: G_ADMIN },
          { href: "/dashboard/historial-busquedas", label: "Historial busquedas", icon: History, group: G_ADMIN },
        ]
      : []),
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel={roleLabel} />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
        {loading || !profile ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          children
        )}
      </main>
      <ToastContainer />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificacionesProvider>
      <DashboardContent>{children}</DashboardContent>
    </NotificacionesProvider>
  );
}
