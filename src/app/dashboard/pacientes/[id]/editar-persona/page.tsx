"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Save, AlertTriangle, Users } from "lucide-react";
import { PacienteForm, type PacienteFormValue } from "@/components/pacientes/PacienteForm";
import { construirDatosPersonales, getPersona, guardarPersona } from "@/lib/pacientes/persona";
import { toDate } from "@/lib/pacientes/helpers";
import type { Paciente, Persona } from "@/types";

export default function EditarPersonaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const [form, setForm] = useState<PacienteFormValue>({});
  const [expediente, setExpediente] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "pacientes", id));
      if (!snap.exists()) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const ingreso = snap.data() as Omit<Paciente, "id">;
      const exp = ingreso.expediente;
      setExpediente(exp);
      // Fuente de verdad: personas/{expediente}. Si aún no existe (datos legados),
      // se parte del snapshot del propio ingreso.
      const persona = await getPersona(exp);
      setForm(personalToForm(persona ?? ingreso));
      setLoading(false);
    })();
  }, [id]);

  const validar = (): string | null => {
    if (!form.apellidos?.trim()) return "Los apellidos son obligatorios.";
    if (!form.nombres?.trim())   return "Los nombres son obligatorios.";
    return null;
  };

  const guardar = async () => {
    if (!profile) return;
    const err = validar();
    if (err) { setError(err); return; }
    setError(null);
    setGuardando(true);
    try {
      const datosPersonales = construirDatosPersonales({ ...form, expediente });
      await guardarPersona(expediente, datosPersonales, profile.uid);
      router.push(`/dashboard/pacientes/${id}`);
    } catch (e) {
      setError(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
      setGuardando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <p className="text-sm text-slate-500">Paciente no encontrado.</p>
          <Link prefetch={false} href="/dashboard/pacientes" className="inline-block mt-3 text-sm text-blue-600 hover:underline">
            ← Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link prefetch={false}
          href={`/dashboard/pacientes/${id}`}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
          Editar datos del paciente
        </h1>
      </div>

      {/* Aviso de propagación */}
      <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
        <Users size={16} className="mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-400">
          Estos datos pertenecen al paciente (expediente <span className="font-mono font-semibold">{expediente}</span>)
          y se actualizan en <strong>todos sus ingresos</strong>. Los datos clínicos de cada
          ingreso se editan por separado.
        </p>
      </div>

      <PacienteForm value={form} onChange={setForm} hideIngreso expedienteReadOnly />

      {/* Footer */}
      <div className="sticky bottom-0 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50/95 dark:via-slate-950/95 to-transparent pt-4 pb-2 -mx-4 px-4 md:-mx-6 md:px-6">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center gap-3 justify-end">
          <Link prefetch={false}
            href={`/dashboard/pacientes/${id}`}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancelar
          </Link>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
          >
            <Save size={15} />
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Persona (o snapshot del ingreso) → campos personales del formulario ─────

function personalToForm(p: Persona | Omit<Paciente, "id">): PacienteFormValue {
  const fNac = toDate(p.fechaNacimiento);
  return {
    expediente:       p.expediente,
    apellidos:        p.apellidos,
    nombres:          p.nombres,
    genero:           p.genero,
    fechaNacimiento:  fNac ? toDateInput(fNac) : undefined,
    estadoFamiliar:   p.estadoFamiliar,
    dui:              p.dui,
    numeroAfiliacion: p.numeroAfiliacion,
    ocupacion:        p.ocupacion,
    nacionalidad:     p.nacionalidad,
    direccion:        p.direccion,
    municipio:        p.municipio,
    departamento:     p.departamento,
    canton:           p.canton,
    area:             p.area,
    telefono:         p.telefono,
    otrosNumeros:     p.otrosNumeros,
    responsable:      p.responsable,
  };
}

function toDateInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
