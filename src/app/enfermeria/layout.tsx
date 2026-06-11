"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, ClipboardCheck, History, LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/Sidebar";

const navItems = [
  { href: "/enfermeria/altas", label: "Notificar Alta Vivo", icon: LogIn },
  { href: "/enfermeria/movimientos", label: "Movimientos", icon: History },
  { href: "/enfermeria/notificacion-altas", label: "Reporte TS", icon: ClipboardCheck },
  { href: "/enfermeria/confirmacion-alta", label: "Confirmación de Alta", icon: CheckCheck },
];

export default function EnfermeriaLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== "enfermeria") router.replace("/login");
  }, [loading, profile, router]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel="Enfermería" />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
        {loading || !profile ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : children}
      </main>
    </div>
  );
}
