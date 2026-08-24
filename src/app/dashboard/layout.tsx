"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Ambulance,
  ArrowRightLeft,
  Activity,
  BarChart3,
  BedDouble,
  Building2,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  FileText,
  HeartPulse,
  History,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  LogIn,
  Phone,
  PhoneCall,
  Printer,
  Radar,
  Settings,
  Syringe,
  Table2,
  TrendingUp,
  Users,
  DoorOpen,
  CalendarClock,
  NotebookPen,
  UserCheck,
  UserSearch,
  FileCode2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NotificacionesProvider, useNotificaciones } from "@/contexts/NotificacionesContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { esJefeCuidadosCriticos, puedeVerModuloCuidadosCriticos } from "@/lib/accesoCuidadosCriticos";
import { TIPO_MEDICO_CRITICO_LABEL } from "@/lib/cuidadosCriticos";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const { pendientes } = useNotificaciones();
  const router = useRouter();
  const esJefeMedicinaCritica = esJefeCuidadosCriticos(profile);

  useEffect(() => {
    if (
      !loading &&
      (!profile ||
        (profile.role === "medico" && !esJefeMedicinaCritica) ||
        profile.role === "psicologia" ||
        profile.role === "enfermeria" ||
        profile.role === "transporte" ||
        profile.role === "motorista" ||
        profile.role === "isbm_tecnico" ||
        profile.role === "isbm_supervisor" ||
        profile.role === "isbm_jefe")
    ) {
      router.replace("/login");
    }
  }, [esJefeMedicinaCritica, loading, profile, router]);

  const roleLabel =
    esJefeMedicinaCritica && profile?.tipoMedico
      ? TIPO_MEDICO_CRITICO_LABEL[profile.tipoMedico]
      : profile?.role === "trabajo_social"
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
  const verConfiguracion = esAdmin;
  const verUsuarios = esAdmin;
  const verBusquedaTelefono = esAdmin;
  const verCuidadosCriticos = puedeVerModuloCuidadosCriticos(profile);
  const verReportes = esEsdomed || esAdmin;
  // SIMMOW, a diferencia del resto de módulos ESDOMED de arriba, es solo para
  // el rol esdomed puntual + admin — NO para asistente_esdomed (pedido
  // explícito del usuario, no sigue el agrupamiento esEsdomed habitual).
  const verSimmow = profile?.role === "esdomed" || esAdmin;
  const verHorario = esEsdomed || esAdmin;
  // Aprobación de trámites (ver lo subido por todos): superusuario + auxiliar administrativo.
  const verAprobacionTramites = esAdmin || esAsistente;
  const verProductividad = esEsdomed || esAdmin;

  // Grupos del menú — operaciones relacionadas se muestran juntas bajo un encabezado.
  const G_PACIENTES = "Gestión de pacientes";
  const G_PROCESOS_ESDOMED = "Procesos con ESDOMED";
  const G_MEDICINA_CRITICA = "Medicina crítica";
  const G_TRABAJO_SOCIAL = "Trabajo Social";
  const G_GESTIONES_ALTAS = "Gestiones de Altas";
  const G_DOCUMENTOS = "Documentos";
  const G_REPORTES = "Reportes";
  const G_PERSONAL = "Mi área";
  const G_ADMIN = "Administración";

  const navItems: NavItem[] = [
    // Trabajo Social no usa el inicio (panel de ESDOMED); entra directo a sus vistas.
    ...(!esTS && !esJefeMedicinaCritica
      ? [{ href: "/dashboard", label: "Inicio", icon: LayoutDashboard, exact: true }]
      : []),

    // ── Procesos con ESDOMED (solo Trabajo Social) ──
    // Flujos de TS que dependen de o responden a ESDOMED. Los demás roles
    // conservan estos mismos ítems dentro de sus grupos habituales.
    ...(esTS
      ? [
          { href: "/dashboard/buscar-paciente", label: "Buscar Paciente", icon: UserSearch, group: G_PROCESOS_ESDOMED },
          {
            // TS usa la vista de revisión (estilo Psicología), no la de ESDOMED.
            href: "/dashboard/defunciones",
            label: "Defunciones",
            icon: HeartPulse,
            tone: "rose" as const,
            badge: pendientes.fallecidos,
            group: G_PROCESOS_ESDOMED,
          },
          { href: "/dashboard/recepciones", label: "Recepciones", icon: Inbox, group: G_PROCESOS_ESDOMED },
          {
            href: "/dashboard/altas-vivos",
            label: "Verificación de Altas",
            icon: LogIn,
            badge: pendientes.altas,
            group: G_PROCESOS_ESDOMED,
          },
        ]
      : []),

    // ── Gestión de pacientes ──
    ...(esEsdomed || esAdmin
      ? [{ href: "/dashboard/buscar-paciente", label: "Buscar Paciente", icon: UserSearch, group: G_PACIENTES }]
      : []),
    ...(verControlIngresos
      ? [{ href: "/dashboard/control-ingresos", label: "Control ingresos", icon: FileText, group: G_PACIENTES }]
      : []),
    ...(verPacientes
      ? [{ href: "/dashboard/pacientes", label: "Pacientes", icon: BedDouble, group: G_PACIENTES }]
      : []),
    ...(verPacientes
      ? [{
          href: "/dashboard/emergencia",
          label: "Atendidos en emergencia",
          icon: Ambulance,
          group: G_PACIENTES,
          children: [
            { href: "/dashboard/emergencia/egresos", label: "Egresos de emergencia", icon: HeartPulse },
          ],
        }]
      : []),
    ...(verPacientes
      ? [{ href: "/dashboard/hospital-dia", label: "Hospital Día", icon: Syringe, group: G_PACIENTES }]
      : []),
    ...((esAdmin || esJefeMedicinaCritica)
      ? [{ href: "/medico/cuidados-criticos", label: "Registro UCI / UCIN", icon: Activity, group: G_MEDICINA_CRITICA }]
      : []),
    ...(verCuidadosCriticos
      ? [{ href: "/dashboard/cuidados-criticos", label: "Matriz UCI / UCIN", icon: Activity, group: G_MEDICINA_CRITICA, exact: true }]
      : []),
    ...(verCuidadosCriticos
      ? [{ href: "/dashboard/cuidados-criticos/indicadores", label: "Indicadores UCI / UCIN", icon: BarChart3, group: G_MEDICINA_CRITICA }]
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
    ...(!esTS
      ? [{
          href: "/dashboard/traslados-externos",
          label: "Traslado a otro hospital",
          icon: Building2,
          badge: pendientes.trasladosExternos,
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
    // Para TS este ítem vive en "Procesos con ESDOMED" (arriba).
    ...(verAltasVivos && !esTS
      ? [{
          href: "/dashboard/altas-vivos",
          label: "Verificación de Altas",
          icon: LogIn,
          badge: pendientes.altas,
          group: G_PACIENTES,
        }]
      : []),
    ...(!esTS
      ? [{
          href: "/dashboard/fallecidos",
          label: "Fallecidos",
          icon: HeartPulse,
          tone: "rose" as const,
          badge: pendientes.fallecidos,
          group: G_PACIENTES,
        }]
      : []),

    // ── Trabajo Social ── cada flujo con entrada propia (antes: 1 ítem + tabs).
    ...(esTS || esAdmin
      ? [
          { href: "/dashboard/gestiones/asignaciones", label: "Asignaciones", icon: UserCheck, group: G_TRABAJO_SOCIAL },
          { href: "/dashboard/gestiones/rastreo", label: "Rastreo", icon: Radar, group: G_TRABAJO_SOCIAL },
          { href: "/dashboard/gestiones/seguimiento", label: "Seguimiento", icon: ListChecks, group: G_TRABAJO_SOCIAL },
          { href: "/dashboard/gestiones", label: "Registro de gestiones", icon: NotebookPen, group: G_TRABAJO_SOCIAL, exact: true },
          { href: "/dashboard/gestiones/productividad", label: "Productividad", icon: BarChart3, group: G_TRABAJO_SOCIAL },
          { href: "/dashboard/gestiones/bitacora", label: "Bitácora", icon: FileClock, group: G_TRABAJO_SOCIAL },
        ]
      : []),
    ...(esTS
      ? [{ href: "/dashboard/visitas", label: "Visitas", icon: DoorOpen, group: G_TRABAJO_SOCIAL }]
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
    ...(verSimmow
      ? [{ href: "/dashboard/simmow", label: "SIMMOW", icon: FileCode2, group: G_DOCUMENTOS }]
      : []),

    // ── Reportes ──
    ...(verReportes
      ? [
          { href: "/dashboard/reportes", label: "Reportería de egresos", icon: BarChart3, group: G_REPORTES, exact: true },
          { href: "/dashboard/reportes/tabuladores", label: "Tabuladores", icon: Table2, group: G_REPORTES },
          { href: "/dashboard/reportes/tablas-totales", label: "Tablas totales", icon: LayoutGrid, group: G_REPORTES },
          { href: "/dashboard/reportes/traslados", label: "Traslados de cama", icon: ArrowRightLeft, group: G_REPORTES },
        ]
      : []),

    // ── Mi área (horarios) ──
    ...(verHorario
      ? [
          { href: "/esdomed-horarios/mi-horario", label: "Mi horario", icon: CalendarClock, group: G_PERSONAL },
          { href: "/dashboard/mis-tramites", label: "Trámites de Personal", icon: ClipboardList, group: G_PERSONAL },
          { href: "/dashboard/directorio-extensiones", label: "Directorio de extensiones", icon: PhoneCall, group: G_PERSONAL }
        ]
      : []),

    // ── Administración ──
    ...(verUsuarios
      ? [
          { href: "/dashboard/usuarios", label: "Usuarios", icon: Users, group: G_ADMIN },
          { href: "/dashboard/registros-medicos", label: "Registros de médicos", icon: ClipboardList, group: G_ADMIN },
        ]
      : []),
    ...(verAprobacionTramites
      ? [{ href: "/dashboard/aprobacion-tramites", label: "Gestión de Trámites", icon: ClipboardCheck, group: G_ADMIN }]
      : []),
    ...(verConfiguracion
      ? [
          { href: "/dashboard/configuracion/servicios", label: "Configuración", icon: Settings, group: G_ADMIN },
          { href: "/dashboard/historial-busquedas", label: "Historial busquedas", icon: History, group: G_ADMIN },
          { href: "/dashboard/historial-consultas", label: "Historial consultas", icon: UserSearch, group: G_ADMIN },
        ]
      : []),
    ...(verProductividad
      ? [{ href: "/dashboard/productividad/esdomed", label: "Productividad", icon: TrendingUp, group: G_ADMIN, exact: true }]
      : []),
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar
        navItems={navItems}
        roleLabel={roleLabel}
        collapseGroupsInitially={esAdmin}
        allowDesktopPanelCollapse={esAdmin}
      />
      <main className="flex-1 overflow-y-auto pt-mobile-bar md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
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
