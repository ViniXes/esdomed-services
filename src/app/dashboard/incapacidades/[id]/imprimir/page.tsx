"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ArrowLeft, Printer, FileUp, CheckCircle2 } from "lucide-react";
import type { DatosConstancia, Paciente, SolicitudIncapacidad } from "@/types";
import { toDate } from "@/lib/pacientes/helpers";
import { pacienteDesdeIncapacidad } from "@/lib/incapacidades/helpers";
import { ConstanciaPrintLayout } from "@/components/incapacidades/ConstanciaPrintLayout";
import { PacientePDFUploader } from "@/components/pacientes/PacientePDFUploader";
import type { CamposExtraidos } from "@/lib/pacientes/pdfParser";

export default function ImprimirIncapacidadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [incapacidad, setIncapacidad] = useState<SolicitudIncapacidad | null>(null);
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datosOk, setDatosOk] = useState(false);

  // Completa los datos personales de la constancia desde la Hoja de Identificación
  // (solo para este documento; NO se guarda en el padrón `personas`).
  const aplicarHoja = async (campos: CamposExtraidos) => {
    const dc: DatosConstancia = {};
    const put = (k: keyof DatosConstancia, v: unknown) => {
      if (v !== undefined && v !== null && v !== "") (dc as Record<string, unknown>)[k] = v;
    };
    put("apellidos", campos.apellidos);
    put("nombres", campos.nombres);
    put("genero", campos.genero);
    put("dui", campos.dui);
    put("numeroAfiliacion", campos.numeroAfiliacion);
    put("telefono", campos.telefono);
    put("direccion", campos.direccion);
    put("municipio", campos.municipio);
    put("departamento", campos.departamento);
    put("ocupacion", campos.ocupacion);
    if (campos.responsable?.nombre) dc.responsable = campos.responsable;
    if (Object.keys(dc).length === 0) return;
    setPaciente((prev) => (prev ? ({ ...prev, ...dc } as Paciente) : prev));
    setDatosOk(true);
    try {
      await updateDoc(doc(db, "incapacidades", id), { datosConstancia: dc });
    } catch {
      /* persistir no es crítico para imprimir ahora */
    }
  };

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const incSnap = await getDoc(doc(db, "incapacidades", id));
        if (cancelado) return;
        if (!incSnap.exists()) {
          setError("Solicitud no encontrada");
          setLoading(false);
          return;
        }
        const incData = incSnap.data();
        const inc: SolicitudIncapacidad = {
          id: incSnap.id,
          ...incData,
          fechaAlta: toDate(incData.fechaAlta) ?? new Date(),
          fechaDesde: toDate(incData.fechaDesde) ?? new Date(),
          fechaHasta: toDate(incData.fechaHasta) ?? new Date(),
          creadoEn: toDate(incData.creadoEn) ?? new Date(),
          emitidaEn: toDate(incData.emitidaEn),
          fechaExpedicion: toDate(incData.fechaExpedicion),
        } as SolicitudIncapacidad;
        setIncapacidad(inc);

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
        // Sin ingreso (emergencia): respaldo desde la incapacidad + datosConstancia.
        setPaciente(pacReal ?? pacienteDesdeIncapacidad(inc));
        setLoading(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
        setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !incapacidad || !paciente) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6">
        <p className="text-sm text-slate-500 mb-3">{error ?? "No se pudo cargar la constancia"}</p>
        <button
          onClick={() => router.back()}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Volver
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-200 overflow-y-auto print:bg-white print:static print:inset-auto print:overflow-visible">
      {/* Toolbar — oculto al imprimir */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={15} />
            Volver
          </button>
          <p className="text-xs text-slate-500">
            Vista previa de la constancia
          </p>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Printer size={14} />
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {/* Completar datos (solo emergencia, oculto al imprimir) */}
      {incapacidad.origen === "emergencia" && (
        <div className="print:hidden max-w-5xl mx-auto px-4 pt-4">
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <FileUp size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Completar datos del paciente</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Paciente de emergencia (sin ingreso). Sube la <strong>Hoja de Identificación</strong> para llenar DUI,
                  afiliación, teléfonos y domicilio en la constancia. No se guarda en el padrón.
                </p>
              </div>
            </div>
            {(datosOk || incapacidad.datosConstancia) && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                <CheckCircle2 size={13} /> Datos completados — ya puedes imprimir.
              </p>
            )}
            <PacientePDFUploader onCamposExtraidos={aplicarHoja} />
          </div>
        </div>
      )}

      {/* Constancia en hoja blanca */}
      <div className="py-6 px-4 print:p-0">
        <div className="bg-white shadow-lg max-w-[21cm] mx-auto print:shadow-none print:max-w-none">
          <ConstanciaPrintLayout incapacidad={incapacidad} paciente={paciente} />
        </div>
      </div>

      {/* CSS global para impresión: oculta sidebar y barras del dashboard */}
      <style jsx global>{`
        @media print {
          aside,
          .md\\:hidden,
          [class*="border-r border-slate-200"][class*="dark:border-slate-800"],
          [class*="md:hidden fixed top-0"] {
            display: none !important;
          }
          main {
            padding: 0 !important;
            overflow: visible !important;
          }
          html, body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}
