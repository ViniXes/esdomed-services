"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Activity, LayoutDashboard, ArrowRightLeft, BarChart3, HeartPulse, Printer, FileText, FileStack, ClipboardList, Phone, Table2, UserSearch, Ambulance, Building2, BookOpenText, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { NotificacionesProvider, useNotificaciones } from "@/contexts/NotificacionesContext";
import { ToastContainer } from "@/components/ui/ToastContainer";
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
    tone: "blue",
    children: [
      { href: "/medico/emergencia/egresos", label: "Egresos de emergencia", icon: HeartPulse },
      { href: "/medico/censos", label: "Censos de emergencia", icon: BookOpenText, exact: true },
    ],
  },
  { href: "/medico/busqueda-telefono", label: "Busqueda de telefono", icon: Phone, tone: "teal" },
  { href: "/medico/traslados",       label: "Traslados",       icon: ArrowRightLeft, tone: "cyan" },
  { href: "/medico/traslado-externo", label: "Traslado a otro hospital", icon: Building2, tone: "blue" },
  { href: "/medico/fallecidos",      label: "Fallecidos",      icon: HeartPulse, tone: "rose" },
  { href: "/medico/conapina-fgr",    label: "CONAPINA / FGR",  icon: ShieldAlert, tone: "blue" },
  { href: "/medico/impresiones",     label: "Impresiones",     icon: Printer, tone: "violet" },
  { href: "/medico/incapacidades",   label: "Incapacidades",   icon: FileText, tone: "blue" },
  { href: "/medico/anexo5/nueva",    label: "Anexo 5",         icon: ClipboardList, tone: "cyan" },
];

function MedicoContent({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const { pendientes } = useNotificaciones();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== "medico" && profile?.role !== "admin") router.replace("/login");
  }, [loading, profile, router]);

  const esAdmin = profile?.role === "admin";
  const tipoMedicoNavegacion = esAdmin ? "uci_ucin" : profile?.tipoMedico;
  const esJefeUciUcin = profile?.tipoMedico === "jefe_uci_ucin";
  const navItems: NavItem[] = (tipoMedicoNavegacion
    ? [
        baseNavItems[0],
        { href: "/medico/cuidados-criticos", label: "Registro UCI / UCIN", icon: Activity, exact: true, tone: "blue" as const },
        { href: "/medico/cuidados-criticos/registros", label: "Mis registros UCI / UCIN", icon: Table2, tone: "teal" as const },
        ...((esAdmin || esJefeUciUcin) ? [{ href: "/dashboard/cuidados-criticos/indicadores", label: "Indicadores UCI / UCIN", icon: BarChart3, tone: "blue" as const }] : []),
        ...(esAdmin ? [] : baseNavItems.slice(1)),
      ]
    : baseNavItems
  // El globo del ítem CONAPINA/FGR son las solicitudes de notificación que el
  // comité difunde a todos los médicos y siguen pendientes.
  ).map(i => (i.href === "/medico/conapina-fgr" ? { ...i, badge: pendientes.solicitudesLesion } : i));
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
