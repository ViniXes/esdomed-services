"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDoc, collection } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Save, AlertTriangle, FileUp, Pencil, Users } from "lucide-react";
import { PacienteForm, type PacienteFormValue } from "@/components/pacientes/PacienteForm";
import { PacientePDFUploader } from "@/components/pacientes/PacientePDFUploader";
import type { CamposExtraidos } from "@/lib/pacientes/pdfParser";
import type { Persona } from "@/types";
import { construirDatosPersonales, construirDocIngreso, getPersona, guardarPersona } from "@/lib/pacientes/persona";
import { resolverServicio } from "@/lib/pacientes/importMapper";
import { useServicios } from "@/contexts/ServiciosContext";
import { toDate } from "@/lib/pacientes/helpers";

type Modo = "elegir" | "pdf" | "manual";

export default function NuevoPacientePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { servicios } = useServicios();
  const [modo, setModo] = useState<Modo>("elegir");
  const [form, setForm] = useState<PacienteFormValue>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personaExistente, setPersonaExistente] = useState(false);
  const expedienteCargado = useRef<string | null>(null);

  const aplicarCamposExtraidos = (campos: CamposExtraidos) => {
    const conv = convertirCampos(campos);
    // El servicio es un select del catálogo: resolverlo (tolerante a tildes/romano).
    if (conv.servicioIngreso) {
      conv.servicioIngreso = resolverServicio(conv.servicioIngreso, servicios) ?? conv.servicioIngreso;
    }
    setForm((prev) => ({ ...prev, ...conv }));
  };

  // Reingreso: si el expediente ya tiene una persona registrada, se auto-rellenan
  // sus datos personales (no hay que retipearlos). Cambiarlos aquí los actualizará
  // en todos sus ingresos al guardar.
  useEffect(() => {
    const exp = form.expediente?.trim();
    if (!exp) {
      setPersonaExistente(false);
      expedienteCargado.current = null;
      return;
    }
    if (exp === expedienteCargado.current) return;

    let cancelado = false;
    const t = setTimeout(async () => {
      const persona = await getPersona(exp);
      if (cancelado || form.expediente?.trim() !== exp) return;
      if (persona) {
        expedienteCargado.current = exp;
        setPersonaExistente(true);
        setForm((prev) => ({ ...prev, ...personaToForm(persona) }));
      } else {
        setPersonaExistente(false);
      }
    }, 500);

    return () => { cancelado = true; clearTimeout(t); };
  }, [form.expediente]);

  const validar = (): string | null => {
    if (!form.expediente?.trim()) return "El expediente es obligatorio.";
    if (!form.apellidos?.trim()) return "Los apellidos son obligatorios.";
    if (!form.nombres?.trim())   return "Los nombres son obligatorios.";
    if (!form.fechaIngreso)      return "La fecha de ingreso es obligatoria.";
    if (!form.servicioIngreso?.trim()) return "El servicio de ingreso es obligatorio.";
    return null;
  };

  const guardar = async () => {
    if (!profile) return;
    const err = validar();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const expediente = form.expediente!.trim();

      // Snapshot personal (mismas claves que personas/{expediente})
      const datosPersonales = construirDatosPersonales(form);

      // Documento de ingreso = snapshot personal + datos clínicos del ingreso
      const doc = construirDocIngreso(form, datosPersonales, profile);

      const ref = await addDoc(collection(db, "pacientes"), doc);

      // Persona canónica: crea/actualiza personas/{expediente} y propaga el snapshot
      // a todos los ingresos de la persona (incluido el recién creado).
      await guardarPersona(expediente, datosPersonales, profile.uid);

      router.push(`/dashboard/pacientes/${ref.id}`);
    } catch (e) {
      setError(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
      setGuardando(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/pacientes"
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
          Nuevo ingreso
        </h1>
      </div>

      {/* Paso 1: elegir modo */}
      {modo === "elegir" && (
        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={() => setModo("pdf")}
            className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-700 rounded-2xl p-5 transition-all group"
          >
            <div className="w-11 h-11 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <FileUp size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Subir PDFs del expediente
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Sube la Hoja de Identificación y/o la Hoja de Ingreso/Egreso. Se extraen los
              datos automáticamente y solo revisas el formulario.
            </p>
          </button>
          <button
            onClick={() => setModo("manual")}
            className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-700 rounded-2xl p-5 transition-all group"
          >
            <div className="w-11 h-11 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Pencil size={18} className="text-slate-600 dark:text-slate-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Ingreso manual
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Llena el formulario completo sin subir PDFs. Útil cuando los documentos no están
              disponibles digitalmente.
            </p>
          </button>
        </div>
      )}

      {/* Paso 2: PDF + form */}
      {modo === "pdf" && (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              1. Sube los PDFs
            </p>
            <PacientePDFUploader onCamposExtraidos={aplicarCamposExtraidos} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              2. Revisa y completa los datos
            </p>
            {personaExistente && <AvisoReingreso />}
            <PacienteForm value={form} onChange={setForm} />
          </div>
        </div>
      )}

      {/* Paso 2 manual */}
      {modo === "manual" && (
        <>
          {personaExistente && <AvisoReingreso />}
          <PacienteForm value={form} onChange={setForm} />
        </>
      )}

      {/* Footer */}
      {modo !== "elegir" && (
        <div className="sticky bottom-0 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50/95 dark:via-slate-950/95 to-transparent pt-4 pb-2 -mx-4 px-4 md:-mx-6 md:px-6">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex items-center gap-3 justify-end">
            <button
              onClick={() => setModo("elegir")}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cambiar método
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
            >
              <Save size={15} />
              {guardando ? "Guardando..." : "Guardar paciente"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Aviso de reingreso (persona ya registrada) ────────────────────────────

function AvisoReingreso() {
  return (
    <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300 mb-4">
      <Users size={16} className="mt-0.5 flex-shrink-0" />
      <div>
        <p className="font-semibold">Paciente ya registrado</p>
        <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
          Este expediente ya existe. Sus datos personales se cargaron automáticamente. Si los
          modificas, se actualizarán en todos los ingresos de este paciente.
        </p>
      </div>
    </div>
  );
}

// ── Conversión de campos extraídos del parser → estado del formulario ──────

function convertirCampos(c: CamposExtraidos): Partial<PacienteFormValue> {
  return {
    expediente: c.expediente,
    apellidos: c.apellidos,
    nombres: c.nombres,
    fechaNacimiento: c.fechaNacimiento ? toDateInput(c.fechaNacimiento) : undefined,
    genero: c.genero,
    estadoFamiliar: c.estadoFamiliar,
    dui: c.dui,
    numeroAfiliacion: c.numeroAfiliacion,
    ocupacion: c.ocupacion,
    nacionalidad: c.nacionalidad,
    telefono: c.telefono,
    direccion: c.direccion,
    municipio: c.municipio,
    departamento: c.departamento,
    canton: c.canton,
    area: c.area,
    responsable: c.responsable,
    establecimientoProcedencia: c.establecimientoProcedencia,
    circunstanciaIngreso: c.circunstanciaIngreso,
    fechaIngreso: c.fechaIngreso ? toDatetimeLocalInput(c.fechaIngreso) : undefined,
    servicioIngreso: c.servicioIngreso,
    medicoIngresoNombre: c.medicoIngresoNombre,
    diagnosticoIngreso: c.diagnosticoIngreso,
  };
}

function toDateInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toDatetimeLocalInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

// ── Persona existente (reingreso) → campos personales del formulario ───────

function personaToForm(p: Persona): Partial<PacienteFormValue> {
  const fNac = toDate(p.fechaNacimiento);
  return {
    expediente: p.expediente,
    apellidos: p.apellidos,
    nombres: p.nombres,
    genero: p.genero,
    fechaNacimiento: fNac ? toDateInput(fNac) : undefined,
    estadoFamiliar: p.estadoFamiliar,
    dui: p.dui,
    numeroAfiliacion: p.numeroAfiliacion,
    ocupacion: p.ocupacion,
    nacionalidad: p.nacionalidad,
    direccion: p.direccion,
    municipio: p.municipio,
    departamento: p.departamento,
    canton: p.canton,
    area: p.area,
    telefono: p.telefono,
    otrosNumeros: p.otrosNumeros,
    responsable: p.responsable,
  };
}
