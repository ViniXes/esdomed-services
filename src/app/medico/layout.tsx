"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Activity, LayoutDashboard, ArrowRightLeft, HeartPulse, Printer, FileText, FileStack, ClipboardList, Phone, Table2, UserSearch, Ambulance, Building2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/Sidebar";
import { TIPO_MEDICO_CRITICO_LABEL } from "@/lib/cuidadosCriticos";
import { SoporteGlobo } from "@/components/SoporteGlobo";

const baseNavItems = [
  { href: "/medico",                 label: "Inicio",          icon: LayoutDashboard, exact: true },
  { href: "/medico/cola-expedientes", label: "Cola de expedientes", icon: FileStack },
  { href: "/medico/buscar-paciente", label: "Buscar Paciente", icon: UserSearch },
  {
    href: "/medico/emergencia",
    label: "Atendidos en emergencia",
    icon: Ambulance,
    children: [
      { href: "/medico/emergencia/egresos", label: "Egresos de emergencia", icon: HeartPulse },
    ],
  },
  { href: "/medico/busqueda-telefono", label: "Busqueda de telefono", icon: Phone },
  { href: "/medico/traslados",       label: "Traslados",       icon: ArrowRightLeft },
  { href: "/medico/traslado-externo", label: "Traslado a otro hospital", icon: Building2 },
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

  const navItems = profile?.tipoMedico
    ? [
        baseNavItems[0],
        { href: "/medico/cuidados-criticos", label: "Registro UCI / UCIN", icon: Activity, exact: true },
        { href: "/medico/cuidados-criticos/registros", label: "Mis registros UCI / UCIN", icon: Table2 },
        ...baseNavItems.slice(1),
      ]
    : baseNavItems;
  const roleLabel = profile?.tipoMedico
    ? TIPO_MEDICO_CRITICO_LABEL[profile.tipoMedico]
    : "Portal Médico";

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel={roleLabel} />
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
