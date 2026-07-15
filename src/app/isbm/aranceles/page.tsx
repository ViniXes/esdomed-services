"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Pencil, Plus, RotateCcw, Search, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import {
  crearArancel,
  editarArancel,
  hoyISO,
  listarArancelesCatalogo,
  setArancelActivo,
  type DatosArancel,
} from "@/lib/isbm/api";
import {
  RUBRO_LABEL,
  formatoDolares,
  type ArancelIsbm,
  type RubroArancelIsbm,
} from "@/lib/isbm/types";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";
const filtroCls =
  "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function ArancelesPage() {
  const { profile } = useAuth();
  const [aranceles, setAranceles] = useState<ArancelIsbm[] | null>(null);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [rubro, setRubro] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<ArancelIsbm | "nuevo" | null>(null);

  // Solo el jefe ISBM (y admin) administran el catálogo; el resto consulta.
  const puedeEditar = profile?.role === "isbm_jefe" || profile?.role === "admin";

  const cargar = useCallback(async () => {
    setError("");
    try {
      setAranceles(await listarArancelesCatalogo(verInactivos));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [verInactivos]);

  // Diferido: regla react-hooks/set-state-in-effect.
  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  const filtrados = useMemo(() => {
    if (!aranceles) return [];
    const t = busqueda.trim().toLowerCase();
    return aranceles.filter((a) => {
      if (rubro && a.rubro !== rubro) return false;
      if (!t) return true;
      return a.descripcion.toLowerCase().includes(t) || a.codigo.toLowerCase().includes(t);
    });
  }, [aranceles, busqueda, rubro]);

  const toggleActivo = async (a: ArancelIsbm) => {
    const accion = a.activo ? "desactivar" : "reactivar";
    if (!window.confirm(`¿${accion === "desactivar" ? "Desactivar" : "Reactivar"} "${a.descripcion}"? ${a.activo ? "Dejará de aparecer al capturar cargos; los cargos históricos no se tocan." : "Volverá a estar disponible al capturar."}`)) return;
    try {
      await setArancelActivo(a.id, !a.activo);
      cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Convenios ISBM</p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Aranceles</h1>
        </div>
        {puedeEditar && (
          <button
            onClick={() => setEditando("nuevo")}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus size={15} /> Nuevo arancel
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={rubro} onChange={(e) => setRubro(e.target.value)} className={filtroCls}>
          <option value="">Todos los rubros</option>
          {(Object.keys(RUBRO_LABEL) as RubroArancelIsbm[]).map((r) => (
            <option key={r} value={r}>{RUBRO_LABEL[r]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 px-1 cursor-pointer">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} className="accent-blue-600" />
          Incluir inactivos
        </label>
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por descripción o código…"
            className={`${filtroCls} w-full pl-9`}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
      )}

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {!aranceles ? (
          <div className="p-10 flex justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtrados.length === 0 ? (
          <p className="p-8 text-sm text-slate-500 text-center">Sin aranceles que coincidan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-2.5 font-medium">Código</th>
                  <th className="px-4 py-2.5 font-medium">Descripción</th>
                  <th className="px-4 py-2.5 font-medium">Rubro</th>
                  <th className="px-4 py-2.5 font-medium text-right">Precio</th>
                  <th className="px-4 py-2.5 font-medium">Marcas</th>
                  {puedeEditar && <th className="px-4 py-2.5 font-medium text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((a) => (
                  <tr key={a.id} className={`border-b border-slate-50 dark:border-slate-800/60 last:border-0 ${!a.activo ? "opacity-45" : ""}`}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">{a.codigo}</td>
                    <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100">
                      {a.descripcion}
                      {!a.activo && <span className="ml-2 text-[10px] font-semibold text-red-500 uppercase">Inactivo</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">{RUBRO_LABEL[a.rubro]}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {formatoDolares(a.precio_hnes)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {a.es_cuadro_basico && <Marca texto="Cuadro" />}
                        {a.es_bolson && <Marca texto="Bolsón" />}
                        {a.es_controlado && <Marca texto="Controlado" />}
                        {a.requiere_autorizacion && <Marca texto="Req. autorización" ambar />}
                      </div>
                    </td>
                    {puedeEditar && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setEditando(a)}
                            title="Editar arancel"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => toggleActivo(a)}
                            title={a.activo ? "Desactivar (no se borra: los cargos históricos lo referencian)" : "Reactivar"}
                            className={`p-1.5 rounded-lg transition-colors ${
                              a.activo
                                ? "text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                            }`}
                          >
                            {a.activo ? <Ban size={14} /> : <RotateCcw size={14} />}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {aranceles && (
        <p className="text-xs text-slate-400">
          {filtrados.length} de {aranceles.length} aranceles. La eliminación es lógica (desactivar):
          los cargos ya capturados siempre conservan su arancel.
        </p>
      )}

      {editando && (
        <ModalArancel
          arancel={editando === "nuevo" ? null : editando}
          onCerrar={() => setEditando(null)}
          onListo={() => { setEditando(null); cargar(); }}
        />
      )}
    </div>
  );
}

function Marca({ texto, ambar }: { texto: string; ambar?: boolean }) {
  return (
    <span
      className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${
        ambar
          ? "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900"
          : "text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
      }`}
    >
      {texto}
    </span>
  );
}

// ── Modal crear / editar arancel ─────────────────────────────────────────────

function ModalArancel({
  arancel, onCerrar, onListo,
}: {
  arancel: ArancelIsbm | null;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [codigo, setCodigo] = useState(arancel?.codigo ?? "");
  const [rubro, setRubro] = useState<string>(arancel?.rubro ?? "OTROS");
  const [descripcion, setDescripcion] = useState(arancel?.descripcion ?? "");
  const [precio, setPrecio] = useState(arancel ? String(arancel.precio_hnes) : "");
  const [vigenteDesde, setVigenteDesde] = useState(arancel?.vigente_desde ?? hoyISO());
  const [cuadro, setCuadro] = useState(arancel?.es_cuadro_basico ?? false);
  const [bolson, setBolson] = useState(arancel?.es_bolson ?? false);
  const [controlado, setControlado] = useState(arancel?.es_controlado ?? false);
  const [reqAut, setReqAut] = useState(arancel?.requiere_autorizacion ?? false);
  const [umbralSup, setUmbralSup] = useState(arancel?.monto_umbral_supervisor != null ? String(arancel.monto_umbral_supervisor) : "");
  const [umbralGer, setUmbralGer] = useState(arancel?.monto_umbral_gerente != null ? String(arancel.monto_umbral_gerente) : "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!codigo.trim() || !descripcion.trim() || !precio.trim() || Number(precio) < 0) {
      setError("Código, descripción y precio son obligatorios.");
      return;
    }
    setGuardando(true);
    setError("");
    const datos: DatosArancel = {
      codigo: codigo.trim().toUpperCase(),
      rubro,
      descripcion: descripcion.trim(),
      precio_hnes: Number(precio),
      es_cuadro_basico: cuadro,
      es_bolson: bolson,
      es_controlado: controlado,
      requiere_autorizacion: reqAut,
      monto_umbral_supervisor: umbralSup.trim() ? Number(umbralSup) : null,
      monto_umbral_gerente: umbralGer.trim() ? Number(umbralGer) : null,
      vigente_desde: vigenteDesde,
    };
    try {
      if (arancel) await editarArancel(arancel.id, datos);
      else await crearArancel(datos);
      onListo();
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-3 md:p-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-5 md:p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
            {arancel ? `Editar arancel — ${arancel.codigo}` : "Nuevo arancel"}
          </h2>
          <button
            onClick={onCerrar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Código</label>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ej. LA150" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Rubro</label>
              <select value={rubro} onChange={(e) => setRubro(e.target.value)} className={inputCls}>
                {(Object.keys(RUBRO_LABEL) as RubroArancelIsbm[]).map((r) => (
                  <option key={r} value={r}>{RUBRO_LABEL[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Precio HNES ($)</label>
              <input type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Descripción</label>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={inputCls} />
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Vigente desde</label>
              <DateField value={vigenteDesde} onChange={setVigenteDesde} ariaLabel="Vigente desde" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Umbral supervisor ($)</label>
              <input type="number" min="0" step="0.01" value={umbralSup} onChange={(e) => setUmbralSup(e.target.value)} placeholder="opcional" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Umbral gerente/jefe ($)</label>
              <input type="number" min="0" step="0.01" value={umbralGer} onChange={(e) => setUmbralGer(e.target.value)} placeholder="opcional" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Check label="Cuadro básico" valor={cuadro} onChange={setCuadro} />
            <Check label="Bolsón" valor={bolson} onChange={setBolson} />
            <Check label="Controlado" valor={controlado} onChange={setControlado} />
            <Check label="Req. autorización" valor={reqAut} onChange={setReqAut} />
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
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
            >
              {guardando ? "Guardando…" : arancel ? "Guardar cambios" : "Crear arancel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Check({ label, valor, onChange }: { label: string; valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
      <input type="checkbox" checked={valor} onChange={(e) => onChange(e.target.checked)} className="accent-blue-600" />
      {label}
    </label>
  );
}
