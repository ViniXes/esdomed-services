"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, CalendarCheck, UserPlus, Receipt, ShieldCheck, Table2, BookOpenText, BadgeDollarSign } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { esRolIsbm } from "@/types";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import styles from "./isbm.module.css";

const G_CONVENIO = "Gestión diaria";
const G_CONTROL = "Control y facturación";

const navItems: NavItem[] = [
  { href: "/isbm", label: "Inicio", icon: LayoutDashboard, exact: true },
  { href: "/isbm/afiliaciones", label: "Afiliaciones", icon: UserPlus, group: G_CONVENIO },
  { href: "/isbm/censo", label: "Censo diario", icon: CalendarCheck, group: G_CONVENIO },
  { href: "/isbm/cargos", label: "Cargos", icon: Receipt, group: G_CONTROL },
  { href: "/isbm/autorizaciones", label: "Autorizaciones", icon: ShieldCheck, group: G_CONTROL },
  { href: "/isbm/tabuladores", label: "Tabuladores", icon: Table2, group: G_CONTROL },
  { href: "/isbm/aranceles", label: "Aranceles", icon: BookOpenText, group: G_CONTROL },
  { href: "/isbm/honorarios", label: "Honorarios", icon: BadgeDollarSign, group: G_CONTROL },
];

const ROLE_LABEL: Record<string, string> = {
  isbm_tecnico: "Técnico ISBM",
  isbm_supervisor: "Supervisor ISBM",
  isbm_jefe: "Jefe ISBM",
  admin: "Convenios ISBM",
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
    <div className="flex h-dvh bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar variant="portal" navItems={navItems} roleLabel={ROLE_LABEL[profile?.role ?? ""] ?? "Convenios ISBM"} />
      <main className={`${styles.content} min-w-0 flex-1 overflow-y-auto pt-mobile-bar md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]`}>
        {loading || !profile || (!esRolIsbm(profile.role) && profile.role !== "admin") ? (
          <div className="flex items-center justify-center h-full">
            <div role="status" aria-label="Cargando módulo ISBM" className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
