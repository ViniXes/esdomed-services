"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert, Activity, Users, Megaphone, BarChart3, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { NotificacionesProvider, useNotificaciones } from "@/contexts/NotificacionesContext";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { SoporteGlobo } from "@/components/SoporteGlobo";
import { navItemsPsicologia } from "@/lib/navPsicologia";
import { navItemsTrabajoSocial } from "@/lib/navTrabajoSocial";
import { navItemsMedico } from "@/lib/navMedico";
import { apoyaComiteLesiones } from "@/lib/accesoComiteLesiones";

// Área del Comité de Lesiones Intencionales (comité de género y violencia, el
// que audita el MINSAL). Antes vivía dentro del perfil de Psicología; se separó
// porque el trámite es del comité, no del servicio de Psicología. Otras áreas
// apoyan el trámite y entran a estas vistas con su propio menú, para que el
// cruce entre áreas sea transparente:
//   - Psicología: todas salvo Reportes.
//   - Trabajo Social: avisos, ingresos por lesión y solicitudes a médicos
//     (ni Ingresos adolescentes ni Reportes).
//   - Médicos marcados por persona (perfil.apoyaComiteLesiones): TODO, desde
//     el submenú "Comité de lesiones" de su portal.
// El veto es de UI (redirección + no renderizar); las reglas de Firestore dan
// a todos los que apoyan los mismos permisos del módulo que al comité.
function ComiteLesionesContent({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const { pendientes } = useNotificaciones();
  const router = useRouter();
  const pathname = usePathname();

  const esComite = profile?.role === "comite_lesiones";
  const esPsicologia = profile?.role === "psicologia";
  const esTS = profile?.role === "trabajo_social";
  const esMedicoApoyo = apoyaComiteLesiones(profile);
  const vetado =
    ((esPsicologia || esTS) && pathname.startsWith("/comite-lesiones/reportes")) ||
    (esTS && pathname.startsWith("/comite-lesiones/ingresos-adolescentes"));

  useEffect(() => {
    if (loading) return;
    if (!esComite && !esPsicologia && !esTS && !esMedicoApoyo) router.replace("/login");
    else if (vetado) router.replace("/comite-lesiones");
  }, [loading, esComite, esPsicologia, esTS, esMedicoApoyo, vetado, router]);

  const navItems: NavItem[] = esPsicologia
    ? navItemsPsicologia(pendientes)
    : esTS
    ? navItemsTrabajoSocial(pendientes)
    : esMedicoApoyo
    ? navItemsMedico(profile, pendientes)
    : [
        { href: "/comite-lesiones", label: "Resumen", icon: LayoutDashboard, exact: true },
        { href: "/comite-lesiones/conapina-fgr", label: "Avisos CONAPINA / FGR", icon: ShieldAlert, badge: pendientes.conapina },
        { href: "/comite-lesiones/lesiones-ingresos", label: "Ingresos por lesión", icon: Activity },
        { href: "/comite-lesiones/solicitudes", label: "Avisos pendientes a notificar / Solicitudes al área médica", icon: Megaphone },
        { href: "/comite-lesiones/ingresos-adolescentes", label: "Ingresos adolescentes", icon: Users },
        { href: "/comite-lesiones/reportes", label: "Reportes", icon: BarChart3 },
      ];
  const roleLabel = esPsicologia
    ? "Psicología"
    : esTS
    ? "Trabajo Social"
    : esMedicoApoyo
    ? "Portal Médico"
    : "Comité de lesiones";

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel={roleLabel} variant={esMedicoApoyo ? "medical" : "default"} />
      <main className="flex-1 overflow-y-auto pt-mobile-bar md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
        {loading || !profile || vetado ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {children}
            {esMedicoApoyo && <SoporteGlobo />}
          </>
        )}
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
