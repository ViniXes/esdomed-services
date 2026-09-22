"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Stethoscope } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const TABS_OPERATIVOS = [
  { href: "/dashboard/productividad/esdomed", label: "ESDOMED", icon: Stethoscope },
] as const;

/** Sub-navegación compartida entre las vistas del módulo de Productividad. */
export function ProductividadTabs() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const tabs = profile?.role === "admin"
    ? [...TABS_OPERATIVOS, { href: "/dashboard/productividad/administracion", label: "Administración", icon: ShieldCheck }]
    : TABS_OPERATIVOS;
  return (
    <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
      {tabs.map(({ href, label, icon: Icon }) => {
        const activo = pathname === href;
        return (
          <Link prefetch={false}
            key={href}
            href={href}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activo
                ? "bg-white dark:bg-slate-900 shadow-sm text-blue-700 dark:text-blue-300"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <Icon size={15} /> {label}
          </Link>
        );
      })}
    </div>
  );
}
