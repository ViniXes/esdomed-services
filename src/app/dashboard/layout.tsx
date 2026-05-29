"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  BedDouble,
  ClipboardList,
  FileText,
  HeartPulse,
  History,
  Inbox,
  LayoutDashboard,
  LogIn,
  Printer,
  Settings,
  Users,
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

  const verControlIngresos = profile?.role === "esdomed" || profile?.role === "admin";
  const verPacientes       = profile?.role === "esdomed" || profile?.role === "admin";
  const verIncapacidades   = profile?.role === "esdomed" || profile?.role === "admin";
  const verAltasVivos =
    profile?.role === "esdomed" ||
    profile?.role === "admin" ||
    profile?.role === "trabajo_social";
  const verConfiguracion = profile?.role === "admin";
  const verUsuarios = profile?.role === "admin";

  // Grupos del menú — operaciones relacionadas se muestran juntas bajo un encabezado.
  const G_PACIENTES = "Gestión de pacientes";
  const G_DOCUMENTOS = "Documentos";
  const G_ADMIN = "Administración";

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Inicio", icon: LayoutDashboard, exact: true },

    // ── Gestión de pacientes ──
    ...(verControlIngresos
      ? [{ href: "/dashboard/control-ingresos", label: "Control ingresos", icon: FileText, group: G_PACIENTES }]
      : []),
    ...(verPacientes
      ? [{ href: "/dashboard/pacientes", label: "Pacientes", icon: BedDouble, group: G_PACIENTES }]
      : []),
    {
      href: "/dashboard/traslados",
      label: "Traslados",
      icon: ArrowRightLeft,
      badge: pendientes.traslados,
      group: G_PACIENTES,
    },
    ...(verAltasVivos
      ? [{
          href: "/dashboard/altas-vivos",
          label: "Verificación de Altas",
          icon: LogIn,
          badge: pendientes.altas,
          group: G_PACIENTES,
        }]
      : []),
    {
      href: "/dashboard/fallecidos",
      label: "Fallecidos",
      icon: HeartPulse,
      badge: pendientes.fallecidos,
      group: G_PACIENTES,
    },
    ...(profile?.role === "trabajo_social"
      ? [{ href: "/dashboard/recepciones", label: "Recepciones", icon: Inbox, group: G_PACIENTES }]
      : []),

    // ── Documentos ──
    { href: "/dashboard/impresiones", label: "Impresiones", icon: Printer, group: G_DOCUMENTOS },
    ...(verIncapacidades
      ? [
          { href: "/dashboard/incapacidades", label: "Incapacidades", icon: FileText, group: G_DOCUMENTOS },
          { href: "/dashboard/anexo5", label: "Anexo 5", icon: ClipboardList, group: G_DOCUMENTOS },
        ]
      : []),

    // ── Administración ──
    ...(verUsuarios
      ? [{ href: "/dashboard/usuarios", label: "Usuarios", icon: Users, group: G_ADMIN }]
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
