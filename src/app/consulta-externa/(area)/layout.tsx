"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/Sidebar";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { rutaVetada } from "@/lib/navRegistro";
import { entraConsultaExterna } from "@/lib/accesoConsultaExterna";
import {
  ENTRADAS_CONSULTA_EXTERNA,
  navItemsConsultaExterna,
  regresoConsultaExterna,
} from "@/lib/navConsultaExterna";

// Subsistema de Consulta Externa: menú propio (como Mi horario) con salida al
// panel de ESDOMED. La pantalla de llamados vive fuera de este grupo de rutas
// para ir a pantalla completa, sin menú.
export default function ConsultaExternaLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const permitido = entraConsultaExterna(profile);
  const vetada = permitido && rutaVetada(ENTRADAS_CONSULTA_EXTERNA, profile, pathname);

  useEffect(() => {
    if (loading) return;
    if (!permitido) router.replace("/login");
    else if (vetada) router.replace("/consulta-externa");
  }, [loading, permitido, vetada, router]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar
        navItems={navItemsConsultaExterna(profile)}
        roleLabel="Consulta Externa"
        variant="portal"
        regreso={regresoConsultaExterna(profile)}
      />
      <main className="flex-1 overflow-y-auto pt-mobile-bar md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
        {loading || !profile || !permitido || vetada ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : children}
      </main>
      <ToastContainer />
    </div>
  );
}
