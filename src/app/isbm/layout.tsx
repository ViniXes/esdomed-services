"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, CalendarCheck, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { esRolIsbm } from "@/types";
import { Sidebar, type NavItem } from "@/components/Sidebar";

const G_CONVENIO = "Convenio";

const navItems: NavItem[] = [
  { href: "/isbm", label: "Inicio", icon: LayoutDashboard, exact: true },
  { href: "/isbm/afiliaciones", label: "Afiliaciones", icon: UserPlus, group: G_CONVENIO },
  { href: "/isbm/censo", label: "Censo diario", icon: CalendarCheck, group: G_CONVENIO },
];

const ROLE_LABEL: Record<string, string> = {
  isbm_tecnico: "Técnico ISBM",
  isbm_supervisor: "Supervisor ISBM",
  isbm_jefe: "Jefe ISBM",
  admin: "Convenio ISBM",
};

export default function IsbmLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !esRolIsbm(profile?.role) && profile?.role !== "admin") {
      router.replace("/login");
    }
  }, [loading, profile, router]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel={ROLE_LABEL[profile?.role ?? ""] ?? "Convenio ISBM"} />
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
