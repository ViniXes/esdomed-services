"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { FilaPlanTrabajo, PlanTrabajo, UserProfile } from "@/types";
import {
  contarMarca,
  esMarcaEspecial,
  getHorario,
  totalHorasFila,
} from "@/lib/esdomed/horarios";
import {
  diasDelMesArray,
  inicialesDeMes,
  labelPeriodo,
  parsePeriodo,
  formatPeriodo,
  sincronizarFilas,
  GRUPOS_ESDOMED,
  COLOR_GRUPO,
  ordenGrupo,
} from "@/lib/esdomed/plan";
import { CeldaPicker } from "@/components/esdomed-horarios/CeldaPicker";
import {
  ArrowLeft,
  Check,
  Copy,
  Printer,
  RefreshCw,
  Save,
  Users,
  XCircle,
  AlertTriangle,
} from "lucide-react";

type RosterUser = Pick<UserProfile, "uid" | "nombre" | "codigoMarcacion" | "puesto">;

export default function EditorPlanPage() {
  const params = useParams();
  const periodo = String(params.periodo);
  const { anio, mes } = parsePeriodo(periodo);
  const { profile } = useAuth();

  const dias = useMemo(() => diasDelMesArray(anio, mes), [anio, mes]);
  const iniciales = useMemo(() => inicialesDeMes(anio, mes), [anio, mes]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [filas, setFilas] = useState<FilaPlanTrabajo[]>([]);
  const [numeroHoras, setNumeroHoras] = useState("");
  const [metaHorasAdmin, setMetaHorasAdmin] = useState<number | "">("");
  const [metaHorasOperativas, setMetaHorasOperativas] = useState<number | "">("");
  const [creadoMeta, setCreadoMeta] = useState<Pick<PlanTrabajo, "creadoEn" | "creadoPorId" | "creadoPorNombre"> | null>(null);
  const [roster, setRoster] = useState<RosterUser[]>([]);
  const [prevPlanData, setPrevPlanData] = useState<PlanTrabajo | null>(null);
  const [picker, setPicker] = useState<{ filaIdx: number; diaIdx: number } | null>(null);
  const [modalState, setModalState] = useState<{ tipo: "exito"|"error"|"alerta"; titulo: string; mensaje: string } | null>(null);
  const dragRef = useRef<{ filaIdx: number; valor: string; isDragging: boolean; cellsDragged: number } | null>(null);

  useEffect(() => {
    const handleMouseUp = () => {
      if (dragRef.current) {
        dragRef.current.isDragging = false;
        setTimeout(() => { dragRef.current = null; }, 0);
      }
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const cargarRoster = useCallback(async (): Promise<RosterUser[]> => {
    const snap = await getDocs(
      query(collection(db, "usuarios"), where("role", "in", ["esdomed", "asistente_esdomed"])),
    );
    const lista = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          nombre: data.nombre ?? "",
          codigoMarcacion: data.codigoMarcacion ?? "",
          puesto: data.puesto ?? "",
        } as RosterUser;
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    setRoster(lista);
    return lista;
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const prevPeriodo = formatPeriodo(mes === 1 ? anio - 1 : anio, mes === 1 ? 12 : mes - 1);
        const [snap, lista, prevSnap] = await Promise.all([
          getDoc(doc(db, "planes_trabajo", periodo)),
          cargarRoster(),
          getDoc(doc(db, "planes_trabajo", prevPeriodo))
        ]);
        
        if (prevSnap.exists()) {
          setPrevPlanData(prevSnap.data() as PlanTrabajo);
        } else {
          setPrevPlanData(null);
        }

        if (snap.exists()) {
          const plan = snap.data() as PlanTrabajo;
          setNumeroHoras(plan.numeroHoras ?? "");
          setMetaHorasAdmin(plan.metaHorasAdmin ?? "");
          setMetaHorasOperativas(plan.metaHorasOperativas ?? "");
          setCreadoMeta({
            creadoEn: plan.creadoEn,
            creadoPorId: plan.creadoPorId,
            creadoPorNombre: plan.creadoPorNombre,
          });
          // Mezcla con el roster para incluir personal nuevo, conservando lo guardado.
          setFilas(sincronizarFilas(lista, plan.filas ?? [], dias.length));
        } else {
          setCreadoMeta(null);
          setFilas(sincronizarFilas(lista, [], dias.length));
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  const setCelda = (filaIdx: number, diaIdx: number, valor: string) => {
    setFilas((prev) =>
      prev.map((f, i) =>
        i === filaIdx
          ? { ...f, asignaciones: f.asignaciones.map((c, j) => (j === diaIdx ? valor : c)) }
          : f,
      ),
    );
    setGuardado(false);
  };

  const setGrupo = (filaIdx: number, grupo: string) => {
    setFilas((prev) => prev.map((f, i) => (i === filaIdx ? { ...f, grupo } : f)));
    setGuardado(false);
  };

  const sincronizar = async () => {
    const lista = await cargarRoster();
    setFilas((prev) => sincronizarFilas(lista, prev, dias.length));
    setModalState({ tipo: "exito", titulo: "Sincronización Completa", mensaje: "El listado de personal se ha actualizado correctamente con los usuarios ESDOMED vigentes." });
    setGuardado(false);
  };

  const copiarMesAnterior = async () => {
    const prevPeriodo = formatPeriodo(mes === 1 ? anio - 1 : anio, mes === 1 ? 12 : mes - 1);
    const snap = await getDoc(doc(db, "planes_trabajo", prevPeriodo));
    if (!snap.exists()) {
      setModalState({ tipo: "alerta", titulo: "Sin datos", mensaje: `No hay plan guardado para ${labelPeriodo(prevPeriodo)} del cual copiar el patrón.` });
      return;
    }
    const prevPlan = snap.data() as PlanTrabajo;
    // Copia patrón: empareja por uid o código y rellena los días de este mes.
    setFilas((prev) =>
      prev.map((f) => {
        const origen =
          prevPlan.filas.find((pf) => pf.uid && pf.uid === f.uid) ||
          prevPlan.filas.find((pf) => pf.codigoMarcacion && pf.codigoMarcacion === f.codigoMarcacion);
        if (!origen) return f;
        return {
          ...f,
          asignaciones: dias.map((_, j) => origen.asignaciones[j] ?? ""),
          observaciones: origen.observaciones ?? f.observaciones,
        };
      }),
    );
    if (!numeroHoras && prevPlan.numeroHoras) setNumeroHoras(prevPlan.numeroHoras);
    if (metaHorasAdmin === "" && prevPlan.metaHorasAdmin) setMetaHorasAdmin(prevPlan.metaHorasAdmin);
    if (metaHorasOperativas === "" && prevPlan.metaHorasOperativas) setMetaHorasOperativas(prevPlan.metaHorasOperativas);
    setModalState({ tipo: "exito", titulo: "Patrón Copiado", mensaje: `Se han copiado los turnos desde ${labelPeriodo(prevPeriodo)}. Por favor, ajusta los detalles antes de guardar.` });
    setGuardado(false);
  };

  const guardar = async () => {
    if (!profile) return;

    const diasIncompletos = conteoOperativosPorDia
      .map((count, idx) => count < 2 ? idx + 1 : null)
      .filter(val => val !== null);

    if (diasIncompletos.length > 0) {
      const confirmacion = window.confirm(`⚠️ ADVERTENCIA: Hay días con menos de 2 operativos asignados (Días: ${diasIncompletos.join(", ")}).\n\n¿Estás seguro que deseas guardar el plan de todas formas?`);
      if (!confirmacion) return;
    }

    setSaving(true);
    try {
      const ahora = new Date();
      const payload: PlanTrabajo = {
        periodo,
        anio,
        mes,
        numeroHoras: numeroHoras.trim(),
        metaHorasAdmin: metaHorasAdmin === "" ? undefined : Number(metaHorasAdmin),
        metaHorasOperativas: metaHorasOperativas === "" ? undefined : Number(metaHorasOperativas),
        filas: filas.map((f) => ({
          uid: f.uid,
          codigoMarcacion: f.codigoMarcacion ?? "",
          nombre: f.nombre,
          puesto: f.puesto ?? "",
          grupo: f.grupo ?? "",
          asignaciones: f.asignaciones,
          observaciones: f.observaciones ?? "",
        })),
        creadoEn: creadoMeta?.creadoEn ?? ahora,
        creadoPorId: creadoMeta?.creadoPorId ?? profile.uid,
        creadoPorNombre: creadoMeta?.creadoPorNombre ?? profile.nombre,
        actualizadoEn: ahora,
        actualizadoPorId: profile.uid,
        actualizadoPorNombre: profile.nombre,
      };
      // Firestore no acepta `undefined`; uid puede faltar en filas sin usuario.
      payload.filas = payload.filas.map((f) => (f.uid ? f : { ...f, uid: "" }));
      await setDoc(doc(db, "planes_trabajo", periodo), payload);
      if (!creadoMeta) {
        setCreadoMeta({ creadoEn: ahora, creadoPorId: profile.uid, creadoPorNombre: profile.nombre });
      }
      setGuardado(true);
      setModalState({ tipo: "exito", titulo: "Plan Guardado", mensaje: "Los cambios se han guardado exitosamente en la base de datos." });
    } catch (e) {
      setModalState({ tipo: "error", titulo: "Error al Guardar", mensaje: "Hubo un problema guardando el plan: " + (e instanceof Error ? e.message : "desconocido") });
    } finally {
      setSaving(false);
    }
  };

  const filaActiva = picker ? filas[picker.filaIdx] : null;

  // Filas ordenadas por grupo y nombre, conservando el índice original (para editar).
  const filasOrdenadas = useMemo(
    () =>
      filas
        .map((f, i) => ({ f, i }))
        .sort((a, b) => {
          const isJefeA = a.f.nombre.toLowerCase().includes("benjamin") && a.f.nombre.toLowerCase().includes("cardoza");
          const isJefeB = b.f.nombre.toLowerCase().includes("benjamin") && b.f.nombre.toLowerCase().includes("cardoza");
          
          const grupoDiff = ordenGrupo(a.f.grupo) - ordenGrupo(b.f.grupo);
          if (grupoDiff !== 0) return grupoDiff;
          
          if (isJefeA && !isJefeB) return -1;
          if (!isJefeA && isJefeB) return 1;
          
          return a.f.nombre.localeCompare(b.f.nombre);
        }),
    [filas],
  );

  const conteoOperativosPorDia = useMemo(() => {
    const conteos = new Array(dias.length).fill(0);
    filas.forEach(f => {
      f.asignaciones.forEach((celda, diaIdx) => {
        const h = getHorario(celda);
        if (h && (h.tipo === "Turno Operativo" || h.tipo === "Turno Hospitalario")) {
          conteos[diaIdx]++;
        }
      });
    });
    return conteos;
  }, [filas, dias.length]);

  const colSpanTotal = dias.length + 2; // Personal + días + Hrs

  return (
    <div className="px-3 sm:px-5 py-5">
      {/* Encabezado + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <Link href="/esdomed-horarios/planes" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
            <ArrowLeft size={13} /> Planes
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-heading">
            {labelPeriodo(periodo)}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={sincronizar} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <RefreshCw size={14} /> Sincronizar
          </button>
          <button onClick={copiarMesAnterior} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <Copy size={14} /> Copiar mes anterior
          </button>
          <Link href={`/esdomed-horarios/planes/${periodo}/imprimir`} target="_blank" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <Printer size={14} /> Imprimir / PDF
          </Link>
          <button
            onClick={guardar}
            disabled={saving}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition-colors active:scale-[0.98] disabled:opacity-50 ${
              guardado
                ? "bg-emerald-600"
                : "bg-blue-600 hover:bg-blue-500 dark:bg-[var(--color-institutional-navy)] dark:hover:bg-blue-800 dark:ring-1 dark:ring-[#c9a892]/35"
            }`}
          >
            {guardado ? <Check size={15} /> : <Save size={15} />}
            {saving ? "Guardando..." : guardado ? "Guardado" : "Guardar"}
          </button>
        </div>
      </div>

      {/* Metas de horas */}
      <div className="mb-4 flex flex-wrap items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Meta Hrs Admin:</label>
          <input
            type="number"
            value={metaHorasAdmin}
            onChange={(e) => { setMetaHorasAdmin(e.target.value ? Number(e.target.value) : ""); setGuardado(false); }}
            placeholder="Ej: 168"
            className="w-24 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Meta Hrs Operativas:</label>
          <input
            type="number"
            value={metaHorasOperativas}
            onChange={(e) => { setMetaHorasOperativas(e.target.value ? Number(e.target.value) : ""); setGuardado(false); }}
            placeholder="Ej: 160"
            className="w-24 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Etiqueta texto (opcional):</label>
          <input
            value={numeroHoras}
            onChange={(e) => { setNumeroHoras(e.target.value); setGuardado(false); }}
            placeholder="Ej: 168 Adm / 168 Ope"
            className="w-48 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#c9a892]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-[#c9a892] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 px-6 py-12 text-center">
          <Users size={28} className="mx-auto text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">No hay personal ESDOMED registrado</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Crea usuarios con rol ESDOMED o Asistente Administrativo ESDOMED (con su código de marcación) y luego pulsa “Sincronizar”.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-slate-400">
            Toca una celda para asignar un código de horario, vacaciones, incapacidad/permiso o descanso.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table className="border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60">
                  <th className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 min-w-[170px] border-r border-slate-200 dark:border-slate-700">
                    Personal
                  </th>
                  {dias.map((d, i) => {
                    const finde = iniciales[i] === "S" || iniciales[i] === "D";
                    return (
                      <th key={d} className={`px-0 py-1 text-center font-semibold w-9 ${finde ? "bg-rose-50 dark:bg-rose-950/40 text-rose-500" : "text-slate-500 dark:text-slate-400"}`}>
                        <div className="text-[9px] leading-none">{iniciales[i]}</div>
                        <div className="text-[11px] tabular-nums">{d}</div>
                      </th>
                    );
                  })}
                  <th className="px-2 py-2 text-center font-semibold text-slate-600 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700">Hrs</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let grupoPrev: string | null = "__init__";
                  return filasOrdenadas.map(({ f: fila, i: filaIdx }) => {
                    const total = totalHorasFila(fila.asignaciones);
                    const vac = contarMarca(fila.asignaciones, "VAC");
                    const grupoActual = fila.grupo?.trim() || "";
                    const isAdministrativo = grupoActual.toLowerCase().includes("administrativo");
                    const targetHoras = isAdministrativo ? metaHorasAdmin : metaHorasOperativas;
                    const metaValida = typeof targetHoras === "number" && targetHoras > 0;
                    const dif = metaValida ? total - targetHoras : 0;
                    
                    const mostrarHeader = grupoActual !== grupoPrev;
                    grupoPrev = grupoActual;
                    const estiloGrupo = grupoActual ? COLOR_GRUPO[grupoActual] : null;

                    return (
                      <Fragment key={fila.uid || fila.codigoMarcacion || filaIdx}>
                        {mostrarHeader && (
                          <tr>
                            <td colSpan={colSpanTotal} className={`px-0 py-0 border-t border-slate-200 dark:border-slate-700 ${estiloGrupo ? estiloGrupo.barra : "bg-slate-100 dark:bg-slate-800/80"}`}>
                              <span className="sticky left-0 inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold uppercase tracking-wide">
                                {estiloGrupo && <span className={`h-2 w-2 rounded-full ${estiloGrupo.dot}`} />}
                                {grupoActual || "Sin grupo asignado"}
                              </span>
                            </td>
                          </tr>
                        )}
                        <tr className="border-t border-slate-100 dark:border-slate-800">
                          <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 min-w-[190px] max-w-[190px]">
                            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-800 dark:text-slate-100 leading-tight">
                              {estiloGrupo && <span className={`h-2 w-2 shrink-0 rounded-full ${estiloGrupo.dot}`} />}
                              <span className="truncate" title={fila.nombre}>{fila.nombre}</span>
                            </p>
                            <p className="text-[10px] text-slate-400 truncate" title={fila.puesto}>
                              {fila.codigoMarcacion ? <span className="font-medium text-[#1c1e4d] dark:text-[#c9a892]">{fila.codigoMarcacion}</span> : <span className="text-amber-600 dark:text-amber-400">sin código</span>}
                              {fila.puesto ? ` · ${fila.puesto}` : ""}
                            </p>
                            <select
                              value={grupoActual}
                              onChange={(e) => setGrupo(filaIdx, e.target.value)}
                              className="mt-1 w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-1 text-[10px] text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[#c9a892]"
                            >
                              <option value="">— Sin grupo —</option>
                              {GRUPOS_ESDOMED.map((g) => (
                                <option key={g} value={g}>{g}</option>
                              ))}
                            </select>
                          </td>
                          {dias.map((d, diaIdx) => {
                            const celda = (fila.asignaciones[diaIdx] ?? "").trim();
                            const finde = iniciales[diaIdx] === "S" || iniciales[diaIdx] === "D";
                            return (
                              <td key={d} className={`p-0 text-center ${finde ? "bg-rose-50/40 dark:bg-rose-950/20" : ""}`}>
                                <button
                                  onMouseDown={() => {
                                    dragRef.current = { filaIdx, valor: celda, isDragging: true, cellsDragged: 0 };
                                  }}
                                  onMouseEnter={() => {
                                    if (dragRef.current && dragRef.current.isDragging && dragRef.current.filaIdx === filaIdx) {
                                      dragRef.current.cellsDragged++;
                                      if (!finde) {
                                        setCelda(filaIdx, diaIdx, dragRef.current.valor);
                                      }
                                    }
                                  }}
                                  onClick={() => {
                                    if (dragRef.current && dragRef.current.cellsDragged > 0) return;
                                    setPicker({ filaIdx, diaIdx });
                                  }}
                                  className={`w-9 h-8 text-[10px] font-bold tabular-nums transition-colors ${colorCelda(celda)} cursor-cell hover:ring-2 hover:ring-blue-400 hover:z-10 relative`}
                                >
                                  {celda.toUpperCase()}
                                </button>
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-center border-l border-slate-200 dark:border-slate-700 min-w-[70px]">
                            <span className="text-[13px] font-bold tabular-nums text-slate-800 dark:text-slate-100 block leading-none">{total}</span>
                            {metaValida && (
                              <div className="mt-1">
                                {dif === 0 ? (
                                  <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded">OK</span>
                                ) : dif > 0 ? (
                                  <span className="text-[9px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/30 px-1.5 py-0.5 rounded" title={`Excede meta por ${dif} hrs`}>+{dif} hrs</span>
                                ) : (
                                  <span className="text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded" title={`Faltan ${Math.abs(dif)} hrs`}>{dif} hrs</span>
                                )}
                              </div>
                            )}
                            {vac > 0 && <span className="block mt-1 text-[9px] font-semibold text-amber-500 bg-amber-50 dark:bg-amber-950/30 px-1 rounded">{vac} VAC</span>}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  });
                })()}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700">
                  <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800 px-2 py-2 font-bold text-[10px] text-right text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 uppercase tracking-wider">
                    Total Operativos / Día:
                  </td>
                  {dias.map((d, diaIdx) => {
                    const count = conteoOperativosPorDia[diaIdx];
                    const faltan = count < 2;
                    return (
                      <td key={`tot-${d}`} className="text-center font-bold text-[10px] py-1 border-r border-slate-100 dark:border-slate-700/50 last:border-r-0">
                        <div className={`mx-auto w-7 h-6 flex items-center justify-center rounded transition-colors ${faltan ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400 border border-rose-300 dark:border-rose-700/80 shadow-sm" : "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400"}`} title={faltan ? "Se requieren al menos 2 operativos" : "Cobertura operativa OK"}>
                          {count}
                        </div>
                      </td>
                    );
                  })}
                  <td className="border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"></td>
                </tr>
              </tfoot>
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
            // Validación de 2 días de descanso inter-mensual para operativos
            const h = getHorario(codigo);
            const isOperativo = h && (h.tipo === "Turno Operativo" || h.tipo === "Turno Hospitalario");
            
            if (isOperativo && prevPlanData && !filaActiva.grupo?.toLowerCase().includes("administrativo")) {
              const filaAnterior = prevPlanData.filas.find(f => f.codigoMarcacion === filaActiva.codigoMarcacion || f.uid === filaActiva.uid);
              if (filaAnterior) {
                const prevDias = diasDelMesArray(prevPlanData.anio, prevPlanData.mes).length;
                let lastShiftIdx = -1;
                for (let i = prevDias - 1; i >= prevDias - 3; i--) {
                  if (i < 0) break;
                  const celdaPrev = filaAnterior.asignaciones[i] || "";
                  const hPrev = getHorario(celdaPrev);
                  if (hPrev && (hPrev.tipo === "Turno Operativo" || hPrev.tipo === "Turno Hospitalario")) {
                    lastShiftIdx = i;
                    break;
                  }
                }
                
                if (lastShiftIdx !== -1) {
                  const diasDescansoPrev = prevDias - 1 - lastShiftIdx;
                  const reqDescanso = 2 - diasDescansoPrev;
                  if (picker.diaIdx < reqDescanso) {
                    setModalState({ 
                      tipo: "error", 
                      titulo: "Asignación Inválida", 
                      mensaje: `No se puede asignar este turno.\n\nEl empleado tuvo su último turno operativo el día ${lastShiftIdx + 1} del mes pasado. Necesita al menos 2 días de descanso inter-mensual para iniciar un nuevo turno.\n\nSolo ha tenido ${diasDescansoPrev + picker.diaIdx} día(s) de descanso acumulados.`
                    });
                    setPicker(null);
                    return; // Cancela la asignación
                  }
                }
              }
            }
            
            setCelda(picker.filaIdx, picker.diaIdx, codigo);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Modal Genérico */}
      {modalState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden transform transition-all animate-in zoom-in-95 duration-200">
            <div className={`p-4 border-b ${
              modalState.tipo === "exito" ? "bg-emerald-50 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/50" : 
              modalState.tipo === "error" ? "bg-rose-50 border-rose-100 dark:bg-rose-950/30 dark:border-rose-900/50" : 
              "bg-amber-50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/50"
            }`}>
              <div className="flex items-center gap-2">
                {modalState.tipo === "exito" ? <Check className="text-emerald-600 dark:text-emerald-400" size={20} /> :
                 modalState.tipo === "error" ? <XCircle className="text-rose-600 dark:text-rose-400" size={20} /> :
                 <AlertTriangle className="text-amber-600 dark:text-amber-400" size={20} />}
                <h3 className={`font-bold ${
                  modalState.tipo === "exito" ? "text-emerald-800 dark:text-emerald-500" : 
                  modalState.tipo === "error" ? "text-rose-800 dark:text-rose-500" : 
                  "text-amber-800 dark:text-amber-500"
                }`}>
                  {modalState.titulo}
                </h3>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{modalState.mensaje}</p>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setModalState(null)}
                  className={`px-4 py-2 text-sm font-bold rounded-xl transition-colors ${
                    modalState.tipo === "exito" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : 
                    modalState.tipo === "error" ? "bg-rose-600 hover:bg-rose-500 text-white" : 
                    "bg-amber-500 hover:bg-amber-400 text-white"
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

function colorCelda(celda: string): string {
  const v = celda.trim().toUpperCase();
  if (!v) return "text-slate-300 dark:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800";
  if (getHorario(v)) return "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/60";
  if (esMarcaEspecial(v)) {
    if (v === "VAC") return "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300";
    if (v === "INC") return "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-300";
    if (v === "ASU") return "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300";
    // PER (permiso) — tono neutro de la paleta institucional (charcoal).
    return "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-[var(--color-institutional-charcoal)] dark:text-slate-200";
  }
  return "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300";
}
