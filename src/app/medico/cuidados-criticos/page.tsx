"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { Activity, AlertCircle, CheckCircle2, FileSpreadsheet, History, Plus, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { TIPO_MEDICO_CRITICO_LABEL } from "@/lib/cuidadosCriticos";
import { FichaMatrizCuidadosCriticos } from "@/components/cuidados-criticos/FichaMatrizCuidadosCriticos";
import { valorComoTexto, type DatosMatrizCuidadosCriticos } from "@/lib/matrizCuidadosCriticos";
import type { FichaCuidadosCriticos, Paciente } from "@/types";

const NUEVA_ESTANCIA = "nueva";
const inputCls = "w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const timestamp = value as { toDate?: () => Date };
  return timestamp.toDate?.() ?? new Date(value as string);
}

function fichaEgresada(ficha: FichaCuidadosCriticos) {
  return ficha.estadoEstancia === "egresada"
    || Boolean(valorComoTexto(ficha.datos?.fecha_egreso_del_servicio))
    || ficha.datos?.alta === "FALLECIDO";
}

function ordenarFichas(fichas: FichaCuidadosCriticos[]) {
  return [...fichas].sort((a, b) => (toDate(a.creadoEn)?.getTime() ?? 0) - (toDate(b.creadoEn)?.getTime() ?? 0));
}

export default function CuidadosCriticosMedicoPage() {
  const { user, profile } = useAuth();
  const servicios = useMemo(() => profile?.servicios ?? [], [profile?.servicios]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [fichas, setFichas] = useState<FichaCuidadosCriticos[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedEstanciaId, setSelectedEstanciaId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile?.tipoMedico || servicios.length === 0) return;
    const pacientesQuery = query(collection(db, "pacientes"), where("servicioActual", "in", servicios));
    const fichasQuery = query(collection(db, "fichas_cuidados_criticos"), where("servicio", "in", servicios));
    const unsubPacientes = onSnapshot(pacientesQuery, snap => {
      const docs = snap.docs
        .map(item => ({ id: item.id, ...item.data() } as Paciente))
        .sort((a, b) => Number(b.estado === "activo") - Number(a.estado === "activo") || a.servicioActual.localeCompare(b.servicioActual) || (a.camaActual ?? "").localeCompare(b.camaActual ?? "", undefined, { numeric: true }));
      setPacientes(docs);
    });
    const unsubFichas = onSnapshot(fichasQuery, snap => {
      setFichas(snap.docs.map(item => ({ id: item.id, ...item.data() } as FichaCuidadosCriticos)));
    });
    return () => {
      unsubPacientes();
      unsubFichas();
    };
  }, [profile?.tipoMedico, servicios]);

  const selected = pacientes.find(paciente => paciente.id === selectedId) ?? null;
  const fichasPaciente = ordenarFichas(fichas.filter(ficha => ficha.pacienteId === selectedId));
  const fichaSeleccionada = selectedEstanciaId !== NUEVA_ESTANCIA
    ? fichasPaciente.find(ficha => ficha.id === selectedEstanciaId)
    : undefined;
  const estanciaActiva = fichasPaciente.find(ficha => !fichaEgresada(ficha));
  const numeroEstancia = fichaSeleccionada
    ? fichasPaciente.findIndex(ficha => ficha.id === fichaSeleccionada.id) + 1
    : fichasPaciente.length + 1;

  const pacientesFiltrados = pacientes.filter(paciente => {
    const term = busqueda.trim().toLowerCase();
    if (!term) return true;
    return `${paciente.expediente} ${paciente.nombres} ${paciente.apellidos} ${paciente.servicioActual} ${paciente.camaActual ?? ""}`
      .toLowerCase()
      .includes(term);
  });

  const seleccionarPaciente = (paciente: Paciente) => {
    const estancias = ordenarFichas(fichas.filter(ficha => ficha.pacienteId === paciente.id));
    const activa = estancias.find(ficha => !fichaEgresada(ficha));
    setSelectedId(paciente.id!);
    setSelectedEstanciaId(activa?.id ?? NUEVA_ESTANCIA);
    setError("");
  };

  const guardarFicha = async (datos: DatosMatrizCuidadosCriticos) => {
    if (!user || !profile?.tipoMedico || !selected?.id) return;
    if (!valorComoTexto(datos.fecha_ingreso_al_servicio)) {
      const message = "Registra primero la FECHA INGRESO AL SERVICIO correspondiente a esta estancia UCI/UCIN.";
      setError(message);
      throw new Error(message);
    }

    setSaving(true);
    setError("");
    const estadoEstancia = valorComoTexto(datos.fecha_egreso_del_servicio) || datos.alta === "FALLECIDO"
      ? "egresada"
      : "activa";

    try {
      if (fichaSeleccionada?.id) {
        await updateDoc(doc(db, "fichas_cuidados_criticos", fichaSeleccionada.id), {
          estadoEstancia,
          cama: selected.camaActual ?? "",
          datos,
          actualizadoPorId: user.uid,
          actualizadoPorNombre: profile.nombre,
          actualizadoEn: serverTimestamp(),
        });
      } else {
        const creada = await addDoc(collection(db, "fichas_cuidados_criticos"), {
          tipoUnidad: profile.tipoMedico,
          estadoEstancia,
          pacienteId: selected.id,
          pacienteExpediente: selected.expediente,
          pacienteNombre: `${selected.apellidos}, ${selected.nombres}`,
          servicio: selected.servicioActual,
          cama: selected.camaActual ?? "",
          datos,
          creadoPorId: user.uid,
          creadoPorNombre: profile.nombre,
          creadoEn: serverTimestamp(),
          actualizadoPorId: user.uid,
          actualizadoPorNombre: profile.nombre,
          actualizadoEn: serverTimestamp(),
        });
        setSelectedEstanciaId(creada.id);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar la estancia.";
      setError(message);
      throw cause;
    } finally {
      setSaving(false);
    }
  };

  if (!profile?.tipoMedico) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Tu usuario todavía no está clasificado como Médico UCI o Médico UCIN.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
            <Activity size={19} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100">Matriz de cuidados críticos</h1>
            <p className="text-xs text-slate-500">{TIPO_MEDICO_CRITICO_LABEL[profile.tipoMedico]} · Una fila por cada estancia en UCI / UCIN</p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<Activity size={18} />} label="Pacientes en mis unidades" value={pacientes.length} />
        <Stat icon={<FileSpreadsheet size={18} />} label="Estancias registradas" value={fichas.length} />
        <Stat icon={<CheckCircle2 size={18} />} label="Estancias activas" value={fichas.filter(item => !fichaEgresada(item)).length} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <h2 className="font-bold font-heading text-slate-900 dark:text-slate-100">Seleccionar paciente</h2>
          <p className="mt-1 text-xs text-slate-500">Cada entrada del paciente a UCI o UCIN debe registrarse como una estancia independiente.</p>
          <div className="relative mt-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={busqueda} onChange={event => setBusqueda(event.target.value)} placeholder="Buscar paciente, expediente, servicio o cama" className={`${inputCls} pl-9`} />
          </div>
        </div>
        <div className="grid max-h-80 gap-2 overflow-y-auto p-3 md:grid-cols-2 xl:grid-cols-3">
          {pacientesFiltrados.map(paciente => {
            const estancias = fichas.filter(ficha => ficha.pacienteId === paciente.id);
            const activa = estancias.some(ficha => !fichaEgresada(ficha));
            return (
              <button
                key={paciente.id}
                type="button"
                onClick={() => seleccionarPaciente(paciente)}
                className={`rounded-xl border p-3 text-left transition-colors ${selectedId === paciente.id ? "border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950" : "border-slate-200 hover:border-blue-300 dark:border-slate-700 dark:hover:border-blue-800"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{paciente.apellidos}, {paciente.nombres}</p>
                    <p className="mt-0.5 text-xs font-mono text-slate-500">Exp. {paciente.expediente}</p>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase ${paciente.estado === "activo" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>{paciente.estado.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{paciente.servicioActual} · Cama {paciente.camaActual || "—"}</p>
                <p className={`mt-2 text-xs font-medium ${activa ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`}>
                  {estancias.length} estancia{estancias.length !== 1 ? "s" : ""} · {activa ? "una activa" : "sin estancia activa"}
                </p>
              </button>
            );
          })}
          {pacientesFiltrados.length === 0 && <p className="col-span-full py-10 text-center text-sm text-slate-400">No hay pacientes en los servicios asignados.</p>}
        </div>
      </section>

      {selected && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-bold font-heading text-slate-900 dark:text-slate-100"><History size={17} /> Estancias del paciente</h2>
              <p className="mt-1 text-xs text-slate-500">Cierra la estancia actual registrando su fecha de egreso antes de iniciar un reingreso.</p>
            </div>
            <button
              type="button"
              disabled={Boolean(estanciaActiva)}
              onClick={() => setSelectedEstanciaId(NUEVA_ESTANCIA)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={16} /> Nueva estancia
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {fichasPaciente.map((ficha, index) => (
              <button
                key={ficha.id}
                type="button"
                onClick={() => setSelectedEstanciaId(ficha.id!)}
                className={`rounded-lg border px-3 py-2 text-left text-xs ${selectedEstanciaId === ficha.id ? "border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
              >
                <span className="block font-semibold">Estancia {index + 1} · {fichaEgresada(ficha) ? "Egresada" : "Activa"}</span>
                <span className="mt-0.5 block text-slate-400">{ficha.servicio} · Ingreso {valorComoTexto(ficha.datos?.fecha_ingreso_al_servicio) || "pendiente"}</span>
              </button>
            ))}
            {selectedEstanciaId === NUEVA_ESTANCIA && (
              <span className="rounded-lg border border-dashed border-blue-400 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                Nueva estancia {fichasPaciente.length + 1}
              </span>
            )}
          </div>
          {estanciaActiva && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              Existe una estancia activa. Registra FECHA EGRESO DEL SERVICIO o el fallecimiento antes de crear un nuevo reingreso.
            </p>
          )}
        </section>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {selected && selectedEstanciaId ? (
        <FichaMatrizCuidadosCriticos
          key={`${selected.id}-${selectedEstanciaId}`}
          paciente={selected}
          tipo={profile.tipoMedico}
          servicioEstancia={fichaSeleccionada?.servicio ?? selected.servicioActual}
          numeroEstancia={numeroEstancia}
          datosGuardados={fichaSeleccionada?.datos}
          saving={saving}
          onSave={guardarFicha}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500 dark:border-slate-700">
          Selecciona un paciente para abrir o iniciar una estancia UCI / UCIN.
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">{icon}<span className="text-xs font-medium text-slate-500">{label}</span></div>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}
