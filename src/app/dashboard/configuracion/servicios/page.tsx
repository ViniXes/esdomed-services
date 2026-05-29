"use client";

import { useState, useEffect } from "react";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useServicios, type ServicioConfig } from "@/contexts/ServiciosContext";
import {
  Settings, Plus, Trash2, Check, X, Edit2,
  ArrowUp, ArrowDown, ChevronDown, ChevronRight,
  RefreshCw, Save, Wand2,
} from "lucide-react";

// ── Bed generation ────────────────────────────────────────────────────────────

type GenFormat = "prefix-nn" | "nn-suffix" | "prefix-nn-nohyphen" | "zp" | "n";

const FORMAT_LABELS: Record<GenFormat, string> = {
  "prefix-nn":          "PREFIJO-NN  (MH1-01, MH1-02, …)",
  "nn-suffix":          "NNsufijo   (1A, 2A, …)",
  "prefix-nn-nohyphen": "PREFIJONN  (CR01, CR02, …)",
  "zp":                 "NN         (01, 02, …)",
  "n":                  "N          (1, 2, …)",
};

function genBeds(format: GenFormat, prefix: string, suffix: string, from: number, to: number): string[] {
  if (to < from || from < 1) return [];
  const count = to - from + 1;
  switch (format) {
    case "prefix-nn":
      return Array.from({ length: count }, (_, i) =>
        `${prefix}-${String(from + i).padStart(2, "0")}`);
    case "nn-suffix":
      return Array.from({ length: count }, (_, i) => `${from + i}${suffix}`);
    case "prefix-nn-nohyphen":
      return Array.from({ length: count }, (_, i) =>
        `${prefix}${String(from + i).padStart(2, "0")}`);
    case "zp":
      return Array.from({ length: count }, (_, i) =>
        String(from + i).padStart(2, "0"));
    case "n":
      return Array.from({ length: count }, (_, i) => String(from + i));
    default:
      return [];
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputCls =
  "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500";

// ── Page ──────────────────────────────────────────────────────────────────────

type GenState = {
  idx: number;
  format: GenFormat;
  prefix: string;
  suffix: string;
  from: number;
  to: number;
};

export default function ConfiguracionServiciosPage() {
  const { user, profile } = useAuth();
  const { lista: listaCtx } = useServicios();

  const [draft, setDraft] = useState<ServicioConfig[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<{ idx: number; val: string } | null>(null);
  const [newServicio, setNewServicio] = useState("");
  const [newBed, setNewBed] = useState<{ idx: number; val: string } | null>(null);
  const [genRango, setGenRango] = useState<GenState | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!isDirty) setDraft(listaCtx.map((s) => ({ ...s, camas: [...s.camas] })));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [listaCtx, isDirty]);

  const markDirty = () => setIsDirty(true);

  // ── Service operations ────────────────────────────────────────────────────

  const addServicio = () => {
    const name = newServicio.trim();
    if (!name || draft.some((s) => s.nombre === name)) return;
    setDraft((d) => [...d, { nombre: name, camas: [] }]);
    setNewServicio("");
    markDirty();
  };

  const deleteServicio = (idx: number) => {
    setDraft((d) => d.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
    else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1);
    markDirty();
  };

  const renameServicio = (idx: number, val: string) => {
    const name = val.trim();
    if (!name || draft.some((s, i) => s.nombre === name && i !== idx)) return;
    setDraft((d) => d.map((s, i) => (i === idx ? { ...s, nombre: name } : s)));
    setEditingName(null);
    markDirty();
  };

  const moveServicio = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= draft.length) return;
    setDraft((d) => {
      const a = [...d];
      [a[idx], a[newIdx]] = [a[newIdx], a[idx]];
      return a;
    });
    if (expandedIdx === idx) setExpandedIdx(newIdx);
    else if (expandedIdx === newIdx) setExpandedIdx(idx);
    markDirty();
  };

  // ── Bed operations ────────────────────────────────────────────────────────

  const addBed = (idx: number, bed: string) => {
    const b = bed.trim();
    if (!b || draft[idx].camas.includes(b)) return;
    setDraft((d) => d.map((s, i) => (i === idx ? { ...s, camas: [...s.camas, b] } : s)));
    setNewBed(null);
    markDirty();
  };

  const removeBed = (svcIdx: number, bed: string) => {
    setDraft((d) =>
      d.map((s, i) => (i === svcIdx ? { ...s, camas: s.camas.filter((c) => c !== bed) } : s))
    );
    markDirty();
  };

  const addRango = (idx: number) => {
    if (!genRango || genRango.idx !== idx) return;
    const beds = genBeds(genRango.format, genRango.prefix, genRango.suffix, genRango.from, genRango.to);
    if (beds.length === 0) return;
    setDraft((d) =>
      d.map((s, i) =>
        i === idx
          ? { ...s, camas: [...s.camas, ...beds.filter((b) => !s.camas.includes(b))] }
          : s
      )
    );
    setGenRango(null);
    markDirty();
  };

  const clearBeds = (idx: number) => {
    setDraft((d) => d.map((s, i) => (i === idx ? { ...s, camas: [] } : s)));
    markDirty();
  };

  // ── Save / discard ────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!user || !profile) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "configuracion", "servicios"), {
        lista: draft,
        actualizadoEn: Timestamp.now(),
        actualizadoPorId: user.uid,
        actualizadoPorNombre: profile.nombre,
      });
      setIsDirty(false);
      setSavedMsg("Cambios guardados correctamente.");
      setTimeout(() => setSavedMsg(""), 3000);
    } catch (e) {
      setSavedMsg("Error al guardar: " + (e instanceof Error ? e.message : "intenta de nuevo"));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraft(listaCtx.map((s) => ({ ...s, camas: [...s.camas] })));
    setIsDirty(false);
    setExpandedIdx(null);
    setEditingName(null);
    setNewBed(null);
    setGenRango(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-violet-50 dark:bg-violet-950 rounded-xl flex items-center justify-center border border-violet-200 dark:border-violet-900">
              <Settings size={15} className="text-violet-600 dark:text-violet-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
              Servicios y Camas
            </h1>
          </div>
          <p className="text-sm text-slate-500 ml-10">
            Configura los servicios y sus camas. Los cambios se reflejan en toda la plataforma.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isDirty && (
            <button
              onClick={handleDiscard}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <RefreshCw size={13} /> Descartar
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 dark:disabled:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors disabled:cursor-not-allowed"
          >
            <Save size={13} /> {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>

      {/* Status message */}
      {savedMsg && (
        <div
          className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${
            savedMsg.startsWith("Error")
              ? "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900"
              : "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900"
          }`}
        >
          {savedMsg}
        </div>
      )}

      {/* Add new service */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
          Agregar servicio
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newServicio}
            onChange={(e) => setNewServicio(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addServicio()}
            className={`${inputCls} flex-1`}
            placeholder="Nombre del nuevo servicio…"
          />
          <button
            onClick={addServicio}
            disabled={!newServicio.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={14} /> Agregar
          </button>
        </div>
      </div>

      {/* Service list */}
      <div className="space-y-2">
        {draft.map((svc, idx) => {
          const expanded = expandedIdx === idx;
          const isEditingName = editingName?.idx === idx;
          const isGenOpen = genRango?.idx === idx;
          const isAddingBed = newBed?.idx === idx;
          const genPreview = isGenOpen && genRango
            ? genBeds(genRango.format, genRango.prefix, genRango.suffix, genRango.from, genRango.to)
            : [];

          return (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden"
            >
              {/* Service row */}
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  onClick={() => setExpandedIdx(expanded ? null : idx)}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors flex-shrink-0"
                >
                  {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>

                {isEditingName ? (
                  <form
                    className="flex items-center gap-2 flex-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      renameServicio(idx, editingName.val);
                    }}
                  >
                    <input
                      autoFocus
                      type="text"
                      value={editingName.val}
                      onChange={(e) => setEditingName({ idx, val: e.target.value })}
                      className={`${inputCls} flex-1 py-1`}
                    />
                    <button
                      type="submit"
                      className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingName(null)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                      {svc.nombre}
                    </span>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {svc.camas.length} cama{svc.camas.length !== 1 ? "s" : ""}
                    </span>
                  </>
                )}

                {!isEditingName && (
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => moveServicio(idx, -1)}
                      disabled={idx === 0}
                      title="Mover arriba"
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 disabled:opacity-30 transition-colors"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      onClick={() => moveServicio(idx, 1)}
                      disabled={idx === draft.length - 1}
                      title="Mover abajo"
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 disabled:opacity-30 transition-colors"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      onClick={() => setEditingName({ idx, val: svc.nombre })}
                      title="Renombrar"
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => deleteServicio(idx)}
                      title="Eliminar"
                      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>

              {/* Beds panel */}
              {expanded && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-4 space-y-4">
                  {/* Bed chips */}
                  {svc.camas.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {svc.camas.map((c) => (
                        <span
                          key={c}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-mono rounded-lg"
                        >
                          {c}
                          <button
                            onClick={() => removeBed(idx, c)}
                            className="text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      Sin camas asignadas — se mostrará campo de texto libre en los formularios.
                    </p>
                  )}

                  {/* Add single bed inline */}
                  {isAddingBed && (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        addBed(idx, newBed.val);
                      }}
                    >
                      <input
                        autoFocus
                        type="text"
                        value={newBed.val}
                        onChange={(e) => setNewBed({ idx, val: e.target.value })}
                        placeholder="Ej: 01, R1, CR01…"
                        className={`${inputCls} flex-1 py-1.5`}
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewBed(null)}
                        className="px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 text-xs rounded-lg transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </form>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {!isAddingBed && (
                      <button
                        onClick={() => setNewBed({ idx, val: "" })}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                      >
                        <Plus size={12} /> Cama individual
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setGenRango(
                          isGenOpen
                            ? null
                            : { idx, format: "prefix-nn", prefix: "", suffix: "", from: 1, to: 10 }
                        )
                      }
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        isGenOpen
                          ? "bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-800"
                          : "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950 border-violet-200 dark:border-violet-900 hover:bg-violet-100 dark:hover:bg-violet-900"
                      }`}
                    >
                      <Wand2 size={12} /> Generar rango
                    </button>
                    {svc.camas.length > 0 && (
                      <button
                        onClick={() => clearBeds(idx)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                      >
                        <Trash2 size={12} /> Limpiar todas
                      </button>
                    )}
                  </div>

                  {/* Generate range panel */}
                  {isGenOpen && genRango && (
                    <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Generar rango de camas
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="block text-xs text-slate-500 mb-1">Formato</label>
                          <select
                            value={genRango.format}
                            onChange={(e) =>
                              setGenRango({ ...genRango, format: e.target.value as GenFormat })
                            }
                            className={`${inputCls} w-full`}
                          >
                            {(Object.entries(FORMAT_LABELS) as [GenFormat, string][]).map(
                              ([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              )
                            )}
                          </select>
                        </div>
                        {(genRango.format === "prefix-nn" ||
                          genRango.format === "prefix-nn-nohyphen" ||
                          genRango.format === "nn-suffix") && (
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">
                              {genRango.format === "nn-suffix" ? "Sufijo" : "Prefijo"}
                            </label>
                            <input
                              type="text"
                              value={
                                genRango.format === "nn-suffix"
                                  ? genRango.suffix
                                  : genRango.prefix
                              }
                              onChange={(e) =>
                                setGenRango(
                                  genRango.format === "nn-suffix"
                                    ? { ...genRango, suffix: e.target.value }
                                    : { ...genRango, prefix: e.target.value }
                                )
                              }
                              placeholder={genRango.format === "nn-suffix" ? "A" : "MH1"}
                              className={inputCls}
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Desde</label>
                          <input
                            type="number"
                            min={1}
                            value={genRango.from}
                            onChange={(e) =>
                              setGenRango({ ...genRango, from: parseInt(e.target.value) || 1 })
                            }
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Hasta</label>
                          <input
                            type="number"
                            min={1}
                            value={genRango.to}
                            onChange={(e) =>
                              setGenRango({ ...genRango, to: parseInt(e.target.value) || 1 })
                            }
                            className={inputCls}
                          />
                        </div>
                      </div>

                      {/* Preview */}
                      {genPreview.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-1.5">
                            Vista previa:{" "}
                            <span className="text-slate-700 dark:text-slate-300 font-medium">
                              {genPreview.length} camas
                            </span>
                          </p>
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                            {genPreview.map((b) => (
                              <span
                                key={b}
                                className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-mono rounded text-slate-600 dark:text-slate-300"
                              >
                                {b}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => addRango(idx)}
                          disabled={genPreview.length === 0}
                          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          <Plus size={13} /> Agregar {genPreview.length} cama
                          {genPreview.length !== 1 ? "s" : ""}
                        </button>
                        <button
                          onClick={() => setGenRango(null)}
                          className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 text-sm rounded-lg transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {draft.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">
          No hay servicios configurados. Agrega el primero arriba.
        </div>
      )}

      {/* Sticky bottom save bar */}
      {isDirty && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-20">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl px-5 py-3.5 flex items-center justify-between">
            <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
              Tienes cambios sin guardar
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDiscard}
                className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                Descartar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Save size={13} /> {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
