"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ArrowLeft, Printer, Pencil, CheckCircle2, Save } from "lucide-react";
import type { DatosConstancia, Genero, Paciente, SolicitudIncapacidad } from "@/types";
import { toDate } from "@/lib/pacientes/helpers";
import { pacienteDesdeIncapacidad } from "@/lib/incapacidades/helpers";
import { ConstanciaPrintLayout } from "@/components/incapacidades/ConstanciaPrintLayout";

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500";

// Campos personales editables a mano para la constancia (los que muestra el formato).
const CAMPOS: { k: keyof DatosConstancia; label: string; full?: boolean }[] = [
  { k: "dui",             label: "DUI" },
  { k: "numeroAfiliacion", label: "Nº de afiliación" },
  { k: "ocupacion",       label: "Ocupación" },
  { k: "telefono",        label: "Teléfono" },
  { k: "otrosNumeros",    label: "Otros números" },
  { k: "direccion",       label: "Domicilio (dirección)", full: true },
  { k: "departamento",    label: "Departamento" },
  { k: "municipio",       label: "Municipio" },
];

// Solo los campos con valor (Firestore/constancia ignoran lo vacío).
function soloDefinidos(d: DatosConstancia): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(d).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") out[k] = v; });
  return out;
}

export default function ImprimirIncapacidadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [incapacidad, setIncapacidad] = useState<SolicitudIncapacidad | null>(null);
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Datos personales que el personal de ESDOMED escribe a mano (solo en este
  // documento; NO se guardan en el padrón `personas`).
  const [datos, setDatos] = useState<DatosConstancia>({});
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const set = (k: keyof DatosConstancia, v: unknown) =>
    setDatos((prev) => ({ ...prev, [k]: v === "" ? undefined : v }));

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const incSnap = await getDoc(doc(db, "incapacidades", id));
        if (cancelado) return;
        if (!incSnap.exists()) { setError("Solicitud no encontrada"); setLoading(false); return; }
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

        // Semilla del formulario: lo ya guardado + lo poco que trae la atención.
        const seed: DatosConstancia = { ...(inc.datosConstancia ?? {}) };
        if (!seed.dui && inc.pacienteDui) seed.dui = inc.pacienteDui;
        if (!seed.genero && inc.pacienteGenero) seed.genero = inc.pacienteGenero;
        setDatos(seed);

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
        setError(e instanceof Error ? e.message : "Error desconocido");
        setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [id]);

  const guardarDatos = async () => {
    setGuardando(true);
    try {
      await updateDoc(doc(db, "incapacidades", id), { datosConstancia: soloDefinidos(datos) });
      setGuardado(true);
    } catch {
      /* persistir no es crítico para imprimir ahora */
    } finally {
      setGuardando(false);
    }
  };

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
        <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline">← Volver</button>
      </div>
    );
  }

  const esEmergencia = incapacidad.origen === "emergencia";
  // El paciente que se imprime = base + lo escrito a mano (solo campos con valor).
  const pacienteImpreso = { ...paciente, ...soloDefinidos(datos) } as Paciente;

  return (
    <div className="fixed inset-0 z-50 bg-slate-200 overflow-y-auto print:bg-white print:static print:inset-auto print:overflow-visible">
      {/* Toolbar — oculto al imprimir */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors">
            <ArrowLeft size={15} />
            Volver
          </button>
          <p className="text-xs text-slate-500">Vista previa de la constancia</p>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Printer size={14} />
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {/* Datos personales a mano (solo emergencia, oculto al imprimir) */}
      {esEmergencia && (
        <div className="print:hidden max-w-5xl mx-auto px-4 pt-4">
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <Pencil size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Completar datos del paciente</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Paciente de emergencia (sin ingreso). Escribe a mano los datos para la constancia. Se guardan solo en este documento, no en el padrón.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Sexo</label>
                <select
                  value={datos.genero ?? ""}
                  onChange={(e) => set("genero", (e.target.value || undefined) as Genero | undefined)}
                  className={inputCls}
                >
                  <option value="">— Sin especificar</option>
                  <option value="masculino">Masculino</option>
                  <option value="femenino">Femenino</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              {CAMPOS.map((c) => (
                <div key={c.k} className={c.full ? "sm:col-span-2 md:col-span-3" : ""}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{c.label}</label>
                  <input
                    type="text"
                    value={(datos[c.k] as string) ?? ""}
                    onChange={(e) => set(c.k, e.target.value)}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3">
              {guardado && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                  <CheckCircle2 size={13} /> Guardado
                </span>
              )}
              <button
                onClick={guardarDatos}
                disabled={guardando}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <Save size={14} />
                {guardando ? "Guardando..." : "Guardar datos"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Constancia en hoja blanca */}
      <div className="py-6 px-4 print:p-0">
        <div className="bg-white shadow-lg max-w-[21cm] mx-auto print:shadow-none print:max-w-none">
          <ConstanciaPrintLayout incapacidad={incapacidad} paciente={pacienteImpreso} />
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
