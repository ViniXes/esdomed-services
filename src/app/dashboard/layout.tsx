"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ArrowRightLeft, HeartPulse, Printer, Users, Inbox, BedDouble, FileText, ClipboardList, LogIn, Settings, History } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!profile || profile.role === "medico" || profile.role === "psicologia" || profile.role === "enfermeria")) {
      router.replace("/login");
    }
  }, [loading, profile, router]);

  const roleLabel = profile?.role === "trabajo_social" ? "Trabajo Social"
                  : profile?.role === "admin" ? "Administración"
                  : "ESDOMED";

  const verControlIngresos = profile?.role === "esdomed" || profile?.role === "admin";
  const verPacientes = profile?.role === "esdomed" || profile?.role === "admin";
  const verIncapacidades = profile?.role === "esdomed" || profile?.role === "admin";
  const verAltasVivos = profile?.role === "esdomed" || profile?.role === "admin" || profile?.role === "trabajo_social";
  const verConfiguracion = profile?.role === "admin";

  const navItems = [
    { href: "/dashboard",             label: "Inicio",       icon: LayoutDashboard, exact: true },
    ...(verControlIngresos
      ? [{ href: "/dashboard/control-ingresos", label: "Control ingresos", icon: FileText }]
      : []),
    { href: "/dashboard/traslados",   label: "Traslados",    icon: ArrowRightLeft },
    { href: "/dashboard/fallecidos",  label: "Fallecidos",   icon: HeartPulse },
    { href: "/dashboard/impresiones", label: "Impresiones",  icon: Printer },
    ...(verIncapacidades
      ? [
          { href: "/dashboard/incapacidades", label: "Incapacidades", icon: FileText },
          { href: "/dashboard/anexo5", label: "Anexo 5", icon: ClipboardList }
        ]
      : []),
    ...(verPacientes
      ? [{ href: "/dashboard/pacientes", label: "Pacientes", icon: BedDouble }]
      : []),
    { href: "/dashboard/usuarios",    label: "Usuarios",     icon: Users },
    ...(verAltasVivos
      ? [{ href: "/dashboard/altas-vivos", label: "Altas Vivos", icon: LogIn }]
      : []),
    ...(profile?.role === "trabajo_social"
      ? [{ href: "/dashboard/recepciones", label: "Recepciones", icon: Inbox }]
      : []),
    ...(verConfiguracion
      ? [{ href: "/dashboard/configuracion/servicios", label: "Configuración", icon: Settings }]
      : []),
    ...(verConfiguracion
      ? [{ href: "/dashboard/historial-busquedas", label: "Historial busquedas", icon: History }]
      : []),
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar navItems={navItems} roleLabel={roleLabel} />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0 bg-slate-50 dark:bg-slate-950">
        {loading || !profile ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : children}
      </main>
    </div>
  );
}
