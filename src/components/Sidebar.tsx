"use client";

import { useState, useEffect, useId, useRef, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, LogOut, Sun, Moon, LockKeyhole, ChevronDown, Folder, PanelLeftClose, PanelLeftOpen, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { UserProfile } from "@/types";
import { TIPO_MEDICO_CRITICO_LABEL } from "@/lib/cuidadosCriticos";
import { AcercaDeModal } from "@/components/AcercaDeModal";

const SIDEBAR_LOGO_LIGHT_SRC = "/logo_hnes_sidebar.png";
const SIDEBAR_LOGO_DARK_SRC = "/logo_hnes_sidebar.png";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Único tono con significado: rose en Fallecidos/Defunciones. Sin tono, azul institucional. */
  tone?: "rose";
  exact?: boolean;
  badge?: number;
  /** Encabezado de sección. Los ítems consecutivos con el mismo grupo se muestran juntos. */
  group?: string;
  /** Ícono del botón padre del grupo en modo acordeón (se toma del primer ítem del grupo). */
  groupIcon?: LucideIcon;
  /** Tono del ícono del botón padre; solo rose (grupo de defunciones). */
  groupTone?: "rose";
}

interface SidebarProps {
  navItems: NavItem[];
  roleLabel: string;
  /**
   * Menú en acordeón: portales de área (médico, Psicología, Trabajo Social) y
   * dashboard de ESDOMED/admin. `default` queda para los módulos que aún no se
   * migran al registro (enfermería, RRHH, transporte, ISBM, horarios, comité).
   */
  variant?: "default" | "portal";
  /** Habilita el control de escritorio para ocultar el panel lateral. */
  allowDesktopPanelCollapse?: boolean;
}

interface SidebarBodyProps extends SidebarProps {
  dark: boolean;
  profile: UserProfile | null;
  activeHref: string | null;
  isActive: (item: NavItem) => boolean;
  isGroupCollapsed: (group: string) => boolean;
  toggleGroup: (group: string) => void;
  onChangePassword: () => void;
  onLogout: () => void;
  onAcercaDe: () => void;
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
  "bg-blue-50 text-blue-900 ring-1 ring-cyan-600/35 shadow-sm shadow-blue-100 dark:bg-blue-900 dark:text-white dark:ring-cyan-400/40 dark:shadow-cyan-950/30";
const IDLE_CLS =
  "text-slate-600 dark:text-slate-300 hover:bg-blue-50/70 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white";

// Rose conserva su significado aun activo; el resto es azul institucional.
function iconCls(item: NavItem, active: boolean) {
  if (item.tone === "rose") return "text-rose-500 group-hover:text-rose-600 dark:text-rose-300";
  return active
    ? "text-blue-600 dark:text-cyan-300"
    : "text-blue-500 group-hover:text-blue-700 dark:text-cyan-300";
}

/**
 * Un solo ítem activo por ruta: gana el href más específico que calce. Así
 * /medico/censos/referidos marca Censos (no Inicio ni nada) y dos ítems que
 * comparten prefijo nunca se resaltan a la vez.
 */
function itemActivo(items: NavItem[], pathname: string): NavItem | null {
  let activo: NavItem | null = null;
  for (const item of items) {
    const calza = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");
    if (calza && (!activo || item.href.length > activo.href.length)) activo = item;
  }
  return activo;
}

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
  const portal = variant === "portal";
  // Hijo del acordeón: ícono y márgenes un poco más compactos para que
  // los nombres largos quepan en una línea pese a la sangría.
  const hijoAcordeon = portal && nested;
  const activeClass = portal
    ? "bg-gradient-to-r from-cyan-50/80 to-blue-50/70 text-blue-700 ring-1 ring-blue-100/90 dark:from-cyan-950/55 dark:to-blue-950/40 dark:text-cyan-50 dark:ring-cyan-800/70"
    : ACTIVE_CLS;
  const idleClass = portal
    ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white"
    : IDLE_CLS;
  return (
    <Link prefetch={false}
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center rounded-xl transition-all duration-150 ${
        hijoAcordeon
          ? "min-h-11 gap-2.5 px-2.5 py-2 text-[13px] font-medium"
          : nested
          ? "gap-3 px-3 py-2 text-[13px] font-medium"
          // En el acordeón, un ítem suelto (Inicio) está al nivel de los
          // botones padre y lleva su mismo peso.
          : portal ? "gap-3 px-3 py-2 text-sm font-semibold" : "gap-3 px-3 py-2.5 text-sm font-medium"
      } ${active ? activeClass : idleClass}`}
    >
      {/* Dentro de un grupo, la marca del activo cae sobre la línea guía. */}
      {portal && active && <span className={`absolute h-5 w-0.5 rounded-full bg-cyan-600 dark:bg-cyan-400 ${nested ? "left-[calc(-0.5rem-1.5px)]" : "left-0"}`} />}
      <span className={`flex flex-shrink-0 items-center justify-center rounded-lg transition-colors ${hijoAcordeon ? "h-6 w-6" : "h-7 w-7"} ${iconCls(item, active)}`}>
        <Icon size={nested ? 15 : 16} strokeWidth={active ? 2.5 : 2} />
      </span>
      <span className={`flex-1 ${hijoAcordeon ? "leading-snug" : ""}`}>{label}</span>
      <Badge count={badge ?? 0} />
    </Link>
  );
}

/**
 * Lleva `el` al área visible del <nav> moviendo solo su scroll propio (nunca la
 * página). Si no cabe entero, lo alinea arriba. En un panel oculto
 * (display:none) las medidas son 0 y no hace nada.
 */
function asegurarVisible(nav: HTMLElement | null, el: Element | null | undefined) {
  if (!nav || !el) return;
  const n = nav.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  let delta = 0;
  if (r.top < n.top || r.height > n.height) delta = r.top - n.top - 8;
  else if (r.bottom > n.bottom) delta = r.bottom - n.bottom + 8;
  if (!delta) return;
  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  nav.scrollTo({ top: nav.scrollTop + delta, behavior: suave ? "smooth" : "auto" });
}

// Duración del despliegue del acordeón; el scroll espera a que termine.
const ACORDEON_MS = 200;

/**
 * Grupo del acordeón de los portales: botón padre de ancho completo (mismo tamaño que
 * un ítem) y sus hijos desplegables debajo, colgados de una línea guía.
 */
function GrupoAcordeon({
  group, items, abierto, onToggle, isActive, onNavigate, variant,
}: {
  group: string;
  items: NavItem[];
  abierto: boolean;
  onToggle: () => void;
  isActive: (item: NavItem) => boolean;
  onNavigate?: () => void;
  variant?: SidebarProps["variant"];
}) {
  const panelId = useId();
  const Icon = items[0]?.groupIcon ?? Folder;
  const contieneActivo = items.some(isActive);
  const globo = items.reduce((s, i) => s + (i.badge ?? 0), 0);

  return (
    <div data-grupo={group}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        aria-controls={panelId}
        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors duration-150 ${
          abierto
            ? "bg-slate-100/80 text-slate-900 dark:bg-slate-800/70 dark:text-white"
            // Cerrado pero con la página actual adentro: el padre la delata.
            : contieneActivo
              ? "text-blue-700 hover:bg-slate-50 dark:text-cyan-200 dark:hover:bg-slate-800/80"
              : "text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/80 dark:hover:text-white"
        }`}
      >
        <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
          items[0]?.groupTone === "rose"
            ? "text-rose-500 group-hover:text-rose-600 dark:text-rose-300"
            : contieneActivo ? "text-blue-600 dark:text-cyan-300" : "text-blue-500 group-hover:text-blue-700 dark:text-cyan-300"
        }`}>
          <Icon size={16} strokeWidth={contieneActivo ? 2.5 : 2} />
        </span>
        <span className="flex-1">{group}</span>
        {/* Globo y flecha en un bloque compacto: deja más ancho al nombre del
            grupo ("Lesiones intencionales" con globo cabe en una línea). */}
        <span className="flex flex-shrink-0 items-center gap-1.5">
          {/* Cerrado, el padre resume los globos de sus hijos. */}
          {!abierto && <Badge count={globo} />}
          <ChevronDown
            size={15}
            aria-hidden
            className={`text-slate-400 transition-transform duration-200 ease-out motion-reduce:transition-none dark:text-slate-500 ${abierto ? "" : "-rotate-90"}`}
          />
        </span>
      </button>
      {/* grid-rows 0fr↔1fr anima la altura sin medirla; inert saca a los hijos
          ocultos del tabulador y del lector de pantalla. */}
      <div
        id={panelId}
        inert={!abierto}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${abierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="ml-[1.625rem] mt-0.5 mb-1 space-y-0.5 border-l border-slate-200 pl-2 dark:border-slate-800">
            {items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item)} onNavigate={onNavigate} nested variant={variant} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarBody({
  navItems,
  roleLabel,
  profile,
  dark,
  toggle,
  activeHref,
  isActive,
  isGroupCollapsed,
  toggleGroup,
  onNavigate,
  onChangePassword,
  onLogout,
  onAcercaDe,
  onCollapseDesktopPanel,
  variant,
}: SidebarBodyProps) {
  const portal = variant === "portal";
  const portalFooterAction = portal
    ? "text-slate-500 hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-400 dark:hover:bg-cyan-950/50 dark:hover:text-cyan-200"
    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-blue-50/70 dark:hover:bg-slate-800/80";
  const renderItem = (item: NavItem) =>
    <NavLink key={item.href} item={item} active={isActive(item)} onNavigate={onNavigate} variant={variant} />;

  // Ítems sin grupo (p. ej. Inicio) arriba; el resto agrupado por sección colapsable.
  const sinGrupo = navItems.filter((i) => !i.group);
  const grupos: string[] = [];
  for (const i of navItems) if (i.group && !grupos.includes(i.group)) grupos.push(i.group);

  // Variant portal: los grupos se pintan como acordeón (un solo grupo abierto).
  const acordeon = portal;

  // Al cambiar de ruta, el ítem activo entra al área visible del menú (tras
  // el despliegue de su grupo, si se abrió).
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const t = window.setTimeout(
      () => asegurarVisible(navRef.current, navRef.current?.querySelector('[aria-current="page"]')),
      ACORDEON_MS + 20,
    );
    return () => window.clearTimeout(t);
  }, [activeHref]);

  // Al abrir un grupo (sobre todo los de abajo), sus hijos quedan a la vista.
  const alternarGrupo = (group: string) => {
    const abriendo = isGroupCollapsed(group);
    toggleGroup(group);
    if (!abriendo) return;
    window.setTimeout(
      () => asegurarVisible(navRef.current, navRef.current?.querySelector(`[data-grupo="${CSS.escape(group)}"]`)),
      ACORDEON_MS + 20,
    );
  };

  return (
    <div className={`flex h-full flex-col border-r text-slate-700 dark:text-white ${portal ? "border-slate-200 bg-white dark:border-cyan-950 dark:bg-slate-950" : "border-slate-200 bg-white dark:border-cyan-900/40 dark:bg-[var(--color-institutional-dark)]"}`}>
      <div className={`flex flex-col items-center gap-3 border-b px-4 pt-5 pb-4 ${portal ? "border-blue-100 bg-gradient-to-b from-white to-cyan-50/45 dark:border-cyan-950 dark:from-slate-950 dark:to-cyan-950/25" : "border-slate-200 dark:border-cyan-900/40"}`}>
        <div className={`${portal ? "h-16" : "h-20"} flex items-center justify-center`}>
          <Image
            src={SIDEBAR_LOGO_LIGHT_SRC}
            alt="Hospital Nacional El Salvador"
            width={150}
            height={150}
            className={`${portal ? "h-16" : "h-20"} w-auto object-contain opacity-80 brightness-0 dark:hidden`}
            priority
          />
          <Image
            src={SIDEBAR_LOGO_DARK_SRC}
            alt="Hospital Nacional El Salvador"
            width={150}
            height={150}
            className={`hidden ${portal ? "h-16" : "h-20"} w-auto object-contain dark:block`}
            priority
          />
        </div>
        <div className="flex items-center gap-2.5 w-full">
          <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg shadow-sm ${portal ? "bg-gradient-to-br from-cyan-600 to-blue-600 shadow-cyan-600/25 dark:from-cyan-400 dark:to-blue-400" : "bg-gradient-to-br from-[#2b8ca8] to-[#1a4e70] shadow-cyan-900/25 dark:from-cyan-400 dark:to-blue-400"}`}>
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

      {/* pr más corto: la barra de desplazamiento (5 px) cae a la derecha. */}
      <nav ref={navRef} className="flex-1 min-h-0 overflow-y-auto pl-2 pr-1.5 py-3 space-y-0.5">
        {sinGrupo.map(renderItem)}

        {grupos.map((group) => {
          const items = navItems.filter((i) => i.group === group);
          const isCollapsed = isGroupCollapsed(group);
          const groupBadge = items.reduce((s, i) => s + (i.badge ?? 0), 0);
          if (acordeon) {
            return (
              <GrupoAcordeon
                key={group}
                group={group}
                items={items}
                abierto={!isCollapsed}
                onToggle={() => alternarGrupo(group)}
                isActive={isActive}
                onNavigate={onNavigate}
                variant={variant}
              />
            );
          }
          return (
            <div key={group} className={`space-y-0.5 ${portal ? "pt-3 first:pt-0" : "pt-1.5"}`}>
              <button
                onClick={() => toggleGroup(group)}
                aria-expanded={!isCollapsed}
                className={`w-full flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors ${portal ? "text-blue-800 hover:bg-cyan-50 hover:text-cyan-700 dark:text-cyan-300/80 dark:hover:bg-cyan-950/50 dark:hover:text-cyan-200" : "text-blue-900 dark:text-cyan-300/80 hover:text-cyan-700 dark:hover:text-cyan-200 hover:bg-blue-50/70 dark:hover:bg-slate-800/70"}`}
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

      <div className={`px-2 pb-4 pt-2 border-t space-y-1 ${portal ? "border-blue-100 dark:border-cyan-950" : "border-slate-200 dark:border-cyan-900/40"}`}>
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
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-all ${portalFooterAction}`}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
          {dark ? "Modo claro" : "Modo oscuro"}
        </button>
        <button
          onClick={onChangePassword}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-all ${portalFooterAction}`}
        >
          <LockKeyhole size={16} />
          Cambiar contraseña
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
            className={`hidden md:flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-all ${portalFooterAction}`}
          >
            <PanelLeftClose size={16} />
            Ocultar panel
          </button>
        )}
        {/* Enlace discreto al "Acerca de": visible para todos los roles, sin
            competir con las acciones de cuenta. */}
        <button
          type="button"
          onClick={onAcercaDe}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400 transition-colors hover:text-blue-700 dark:text-slate-500 dark:hover:text-cyan-300"
        >
          <Info size={11} strokeWidth={2.25} />
          Acerca de ESDOMED Services
        </button>
      </div>
    </div>
  );
}

export function Sidebar({
  navItems,
  roleLabel,
  variant = "default",
  allowDesktopPanelCollapse = false,
}: SidebarProps) {
  const [open, setOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showAcercaDe, setShowAcercaDe] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  // Variante default: grupos independientes, cada uno se cierra o abre a gusto.
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [desktopPanelCollapsed, setDesktopPanelCollapsed] = useState(false);
  const { profile, changePassword, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  // Compensa la escala del 90% en el menú en acordeón sin modificar los demás
  // roles; además da cabida a los hijos del acordeón (sangría + ícono) sin que
  // "Reposición de incapacidad" parta en dos líneas.
  const desktopSidebarWidth = variant === "portal" ? "w-[18.5rem]" : "w-60";
  const mobileDrawerWidth = variant === "portal" ? "w-72" : "w-64";

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const activo = itemActivo(navItems, pathname);
  const isActive = (item: NavItem) => item.href === activo?.href;

  // Acordeón (variant portal): un solo grupo abierto a la vez, compartido por el
  // panel de escritorio y el del celular. Cuando la ruta cae en otro grupo, se
  // abre ese; entre cambios de ruta manda el usuario. (Se ajusta durante el
  // render, sin efecto, como recomienda React para derivar de props.)
  const acordeon = variant === "portal";
  const grupoActivo = activo?.group ?? null;
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(grupoActivo);
  const [grupoActivoPrevio, setGrupoActivoPrevio] = useState<string | null>(grupoActivo);
  if (grupoActivo !== grupoActivoPrevio) {
    setGrupoActivoPrevio(grupoActivo);
    if (grupoActivo) setGrupoAbierto(grupoActivo);
  }

  const isGroupCollapsed = (group: string) =>
    acordeon ? group !== grupoAbierto : closedGroups.has(group);

  const toggleGroup = (group: string) => {
    if (acordeon) {
      setGrupoAbierto((prev) => (prev === group ? null : group));
      return;
    }
    setClosedGroups((prev) => {
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
      setPasswordError("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("La confirmación no coincide.");
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordMessage("Contraseña actualizada correctamente.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setPasswordError("La contraseña actual no es correcta.");
      } else if (code === "auth/weak-password") {
        setPasswordError("La nueva contraseña debe tener al menos 6 caracteres.");
      } else {
        setPasswordError("No se pudo cambiar la contraseña. Intenta de nuevo.");
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
    activeHref: activo?.href ?? null,
    isActive,
    isGroupCollapsed,
    toggleGroup,
    onChangePassword: () => {
      setShowPasswordModal(true);
      setOpen(false);
    },
    onLogout: handleLogout,
    onAcercaDe: () => {
      setShowAcercaDe(true);
      setOpen(false);
    },
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
        {/* En el celular la barra dice dónde estás; el logo queda para las
            rutas que no están en el menú. */}
        <div className="flex-1 min-w-0 flex justify-center">
          {activo ? (
            <p className="truncate font-heading text-sm font-semibold text-slate-800 dark:text-white">
              {activo.label}
            </p>
          ) : (
            <>
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
            </>
          )}
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
        className={`md:hidden fixed inset-y-0 left-0 z-50 ${mobileDrawerWidth} transition-transform duration-300 ease-in-out ${
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
          className="hidden md:flex fixed left-0 top-1/2 z-40 h-12 w-8 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-slate-200 bg-white text-slate-500 shadow-lg shadow-slate-900/10 transition-colors hover:bg-slate-50 hover:text-blue-800 dark:border-cyan-900/50 dark:bg-[var(--color-institutional-dark)] dark:text-slate-300 dark:shadow-black/30 dark:hover:bg-slate-800 dark:hover:text-white"
          aria-label="Mostrar panel lateral"
          title="Mostrar panel lateral"
        >
          <PanelLeftOpen size={17} />
        </button>
      )}

      <AcercaDeModal open={showAcercaDe} onClose={() => setShowAcercaDe(false)} />

      {showPasswordModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <form onSubmit={handleChangePassword} className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Cuenta</p>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Cambiar contraseña</h2>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Contraseña actual</label>
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
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Nueva contraseña</label>
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
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Confirmar nueva contraseña</label>
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
