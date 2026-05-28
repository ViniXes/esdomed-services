"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, LogOut, Sun, Moon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { UserProfile } from "@/types";

const SIDEBAR_LOGO_LIGHT_SRC = "/logo_hnes.png";
const SIDEBAR_LOGO_DARK_SRC = "/logo_hnes_sidebar.png";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: number;
}

interface SidebarProps {
  navItems: NavItem[];
  roleLabel: string;
}

interface SidebarBodyProps extends SidebarProps {
  dark: boolean;
  profile: UserProfile | null;
  isActive: (item: NavItem) => boolean;
  onLogout: () => void;
  onNavigate?: () => void;
  toggle: () => void;
}

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto flex-shrink-0 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function SidebarBody({
  navItems,
  roleLabel,
  profile,
  dark,
  toggle,
  isActive,
  onNavigate,
  onLogout,
}: SidebarBodyProps) {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-[var(--color-institutional-dark)] border-r border-slate-200 dark:border-blue-900/30 text-slate-700 dark:text-white">
      <div className="px-4 pt-5 pb-4 border-b border-slate-200 dark:border-white/15 flex flex-col items-center gap-3">
        <Image
          src={SIDEBAR_LOGO_LIGHT_SRC}
          alt="Hospital Nacional El Salvador"
          width={120}
          height={60}
          className="h-16 w-auto object-contain dark:hidden"
          priority
        />
        <Image
          src={SIDEBAR_LOGO_DARK_SRC}
          alt="Hospital Nacional El Salvador"
          width={150}
          height={150}
          className="hidden h-20 w-auto object-contain dark:block"
          priority
        />
        <div className="flex items-center gap-2.5 w-full">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-institutional-accent)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white text-[10px] font-bold tracking-wide">ES</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight font-heading">
              {roleLabel}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-white/70 truncate">
              {profile?.nombre}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, exact, badge }) => {
          const active = isActive({ href, label, icon: Icon, exact });
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                active
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-950/20"
                  : "text-slate-600 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Icon size={16} strokeWidth={active ? 2.5 : 2} className="flex-shrink-0" />
              <span className="flex-1">{label}</span>
              <Badge count={badge ?? 0} />
            </Link>
          );
        })}
      </nav>

      <div className="px-2 pb-4 pt-2 border-t border-slate-200 dark:border-white/15 space-y-1">
        {profile?.servicio && (
          <p className="px-3 pb-1 text-[11px] text-slate-500 dark:text-white/60 truncate">
            {profile.servicio}
          </p>
        )}
        <button
          onClick={toggle}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-slate-600 dark:text-white/75 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
          {dark ? "Modo claro" : "Modo oscuro"}
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-slate-500 dark:text-white/65 hover:text-red-600 dark:hover:text-white hover:bg-red-50 dark:hover:bg-red-500/25 transition-all"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ navItems, roleLabel }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const { profile, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const totalBadge = navItems.reduce((sum, item) => sum + (item.badge ?? 0), 0);

  const sidebarProps = {
    navItems,
    roleLabel,
    profile,
    dark,
    toggle,
    isActive,
    onLogout: handleLogout,
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-[var(--color-institutional-dark)] backdrop-blur-sm border-b border-slate-200 dark:border-blue-900/30 flex items-center h-14 px-3 gap-3">
        <button
          onClick={() => setOpen(true)}
          className="relative p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-white/85 flex-shrink-0 transition-colors"
          aria-label="Abrir menú"
        >
          <Menu size={20} />
          {totalBadge > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </button>
        <div className="flex-1 flex justify-center">
          <Image
            src={SIDEBAR_LOGO_LIGHT_SRC}
            alt="Hospital"
            width={72}
            height={36}
            className="h-8 w-auto object-contain dark:hidden"
          />
          <Image
            src={SIDEBAR_LOGO_DARK_SRC}
            alt="Hospital"
            width={110}
            height={110}
            className="hidden h-9 w-auto object-contain dark:block"
          />
        </div>
        <button
          onClick={toggle}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-white/85 flex-shrink-0 transition-colors"
          aria-label="Cambiar tema"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute top-3.5 right-3 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-white/80 transition-colors z-10"
          aria-label="Cerrar menú"
        >
          <X size={16} />
        </button>
        <SidebarBody {...sidebarProps} onNavigate={() => setOpen(false)} />
      </aside>

      <aside className="hidden md:block w-60 flex-shrink-0">
        <div className="h-screen sticky top-0">
          <SidebarBody {...sidebarProps} />
        </div>
      </aside>
    </>
  );
}
