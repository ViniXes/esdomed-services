"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Activity, LayoutDashboard, ArrowRightLeft, BarChart3, HeartPulse, Printer, FileText, FileStack, ClipboardList, Phone, Table2, UserSearch, Ambulance, Building2, BookOpenText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { TIPO_MEDICO_CRITICO_LABEL } from "@/lib/cuidadosCriticos";
import { SoporteGlobo } from "@/components/SoporteGlobo";

const baseNavItems: NavItem[] = [
  { href: "/medico",                 label: "Inicio",          icon: LayoutDashboard, exact: true, tone: "blue" },
  { href: "/medico/cola-expedientes", label: "Cola de expedientes", icon: FileStack, tone: "indigo" },
  { href: "/medico/buscar-paciente", label: "Buscar Paciente", icon: UserSearch, tone: "cyan" },
  {
    href: "/medico/emergencia",
    label: "Atendidos en emergencia",
    icon: Ambulance,
    tone: "rose",
    children: [
      { href: "/medico/emergencia/egresos", label: "Egresos de emergencia", icon: HeartPulse },
      { href: "/medico/censos", label: "Censos de emergencia", icon: BookOpenText, exact: true },
    ],
  },
  { href: "/medico/busqueda-telefono", label: "Busqueda de telefono", icon: Phone, tone: "teal" },
  { href: "/medico/traslados",       label: "Traslados",       icon: ArrowRightLeft, tone: "cyan" },
  { href: "/medico/traslado-externo", label: "Traslado a otro hospital", icon: Building2, tone: "blue" },
  { href: "/medico/fallecidos",      label: "Fallecidos",      icon: HeartPulse, tone: "rose" },
  { href: "/medico/impresiones",     label: "Impresiones",     icon: Printer, tone: "violet" },
  { href: "/medico/incapacidades",   label: "Incapacidades",   icon: FileText, tone: "amber" },
  { href: "/medico/anexo5/nueva",    label: "Anexo 5",         icon: ClipboardList, tone: "emerald" },
];

export default function MedicoLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== "medico") router.replace("/login");
  }, [loading, profile, router]);

  const esJefeUciUcin = profile?.tipoMedico === "jefe_uci_ucin";
  const navItems: NavItem[] = profile?.tipoMedico
    ? [
        baseNavItems[0],
        { href: "/medico/cuidados-criticos", label: "Registro UCI / UCIN", icon: Activity, exact: true, tone: "rose" },
        { href: "/medico/cuidados-criticos/registros", label: "Mis registros UCI / UCIN", icon: Table2, tone: "teal" },
        ...(esJefeUciUcin ? [{ href: "/dashboard/cuidados-criticos/indicadores", label: "Indicadores UCI / UCIN", icon: BarChart3, tone: "blue" as const }] : []),
        ...baseNavItems.slice(1),
      ]
    : baseNavItems;
  const roleLabel = profile?.tipoMedico
    ? TIPO_MEDICO_CRITICO_LABEL[profile.tipoMedico]
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
    </div>
  );
}
