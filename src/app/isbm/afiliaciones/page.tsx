"use client";

import { IsbmStats, IsbmTableHeading, IsbmEmptyState, IsbmFilter, isbmStyles as ui } from "../_components/IsbmUi";

import { AfiliarPacienteWizard } from "../_components/AfiliarPacienteWizard";
import { IsbmPageHeading } from "../_components/IsbmPageHeading";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, UserPlus, Pencil, LogOut, X, Users, BedDouble, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import {
  actualizarAfiliacion,
  listarAfiliaciones,
  listarIngresosActivos,
  registrarEgresoIngreso,
  hoyISO,
} from "@/lib/isbm/api";
import {
  TIPO_BENEFICIARIO_LABEL,
  type AfiliacionIsbm,
  type IngresoIsbm,
  type TipoBeneficiarioIsbm,
} from "@/lib/isbm/types";

const CONDICIONES_EGRESO = [
  { valor: "MEJORADO", label: "Mejorado / alta" },
  { valor: "FALLECIDO", label: "Fallecido" },
  { valor: "TRASLADO", label: "Traslado" },
  { valor: "ALTA_VOLUNTARIA", label: "Alta voluntaria" },
] as const;

export default function AfiliacionesPage() {
  const { profile } = useAuth();
  const [afiliaciones, setAfiliaciones] = useState<AfiliacionIsbm[]>([]);
  const [ingresosActivos, setIngresosActivos] = useState<IngresoIsbm[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [modalAfiliar, setModalAfiliar] = useState(false);
  const [editando, setEditando] = useState<AfiliacionIsbm | null>(null);
  const [egresando, setEgresando] = useState<IngresoIsbm | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [afs, ings] = await Promise.all([listarAfiliaciones(), listarIngresosActivos()]);
      setAfiliaciones(afs);
      setIngresosActivos(ings);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  // Diferido con setTimeout para no llamar setState de forma síncrona dentro
  // del efecto (regla react-hooks/set-state-in-effect).
  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  const ingresoPorExpediente = useMemo(
    () => new Map(ingresosActivos.map((i) => [i.expediente, i])),
    [ingresosActivos]
  );

  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return afiliaciones;
    return afiliaciones.filter(
      (a) =>
        a.expediente.toLowerCase().includes(t) ||
        a.paciente_nombre.toLowerCase().includes(t) ||
        (a.numero_afiliacion_isbm ?? "").toLowerCase().includes(t)
    );
  }, [afiliaciones, busqueda]);

  return (
    <div className={`${ui.page} p-4 md:p-6 max-w-6xl mx-auto space-y-6`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <IsbmPageHeading title="Afiliaciones" description="Pacientes del convenio, cobertura e ingresos activos." icon={UserPlus} />
        <button
          onClick={() => setModalAfiliar(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <UserPlus size={15} /> Afiliar paciente
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
      )}

      <IsbmStats items={[
        { label: "Afiliados", value: cargando ? "—" : afiliaciones.length, detail: "Pacientes registrados en el convenio", icon: Users },
        { label: "Ingresos activos", value: cargando ? "—" : ingresosActivos.length, detail: "Con atención hospitalaria en curso", icon: BedDouble, tone: "success" },
        { label: "N° de afiliación pendiente", value: cargando ? "—" : afiliaciones.filter(a => !a.numero_afiliacion_isbm).length, detail: "Registros por completar", icon: ClipboardList, tone: "warning" },
      ]} />

      <div className={ui.toolbar}><div className={ui.search}><IsbmFilter label="Buscar afiliación"><div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          aria-label="Buscar por expediente, nombre o número de afiliación"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por expediente, nombre o N° de afiliación…"
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div></IsbmFilter></div></div>

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <IsbmTableHeading title="Pacientes afiliados" count={cargando ? undefined : filtradas.length}>Cobertura e ingresos del convenio</IsbmTableHeading>
        {cargando ? (
          <div className="p-10 flex justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtradas.length === 0 ? (
          <IsbmEmptyState icon={Users} title={afiliaciones.length === 0 ? "Aún no hay afiliaciones" : "Sin coincidencias"}>
            {afiliaciones.length === 0
              ? "Aún no hay pacientes afiliados. Usa “Afiliar paciente” para empezar."
              : "Prueba con otro nombre, expediente o número de afiliación."}
          </IsbmEmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-2.5 font-medium">Expediente</th>
                  <th className="px-4 py-2.5 font-medium">Paciente</th>
                  <th className="px-4 py-2.5 font-medium">N° afiliación</th>
                  <th className="px-4 py-2.5 font-medium">Beneficiario</th>
                  <th className="px-4 py-2.5 font-medium">Cobertura</th>
                  <th className="px-4 py-2.5 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((a) => {
                  const ingreso = ingresoPorExpediente.get(a.expediente);
                  return (
                    <tr key={a.expediente} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{a.expediente}</td>
                      <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{a.paciente_nombre}</td>
                      <td className="px-4 py-3">
                        {a.numero_afiliacion_isbm ?? <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">Pendiente</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {a.tipo_beneficiario ? TIPO_BENEFICIARIO_LABEL[a.tipo_beneficiario] : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {ingreso ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-full px-2 py-0.5">
                            Ingresado · {ingreso.servicio_actual ?? "sin servicio"}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Sin ingreso activo</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setEditando(a)}
                            title="Editar afiliación" aria-label={`Editar afiliación de ${a.paciente_nombre}`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          {ingreso && (
                            <button
                              onClick={() => setEgresando(ingreso)}
                              title="Registrar egreso de la cobertura" aria-label={`Registrar egreso de ${a.paciente_nombre}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors"
                            >
                              <LogOut size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalAfiliar && profile && (
        <AfiliarPacienteWizard
          actor={{ uid: profile.uid, nombre: profile.nombre }}
          yaAfiliados={new Set(ingresosActivos.map((i) => i.id))}
          onCerrar={() => setModalAfiliar(false)}
          onListo={() => { setModalAfiliar(false); cargar(); }}
        />
      )}

      {editando && profile && (
        <ModalEditar
          afiliacion={editando}
          actorNombre={profile.nombre}
          onCerrar={() => setEditando(null)}
          onListo={() => { setEditando(null); cargar(); }}
        />
      )}

      {egresando && (
        <ModalEgreso
          ingreso={egresando}
          onCerrar={() => setEgresando(null)}
          onListo={() => { setEgresando(null); cargar(); }}
        />
      )}
    </div>
  );
}

// ── Modal: editar afiliación ─────────────────────────────────────────────────

function ModalEditar({
  afiliacion, actorNombre, onCerrar, onListo,
}: {
  afiliacion: AfiliacionIsbm;
  actorNombre: string;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [numero, setNumero] = useState(afiliacion.numero_afiliacion_isbm ?? "");
  const [tipo, setTipo] = useState(afiliacion.tipo_beneficiario ?? "");
  const [observaciones, setObservaciones] = useState(afiliacion.observaciones ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      await actualizarAfiliacion(
        afiliacion.expediente,
        {
          numero_afiliacion_isbm: numero.trim() || null,
          tipo_beneficiario: (tipo || null) as AfiliacionIsbm["tipo_beneficiario"],
          observaciones: observaciones.trim() || null,
        },
        actorNombre
      );
      onListo();
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
    }
  };

  return (
    <Modal titulo={`Editar afiliación — ${afiliacion.paciente_nombre}`} onCerrar={onCerrar} maxW="max-w-3xl">
      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo label="N° de afiliación ISBM">
            <input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Campo>
          <Campo label="Tipo de beneficiario">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Sin especificar —</option>
              {(Object.keys(TIPO_BENEFICIARIO_LABEL) as TipoBeneficiarioIsbm[]).map((t) => (
                <option key={t} value={t}>{TIPO_BENEFICIARIO_LABEL[t]}</option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo label="Observaciones">
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={2}
            className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </Campo>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCerrar}
            className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal: registrar egreso de la cobertura ──────────────────────────────────

function ModalEgreso({
  ingreso, onCerrar, onListo,
}: {
  ingreso: IngresoIsbm;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [fecha, setFecha] = useState(hoyISO());
  const [condicion, setCondicion] = useState<(typeof CONDICIONES_EGRESO)[number]["valor"]>("MEJORADO");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    if (!fecha) { setError("Indica la fecha de egreso."); return; }
    setGuardando(true);
    setError("");
    try {
      await registrarEgresoIngreso(ingreso.id, fecha, condicion);
      onListo();
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
    }
  };

  return (
    <Modal titulo={`Egreso de cobertura — ${ingreso.paciente_nombre}`} onCerrar={onCerrar} maxW="max-w-2xl">
      <p className="text-xs text-slate-500 mb-3">
        Cierra la cobertura ISBM de este ingreso: deja de aparecer en el censo diario.
        Los censos y cargos ya registrados se conservan para la facturación.
      </p>
      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo label="Fecha de egreso">
            <DateField value={fecha} onChange={setFecha} ariaLabel="Fecha de egreso" />
          </Campo>
          <Campo label="Condición de egreso">
            <select
              value={condicion}
              onChange={(e) => setCondicion(e.target.value as typeof condicion)}
              className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CONDICIONES_EGRESO.map((c) => (
                <option key={c.valor} value={c.valor}>{c.label}</option>
              ))}
            </select>
          </Campo>
        </div>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCerrar}
            className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg disabled:opacity-50 transition-colors"
          >
            {guardando ? "Registrando…" : "Registrar egreso"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Piezas compartidas ───────────────────────────────────────────────────────

function Modal({
  titulo, onCerrar, children, maxW = "max-w-2xl",
}: { titulo: string; onCerrar: () => void; children: React.ReactNode; maxW?: string }) {
  // Default max-w-2xl; cada modal pide más ancho cuando su contenido lo aprovecha.
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-3 md:p-6 backdrop-blur-sm">
      <div data-isbm-dialog className={`w-full ${maxW} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-5 md:p-6 max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">{titulo}</h2>
          <button
            onClick={onCerrar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
