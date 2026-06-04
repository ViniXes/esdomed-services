"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ArrowRightLeft, HeartPulse, Printer, FileText, FileStack, ClipboardList, Phone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/Sidebar";
import { SoporteGlobo } from "@/components/SoporteGlobo";

const navItems = [
  { href: "/medico",                 label: "Inicio",          icon: LayoutDashboard, exact: true },
  { href: "/medico/cola-expedientes", label: "Cola de expedientes", icon: FileStack },
  { href: "/medico/busqueda-telefono", label: "Busqueda de telefono", icon: Phone },
  { href: "/medico/traslados",       label: "Traslados",       icon: ArrowRightLeft },
  { href: "/medico/fallecidos",      label: "Fallecidos",      icon: HeartPulse },
  { href: "/medico/impresiones",     label: "Impresiones",     icon: Printer },
  { href: "/medico/incapacidades",   label: "Incapacidades",   icon: FileText },
  { href: "/medico/anexo5/nueva",    label: "Anexo 5",         icon: ClipboardList },
];

export default function MedicoLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== "medico") router.replace("/login");
  }, [loading, profile, router]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel="Portal Médico" />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
        {loading || !profile ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {children}
            <SoporteGlobo />
          </>
        )}
      </main>
    </div>
  );
}
