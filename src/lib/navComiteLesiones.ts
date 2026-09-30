import { Activity, Bandage, BarChart3, LayoutDashboard, Megaphone, ShieldAlert, Users } from "lucide-react";
import type { EntradaNav, SeccionNav } from "@/lib/navRegistro";
import { veComiteCompleto } from "@/lib/accesoComiteLesiones";

// Vistas del Comité de Lesiones Intencionales, definidas UNA vez. Las usan el
// menú propio del comité y el grupo "Lesiones intencionales" de las áreas que
// apoyan el trámite (Psicología, Trabajo Social y los médicos marcados por
// persona). El layout de /comite-lesiones deriva su veto de estas mismas
// entradas con rutaVetada(), así que quién ve qué se declara solo aquí:
//   - Comité y médicos que apoyan: todo.
//   - Psicología: todo salvo Reportes.
//   - Trabajo Social: avisos, ingresos por lesión y solicitudes a médicos.
export const ENTRADAS_COMITE_LESIONES: EntradaNav[] = [
  { href: "/comite-lesiones/conapina-fgr",          label: "Avisos CONAPINA / FGR", icon: ShieldAlert, globo: "conapina" },
  { href: "/comite-lesiones/lesiones-ingresos",     label: "Ingresos por lesión",   icon: Activity },
  { href: "/comite-lesiones/solicitudes",           label: "Avisos pendientes a notificar / Solicitudes al área médica", icon: Megaphone },
  { href: "/comite-lesiones/ingresos-adolescentes", label: "Ingresos adolescentes", icon: Users, visibleSi: p => p?.role !== "trabajo_social" },
  { href: "/comite-lesiones/reportes",              label: "Reportes",              icon: BarChart3, visibleSi: veComiteCompleto },
];

/** Grupo plano al final del menú de quienes apoyan al comité. */
export const SECCION_LESIONES: SeccionNav = {
  titulo: "Lesiones intencionales",
  icon: Bandage,
  entradas: ENTRADAS_COMITE_LESIONES,
};

/** Menú del propio comité: sus vistas sin encabezado, tras el Resumen. */
export const MENU_COMITE_LESIONES: SeccionNav[] = [
  {
    entradas: [
      { href: "/comite-lesiones", label: "Resumen", icon: LayoutDashboard, exact: true },
      ...ENTRADAS_COMITE_LESIONES,
    ],
  },
];
