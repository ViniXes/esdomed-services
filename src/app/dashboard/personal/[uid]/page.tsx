"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { UserProfile } from "@/types";
import { esEnMemoria, fechaBajaCorta } from "@/lib/bajaUsuarios";
import { EvaluacionesPersonal } from "@/components/personal/EvaluacionesPersonal";
import { ArrowLeft, ClipboardCheck, IdCard, UserRound } from "lucide-react";

// Ficha de un empleado ESDOMED, con el archivero de evaluaciones/amonestaciones
// (ver EvaluacionesPersonal). El admin puede abrir la ficha de cualquiera; el
// resto del personal ESDOMED solo la suya — no es ético que vean las notas de
// un compañero (ver firestore.rules: evaluaciones_personal).

const ROLES_PERMITIDOS = new Set(["esdomed", "asistente_esdomed", "admin"]);

type Persona = Pick<UserProfile, "uid" | "nombre" | "email" | "codigoMarcacion" | "puesto" | "role" | "activo" | "baja">;
type Tab = "datos" | "evaluaciones";

export default function FichaEmpleadoPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = use(params);
  const { profile } = useAuth();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("datos");

  const rolPermitido = !!profile?.role && ROLES_PERMITIDOS.has(profile.role);
  const esAdmin = profile?.role === "admin";
  const esPropia = profile?.uid === uid;
  const puedeVer = rolPermitido && (esAdmin || esPropia);

  useEffect(() => {
    // Sin permiso no se lee nada: el render muestra el aviso de acceso antes
    // de mirar `loading` (mismo orden que /dashboard/personal).
    if (!puedeVer) return;
    let cancelado = false;
    getDoc(doc(db, "usuarios", uid))
      .then((snap) => {
        if (cancelado) return;
        setPersona(snap.exists() ? ({ uid: snap.id, ...snap.data() } as Persona) : null);
      })
      .catch(() => { if (!cancelado) setError("No se pudo cargar el expediente."); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [uid, puedeVer]);

  if (!rolPermitido) {
    return <div className="p-6 text-sm text-slate-500">Esta sección es del personal de ESDOMED.</div>;
  }
  if (!puedeVer) {
    return <div className="p-6 text-sm text-slate-500">Solo puedes ver tu propio expediente.</div>;
  }
  if (loading) {
    return <p className="text-sm text-slate-500 text-center py-10">Cargando expediente…</p>;
  }
  if (error || !persona) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <Link href="/dashboard/personal" className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4">
          <ArrowLeft size={14} /> Volver a Personal de trabajo
        </Link>
        <p className="text-sm text-rose-600 dark:text-rose-400">{error || "No se encontró a esta persona."}</p>
      </div>
    );
  }

  const memoria = esEnMemoria(persona);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Link href="/dashboard/personal" className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4">
        <ArrowLeft size={14} /> Volver a Personal de trabajo
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-sm font-bold border border-blue-200 dark:border-blue-900">
          {inicialesNombre(persona.nombre)}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading truncate">{persona.nombre}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {persona.puesto || "Sin puesto"}
            {persona.activo === false && !memoria ? " · Baja" : ""}
            {memoria ? " · En memoria" : ""}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 mb-4">
        {([
          { id: "datos", label: "Datos", icon: UserRound },
          { id: "evaluaciones", label: "Evaluaciones y amonestaciones", icon: ClipboardCheck },
        ] as { id: Tab; label: string; icon: typeof UserRound }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "datos" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
          <Dato icon={IdCard} label="Código de marcación" value={persona.codigoMarcacion || "Sin código"} />
          <Dato icon={UserRound} label="Correo" value={persona.email || "—"} />
          {persona.baja?.fecha && (
            <Dato icon={UserRound} label="Fecha de baja" value={fechaBajaCorta(persona.baja.fecha) || persona.baja.fecha} />
          )}
        </div>
      )}

      {tab === "evaluaciones" && (
        <EvaluacionesPersonal empleadoId={persona.uid} empleadoNombre={persona.nombre} puedeGestionar={esAdmin} />
      )}
    </div>
  );
}

function Dato({ icon: Icon, label, value }: { icon: typeof IdCard; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={15} className="text-slate-400 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{value}</p>
      </div>
    </div>
  );
}

function inicialesNombre(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase();
}
