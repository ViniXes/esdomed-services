"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { Activity, AlertCircle, CheckCircle2, FileSpreadsheet, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { serviciosPorTipoMedico, TIPO_MEDICO_CRITICO_LABEL } from "@/lib/cuidadosCriticos";
import { ubicacionLabel } from "@/lib/servicios";
import { FichaMatrizCuidadosCriticos } from "@/components/cuidados-criticos/FichaMatrizCuidadosCriticos";
import { aplicarValoresPorDefectoMatriz, esValorRegistrado, valorComoTexto, type DatosMatrizCuidadosCriticos } from "@/lib/matrizCuidadosCriticos";
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
    || esValorRegistrado(ficha.datos?.fecha_egreso_del_servicio)
    || ficha.datos?.alta === "FALLECIDO";
}

function ordenarFichas(fichas: FichaCuidadosCriticos[]) {
  return [...fichas].sort((a, b) => (toDate(a.creadoEn)?.getTime() ?? 0) - (toDate(b.creadoEn)?.getTime() ?? 0));
}

function estadoPacienteLabel(estado: Paciente["estado"]) {
  if (estado === "activo") return "Paciente ingresado";
  return estado.replaceAll("_", " ");
}

export default function CuidadosCriticosMedicoPage() {
  const { user, profile } = useAuth();
  const servicios = useMemo(() => profile?.servicios ?? [], [profile?.servicios]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [fichas, setFichas] = useState<FichaCuidadosCriticos[]>([]);
  const [pacientePrecargado, setPacientePrecargado] = useState<Paciente | null>(null);
  const [fichaUrlId, setFichaUrlId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedEstanciaId, setSelectedEstanciaId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [servicioFiltro, setServicioFiltro] = useState("todos");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    queueMicrotask(() => {
      setFichaUrlId(new URLSearchParams(window.location.search).get("ficha") ?? "");
    });
  }, []);

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

  useEffect(() => {
    if (!fichaUrlId || fichas.length === 0) return;
    const ficha = fichas.find(item => item.id === fichaUrlId);
    if (!ficha || selectedId === ficha.pacienteId && selectedEstanciaId === ficha.id) return;
    queueMicrotask(() => {
      setSelectedId(ficha.pacienteId);
      setSelectedEstanciaId(ficha.id ?? "");
      setBusqueda(ficha.pacienteExpediente);
      setServicioFiltro(ficha.servicio);
      setError("");
    });
  }, [fichaUrlId, fichas, selectedEstanciaId, selectedId]);

  useEffect(() => {
    if (!selectedId || pacientes.some(paciente => paciente.id === selectedId)) return;
    let activo = true;
    getDoc(doc(db, "pacientes", selectedId))
      .then(snap => {
        if (activo && snap.exists()) setPacientePrecargado({ id: snap.id, ...snap.data() } as Paciente);
      })
      .catch(() => {
        if (activo) setPacientePrecargado(null);
      });
    return () => {
      activo = false;
    };
  }, [pacientes, selectedId]);

  const selected = pacientes.find(paciente => paciente.id === selectedId) ?? (pacientePrecargado?.id === selectedId ? pacientePrecargado : null);
  const fichasPaciente = ordenarFichas(fichas.filter(ficha => ficha.pacienteId === selectedId));
  const fichaSeleccionada = selectedEstanciaId !== NUEVA_ESTANCIA
    ? fichasPaciente.find(ficha => ficha.id === selectedEstanciaId)
    : undefined;
  const numeroEstancia = fichaSeleccionada
    ? fichasPaciente.findIndex(ficha => ficha.id === fichaSeleccionada.id) + 1
    : fichasPaciente.length + 1;

  const busquedaNormalizada = busqueda.trim().toLowerCase();
  const debeBuscarOFiltrar = servicioFiltro === "todos" && busquedaNormalizada.length < 2;
  const pacientesFiltrados = pacientes.filter(paciente => {
    if (debeBuscarOFiltrar) return false;
    if (servicioFiltro !== "todos" && paciente.servicioActual !== servicioFiltro) return false;
    const term = busquedaNormalizada;
    if (!term) return true;
    return `${paciente.expediente} ${paciente.nombres} ${paciente.apellidos} ${paciente.servicioActual} ${paciente.camaActual ?? ""} ${ubicacionLabel(paciente.servicioActual, paciente.camaActual)}`
      .toLowerCase()
      .includes(term);
  });

  const fichasHistoricasFiltradas = busquedaNormalizada.length < 2
    ? []
    : fichas
        .filter(ficha => {
          if (servicioFiltro !== "todos" && ficha.servicio !== servicioFiltro) return false;
          return `${ficha.pacienteExpediente} ${ficha.pacienteNombre} ${ficha.servicio} ${ficha.cama ?? ""}`.toLowerCase().includes(busquedaNormalizada);
        })
        .sort((a, b) => (toDate(b.actualizadoEn)?.getTime() ?? 0) - (toDate(a.actualizadoEn)?.getTime() ?? 0))
        .slice(0, 8);
  const totalResultadosBusqueda = pacientesFiltrados.length + fichasHistoricasFiltradas.length;

  const abrirFichaHistorica = (ficha: FichaCuidadosCriticos) => {
    setSelectedId(ficha.pacienteId);
    setSelectedEstanciaId(ficha.id ?? "");
    setBusqueda(ficha.pacienteExpediente);
    setServicioFiltro(ficha.servicio);
    setError("");
  };

  const seleccionarPaciente = (paciente: Paciente) => {
    const estancias = ordenarFichas(fichas.filter(ficha => ficha.pacienteId === paciente.id));
    const activa = estancias.find(ficha => !fichaEgresada(ficha));
    setPacientePrecargado(null);
    setSelectedId(paciente.id!);
    setSelectedEstanciaId(activa?.id ?? NUEVA_ESTANCIA);
    setError("");
  };

  const guardarFicha = async (datos: DatosMatrizCuidadosCriticos) => {
    if (!user || !profile?.tipoMedico || !selected?.id) return;
    if (!esValorRegistrado(datos.fecha_ingreso_al_servicio)) {
      const message = "Registra primero la FECHA INGRESO AL SERVICIO correspondiente a este registro UCI/UCIN.";
      setError(message);
      throw new Error(message);
    }
    const especialidad = valorComoTexto(datos.especialidad).trim();
    if (!serviciosPorTipoMedico(profile.tipoMedico).includes(especialidad)) {
      const message = "Selecciona una ESPECIALIDAD valida de las unidades asignadas a tu rol.";
      setError(message);
      throw new Error(message);
    }

    setSaving(true);
    setError("");
    const estadoEstancia = esValorRegistrado(datos.fecha_egreso_del_servicio) || datos.alta === "FALLECIDO"
      ? "egresada"
      : "activa";
    const datosParaGuardar = aplicarValoresPorDefectoMatriz(datos, profile.tipoMedico);
    const registroActivoExistente = fichasPaciente.find(ficha => !fichaEgresada(ficha) && ficha.id !== fichaSeleccionada?.id);
    if (!fichaSeleccionada?.id && registroActivoExistente) {
      const message = "Este paciente ya tiene un registro activo. Cierra el registro actual antes de crear uno nuevo.";
      setError(message);
      setSaving(false);
      throw new Error(message);
    }

    try {
      if (fichaSeleccionada?.id) {
        await updateDoc(doc(db, "fichas_cuidados_criticos", fichaSeleccionada.id), {
          estadoEstancia,
          cama: selected.camaActual ?? "",
          datos: datosParaGuardar,
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
          datos: datosParaGuardar,
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
      const message = cause instanceof Error ? cause.message : "No se pudo guardar el registro.";
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
        <Stat icon={<FileSpreadsheet size={18} />} label="Registros guardados" value={fichas.length} />
        <Stat icon={<CheckCircle2 size={18} />} label="Registros activos" value={fichas.filter(item => !fichaEgresada(item)).length} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <h2 className="font-bold font-heading text-slate-900 dark:text-slate-100">Seleccionar paciente</h2>
          <p className="mt-1 text-xs text-slate-500">Cada entrada del paciente a UCI o UCIN debe registrarse como un registro independiente.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={busqueda} onChange={event => setBusqueda(event.target.value)} placeholder="Buscar paciente, expediente, servicio o cama" className={`${inputCls} pl-9`} />
            </div>
            <select
              value={servicioFiltro}
              onChange={event => setServicioFiltro(event.target.value)}
              className={inputCls}
              aria-label="Filtrar pacientes por servicio asignado"
            >
              <option value="todos">Todos mis servicios</option>
              {servicios.map(servicio => (
                <option key={servicio} value={servicio}>{servicio}</option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Mostrando solo pacientes de las unidades asignadas a {TIPO_MEDICO_CRITICO_LABEL[profile.tipoMedico]}.
          </p>
        </div>
        <div className="grid max-h-64 gap-2 overflow-y-auto p-2 md:grid-cols-3 xl:grid-cols-4">
          {pacientesFiltrados.map(paciente => {
            const estancias = fichas.filter(ficha => ficha.pacienteId === paciente.id);
            const activa = estancias.some(ficha => !fichaEgresada(ficha));
            return (
              <button
                key={paciente.id}
                type="button"
                onClick={() => seleccionarPaciente(paciente)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${selectedId === paciente.id ? "border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950" : "border-slate-200 hover:border-blue-300 dark:border-slate-700 dark:hover:border-blue-800"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-slate-900 dark:text-slate-100">{paciente.apellidos}, {paciente.nombres}</p>
                    <p className="mt-0.5 text-[11px] font-mono text-slate-500">Exp. {paciente.expediente}</p>
                  </div>
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase ${paciente.estado === "activo" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>{estadoPacienteLabel(paciente.estado)}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-slate-500">{ubicacionLabel(paciente.servicioActual, paciente.camaActual)}</p>
                <p className={`mt-1 text-[11px] font-medium ${activa ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`}>
                  Matriz: {estancias.length} estancia{estancias.length !== 1 ? "s" : ""} · {activa ? "activa" : "sin activa"}
                </p>
              </button>
            );
          })}
          {fichasHistoricasFiltradas.map(ficha => {
            const cerrada = fichaEgresada(ficha);
            const seleccionada = selectedEstanciaId === ficha.id;
            return (
              <button
                key={ficha.id}
                type="button"
                onClick={() => abrirFichaHistorica(ficha)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${seleccionada ? "border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950" : "border-slate-200 hover:border-blue-300 dark:border-slate-700 dark:hover:border-blue-800"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-slate-900 dark:text-slate-100">{ficha.pacienteNombre}</p>
                    <p className="mt-0.5 text-[11px] font-mono text-slate-500">Exp. {ficha.pacienteExpediente}</p>
                  </div>
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase ${cerrada ? "bg-slate-100 text-slate-500 dark:bg-slate-800" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
                    {cerrada ? "Registro cerrado" : "Registro activo"}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-slate-500">{ubicacionLabel(ficha.servicio, ficha.cama)}</p>
                <p className="mt-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                  Abrir registro guardado - Ingreso {valorComoTexto(ficha.datos?.fecha_ingreso_al_servicio) || "No registrado"}
                </p>
              </button>
            );
          })}
          {totalResultadosBusqueda === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-slate-400">
              {debeBuscarOFiltrar
                ? "Busca por expediente, cama o nombre, o elige un servicio para cargar sus pacientes."
                : "No hay pacientes ni registros guardados que coincidan con la busqueda o el servicio seleccionado."}
            </p>
          )}
        </div>
      </section>

      {/*
      <section className="hidden">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Abrir registro anterior</span>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busquedaHistorica}
                onChange={event => setBusquedaHistorica(event.target.value)}
                placeholder="Buscar por expediente, paciente, servicio o cama..."
                className={`${inputCls} pl-9`}
              />
            </div>
          </label>
          <p className="max-w-xl text-xs text-slate-500">
            Usa esta búsqueda para abrir registros UCI/UCIN ya guardados, aunque el paciente ya no aparezca ingresado.
          </p>
        </div>
        {busquedaHistoricaNormalizada.length >= 2 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2">Expediente</th>
                  <th className="px-3 py-2">Paciente</th>
                  <th className="px-3 py-2">Ubicación</th>
                  <th className="px-3 py-2">Ingreso</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {fichasHistoricasFiltradas.map(ficha => (
                  <tr key={ficha.id} className="text-slate-700 dark:text-slate-300">
                    <td className="px-3 py-2 font-mono">{ficha.pacienteExpediente}</td>
                    <td className="px-3 py-2">{ficha.pacienteNombre}</td>
                    <td className="px-3 py-2">{ubicacionLabel(ficha.servicio, ficha.cama)}</td>
                    <td className="px-3 py-2">{valorComoTexto(ficha.datos?.fecha_ingreso_al_servicio) || "No registrado"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => abrirFichaHistorica(ficha)}
                        className="inline-flex rounded-lg border border-blue-200 px-3 py-1.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950"
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
                {fichasHistoricasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-400">No hay registros guardados que coincidan.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      */}
      {error && (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {selected && selectedEstanciaId ? (
        <FichaMatrizCuidadosCriticos
          key={`${selected.id}-${selectedEstanciaId}-${toDate(fichaSeleccionada?.actualizadoEn)?.getTime() ?? ""}`}
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
