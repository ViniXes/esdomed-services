"use client";

// Sección de cargos integrada en el detalle del censo ISBM: lista los cargos del
// censo, permite capturar nuevos (wizard: buscar arancel → detalles) y
// anularlos lógicamente mientras el día esté abierto.

import { useCallback, useEffect, useState, useRef } from "react";
import { Ban, CheckCircle2, ChevronRight, Hourglass, Pencil, Plus, Search, X } from "lucide-react";
import {
  anularCargo,
  buscarAranceles,
  cargosDeCenso,
  confirmarCargoObservado,
  crearCargo,
  editarCargo,
  marcarCobrable,
  marcarNoCobrable,
  marcarNoRealizado,
  cobrarPorDecisionIsbm,
  quitarCobroPorDecisionIsbm,
  obtenerAutorizacionDeCargo,
  type NuevoCargoInput,
} from "@/lib/isbm/api";
import {
  MOTIVO_NO_FACTURABLE_LABEL,
  MOTIVOS_NO_COBRABLE_MANUAL,
  esNoCobrableManual,
  type MotivoNoCobrableManual,
  RUBRO_LABEL,
  ESPECIALIDADES_INTERCONSULTA,
  formatoDolares,
  type ArancelIsbm,
  type AutorizacionIsbm,
  type CargoConArancel,
  type CensoDiarioConRelaciones,
  type RubroArancelIsbm,
} from "@/lib/isbm/types";

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

export type ResumenCargos = { cantidad: number; observados: number; servicio: number; cobrable: number };

export function CargosDelDia({
  censo, actor, revision, onActividad, onResumen,
}: {
  censo: CensoDiarioConRelaciones;
  actor: { uid: string; nombre: string };
  revision: number;
  onActividad: (activo: boolean) => void;
  onResumen: (resumen: ResumenCargos | null) => void;
}) {
  const [cargos, setCargos] = useState<CargoConArancel[] | null>(null);
  const [error, setError] = useState("");
  const [capturando, setCapturando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  // Solo el id: el cargo del detalle se deriva de la última recarga.
  const [detalleId, setDetalleId] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      setError("");
      onResumen(null);
      const lista = await cargosDeCenso(censo.id);
      setCargos(lista);
      const vivos = lista.filter(c => !c.anulado);
      onResumen({ cantidad: vivos.length, observados: vivos.filter(c => c.pendiente_revision).length, servicio: vivos.reduce((s,c) => s+c.costo_total,0), cobrable: vivos.reduce((s,c) => s+c.monto_facturable,0) });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [censo.id, onResumen]);

  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar, revision]);

  // Selección para marcar varios cargos no cobrables desde la lista.
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [motivoLote, setMotivoLote] = useState<MotivoNoCobrableManual>("INCLUIDO_EN_DIA_CAMA");
  const [justificacionLote, setJustificacionLote] = useState("");
  const [marcandoLote, setMarcandoLote] = useState(false);

  useEffect(() => { onActividad(capturando || detalleId !== null || seleccion.length > 0); return () => onActividad(false); }, [capturando, detalleId, seleccion.length, onActividad]);

  const detalle = detalleId == null ? null : (cargos ?? []).find((c) => c.id === detalleId) ?? null;

  // Se marca a mano lo que hoy se cobra: no el día-cama, ni lo anulado, ni lo
  // que ya es no cobrable por convenio o por otra marca manual.
  const esMarcable = (c: CargoConArancel) =>
    !censo.dia_cerrado && !c.anulado && c.arancel.rubro !== "DIA_CAMA" &&
    !c.arancel.es_no_cobrable && !esNoCobrableManual(c.motivo_no_facturable);
  const marcables = (cargos ?? []).filter(esMarcable);

  const aplicarNoCobrableLote = async () => {
    setMarcandoLote(true);
    setError("");
    try {
      await marcarNoCobrable(seleccion, motivoLote, justificacionLote, actor.nombre);
      setSeleccion([]);
      setJustificacionLote("");
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMarcandoLote(false);
    }
  };

  const vivos = (cargos ?? []).filter((c) => !c.anulado);
  const totalServicio = vivos.reduce((s, c) => s + c.costo_total, 0);
  const totalFacturable = vivos.reduce((s, c) => s + c.monto_facturable, 0);
  // Lo que el hospital absorbe: no cobrable por convenio, tope, 48 h, decisión ISBM…
  const totalNoCobrable = Math.round((totalServicio - totalFacturable) * 100) / 100;

  if (capturando || detalle) return <div>      {capturando && (
        <NuevoCargoFormulario
          censo={censo}
          actor={actor}
          onCerrar={() => setCapturando(false)}
          onListo={async (avs) => { setCapturando(false); setAvisos(avs); await cargar(); }}
        />
      )}

      {detalle && (
        <DetalleCargoFormulario
          key={`${detalle.id}-${detalle.modificado_en ?? ""}`}
          cargo={detalle}
          diaCerrado={censo.dia_cerrado}
          actor={actor}
          onCerrar={() => setDetalleId(null)}
          onCambio={cargar}
        />
      )}</div>;

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Cargos del día {cargos && cargos.length > 0 ? `(${vivos.length})` : ""}
        </p>
        {!censo.dia_cerrado && (
          <button
            onClick={() => { setAvisos([]); setCapturando(true); }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            <Plus size={13} /> Agregar cargo
          </button>
        )}
      </div>

      {avisos.length > 0 && (
        <div className="mb-2 space-y-1">
          {avisos.map((a, i) => (
            <p key={i} className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg px-2.5 py-1.5">{a}</p>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-2.5 py-1.5 mb-2">{error}</p>
      )}

      {!cargos ? (
        <div className="p-4 flex justify-center">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : cargos.length === 0 ? (
        <p className="text-xs text-slate-400 py-1">
          Sin cargos capturados. El día-cama se genera automáticamente al cerrar el día.
        </p>
      ) : (
        <>
          {/* Dos columnas fijas por cargo: lo que valdría el servicio y lo que
              se factura (≠ cuando es no cobrable, excede tope, 48 h…). */}
          <div className="flex items-center gap-2 pb-1">
            {marcables.length > 0 && (
              <span className="w-4 flex-shrink-0 flex justify-center">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos los cargos que se pueden marcar no cobrables"
                  checked={seleccion.length === marcables.length}
                  ref={(el) => { if (el) el.indeterminate = seleccion.length > 0 && seleccion.length < marcables.length; }}
                  onChange={(e) => setSeleccion(e.target.checked ? marcables.map((c) => c.id) : [])}
                  className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                />
              </span>
            )}
            <div className="flex-1 flex items-center gap-3 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <span className="flex-1">Cargo</span>
              <span className="w-20 text-right">Servicio</span>
              <span className="w-20 text-right">Facturable</span>
              <span className="w-[13px]" aria-hidden />
            </div>
          </div>

          {seleccion.length > 0 && (
            <div className="mb-2 border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/40 rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mr-1">
                  Marcar {seleccion.length === 1 ? "1 cargo" : `${seleccion.length} cargos`} como no cobrable:
                </p>
                {MOTIVOS_NO_COBRABLE_MANUAL.map((m) => (
                  <label
                    key={m}
                    className={`inline-flex items-center gap-1.5 cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      motivoLote === m
                        ? "border-amber-400 bg-white text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 font-semibold"
                        : "border-amber-200 text-amber-700 hover:bg-white dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950"
                    }`}
                  >
                    <input type="radio" name="motivo-lote" value={m} checked={motivoLote === m} onChange={() => setMotivoLote(m)} className="sr-only" />
                    {MOTIVO_NO_FACTURABLE_LABEL[m]}
                  </label>
                ))}
              </div>
              {motivoLote === "DECISION_ISBM" && (
                <input
                  autoFocus
                  value={justificacionLote}
                  onChange={(e) => setJustificacionLote(e.target.value)}
                  aria-label="Comentario de por qué el ISBM no lo cobra"
                  placeholder="Por qué no se cobra (mínimo 10 caracteres)"
                  className={inputCls}
                />
              )}
              <div className="flex justify-end gap-2">
                <button
                  disabled={marcandoLote}
                  onClick={() => { setSeleccion([]); setJustificacionLote(""); }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  disabled={marcandoLote || (motivoLote === "DECISION_ISBM" && justificacionLote.trim().length < 10)}
                  onClick={aplicarNoCobrableLote}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {marcandoLote ? "Guardando…" : "Marcar no cobrable"}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            {cargos.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
              {marcables.length > 0 && (
                <span className="w-4 flex-shrink-0 flex justify-center">
                  {esMarcable(c) && (
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${c.arancel.descripcion}`}
                      checked={seleccion.includes(c.id)}
                      onChange={(e) => setSeleccion((prev) => e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id))}
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                    />
                  )}
                </span>
              )}
              <button
                onClick={() => setDetalleId(c.id)}
                disabled={marcandoLote}
                className={`flex-1 min-w-0 text-left flex items-center gap-3 rounded-lg px-2.5 py-2 border transition-colors hover:border-blue-300 dark:hover:border-blue-700 ${
                  c.no_realizado
                    ? "border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    : c.anulado
                      ? "border-slate-200 dark:border-slate-700 opacity-50"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium text-slate-800 dark:text-slate-200 ${c.anulado && !c.no_realizado ? "line-through" : ""}`}>
                    {c.arancel.descripcion}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {RUBRO_LABEL[c.arancel.rubro]} · {Number(c.cantidad)} × {formatoDolares(c.precio_unitario)}
                  </p>
                  {c.no_realizado && (
                    <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="font-semibold uppercase tracking-wide text-[10px] text-slate-500 dark:text-slate-400">No realizado</span>
                      {c.justificacion_no_realizado && ` — ${c.justificacion_no_realizado}`}
                    </p>
                  )}
                  {!c.anulado && (c.pendiente_revision || c.motivo_no_facturable) && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.pendiente_revision && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-900 rounded-full px-2 py-0.5">
                          <Hourglass size={10} /> En observación
                        </span>
                      )}
                      {c.motivo_no_facturable && (
                        <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-full px-2 py-0.5">
                          {MOTIVO_NO_FACTURABLE_LABEL[c.motivo_no_facturable]}
                        </span>
                      )}
                      {c.motivo_no_facturable === "DECISION_ISBM" && c.justificacion_no_facturable && (
                        <span className="text-[10px] text-amber-700 dark:text-amber-300 self-center">{c.justificacion_no_facturable}</span>
                      )}
                    </div>
                  )}
                  {!c.anulado && c.cobrar_por_decision_isbm && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-full px-2 py-0.5">
                        Cobro por decisión ISBM
                      </span>
                      {c.justificacion_cobro && (
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-300 self-center">{c.justificacion_cobro}</span>
                      )}
                    </div>
                  )}
                </div>
                {/* El no realizado no suma en ninguna columna */}
                <span className="w-20 text-right text-xs tabular-nums text-slate-600 dark:text-slate-400">
                  {c.no_realizado ? "—" : formatoDolares(c.costo_total)}
                </span>
                <span className="w-20 text-right text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {c.no_realizado ? "—" : formatoDolares(c.monto_facturable)}
                </span>
                <ChevronRight size={13} className="text-slate-300 flex-shrink-0" />
              </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs pt-2 text-slate-500">
            <span>Total servicio: <strong className="tabular-nums">{formatoDolares(totalServicio)}</strong></span>
            <span className="text-amber-700 dark:text-amber-300">
              No cobrable: <strong className="tabular-nums">{formatoDolares(totalNoCobrable)}</strong>
            </span>
            <span className="text-emerald-700 dark:text-emerald-300">
              Facturable: <strong className="tabular-nums">{formatoDolares(totalFacturable)}</strong>
            </span>
          </div>
        </>
      )}


    </div>
  );
}

// ── Wizard: buscar arancel → detalles ────────────────────────────────────────

function NuevoCargoFormulario({
  censo, actor, onCerrar, onListo,
}: {
  censo: CensoDiarioConRelaciones;
  actor: { uid: string; nombre: string };
  onCerrar: () => void;
  onListo: (avisos: string[]) => Promise<void>;
}) {
  const enviando = useRef(false);
  const [rubro, setRubro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ArancelIsbm[] | null>(null);
  const [arancel, setArancel] = useState<ArancelIsbm | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [cantidad, setCantidad] = useState("1");
  const [precio, setPrecio] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [tipoCirugia, setTipoCirugia] = useState("");
  const [docTipo, setDocTipo] = useState("");
  const [docRef, setDocRef] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [enObservacion, setEnObservacion] = useState(false);

  // Búsqueda con debounce sobre el catálogo vigente
  useEffect(() => {
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const lista = await buscarAranceles(busqueda, rubro || undefined);
        if (vigente) { setResultados(lista); setError(""); }
      } catch (e) {
        if (vigente) setError((e as Error).message);
      }
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [busqueda, rubro]);

  const esInterconsulta = arancel?.es_interconsulta ?? false;
  const esQuirurgico = arancel?.rubro === "QUIRURGICO";
  const esFisioterapia = arancel?.seccion_consolidado === "FISIOTERAPIA";

  const guardar = async () => {
    if (!arancel || enviando.current) return;
    const cant = Number(cantidad);
    if (!cant || cant <= 0) { setError("La cantidad debe ser mayor que cero."); return; }
    if (esInterconsulta && !especialidad) {
      setError("Indica la especialidad de la interconsulta (aplica la regla de 48 h).");
      return;
    }
    enviando.current = true;
    setGuardando(true);
    setError("");
    try {
      const input: NuevoCargoInput = {
        cantidad: cant,
        precioUnitario: precio.trim() ? Number(precio) : undefined,
        comentarios,
        tipoCirugia: (tipoCirugia || undefined) as NuevoCargoInput["tipoCirugia"],
        especialidadInterconsulta: esInterconsulta ? especialidad : undefined,
        tipoDocumentoRespaldo: docTipo || undefined,
        documentoRespaldoRef: docRef || undefined,
        pendienteRevision: enObservacion,
      };
      const avisos = await crearCargo(censo, arancel, input, actor);
      await onListo(avisos);
    } catch (e) {
      setError((e as Error).message);
      enviando.current = false;
      setGuardando(false);
    }
  };

  return (
    <fieldset disabled={guardando} className="space-y-4 min-w-0">
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">Nuevo cargo</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {censo.ingreso.paciente_nombre} · {censo.fecha}
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Volver a cargos"
          >
            <span className="inline-flex items-center gap-1 text-xs"><X size={14} /> Cancelar</span>
          </button>
        </div>

        {error && !arancel && <p role="alert" className="text-sm text-red-600 mb-3">{error}</p>}
        <p className="text-xs text-blue-600 dark:text-blue-400 mb-4">{arancel ? "Paso 2 de 2 · Completar detalles" : "Paso 1 de 2 · Elegir arancel"}</p>
        {!arancel ? (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-[180px_1fr] gap-2">
              <select aria-label="Rubro del arancel" value={rubro} onChange={(e) => { setRubro(e.target.value); setResultados(null); }} className={inputCls}>
                <option value="">Todos los rubros</option>
                {(Object.keys(RUBRO_LABEL) as RubroArancelIsbm[]).map((r) => (
                  <option key={r} value={r}>{RUBRO_LABEL[r]}</option>
                ))}
              </select>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); setResultados(null); }}
                  aria-label="Buscar arancel" placeholder="Buscar en el catálogo de aranceles…"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </div>
            <div className="max-h-[58vh] overflow-y-auto grid xl:grid-cols-2 gap-1 content-start">
              {!resultados && (
                <div className="p-6 flex justify-center">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {resultados && resultados.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">Sin aranceles que coincidan.</p>
              )}
              {(resultados ?? []).map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setArancel(a); setPrecio(""); setError(""); }}
                  className="w-full text-left border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/40 transition-colors flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 dark:text-slate-100">{a.descripcion}</p>
                    <p className="text-[10px] text-slate-400">
                      {a.codigo} · {RUBRO_LABEL[a.rubro]}
                      {a.requiere_autorizacion ? " · requiere autorización" : ""}
                      {a.es_no_cobrable && (
                        <span className="font-bold text-amber-600 dark:text-amber-400"> · NO COBRABLE</span>
                      )}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                    {formatoDolares(a.precio_hnes)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{arancel.descripcion}</p>
                <p className="text-xs text-slate-500">
                  {arancel.codigo} · {RUBRO_LABEL[arancel.rubro]} · {formatoDolares(arancel.precio_hnes)}
                </p>
              </div>
              <button onClick={() => setArancel(null)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0">
                Cambiar
              </button>
            </div>

            {arancel.es_no_cobrable && (
              <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
                Este ítem es <strong>no cobrable</strong> según el convenio: se captura para
                trazabilidad pero queda en $0 (lo absorbe el hospital).
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Cantidad">
                <input type="number" min="0.5" step="0.5" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={inputCls} />
              </Campo>
              <Campo label={`Precio unitario (default ${formatoDolares(arancel.precio_hnes)})`}>
                <input type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder={String(arancel.precio_hnes)} className={inputCls} />
              </Campo>
            </div>

            {esInterconsulta && (
              <Campo label="Especialidad de la interconsulta (regla 48 h)">
                <select value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} className={inputCls}>
                  <option value="">— Seleccionar —</option>
                  {ESPECIALIDADES_INTERCONSULTA.map((s) => (
                    <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
                  ))}
                </select>
              </Campo>
            )}

            {esQuirurgico && (
              <Campo label="Tipo de cirugía">
                <select value={tipoCirugia} onChange={(e) => setTipoCirugia(e.target.value)} className={inputCls}>
                  <option value="">— Sin especificar —</option>
                  <option value="AMBULATORIA">Ambulatoria</option>
                  <option value="EMERGENCIA">Emergencia</option>
                  <option value="ELECTIVA">Electiva</option>
                </select>
              </Campo>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Documento de respaldo (opcional)">
                <select value={docTipo} onChange={(e) => setDocTipo(e.target.value)} className={inputCls}>
                  <option value="">— Ninguno —</option>
                  <option value="RECETA_MEDICA">Receta médica</option>
                  <option value="FORMULARIO_QUIRURGICO">Formulario quirúrgico</option>
                  <option value="RESULTADO_LAB">Resultado de laboratorio</option>
                  <option value="IMAGEN_RX">Imagen / RX</option>
                  <option value="OTRO">Otro</option>
                </select>
              </Campo>
              <Campo label="Referencia física (ampo, folio…)">
                <input value={docRef} onChange={(e) => setDocRef(e.target.value)} className={inputCls} />
              </Campo>
            </div>

            <Campo label={esFisioterapia ? "Realizado por (sale en la sección Fisioterapia del consolidado)" : "Comentarios (opcional)"}>
              <textarea value={comentarios} onChange={(e) => setComentarios(e.target.value)} rows={2} className={inputCls} />
            </Campo>

            <label className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300 border border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/30 rounded-xl px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={enObservacion}
                onChange={(e) => setEnObservacion(e.target.checked)}
                className="accent-orange-600 mt-0.5"
              />
              <span>
                <span className="font-medium inline-flex items-center gap-1.5"><Hourglass size={13} /> Dejar en observación</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Para servicios que se confirman días después (ej. cultivos). Se confirma desde el detalle del cargo, aunque el día ya esté cerrado.
                </span>
              </span>
            </label>

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
                {guardando ? "Guardando…" : "Capturar cargo"}
              </button>
            </div>
          </div>
        )}
      </div>
    </fieldset>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

// ── Detalle de un cargo: ver todo + editar / cobrable / anular ──────────────

const DOC_LABEL: Record<string, string> = {
  RECETA_MEDICA: "Receta médica",
  FORMULARIO_QUIRURGICO: "Formulario quirúrgico",
  RESULTADO_LAB: "Resultado de laboratorio",
  IMAGEN_RX: "Imagen / RX",
  OTRO: "Otro",
};

const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" }) : "—";

function DetalleCargoFormulario({
  cargo, diaCerrado, actor, onCerrar, onCambio,
}: {
  cargo: CargoConArancel;
  diaCerrado: boolean;
  actor: { uid: string; nombre: string };
  onCerrar: () => void;
  onCambio: () => Promise<void>;
}) {
  const enviando = useRef(false);
  const [modo, setModo] = useState<"ver" | "editar" | "nocobrable" | "norealizado" | "cobrar">("ver");
  const [aut, setAut] = useState<AutorizacionIsbm | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const [cantidad, setCantidad] = useState(String(Number(cargo.cantidad)));
  const [precio, setPrecio] = useState(String(cargo.precio_unitario));
  const [comentarios, setComentarios] = useState(cargo.comentarios ?? "");
  const [docTipo, setDocTipo] = useState(cargo.tipo_documento_respaldo ?? "");
  const [docRef, setDocRef] = useState(cargo.documento_respaldo_ref ?? "");
  const [enObservacion, setEnObservacion] = useState(cargo.pendiente_revision);
  const [justificacion, setJustificacion] = useState("");
  const [motivoNoCobrable, setMotivoNoCobrable] = useState<MotivoNoCobrableManual>("INCLUIDO_EN_DIA_CAMA");

  // Diferido: regla react-hooks/set-state-in-effect.
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        setAut(await obtenerAutorizacionDeCargo(cargo.id));
      } catch {
        setAut(null);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [cargo.id]);

  const editable = !diaCerrado && !cargo.anulado;
  const esOverride = esNoCobrableManual(cargo.motivo_no_facturable);

  const ejecutar = async (fn: () => Promise<void>) => {
    if (enviando.current) return;
    enviando.current = true;
    setOcupado(true);
    setError("");
    try {
      await fn();
      await onCambio();
      setModo("ver");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      enviando.current = false;
      setOcupado(false);
    }
  };

  const anular = () => {
    if (!window.confirm(`¿Anular "${cargo.arancel.descripcion}"? Queda en $0 pero visible para auditoría.`)) return;
    ejecutar(() => anularCargo(cargo.id, actor.nombre));
  };

  const quitarCobroIsbm = () => {
    if (!window.confirm("¿Quitar el cobro por decisión ISBM? El examen vuelve a la regla del convenio (incluido en el día cama si corresponde).")) return;
    ejecutar(() => quitarCobroPorDecisionIsbm(cargo, actor.nombre));
  };

  const volverCobrable = () => {
    if (!window.confirm("¿Volver este cargo cobrable? Las reglas automáticas del convenio se reaplican al cerrar el día.")) return;
    ejecutar(() => marcarCobrable(cargo, actor.nombre));
  };

  return (
    <fieldset disabled={ocupado} className="space-y-4 min-w-0">
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
              {cargo.arancel.descripcion}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {cargo.arancel.codigo} · {RUBRO_LABEL[cargo.arancel.rubro]} · {cargo.fecha}
              {cargo.no_realizado
                ? <span className="text-slate-600 dark:text-slate-300 font-semibold"> · NO REALIZADO</span>
                : cargo.anulado && <span className="text-red-500 font-semibold"> · ANULADO</span>}
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Volver a cargos"
          >
            <span className="inline-flex items-center gap-1 text-xs"><X size={14} /> Cancelar</span>
          </button>
        </div>

        {cargo.pendiente_revision && !cargo.anulado && modo === "ver" && (
          <div className="mb-3 border border-orange-200 dark:border-orange-900 bg-orange-50/60 dark:bg-orange-950/40 rounded-xl p-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px]">
              <p className="text-xs font-semibold text-orange-800 dark:text-orange-200 inline-flex items-center gap-1.5">
                <Hourglass size={13} /> En observación — pendiente de confirmar que se realizó
              </p>
              <p className="text-xs text-orange-700/80 dark:text-orange-300/80 mt-0.5">
                {diaCerrado
                  ? "Confirmar no cambia montos (se permite con el día cerrado). Si NO se realizó: reabre el día y anúlalo."
                  : "Si NO se realizó, anúlalo con el botón de abajo."}
              </p>
            </div>
            <button
              onClick={() => {
                if (!window.confirm("¿Confirmar que este servicio SÍ se realizó?")) return;
                ejecutar(() => confirmarCargoObservado(cargo.id, actor.nombre));
              }}
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-500 rounded-lg disabled:opacity-50 transition-colors flex-shrink-0"
            >
              <CheckCircle2 size={14} /> Confirmar realizado
            </button>
          </div>
        )}

        {modo === "editar" ? (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Campo label="Cantidad">
                <input type="number" min="0.5" step="0.5" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={inputCls} />
              </Campo>
              <Campo label="Precio unitario">
                <input type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} className={inputCls} />
              </Campo>
              <Campo label="Documento de respaldo">
                <select value={docTipo} onChange={(e) => setDocTipo(e.target.value)} className={inputCls}>
                  <option value="">— Ninguno —</option>
                  {Object.entries(DOC_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Campo>
              <Campo label="Referencia física (ampo, folio…)">
                <input value={docRef} onChange={(e) => setDocRef(e.target.value)} className={inputCls} />
              </Campo>
            </div>
            <Campo label="Comentarios">
              <textarea value={comentarios} onChange={(e) => setComentarios(e.target.value)} rows={2} className={inputCls} />
            </Campo>
            <label className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300 border border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/30 rounded-xl px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={enObservacion}
                onChange={(e) => setEnObservacion(e.target.checked)}
                className="accent-orange-600 mt-0.5"
              />
              <span>
                <span className="font-medium inline-flex items-center gap-1.5"><Hourglass size={13} /> En observación</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Pendiente de confirmar que se realizó (ej. cultivos). Se confirma después desde este detalle.
                </span>
              </span>
            </label>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3 items-start">
            <div className="space-y-3">
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Montos</p>
                <div className="text-sm text-slate-700 dark:text-slate-300 space-y-0.5">
                  <p><span className="text-slate-400">Cantidad:</span> {Number(cargo.cantidad)} × {formatoDolares(cargo.precio_unitario)}</p>
                  <p><span className="text-slate-400">Total servicio:</span> {formatoDolares(cargo.costo_total)}</p>
                  <p className="font-semibold">
                    <span className="text-slate-400 font-normal">Facturable:</span> {formatoDolares(cargo.monto_facturable)}
                  </p>
                  {cargo.cobrar_por_decision_isbm && !cargo.anulado ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      Se cobra por decisión ISBM aunque va incluido en el día cama
                      {cargo.justificacion_cobro && ` — ${cargo.justificacion_cobro}`}
                    </p>
                  ) : cargo.no_realizado ? (
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      No realizado: no suma en Total servicio ni en Facturable
                      {cargo.justificacion_no_realizado && ` — ${cargo.justificacion_no_realizado}`}
                    </p>
                  ) : cargo.motivo_no_facturable && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {MOTIVO_NO_FACTURABLE_LABEL[cargo.motivo_no_facturable]}
                      {cargo.justificacion_no_facturable && ` — ${cargo.justificacion_no_facturable}`}
                    </p>
                  )}
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Documentación y comentarios</p>
                <div className="text-sm text-slate-700 dark:text-slate-300 space-y-0.5">
                  <p>
                    <span className="text-slate-400">Respaldo:</span>{" "}
                    {cargo.tipo_documento_respaldo ? DOC_LABEL[cargo.tipo_documento_respaldo] ?? cargo.tipo_documento_respaldo : "—"}
                    {cargo.documento_respaldo_ref && ` · ${cargo.documento_respaldo_ref}`}
                  </p>
                  <p className="whitespace-pre-wrap">
                    <span className="text-slate-400">Comentarios:</span> {cargo.comentarios || "—"}
                  </p>
                  {cargo.especialidad_interconsulta && (
                    <p><span className="text-slate-400">Interconsulta:</span> {cargo.especialidad_interconsulta.replaceAll("_", " ")}</p>
                  )}
                  {cargo.tipo_cirugia && (
                    <p><span className="text-slate-400">Cirugía:</span> {cargo.tipo_cirugia}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Trazabilidad</p>
                <div className="text-sm text-slate-700 dark:text-slate-300 space-y-0.5">
                  <p><span className="text-slate-400">Capturado por:</span> {cargo.capturado_por_nombre}</p>
                  <p><span className="text-slate-400">El:</span> {fechaHora(cargo.capturado_en)}</p>
                  {cargo.modificado_por_nombre && (
                    <p className="text-xs text-slate-500">
                      Última modificación: {cargo.modificado_por_nombre} · {fechaHora(cargo.modificado_en)}
                    </p>
                  )}
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Autorización</p>
                {aut === undefined ? (
                  <p className="text-xs text-slate-400">Consultando…</p>
                ) : aut === null ? (
                  <p className="text-xs text-slate-400">Este cargo no requiere autorización.</p>
                ) : (
                  <div className="text-sm text-slate-700 dark:text-slate-300 space-y-0.5">
                    <p>
                      <span
                        className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${
                          aut.estado === "APROBADA"
                            ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900"
                            : aut.estado === "RECHAZADA"
                              ? "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900"
                              : "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900"
                        }`}
                      >
                        {aut.estado === "PENDIENTE" ? `Pendiente · nivel ${aut.nivel_requerido === "JEFE" ? "Jefe" : "Supervisor"}` : aut.estado === "APROBADA" ? "Aprobada" : "Rechazada"}
                      </span>
                    </p>
                    {aut.resuelto_por_nombre && (
                      <p className="text-xs text-slate-500">
                        {aut.resuelto_por_nombre}{aut.comentario ? ` — ${aut.comentario}` : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {modo === "nocobrable" && (
          <div className="mt-3 border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/40 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
              Marcar como NO cobrable (decisión manual — queda en auditoría)
            </p>
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_NO_COBRABLE_MANUAL.map((m) => (
                <label
                  key={m}
                  className={`inline-flex items-center gap-1.5 cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    motivoNoCobrable === m
                      ? "border-amber-400 bg-white text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 font-semibold"
                      : "border-amber-200 text-amber-700 hover:bg-white dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950"
                  }`}
                >
                  <input type="radio" name="motivo-no-cobrable" value={m} checked={motivoNoCobrable === m} onChange={() => setMotivoNoCobrable(m)} className="sr-only" />
                  {MOTIVO_NO_FACTURABLE_LABEL[m]}
                </label>
              ))}
            </div>
            {motivoNoCobrable === "DECISION_ISBM" && (
              <input
                autoFocus
                value={justificacion}
                onChange={(e) => setJustificacion(e.target.value)}
                aria-label="Comentario de por qué el ISBM no lo cobra" placeholder="Por qué no se cobra (mínimo 10 caracteres)"
                className={inputCls}
              />
            )}
          </div>
        )}

        {modo === "cobrar" && (
          <div className="mt-3 border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/40 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
              Cobrar por decisión ISBM — se factura completo ({formatoDolares(cargo.costo_total)}) aunque la regla lo incluya en el día cama
            </p>
            <input
              autoFocus
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              aria-label="Justificación de por qué el ISBM decidió cobrarlo" placeholder="Por qué se cobra (mínimo 10 caracteres)"
              className={inputCls}
            />
          </div>
        )}

        {modo === "norealizado" && (
          <div className="mt-3 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Registrar como NO realizado — queda como anotación y no suma en Total servicio ni en Facturable
            </p>
            <input
              autoFocus
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              aria-label="Justificación de por qué no se realizó" placeholder="Por qué no se realizó (mínimo 10 caracteres)"
              className={inputCls}
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 mt-3">{error}</p>
        )}

        {/* Acciones */}
        <div className="flex flex-wrap justify-end gap-2 pt-4">
          {modo !== "ver" ? (
            <>
              <button
                onClick={() => { setModo("ver"); setError(""); }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              {modo === "editar" ? (
                <button
                  onClick={() =>
                    ejecutar(() =>
                      editarCargo(cargo, {
                        cantidad: Number(cantidad),
                        precioUnitario: Number(precio),
                        comentarios,
                        tipoDocumentoRespaldo: docTipo || undefined,
                        documentoRespaldoRef: docRef || undefined,
                        pendienteRevision: enObservacion,
                      }, actor.nombre)
                    )
                  }
                  disabled={ocupado}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {ocupado ? "Guardando…" : "Guardar cambios"}
                </button>
              ) : modo === "cobrar" ? (
                <button
                  onClick={() => ejecutar(() => cobrarPorDecisionIsbm(cargo, justificacion, actor.nombre))}
                  disabled={ocupado || justificacion.trim().length < 10}
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {ocupado ? "Guardando…" : "Confirmar cobro"}
                </button>
              ) : modo === "norealizado" ? (
                <button
                  onClick={() => ejecutar(() => marcarNoRealizado(cargo.id, justificacion, actor.nombre))}
                  disabled={ocupado || justificacion.trim().length < 10}
                  className="px-4 py-2 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {ocupado ? "Guardando…" : "Confirmar no realizado"}
                </button>
              ) : (
                <button
                  onClick={() => ejecutar(() => marcarNoCobrable([cargo.id], motivoNoCobrable, justificacion, actor.nombre))}
                  disabled={ocupado || (motivoNoCobrable === "DECISION_ISBM" && justificacion.trim().length < 10)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {ocupado ? "Guardando…" : "Confirmar no cobrable"}
                </button>
              )}
            </>
          ) : editable ? (
            <>
              <button
                onClick={() => { setModo("norealizado"); setJustificacion(""); setError(""); }}
                disabled={ocupado}
                className="px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                No se realizó
              </button>
              <button
                onClick={anular}
                disabled={ocupado}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 transition-colors"
              >
                <Ban size={14} /> Anular
              </button>
              {cargo.motivo_no_facturable === "EXAMEN_INCLUIDO_DIA_CAMA" && (
                <button
                  onClick={() => { setModo("cobrar"); setJustificacion(""); setError(""); }}
                  disabled={ocupado}
                  className="px-3.5 py-2 text-sm font-medium rounded-lg border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950 disabled:opacity-50 transition-colors"
                >
                  Cobrar por decisión ISBM
                </button>
              )}
              {cargo.cobrar_por_decision_isbm && (
                <button
                  onClick={quitarCobroIsbm}
                  disabled={ocupado}
                  className="px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  Quitar cobro ISBM
                </button>
              )}
              {esOverride ? (
                <button
                  onClick={volverCobrable}
                  disabled={ocupado}
                  className="px-3.5 py-2 text-sm font-medium rounded-lg border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950 disabled:opacity-50 transition-colors"
                >
                  Volver cobrable
                </button>
              ) : cargo.arancel.rubro !== "DIA_CAMA" && !cargo.arancel.es_no_cobrable && (
                <button
                  onClick={() => { setModo("nocobrable"); setMotivoNoCobrable("INCLUIDO_EN_DIA_CAMA"); setJustificacion(""); setError(""); }}
                  disabled={ocupado}
                  className="px-3.5 py-2 text-sm font-medium rounded-lg border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950 disabled:opacity-50 transition-colors"
                >
                  Marcar no cobrable
                </button>
              )}
              <button
                onClick={() => { setModo("editar"); setError(""); }}
                disabled={ocupado}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
              >
                <Pencil size={14} /> Editar
              </button>
            </>
          ) : cargo.anulado && !cargo.no_realizado && !diaCerrado ? (
            <>
              <p className="text-xs text-slate-400 self-center">Cargo anulado. Si en realidad no se realizó, déjalo como anotación:</p>
              <button
                onClick={() => { setModo("norealizado"); setJustificacion(""); setError(""); }}
                disabled={ocupado}
                className="px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                Cambiar a no realizado
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-400 self-center">
              {cargo.no_realizado
                ? "No realizado: queda como anotación, solo lectura."
                : cargo.anulado ? "Cargo anulado: solo lectura." : "Día cerrado: reábrelo para modificar cargos."}
            </p>
          )}
        </div>
      </div>
    </fieldset>
  );
}
