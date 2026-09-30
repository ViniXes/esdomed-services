"use client";

import { ClipboardCheck, HandHeart, HeartPulse, ListChecks, LogIn, NotebookPen, ShieldAlert, UserCheck } from "lucide-react";
import { InicioArea } from "@/components/InicioArea";

// Inicio de Trabajo Social. Vive en /dashboard (donde están sus vistas): la
// página de /dashboard se lo muestra a TS en lugar del panel de ESDOMED.
export function InicioTrabajoSocial() {
  return (
    <InicioArea
      area="Unidad de Trabajo Social"
      icono={HandHeart}
      pendientes={[
        { href: "/dashboard/defunciones", label: "Fallecidos por revisar", icon: HeartPulse, globo: "fallecidos", tone: "rose" },
        { href: "/dashboard/altas-vivos", label: "Altas por verificar", icon: LogIn, globo: "altas" },
        { href: "/comite-lesiones/conapina-fgr", label: "Avisos CONAPINA / FGR por recibir", icon: ShieldAlert, globo: "conapina" },
      ]}
      accesos={[
        { href: "/dashboard/gestiones/asignaciones", label: "Asignaciones", icon: UserCheck },
        { href: "/dashboard/gestiones/seguimiento", label: "Seguimiento", icon: ListChecks },
        { href: "/dashboard/gestiones", label: "Registro de gestiones", icon: NotebookPen },
        { href: "/dashboard/notificacion-altas", label: "Notificación de Prealta", icon: ClipboardCheck },
      ]}
    />
  );
}
