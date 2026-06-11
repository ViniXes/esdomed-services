"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, onSnapshot, Timestamp, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft, CheckCircle2, Clock, FileText, Printer, AlertTriangle,
  User2, Stethoscope, Trash2,
} from "lucide-react";
import type {
  BancoDeposito, InstitucionProvisional, Paciente, SolicitudIncapacidad,
} from "@/types";
import {
  calcularEdad, formatFecha, formatFechaHora, nombreCompleto, toDate,
} from "@/lib/pacientes/helpers";
import { formatFechaConstanciaCorta, numeroALetras } from "@/lib/incapacidades/helpers";

const INSTITUCIONES: InstitucionProvisional[] = ["CRECER", "CONFIA", "INPEP", "IPSFA", "ISSS"];
const BANCOS: BancoDeposito[] = ["Promerica", "Atlantida"];

export default function IncapacidadDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();

  const [incapacidad, setIncapacidad] = useState<SolicitudIncapacidad | null>(null);
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [loading, setLoading] = useState(true);

  const [institucion, setInstitucion] = useState<InstitucionProvisional | "">("");
  const [banco, setBanco] = useState<BancoDeposito | "">("");
  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const puedeEliminar = profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";

  // Suscripción a la incapacidad
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "incapacidades", id), (snap) => {
      if (!snap.exists()) {
        setIncapacidad(null);
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
        fechaExpedicion: toDate(data.fechaExpedicion),
      } as SolicitudIncapacidad;
      setIncapacidad(inc);
      setInstitucion(inc.institucionProvisional ?? "");
      setBanco(inc.bancoDeposito ?? "");
    });
    return unsub;
  }, [id]);

  // Cargar paciente cuando tenemos la incapacidad
  useEffect(() => {
    if (!incapacidad?.pacienteId) return;
    (async () => {
      const snap = await getDoc(doc(db, "pacientes", incapacidad.pacienteId));
      if (snap.exists()) {
        const data = snap.data();
        setPaciente({
          id: snap.id,
          ...data,
          fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
          fechaEgreso: toDate(data.fechaEgreso),
          fechaNacimiento: toDate(data.fechaNacimiento),
          creadoEn: toDate(data.creadoEn) ?? new Date(),
        } as Paciente);
      }
      setLoading(false);
    })();
  }, [incapacidad?.pacienteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!incapacidad) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-slate-500">Solicitud no encontrada.</p>
        <Link href="/dashboard/incapacidades" className="text-sm text-blue-600 hover:underline">
          ← Volver
        </Link>
      </div>
    );
  }

  const emitir = async () => {
    if (!profile || !incapacidad.id) return;
    setError(null);
    setEmitiendo(true);
    try {
      const ahora = Timestamp.now();
      const update: Record<string, unknown> = {
        estado: "emitida" as const,
        emitidaPor: profile.uid,
        emitidaPorNombre: profile.nombre,
        emitidaEn: ahora,
        fechaExpedicion: ahora,
      };
      if (institucion) update.institucionProvisional = institucion;
      if (banco) update.bancoDeposito = banco;
      await updateDoc(doc(db, "incapacidades", incapacidad.id), update);
    } catch (e) {
      setError(`Error al emitir: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setEmitiendo(false);
    }
  };

  const guardarSubsidios = async () => {
    if (!incapacidad.id) return;
    setError(null);
    const update: Record<string, unknown> = {};
    update.institucionProvisional = institucion || null;
    update.bancoDeposito = banco || null;
    await updateDoc(doc(db, "incapacidades", incapacidad.id), update);
  };

  const abrirImprimir = () => {
    window.open(`/dashboard/incapacidades/${incapacidad.id}/imprimir`, "_blank");
  };

  const eliminar = async () => {
    if (!incapacidad.id) return;
    setEliminando(true);
    setError(null);
    try {
      await deleteDoc(doc(db, "incapacidades", incapacidad.id));
      router.push("/dashboard/incapacidades");
    } catch (e) {
      setError(`Error al eliminar: ${e instanceof Error ? e.message : "desconocido"}`);
      setEliminando(false);
    }
  };

  const yaEmitida = incapacidad.estado === "emitida";

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => router.push("/dashboard/incapacidades")}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors flex-shrink-0"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-widest">Solicitud de incapacidad</p>
            {yaEmitida ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 px-2 py-0.5 rounded-full">
                <CheckCircle2 size={10} /> Emitida
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-full">
                <Clock size={10} /> Pendiente de emitir
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {incapacidad.pacienteNombre}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Exp. <span className="font-mono">{incapacidad.pacienteExpediente}</span>
            {" · "}{incapacidad.servicioPaciente}
            {incapacidad.camaPaciente && ` · Cama ${incapacidad.camaPaciente}`}
          </p>
        </div>
        <button
          onClick={abrirImprimir}
          className="flex items-center gap-1.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex-shrink-0"
        >
          <Printer size={14} />
          Imprimir constancia
        </button>
      </div>

      {yaEmitida && (
        <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-green-700 dark:text-green-400">
              Emitida por {incapacidad.emitidaPorNombre}
            </p>
            <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">
              {incapacidad.emitidaEn && formatFechaHora(incapacidad.emitidaEn)}
            </p>
          </div>
        </div>
      )}

      {/* Datos del paciente */}
      <Card icon={User2} title="Paciente">
        {paciente ? (
          <div className="grid md:grid-cols-2 gap-3 gap-x-6">
            <Row label="Nombre" value={nombreCompleto(paciente)} />
            <Row label="Expediente" value={paciente.expediente} mono />
            <Row label="DUI" value={paciente.dui} mono />
            <Row label="Nº Afiliación" value={paciente.numeroAfiliacion} mono />
            <Row label="Edad" value={calcularEdad(paciente.fechaNacimiento) !== null ? `${calcularEdad(paciente.fechaNacimiento)} años` : undefined} />
            <Row label="Género" value={paciente.genero === "masculino" ? "Masculino" : paciente.genero === "femenino" ? "Femenino" : "Otro"} />
            <Row
              label="Teléfono"
              value={
                paciente.telefono || paciente.otrosNumeros ||
                (paciente.responsable?.telefono
                  ? `${paciente.responsable.telefono} (${paciente.responsable.parentesco || "responsable"})`
                  : undefined)
              }
              mono
            />
            <Row label="Ocupación" value={paciente.ocupacion} />
            <Row label="Departamento" value={paciente.departamento} />
            <Row label="Municipio" value={paciente.municipio} />
            <Row label="Dirección" value={paciente.direccion} />
            <Row label="Fecha ingreso" value={formatFecha(paciente.fechaIngreso)} />
          </div>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-400 italic">
            Paciente no encontrado en BD (puede haberse borrado). La constancia mostrará solo el nombre snapshot.
          </p>
        )}
      </Card>

      {/* Datos clínicos */}
      <Card icon={Stethoscope} title="Datos de la incapacidad">
        <div className="grid md:grid-cols-3 gap-3 gap-x-6">
          <Row label="Médico" value={`Dr. ${incapacidad.medicoNombre}`} />
          <Row label="JVPM" value={incapacidad.medicoJvpm} mono />
          <Row label="Servicio" value={incapacidad.medicoServicio} />

          <Row label="Fecha de alta" value={formatFecha(incapacidad.fechaAlta)} />
          <Row label="Días incapacidad" value={`${incapacidad.diasIncapacidad} (${numeroALetras(incapacidad.diasIncapacidad)})`} />
          <Row label="Condición egreso" value={incapacidad.condicionEgreso === "muerto" ? "Muerto" : "Vivo"} />

          <Row label="Desde" value={formatFechaConstanciaCorta(incapacidad.fechaDesde)} mono />
          <Row label="Hasta" value={formatFechaConstanciaCorta(incapacidad.fechaHasta)} mono />
          <div />
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <BlockRow label="Diagnóstico de egreso" value={incapacidad.diagnosticoEgreso} />
          <BlockRow label="Tratamiento al alta" value={incapacidad.tratamientoAlta} />
          {incapacidad.recomendaciones && <BlockRow label="Recomendaciones" value={incapacidad.recomendaciones} />}
          {incapacidad.seguimiento && <BlockRow label="Seguimiento" value={incapacidad.seguimiento} />}
        </div>
      </Card>

      {/* Subsidios */}
      <Card icon={FileText} title="Datos administrativos (ESDOMED)">
        <p className="text-xs text-slate-500 mb-3">
          Estos campos los marca ESDOMED antes de imprimir la constancia. Son opcionales y aparecerán como checkboxes en el PDF.
        </p>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Institución Provicional</p>
          <div className="flex flex-wrap gap-2">
            {INSTITUCIONES.map((inst) => (
              <button
                key={inst}
                onClick={() => setInstitucion(inst === institucion ? "" : inst)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  institucion === inst
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {inst}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Banco a depositar</p>
          <div className="flex flex-wrap gap-2">
            {BANCOS.map((b) => (
              <button
                key={b}
                onClick={() => setBanco(b === banco ? "" : b)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  banco === b
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {yaEmitida && (institucion !== (incapacidad.institucionProvisional ?? "") || banco !== (incapacidad.bancoDeposito ?? "")) && (
          <button
            onClick={guardarSubsidios}
            className="mt-4 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Guardar cambios en subsidios
          </button>
        )}
      </Card>

      {/* Footer */}
      <div>
        {error && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {!yaEmitida ? (
          <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
            <button
              onClick={abrirImprimir}
              className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <Printer size={14} />
              Vista previa / Imprimir
            </button>
            <button
              onClick={emitir}
              disabled={emitiendo}
              className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-green-700 hover:bg-green-600 rounded-xl disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 size={14} />
              {emitiendo ? "Emitiendo..." : "Marcar como emitida"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center italic">
            La constancia ya fue emitida. Podés reimprimirla cuando lo necesites.
          </p>
        )}
      </div>

      {/* Eliminar solicitud (ESDOMED/admin) */}
      {puedeEliminar && (
        <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
          {confirmandoEliminar ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {yaEmitida
                  ? "Esta incapacidad ya fue emitida. ¿Eliminarla de todos modos? No se puede deshacer."
                  : "¿Eliminar esta solicitud? Esta acción no se puede deshacer."}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={eliminar}
                  disabled={eliminando}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {eliminando ? "Eliminando..." : "Sí, eliminar"}
                </button>
                <button
                  onClick={() => setConfirmandoEliminar(false)}
                  disabled={eliminando}
                  className="px-4 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmandoEliminar(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
            >
              <Trash2 size={13} />
              Eliminar solicitud
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers UI ──────────────────────────────────────────────────────────────

function Card({
  icon: Icon, title, children,
}: {
  icon: typeof User2; title: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 font-heading">
        <Icon size={15} className="text-slate-400" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-slate-500 text-xs pt-0.5 font-medium w-32 flex-shrink-0">{label}</span>
      <span className={`text-slate-800 dark:text-slate-200 flex-1 min-w-0 break-words ${mono ? "font-mono text-xs" : ""}`}>
        {value || <span className="text-slate-400 italic text-xs">—</span>}
      </span>
    </div>
  );
}

function BlockRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">{label}</p>
      <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-800">
        {value}
      </p>
    </div>
  );
}
