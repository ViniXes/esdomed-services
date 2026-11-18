"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock, CalendarDays, CalendarPlus, LayoutDashboard, LayoutPanelLeft, Plane, UsersRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";

// agenda_ce (personal administrativo de Consulta Externa) solo consulta su
// horario y su grupo, igual que el personal ESDOMED: no edita nada.
const ROLES_PERMITIDOS = ["esdomed", "asistente_esdomed", "admin", "agenda_ce"];

export default function EsdomedHorariosLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const esAgendaCE = profile?.role === "agenda_ce";
  // agenda_ce no entra a planes ni a la programación de vacaciones.
  const rutaVetada = esAgendaCE && /^\/esdomed-horarios\/(planes|vacaciones)(\/|$)/.test(pathname ?? "");

  useEffect(() => {
    if (!loading && (!profile || !ROLES_PERMITIDOS.includes(profile.role))) {
      router.replace("/login");
    } else if (!loading && rutaVetada) {
      router.replace("/esdomed-horarios/mi-horario");
    }
  }, [loading, profile, router, rutaVetada]);

  const puedePlanificar = profile?.role === "asistente_esdomed" || profile?.role === "admin";
  // ESDOMED, auxiliar administrativo y admin tienen su panel principal en /dashboard.
  const tienePanel = profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";

  const navItems: NavItem[] = [
    { href: "/esdomed-horarios", label: "Inicio", icon: LayoutDashboard, exact: true },
    { href: "/esdomed-horarios/mi-horario", label: "Mi horario", icon: CalendarClock },
    { href: "/esdomed-horarios/mi-grupo", label: "Mi grupo", icon: UsersRound },
    ...(puedePlanificar
      ? [
          { href: "/esdomed-horarios/planes", label: "Planes de trabajo", icon: CalendarDays },
          // La programación la editan el admin y el asistente administrativo.
          { href: "/esdomed-horarios/vacaciones", label: "Vacaciones", icon: Plane },
        ]
      : []),
    ...(tienePanel
      ? [{ href: "/dashboard", label: "Volver al panel", icon: LayoutPanelLeft, group: "Otros" }]
      : []),
    ...(esAgendaCE
      ? [{ href: "/consulta-externa/citas-2027", label: "Volver a Citas 2027", icon: CalendarPlus, group: "Otros" }]
      : []),
  ];

  const roleLabel = puedePlanificar ? "Horarios ESDOMED" : "Mi horario";

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel={roleLabel} />
      <main className="flex-1 overflow-y-auto pt-mobile-bar md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
        {loading || !profile || rutaVetada ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : children}
      </main>
    </div>
  );
}
