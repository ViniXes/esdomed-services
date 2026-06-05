"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addDoc, collection, getDocs, limit, orderBy, query, Timestamp, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft, Search, AlertTriangle, Save, CheckCircle2, User2, Pencil,
} from "lucide-react";
import type { Paciente, SolicitudIncapacidad } from "@/types";
import {
  calcularEdad, formatFecha, nombreCompleto, toDate,
} from "@/lib/pacientes/helpers";
import { calcularDiasHospitalizacion, calcularFechaHasta, parseDateInput } from "@/lib/incapacidades/helpers";
import {
  IncapacidadFormFields, type IncapacidadFormValue,
} from "@/components/incapacidades/IncapacidadFormFields";

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm";

export default function NuevaIncapacidadPage() {
  const router = useRouter();
  const { user, profile } = useAuth();

  // Búsqueda de paciente
  const [expedienteBusqueda, setExpedienteBusqueda] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [busquedaError, setBusquedaError] = useState<string | null>(null);

  // Form
  const hoy = toDateInput(new Date());
  const [form, setForm] = useState<IncapacidadFormValue>({
    fechaAlta: hoy,
    diasExtras: "",
    diagnosticoEgreso: "",
    tratamientoAlta: "",
    condicionEgreso: "vivo",
    recomendaciones: "",
    seguimiento: "",
  });

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detección de duplicados: solicitudes de ESTE médico para ESTE paciente
  // creadas hoy. (Las reglas de Firestore solo dejan al médico leer las suyas,
  // así que cubre el caso de doble-envío del mismo médico.)
  const [duplicadosHoy, setDuplicadosHoy] = useState<SolicitudIncapacidad[]>([]);
  const [confirmandoDuplicado, setConfirmandoDuplicado] = useState(false);

  useEffect(() => {
    const pid = paciente?.id;
    let cancelado = false;
    (async () => {
      if (!pid || !user) { if (!cancelado) setDuplicadosHoy([]); return; }
      try {
        const q = query(
          collection(db, "incapacidades"),
          where("pacienteId", "==", pid),
          where("medicoId", "==", user.uid),
        );
        const snap = await getDocs(q);
        if (cancelado) return;
        const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
        const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999);
        const hoy = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              fechaAlta: toDate(data.fechaAlta) ?? new Date(),
              creadoEn: toDate(data.creadoEn) ?? new Date(),
            } as SolicitudIncapacidad;
          })
          .filter((s) => s.creadoEn >= inicioHoy && s.creadoEn <= finHoy)
          .sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime());
        setDuplicadosHoy(hoy);
        setConfirmandoDuplicado(false);
      } catch {
        /* el chequeo de duplicados no es crítico: no bloquea la creación */
      }
    })();
    return () => { cancelado = true; };
  }, [paciente?.id, user]);

  const buscarPaciente = async () => {
    const exp = expedienteBusqueda.trim();
    if (!exp) return;
    setBuscando(true);
    setBusquedaError(null);
    setPaciente(null);
    try {
      const q = query(
        collection(db, "pacientes"),
        where("expediente", "==", exp),
        orderBy("fechaIngreso", "desc"),
        limit(1),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setBusquedaError("No se encontró ningún paciente con ese expediente. Pídele a ESDOMED que lo registre primero.");
      } else {
        const d = snap.docs[0];
        const data = d.data();
        setPaciente({
          id: d.id,
          ...data,
          fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
          fechaEgreso: toDate(data.fechaEgreso),
          fechaNacimiento: toDate(data.fechaNacimiento),
          creadoEn: toDate(data.creadoEn) ?? new Date(),
        } as Paciente);
      }
    } catch (e) {
      setBusquedaError(`Error al buscar: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setBuscando(false);
    }
  };

  const guardar = async () => {
    if (!user || !profile || !paciente) return;
    const diasExtras = parseInt(form.diasExtras, 10);
    if (form.diasExtras === "" || isNaN(diasExtras) || diasExtras < 0) { setError("Los días adicionales deben ser 0 o mayor."); return; }
    if (!form.diagnosticoEgreso.trim()) { setError("El diagnóstico de egreso es obligatorio."); return; }
    if (!form.tratamientoAlta.trim())   { setError("El tratamiento al alta es obligatorio."); return; }

    // Hay una solicitud de hoy para este paciente: pedir confirmación antes de duplicar.
    if (duplicadosHoy.length > 0 && !confirmandoDuplicado) {
      setError(null);
      setConfirmandoDuplicado(true);
      return;
    }

    setError(null);
    setGuardando(true);
    try {
      const fAlta  = parseDateInput(form.fechaAlta);
      const fDesde = paciente!.fechaIngreso;
      if (fAlta < fDesde) { setError("La fecha de alta no puede ser anterior a la fecha de ingreso del paciente."); setGuardando(false); return; }
      const diasHosp  = calcularDiasHospitalizacion(fDesde, fAlta);
      const diasTotal = diasHosp + diasExtras;
      const fHasta    = calcularFechaHasta(fAlta, diasExtras);

      const doc: Record<string, unknown> = {
        // Médico
        medicoId: user.uid,
        medicoNombre: profile.nombre,
        medicoServicio: profile.tipoMedico
          ? paciente.servicioActual
          : profile.servicio ?? (profile.servicios?.[0] ?? ""),
        // Paciente
        pacienteId: paciente.id!,
        pacienteExpediente: paciente.expediente,
        pacienteNombre: nombreCompleto(paciente),
        servicioPaciente: paciente.servicioActual,
        // Datos
        fechaAlta: Timestamp.fromDate(fAlta),
        diasIncapacidad: diasTotal,
        fechaDesde: Timestamp.fromDate(fDesde),
        fechaHasta: Timestamp.fromDate(fHasta),
        diagnosticoEgreso: form.diagnosticoEgreso.trim(),
        tratamientoAlta: form.tratamientoAlta.trim(),
        condicionEgreso: form.condicionEgreso,
        // Estado
        estado: "pendiente" as const,
        creadoEn: Timestamp.now(),
      };

      if (profile.jvpm)               doc.medicoJvpm = profile.jvpm;
      if (paciente.camaActual)        doc.camaPaciente = paciente.camaActual;
      if (form.recomendaciones.trim()) doc.recomendaciones = form.recomendaciones.trim();
      if (form.seguimiento.trim())     doc.seguimiento = form.seguimiento.trim();

      await addDoc(collection(db, "incapacidades"), doc);
      router.push("/medico/incapacidades");
    } catch (e) {
      setError(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
      setGuardando(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/medico/incapacidades"
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
          Nueva incapacidad
        </h1>
      </div>

      {/* Paso 1: Buscar paciente */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 font-heading">
          <User2 size={15} className="text-slate-400" />
          1. Paciente
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={expedienteBusqueda}
            onChange={(e) => setExpedienteBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscarPaciente()}
            placeholder="Número de expediente"
            className={inputCls}
            disabled={buscando}
          />
          <button
            onClick={buscarPaciente}
            disabled={buscando || !expedienteBusqueda.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex-shrink-0"
          >
            <Search size={14} />
            {buscando ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {busquedaError && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 mt-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{busquedaError}</span>
          </div>
        )}

        {paciente && (
          <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3 mt-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400 mb-2">
              <CheckCircle2 size={13} /> Paciente encontrado
            </p>
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
          </div>
        )}
      </section>

      {/* Advertencia de duplicado: ya hay solicitud(es) de hoy para este paciente */}
      {paciente && duplicadosHoy.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-2xl px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Ya solicitaste {duplicadosHoy.length === 1 ? "una incapacidad" : `${duplicadosHoy.length} incapacidades`} para este paciente hoy
              </p>
              <ul className="mt-1.5 space-y-1">
                {duplicadosHoy.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 text-xs text-amber-700 dark:text-amber-400">
                    <span>
                      {s.diasIncapacidad} {s.diasIncapacidad === 1 ? "día" : "días"} · Alta {formatFecha(s.fechaAlta)}
                      {s.estado === "emitida" ? " · ya emitida" : " · pendiente"}
                    </span>
                    {s.estado === "pendiente" && (
                      <Link
                        href={`/medico/incapacidades/${s.id}/editar`}
                        className="flex items-center gap-1 font-medium text-amber-800 dark:text-amber-300 hover:underline flex-shrink-0"
                      >
                        <Pencil size={11} /> Ver / editar
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
                Si es un duplicado, edita o elimina la anterior en lugar de crear otra.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Paso 2: Datos de incapacidad */}
      {paciente && (
        <IncapacidadFormFields
          value={form}
          onChange={setForm}
          fechaIngreso={paciente.fechaIngreso}
        />
      )}

      {/* Footer */}
      {paciente && (
        <div>
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {confirmandoDuplicado ? (
            <div className="space-y-2">
              <p className="text-sm text-amber-700 dark:text-amber-400 text-center">
                Ya hay una solicitud de hoy para este paciente. ¿Crear otra de todos modos?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmandoDuplicado(false)}
                  disabled={guardando}
                  className="flex-1 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardar}
                  disabled={guardando}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-xl disabled:opacity-50 transition-colors"
                >
                  <Save size={15} />
                  {guardando ? "Enviando..." : "Sí, crear otra"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={guardar}
              disabled={guardando}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl disabled:opacity-50 transition-colors"
            >
              <Save size={15} />
              {guardando ? "Enviando..." : "Enviar solicitud a ESDOMED"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function toDateInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
