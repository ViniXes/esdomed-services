"use client";

// Sección "Cargos del día" del modal del censo ISBM: lista los cargos del
// censo, permite capturar nuevos (wizard: buscar arancel → detalles) y
// anularlos lógicamente mientras el día esté abierto.

import { useCallback, useEffect, useState } from "react";
import { Ban, Plus, Search, X } from "lucide-react";
import { buscarAranceles, anularCargo, cargosDeCenso, crearCargo, type NuevoCargoInput } from "@/lib/isbm/api";
import {
  MOTIVO_NO_FACTURABLE_LABEL,
  RUBRO_LABEL,
  RUBROS_INTERCONSULTA,
  ESPECIALIDADES_INTERCONSULTA,
  formatoDolares,
  type ArancelIsbm,
  type CargoConArancel,
  type CensoDiarioConRelaciones,
  type RubroArancelIsbm,
} from "@/lib/isbm/types";

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

export function CargosDelDia({
  censo, actor,
}: {
  censo: CensoDiarioConRelaciones;
  actor: { uid: string; nombre: string };
}) {
  const [cargos, setCargos] = useState<CargoConArancel[] | null>(null);
  const [error, setError] = useState("");
  const [capturando, setCapturando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    try {
      setCargos(await cargosDeCenso(censo.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [censo.id]);

  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  const anular = async (c: CargoConArancel) => {
    if (!window.confirm(`¿Anular el cargo "${c.arancel.descripcion}"? Queda en $0 pero visible para auditoría.`)) return;
    try {
      await anularCargo(c.id, actor.nombre);
      cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const vivos = (cargos ?? []).filter((c) => !c.anulado);
  const totalServicio = vivos.reduce((s, c) => s + c.costo_total, 0);
  const totalFacturable = vivos.reduce((s, c) => s + c.monto_facturable, 0);

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
          <div className="space-y-1">
            {cargos.map((c) => (
              <div
                key={c.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg px-2.5 py-2 border ${
                  c.anulado
                    ? "border-slate-200 dark:border-slate-700 opacity-50"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                }`}
              >
                <div className="flex-1 min-w-[160px]">
                  <p className={`text-xs font-medium text-slate-800 dark:text-slate-200 ${c.anulado ? "line-through" : ""}`}>
                    {c.arancel.descripcion}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {RUBRO_LABEL[c.arancel.rubro]} · {Number(c.cantidad)} × {formatoDolares(c.precio_unitario)}
                  </p>
                </div>
                {c.motivo_no_facturable && !c.anulado && (
                  <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-full px-2 py-0.5">
                    {MOTIVO_NO_FACTURABLE_LABEL[c.motivo_no_facturable]}
                  </span>
                )}
                <span className="text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatoDolares(c.monto_facturable)}
                </span>
                {!censo.dia_cerrado && !c.anulado && (
                  <button
                    onClick={() => anular(c)}
                    title="Anular cargo"
                    className="p-1 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                  >
                    <Ban size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-4 text-xs pt-2 text-slate-500">
            <span>Servicio: <strong className="tabular-nums">{formatoDolares(totalServicio)}</strong></span>
            <span className="text-emerald-700 dark:text-emerald-300">
              Facturable: <strong className="tabular-nums">{formatoDolares(totalFacturable)}</strong>
            </span>
          </div>
        </>
      )}

      {capturando && (
        <NuevoCargoModal
          censo={censo}
          actor={actor}
          onCerrar={() => setCapturando(false)}
          onListo={(avs) => { setCapturando(false); setAvisos(avs); cargar(); }}
        />
      )}
    </div>
  );
}

// ── Wizard: buscar arancel → detalles ────────────────────────────────────────

function NuevoCargoModal({
  censo, actor, onCerrar, onListo,
}: {
  censo: CensoDiarioConRelaciones;
  actor: { uid: string; nombre: string };
  onCerrar: () => void;
  onListo: (avisos: string[]) => void;
}) {
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

  // Búsqueda con debounce sobre el catálogo vigente
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        setResultados(await buscarAranceles(busqueda, rubro || undefined));
      } catch (e) {
        setError((e as Error).message);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda, rubro]);

  const esInterconsulta = arancel ? RUBROS_INTERCONSULTA.includes(arancel.rubro) : false;
  const esQuirurgico = arancel?.rubro === "QUIRURGICO";

  const guardar = async () => {
    if (!arancel) return;
    const cant = Number(cantidad);
    if (!cant || cant <= 0) { setError("La cantidad debe ser mayor que cero."); return; }
    if (esInterconsulta && !especialidad) {
      setError("Indica la especialidad de la interconsulta (aplica la regla de 48 h).");
      return;
    }
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
      };
      const avisos = await crearCargo(censo, arancel, input, actor);
      onListo(avisos);
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-3 md:p-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-5 md:p-6 max-h-[92vh] overflow-y-auto">
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
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {!arancel ? (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-[180px_1fr] gap-2">
              <select value={rubro} onChange={(e) => setRubro(e.target.value)} className={inputCls}>
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
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar en el catálogo de aranceles…"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </div>
            <div className="max-h-[55vh] overflow-y-auto space-y-1">
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

            <Campo label="Comentarios (opcional)">
              <textarea value={comentarios} onChange={(e) => setComentarios(e.target.value)} rows={2} className={inputCls} />
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
                {guardando ? "Guardando…" : "Capturar cargo"}
              </button>
            </div>
          </div>
        )}
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
