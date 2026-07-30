"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, getDocs, query, where, Timestamp } from "@/lib/firestoreMeter";
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
      medicoJvpm: profile.jvpm || "",
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
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#075d70] via-cyan-700 to-blue-700 px-5 py-5 shadow-lg shadow-cyan-950/15 md:px-7 md:py-6">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm"><ArrowRightLeft size={24} className="text-white" /></div>
              <div>
                <h1 className="text-xl font-bold text-white md:text-2xl font-heading">Nueva solicitud de traslado</h1>
                <p className="mt-1 max-w-xl text-sm text-cyan-50/90">Complete cada paso para registrar un movimiento clínico con la información correcta.</p>
              </div>
            </div>
            <button onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/25 transition-colors hover:bg-white/20">
              <ChevronLeft size={16} /> Volver
            </button>
          </div>

          <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { n: 1, l: "Tipo" }, { n: 2, l: "Paciente" }, { n: 3, l: "Destino" }, { n: 4, l: "Confirmar" },
            ].map(({ n, l }) => (
              <li key={n} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors ${n === step ? "bg-white/20 text-white ring-1 ring-white/25" : n < step ? "bg-white/10 text-cyan-50" : "text-cyan-100/75"}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${n < step ? "bg-emerald-400 text-emerald-950" : n === step ? "bg-white text-cyan-800" : "bg-white/15 text-white"}`}>{n < step ? <CheckCircle2 size={14} /> : n}</span>
                <span className="text-xs font-semibold">{l}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-8">

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
                tone="blue"
                title="Servicio a Servicio"
                desc="Traslado a otro servicio médico diferente."
              />
              <TypeCard
                selected={tipoTraslado === "interno"}
                onClick={() => handleTipoChange("interno")}
                icon={<ArrowRightLeft size={24} />}
                tone="cyan"
                title="Traslado Interno"
                desc="Movimiento dentro del mismo servicio médico."
              />
              <TypeCard
                selected={tipoTraslado === "intercambio"}
                onClick={() => handleTipoChange("intercambio")}
                icon={<RefreshCw size={24} />}
                tone="violet"
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

            <div className="flex items-center gap-3 py-1" aria-hidden="true">
              <span className="h-px flex-1 bg-cyan-100 dark:bg-cyan-900/60" />
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm shadow-blue-600/25"><ArrowRight size={16} /></span>
              <span className="h-px flex-1 bg-blue-100 dark:bg-blue-900/60" />
            </div>

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
              <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-5 dark:border-violet-900/60 dark:bg-violet-950/20">
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-700 dark:text-violet-300">Vista previa del intercambio</p>

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
            <div className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-blue-50/70 to-white p-4 dark:border-cyan-900/60 dark:from-cyan-950/30 dark:via-blue-950/20 dark:to-slate-900">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Resumen de la solicitud</h3>

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
        <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6 dark:border-slate-800">
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
              className="flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-cyan-700/20 transition-all hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-cyan-500 dark:disabled:bg-cyan-800">
              Siguiente <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canGoNext() || saving}
              className="flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-700/20 transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-500 dark:disabled:bg-blue-800">
              {saving ? "Enviando..." : "Confirmar y enviar"}
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
        <div className="relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-blue-50/80 to-white p-5 dark:border-cyan-800 dark:from-cyan-950/40 dark:via-blue-950/20 dark:to-slate-900">
          <span className="absolute bottom-0 left-0 top-0 w-1 bg-gradient-to-b from-cyan-500 to-blue-600" />
          <div className="flex items-start gap-3 pl-1">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm shadow-cyan-600/25"><CheckCircle2 size={19} /></span>
          <div className="flex-1 min-w-0">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300">Paciente seleccionado</p>
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
        </div>

        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 transition-colors hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-100">
          Buscar otro expediente <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-800/50 sm:flex sm:gap-2">
        <input
          type="text"
          value={exp}
          onChange={e => { setExp(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && buscar()}
          placeholder="Número de expediente (ej: 1-24)"
          className={`${inputCls} bg-white dark:bg-slate-900`}
        />
        <button
          type="button"
          onClick={buscar}
          disabled={buscando || !exp.trim()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-cyan-500 dark:disabled:bg-cyan-800 sm:mt-0 sm:w-auto">
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
    <div className="flex items-center gap-3 rounded-xl border border-violet-100 bg-white/75 p-3 dark:border-violet-900/50 dark:bg-slate-900/50">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{nombre}</p>
        <p className="text-xs text-slate-500">Exp. {expediente} · {servicio}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-sm">
        <span className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {camaOrigen ? `Cama ${camaOrigen}` : <span className="text-amber-500">Sin cama</span>}
        </span>
        <ArrowRightCircle size={16} className="shrink-0 text-violet-600 dark:text-violet-300" />
        <span className="rounded-lg bg-violet-100 px-2 py-1 font-semibold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
          {camaDestino ? `Cama ${camaDestino}` : <span className="text-amber-500">Sin cama</span>}
        </span>
      </div>
    </div>
  );
}

// ─── Componentes de UI compartidos ───────────────────────────────────────────

function TypeCard({ selected, onClick, icon, title, desc, tone }: {
  selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string;
  tone: "blue" | "cyan" | "violet";
}) {
  const toneClasses = {
    blue: selected
      ? "border-blue-500 bg-blue-50 text-blue-800 shadow-sm shadow-blue-950/5 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-200"
      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-800",
    cyan: selected
      ? "border-cyan-500 bg-cyan-50 text-cyan-800 shadow-sm shadow-cyan-950/5 dark:border-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200"
      : "border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-800",
    violet: selected
      ? "border-violet-500 bg-violet-50 text-violet-800 shadow-sm shadow-violet-950/5 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-200"
      : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-violet-800",
  };
  const iconClasses = {
    blue: selected ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300",
    cyan: selected ? "bg-cyan-600 text-white" : "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-300",
    violet: selected ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300",
  };
  return (
    <div onClick={onClick}
      className={`cursor-pointer rounded-2xl border p-5 transition-all duration-200 flex flex-col gap-3 hover:-translate-y-0.5 ${toneClasses[tone]}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${iconClasses[tone]}`}>
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-sm mb-1">{title}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">{desc}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/35">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">{title}</p>
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
