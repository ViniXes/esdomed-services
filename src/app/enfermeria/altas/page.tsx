"use client";

import { useState } from "react";
import { collection, addDoc, Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { LogIn, CheckCircle2, AlertCircle, X } from "lucide-react";
import { BuscadorPacienteActivo } from "@/components/pacientes/BuscadorPacienteActivo";
import { notificacionAltaAbierta, fmtCuando } from "@/lib/altas/duplicados";
import type { Paciente, TipoAltaVivo } from "@/types";

const TIPOS_ALTA: { value: TipoAltaVivo; label: string }[] = [
  { value: "domicilio",   label: "Alta a domicilio" },
  { value: "exigida",     label: "Alta exigida" },
  { value: "referido",    label: "Referido" },
  { value: "fuga",        label: "Fuga" },
  { value: "in_extremis", label: "In extremis" },
];

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 transition";

type ModalState = { type: "success"; nombre: string } | { type: "error"; message: string } | null;

export default function EnfermeriaAltasPage() {
  const { user, profile } = useAuth();
  const esGenerico = !!profile?.generico;
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [tipoAlta, setTipoAlta] = useState<TipoAltaVivo | "">("");
  const [persona, setPersona] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !selectedPaciente || !tipoAlta) return;
    // Cuentas genéricas (compartidas por servicio): exigir el nombre real de quien notifica.
    if (esGenerico && !persona.trim()) {
      setModal({ type: "error", message: "Escribe el nombre de quien notifica." });
      return;
    }
    setSaving(true);
    try {
      // Pre-chequeo: evitar duplicados si el paciente ya tiene una alta abierta.
      const dup = await notificacionAltaAbierta(selectedPaciente.id!);
      if (dup) {
        setModal({
          type: "error",
          message: `Este paciente ya tiene una notificación de alta sin procesar${dup.por ? `, registrada por ${dup.por}` : ""}${dup.cuando ? ` (${fmtCuando(dup.cuando)})` : ""}. Verifica antes de volver a enviarla.`,
        });
        setSaving(false);
        return;
      }
      await addDoc(collection(db, "notificaciones_altas"), {
        notificadoPorId: user.uid,
        notificadoPorNombre: profile.nombre,
        notificadoPorRol: profile.role,
        pacienteId: selectedPaciente.id!,
        pacienteExpediente: selectedPaciente.expediente,
        pacienteNombre: `${selectedPaciente.apellidos}, ${selectedPaciente.nombres}`,
        servicio: selectedPaciente.servicioActual,
        cama: selectedPaciente.camaActual ?? "",
        tipoAlta,
        notas: notas.trim() || null,
        ...(esGenerico ? { notificadoPorPersona: persona.trim() } : {}),
        estado: "pendiente",
        rectificacionUsada: false,
        creadoEn: Timestamp.now(),
      });
      const nombre = `${selectedPaciente.apellidos}, ${selectedPaciente.nombres}`;
      setModal({ type: "success", nombre });
      setSelectedPaciente(null);
      setResetKey(k => k + 1);
      setTipoAlta("");
      setPersona("");
      setNotas("");
    } catch (err) {
      setModal({ type: "error", message: err instanceof Error ? err.message : "No se pudo enviar." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-teal-50 dark:bg-teal-950 rounded-xl flex items-center justify-center border border-teal-200 dark:border-teal-900">
          <LogIn size={17} className="text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Notificar Alta Vivo</h1>
          <p className="text-xs text-slate-500 mt-0.5">Selecciona el servicio, paciente y tipo de alta</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        {/* Buscar paciente: por servicio, expediente o cama */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Buscar paciente</label>
          <BuscadorPacienteActivo
            key={resetKey}
            value={selectedPaciente}
            onSelect={(p) => { setSelectedPaciente(p); if (!p) setTipoAlta(""); }}
            accent="teal"
          />
        </div>

        {/* Nombre de quien notifica — solo cuentas genéricas (compartidas por servicio) */}
        {selectedPaciente && esGenerico && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Nombre de quien notifica <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={persona}
              onChange={e => setPersona(e.target.value)}
              placeholder="Nombre del enfermero/a que reporta"
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Esta cuenta es compartida del servicio; indica quién está reportando.
            </p>
          </div>
        )}

        {/* Tipo de alta */}
        {selectedPaciente && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Tipo de alta</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TIPOS_ALTA.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTipoAlta(t.value)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    tipoAlta === t.value
                      ? "border-teal-500 bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30"
                      : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-teal-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notas */}
        {selectedPaciente && tipoAlta && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Notas <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              className={`${inputCls} resize-none`} />
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !selectedPaciente || !tipoAlta || (esGenerico && !persona.trim())}
          className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-all active:scale-[0.99]"
        >
          {saving ? "Enviando..." : "Enviar notificación"}
        </button>
      </form>

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center gap-4">
            {modal.type === "success" ? (
              <>
                <div className="w-14 h-14 bg-green-50 dark:bg-green-500/10 rounded-full flex items-center justify-center border border-green-200 dark:border-green-500/30">
                  <CheckCircle2 size={28} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900 dark:text-slate-100">Notificación enviada</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Alta de{" "}
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{modal.nombre}</span>{" "}
                    notificada a Trabajo Social y ESDOMED.
                  </p>
                </div>
                <button onClick={() => setModal(null)}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-xl transition-colors">
                  Aceptar
                </button>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center border border-red-200 dark:border-red-500/30">
                  <AlertCircle size={28} className="text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900 dark:text-slate-100">Error al enviar</p>
                  <p className="text-sm text-slate-500 mt-1">{modal.message}</p>
                </div>
                <button onClick={() => setModal(null)}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition-colors">
                  Cerrar
                </button>
              </>
            )}
            <button onClick={() => setModal(null)}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
