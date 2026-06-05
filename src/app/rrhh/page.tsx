"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection, getCountFromServer, query, where, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Users, FileText, FilePlus2, Upload, CalendarDays, ArrowRight } from "lucide-react";

interface Stats {
  empleados: number;
  activos: number;
  licenciasAnio: number;
  licenciasMes: number;
}

export default function RRHHInicioPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [cargando, setCargando] = useState(true);
  const anio = new Date().getFullYear();

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
        const empleadosCol = collection(db, "empleados");
        const licenciasCol = collection(db, "licencias");
        const [empSnap, actSnap, anioSnap, mesSnap] = await Promise.all([
          getCountFromServer(empleadosCol),
          getCountFromServer(query(empleadosCol, where("activo", "==", true))),
          getCountFromServer(query(licenciasCol, where("anio", "==", anio))),
          getCountFromServer(query(licenciasCol, where("fechaInicial", ">=", Timestamp.fromDate(inicioMes)))),
        ]);
        if (cancelado) return;
        setStats({
          empleados: empSnap.data().count,
          activos: actSnap.data().count,
          licenciasAnio: anioSnap.data().count,
          licenciasMes: mesSnap.data().count,
        });
      } catch {
        if (!cancelado) setStats({ empleados: 0, activos: 0, licenciasAnio: 0, licenciasMes: 0 });
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [anio]);

  const sinPadron = !cargando && stats?.empleados === 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Recursos Humanos</p>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
          Bienvenido{profile?.nombre ? `, ${profile.nombre.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Gestión de incapacidades y licencias del personal · año {anio}
        </p>
      </div>

      {sinPadron ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center mx-auto mb-3">
            <Upload size={22} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-heading">
            Empieza importando el padrón
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Aún no hay empleados cargados. Sube el export del padrón (hoja CONSULTA) para registrar licencias.
          </p>
          <Link
            href="/rrhh/empleados/importar"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Upload size={15} /> Importar padrón
          </Link>
        </section>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Empleados" value={stats?.activos} sub={`${stats?.empleados ?? 0} en padrón`} loading={cargando} />
          <StatCard icon={CalendarDays} label="Licencias este mes" value={stats?.licenciasMes} loading={cargando} />
          <StatCard icon={FileText} label={`Licencias ${anio}`} value={stats?.licenciasAnio} loading={cargando} />
        </div>
      )}

      <section className="grid sm:grid-cols-2 gap-3">
        <AccionCard
          href="/rrhh/licencias/nueva"
          icon={FilePlus2}
          title="Registrar licencia"
          desc="Captura una incapacidad o permiso con validación de saldo."
        />
        <AccionCard
          href="/rrhh/empleados"
          icon={Users}
          title="Ver empleados"
          desc="Consulta saldos por bolsa e historial de cada empleado."
        />
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, sub, loading,
}: { icon: typeof Users; label: string; value?: number; sub?: string; loading: boolean }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-slate-400 mb-2">
        <Icon size={15} />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      {loading ? (
        <div className="h-7 w-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value ?? 0}</p>
      )}
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function AccionCard({
  href, icon: Icon, title, desc,
}: { href: string; icon: typeof Users; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-start gap-3 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-sm transition-all"
    >
      <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
        <Icon size={17} className="text-blue-600 dark:text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
          {title}
          <ArrowRight size={13} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}
