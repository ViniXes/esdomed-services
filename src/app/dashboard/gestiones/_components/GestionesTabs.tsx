"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileClock, LayoutDashboard, NotebookPen, Radar } from "lucide-react";

const TABS = [
  { href: "/dashboard/gestiones/panorama", label: "Panorama", icon: LayoutDashboard },
  { href: "/dashboard/gestiones/rastreo", label: "Rastreo", icon: Radar },
  { href: "/dashboard/gestiones", label: "Registro", icon: NotebookPen },
  { href: "/dashboard/gestiones/productividad", label: "Productividad", icon: BarChart3 },
  { href: "/dashboard/gestiones/bitacora", label: "Bitácora", icon: FileClock },
] as const;

/** Sub-navegación compartida entre las vistas del módulo de gestiones de TS. */
export function GestionesTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
      {TABS.map(({ href, label, icon: Icon }) => {
        const activo = pathname === href;
        return (
          <Link
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
