"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, LogOut, Sun, Moon, KeyRound, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { UserProfile } from "@/types";
import { TIPO_MEDICO_CRITICO_LABEL } from "@/lib/cuidadosCriticos";

const SIDEBAR_LOGO_LIGHT_SRC = "/logo_hnes_sidebar.png";
const SIDEBAR_LOGO_DARK_SRC = "/logo_hnes_sidebar.png";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Tono de icono usado en la variante médica. */
  tone?: "blue" | "indigo" | "cyan" | "teal" | "emerald" | "rose" | "violet" | "amber";
  exact?: boolean;
  badge?: number;
  /** Encabezado de sección. Los ítems consecutivos con el mismo grupo se muestran juntos. */
  group?: string;
  /** Sub-ítems que se despliegan (submenú) al expandir este ítem. */
  children?: NavItem[];
}

interface SidebarProps {
  navItems: NavItem[];
  roleLabel: string;
  /** Estilo visual reservado para la navegación del portal médico. */
  variant?: "default" | "medical";
  /** Para perfiles con menús extensos, inicia todas las secciones cerradas. */
  collapseGroupsInitially?: boolean;
  /** Habilita el control de escritorio para ocultar el panel lateral. */
  allowDesktopPanelCollapse?: boolean;
}

interface SidebarBodyProps extends SidebarProps {
  dark: boolean;
  profile: UserProfile | null;
  isActive: (item: NavItem) => boolean;
  isGroupCollapsed: (group: string) => boolean;
  toggleGroup: (group: string) => void;
  onChangePassword: () => void;
  onLogout: () => void;
  onCollapseDesktopPanel?: () => void;
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

const ACTIVE_CLS =
  "bg-blue-50 text-[#1c1e4d] ring-1 ring-[#c9a892]/45 shadow-sm shadow-blue-100 dark:bg-[var(--color-institutional-navy)] dark:text-white dark:ring-[#c9a892]/55 dark:shadow-[#c9a892]/15";
const IDLE_CLS =
  "text-slate-600 dark:text-slate-300 hover:bg-[#c9a892]/10 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white";
const MEDICAL_ICON_TONE: Record<NonNullable<NavItem["tone"]>, string> = {
  blue: "text-blue-500 group-hover:text-blue-600 dark:text-blue-300",
  indigo: "text-indigo-500 group-hover:text-indigo-600 dark:text-indigo-300",
  cyan: "text-cyan-600 group-hover:text-cyan-700 dark:text-cyan-300",
  teal: "text-teal-600 group-hover:text-teal-700 dark:text-teal-300",
  emerald: "text-emerald-600 group-hover:text-emerald-700 dark:text-emerald-300",
  rose: "text-rose-500 group-hover:text-rose-600 dark:text-rose-300",
  violet: "text-violet-500 group-hover:text-violet-600 dark:text-violet-300",
  amber: "text-amber-600 group-hover:text-amber-700 dark:text-amber-300",
};

function NavLink({
  item, active, onNavigate, nested = false, variant = "default",
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  nested?: boolean;
  variant?: SidebarProps["variant"];
}) {
  const { href, label, icon: Icon, badge } = item;
  const medical = variant === "medical";
  const activeClass = medical
    ? "bg-gradient-to-r from-cyan-50/80 to-blue-50/70 text-blue-700 ring-1 ring-blue-100/90 dark:from-cyan-950/55 dark:to-blue-950/40 dark:text-cyan-50 dark:ring-cyan-800/70"
    : ACTIVE_CLS;
  const idleClass = medical
    ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white"
    : IDLE_CLS;
  return (
    <Link prefetch={false}
      href={href}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 rounded-xl font-medium transition-all duration-150 ${
        nested ? "px-3 py-2 text-[13px]" : "px-3 py-2.5 text-sm"
      } ${active ? activeClass : idleClass}`}
    >
      {medical && active && <span className="absolute left-0 h-5 w-0.5 rounded-r-full bg-cyan-600 dark:bg-cyan-400" />}
      <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
        medical && active
          ? "text-blue-600 dark:text-cyan-300"
          : medical
            ? MEDICAL_ICON_TONE[item.tone ?? "cyan"]
            : ""
      }`}>
        <Icon size={nested ? 15 : 16} strokeWidth={active ? 2.5 : 2} />
      </span>
      <span className="flex-1">{label}</span>
      <Badge count={badge ?? 0} />
      {medical && active && <ChevronRight size={15} strokeWidth={2.25} className="flex-shrink-0 text-blue-500" />}
    </Link>
  );
}

/** Ítem con submenú: navega a su propia ruta y despliega los hijos con la flecha. */
function NavExpandable({
  item, isActive, onNavigate, variant = "default",
}: {
  item: NavItem;
  isActive: (item: NavItem) => boolean;
  onNavigate?: () => void;
  variant?: SidebarProps["variant"];
}) {
  const { href, label, icon: Icon, children = [] } = item;
  const childActive = children.some(isActive);
  const active = isActive(item) || childActive;
  // null = sigue el estado de la ruta (abierto si un hijo está activo); luego respeta
  // la preferencia manual del usuario. Sin efectos para no romper la regla de lint.
  const [openManual, setOpenManual] = useState<boolean | null>(null);
  const open = openManual ?? childActive;
  const medical = variant === "medical";
  const activeClass = medical
    ? "bg-gradient-to-r from-cyan-50/80 to-blue-50/70 text-blue-700 ring-1 ring-blue-100/90 dark:from-cyan-950/55 dark:to-blue-950/40 dark:text-cyan-50 dark:ring-cyan-800/70"
    : ACTIVE_CLS;
  const idleClass = medical
    ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white"
    : IDLE_CLS;

  return (
    <div>
      <div className={`group relative flex items-center rounded-xl transition-all duration-150 ${active ? activeClass : idleClass}`}>
        {medical && active && <span className="absolute left-0 h-5 w-0.5 rounded-r-full bg-cyan-600 dark:bg-cyan-400" />}
        <Link prefetch={false} href={href} onClick={onNavigate} className="flex items-center gap-3 pl-3 pr-1 py-2.5 text-sm font-medium flex-1 min-w-0">
          <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
            medical && active
              ? "text-blue-600 dark:text-cyan-300"
              : medical
                ? MEDICAL_ICON_TONE[item.tone ?? "cyan"]
                : ""
          }`}>
            <Icon size={16} strokeWidth={active ? 2.5 : 2} />
          </span>
          <span className="flex-1 truncate">{label}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpenManual(!open)}
          aria-expanded={open}
          aria-label={open ? "Contraer submenú" : "Expandir submenú"}
          className="px-2 self-stretch flex items-center text-current/70 hover:text-current"
        >
          <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
        </button>
      </div>
      {open && (
        <div className="mt-0.5 ml-5 pl-2 border-l border-slate-200 dark:border-[#c9a892]/25 space-y-0.5">
          {children.map((c) => (
            <NavLink key={c.href} item={c} active={isActive(c)} onNavigate={onNavigate} nested variant={variant} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarBody({
  navItems,
  roleLabel,
  profile,
  dark,
  toggle,
  isActive,
  isGroupCollapsed,
  toggleGroup,
  onNavigate,
  onChangePassword,
  onLogout,
  onCollapseDesktopPanel,
  variant,
}: SidebarBodyProps) {
  const medical = variant === "medical";
  const medicalFooterAction = medical
    ? "text-slate-500 hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-400 dark:hover:bg-cyan-950/50 dark:hover:text-cyan-200"
    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-[#c9a892]/10 dark:hover:bg-slate-800/80";
  const renderItem = (item: NavItem) =>
    item.children?.length
      ? <NavExpandable key={item.href} item={item} isActive={isActive} onNavigate={onNavigate} variant={variant} />
      : <NavLink key={item.href} item={item} active={isActive(item)} onNavigate={onNavigate} variant={variant} />;

  // Ítems sin grupo (p. ej. Inicio) arriba; el resto agrupado por sección colapsable.
  const sinGrupo = navItems.filter((i) => !i.group);
  const grupos: string[] = [];
  for (const i of navItems) if (i.group && !grupos.includes(i.group)) grupos.push(i.group);

  return (
    <div className={`flex h-full flex-col border-r text-slate-700 dark:text-white ${medical ? "border-slate-200 bg-white dark:border-cyan-950 dark:bg-slate-950" : "border-slate-200 bg-white dark:border-[#c9a892]/25 dark:bg-[var(--color-institutional-dark)]"}`}>
      <div className={`flex flex-col items-center gap-3 border-b px-4 pt-5 pb-4 ${medical ? "border-blue-100 bg-gradient-to-b from-white to-cyan-50/45 dark:border-cyan-950 dark:from-slate-950 dark:to-cyan-950/25" : "border-slate-200 dark:border-[#c9a892]/20"}`}>
        <div className={`${medical ? "h-16" : "h-20"} flex items-center justify-center`}>
          <Image
            src={SIDEBAR_LOGO_LIGHT_SRC}
            alt="Hospital Nacional El Salvador"
            width={150}
            height={150}
            className={`${medical ? "h-16" : "h-20"} w-auto object-contain opacity-80 brightness-0 dark:hidden`}
            priority
          />
          <Image
            src={SIDEBAR_LOGO_DARK_SRC}
            alt="Hospital Nacional El Salvador"
            width={150}
            height={150}
            className={`hidden ${medical ? "h-16" : "h-20"} w-auto object-contain dark:block`}
            priority
          />
        </div>
        <div className="flex items-center gap-2.5 w-full">
          <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg shadow-sm ${medical ? "bg-gradient-to-br from-cyan-600 to-blue-600 shadow-cyan-600/25 dark:from-cyan-400 dark:to-blue-400" : "bg-[var(--color-institutional-navy)] dark:bg-[var(--color-institutional-warm)]"}`}>
            <span className="text-white dark:text-[var(--color-institutional-dark)] text-[10px] font-bold tracking-wide">ES</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight font-heading">
              {roleLabel}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {profile?.nombre}
            </p>
          </div>
        </div>
      </div>

      <nav className={`flex-1 min-h-0 overflow-y-auto px-2 py-3 ${medical ? "space-y-1" : "space-y-0.5"}`}>
        {sinGrupo.map(renderItem)}

        {grupos.map((group) => {
          const items = navItems.filter((i) => i.group === group);
          const isCollapsed = isGroupCollapsed(group);
          const groupBadge = items.reduce((s, i) => s + (i.badge ?? 0), 0);
          return (
            <div key={group} className={`space-y-0.5 ${medical ? "pt-3 first:pt-0" : "pt-1.5"}`}>
              <button
                onClick={() => toggleGroup(group)}
                aria-expanded={!isCollapsed}
                className={`w-full flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors ${medical ? "text-slate-400 hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-500 dark:hover:bg-cyan-950/50 dark:hover:text-cyan-300" : "text-[#1c1e4d] dark:text-[#c9a892]/70 hover:text-[#2f48aa] dark:hover:text-[#f0ece8] hover:bg-[#1c1e4d]/5 dark:hover:bg-slate-800/70"}`}
              >
                <ChevronDown
                  size={12}
                  className={`flex-shrink-0 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                />
                <span className="flex-1 text-left">{group}</span>
                {isCollapsed && <Badge count={groupBadge} />}
              </button>
              {!isCollapsed && items.map(renderItem)}
            </div>
          );
        })}
      </nav>

      <div className={`px-2 pb-4 pt-2 border-t space-y-1 ${medical ? "border-blue-100 dark:border-cyan-950" : "border-slate-200 dark:border-[#c9a892]/20"}`}>
        {profile?.tipoMedico ? (
          <p className="px-3 pb-1 text-[11px] text-slate-500 dark:text-slate-400">
            {TIPO_MEDICO_CRITICO_LABEL[profile.tipoMedico]} · {profile.servicios?.length ?? 0} unidades
          </p>
        ) : profile?.servicio && (
          <p className="px-3 pb-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {profile.servicio}
          </p>
        )}
        <button
          onClick={toggle}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-all ${medicalFooterAction}`}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
          {dark ? "Modo claro" : "Modo oscuro"}
        </button>
        <button
          onClick={onChangePassword}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-all ${medicalFooterAction}`}
        >
          <KeyRound size={16} />
          Cambiar contrasena
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-white hover:bg-red-50 dark:hover:bg-red-500/25 transition-all"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
        {onCollapseDesktopPanel && (
          <button
            type="button"
            onClick={onCollapseDesktopPanel}
            className={`hidden md:flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-all ${medicalFooterAction}`}
          >
            <PanelLeftClose size={16} />
            Ocultar panel
          </button>
        )}
      </div>
    </div>
  );
}

export function Sidebar({
  navItems,
  roleLabel,
  variant = "default",
  collapseGroupsInitially = false,
  allowDesktopPanelCollapse = false,
}: SidebarProps) {
  const [open, setOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  // Grupos independientes: cada uno se cierra o abre a gusto sin afectar a los demás.
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [openedGroups, setOpenedGroups] = useState<Set<string>>(new Set());
  const [desktopPanelCollapsed, setDesktopPanelCollapsed] = useState(false);
  const { profile, changePassword, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  // Compensa la escala del 90% en el portal médico sin modificar los demás roles.
  const desktopSidebarWidth = variant === "medical" ? "w-[17rem]" : "w-60";

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

  const isGroupCollapsed = (group: string) =>
    collapseGroupsInitially ? !openedGroups.has(group) : closedGroups.has(group);

  const toggleGroup = (group: string) => {
    const setGroups = collapseGroupsInitially ? setOpenedGroups : setClosedGroups;
    setGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const toggleDesktopPanel = () => {
    setDesktopPanelCollapsed((previous) => !previous);
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("");
    setPasswordError("");
    setSavingPassword(false);
  };

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");

    if (newPassword.length < 6) {
      setPasswordError("La nueva contrasena debe tener al menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("La confirmacion no coincide.");
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordMessage("Contrasena actualizada correctamente.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setPasswordError("La contrasena actual no es correcta.");
      } else if (code === "auth/weak-password") {
        setPasswordError("La nueva contrasena debe tener al menos 6 caracteres.");
      } else {
        setPasswordError("No se pudo cambiar la contrasena. Intenta de nuevo.");
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const totalBadge = navItems.reduce((sum, item) => sum + (item.badge ?? 0), 0);

  const sidebarProps = {
    navItems,
    roleLabel,
    profile,
    dark,
    toggle,
    isActive,
    isGroupCollapsed,
    toggleGroup,
    onChangePassword: () => {
      setShowPasswordModal(true);
      setOpen(false);
    },
    onLogout: handleLogout,
    onCollapseDesktopPanel: allowDesktopPanelCollapse ? toggleDesktopPanel : undefined,
    variant,
  };

  return (
    <>
      {/* Mobile top bar. El fondo/borde llega hasta el borde real de la pantalla
          (pt-safe reserva el notch); la fila de contenido (h-14) queda siempre
          debajo del área segura, como en una app nativa. */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-[var(--color-institutional-dark)] backdrop-blur-sm border-b border-slate-200 dark:border-blue-900/30 pt-safe">
      <div className="flex items-center h-14 px-3 gap-3">
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
            className="h-9 w-auto object-contain opacity-80 brightness-0 dark:hidden"
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

      <aside
        className={`hidden md:block relative flex-shrink-0 transition-[width] duration-300 ease-out ${
          allowDesktopPanelCollapse && desktopPanelCollapsed ? "w-0" : desktopSidebarWidth
        }`}
        aria-label="Navegación principal"
      >
        <div className={`h-screen sticky top-0 ${desktopSidebarWidth} transition-all duration-300 ease-out ${
          allowDesktopPanelCollapse && desktopPanelCollapsed
            ? "-translate-x-full opacity-0 pointer-events-none"
            : "translate-x-0 opacity-100"
        }`}>
          <SidebarBody {...sidebarProps} />
        </div>
      </aside>

      {allowDesktopPanelCollapse && desktopPanelCollapsed && (
        <button
          type="button"
          onClick={toggleDesktopPanel}
          className="hidden md:flex fixed left-0 top-1/2 z-40 h-12 w-8 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-slate-200 bg-white text-slate-500 shadow-lg shadow-slate-900/10 transition-colors hover:bg-slate-50 hover:text-[#1c1e4d] dark:border-[#c9a892]/35 dark:bg-[var(--color-institutional-dark)] dark:text-slate-300 dark:shadow-black/30 dark:hover:bg-slate-800 dark:hover:text-white"
          aria-label="Mostrar panel lateral"
          title="Mostrar panel lateral"
        >
          <PanelLeftOpen size={17} />
        </button>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <form onSubmit={handleChangePassword} className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Cuenta</p>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Cambiar contrasena</h2>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Contrasena actual</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Nueva contrasena</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Confirmar nueva contrasena</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {passwordError && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{passwordError}</p>
            )}
            {passwordMessage && (
              <p className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2">{passwordMessage}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closePasswordModal}
                className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingPassword}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
              >
                {savingPassword ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
