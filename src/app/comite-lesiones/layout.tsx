"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { NotificacionesProvider, useNotificaciones } from "@/contexts/NotificacionesContext";
import { ToastContainer } from "@/components/ui/ToastContainer";

// Área del Comité de Lesiones Intencionales (comité de género y violencia, el
// que audita el MINSAL). Antes vivía dentro del perfil de Psicología; se separó
// porque el trámite es del comité, no del servicio de Psicología.
function ComiteLesionesContent({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const { pendientes } = useNotificaciones();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== "comite_lesiones") router.replace("/login");
  }, [loading, profile, router]);

  const navItems: NavItem[] = [
    { href: "/comite-lesiones/conapina-fgr", label: "Avisos CONAPINA / FGR", icon: ShieldAlert, badge: pendientes.conapina },
    { href: "/comite-lesiones/lesiones-ingresos", label: "Ingresos por lesión", icon: Activity },
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel="Comité de Lesiones" />
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

export default function ComiteLesionesLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificacionesProvider>
      <ComiteLesionesContent>{children}</ComiteLesionesContent>
    </NotificacionesProvider>
  );
}
