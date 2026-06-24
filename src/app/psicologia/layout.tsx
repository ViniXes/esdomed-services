"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Clock, HeartPulse, Inbox, LogOut, LogIn, UserSearch } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { NotificacionesProvider, useNotificaciones } from "@/contexts/NotificacionesContext";
import { ToastContainer } from "@/components/ui/ToastContainer";

function PsicologiaContent({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const { pendientes } = useNotificaciones();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== "psicologia") router.replace("/login");
  }, [loading, profile, router]);

  const navItems: NavItem[] = [
    { href: "/psicologia/buscar-paciente",   label: "Buscar Paciente",   icon: UserSearch },
    { href: "/psicologia/pacientes-activos", label: "Pacientes activos", icon: Clock },
    { href: "/psicologia/altas",             label: "Altas efectivas",   icon: LogOut },
    { href: "/psicologia/altas-vivos",       label: "Verificación de Altas", icon: LogIn },
    { href: "/psicologia/fallecidos",        label: "Fallecidos",        icon: HeartPulse, badge: pendientes.fallecidos },
    { href: "/psicologia/recepciones",       label: "Recepciones",       icon: Inbox,      badge: pendientes.recepciones },
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel="Psicología" />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
        {loading || !profile ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : children}
      </main>
      <ToastContainer />
    </div>
  );
}

export default function PsicologiaLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificacionesProvider>
      <PsicologiaContent>{children}</PsicologiaContent>
    </NotificacionesProvider>
  );
}
