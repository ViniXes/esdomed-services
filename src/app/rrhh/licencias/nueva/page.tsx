"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addDoc, collection, doc, getDoc, getDocs, query, Timestamp, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft, Search, AlertTriangle, Save, CheckCircle2, User2, ShieldAlert, Ban,
} from "lucide-react";
import type { DiagnosticoCIE, Empleado, Licencia } from "@/types";
import { toDate, formatFecha } from "@/lib/pacientes/helpers";
import { parseDateInput } from "@/lib/incapacidades/helpers";
import { CIE10Combobox } from "@/components/ui/CIE10Combobox";
import { CATEGORIAS, CATEGORIAS_ORDEN, metaCategoria, BOLSA_LABEL, unidadCategoria } from "@/lib/rrhh/catalogo";
import { evaluarLicencia, diasInclusivos } from "@/lib/rrhh/saldos";
import { OPCIONES_HORA, horasEntre, formatCantidad, formatHoras } from "@/lib/rrhh/formato";

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm";

function hoyInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function NuevaLicenciaPage() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const [codigoBusqueda, setCodigoBusqueda] = useState(() =>
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("empleado") ?? "")
      : "",
  );
  const [buscando, setBuscando] = useState(false);
  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [busquedaError, setBusquedaError] = useState<string | null>(null);
  const [licenciasEmpleado, setLicenciasEmpleado] = useState<Licencia[]>([]);

  const [categoria, setCategoria] = useState<typeof CATEGORIAS_ORDEN[number]>("enfermedad_comun");
  const [fechaInicial, setFechaInicial] = useState(hoyInput());
  const [fechaFinal, setFechaFinal] = useState(hoyInput());
  const [horaInicio, setHoraInicio] = useState("08:00");
  const [horaFin, setHoraFin] = useState("09:00");
  const [esProrroga, setEsProrroga] = useState(false);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoCIE>({ codigo: "", descripcion: "" });
  const [justificacion, setJustificacion] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscarEmpleado = async (codigoArg?: string) => {
    const code = (codigoArg ?? codigoBusqueda).trim().toUpperCase();
    if (!code) return;
    setBuscando(true);
    setBusquedaError(null);
    setEmpleado(null);
    setLicenciasEmpleado([]);
    try {
      const snap = await getDoc(doc(db, "empleados", code));
      if (!snap.exists()) {
        setBusquedaError("No se encontró ningún empleado con ese código. Verifica el padrón.");
      } else {
        const data = snap.data();
        setEmpleado({ id: snap.id, ...data, fechaIngreso: toDate(data.fechaIngreso) } as Empleado);
        const lsnap = await getDocs(query(collection(db, "licencias"), where("empleadoCodigo", "==", code)));
        setLicenciasEmpleado(lsnap.docs.map((d) => {
          const ld = d.data();
          return { id: d.id, ...ld, fechaInicial: toDate(ld.fechaInicial) ?? new Date(), fechaFinal: toDate(ld.fechaFinal) ?? new Date() } as Licencia;
        }));
      }
    } catch (e) {
      setBusquedaError(`Error al buscar: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setBuscando(false);
    }
  };

  // Si llegó con ?empleado=, busca automáticamente al montar.
  useEffect(() => {
    if (codigoBusqueda.trim()) buscarEmpleado(codigoBusqueda.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = metaCategoria(categoria);
  const unidad = unidadCategoria(categoria);
  const esPorHoras = unidad === "horas";

  // Cantidad en la unidad de la bolsa (días u horas).
  const cantidad = esPorHoras
    ? horasEntre(horaInicio, horaFin)
    : diasInclusivos(parseDateInput(fechaInicial), parseDateInput(fechaFinal));

  const periodoInvalido = esPorHoras
    ? cantidad <= 0
    : parseDateInput(fechaFinal) < parseDateInput(fechaInicial);

  const evaluacion = useMemo(() => {
    if (!empleado) return null;
    return evaluarLicencia({
      categoria,
      fecha: parseDateInput(fechaInicial),
      cantidad,
      empleado,
      licenciasExistentes: licenciasEmpleado,
    });
  }, [empleado, categoria, fechaInicial, cantidad, licenciasEmpleado]);

  const guardar = async () => {
    if (!user || !profile || !empleado || !evaluacion) return;
    setError(null);

    if (periodoInvalido) {
      setError(esPorHoras ? "La hora final debe ser posterior a la inicial." : "La fecha final no puede ser anterior a la inicial.");
      return;
    }
    if (evaluacion.cantidad <= 0) { setError("El periodo debe ser mayor a cero."); return; }
    if (meta.medica && !diagnostico.descripcion.trim()) { setError("El diagnóstico es obligatorio para licencias médicas."); return; }
    if (evaluacion.bloqueado) { setError(evaluacion.mensaje ?? "No se puede registrar: supera el tope legal."); return; }
    if (evaluacion.requiereJustificacion && !justificacion.trim()) { setError("Indica una justificación: esta licencia excede el tope con goce."); return; }

    setGuardando(true);
    try {
      const dInicial = parseDateInput(fechaInicial);
      // Hora-base: la licencia es de un solo día (fechaFinal = fechaInicial).
      const dFinal = esPorHoras ? dInicial : parseDateInput(fechaFinal);
      const data: Record<string, unknown> = {
        empleadoCodigo: empleado.codigo,
        empleadoNombre: empleado.nombre,
        categoria,
        bolsa: meta.bolsa,
        unidad,
        tipoDocumento: meta.tipoDocumento,
        esProrroga,
        conGoce: meta.conGocePorDefecto,
        fechaInicial: Timestamp.fromDate(dInicial),
        fechaFinal: Timestamp.fromDate(dFinal),
        cantidad: evaluacion.cantidad,
        anio: evaluacion.anio,
        cantidadConGoce: evaluacion.cantidadConGoce,
        cantidadSinGoce: evaluacion.cantidadSinGoce,
        excedeTope: evaluacion.excede,
        creadoEn: Timestamp.now(),
        registradoPorId: user.uid,
        registradoPorNombre: profile.nombre,
      };
      if (esPorHoras) { data.horaInicio = horaInicio; data.horaFin = horaFin; }
      if (empleado.cargo) data.empleadoCargo = empleado.cargo;
      if (empleado.departamento) data.empleadoDepartamento = empleado.departamento;
      if (empleado.genero) data.empleadoGenero = empleado.genero;
      if (meta.medica && diagnostico.descripcion.trim()) data.diagnostico = diagnostico;
      if (evaluacion.excede && justificacion.trim()) data.justificacion = justificacion.trim();
      if (observaciones.trim()) data.observaciones = observaciones.trim();

      await addDoc(collection(db, "licencias"), data);
      router.push(`/rrhh/empleados/${encodeURIComponent(empleado.codigo)}`);
    } catch (e) {
      setError(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
      setGuardando(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/rrhh/licencias" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors" aria-label="Volver">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Registrar licencia</h1>
      </div>

      {/* 1. Empleado */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 font-heading">
          <User2 size={15} className="text-slate-400" /> 1. Empleado
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={codigoBusqueda}
            onChange={(e) => setCodigoBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscarEmpleado()}
            placeholder="Código de plaza (ej. A-002)"
            className={inputCls}
            disabled={buscando}
          />
          <button
            onClick={() => buscarEmpleado()}
            disabled={buscando || !codigoBusqueda.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex-shrink-0"
          >
            <Search size={14} /> {buscando ? "Buscando…" : "Buscar"}
          </button>
        </div>
        {busquedaError && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 mt-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /><span>{busquedaError}</span>
          </div>
        )}
        {empleado && (
          <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3 mt-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400 mb-1">
              <CheckCircle2 size={13} /> Empleado encontrado
            </p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{empleado.nombre}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="font-mono">{empleado.codigo}</span>
              {empleado.cargo && <> · {empleado.cargo}</>}
              {empleado.departamento && <> · {empleado.departamento}</>}
            </p>
          </div>
        )}
      </section>

      {/* 2. Datos de la licencia */}
      {empleado && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">2. Datos de la licencia</h3>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Tipo de licencia</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as typeof categoria)}
              className={inputCls}
            >
              {CATEGORIAS_ORDEN.map((c) => (
                <option key={c} value={c}>{CATEGORIAS[c].label}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Bolsa: {BOLSA_LABEL[meta.bolsa]} · Documento: {meta.tipoDocumento === "resolucion" ? "Resolución" : "Acuerdo"}
              {esPorHoras ? " · se mide en horas" : ""}
              {!meta.conGocePorDefecto && " · sin goce"}
            </p>
          </div>

          {esPorHoras ? (
            // Permisos por hora: un día, hora inicio → fin (intervalos de 30 min).
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Fecha</label>
                <input type="date" value={fechaInicial} onChange={(e) => setFechaInicial(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Desde (hora)</label>
                  <select value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className={inputCls}>
                    {OPCIONES_HORA.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Hasta (hora)</label>
                  <select value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className={inputCls}>
                    {OPCIONES_HORA.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
              <p className={`text-xs ${periodoInvalido ? "text-red-500" : "text-slate-500"}`}>
                {periodoInvalido
                  ? "La hora final debe ser posterior a la inicial."
                  : `Duración: ${formatHoras(cantidad)} (intervalos de 30 min).`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Desde</label>
                <input type="date" value={fechaInicial} onChange={(e) => setFechaInicial(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Hasta</label>
                <input type="date" value={fechaFinal} onChange={(e) => setFechaFinal(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          {meta.medica && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Diagnóstico (CIE-10)</label>
              <CIE10Combobox value={diagnostico} onChange={setDiagnostico} />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={esProrroga} onChange={(e) => setEsProrroga(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            Es prórroga de una licencia anterior
          </label>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Observaciones (opcional)</label>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} className={inputCls} />
          </div>
        </section>
      )}

      {/* 3. Evaluación de saldo */}
      {empleado && evaluacion && !periodoInvalido && evaluacion.cantidad > 0 && (
        <EvaluacionPanel ev={evaluacion} justificacion={justificacion} setJustificacion={setJustificacion} />
      )}

      {/* Footer */}
      {empleado && (
        <div>
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /><span>{error}</span>
            </div>
          )}
          <button
            onClick={guardar}
            disabled={guardando || !!evaluacion?.bloqueado || periodoInvalido}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={15} /> {guardando ? "Guardando…" : "Registrar licencia"}
          </button>
        </div>
      )}
    </div>
  );
}

function EvaluacionPanel({
  ev, justificacion, setJustificacion,
}: {
  ev: NonNullable<ReturnType<typeof evaluarLicencia>>;
  justificacion: string;
  setJustificacion: (v: string) => void;
}) {
  const u = ev.unidad;
  const restante = Math.max(0, ev.tope - ev.usadoPrevio - ev.cantidad);
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">3. Saldo</h3>

      {!ev.descuentaSaldo ? (
        <p className="text-sm text-slate-500">
          Esta licencia ({formatCantidad(ev.cantidad, u)}) no descuenta de las bolsas de saldo.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Mini label={u === "horas" ? "Horas" : "Días"} value={formatCantidad(ev.cantidad, u)} />
            <Mini label="Tope" value={formatCantidad(ev.tope, u)} />
            <Mini label="Usado" value={formatCantidad(ev.usadoPrevio, u)} />
            <Mini label="Quedará" value={formatCantidad(restante, u)} accent={restante === 0} />
          </div>

          {ev.bloqueado ? (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2.5 text-sm text-red-700 dark:text-red-400">
              <Ban size={15} className="mt-0.5 flex-shrink-0" />
              <span>{ev.mensaje}</span>
            </div>
          ) : ev.excede ? (
            <>
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
                <ShieldAlert size={15} className="mt-0.5 flex-shrink-0" />
                <span>
                  {ev.mensaje} <strong>{formatCantidad(ev.cantidadConGoce, u)} con goce</strong> · <strong>{formatCantidad(ev.cantidadSinGoce, u)} sin goce</strong>.
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Justificación <span className="text-red-500">*</span></label>
                <textarea
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                  rows={2}
                  placeholder="Motivo por el que se registra sobre el tope…"
                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={15} /> Dentro del tope. {ev.cantidadConGoce > 0 && `${formatCantidad(ev.cantidadConGoce, u)} con goce`}{ev.cantidadSinGoce > 0 && ` · ${formatCantidad(ev.cantidadSinGoce, u)} sin goce`}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg py-2 px-1">
      <p className={`text-sm font-bold tabular-nums ${accent ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-slate-100"}`}>{value}</p>
      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
    </div>
  );
}
