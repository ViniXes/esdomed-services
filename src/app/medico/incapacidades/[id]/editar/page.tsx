"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, Timestamp, updateDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, AlertTriangle, Save, User2, Lock } from "lucide-react";
import type { Paciente, SolicitudIncapacidad } from "@/types";
import {
  calcularEdad, formatFecha, nombreCompleto, toDate,
} from "@/lib/pacientes/helpers";
import { altaAntesDelIngreso, calcularDiasHospitalizacion, calcularFechaHasta, parseDateInput, pacienteDesdeIncapacidad } from "@/lib/incapacidades/helpers";
import {
  IncapacidadFormFields, type IncapacidadFormValue,
} from "@/components/incapacidades/IncapacidadFormFields";

export default function EditarIncapacidadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const [incapacidad, setIncapacidad] = useState<SolicitudIncapacidad | null>(null);
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [loading, setLoading] = useState(true);
  const [bloqueoMotivo, setBloqueoMotivo] = useState<string | null>(null);

  const [form, setForm] = useState<IncapacidadFormValue>({
    fechaAlta: "",
    diasExtras: "",
    diagnosticoEgreso: "",
    tratamientoAlta: "",
    condicionEgreso: "vivo",
    recomendaciones: "",
    seguimiento: "",
  });

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "incapacidades", id));
        if (cancelado) return;
        if (!snap.exists()) {
          setBloqueoMotivo("La solicitud no existe.");
          setLoading(false);
          return;
        }
        const data = snap.data();
        const inc: SolicitudIncapacidad = {
          id: snap.id,
          ...data,
          fechaAlta: toDate(data.fechaAlta) ?? new Date(),
          fechaDesde: toDate(data.fechaDesde) ?? new Date(),
          fechaHasta: toDate(data.fechaHasta) ?? new Date(),
          creadoEn: toDate(data.creadoEn) ?? new Date(),
          emitidaEn: toDate(data.emitidaEn),
        } as SolicitudIncapacidad;

        // Validaciones de acceso
        if (inc.medicoId !== user.uid) {
          setBloqueoMotivo("Solo el médico que creó la solicitud puede editarla.");
          setLoading(false);
          return;
        }
        if (inc.estado !== "pendiente") {
          setBloqueoMotivo("Esta incapacidad ya fue emitida por ESDOMED y no se puede editar.");
          setLoading(false);
          return;
        }

        setIncapacidad(inc);
        // Emergencia: el campo "días" es el TOTAL prescrito. Hospitalización: días
        // adicionales = fechaHasta - fechaAlta.
        const esEmerg = inc.origen === "emergencia";
        const diasExtrasGuardados = esEmerg
          ? inc.diasIncapacidad
          : Math.round((inc.fechaHasta.getTime() - inc.fechaAlta.getTime()) / (1000 * 60 * 60 * 24));
        setForm({
          fechaAlta: toDateInput(inc.fechaAlta),
          diasExtras: String(Math.max(0, diasExtrasGuardados)),
          diagnosticoEgreso: inc.diagnosticoEgreso,
          tratamientoAlta: inc.tratamientoAlta,
          condicionEgreso: inc.condicionEgreso,
          recomendaciones: inc.recomendaciones ?? "",
          seguimiento: inc.seguimiento ?? "",
        });

        // Cargar paciente (o respaldo desde la incapacidad si es de emergencia)
        let pacReal: Paciente | null = null;
        if (inc.pacienteId) {
          const pacSnap = await getDoc(doc(db, "pacientes", inc.pacienteId));
          if (cancelado) return;
          if (pacSnap.exists()) {
            const pacData = pacSnap.data();
            pacReal = {
              id: pacSnap.id,
              ...pacData,
              fechaIngreso: toDate(pacData.fechaIngreso) ?? new Date(),
              fechaEgreso: toDate(pacData.fechaEgreso),
              fechaNacimiento: toDate(pacData.fechaNacimiento),
              creadoEn: toDate(pacData.creadoEn) ?? new Date(),
            } as Paciente;
          }
        }
        setPaciente(pacReal ?? pacienteDesdeIncapacidad(inc));
        setLoading(false);
      } catch (e) {
        setBloqueoMotivo(`Error al cargar: ${e instanceof Error ? e.message : "desconocido"}`);
        setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [id, user]);

  const guardar = async () => {
    if (!incapacidad?.id) return;
    const diasExtras = parseInt(form.diasExtras, 10);
    if (form.diasExtras === "" || isNaN(diasExtras) || diasExtras < 0) { setError("Los días adicionales deben ser 0 o mayor."); return; }
    if (!form.diagnosticoEgreso.trim()) { setError("El diagnóstico de egreso es obligatorio."); return; }
    if (!form.tratamientoAlta.trim())   { setError("El tratamiento al alta es obligatorio."); return; }

    setError(null);
    setGuardando(true);
    try {
      const fAlta  = parseDateInput(form.fechaAlta);
      const esEmerg = incapacidad.origen === "emergencia";
      let fDesde: Date, diasTotal: number, fHasta: Date;
      if (esEmerg) {
        // Emergencia: inicio = fecha indicada; días = total prescrito.
        if (diasExtras < 1) { setError("Los días de incapacidad deben ser 1 o más."); setGuardando(false); return; }
        fDesde = fAlta;
        diasTotal = diasExtras;
        fHasta = calcularFechaHasta(fAlta, diasExtras - 1);
      } else {
        fDesde = paciente?.fechaIngreso ?? incapacidad.fechaDesde;
        // Por día calendario: mismo día de ingreso y alta es válido (alta voluntaria).
        if (altaAntesDelIngreso(fAlta, fDesde)) { setError("La fecha de alta no puede ser anterior a la fecha de ingreso del paciente."); setGuardando(false); return; }
        diasTotal = calcularDiasHospitalizacion(fDesde, fAlta) + diasExtras;
        fHasta = calcularFechaHasta(fAlta, diasExtras);
      }

      const update: Record<string, unknown> = {
        fechaAlta: Timestamp.fromDate(fAlta),
        diasIncapacidad: diasTotal,
        fechaDesde: Timestamp.fromDate(fDesde),
        fechaHasta: Timestamp.fromDate(fHasta),
        diagnosticoEgreso: form.diagnosticoEgreso.trim(),
        tratamientoAlta: form.tratamientoAlta.trim(),
        condicionEgreso: form.condicionEgreso,
        recomendaciones: form.recomendaciones.trim() || null,
        seguimiento: form.seguimiento.trim() || null,
        // La edición del médico redefine los días: si ESDOMED los había
        // corregido, esa corrección deja de aplicar y se limpia su rastro.
        diasMedicoOriginal: null,
        diasCorregidosPor: null,
        diasCorregidosEn: null,
        diasAclaracion: null,
      };

      await updateDoc(doc(db, "incapacidades", incapacidad.id), update);
      router.push("/medico/incapacidades");
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

  if (bloqueoMotivo) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <Link prefetch={false}
          href="/medico/incapacidades"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
        >
          <ArrowLeft size={14} /> Volver
        </Link>
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-2xl p-5 flex items-start gap-3">
          <Lock size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">No se puede editar</p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">{bloqueoMotivo}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!incapacidad) return null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link prefetch={false}
          href="/medico/incapacidades"
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <p className="text-[11px] text-slate-400 uppercase tracking-widest font-medium">Editar incapacidad</p>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
            {incapacidad.pacienteNombre}
          </h1>
        </div>
      </div>

      {/* Paciente — bloqueado (informativo) */}
      <section className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
          <User2 size={12} />
          Paciente (no editable)
        </h3>
        {paciente ? (
          <>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {nombreCompleto(paciente)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Exp. <span className="font-mono">{paciente.expediente}</span>
              {paciente.dui && <> · DUI {paciente.dui}</>}
              {calcularEdad(paciente.fechaNacimiento) !== null && <> · {calcularEdad(paciente.fechaNacimiento)} años</>}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {paciente.servicioActual}
              {paciente.camaActual && <> · Cama {paciente.camaActual}</>}
              {" · Ingreso: "}{formatFecha(paciente.fechaIngreso)}
            </p>
          </>
        ) : (
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {incapacidad.pacienteNombre}
            <span className="text-xs text-slate-500 ml-2 font-mono">{incapacidad.pacienteExpediente}</span>
          </p>
        )}
      </section>

      {/* Datos editables */}
      <IncapacidadFormFields
        value={form}
        onChange={setForm}
        fechaIngreso={paciente?.fechaIngreso ?? incapacidad.fechaDesde}
        emergencia={incapacidad.origen === "emergencia"}
      />

      {/* Footer */}
      <div>
        {error && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center gap-3 justify-end">
          <Link prefetch={false}
            href="/medico/incapacidades"
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

function toDateInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
