"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { entraConsultaExterna } from "@/lib/accesoConsultaExterna";
import { PantallaLlamados } from "@/components/consultaExterna/PantallaLlamados";

// Pantalla de llamados a pantalla completa (fuera del layout con menú).
export default function PantallaLlamadosPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const permitido = entraConsultaExterna(profile);

  useEffect(() => {
    if (!loading && !permitido) router.replace("/login");
  }, [loading, permitido, router]);

  if (loading || !profile || !permitido) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d2739]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
      </div>
    );
  }

  return <PantallaLlamados />;
}
