"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Users, Upload, FileText, FilePlus2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";

const G_PERSONAL = "Personal";
const G_LICENCIAS = "Licencias";

const navItems: NavItem[] = [
  { href: "/rrhh", label: "Inicio", icon: LayoutDashboard, exact: true },
  { href: "/rrhh/empleados", label: "Empleados", icon: Users, group: G_PERSONAL },
  { href: "/rrhh/empleados/importar", label: "Importar padrón", icon: Upload, group: G_PERSONAL },
  { href: "/rrhh/licencias", label: "Licencias", icon: FileText, group: G_LICENCIAS },
  { href: "/rrhh/licencias/nueva", label: "Registrar licencia", icon: FilePlus2, group: G_LICENCIAS },
];

export default function RRHHLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== "rrhh" && profile?.role !== "admin") {
      router.replace("/login");
    }
  }, [loading, profile, router]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel="Recursos Humanos" />
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
