"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { NotificacionesProvider, useNotificaciones } from "@/contexts/NotificacionesContext";
import { Sidebar } from "@/components/Sidebar";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { esJefeCuidadosCriticos } from "@/lib/accesoCuidadosCriticos";
import { TIPO_MEDICO_CRITICO_LABEL } from "@/lib/cuidadosCriticos";
import { navItemsEsdomed } from "@/lib/navEsdomed";
import { navItemsTrabajoSocial } from "@/lib/navTrabajoSocial";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const { pendientes } = useNotificaciones();
  const router = useRouter();
  const pathname = usePathname();
  const esJefeMedicinaCritica = esJefeCuidadosCriticos(profile);

  useEffect(() => {
    // DIMES no tiene rutas alternativas: aun escribiendo otra URL del dashboard,
    // se le devuelve a su bandeja SIS de solo lectura.
    if (!loading && profile?.role === "medico_licenciado_dimes" && pathname !== "/dashboard/solicitudes-usuarios-sis") {
      router.replace("/dashboard/solicitudes-usuarios-sis");
      return;
    }
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
  }, [esJefeMedicinaCritica, loading, pathname, profile, router]);

  const roleLabel =
    esJefeMedicinaCritica && profile?.tipoMedico
      ? TIPO_MEDICO_CRITICO_LABEL[profile.tipoMedico]
      : profile?.role === "trabajo_social"
      ? "Trabajo Social"
      : profile?.role === "admin"
        ? "Administración"
        : profile?.role === "medico_licenciado_dimes"
          ? "Médico/Licenciado DIMES"
        : "ESDOMED";

  const esAdmin = profile?.role === "admin";

  // Los menús viven en el registro de navegación (lib/navRegistro): el de
  // ESDOMED/admin/DIMES/jefe UCI en navEsdomed, y el de Trabajo Social en
  // navTrabajoSocial, que lo comparte con el layout de /comite-lesiones para
  // que el cruce entre áreas sea transparente. El Inicio (/dashboard) le
  // muestra a TS su propio panel, no el de ESDOMED.
  const navItems = profile?.role === "trabajo_social"
    ? navItemsTrabajoSocial(profile, pendientes)
    : navItemsEsdomed(profile, pendientes);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar
        navItems={navItems}
        roleLabel={roleLabel}
        variant="portal"
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
