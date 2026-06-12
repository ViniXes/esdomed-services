"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDoc, collection, getDocs, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Save, AlertTriangle, CheckCircle2, ChevronDown, Search, User2, X } from "lucide-react";
import type { Paciente, SolicitudAnexo5 } from "@/types";
import { CIRCUNSTANCIA_LABEL, calcularEdad, nombreCompleto, toDate } from "@/lib/pacientes/helpers";

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm";

const establecimientosReferencia = [
  "Hospital Nacional El Salvador",
  "Hospital Nacional Rosales",
  "Hospital Nacional de Niños Benjamín Bloom",
  "Hospital Nacional de la Mujer Dra. María Isabel Rodríguez",
  "Hospital Nacional Zacamil Dr. Juan José Fernández",
  "Hospital Nacional Neumológico y de Medicina Familiar Dr. José Antonio Saldaña",
  "Hospital Nacional Psiquiátrico Dr. José Molina Martínez",
  "Hospital Nacional General de Ilopango Enf. Angélica Vidal de Najarro",
  "Hospital Nacional Nuestra Señora de Fátima – Cojutepeque",
  "Hospital Nacional Santa Gertrudis – San Vicente",
  "Hospital Nacional Santa Teresa – Zacatecoluca",
  "Hospital Nacional San Juan de Dios – San Miguel",
  "Hospital Nacional San Pedro – Usulután",
  "Hospital Nacional Jiquilisco – Usulután",
  "Hospital Nacional Jorge Mena – Santiago de María",
  "Hospital Nacional de La Unión",
  "Hospital Nacional Santa Rosa de Lima – La Unión",
  "Hospital Nacional Nueva Concepción – Chalatenango",
  "Hospital Nacional Chalatenango Dr. Luis Edmundo Vásquez",
  "Hospital Nacional Sonsonate Dr. Jorge Mazzini Villacorta",
  "Hospital Nacional San Rafael – Santa Tecla",
  "Hospital Nacional de San Francisco Gotera",
  "Hospital Nacional de Sensuntepeque – San Jerónimo Emiliani",
  "Hospital Nacional de Ilobasco Dr. José Luis Saca",
  "Hospital Nacional Atiquizaya – Francisco Menéndez",
  "Hospital Nacional Ahuachapán – Dr. Francisco Menéndez",
  "Hospital Nacional Metapán Dr. Arturo Morales",
  "Hospital Nacional de Nueva Guadalupe",
  "Hospital Nacional de La Palma",
  "Hospital Nacional de San Marcos",
  "Hospital Nacional de Tecoluca – Prof. José Simeón Cañas",
  "Hospital Nacional de Chalchuapa",
  "Hospital Nacional San Juan de Dios - Santa Ana",
  "Instituto Salvadoreño de Rehabilitación Integral – ISRI",
];

const normalizarBusqueda = (valor: string) =>
  valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const etiquetaEstablecimiento = (establecimiento: string) =>
  establecimiento === "Hospital Nacional San Juan de Dios - Santa Ana"
    ? 'Hospital Nacional "San Juan de Dios" - Santa Ana'
    : establecimiento;

export default function NuevaAnexo5Page() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const hoy = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    fecha: hoy,
    expediente: "",
    nombrePaciente: "",
    referidoDe: "",
    establecimientoReferencia: "",
    fechaHoraCita: "",
    especialidad: "",
    medicoRefiere: "",
    establecimientoQueRefiere: "HOSPITAL NACIONAL EL SALVADOR",
    telefonoEstablecimiento: "7788-5522, 2594-2100, 2594-2139",
  });

  const [guardando, setGuardando] = useState(false);
  const [modalInfo, setModalInfo] = useState<{ tipo: "exito" | "error", mensaje: string } | null>(null);
  const [establecimientosOpen, setEstablecimientosOpen] = useState(false);

  // Búsqueda de paciente por expediente (autocompletado)
  const [buscandoExp, setBuscandoExp] = useState(false);
  const [pacienteEncontrado, setPacienteEncontrado] = useState<Paciente | null>(null);
  const [busquedaExpInfo, setBusquedaExpInfo] = useState<string | null>(null);

  const busquedaEstablecimiento = normalizarBusqueda(form.establecimientoReferencia.trim());
  const establecimientosFiltrados = busquedaEstablecimiento
    ? establecimientosReferencia.filter((establecimiento) =>
        normalizarBusqueda(establecimiento).includes(busquedaEstablecimiento)
      )
    : establecimientosReferencia;

  useEffect(() => {
    if (profile?.nombre && !form.medicoRefiere) {
      setForm((prev) => ({ ...prev, medicoRefiere: profile.nombre }));
    }
  }, [profile]);

  const buscarPorExpediente = async () => {
    const exp = form.expediente.trim();
    if (!exp) return;
    setBuscandoExp(true);
    setBusquedaExpInfo(null);
    setPacienteEncontrado(null);
    try {
      const q = query(
        collection(db, "pacientes"),
        where("expediente", "==", exp),
        orderBy("fechaIngreso", "desc"),
        limit(1),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setBusquedaExpInfo("No se encontró ese expediente en el sistema. Puedes llenar los datos manualmente.");
        return;
      }
      const d = snap.docs[0];
      const data = d.data();
      const p = {
        id: d.id,
        ...data,
        fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
        fechaNacimiento: toDate(data.fechaNacimiento),
        creadoEn: toDate(data.creadoEn) ?? new Date(),
      } as Paciente;
      setPacienteEncontrado(p);

      // "Referido de": si vino referido y tenemos el establecimiento de procedencia
      // lo usamos; si no, la circunstancia de ingreso (demanda espontánea / emergencia).
      const referido =
        p.circunstanciaIngreso === "referido" && p.establecimientoProcedencia
          ? p.establecimientoProcedencia
          : p.circunstanciaIngreso
            ? CIRCUNSTANCIA_LABEL[p.circunstanciaIngreso]
            : "";

      setForm((prev) => ({
        ...prev,
        nombrePaciente: nombreCompleto(p),
        ...(referido && !prev.referidoDe.trim() ? { referidoDe: referido } : {}),
      }));
    } catch (e) {
      setBusquedaExpInfo(`Error al buscar: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setBuscandoExp(false);
    }
  };

  const guardar = async () => {
    if (!user || !profile) return;
    
    // Validaciones
    if (!form.nombrePaciente.trim()) { setModalInfo({ tipo: "error", mensaje: "El nombre del paciente es obligatorio." }); return; }
    if (!form.referidoDe.trim()) { setModalInfo({ tipo: "error", mensaje: "El campo 'Referido de' es obligatorio." }); return; }
    if (!form.establecimientoReferencia.trim()) { setModalInfo({ tipo: "error", mensaje: "El establecimiento de referencia es obligatorio." }); return; }
    if (!form.especialidad.trim()) { setModalInfo({ tipo: "error", mensaje: "La especialidad es obligatoria." }); return; }

    setModalInfo(null);
    setGuardando(true);

    try {
      const docData: SolicitudAnexo5 = {
        medicoId: user.uid,
        medicoNombre: profile.nombre,

        ...(form.expediente.trim() && { expediente: form.expediente.trim().toUpperCase() }),

        fecha: form.fecha,
        nombrePaciente: form.nombrePaciente.toUpperCase(),
        referidoDe: form.referidoDe.toUpperCase(),
        establecimientoReferencia: form.establecimientoReferencia.toUpperCase(),
        fechaHoraCita: form.fechaHoraCita || undefined,
        especialidad: form.especialidad.toUpperCase(),
        medicoRefiere: form.medicoRefiere.toUpperCase(),
        establecimientoQueRefiere: form.establecimientoQueRefiere.toUpperCase(),
        telefonoEstablecimiento: form.telefonoEstablecimiento,

        estado: "pendiente",
        creadoEn: Timestamp.now() as unknown as Date,
      };

      await addDoc(collection(db, "anexo5"), docData);
      setModalInfo({ tipo: "exito", mensaje: "Referencia de Anexo 5 registrada correctamente." });
    } catch (e) {
      setModalInfo({ tipo: "error", mensaje: `Error al guardar: ${e instanceof Error ? e.message : "Desconocido"}` });
    } finally {
      setGuardando(false);
    }
  };

  const lbl = "block text-xs font-medium text-slate-500 mb-1.5";

  const resetForm = () => {
    setForm({
      fecha: hoy,
      expediente: "",
      nombrePaciente: "",
      referidoDe: "",
      establecimientoReferencia: "",
      fechaHoraCita: "",
      especialidad: "",
      medicoRefiere: profile?.nombre || "",
      establecimientoQueRefiere: "HOSPITAL NACIONAL EL SALVADOR",
      telefonoEstablecimiento: "7788-5522, 2594-2100, 2594-2139",
    });
    setModalInfo(null);
    setEstablecimientosOpen(false);
    setPacienteEncontrado(null);
    setBusquedaExpInfo(null);
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto h-[calc(100vh-80px)] flex flex-col space-y-4">
      {/* Modal éxito / error */}
      {modalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className={`p-6 flex flex-col items-center gap-3 ${modalInfo.tipo === "exito" ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"}`}>
              {modalInfo.tipo === "exito" ? (
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                  <CheckCircle2 size={36} className="text-green-600 dark:text-green-400" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                  <AlertTriangle size={36} className="text-red-600 dark:text-red-400" />
                </div>
              )}
              <h3 className={`text-lg font-bold ${modalInfo.tipo === "exito" ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"}`}>
                {modalInfo.tipo === "exito" ? "Referencia registrada" : "No se pudo guardar"}
              </h3>
              <p className={`text-sm text-center ${modalInfo.tipo === "exito" ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                {modalInfo.mensaje}
              </p>
            </div>
            <div className="p-5 space-y-2">
              {modalInfo.tipo === "exito" ? (
                <>
                  <button type="button" onClick={resetForm}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors">
                    Registrar otra referencia
                  </button>
                  <button type="button" onClick={() => router.push("/medico")}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    Volver al inicio
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setModalInfo(null)}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">
                  Entendido
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Encabezado */}
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/medico"
          className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading leading-tight">
            Nuevo Anexo 5
          </h1>
          <p className="text-xs text-slate-500">Comprobante para el paciente referido en el SIS</p>
        </div>
      </div>

      {/* Formulario */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-4">

            {/* Fila 1: Fecha + Expediente */}
            <div>
              <label className={lbl}>Fecha</label>
              <input type="date" className={inputCls} value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className={lbl}>
                Expediente
                <span className="ml-1.5 font-normal text-slate-400">(autocompleta los datos del paciente — no aparece en el impreso)</span>
              </label>
              <div className="flex gap-2">
                <input type="text" className={inputCls} value={form.expediente}
                  onChange={(e) => setForm({ ...form, expediente: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarPorExpediente(); } }}
                  placeholder="Ej. 1234567" />
                <button type="button" onClick={buscarPorExpediente}
                  disabled={buscandoExp || !form.expediente.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex-shrink-0">
                  <Search size={14} />
                  {buscandoExp ? "Buscando..." : "Buscar"}
                </button>
              </div>
            </div>

            {/* Resultado de la búsqueda por expediente */}
            {(pacienteEncontrado || busquedaExpInfo) && (
              <div className="md:col-span-3">
                {pacienteEncontrado ? (
                  <div className="flex items-start gap-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                      <User2 size={16} className="text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400">
                        <CheckCircle2 size={13} /> Paciente encontrado — datos autocompletados
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                        {nombreCompleto(pacienteEncontrado)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Exp. <span className="font-mono">{pacienteEncontrado.expediente}</span>
                        {calcularEdad(pacienteEncontrado.fechaNacimiento) !== null && <> · {calcularEdad(pacienteEncontrado.fechaNacimiento)} años</>}
                        {pacienteEncontrado.servicioActual && <> · {pacienteEncontrado.servicioActual}</>}
                        {pacienteEncontrado.camaActual && <> · Cama {pacienteEncontrado.camaActual}</>}
                      </p>
                    </div>
                    <button type="button"
                      onClick={() => { setPacienteEncontrado(null); setBusquedaExpInfo(null); }}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0"
                      aria-label="Quitar">
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>{busquedaExpInfo}</span>
                  </div>
                )}
              </div>
            )}

            {/* Fila 2: Nombre paciente (full) */}
            <div className="md:col-span-3">
              <label className={lbl}>1. Nombre del paciente *</label>
              <input type="text" className={inputCls} value={form.nombrePaciente}
                onChange={(e) => setForm({ ...form, nombrePaciente: e.target.value })}
                placeholder="Ej. MARIA ESTHER MONTES MORALES" />
            </div>

            {/* Fila 3: Referido de + Establecimiento de referencia */}
            <div>
              <label className={lbl}>2. Referido de *</label>
              <input type="text" className={inputCls} value={form.referidoDe}
                onChange={(e) => setForm({ ...form, referidoDe: e.target.value })}
                placeholder="Ej. DEMANDA ESPONTANEA" />
            </div>
            <div className="md:col-span-2">
              <label className={lbl}>3. Establecimiento de referencia *</label>
              <div className="relative">
                <input
                  type="text"
                  className={`${inputCls} pr-9`}
                  value={form.establecimientoReferencia}
                  onFocus={() => setEstablecimientosOpen(true)}
                  onBlur={() => setTimeout(() => setEstablecimientosOpen(false), 120)}
                  onChange={(e) => {
                    setForm({ ...form, establecimientoReferencia: e.target.value });
                    setEstablecimientosOpen(true);
                  }}
                  placeholder="Seleccione o escriba un hospital"
                  required
                  autoComplete="off"
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setEstablecimientosOpen((open) => !open);
                  }}
                  className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Mostrar hospitales"
                >
                  <ChevronDown size={16} className={`transition-transform ${establecimientosOpen ? "rotate-180" : ""}`} />
                </button>

                {establecimientosOpen && (
                  <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
                    {establecimientosFiltrados.length > 0 ? (
                      establecimientosFiltrados.map((establecimiento) => (
                        <button
                          key={establecimiento}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setForm({ ...form, establecimientoReferencia: establecimiento });
                            setEstablecimientosOpen(false);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        >
                          {etiquetaEstablecimiento(establecimiento)}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                        Sin hospitales coincidentes
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Fila 4: Fecha cita + Especialidad + Médico */}
            <div>
              <label className={lbl}>4. Fecha y hora de la cita <span className="font-normal text-slate-400">(opcional)</span></label>
              <input type="datetime-local" className={inputCls} value={form.fechaHoraCita}
                onChange={(e) => setForm({ ...form, fechaHoraCita: e.target.value })} />
            </div>
            <div>
              <label className={lbl}>5. Especialidad *</label>
              <input type="text" className={inputCls} value={form.especialidad}
                onChange={(e) => setForm({ ...form, especialidad: e.target.value })}
                placeholder="Ej. CIRUGÍA GENERAL" />
            </div>
            <div>
              <label className={lbl}>6. Médico que refiere</label>
              <input type="text" className={inputCls} value={form.medicoRefiere}
                onChange={(e) => setForm({ ...form, medicoRefiere: e.target.value })} />
            </div>

            {/* Fila 5: Establecimiento + Teléfono */}
            <div className="md:col-span-2">
              <label className={lbl}>7. Establecimiento que refiere</label>
              <input type="text" className={inputCls} value={form.establecimientoQueRefiere}
                onChange={(e) => setForm({ ...form, establecimientoQueRefiere: e.target.value })} />
            </div>
            <div>
              <label className={lbl}>Teléfono del establecimiento</label>
              <input type="text" className={inputCls} value={form.telefonoEstablecimiento}
                onChange={(e) => setForm({ ...form, telefonoEstablecimiento: e.target.value })} />
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-3 px-5 md:px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <button onClick={resetForm} disabled={guardando}
            className="px-5 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50">
            Limpiar
          </button>
          <button onClick={guardar} disabled={guardando}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors shadow-sm">
            <Save size={16} />
            {guardando ? "Guardando..." : "Guardar referencia"}
          </button>
        </div>
      </div>
    </div>
  );
}
