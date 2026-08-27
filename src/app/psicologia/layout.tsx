"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/Sidebar";
import { NotificacionesProvider, useNotificaciones } from "@/contexts/NotificacionesContext";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { navItemsPsicologia } from "@/lib/navPsicologia";

function PsicologiaContent({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const { pendientes } = useNotificaciones();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== "psicologia") router.replace("/login");
  }, [loading, profile, router]);

  // El menú (propio + vistas del Comité de Lesiones, salvo Reportes) vive en
  // navPsicologia para que el layout de /comite-lesiones muestre el mismo.
  const navItems = navItemsPsicologia(pendientes);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel="Psicología" />
      <main className="flex-1 overflow-y-auto pt-mobile-bar md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
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
