"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (profile?.role === "medico") router.replace("/medico");
    else if (profile?.role === "psicologia") router.replace("/psicologia");
    else if (profile?.role === "comite_lesiones") router.replace("/comite-lesiones");
    else if (profile?.role === "enfermeria") router.replace("/enfermeria");
    else if (profile?.role === "rrhh") router.replace("/rrhh");
    else if (profile?.role === "transporte" || profile?.role === "motorista") router.replace("/transporte");
    else if (profile?.role === "isbm_tecnico" || profile?.role === "isbm_supervisor" || profile?.role === "isbm_jefe") router.replace("/isbm");
    else if (profile) router.replace("/dashboard");
    // Sesión sin perfil (anónima del formulario público de transporte): al login.
    else router.replace("/login");
  }, [user, profile, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
