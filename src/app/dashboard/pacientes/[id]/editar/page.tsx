"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Save, AlertTriangle } from "lucide-react";
import { PacienteForm, type PacienteFormValue } from "@/components/pacientes/PacienteForm";
import type { Paciente, ResponsablePaciente } from "@/types";

export default function EditarPacientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const [form, setForm] = useState<PacienteFormValue>({});
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
      setForm(pacienteToForm(data));
      setLoading(false);
    });
  }, [id]);

  const validar = (): string | null => {
    if (!form.expediente?.trim())      return "El expediente es obligatorio.";
    if (!form.apellidos?.trim())       return "Los apellidos son obligatorios.";
    if (!form.nombres?.trim())         return "Los nombres son obligatorios.";
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
      const fechaIngreso = new Date(form.fechaIngreso!);
      const fechaNacimiento = form.fechaNacimiento ? new Date(form.fechaNacimiento) : null;
      const responsableLimpio = limpiarResponsable(form.responsable);

      const patch: Record<string, unknown> = {
        expediente:       form.expediente!.trim(),
        apellidos:        form.apellidos!.trim(),
        nombres:          form.nombres!.trim(),
        genero:           form.genero ?? "otro",
        fechaIngreso:     Timestamp.fromDate(fechaIngreso),
        servicioIngreso:  form.servicioIngreso!.trim(),
        actualizadoEn:    Timestamp.now(),
        actualizadoPor:   profile.uid,
      };

      // Campos opcionales
      patch.fechaNacimiento           = fechaNacimiento ? Timestamp.fromDate(fechaNacimiento) : null;
      patch.estadoFamiliar            = form.estadoFamiliar?.trim()              || null;
      patch.dui                       = form.dui?.trim()                         || null;
      patch.numeroAfiliacion          = form.numeroAfiliacion?.trim()            || null;
      patch.ocupacion                 = form.ocupacion?.trim()                   || null;
      patch.nacionalidad              = form.nacionalidad?.trim()                || null;
      patch.direccion                 = form.direccion?.trim()                   || null;
      patch.municipio                 = form.municipio?.trim()                   || null;
      patch.departamento              = form.departamento?.trim()                || null;
      patch.canton                    = form.canton?.trim()                      || null;
      patch.area                      = form.area                               ?? null;
      patch.telefono                  = form.telefono?.trim()                    || null;
      patch.otrosNumeros              = form.otrosNumeros?.trim()                || null;
      patch.responsable               = responsableLimpio;
      patch.establecimientoProcedencia = form.establecimientoProcedencia?.trim() || null;
      patch.circunstanciaIngreso      = form.circunstanciaIngreso               ?? null;
      patch.servicioActual            = form.servicioIngreso!.trim();  // sólo si no hubo movimientos
      patch.camaActual                = form.camaActual?.trim()                  || null;
      patch.medicoIngresoNombre       = form.medicoIngresoNombre?.trim()         || null;
      patch.diagnosticoIngreso        =
        form.diagnosticoIngreso?.codigo || form.diagnosticoIngreso?.descripcion
          ? {
              codigo:      (form.diagnosticoIngreso.codigo      ?? "").trim(),
              descripcion: (form.diagnosticoIngreso.descripcion ?? "").trim(),
            }
          : null;

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
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
          Editar paciente
        </h1>
      </div>

      <PacienteForm value={form} onChange={setForm} />

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

// ── Conversión Paciente (Firestore raw) → PacienteFormValue ─────────────────

function pacienteToForm(data: Omit<Paciente, "id">): PacienteFormValue {
  return {
    expediente:                data.expediente,
    apellidos:                 data.apellidos,
    nombres:                   data.nombres,
    genero:                    data.genero,
    fechaNacimiento:           toDateInput(tsToDate(data.fechaNacimiento)),
    estadoFamiliar:            data.estadoFamiliar,
    dui:                       data.dui,
    numeroAfiliacion:          data.numeroAfiliacion,
    ocupacion:                 data.ocupacion,
    nacionalidad:              data.nacionalidad,
    direccion:                 data.direccion,
    municipio:                 data.municipio,
    departamento:              data.departamento,
    canton:                    data.canton,
    area:                      data.area,
    telefono:                  data.telefono,
    otrosNumeros:              data.otrosNumeros,
    responsable:               data.responsable,
    establecimientoProcedencia: data.establecimientoProcedencia,
    circunstanciaIngreso:      data.circunstanciaIngreso,
    fechaIngreso:              toDatetimeLocalInput(tsToDate(data.fechaIngreso)),
    servicioIngreso:           data.servicioIngreso,
    camaActual:                data.camaActual,
    medicoIngresoNombre:       data.medicoIngresoNombre,
    diagnosticoIngreso:        data.diagnosticoIngreso,
  };
}

function tsToDate(v: unknown): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  return undefined;
}

function toDateInput(d?: Date): string | undefined {
  if (!d) return undefined;
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toDatetimeLocalInput(d?: Date): string | undefined {
  if (!d) return undefined;
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  const hh   = String(d.getHours()).padStart(2, "0");
  const mi   = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function limpiarResponsable(r?: ResponsablePaciente): ResponsablePaciente | null {
  if (!r?.nombre?.trim()) return null;
  const out: ResponsablePaciente = { nombre: r.nombre.trim() };
  if (r.parentesco?.trim()) out.parentesco = r.parentesco.trim();
  if (r.documento?.trim())  out.documento  = r.documento.trim();
  if (r.telefono?.trim())   out.telefono   = r.telefono.trim();
  if (r.direccion?.trim())  out.direccion  = r.direccion.trim();
  return out;
}
