"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronLeft, Building2, BedDouble, CheckCircle2, AlertCircle } from "lucide-react";
import { BuscadorPacienteActivo } from "@/components/pacientes/BuscadorPacienteActivo";
import { EstablecimientoSelect } from "@/components/ui/EstablecimientoSelect";
import type { Paciente } from "@/types";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

export default function NuevoTrasladoExternoPage() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [establecimiento, setEstablecimiento] = useState("");
  const [comentario, setComentario] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeEnviar = !!paciente && !!establecimiento.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !paciente || !establecimiento.trim()) {
      setError("Selecciona un paciente y el establecimiento destino.");
      return;
    }
    setSaving(true);
    setError(null);
    const now = Timestamp.now();
    try {
      await addDoc(collection(db, "traslados_externos"), {
        medicoId: user.uid,
        medicoNombre: profile.nombre,
        medicoServicio: profile.servicios?.join(" / ") || profile.servicio || "",
        medicoJvpm: profile.jvpm || "",
        pacienteId: paciente.id ?? null,
        pacienteNombre: `${paciente.apellidos}, ${paciente.nombres}`,
        pacienteExpediente: paciente.expediente,
        servicioOrigen: paciente.servicioActual ?? "",
        camaOrigen: paciente.camaActual ?? "",
        establecimientoDestino: establecimiento.trim(),
        comentario: comentario.trim() || null,
        estado: "pendiente",
        creadoEn: now,
        actualizadoEn: now,
      });
      router.replace("/medico/traslado-externo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la solicitud.");
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <button onClick={() => router.back()}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm transition-colors">
          <ChevronLeft size={16} /> Volver
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
            <Building2 size={17} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Traslado a otro hospital</h1>
            <p className="text-xs text-slate-500 mt-0.5">Notifica a ESDOMED el envío de un paciente a otro establecimiento.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Paciente */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Paciente</label>
            {paciente ? (
              <div className="flex items-start gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4">
                <CheckCircle2 size={18} className="text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{paciente.apellidos}, {paciente.nombres}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Exp. {paciente.expediente}</p>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <BedDouble size={14} className="text-slate-400 shrink-0" />
                    <span className="text-slate-700 dark:text-slate-300">
                      <span className="font-medium">{paciente.servicioActual}</span>
                      {paciente.camaActual
                        ? <> — Cama <span className="font-medium">{paciente.camaActual}</span></>
                        : <span className="text-amber-600 dark:text-amber-400"> — sin cama asignada</span>}
                    </span>
                  </div>
                  <button type="button" onClick={() => setPaciente(null)}
                    className="mt-3 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline transition-colors">
                    Buscar otro expediente
                  </button>
                </div>
              </div>
            ) : (
              <BuscadorPacienteActivo value={paciente} onSelect={setPaciente} accent="blue" />
            )}
          </div>

          {/* Establecimiento destino */}
          {paciente && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Establecimiento destino <span className="text-rose-500">*</span>
              </label>
              <EstablecimientoSelect value={establecimiento} onChange={setEstablecimiento} />
            </div>
          )}

          {/* Comentario opcional */}
          {paciente && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Comentario <span className="font-normal normal-case tracking-normal text-slate-400">(opcional)</span>
              </label>
              <textarea value={comentario} onChange={e => setComentario(e.target.value)} rows={3}
                className={`${inputCls} resize-none`}
                placeholder="Información adicional para ESDOMED..." />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <button type="submit" disabled={!puedeEnviar || saving}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-all active:scale-[0.99]">
            {saving ? "Enviando..." : "Enviar notificación"}
          </button>
        </form>
      </div>
    </div>
  );
}
