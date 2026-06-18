"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, Inbox, UserSearch } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/Sidebar";

const navItems = [
  { href: "/psicologia/buscar-paciente", label: "Buscar Paciente", icon: UserSearch },
  { href: "/psicologia/fallecidos",   label: "Fallecidos",  icon: HeartPulse },
  { href: "/psicologia/recepciones",  label: "Recepciones", icon: Inbox },
];

export default function PsicologiaLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== "psicologia") router.replace("/login");
  }, [loading, profile, router]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)] overflow-hidden">
      <Sidebar navItems={navItems} roleLabel="Psicología" />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0 bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
        {loading || !profile ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : children}
      </main>
    </div>
  );
}
