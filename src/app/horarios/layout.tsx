"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Hospital, LayoutPanelLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";

// Planes de trabajo por área del hospital (Terapia Respiratoria, etc.).
//
// Hoy los gestiona/consulta el personal ESDOMED (y admin). Cuando se creen
// usuarios para el personal de otras áreas, este guard es el único punto a
// extender: agregar sus roles y filtrar el selector a su propia área.
const ROLES_PERMITIDOS = ["esdomed", "asistente_esdomed", "admin"];

export default function HorariosAreasLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!profile || !ROLES_PERMITIDOS.includes(profile.role))) {
      router.replace("/login");
    }
  }, [loading, profile, router]);

  const navItems: NavItem[] = [
    { href: "/horarios", label: "Áreas", icon: Hospital, exact: true },
    { href: "/dashboard", label: "Volver al panel", icon: LayoutPanelLeft, group: "Otros" },
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel="Horarios por área" />
      <main className="flex-1 overflow-y-auto pt-mobile-bar md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
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
