"use client";

import { Brain, Clock, HeartPulse, Inbox, LogIn, ShieldAlert, UserSearch } from "lucide-react";
import { InicioArea } from "@/components/InicioArea";

export default function PsicologiaHome() {
  return (
    <InicioArea
      area="Psicología"
      icono={Brain}
      pendientes={[
        { href: "/psicologia/fallecidos", label: "Fallecidos por revisar", icon: HeartPulse, globo: "fallecidos", tone: "rose" },
        { href: "/psicologia/recepciones", label: "Recepciones por confirmar", icon: Inbox, globo: "recepciones" },
        { href: "/comite-lesiones/conapina-fgr", label: "Avisos CONAPINA / FGR por recibir", icon: ShieldAlert, globo: "conapina" },
      ]}
      accesos={[
        { href: "/psicologia/buscar-paciente", label: "Buscar paciente", icon: UserSearch },
        { href: "/psicologia/pacientes-activos", label: "Pacientes activos", icon: Clock },
        { href: "/psicologia/altas-vivos", label: "Verificación de Altas", icon: LogIn },
      ]}
    />
  );
}
