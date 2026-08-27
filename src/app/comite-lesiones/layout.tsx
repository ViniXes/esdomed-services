"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert, Activity, Users, Megaphone, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { NotificacionesProvider, useNotificaciones } from "@/contexts/NotificacionesContext";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { navItemsPsicologia } from "@/lib/navPsicologia";

// Área del Comité de Lesiones Intencionales (comité de género y violencia, el
// que audita el MINSAL). Antes vivía dentro del perfil de Psicología; se separó
// porque el trámite es del comité, no del servicio de Psicología. Psicología
// apoya el trámite, así que entra a estas vistas — todas salvo Reportes — con
// su propio menú, para que el cruce entre áreas sea transparente.
function ComiteLesionesContent({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const { pendientes } = useNotificaciones();
  const router = useRouter();
  const pathname = usePathname();

  const esComite = profile?.role === "comite_lesiones";
  const esPsicologia = profile?.role === "psicologia";
  const reportesVetado = esPsicologia && pathname.startsWith("/comite-lesiones/reportes");

  useEffect(() => {
    if (loading) return;
    if (!esComite && !esPsicologia) router.replace("/login");
    else if (reportesVetado) router.replace("/comite-lesiones");
  }, [loading, esComite, esPsicologia, reportesVetado, router]);

  const navItems: NavItem[] = esPsicologia
    ? navItemsPsicologia(pendientes)
    : [
        { href: "/comite-lesiones/conapina-fgr", label: "Avisos CONAPINA / FGR", icon: ShieldAlert, badge: pendientes.conapina },
        { href: "/comite-lesiones/lesiones-ingresos", label: "Ingresos por lesión", icon: Activity },
        { href: "/comite-lesiones/solicitudes", label: "Avisos pendientes a notificar / Solicitudes al área médica", icon: Megaphone },
        { href: "/comite-lesiones/ingresos-adolescentes", label: "Ingresos adolescentes", icon: Users },
        { href: "/comite-lesiones/reportes", label: "Reportes", icon: BarChart3 },
      ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel={esPsicologia ? "Psicología" : "Lesiones intencionales/Adolescentes"} />
      <main className="flex-1 overflow-y-auto pt-mobile-bar md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
        {loading || !profile || reportesVetado ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : children}
      </main>
      <ToastContainer />
    </div>
  );
}

export default function ComiteLesionesLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificacionesProvider>
      <ComiteLesionesContent>{children}</ComiteLesionesContent>
    </NotificacionesProvider>
  );
}
