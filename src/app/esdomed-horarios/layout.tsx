"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarDays, LayoutDashboard, LayoutPanelLeft, UsersRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";

const ROLES_PERMITIDOS = ["esdomed", "asistente_esdomed", "admin"];

export default function EsdomedHorariosLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!profile || !ROLES_PERMITIDOS.includes(profile.role))) {
      router.replace("/login");
    }
  }, [loading, profile, router]);

  const puedePlanificar = profile?.role === "asistente_esdomed" || profile?.role === "admin";
  // ESDOMED/admin tienen su panel principal en /dashboard; el asistente no.
  const tienePanel = profile?.role === "esdomed" || profile?.role === "admin";

  const navItems: NavItem[] = [
    { href: "/esdomed-horarios", label: "Inicio", icon: LayoutDashboard, exact: true },
    { href: "/esdomed-horarios/mi-horario", label: "Mi horario", icon: CalendarClock },
    { href: "/esdomed-horarios/mi-grupo", label: "Mi grupo", icon: UsersRound },
    ...(puedePlanificar
      ? [{ href: "/esdomed-horarios/planes", label: "Planes de trabajo", icon: CalendarDays }]
      : []),
    ...(tienePanel
      ? [{ href: "/dashboard", label: "Volver al panel", icon: LayoutPanelLeft, group: "Otros" }]
      : []),
  ];

  const roleLabel = puedePlanificar ? "Horarios ESDOMED" : "Mi horario";

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
    </div>
  );
}
