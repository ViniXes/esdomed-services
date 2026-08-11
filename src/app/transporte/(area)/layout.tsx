"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bus, ClipboardCheck, ExternalLink, LayoutDashboard, Truck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";

export default function TransporteLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (
      !loading &&
      profile?.role !== "transporte" &&
      profile?.role !== "motorista" &&
      profile?.role !== "admin"
    ) {
      router.replace("/login");
    }
  }, [loading, profile, router]);

  const esMotorista = profile?.role === "motorista";

  const navItems: NavItem[] = esMotorista
    ? [{ href: "/transporte/mis-viajes", label: "Mis viajes", icon: Bus }]
    : [
        { href: "/transporte", label: "Tablero", icon: LayoutDashboard, exact: true },
        { href: "/transporte/novedades", label: "Novedades", icon: ClipboardCheck },
        { href: "/transporte/vehiculos", label: "Vehículos", icon: Truck },
        { href: "/transporte/solicitar", label: "Formulario público", icon: ExternalLink },
      ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel={esMotorista ? "Motorista" : "Transporte"} />
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
