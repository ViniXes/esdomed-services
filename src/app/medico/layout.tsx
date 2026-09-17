"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/Sidebar";
import { NotificacionesProvider, useNotificaciones } from "@/contexts/NotificacionesContext";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { TIPO_MEDICO_CRITICO_LABEL } from "@/lib/cuidadosCriticos";
import { SoporteGlobo } from "@/components/SoporteGlobo";
import { navItemsMedico } from "@/lib/navMedico";

function MedicoContent({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const { pendientes } = useNotificaciones();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== "medico" && profile?.role !== "admin") router.replace("/login");
  }, [loading, profile, router]);

  // El menú (incluido el submenú del Comité de Lesiones para los médicos que lo
  // apoyan) vive en navMedico para que el layout de /comite-lesiones muestre el
  // mismo.
  const navItems = navItemsMedico(profile, pendientes);
  const esAdmin = profile?.role === "admin";
  const tipoMedicoNavegacion = esAdmin ? "uci_ucin" : profile?.tipoMedico;
  const roleLabel = tipoMedicoNavegacion
    ? TIPO_MEDICO_CRITICO_LABEL[tipoMedicoNavegacion]
    : "Portal Médico";

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel={roleLabel} variant="medical" />
      <main className="flex-1 overflow-y-auto pt-mobile-bar md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
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
      <ToastContainer />
    </div>
  );
}

export default function MedicoLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificacionesProvider>
      <MedicoContent>{children}</MedicoContent>
    </NotificacionesProvider>
  );
}
