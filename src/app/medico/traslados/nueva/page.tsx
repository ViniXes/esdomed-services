"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronLeft, ArrowRight, ArrowLeft, ArrowRightLeft, RefreshCw,
  Building2, Search, CheckCircle2, AlertCircle, Loader2, BedDouble, ArrowRightCircle,
} from "lucide-react";
import { useServicios } from "@/contexts/ServiciosContext";
import type { Paciente } from "@/types";

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

type TipoTraslado = "servicio_cama" | "interno" | "intercambio" | "";

export default function NuevaTrasladoPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [tipoTraslado, setTipoTraslado] = useState<TipoTraslado>("");

  // Paciente único (servicio_cama / interno)
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null);

  // Dos pacientes (intercambio)
  const [pacienteA, setPacienteA] = useState<Paciente | null>(null);
  const [pacienteB, setPacienteB] = useState<Paciente | null>(null);

  const [form, setForm] = useState({
    pacienteNombre: "", pacienteExpediente: "",
    pacienteBNombre: "", pacienteBExpediente: "",
    servicioOrigen: "", camaOrigen: "",
    servicioDestino: "", camaDestino: "",
    motivoTraslado: "",
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const onServicioDestinoConReset = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, servicioDestino: e.target.value, camaDestino: "" }));

  const handleTipoChange = (tipo: TipoTraslado) => {
    setTipoTraslado(tipo);
    setPacienteSeleccionado(null);
    setPacienteA(null);
    setPacienteB(null);
    setForm({
      pacienteNombre: "", pacienteExpediente: "",
      pacienteBNombre: "", pacienteBExpediente: "",
      servicioOrigen: "", camaOrigen: "",
      servicioDestino: "", camaDestino: "",
      motivoTraslado: "",
    });
  };

  const nextStep = () => setStep(s => Math.min(s + 1, 4));
  const prevStep = () => {
    if (step === 3 && tipoTraslado === "servicio_cama") {
      setForm(prev => ({ ...prev, servicioDestino: "", camaDestino: "" }));
    }
    if (step === 3 && tipoTraslado === "interno") {
      setForm(prev => ({ ...prev, camaDestino: "" }));
    }
    if (step === 3 && tipoTraslado === "intercambio") {
      setPacienteB(null);
      setForm(prev => ({ ...prev, pacienteBExpediente: "", pacienteBNombre: "", servicioDestino: "", camaDestino: "" }));
    }
    setStep(s => Math.max(s - 1, 1));
  };

  const seleccionarPaciente = (p: Paciente) => {
    setPacienteSeleccionado(p);
    setForm(prev => ({
      ...prev,
      pacienteExpediente: p.expediente,
      pacienteNombre: `${p.apellidos}, ${p.nombres}`,
      servicioOrigen: p.servicioActual,
      camaOrigen: p.camaActual || "",
    }));
  };

  const seleccionarPacienteA = (p: Paciente) => {
    setPacienteA(p);
    setForm(prev => ({
      ...prev,
      pacienteExpediente: p.expediente,
      pacienteNombre: `${p.apellidos}, ${p.nombres}`,
      servicioOrigen: p.servicioActual,
      camaOrigen: p.camaActual || "",
    }));
  };

  const seleccionarPacienteB = (p: Paciente) => {
    setPacienteB(p);
    setForm(prev => ({
      ...prev,
      pacienteBExpediente: p.expediente,
      pacienteBNombre: `${p.apellidos}, ${p.nombres}`,
      servicioDestino: p.servicioActual,
      camaDestino: p.camaActual || "",
    }));
  };

  const canGoNext = () => {
    if (step === 1) return tipoTraslado !== "";

    if (step === 2) {
      if (tipoTraslado === "servicio_cama" || tipoTraslado === "interno")
        return pacienteSeleccionado !== null;
      if (tipoTraslado === "intercambio")
        return pacienteA !== null;
    }

    if (step === 3) {
      if (tipoTraslado === "servicio_cama") return !!(form.servicioDestino && form.camaDestino);
      if (tipoTraslado === "interno") return !!form.camaDestino;
      if (tipoTraslado === "intercambio") return pacienteB !== null;
    }

    if (step === 4) return form.motivoTraslado.trim().length > 0;

    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !form.motivoTraslado) return;
    setSaving(true);
    const now = Timestamp.now();

    const payload: Record<string, unknown> = {
      tipoTraslado,
      medicoId: user.uid,
      medicoNombre: profile.nombre,
      medicoServicio: profile.servicios?.join(" / ") || profile.servicio || "",
      pacienteExpediente: form.pacienteExpediente,
      pacienteNombre: form.pacienteNombre,
      servicioOrigen: form.servicioOrigen,
      camaOrigen: form.camaOrigen,
      camaDestino: form.camaDestino,
      motivoTraslado: form.motivoTraslado,
      estado: "pendiente",
      creadoEn: now,
      actualizadoEn: now,
    };

    if (tipoTraslado === "servicio_cama") {
      payload.servicioDestino = form.servicioDestino;
      if (pacienteSeleccionado?.id) payload.pacienteId = pacienteSeleccionado.id;
    } else if (tipoTraslado === "interno") {
      payload.servicioDestino = form.servicioOrigen;
      if (pacienteSeleccionado?.id) payload.pacienteId = pacienteSeleccionado.id;
    } else if (tipoTraslado === "intercambio") {
      payload.servicioDestino = form.servicioDestino;
      payload.pacienteBExpediente = form.pacienteBExpediente;
      payload.pacienteBNombre = form.pacienteBNombre;
      if (pacienteA?.id) payload.pacienteId = pacienteA.id;
      if (pacienteB?.id) payload.pacienteBId = pacienteB.id;
    }

    await addDoc(collection(db, "traslados"), payload);
    router.replace("/medico/traslados");
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <button onClick={() => router.back()}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm transition-colors">
          <ChevronLeft size={16} /> Volver
        </button>

        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`h-2 rounded-full transition-all duration-300 ${s === step ? "w-8 bg-blue-600" : s < step ? "w-4 bg-blue-300 dark:bg-blue-800" : "w-4 bg-slate-200 dark:bg-slate-800"}`} />
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">

        {/* Paso 1: Tipo de Traslado */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading mb-2">¿Qué tipo de traslado deseas solicitar?</h1>
              <p className="text-slate-500 text-sm">Selecciona el tipo de movimiento de camas que necesitas realizar.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TypeCard
                selected={tipoTraslado === "servicio_cama"}
                onClick={() => handleTipoChange("servicio_cama")}
                icon={<Building2 size={24} />}
                title="Servicio a Servicio"
                desc="Traslado a otro servicio médico diferente."
              />
              <TypeCard
                selected={tipoTraslado === "interno"}
                onClick={() => handleTipoChange("interno")}
                icon={<ArrowRightLeft size={24} />}
                title="Traslado Interno"
                desc="Movimiento dentro del mismo servicio médico."
              />
              <TypeCard
                selected={tipoTraslado === "intercambio"}
                onClick={() => handleTipoChange("intercambio")}
                icon={<RefreshCw size={24} />}
                title="Intercambio de Camas"
                desc="Dos pacientes intercambian sus camas actuales."
              />
            </div>
          </div>
        )}

        {/* Paso 2 — servicio_cama / interno: Buscar paciente activo */}
        {step === 2 && (tipoTraslado === "servicio_cama" || tipoTraslado === "interno") && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading mb-2">Identificar al Paciente</h1>
              <p className="text-slate-500 text-sm">Busca el expediente activo del paciente para confirmar su ubicación actual.</p>
            </div>

            <BuscadorPaciente
              pacienteSeleccionado={pacienteSeleccionado}
              onSelect={seleccionarPaciente}
              onClear={() => {
                setPacienteSeleccionado(null);
                setForm(prev => ({ ...prev, pacienteExpediente: "", pacienteNombre: "", servicioOrigen: "", camaOrigen: "" }));
              }}
            />
          </div>
        )}

        {/* Paso 3 — servicio_cama: Seleccionar destino */}
        {step === 3 && tipoTraslado === "servicio_cama" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading mb-2">Nueva Ubicación</h1>
              <p className="text-slate-500 text-sm">Selecciona el servicio y la cama de destino.</p>
            </div>

            <Section title={`Origen — ${form.servicioOrigen}, Cama ${form.camaOrigen || "sin asignar"}`}>
              <div className="text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
                Tomado del registro activo del paciente
              </div>
            </Section>

            <div className="h-px bg-slate-200 dark:bg-slate-800" />

            <Section title="Destino">
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Servicio destino" value={form.servicioDestino} onChange={onServicioDestinoConReset} required />
                <CamaField label="Cama destino" servicio={form.servicioDestino} value={form.camaDestino} onChange={set("camaDestino")} required />
              </div>
            </Section>
          </div>
        )}

        {/* Paso 3 — interno: Cama destino */}
        {step === 3 && tipoTraslado === "interno" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading mb-2">Cama de Destino</h1>
              <p className="text-slate-500 text-sm">El paciente permanece en el mismo servicio, solo cambia de cama.</p>
            </div>

            <Section title={`Servicio — ${form.servicioOrigen}`}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1.5">Cama actual (origen)</p>
                  <div className={`${inputCls} opacity-60 cursor-not-allowed`}>{form.camaOrigen || "Sin asignar"}</div>
                </div>
                <CamaField label="Cama destino" servicio={form.servicioOrigen} value={form.camaDestino} onChange={set("camaDestino")} required />
              </div>
            </Section>
          </div>
        )}

        {/* Paso 2 — intercambio: Buscar Paciente A */}
        {step === 2 && tipoTraslado === "intercambio" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading mb-2">Paciente A</h1>
              <p className="text-slate-500 text-sm">Busca el primer paciente activo del intercambio.</p>
            </div>

            <BuscadorPaciente
              pacienteSeleccionado={pacienteA}
              onSelect={seleccionarPacienteA}
              onClear={() => {
                setPacienteA(null);
                setForm(prev => ({ ...prev, pacienteExpediente: "", pacienteNombre: "", servicioOrigen: "", camaOrigen: "" }));
              }}
            />
          </div>
        )}

        {/* Paso 3 — intercambio: Buscar Paciente B + preview del swap */}
        {step === 3 && tipoTraslado === "intercambio" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading mb-2">Paciente B</h1>
              <p className="text-slate-500 text-sm">Busca el segundo paciente. Al confirmar verás cómo quedaría el intercambio.</p>
            </div>

            <BuscadorPaciente
              pacienteSeleccionado={pacienteB}
              excluirId={pacienteA?.id}
              onSelect={seleccionarPacienteB}
              onClear={() => {
                setPacienteB(null);
                setForm(prev => ({ ...prev, pacienteBExpediente: "", pacienteBNombre: "", servicioDestino: "", camaDestino: "" }));
              }}
            />

            {/* Preview del intercambio */}
            {pacienteA && pacienteB && (
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Vista previa del intercambio</p>

                <SwapRow
                  nombre={`${pacienteA.apellidos}, ${pacienteA.nombres}`}
                  expediente={pacienteA.expediente}
                  servicio={pacienteA.servicioActual}
                  camaOrigen={pacienteA.camaActual}
                  camaDestino={pacienteB.camaActual}
                />
                <div className="h-px bg-slate-200 dark:bg-slate-700" />
                <SwapRow
                  nombre={`${pacienteB.apellidos}, ${pacienteB.nombres}`}
                  expediente={pacienteB.expediente}
                  servicio={pacienteB.servicioActual}
                  camaOrigen={pacienteB.camaActual}
                  camaDestino={pacienteA.camaActual}
                />
              </div>
            )}
          </div>
        )}

        {/* Paso 4: Motivo y Enviar */}
        {step === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading mb-2">Motivo del Traslado</h1>
              <p className="text-slate-500 text-sm">Brinda la justificación clínica o administrativa del movimiento.</p>
            </div>

            <textarea value={form.motivoTraslado} onChange={set("motivoTraslado")} required rows={5}
              className={`${inputCls} resize-none`}
              placeholder="Describe el motivo del traslado aquí..." />

            {/* Resumen */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700/50">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Resumen de la Solicitud</h3>

              <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <div className="flex gap-2">
                  <span className="font-medium">Tipo:</span>
                  {tipoTraslado === "servicio_cama" && "Servicio a Servicio"}
                  {tipoTraslado === "interno" && "Traslado Interno"}
                  {tipoTraslado === "intercambio" && "Intercambio de Camas"}
                </div>

                {tipoTraslado !== "intercambio" ? (
                  <>
                    <div className="flex gap-2">
                      <span className="font-medium">Paciente:</span>
                      {form.pacienteExpediente} — {form.pacienteNombre}
                    </div>
                    <div className="flex gap-2">
                      <span className="font-medium">Movimiento:</span>
                      {form.servicioOrigen} (Cama {form.camaOrigen || "—"}) → {tipoTraslado === "interno" ? form.servicioOrigen : form.servicioDestino} (Cama {form.camaDestino})
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <span className="font-medium">Paciente A:</span>
                      Exp. {form.pacienteExpediente} — {form.pacienteNombre}
                      <span className="text-slate-500">[Cama {form.camaOrigen || "—"} → {form.camaDestino || "—"}]</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-medium">Paciente B:</span>
                      Exp. {form.pacienteBExpediente} — {form.pacienteBNombre}
                      <span className="text-slate-500">[Cama {form.camaDestino || "—"} → {form.camaOrigen || "—"}]</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Controles de Navegación */}
        <div className="mt-8 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-6">
          <button
            type="button"
            onClick={prevStep}
            disabled={step === 1 || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-0 transition-colors">
            <ArrowLeft size={16} /> Anterior
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={!canGoNext()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 dark:disabled:bg-blue-800 text-white text-sm font-semibold rounded-xl transition-all disabled:cursor-not-allowed">
              Siguiente <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canGoNext() || saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-green-400 dark:disabled:bg-green-800 text-white text-sm font-semibold rounded-xl transition-all disabled:cursor-not-allowed">
              {saving ? "Enviando..." : "Confirmar y Enviar"}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Componente reutilizable de búsqueda ─────────────────────────────────────

function BuscadorPaciente({
  pacienteSeleccionado,
  excluirId,
  onSelect,
  onClear,
}: {
  pacienteSeleccionado: Paciente | null;
  excluirId?: string;
  onSelect: (p: Paciente) => void;
  onClear: () => void;
}) {
  const [exp, setExp] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<Paciente[]>([]);
  const [error, setError] = useState("");

  const buscar = async () => {
    const val = exp.trim();
    if (!val) return;
    setBuscando(true);
    setError("");
    setResultados([]);

    try {
      const q = query(
        collection(db, "pacientes"),
        where("expediente", "==", val),
        where("estado", "==", "activo"),
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setError(`No se encontró ningún paciente activo con el expediente "${val}".`);
        return;
      }

      const found = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Paciente))
        .filter(p => p.id !== excluirId);

      if (found.length === 0) {
        setError("El expediente encontrado corresponde al otro paciente del intercambio.");
        return;
      }

      if (found.length === 1) {
        onSelect(found[0]);
      } else {
        setResultados(found);
      }
    } catch {
      setError("Error al buscar. Verifica tu conexión e intenta de nuevo.");
    } finally {
      setBuscando(false);
    }
  };

  if (pacienteSeleccionado) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-5">
          <CheckCircle2 size={20} className="text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 dark:text-slate-100">{pacienteSeleccionado.apellidos}, {pacienteSeleccionado.nombres}</p>
            <p className="text-xs text-slate-500 mt-0.5">Exp. {pacienteSeleccionado.expediente}</p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <BedDouble size={14} className="text-slate-400 shrink-0" />
              <span className="text-slate-700 dark:text-slate-300">
                <span className="font-medium">{pacienteSeleccionado.servicioActual}</span>
                {pacienteSeleccionado.camaActual
                  ? <> — Cama <span className="font-medium">{pacienteSeleccionado.camaActual}</span></>
                  : <span className="text-amber-600 dark:text-amber-400"> — sin cama asignada</span>
                }
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClear}
          className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline transition-colors">
          Buscar otro expediente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={exp}
          onChange={e => { setExp(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && buscar()}
          placeholder="Número de expediente (ej: 1-24)"
          className={inputCls}
        />
        <button
          type="button"
          onClick={buscar}
          disabled={buscando || !exp.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 dark:disabled:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-all disabled:cursor-not-allowed whitespace-nowrap">
          {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Buscar
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {resultados.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Se encontraron varios registros — selecciona uno:</p>
          {resultados.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className="w-full text-left border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all">
              <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{p.apellidos}, {p.nombres}</p>
              <p className="text-xs text-slate-500 mt-0.5">{p.servicioActual} — Cama {p.camaActual || "sin asignar"}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Preview de una fila del intercambio ──────────────────────────────────────

function SwapRow({ nombre, expediente, servicio, camaOrigen, camaDestino }: {
  nombre: string; expediente: string; servicio: string;
  camaOrigen?: string; camaDestino?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{nombre}</p>
        <p className="text-xs text-slate-500">Exp. {expediente} · {servicio}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-sm">
        <span className="font-semibold text-slate-700 dark:text-slate-300">
          {camaOrigen ? `Cama ${camaOrigen}` : <span className="text-amber-500">Sin cama</span>}
        </span>
        <ArrowRightCircle size={16} className="text-blue-500 shrink-0" />
        <span className="font-semibold text-blue-700 dark:text-blue-300">
          {camaDestino ? `Cama ${camaDestino}` : <span className="text-amber-500">Sin cama</span>}
        </span>
      </div>
    </div>
  );
}

// ─── Componentes de UI compartidos ───────────────────────────────────────────

function TypeCard({ selected, onClick, icon, title, desc }: {
  selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string;
}) {
  return (
    <div onClick={onClick}
      className={`cursor-pointer rounded-2xl border-2 p-5 transition-all duration-200 flex flex-col gap-3
        ${selected
          ? "border-blue-600 bg-blue-50/50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
          : "border-slate-200 dark:border-slate-700 bg-transparent hover:border-blue-300 dark:hover:border-blue-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
      <div className={`${selected ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}`}>
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-sm mb-1">{title}</h3>
        <p className={`text-xs ${selected ? "text-blue-600/80 dark:text-blue-400/80" : "text-slate-500"}`}>{desc}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SelectField({ label, value, onChange, required }: {
  label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  required?: boolean;
}) {
  const { servicios } = useServicios();
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label} {required && <span className="text-red-500">*</span>}</label>
      <select value={value} onChange={onChange} className={inputCls}>
        <option value="">Seleccionar...</option>
        {servicios.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

function CamaField({ label, servicio, value, onChange, required }: {
  label: string; servicio: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  required?: boolean;
}) {
  const { getCamas } = useServicios();
  const camas = servicio ? getCamas(servicio) : [];
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label} {required && <span className="text-red-500">*</span>}</label>
      {camas.length > 0 ? (
        <select value={value} onChange={onChange} className={inputCls}>
          <option value="">Seleccionar cama...</option>
          {camas.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={onChange as (e: React.ChangeEvent<HTMLInputElement>) => void}
          className={inputCls}
          placeholder={!servicio ? "Primero selecciona el servicio" : ""}
          disabled={!servicio}
        />
      )}
    </div>
  );
}
