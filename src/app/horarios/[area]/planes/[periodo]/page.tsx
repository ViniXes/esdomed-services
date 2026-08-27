"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { FilaPlanTrabajo, PlanTrabajo } from "@/types";
import { getAreaTrabajo, planAreaDocId } from "@/lib/areas-trabajo";
import {
  contarMarca,
  esMarcaEspecial,
  getHorario,
  totalHorasFila,
} from "@/lib/esdomed/horarios";
import {
  compararFilasPlan,
  diasDelMesArray,
  inicialesDeMes,
  labelPeriodo,
  parsePeriodo,
} from "@/lib/esdomed/plan";
import { CeldaPicker } from "@/components/esdomed-horarios/CeldaPicker";
import {
  ArrowLeft,
  Check,
  AlertTriangle,
  CalendarDays,
  Printer,
  Save,
  Users,
  XCircle,
} from "lucide-react";

// Editor/visor del plan mensual de un ÁREA del hospital (no ESDOMED, que tiene
// su propio editor en /esdomed-horarios). Mismo formato y catálogo de códigos;
// las filas vienen del plan guardado (importado del Excel del área o copiado de
// un mes anterior), no de la colección de usuarios: el personal del área aún no
// tiene cuentas y no las necesita para estar representado aquí.

export default function EditorPlanAreaPage() {
  const params = useParams();
  const areaId = String(params.area);
  const periodo = String(params.periodo);
  const area = getAreaTrabajo(areaId);
  const { anio, mes } = parsePeriodo(periodo);
  const { profile } = useAuth();
  const puedeEditar = profile?.role === "asistente_esdomed" || profile?.role === "admin";

  const dias = useMemo(() => diasDelMesArray(anio, mes), [anio, mes]);
  const iniciales = useMemo(() => inicialesDeMes(anio, mes), [anio, mes]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guardado, setGuardado] = useState(true);
  const [existe, setExiste] = useState(false);
  const [filas, setFilas] = useState<FilaPlanTrabajo[]>([]);
  const [numeroHoras, setNumeroHoras] = useState("");
  const [creadoMeta, setCreadoMeta] = useState<Pick<PlanTrabajo, "creadoEn" | "creadoPorId" | "creadoPorNombre"> | null>(null);
  const [ultimoPlan, setUltimoPlan] = useState<PlanTrabajo | null>(null);
  const [picker, setPicker] = useState<{ filaIdx: number; diaIdx: number } | null>(null);
  const [modalState, setModalState] = useState<{ tipo: "exito" | "error" | "alerta"; titulo: string; mensaje: string } | null>(null);
  const filasRef = useRef<FilaPlanTrabajo[]>([]);
  const inicializadoRef = useRef(false);

  useEffect(() => {
    filasRef.current = filas;
  }, [filas]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!inicializadoRef.current || guardado) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [guardado]);

  useEffect(() => {
    if (!area) {
      setLoading(false);
      return;
    }
    (async () => {
      inicializadoRef.current = false;
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "planes_trabajo_areas", planAreaDocId(area.id, periodo)));
        if (snap.exists()) {
          const plan = snap.data() as PlanTrabajo;
          setExiste(true);
          setNumeroHoras(plan.numeroHoras ?? "");
          setCreadoMeta({
            creadoEn: plan.creadoEn,
            creadoPorId: plan.creadoPorId,
            creadoPorNombre: plan.creadoPorNombre,
          });
          // Ajusta el largo de asignaciones al mes por si el plan viene de otro.
          setFilas(
            (plan.filas ?? []).map((f) => ({
              ...f,
              asignaciones: dias.map((_, i) => f.asignaciones[i] ?? ""),
            })),
          );
          setGuardado(true);
        } else {
          setExiste(false);
          setCreadoMeta(null);
          setFilas([]);
          // Para arrancar un mes nuevo: ofrecer el personal del último plan guardado.
          const otros = await getDocs(
            query(collection(db, "planes_trabajo_areas"), where("areaId", "==", area.id)),
          );
          const previos = otros.docs
            .map((d) => d.data() as PlanTrabajo)
            .filter((p) => p.periodo !== periodo)
            .sort((a, b) => b.periodo.localeCompare(a.periodo));
          setUltimoPlan(previos[0] ?? null);
        }
        inicializadoRef.current = true;
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId, periodo]);

  const empezarConPersonalPrevio = useCallback(() => {
    if (!ultimoPlan) return;
    setFilas(
      (ultimoPlan.filas ?? []).map((f) => ({
        ...f,
        asignaciones: Array(dias.length).fill(""),
        observaciones: f.observaciones ?? "",
      })),
    );
    setExiste(true); // muestra la cuadrícula (el doc se crea al guardar)
    setNumeroHoras(ultimoPlan.numeroHoras ?? "");
    setGuardado(false);
  }, [ultimoPlan, dias.length]);

  const setCelda = (filaIdx: number, diaIdx: number, valor: string) => {
    if (!puedeEditar) return;
    setFilas((prev) =>
      prev.map((f, i) =>
        i === filaIdx
          ? { ...f, asignaciones: f.asignaciones.map((c, j) => (j === diaIdx ? valor : c)) }
          : f,
      ),
    );
    setGuardado(false);
  };

  const guardar = async () => {
    if (!profile || !area) return;
    const errores: string[] = [];
    filas.forEach((fila) => {
      fila.asignaciones.forEach((codigoRaw, indice) => {
        const codigo = (codigoRaw ?? "").trim().toUpperCase();
        if (codigo && !getHorario(codigo) && !esMarcaEspecial(codigo)) {
          errores.push(`${fila.nombre}, día ${indice + 1}: código desconocido (${codigo}).`);
        }
      });
    });
    if (errores.length > 0) {
      setModalState({
        tipo: "error",
        titulo: "Plan con asignaciones inválidas",
        mensaje: `${errores.slice(0, 12).join("\n")}${errores.length > 12 ? `\n\nY ${errores.length - 12} error(es) más.` : ""}`,
      });
      return;
    }

    setSaving(true);
    try {
      const ahora = new Date();
      const payload: PlanTrabajo = {
        areaId: area.id,
        areaNombre: area.nombre,
        periodo,
        anio,
        mes,
        numeroHoras: numeroHoras.trim(),
        filas: filas.map((f) => ({
          uid: f.uid ?? "",
          codigoMarcacion: f.codigoMarcacion ?? "",
          nombre: f.nombre,
          puesto: f.puesto ?? "",
          grupo: f.grupo ?? "",
          asignaciones: f.asignaciones,
          observaciones: f.observaciones ?? "",
          ...(typeof f.orden === "number" ? { orden: f.orden } : {}),
        })),
        creadoEn: creadoMeta?.creadoEn ?? ahora,
        creadoPorId: creadoMeta?.creadoPorId ?? profile.uid,
        creadoPorNombre: creadoMeta?.creadoPorNombre ?? profile.nombre,
        actualizadoEn: ahora,
        actualizadoPorId: profile.uid,
        actualizadoPorNombre: profile.nombre,
      };
      await setDoc(doc(db, "planes_trabajo_areas", planAreaDocId(area.id, periodo)), payload);
      if (!creadoMeta) {
        setCreadoMeta({ creadoEn: ahora, creadoPorId: profile.uid, creadoPorNombre: profile.nombre });
      }
      setGuardado(true);
      setModalState({ tipo: "exito", titulo: "Plan guardado", mensaje: "Los cambios se guardaron exitosamente." });
    } catch (e) {
      setModalState({
        tipo: "error",
        titulo: "Error al guardar",
        mensaje: "Hubo un problema guardando el plan: " + (e instanceof Error ? e.message : "desconocido"),
      });
    } finally {
      setSaving(false);
    }
  };

  const filasOrdenadas = useMemo(
    () => filas.map((f, i) => ({ f, i })).sort((a, b) => compararFilasPlan(a.f, b.f)),
    [filas],
  );

  const moverFocoCuadricula = (
    displayIdx: number,
    diaIdx: number,
    tecla: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
  ) => {
    let siguienteFila = displayIdx;
    let siguienteDia = diaIdx;
    if (tecla === "ArrowUp") siguienteFila--;
    if (tecla === "ArrowDown") siguienteFila++;
    if (tecla === "ArrowLeft") siguienteDia--;
    if (tecla === "ArrowRight") siguienteDia++;
    if (
      siguienteFila < 0 ||
      siguienteFila >= filasOrdenadas.length ||
      siguienteDia < 0 ||
      siguienteDia >= dias.length
    ) return;
    document.querySelector<HTMLButtonElement>(
      `button[data-plan-cell="true"][data-display-idx="${siguienteFila}"][data-dia-idx="${siguienteDia}"]`,
    )?.focus();
  };

  const filaActiva = picker ? filas[picker.filaIdx] : null;

  if (!area || area.hrefPropio) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Área no encontrada.</p>
        <Link prefetch={false} href="/horarios" className="mt-3 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline">
          ← Volver al selector de áreas
        </Link>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-5 py-5">
      {/* Encabezado + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <Link
            prefetch={false}
            href={`/horarios/${area.id}`}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <ArrowLeft size={13} /> {area.corto}
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-heading">
            {labelPeriodo(periodo)}
          </h1>
        </div>
        {existe && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              prefetch={false}
              href={`/horarios/${area.id}/planes/${periodo}/imprimir`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Printer size={14} /> Imprimir
            </Link>
            {puedeEditar && (
              <button
                onClick={() => void guardar()}
                disabled={saving}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition-colors active:scale-[0.98] disabled:opacity-50 ${
                  guardado ? "bg-emerald-600" : "bg-blue-600 hover:bg-blue-500"
                }`}
              >
                {guardado ? <Check size={15} /> : <Save size={15} />}
                {saving ? "Guardando..." : guardado ? "Guardado" : "Guardar"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Número de horas del encabezado oficial */}
      {existe && (
        <div className="mb-4 flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Número de horas:
          </label>
          {puedeEditar ? (
            <input
              value={numeroHoras}
              onChange={(e) => { setNumeroHoras(e.target.value); setGuardado(false); }}
              placeholder="Ej: 76/136/152"
              className="w-48 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          ) : (
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{numeroHoras || "—"}</span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-400">
            <Users size={12} /> {filas.length} personas
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !existe ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 px-6 py-12 text-center">
          <CalendarDays size={28} className="mx-auto text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            No hay plan guardado para {labelPeriodo(periodo)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Los planes del área se importan desde el Excel oficial del rol de turnos
            {ultimoPlan ? " o se arrancan con el personal del último mes guardado." : "."}
          </p>
          {puedeEditar && ultimoPlan && (
            <button
              onClick={empezarConPersonalPrevio}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors active:scale-[0.98]"
            >
              <Users size={15} /> Empezar con el personal de {labelPeriodo(ultimoPlan.periodo)}
            </button>
          )}
        </div>
      ) : (
        <>
          {puedeEditar && (
            <p className="mb-2 text-[11px] text-slate-400">
              Un clic selecciona una casilla; usa las flechas para moverte, Backspace/Supr para borrar
              y doble clic para abrir el selector de códigos.
            </p>
          )}
          <div className="overflow-auto max-h-[calc(100vh-14rem)] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 min-w-[190px] border-r border-b border-slate-200 dark:border-slate-700">
                    Personal
                  </th>
                  {dias.map((d, i) => {
                    const finde = iniciales[i] === "S" || iniciales[i] === "D";
                    return (
                      <th
                        key={d}
                        className={`sticky top-0 z-20 px-0 py-1 text-center font-semibold w-9 border-b border-slate-200 dark:border-slate-700 ${
                          finde
                            ? "bg-rose-50 dark:bg-rose-950 text-rose-500"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        <div className="text-[9px] leading-none">{iniciales[i]}</div>
                        <div className="text-[11px] tabular-nums">{d}</div>
                      </th>
                    );
                  })}
                  <th className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-center font-semibold text-slate-600 dark:text-slate-300 border-l border-b border-slate-200 dark:border-slate-700">
                    Hrs
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let grupoPrev: string | null = "__init__";
                  return filasOrdenadas.map(({ f: fila, i: filaIdx }, displayIdx) => {
                    const total = totalHorasFila(fila.asignaciones);
                    const vac = contarMarca(fila.asignaciones, "VAC");
                    const grupoActual = fila.grupo?.trim() || "";
                    const mostrarHeader = grupoActual !== grupoPrev && grupoActual !== "";
                    grupoPrev = grupoActual;

                    return (
                      <Fragment key={fila.uid || fila.codigoMarcacion || filaIdx}>
                        {mostrarHeader && (
                          <tr>
                            <td
                              colSpan={dias.length + 2}
                              className="px-0 py-0 border-t border-slate-200 dark:border-slate-700 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                            >
                              <span className="sticky left-0 inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold uppercase tracking-wide">
                                <span className="h-2 w-2 rounded-full bg-blue-500" />
                                {grupoActual}
                              </span>
                            </td>
                          </tr>
                        )}
                        <tr className="border-t border-slate-100 dark:border-slate-800">
                          <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 min-w-[190px] max-w-[190px]">
                            <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 leading-tight truncate" title={fila.nombre}>
                              {fila.nombre}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate" title={fila.puesto}>
                              {fila.codigoMarcacion ? (
                                <span className="font-medium text-blue-700 dark:text-blue-300">{fila.codigoMarcacion}</span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400">sin código</span>
                              )}
                              {fila.puesto ? ` · ${fila.puesto}` : ""}
                            </p>
                          </td>
                          {dias.map((d, diaIdx) => {
                            const celda = (fila.asignaciones[diaIdx] ?? "").trim();
                            const finde = iniciales[diaIdx] === "S" || iniciales[diaIdx] === "D";
                            return (
                              <td key={d} className={`p-0 text-center ${finde ? "bg-rose-50/40 dark:bg-rose-950/20" : ""}`}>
                                <button
                                  data-plan-cell="true"
                                  data-display-idx={displayIdx}
                                  data-dia-idx={diaIdx}
                                  disabled={!puedeEditar}
                                  onDoubleClick={() => puedeEditar && setPicker({ filaIdx, diaIdx })}
                                  onKeyDown={(event) => {
                                    if (
                                      event.key === "ArrowUp" ||
                                      event.key === "ArrowDown" ||
                                      event.key === "ArrowLeft" ||
                                      event.key === "ArrowRight"
                                    ) {
                                      event.preventDefault();
                                      moverFocoCuadricula(displayIdx, diaIdx, event.key);
                                      return;
                                    }
                                    if (!puedeEditar) return;
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      setPicker({ filaIdx, diaIdx });
                                      return;
                                    }
                                    if ((event.key === "Backspace" || event.key === "Delete") && celda) {
                                      event.preventDefault();
                                      setCelda(filaIdx, diaIdx, "");
                                    }
                                  }}
                                  title={celda ? describirCelda(celda) : puedeEditar ? "Doble clic para asignar" : undefined}
                                  className={`w-9 h-8 text-[10px] font-bold tabular-nums transition-colors focus:ring-2 focus:ring-cyan-500 focus:outline-none focus:z-10 relative ${
                                    puedeEditar ? "cursor-cell hover:ring-2 hover:ring-cyan-400 hover:z-10" : "cursor-default"
                                  } ${colorCelda(celda)}`}
                                >
                                  {celda ? celda.toUpperCase() : ""}
                                </button>
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-center border-l border-slate-200 dark:border-slate-700 min-w-[60px]">
                            <span className="text-[13px] font-bold tabular-nums text-slate-800 dark:text-slate-100 block leading-none">
                              {total}
                            </span>
                            {vac > 0 && (
                              <span className="block mt-1 text-[9px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 px-1 rounded">
                                {vac} VAC
                              </span>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </>
      )}

      {picker && filaActiva && (
        <CeldaPicker
          titulo={filaActiva.nombre}
          subtitulo={`${labelPeriodo(periodo)} · Día ${picker.diaIdx + 1} (${iniciales[picker.diaIdx]})`}
          valorActual={filaActiva.asignaciones[picker.diaIdx] ?? ""}
          onSelect={(codigo) => {
            setCelda(picker.filaIdx, picker.diaIdx, codigo);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {modalState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div
              className={`p-4 border-b ${
                modalState.tipo === "exito"
                  ? "bg-emerald-50 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/50"
                  : modalState.tipo === "error"
                    ? "bg-rose-50 border-rose-100 dark:bg-rose-950/30 dark:border-rose-900/50"
                    : "bg-amber-50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/50"
              }`}
            >
              <div className="flex items-center gap-2">
                {modalState.tipo === "exito" ? (
                  <Check className="text-emerald-600 dark:text-emerald-400" size={20} />
                ) : modalState.tipo === "error" ? (
                  <XCircle className="text-rose-600 dark:text-rose-400" size={20} />
                ) : (
                  <AlertTriangle className="text-amber-600 dark:text-amber-400" size={20} />
                )}
                <h3
                  className={`font-bold ${
                    modalState.tipo === "exito"
                      ? "text-emerald-800 dark:text-emerald-500"
                      : modalState.tipo === "error"
                        ? "text-rose-800 dark:text-rose-500"
                        : "text-amber-800 dark:text-amber-500"
                  }`}
                >
                  {modalState.titulo}
                </h3>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{modalState.mensaje}</p>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setModalState(null)}
                  className={`px-4 py-2 text-sm font-bold rounded-xl text-white transition-colors ${
                    modalState.tipo === "exito"
                      ? "bg-emerald-600 hover:bg-emerald-500"
                      : modalState.tipo === "error"
                        ? "bg-rose-600 hover:bg-rose-500"
                        : "bg-amber-500 hover:bg-amber-400"
                  }`}
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function describirCelda(celda: string): string {
  const v = celda.trim().toUpperCase();
  const h = getHorario(v);
  if (h) return `${v} · ${h.entrada} – ${h.salida} · ${h.horas} h`;
  return v;
}

function colorCelda(celda: string): string {
  const v = celda.trim().toUpperCase();
  if (!v) return "text-slate-300 dark:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800";
  if (getHorario(v)) return "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/60";
  if (esMarcaEspecial(v)) {
    if (v === "VAC") return "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300";
    if (v === "INC") return "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-300";
    if (v === "ASU") return "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300";
    if (v === "MAT") return "bg-cyan-100 text-cyan-700 hover:bg-cyan-200 dark:bg-cyan-950 dark:text-cyan-300";
    // PER y LIC — tono neutro.
    return "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200";
  }
  return "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300";
}
