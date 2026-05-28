"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Save, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { CIE10Combobox } from "@/components/ui/CIE10Combobox";
import type { DiagnosticoCIE, EstadoPaciente, Paciente } from "@/types";
import {
  ESTADO_LABEL, diasEstancia, nombreCompleto, toDate,
} from "@/lib/pacientes/helpers";

const ESTADOS_EGRESO: EstadoPaciente[] = [
  "alta_vivo", "alta_fallecido", "alta_voluntaria", "fuga", "in_extremis", "referido",
];

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm";

const labelCls = "block text-xs font-medium text-slate-500 mb-1.5";

export default function EgresoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();

  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [condicion, setCondicion] = useState<EstadoPaciente>("alta_vivo");
  const [fechaHora, setFechaHora] = useState(() => toDatetimeLocalInput(new Date()));
  const [dxCodigo, setDxCodigo] = useState("");
  const [dxDescripcion, setDxDescripcion] = useState("");
  const [complementarios, setComplementarios] = useState<DiagnosticoCIE[]>([]);
  const [causaExtCodigo, setCausaExtCodigo] = useState("");
  const [causaExtDescripcion, setCausaExtDescripcion] = useState("");
  const [procedimientos, setProcedimientos] = useState<string[]>([]);
  const [medicoNombre, setMedicoNombre] = useState("");
  const [medicoJvpm, setMedicoJvpm] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const snap = await getDoc(doc(db, "pacientes", id));
      if (cancelado) return;
      if (!snap.exists()) {
        setPaciente(null);
        setLoading(false);
        return;
      }
      const data = snap.data();
      setPaciente({
        id: snap.id,
        ...data,
        fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
        fechaEgreso: toDate(data.fechaEgreso),
        fechaNacimiento: toDate(data.fechaNacimiento),
        creadoEn: toDate(data.creadoEn) ?? new Date(),
      } as Paciente);
      setLoading(false);
    })();
    return () => { cancelado = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!paciente) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-slate-500">Paciente no encontrado.</p>
        <Link href="/dashboard/pacientes" className="text-sm text-blue-600 hover:underline">
          ← Volver
        </Link>
      </div>
    );
  }

  if (paciente.estado !== "activo") {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <Link
          href={`/dashboard/pacientes/${paciente.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
        >
          <ArrowLeft size={14} /> Volver al paciente
        </Link>
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-2xl p-5">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Este paciente ya tiene egreso registrado
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
            Estado actual: <strong>{ESTADO_LABEL[paciente.estado]}</strong>
          </p>
        </div>
      </div>
    );
  }

  const dias = diasEstancia(paciente.fechaIngreso, new Date(fechaHora));

  const agregarComplementario = () =>
    setComplementarios((p) => [...p, { codigo: "", descripcion: "" }]);

  const eliminarComplementario = (idx: number) =>
    setComplementarios((p) => p.filter((_, i) => i !== idx));

  const actualizarComplementario = (idx: number, v: DiagnosticoCIE) =>
    setComplementarios((p) => p.map((d, i) => (i === idx ? v : d)));

  const agregarProcedimiento = () => setProcedimientos((p) => [...p, ""]);
  const eliminarProcedimiento = (idx: number) =>
    setProcedimientos((p) => p.filter((_, i) => i !== idx));
  const actualizarProcedimiento = (idx: number, v: string) =>
    setProcedimientos((p) => p.map((x, i) => (i === idx ? v : x)));

  const guardar = async () => {
    if (!profile || !paciente.id) return;
    if (!fechaHora) { setError("La fecha y hora de egreso es obligatoria."); return; }
    const fechaEgreso = new Date(fechaHora);
    if (fechaEgreso < paciente.fechaIngreso) {
      setError("La fecha de egreso no puede ser anterior a la de ingreso.");
      return;
    }
    if (!medicoNombre.trim()) { setError("El médico responsable del alta es obligatorio."); return; }

    setError(null);
    setGuardando(true);
    try {
      const update: Record<string, unknown> = {
        estado: condicion,
        fechaEgreso: Timestamp.fromDate(fechaEgreso),
        diasEstancia: dias,
        medicoEgresoNombre: medicoNombre.trim(),
        actualizadoEn: Timestamp.now(),
        actualizadoPor: profile.uid,
      };
      if (medicoJvpm.trim()) update.medicoEgresoJvpm = medicoJvpm.trim();
      if (dxCodigo.trim() || dxDescripcion.trim()) {
        update.diagnosticoEgreso = {
          codigo: dxCodigo.trim().toUpperCase(),
          descripcion: dxDescripcion.trim(),
        };
      }
      const compLimpios = complementarios
        .filter((d) => d.codigo.trim() || d.descripcion.trim())
        .map((d) => ({ codigo: d.codigo.trim().toUpperCase(), descripcion: d.descripcion.trim() }));
      if (compLimpios.length) update.diagnosticosComplementarios = compLimpios;

      if (causaExtCodigo.trim() || causaExtDescripcion.trim()) {
        update.causaExterna = {
          codigo: causaExtCodigo.trim().toUpperCase(),
          descripcion: causaExtDescripcion.trim(),
        };
      }
      const procsLimpios = procedimientos.map((p) => p.trim()).filter(Boolean);
      if (procsLimpios.length) update.procedimientos = procsLimpios;

      await updateDoc(doc(db, "pacientes", paciente.id), update);
      router.push(`/dashboard/pacientes/${paciente.id}`);
    } catch (e) {
      setError(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
      setGuardando(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/pacientes/${paciente.id}`}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <p className="text-[11px] text-slate-400 uppercase tracking-widest font-medium">Registrar egreso</p>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
            {nombreCompleto(paciente)} <span className="text-slate-400 font-mono text-sm ml-2">{paciente.expediente}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {paciente.servicioActual}{paciente.camaActual && ` · Cama ${paciente.camaActual}`} · {dias} {dias === 1 ? "día" : "días"} de estancia
          </p>
        </div>
      </div>

      {/* Condición de egreso */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 font-heading">Condición de egreso</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {ESTADOS_EGRESO.map((e) => (
            <button
              key={e}
              onClick={() => setCondicion(e)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                condicion === e
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              {ESTADO_LABEL[e]}
            </button>
          ))}
        </div>
        {condicion === "alta_fallecido" && (
          <p className="text-xs text-rose-600 dark:text-rose-400 mt-3 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
            Si este fallecimiento aún no fue notificado por el médico, regístralo también en el módulo de Fallecidos para activar el flujo administrativo.
          </p>
        )}
      </section>

      {/* Datos clínicos */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">Datos clínicos del egreso</h3>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Fecha y hora de egreso *</label>
            <input
              type="datetime-local"
              value={fechaHora}
              onChange={(e) => setFechaHora(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Días de estancia (calculado)</label>
            <input type="text" value={`${dias} días`} disabled className={`${inputCls} bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed`} />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Diagnóstico principal de egreso</p>
          <CIE10Combobox
            value={{ codigo: dxCodigo, descripcion: dxDescripcion }}
            onChange={(v) => { setDxCodigo(v.codigo); setDxDescripcion(v.descripcion); }}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Diagnósticos complementarios</p>
            <button
              onClick={agregarComplementario}
              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 font-medium"
            >
              <Plus size={12} /> Agregar
            </button>
          </div>
          {complementarios.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Sin diagnósticos complementarios.</p>
          ) : (
            <div className="space-y-2">
              {complementarios.map((d, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <CIE10Combobox
                      value={d}
                      onChange={(v) => actualizarComplementario(idx, v)}
                    />
                  </div>
                  <button
                    onClick={() => eliminarComplementario(idx)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors flex-shrink-0 mt-0.5"
                    aria-label="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Causa externa (opcional)</p>
          <CIE10Combobox
            value={{ codigo: causaExtCodigo, descripcion: causaExtDescripcion }}
            onChange={(v) => { setCausaExtCodigo(v.codigo); setCausaExtDescripcion(v.descripcion); }}
            placeholder="Buscar causa externa..."
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Procedimientos médicos / terapéuticos</p>
            <button
              onClick={agregarProcedimiento}
              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 font-medium"
            >
              <Plus size={12} /> Agregar
            </button>
          </div>
          {procedimientos.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Sin procedimientos registrados.</p>
          ) : (
            <div className="space-y-2">
              {procedimientos.map((p, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={p}
                    onChange={(e) => actualizarProcedimiento(idx, e.target.value)}
                    placeholder="Describir procedimiento"
                    className={inputCls}
                  />
                  <button
                    onClick={() => eliminarProcedimiento(idx)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors flex-shrink-0"
                    aria-label="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Médico responsable */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 font-heading">Médico responsable del alta</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className={labelCls}>Nombre del médico *</label>
            <input
              type="text"
              value={medicoNombre}
              onChange={(e) => setMedicoNombre(e.target.value)}
              className={inputCls}
              placeholder="DR. NOMBRE APELLIDOS"
            />
          </div>
          <div>
            <label className={labelCls}>JVPM</label>
            <input
              type="text"
              value={medicoJvpm}
              onChange={(e) => setMedicoJvpm(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="sticky bottom-0 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50/95 dark:via-slate-950/95 to-transparent pt-4 pb-2">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center gap-3 justify-end">
          <Link
            href={`/dashboard/pacientes/${paciente.id}`}
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
            {guardando ? "Guardando..." : "Registrar egreso"}
          </button>
        </div>
      </div>
    </div>
  );
}

function toDatetimeLocalInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
