"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { entraConsultaExterna } from "@/lib/accesoConsultaExterna";
import { PantallaLlamados } from "@/components/consultaExterna/PantallaLlamados";

// Pantalla de llamados a pantalla completa (fuera del layout con menú).
// /consulta-externa/pantalla?demo=1 → modo de prueba, sin Firestore.
export default function PantallaLlamadosPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const permitido = entraConsultaExterna(profile);
  const [demo, setDemo] = useState<boolean | null>(null);

  useEffect(() => {
    // Parámetro de la URL leído al montar (sin Suspense de useSearchParams).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDemo(new URLSearchParams(window.location.search).get("demo") === "1");
  }, []);

  useEffect(() => {
    if (!loading && !permitido) router.replace("/login");
  }, [loading, permitido, router]);

  if (loading || !profile || !permitido || demo === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d2739]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
      </div>
    );
  }

  return <PantallaLlamados demo={demo} />;
}
