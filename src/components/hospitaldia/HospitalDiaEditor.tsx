"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Save, AlertTriangle, FileUp, Pencil, Users, Syringe } from "lucide-react";
import { PacienteForm, type PacienteFormValue } from "@/components/pacientes/PacienteForm";
import { PacientePDFUploader } from "@/components/pacientes/PacientePDFUploader";
import type { CamposExtraidos } from "@/lib/pacientes/pdfParser";
import type { Persona } from "@/types";
import { construirDatosPersonales, getPersona, guardarPersona } from "@/lib/pacientes/persona";
import { toDate } from "@/lib/pacientes/helpers";

type Modo = "elegir" | "pdf" | "manual";

interface Props {
  /** Si se pasa, el editor está en modo edición y precarga ese expediente. */
  expediente?: string;
}

export function HospitalDiaEditor({ expediente: expedienteEdit }: Props) {
  const router = useRouter();
  const { profile } = useAuth();
  const esEdicion = !!expedienteEdit;

  const [modo, setModo] = useState<Modo>(esEdicion ? "pdf" : "elegir");
  const [form, setForm] = useState<PacienteFormValue>(esEdicion ? { expediente: expedienteEdit } : {});
  const [cargando, setCargando] = useState(esEdicion);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personaExistente, setPersonaExistente] = useState(false);
  const expedienteCargado = useRef<string | null>(null);

  const aplicarCamposExtraidos = (campos: CamposExtraidos) => {
    setForm((prev) => ({ ...prev, ...camposToForm(campos) }));
  };

  // Modo edición: cargar la persona existente.
  useEffect(() => {
    if (!expedienteEdit) return;
    let cancelado = false;
    (async () => {
      const persona = await getPersona(expedienteEdit);
      if (cancelado) return;
      if (persona) {
        setForm(personaToForm(persona));
        setPersonaExistente(true);
        expedienteCargado.current = expedienteEdit;
      }
      setCargando(false);
    })();
    return () => { cancelado = true; };
  }, [expedienteEdit]);

  // Modo creación: si el expediente ya tiene persona, autorellenar sus datos.
  useEffect(() => {
    if (esEdicion) return;
    const exp = form.expediente?.trim();
    if (exp && exp === expedienteCargado.current) return;

    let cancelado = false;
    const t = setTimeout(async () => {
      if (!exp) {
        expedienteCargado.current = null;
        setPersonaExistente(false);
        return;
      }
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
  }, [form.expediente, esEdicion]);

  const validar = (): string | null => {
    if (!form.expediente?.trim()) return "El expediente es obligatorio.";
    if (!form.apellidos?.trim()) return "Los apellidos son obligatorios.";
    if (!form.nombres?.trim()) return "Los nombres son obligatorios.";
    return null;
  };

  const guardar = async () => {
    if (!profile) return;
    const err = validar();
    if (err) { setError(err); return; }
    setError(null);
    setGuardando(true);
    try {
      const expediente = form.expediente!.trim();

      // 1. Expediente canónico: crea/actualiza personas/{expediente}.
      const datosPersonales = construirDatosPersonales(form);
      await guardarPersona(expediente, datosPersonales, profile.uid);

      // 2. Registro/marcador de Hospital Día (snapshot mínimo para listar).
      const ref = doc(db, "hospital_dia", expediente);
      const ya = (await getDoc(ref)).exists();
      const ahora = Timestamp.now();
      const fNac = fechaInputADate(form.fechaNacimiento);
      const snap: Record<string, unknown> = {
        expediente,
        apellidos: form.apellidos!.trim(),
        nombres: form.nombres!.trim(),
        genero: form.genero ?? "otro",
        fechaNacimiento: fNac ? Timestamp.fromDate(fNac) : null,
        telefono: form.telefono?.trim() || null,
        dui: form.dui?.trim() || null,
      };
      if (ya) {
        snap.actualizadoEn = ahora;
        snap.actualizadoPorId = profile.uid;
        snap.actualizadoPorNombre = profile.nombre;
      } else {
        snap.creadoEn = ahora;
        snap.creadoPorId = profile.uid;
        snap.creadoPorNombre = profile.nombre;
      }
      await setDoc(ref, snap, { merge: true });

      router.push("/dashboard/hospital-dia");
    } catch (e) {
      setError(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/hospital-dia"
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex items-center gap-2">
          <Syringe size={18} className="text-cyan-600 dark:text-cyan-400" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            {esEdicion ? "Editar paciente de Hospital Día" : "Nuevo paciente de Hospital Día"}
          </h1>
        </div>
      </div>

      <p className="text-xs text-slate-500 -mt-2">
        A estos pacientes solo se les crea el expediente (sin ingreso ni cama). Sube la Hoja de
        Identificación para extraer los datos o llénalos a mano.
      </p>

      {/* Paso 1: elegir modo (solo en creación) */}
      {!esEdicion && modo === "elegir" && (
        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={() => setModo("pdf")}
            className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-700 rounded-2xl p-5 transition-all group"
          >
            <div className="w-11 h-11 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <FileUp size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Subir Hoja de Identificación
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Se extraen los datos del paciente automáticamente y solo revisas el formulario.
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
              Registro manual
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Llena el formulario sin subir el PDF.
            </p>
          </button>
        </div>
      )}

      {/* Formulario */}
      {(esEdicion || modo !== "elegir") && (
        <div className="space-y-5">
          {(esEdicion || modo === "pdf") && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                {esEdicion ? "Actualizar desde PDF (opcional)" : "1. Sube la Hoja de Identificación"}
              </p>
              <PacientePDFUploader onCamposExtraidos={aplicarCamposExtraidos} />
            </div>
          )}
          <div>
            {!esEdicion && modo === "pdf" && (
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                2. Revisa y completa los datos
              </p>
            )}
            {personaExistente && <AvisoPersonaExistente />}
            {/* hideIngreso: Hospital Día no tiene ingreso/cama ni datos clínicos. */}
            <PacienteForm value={form} onChange={setForm} hideIngreso expedienteReadOnly={esEdicion} />
          </div>
        </div>
      )}

      {/* Footer */}
      {(esEdicion || modo !== "elegir") && (
        <div className="sticky bottom-0 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50/95 dark:via-slate-950/95 to-transparent pt-4 pb-2 -mx-4 px-4 md:-mx-6 md:px-6">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex items-center gap-3 justify-end">
            {!esEdicion && (
              <button
                onClick={() => setModo("elegir")}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cambiar método
              </button>
            )}
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
            >
              <Save size={15} />
              {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear expediente"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AvisoPersonaExistente() {
  return (
    <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300 mb-4">
      <Users size={16} className="mt-0.5 flex-shrink-0" />
      <div>
        <p className="font-semibold">Expediente ya existe en el padrón</p>
        <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
          Sus datos personales se cargaron automáticamente. Si los modificas, se actualizarán en
          todo el padrón de la persona.
        </p>
      </div>
    </div>
  );
}

// ── Conversores ────────────────────────────────────────────────────────────

// Solo campos personales (Hospital Día no maneja datos de ingreso/clínicos).
function camposToForm(c: CamposExtraidos): Partial<PacienteFormValue> {
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
  };
}

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

function toDateInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** "YYYY-MM-DD" → Date local a medianoche (evita el corrimiento UTC en UTC-6). */
function fechaInputADate(s?: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
