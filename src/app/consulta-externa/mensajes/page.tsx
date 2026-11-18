"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { enviaMensajesCE, esCuentaMensajes, esCuentaPantalla, RUTA_PANTALLA_CE } from "@/lib/accesoConsultaExterna";
import { MensajesPantalla } from "@/components/consultaExterna/MensajesPantalla";

// Mensajes a pantalla, sin menú (fuera del grupo (area)): es la única página
// de la cuenta general de mensajes (mensajes_ce). Admin y estaciones también
// la abren desde el menú de Consulta Externa y vuelven con la flecha.
export default function MensajesPantallaPage() {
  const { profile, loading, logout } = useAuth();
  const router = useRouter();
  const permitido = enviaMensajesCE(profile);

  useEffect(() => {
    if (!loading && !permitido) router.replace(esCuentaPantalla(profile) ? RUTA_PANTALLA_CE : "/login");
  }, [loading, permitido, profile, router]);

  if (loading || !profile || !permitido) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const soloMensajes = esCuentaMensajes(profile);
  return (
    <MensajesPantalla
      porNombre={profile.nombre ?? ""}
      regreso={soloMensajes ? undefined : { href: "/consulta-externa", label: "Consulta Externa" }}
      onSalir={soloMensajes ? () => void logout() : undefined}
    />
  );
}
