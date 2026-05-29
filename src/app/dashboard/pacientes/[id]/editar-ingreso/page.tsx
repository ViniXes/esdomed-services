"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Save, AlertTriangle, Stethoscope } from "lucide-react";
import { IngresoForm, type PacienteFormValue } from "@/components/pacientes/PacienteForm";
import { toDate } from "@/lib/pacientes/helpers";
import type { Paciente } from "@/types";

export default function EditarIngresoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const [form, setForm] = useState<PacienteFormValue>({});
  const [tieneMovimientos, setTieneMovimientos] = useState(false);
  const [nombre, setNombre] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDoc(doc(db, "pacientes", id)).then((snap) => {
      if (!snap.exists()) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const data = snap.data() as Omit<Paciente, "id">;
      setNombre(`${data.nombres} ${data.apellidos}`.replace(/\s+/g, " ").trim());
      setTieneMovimientos((data.movimientos?.length ?? 0) > 0);
      setForm(ingresoToForm(data));
      setLoading(false);
    });
  }, [id]);

  const validar = (): string | null => {
    if (!form.fechaIngreso)            return "La fecha de ingreso es obligatoria.";
    if (!form.servicioIngreso?.trim()) return "El servicio de ingreso es obligatorio.";
    return null;
  };

  const guardar = async () => {
    if (!profile) return;
    const err = validar();
    if (err) { setError(err); return; }
    setError(null);
    setGuardando(true);
    try {
      const servicioIngreso = form.servicioIngreso!.trim();
      const patch: Record<string, unknown> = {
        fechaIngreso:    Timestamp.fromDate(new Date(form.fechaIngreso!)),
        servicioIngreso,
        circunstanciaIngreso:       form.circunstanciaIngreso ?? null,
        establecimientoProcedencia: form.establecimientoProcedencia?.trim() || null,
        medicoIngresoNombre:        form.medicoIngresoNombre?.trim()         || null,
        camaActual:                 form.camaActual?.trim()                  || null,
        diagnosticoIngreso:
          form.diagnosticoIngreso?.codigo || form.diagnosticoIngreso?.descripcion
            ? {
                codigo:      (form.diagnosticoIngreso.codigo      ?? "").trim(),
                descripcion: (form.diagnosticoIngreso.descripcion ?? "").trim(),
              }
            : null,
        actualizadoEn:  Timestamp.now(),
        actualizadoPor: profile.uid,
      };
      // Solo si el paciente no se ha trasladado, el servicio actual sigue al de ingreso.
      if (!tieneMovimientos) patch.servicioActual = servicioIngreso;

      await updateDoc(doc(db, "pacientes", id), patch);
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
          <Link href="/dashboard/pacientes" className="inline-block mt-3 text-sm text-blue-600 hover:underline">
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
        <Link
          href={`/dashboard/pacientes/${id}`}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Editar este ingreso
          </h1>
          {nombre && <p className="text-xs text-slate-500 mt-0.5">{nombre}</p>}
        </div>
      </div>

      {/* Aviso de alcance */}
      <div className="flex items-start gap-2.5 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
        <Stethoscope size={16} className="mt-0.5 flex-shrink-0 text-slate-400" />
        <p className="text-xs">
          Estos datos clínicos pertenecen <strong>solo a este ingreso</strong>. Para cambiar
          nombre, DUI, dirección u otros datos personales, usa
          {" "}<Link href={`/dashboard/pacientes/${id}/editar-persona`} className="text-blue-600 dark:text-blue-400 hover:underline">
            Editar datos del paciente
          </Link>.
        </p>
      </div>

      <IngresoForm value={form} onChange={setForm} />

      {/* Footer */}
      <div className="sticky bottom-0 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50/95 dark:via-slate-950/95 to-transparent pt-4 pb-2 -mx-4 px-4 md:-mx-6 md:px-6">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center gap-3 justify-end">
          <Link
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

// ── Ingreso (Firestore raw) → campos de ingreso del formulario ──────────────

function ingresoToForm(data: Omit<Paciente, "id">): PacienteFormValue {
  const fIng = toDate(data.fechaIngreso);
  return {
    fechaIngreso:               fIng ? toDatetimeLocalInput(fIng) : undefined,
    servicioIngreso:            data.servicioIngreso,
    camaActual:                 data.camaActual,
    circunstanciaIngreso:       data.circunstanciaIngreso,
    establecimientoProcedencia: data.establecimientoProcedencia,
    medicoIngresoNombre:        data.medicoIngresoNombre,
    diagnosticoIngreso:         data.diagnosticoIngreso,
  };
}

function toDatetimeLocalInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  const hh   = String(d.getHours()).padStart(2, "0");
  const mi   = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
