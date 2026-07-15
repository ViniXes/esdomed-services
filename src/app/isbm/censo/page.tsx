"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, Lock, LockOpen, Pencil, Stethoscope, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import { CargosDelDia } from "@/components/isbm/CargosDelDia";
import {
  abrirDia,
  actualizarServiciosCenso,
  cerrarDia,
  censosDeFecha,
  hoyISO,
  listarMedicos,
  listarServicios,
  reabrirDia,
  registrarVisita,
  type MedicoSistema,
} from "@/lib/isbm/api";
import {
  estadoCenso,
  formatoDolares,
  type CensoDiarioConRelaciones,
  type EstadoCenso,
  type ServicioHospitalarioIsbm,
} from "@/lib/isbm/types";

const ESTADO_UI: Record<EstadoCenso, { label: string; clases: string; punto: string }> = {
  VERDE:    { label: "Cerrado · visitas completas", clases: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900", punto: "bg-emerald-500" },
  AMARILLO: { label: "Abierto · falta visita PM",   clases: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900",             punto: "bg-amber-500" },
  AZUL:     { label: "Abierto · sin visitas",       clases: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900",                   punto: "bg-blue-500" },
  ROJO:     { label: "Cerrado · sin visitas completas", clases: "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900",                     punto: "bg-red-500" },
};

const horaAhora = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const formatoHora = (h: string | null) => (h ? h.slice(0, 5) : null);

export default function CensoDiarioPage() {
  const { profile } = useAuth();
  const [fecha, setFecha] = useState(hoyISO());
  const [censos, setCensos] = useState<CensoDiarioConRelaciones[]>([]);
  const [servicios, setServicios] = useState<ServicioHospitalarioIsbm[]>([]);
  const [medicos, setMedicos] = useState<MedicoSistema[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Solo se guarda el id; el censo del modal se deriva de la última recarga.
  const [detalleId, setDetalleId] = useState<number | null>(null);

  const cargar = useCallback(async (f: string, abrir: boolean) => {
    if (!profile) return;
    setCargando(true);
    setError("");
    try {
      // Apertura idempotente: crea el censo del día para los ingresos activos
      // que falten (nunca duplica: UNIQUE ingreso+fecha en la base). Solo
      // para fechas presentes/pasadas — el futuro no se abre.
      if (abrir && f <= hoyISO()) {
        await abrirDia(f, { uid: profile.uid, nombre: profile.nombre });
      }
      const [lista, cats, meds] = await Promise.all([
        censosDeFecha(f),
        listarServicios(),
        listarMedicos(),
      ]);
      setCensos(lista);
      setServicios(cats);
      setMedicos(meds);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [profile]);

  // Diferido con setTimeout para no llamar setState de forma síncrona dentro
  // del efecto (regla react-hooks/set-state-in-effect).
  useEffect(() => {
    const t = setTimeout(() => cargar(fecha, true), 0);
    return () => clearTimeout(t);
  }, [fecha, cargar]);

  const resumen = useMemo(() => {
    const cerrados = censos.filter((c) => c.dia_cerrado);
    return {
      total: censos.length,
      cerrados: cerrados.length,
      cobrable: cerrados.reduce((s, c) => s + (c.total_cobrable_dia ?? 0), 0),
    };
  }, [censos]);

  const detalle = useMemo(
    () => (detalleId == null ? null : censos.find((c) => c.id === detalleId) ?? null),
    [censos, detalleId]
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Convenios ISBM</p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Censo diario</h1>
        </div>
        <div className="w-44">
          <DateField value={fecha} onChange={(v) => v && setFecha(v)} ariaLabel="Fecha del censo" />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
      )}

      {!cargando && censos.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
            {resumen.total} paciente{resumen.total !== 1 ? "s" : ""} en censo
          </span>
          <span className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
            {resumen.cerrados} día{resumen.cerrados !== 1 ? "s" : ""} cerrado{resumen.cerrados !== 1 ? "s" : ""}
          </span>
          {resumen.cerrados > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-medium">
              Cobrable del día: {formatoDolares(resumen.cobrable)}
            </span>
          )}
        </div>
      )}

      <section className="space-y-2.5">
        {cargando ? (
          <div className="p-10 flex justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : censos.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
            <CalendarCheck size={26} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              No hay pacientes ISBM en el censo de esta fecha.
              {fecha > hoyISO() && " (Las fechas futuras no se abren.)"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Los pacientes entran al censo al afiliarlos con un ingreso activo.
            </p>
          </div>
        ) : (
          censos.map((c) => {
            const est = ESTADO_UI[estadoCenso(c)];
            return (
              <button
                key={c.id}
                onClick={() => setDetalleId(c.id)}
                className="w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3.5 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-sm transition-all"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${est.punto}`} />
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {c.ingreso.paciente_nombre}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Exp. <span className="font-mono">{c.expediente}</span>
                      {" · "}{c.servicio_facturacion.nombre}
                      {c.cama ? ` · cama ${c.cama}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <VisitaChip turno="AM" registrada={c.visita_am_registrada} hora={formatoHora(c.visita_am_hora)} />
                    <VisitaChip turno="PM" registrada={c.visita_pm_registrada} hora={formatoHora(c.visita_pm_hora)} />
                  </div>
                  <span className={`text-[11px] font-medium border rounded-full px-2.5 py-1 ${est.clases}`}>
                    {c.dia_cerrado ? formatoDolares(c.total_cobrable_dia) + " · " : ""}{est.label}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </section>

      {detalle && profile && (
        <ModalCenso
          key={detalle.id}
          censo={detalle}
          servicios={servicios}
          medicos={medicos}
          actor={{ uid: profile.uid, nombre: profile.nombre }}
          onCerrar={() => setDetalleId(null)}
          onCambio={() => cargar(fecha, false)}
        />
      )}
    </div>
  );
}

function VisitaChip({ turno, registrada, hora }: { turno: string; registrada: boolean; hora: string | null }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${
        registrada
          ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900"
          : "text-slate-400 bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700"
      }`}
    >
      <Stethoscope size={11} />
      {turno}{registrada && hora ? ` ${hora}` : ""}
    </span>
  );
}

// ── Modal de detalle: visitas, servicios y cierre ────────────────────────────

function ModalCenso({
  censo, servicios, medicos, actor, onCerrar, onCambio,
}: {
  censo: CensoDiarioConRelaciones;
  servicios: ServicioHospitalarioIsbm[];
  medicos: MedicoSistema[];
  actor: { uid: string; nombre: string };
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [editandoServicios, setEditandoServicios] = useState(false);

  // Formulario de visita (AM o PM según cuál falte / elija)
  const [visitaTurno, setVisitaTurno] = useState<"am" | "pm" | null>(null);
  const [visitaMedico, setVisitaMedico] = useState(censo.medico_tratante_nombre ?? "");
  const [visitaHora, setVisitaHora] = useState(horaAhora());

  // Formulario de servicios
  const [fisicoId, setFisicoId] = useState(censo.servicio_fisico_id);
  const [facturacionId, setFacturacionId] = useState(censo.servicio_facturacion_id);
  const [motivo, setMotivo] = useState(censo.motivo_diferencia_servicio ?? "");
  const [cama, setCama] = useState(censo.cama ?? "");
  const [medicoTratante, setMedicoTratante] = useState(censo.medico_tratante_nombre ?? "");

  const ejecutar = async (accion: () => Promise<void>) => {
    setOcupado(true);
    setError("");
    try {
      await accion();
      onCambio();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const guardarVisita = () => {
    if (!visitaTurno) return;
    if (!visitaMedico.trim()) { setError("Indica el médico que pasó la visita."); return; }
    ejecutar(async () => {
      await registrarVisita(censo.id, visitaTurno, visitaMedico.trim(), visitaHora);
      setVisitaTurno(null);
    });
  };

  const guardarServicios = () => {
    if (fisicoId !== facturacionId && !motivo.trim()) {
      setError("El motivo es obligatorio cuando el servicio físico y el de facturación difieren.");
      return;
    }
    ejecutar(async () => {
      await actualizarServiciosCenso(censo.id, {
        servicio_fisico_id: fisicoId,
        servicio_facturacion_id: facturacionId,
        motivo_diferencia_servicio: fisicoId !== facturacionId ? motivo.trim() : null,
        cama: cama.trim() || null,
        medico_tratante_nombre: medicoTratante.trim() || null,
      });
      setEditandoServicios(false);
    });
  };

  const confirmarCierre = () => {
    const faltanVisitas = !censo.visita_am_registrada || !censo.visita_pm_registrada;
    const aviso = faltanVisitas
      ? "Faltan visitas por registrar: el día quedará cerrado EN ROJO.\n\n"
      : "";
    if (!window.confirm(`${aviso}Cerrar el día genera el cargo día-cama (${censo.servicio_facturacion.nombre} — ${formatoDolares(censo.servicio_facturacion.precio_dia_cama)}) y congela los totales. ¿Continuar?`)) return;
    ejecutar(() => cerrarDia(censo.id, actor.nombre));
  };

  const confirmarReapertura = () => {
    if (!window.confirm("Reabrir el día permite corregir visitas y cargos; al volver a cerrarlo se recalcula todo. ¿Continuar?")) return;
    ejecutar(() => reabrirDia(censo.id, actor.nombre));
  };

  const est = ESTADO_UI[estadoCenso(censo)];

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-3 md:p-6 backdrop-blur-sm">
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-5 md:p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
              {censo.ingreso.paciente_nombre}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Exp. <span className="font-mono">{censo.expediente}</span> · censo del {censo.fecha}
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <span className={`inline-block text-[11px] font-medium border rounded-full px-2.5 py-1 mb-4 ${est.clases}`}>
          {est.label}
        </span>

        <div className="grid md:grid-cols-2 gap-3 items-start mb-3">
        {/* ── Columna izquierda: servicios del día ── */}
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Servicios del día</p>
            {!censo.dia_cerrado && !editandoServicios && (
              <button
                onClick={() => setEditandoServicios(true)}
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Pencil size={12} /> Editar
              </button>
            )}
          </div>

          {!editandoServicios ? (
            <div className="text-sm text-slate-700 dark:text-slate-300 space-y-0.5">
              <p><span className="text-slate-400">Físico:</span> {censo.servicio_fisico.nombre}</p>
              <p>
                <span className="text-slate-400">Facturación:</span> {censo.servicio_facturacion.nombre}
                {" "}<span className="text-slate-400">({formatoDolares(censo.servicio_facturacion.precio_dia_cama)}/día)</span>
              </p>
              {censo.motivo_diferencia_servicio && (
                <p className="text-xs text-amber-700 dark:text-amber-300">Motivo de diferencia: {censo.motivo_diferencia_servicio}</p>
              )}
              <p>
                <span className="text-slate-400">Cama:</span> {censo.cama ?? "—"}
                {" · "}<span className="text-slate-400">Médico tratante:</span> {censo.medico_tratante_nombre ?? "—"}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <SelectServicio label="Servicio físico" valor={fisicoId} servicios={servicios} onChange={setFisicoId} />
                <SelectServicio label="Facturación" valor={facturacionId} servicios={servicios} onChange={setFacturacionId} />
              </div>
              {fisicoId !== facturacionId && (
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo de la diferencia (obligatorio)"
                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={cama}
                  onChange={(e) => setCama(e.target.value)}
                  placeholder="Cama"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <SelectMedico
                  valor={medicoTratante}
                  medicos={medicos}
                  placeholder="Médico tratante"
                  onChange={setMedicoTratante}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditandoServicios(false)}
                  className="flex-1 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarServicios}
                  disabled={ocupado}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
                >
                  Guardar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Columna derecha: visitas AM / PM ── */}
        <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(["am", "pm"] as const).map((turno) => {
            const registrada = turno === "am" ? censo.visita_am_registrada : censo.visita_pm_registrada;
            const medico = turno === "am" ? censo.visita_am_medico : censo.visita_pm_medico;
            const hora = formatoHora(turno === "am" ? censo.visita_am_hora : censo.visita_pm_hora);
            return (
              <div key={turno} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                  Visita {turno.toUpperCase()}
                </p>
                {registrada ? (
                  <div className="text-sm text-slate-700 dark:text-slate-300">
                    <p className="font-medium text-emerald-700 dark:text-emerald-300">Registrada · {hora}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{medico}</p>
                  </div>
                ) : censo.dia_cerrado ? (
                  <p className="text-xs text-slate-400">Sin registrar (día cerrado)</p>
                ) : (
                  <button
                    onClick={() => { setVisitaTurno(turno); setVisitaHora(horaAhora()); setError(""); }}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Registrar visita
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {visitaTurno && (
          <div className="border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/40 rounded-xl p-3 mb-3 space-y-2">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
              Registrar visita {visitaTurno.toUpperCase()}
            </p>
            <SelectMedico
              valor={visitaMedico}
              medicos={medicos}
              placeholder="Médico que pasó visita"
              autoFocus
              onChange={setVisitaMedico}
            />
            <input
              type="time"
              value={visitaHora}
              onChange={(e) => setVisitaHora(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setVisitaTurno(null)}
                className="flex-1 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={guardarVisita}
                disabled={ocupado}
                className="flex-1 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
              >
                Guardar visita
              </button>
            </div>
          </div>
        )}
        </div>
        </div>

        {/* ── Cargos del día ── */}
        <CargosDelDia censo={censo} actor={actor} />

        {/* ── Totales (día cerrado) ── */}
        {censo.dia_cerrado && (
          <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 rounded-xl p-3 mb-3 text-sm">
            <p className="text-emerald-800 dark:text-emerald-200 font-semibold">
              Cobrable del día: {formatoDolares(censo.total_cobrable_dia)}
            </p>
            <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">
              Total servicio: {formatoDolares(censo.total_servicio_dia)} · cerrado por {censo.cerrado_por_nombre}
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 mb-3">{error}</p>
        )}

        {/* ── Cierre / reapertura ── */}
        {!censo.dia_cerrado ? (
          <button
            onClick={confirmarCierre}
            disabled={ocupado || editandoServicios || visitaTurno !== null}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg disabled:opacity-50 transition-colors"
          >
            <Lock size={14} /> {ocupado ? "Cerrando…" : "Cerrar día"}
          </button>
        ) : (
          <button
            onClick={confirmarReapertura}
            disabled={ocupado}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50 transition-colors"
          >
            <LockOpen size={14} /> {ocupado ? "Reabriendo…" : "Reabrir día"}
          </button>
        )}
      </div>
    </div>
  );
}

// Combobox de médico con buscador, alimentado por TODOS los médicos del
// sistema (generales y de UCI/UCIN). Se escribe para filtrar y se elige de la
// lista; al perder el foco sin elegir, vuelve al valor confirmado. El dato es
// sensible: de los médicos tratantes saldrán los honorarios en el futuro.
function SelectMedico({
  valor, medicos, placeholder, autoFocus, onChange,
}: {
  valor: string;
  medicos: MedicoSistema[];
  placeholder: string;
  autoFocus?: boolean;
  onChange: (v: string) => void;
}) {
  const [texto, setTexto] = useState(valor);
  const [abierto, setAbierto] = useState(false);

  const etiqueta = (m: MedicoSistema) =>
    m.tipoMedico ? `${m.nombre} · ${m.tipoMedico.replace("_", "/").toUpperCase()}` : m.nombre;

  const term = texto.trim().toLowerCase();
  const filtrados = (term && texto !== valor
    ? medicos.filter((m) => m.nombre.toLowerCase().includes(term))
    : medicos
  ).slice(0, 30);

  const elegir = (nombre: string) => {
    onChange(nombre);
    setTexto(nombre);
    setAbierto(false);
  };

  return (
    <div className="relative">
      <input
        value={texto}
        autoFocus={autoFocus}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          if (e.target.value === "") onChange("");
        }}
        onBlur={() => {
          // Deja pasar el click de una opción (onMouseDown) antes de cerrar.
          setTimeout(() => {
            setAbierto(false);
            setTexto((t) => (medicos.some((m) => m.nombre === t) ? t : valor));
          }, 150);
        }}
        placeholder={placeholder}
        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-20 mt-1 left-0 right-0 max-h-44 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1">
          {filtrados.map((m) => (
            <button
              key={m.nombre}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); elegir(m.nombre); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                m.nombre === valor
                  ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {etiqueta(m)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectServicio({
  label, valor, servicios, onChange,
}: {
  label: string;
  valor: number;
  servicios: ServicioHospitalarioIsbm[];
  onChange: (id: number) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{label}</label>
      <select
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {servicios.map((s) => (
          <option key={s.id} value={s.id}>{s.nombre}</option>
        ))}
      </select>
    </div>
  );
}
