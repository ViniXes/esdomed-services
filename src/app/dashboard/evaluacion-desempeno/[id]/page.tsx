"use client";

// Editor de una evaluación del desempeño (solo admin). `id === "nueva"` arranca
// eligiendo a la persona evaluada del personal ESDOMED vigente (misma lista que
// Personal de trabajo); al elegirla se precargan los datos generales con lo
// último que se usó para ella (ficha) o, si es la primera vez, con su perfil.
// Guardar escribe la evaluación y actualiza la ficha. "Vista de impresión"
// muestra el formulario MINSAL de 4 hojas para imprimir y firmar.

import { use, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Lightbulb, MessageCircleQuestion, Plus, Printer, Save, Search, Trash2, UserRound } from "lucide-react";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, Timestamp, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { UserProfile } from "@/types";
import {
  COLECCION_EVALUACIONES_DESEMPENO,
  COLECCION_FICHAS_EVALUACION,
  FACTORES,
  FILAS_INCIDENTES,
  OPCIONES,
  PUNTAJE_MAXIMO,
  calificacionDe,
  datosPrecargados,
  factoresCompletos,
  fichaDesdeDatos,
  periodoSemestral,
  SEMESTRES,
  aniosEvaluacion,
  armarPeriodo,
  partirPeriodo,
  type Semestre,
  puntajeDe,
  type DatosGeneralesEvaluacion,
  type EvaluacionDesempeno,
  type FichaEvaluacion,
  type IncidenteCritico,
  type Opcion,
  type RespuestasFactores,
} from "@/lib/evaluacionDesempeno";
import { EvaluacionDesempenoPrintLayout } from "@/components/evaluacionDesempeno/EvaluacionDesempenoPrintLayout";
import { RespaldoServices } from "@/components/evaluacionDesempeno/RespaldoServices";
import type { ResumenRespaldo } from "@/lib/evaluacionDesempenoRespaldo";
import { esAdministrativoPlan } from "@/lib/esdomed/catalogo-plan";
import { CRITERIOS_TEXTO, sugerirFactores, type Sugerencia } from "@/lib/evaluacionDesempenoSugerencias";

type Persona = Pick<UserProfile, "uid" | "nombre" | "dui" | "puesto" | "codigoMarcacion" | "role" | "activo">;

interface Borrador {
  empleadoId: string;
  empleadoNombre: string;
  datos: DatosGeneralesEvaluacion;
  respuestas: RespuestasFactores;
  incidentes: IncidenteCritico[];
  observacionesIncidentes: string;
  tiempoSupervisar: string;
  comentariosEvaluador: string;
  fechaEvaluador: string;
  fechaJefeSuperior: string;
  comentariosEvaluado: string;
  fechaEvaluado: string;
  acciones: string;
  fechaAcciones: string;
  respaldo: ResumenRespaldo | null;
}

const VACIO: Omit<Borrador, "empleadoId" | "empleadoNombre" | "datos"> = {
  respuestas: {},
  incidentes: [],
  observacionesIncidentes: "",
  tiempoSupervisar: "",
  comentariosEvaluador: "",
  fechaEvaluador: "",
  fechaJefeSuperior: "",
  comentariosEvaluado: "",
  fechaEvaluado: "",
  acciones: "",
  fechaAcciones: "",
  respaldo: null,
};

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es").trim();

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const etiqueta = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";

export default function EditorEvaluacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const esNueva = id === "nueva";
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const esAdmin = profile?.role === "admin";

  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [cargando, setCargando] = useState(!esNueva);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [vista, setVista] = useState(false);
  const [docId, setDocId] = useState<string | null>(esNueva ? null : id);
  const [duplicada, setDuplicada] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState("");

  useEffect(() => {
    if (!authLoading && profile && !esAdmin) router.replace("/dashboard");
  }, [authLoading, profile, esAdmin, router]);

  // Evaluación existente
  useEffect(() => {
    if (!esAdmin || esNueva) return;
    let cancelado = false;
    getDoc(doc(db, COLECCION_EVALUACIONES_DESEMPENO, id))
      .then((snap) => {
        if (cancelado) return;
        if (!snap.exists()) {
          setError("No se encontró esta evaluación.");
          return;
        }
        const e = snap.data() as EvaluacionDesempeno;
        setBorrador({ ...VACIO, ...e, respuestas: e.respuestas ?? {}, incidentes: e.incidentes ?? [] });
      })
      .catch(() => {
        if (!cancelado) setError("No se pudo cargar la evaluación.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [esAdmin, esNueva, id]);

  // Desde el listado, "Imprimir" abre directo la vista de impresión.
  const hayBorrador = !!borrador;
  useEffect(() => {
    if (hayBorrador && new URLSearchParams(window.location.search).get("imprimir") === "1") {
      queueMicrotask(() => setVista(true));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [hayBorrador]);

  // Aviso: la persona ya tiene otra evaluación del mismo periodo.
  const empleadoId = borrador?.empleadoId;
  const periodo = borrador?.datos.periodo;
  useEffect(() => {
    if (!esAdmin || !empleadoId || !periodo) return;
    let cancelado = false;
    getDocs(query(collection(db, COLECCION_EVALUACIONES_DESEMPENO), where("empleadoId", "==", empleadoId)))
      .then((snap) => {
        if (cancelado) return;
        const otra = snap.docs.find((d) => d.id !== docId && (d.data() as EvaluacionDesempeno).periodo === periodo);
        setDuplicada(otra ? otra.id : null);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [esAdmin, empleadoId, periodo, docId]);

  // Personal ESDOMED vigente: equipo operativo para el promedio del respaldo y
  // si la persona evaluada es administrativa (su trabajo no se mide en Services).
  const [equipo, setEquipo] = useState<Persona[]>([]);
  useEffect(() => {
    if (!esAdmin || !empleadoId) return;
    let cancelado = false;
    getDocs(query(collection(db, "usuarios"), where("role", "in", ["esdomed", "asistente_esdomed", "admin"])))
      .then((snap) => {
        if (!cancelado) setEquipo(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as Persona));
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [esAdmin, empleadoId]);
  const evaluado = equipo.find((p) => p.uid === empleadoId);
  const evaluadoAdministrativo = evaluado ? esAdministrativoPlan({ codigoMarcacion: evaluado.codigoMarcacion ?? "" }) : false;
  const equipoOperativo = useMemo(
    () =>
      equipo
        .filter((p) => p.activo !== false && (p.role !== "admin" || Boolean(p.codigoMarcacion?.trim())))
        .filter((p) => !esAdministrativoPlan({ codigoMarcacion: p.codigoMarcacion ?? "" }))
        .map((p) => ({ uid: p.uid, nombre: p.nombre, codigoMarcacion: p.codigoMarcacion })),
    [equipo],
  );
  const respaldoVigente = borrador?.respaldo?.periodo === borrador?.datos.periodo ? (borrador?.respaldo ?? null) : null;
  const sugerencias = useMemo(() => sugerirFactores(respaldoVigente, evaluadoAdministrativo), [respaldoVigente, evaluadoAdministrativo]);
  const sugeridasPendientes = FACTORES.filter((f) => sugerencias[f.numero]?.letra && !borrador?.respuestas[f.numero]);

  const puntaje = useMemo(() => puntajeDe(borrador?.respuestas ?? {}), [borrador?.respuestas]);
  const completos = factoresCompletos(borrador?.respuestas ?? {});
  const calificacion = completos ? calificacionDe(puntaje) : null;

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setBorrador((b) => (b ? { ...b, [k]: v } : b));
  const setDato = (k: keyof DatosGeneralesEvaluacion, v: string) => setBorrador((b) => (b ? { ...b, datos: { ...b.datos, [k]: v } } : b));

  const elegirPersona = async (p: Persona, periodoElegido: string) => {
    setCargando(true);
    let ficha: Partial<FichaEvaluacion> | null = null;
    try {
      const s = await getDoc(doc(db, COLECCION_FICHAS_EVALUACION, p.uid));
      ficha = s.exists() ? (s.data() as Partial<FichaEvaluacion>) : null;
    } catch {
      ficha = null;
    }
    setBorrador({
      ...VACIO,
      empleadoId: p.uid,
      empleadoNombre: p.nombre,
      datos: datosPrecargados(p, ficha, periodoElegido),
    });
    setCargando(false);
  };

  const guardar = async () => {
    if (!borrador || !profile) return;
    setGuardando(true);
    setMensaje("");
    try {
      const ahora = Timestamp.now();
      const incidentes = borrador.incidentes.filter((i) => i.fecha || i.descripcion.trim());
      const cuerpo = {
        ...borrador,
        incidentes,
        periodo: borrador.datos.periodo,
        puntaje,
        calificacion,
        actualizadoEn: ahora,
      };
      if (docId) {
        await setDoc(doc(db, COLECCION_EVALUACIONES_DESEMPENO, docId), cuerpo, { merge: true });
      } else {
        const ref = await addDoc(collection(db, COLECCION_EVALUACIONES_DESEMPENO), {
          ...cuerpo,
          creadoPorId: profile.uid,
          creadoPorNombre: profile.nombre,
          creadoEn: ahora,
        });
        setDocId(ref.id);
        window.history.replaceState(null, "", `/dashboard/evaluacion-desempeno/${ref.id}`);
      }
      await setDoc(doc(db, COLECCION_FICHAS_EVALUACION, borrador.empleadoId), {
        ...fichaDesdeDatos(borrador.datos),
        actualizadoEn: ahora,
      });
      setBorrador((b) => (b ? { ...b, incidentes } : b));
      setMensaje("Evaluación guardada.");
    } catch (e) {
      console.error(e);
      setMensaje("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  // Borra solo esta evaluación (la ficha con los datos laborales de la persona se conserva).
  const eliminar = async () => {
    if (!docId) return;
    setEliminando(true);
    setErrorEliminar("");
    try {
      await deleteDoc(doc(db, COLECCION_EVALUACIONES_DESEMPENO, docId));
      router.push("/dashboard/evaluacion-desempeno");
    } catch (e) {
      console.error(e);
      setErrorEliminar("No se pudo eliminar. Intenta de nuevo.");
      setEliminando(false);
    }
  };

  if (authLoading || !profile || !esAdmin) return null;

  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <Volver />
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      </div>
    );
  }
  if (cargando) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }
  if (!borrador) return <SelectorPersona onElegir={elegirPersona} />;

  const d = borrador.datos;
  const evImprimible = { ...borrador, puntaje, calificacion };

  return (
    <div className="p-4 md:p-6 pb-28 max-w-4xl mx-auto space-y-5">
      <Volver />

      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
          <UserRound size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold font-heading text-slate-900 dark:text-slate-100">{borrador.empleadoNombre}</h1>
          <p className="text-xs text-slate-500">Evaluación del desempeño · {d.periodo}</p>
        </div>
      </div>

      {duplicada && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Esta persona ya tiene una evaluación del periodo {d.periodo}.{" "}
          <Link href={`/dashboard/evaluacion-desempeno/${duplicada}`} className="font-semibold underline">
            Abrir la existente
          </Link>
        </div>
      )}

      {/* I. Datos generales */}
      <Tarjeta titulo="I. Datos generales" nota="Precargados con lo último usado para esta persona; puedes corregirlos antes de guardar.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Dependencia" value={d.dependencia} onChange={(v) => setDato("dependencia", v)} />
          <div>
            <label className={etiqueta}>Periodo de evaluación</label>
            <SelectorSemestre value={d.periodo} onChange={(v) => setDato("periodo", v)} />
          </div>
          <Campo label="DUI" value={d.dui} onChange={(v) => setDato("dui", v)} placeholder="00000000-0" />
          <Campo label="Nombre del empleado" value={d.nombre} onChange={(v) => setDato("nombre", v)} />
          <Campo label="Cargo según nombramiento" value={d.cargoNombramiento} onChange={(v) => setDato("cargoNombramiento", v)} />
          <Campo label="Cargo según funciones" value={d.cargoFunciones} onChange={(v) => setDato("cargoFunciones", v)} />
          <Campo label="A partir de" value={d.aPartirDe} onChange={(v) => setDato("aPartirDe", v)} />
          <Campo label="Fecha de ingreso" value={d.fechaIngreso} onChange={(v) => setDato("fechaIngreso", v)} placeholder="13/9/2021" />
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <Campo label="Partida" value={d.partida} onChange={(v) => setDato("partida", v)} />
            <Campo label="Subnúmero" value={d.subnumero} onChange={(v) => setDato("subnumero", v)} />
            <Campo label="Sueldo ($)" value={d.sueldo} onChange={(v) => setDato("sueldo", v)} placeholder="719.72" />
          </div>
          <Campo label="Nombre del jefe inmediato" value={d.jefeNombre} onChange={(v) => setDato("jefeNombre", v)} />
          <Campo label="Puesto del jefe inmediato" value={d.jefePuesto} onChange={(v) => setDato("jefePuesto", v)} />
          <div className="sm:col-span-2">
            <Campo label="Unidad administrativa (opcional)" value={d.unidadAdministrativa} onChange={(v) => setDato("unidadAdministrativa", v)} />
          </div>
        </div>
      </Tarjeta>

      <RespaldoServices
        key={`${borrador.empleadoId}-${d.periodo}`}
        empleadoId={borrador.empleadoId}
        nombre={borrador.empleadoNombre}
        periodo={d.periodo}
        codigoMarcacion={evaluado?.codigoMarcacion}
        esAdministrativo={evaluadoAdministrativo}
        equipo={equipoOperativo}
        respaldo={respaldoVigente}
        onRespaldo={(r) => set("respaldo", r)}
        onAgregarIncidente={(inc) =>
          setBorrador((b) => (b && b.incidentes.length < FILAS_INCIDENTES ? { ...b, incidentes: [...b.incidentes, inc] } : b))
        }
      />

      {/* II. Factores */}
      <Tarjeta
        titulo="II. Evaluación general por parte del jefe inmediato"
        nota={
          respaldoVigente
            ? "Elige una opción por factor. La letra con borde punteado es la sugerida por los datos de Services; tú decides."
            : "Elige una opción por factor; el puntaje sale de la Tabla de Valoración oficial. Carga el respaldo de Services para ver letras sugeridas."
        }
      >
        {sugeridasPendientes.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50/60 px-3 py-2 dark:border-cyan-900 dark:bg-cyan-950/30">
            <Lightbulb size={15} className="text-cyan-700 dark:text-cyan-300" />
            <span className="text-xs text-slate-700 dark:text-slate-200">
              Hay {sugeridasPendientes.length} factor(es) sin marcar con letra sugerida.
            </span>
            <button
              type="button"
              onClick={() =>
                set("respuestas", {
                  ...borrador.respuestas,
                  ...Object.fromEntries(sugeridasPendientes.map((f) => [f.numero, sugerencias[f.numero].letra as Opcion])),
                })
              }
              className="ml-auto rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600"
            >
              Usar sugeridas en los vacíos
            </button>
          </div>
        )}
        <div className="space-y-5">
          {FACTORES.map((f) => (
            <div key={f.numero}>
              <p className="text-sm font-bold tracking-wide text-slate-900 dark:text-slate-100">
                {f.numero}. {f.titulo}
              </p>
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{f.definicion}</p>
              <div className="flex items-start gap-2" data-fila-factor>
              <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {OPCIONES.map((o) => {
                  const activa = borrador.respuestas[f.numero] === o;
                  const sugerida = sugerencias[f.numero]?.letra === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => set("respuestas", { ...borrador.respuestas, [f.numero]: o as Opcion })}
                      aria-pressed={activa}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        activa
                          ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:border-blue-400 dark:bg-blue-950/50"
                          : sugerida
                            ? "border-2 border-dashed border-cyan-500 bg-white hover:border-blue-300 dark:border-cyan-600 dark:bg-slate-950"
                            : "border-slate-200 bg-white hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-blue-700"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className={`text-sm font-bold ${activa ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-200"}`}>{o}</span>
                        <span className="flex items-center gap-1.5">
                          {sugerida && <span className="rounded-full bg-cyan-100 px-1.5 py-px text-[10px] font-semibold text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-200">Sugerida</span>}
                          <span className="text-[11px] font-semibold tabular-nums text-slate-400">{f.puntos[o]} pts</span>
                        </span>
                      </div>
                      <p className="whitespace-pre-line text-xs leading-snug text-slate-600 dark:text-slate-300">{f.descriptores[o]}</p>
                    </button>
                  );
                })}
              </div>
              <GloboPorque factor={f.numero} sugerencia={sugerencias[f.numero]} cargado={!!respaldoVigente} />
              </div>
            </div>
          ))}
        </div>
      </Tarjeta>

      {/* Registro de incidentes críticos */}
      <Tarjeta titulo="Registro individual de incidentes críticos" nota={`Opcional. Hasta ${FILAS_INCIDENTES} filas en la hoja impresa. F = favorable, D = desfavorable.`}>
        <div className="space-y-2">
          {borrador.incidentes.map((inc, i) => {
            const cambiar = (p: Partial<IncidenteCritico>) =>
              set("incidentes", borrador.incidentes.map((x, j) => (j === i ? { ...x, ...p } : x)));
            return (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-slate-200 p-2 sm:grid-cols-[9rem_6rem_5rem_1fr_auto] dark:border-slate-700">
                <input type="date" className={`${input} col-span-2 sm:col-span-1`} value={inc.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} />
                <select className={input} value={inc.factor} onChange={(e) => cambiar({ factor: Number(e.target.value) })} aria-label="Factor">
                  {FACTORES.map((f) => (
                    <option key={f.numero} value={f.numero}>
                      Factor {f.numero}
                    </option>
                  ))}
                </select>
                <select className={input} value={inc.tipo} onChange={(e) => cambiar({ tipo: e.target.value as "F" | "D" })} aria-label="Tipo">
                  <option value="F">F</option>
                  <option value="D">D</option>
                </select>
                <input className={`${input} col-span-2 sm:col-span-1`} value={inc.descripcion} onChange={(e) => cambiar({ descripcion: e.target.value })} placeholder="Descripción del evento" />
                <button
                  type="button"
                  onClick={() => set("incidentes", borrador.incidentes.filter((_, j) => j !== i))}
                  className="flex items-center justify-center rounded-lg px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                  aria-label="Quitar incidente"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
          {borrador.incidentes.length < FILAS_INCIDENTES && (
            <button
              type="button"
              onClick={() => set("incidentes", [...borrador.incidentes, { fecha: "", factor: 1, tipo: "F", descripcion: "" }])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300"
            >
              <Plus size={14} /> Agregar incidente
            </button>
          )}
          <Area label="Observaciones" value={borrador.observacionesIncidentes} onChange={(v) => set("observacionesIncidentes", v)} rows={2} />
        </div>
      </Tarjeta>

      {/* III y IV */}
      <Tarjeta titulo="III. Resultados de la evaluación del desempeño" nota="La calificación se marca sola según el puntaje. Las fechas vacías quedan para llenarse a mano.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Tiempo de supervisar al evaluado" value={borrador.tiempoSupervisar} onChange={(v) => set("tiempoSupervisar", v)} placeholder="Ej. 6 meses" />
          <div className="flex items-end">
            <ResumenPuntaje puntaje={puntaje} calificacion={calificacion} />
          </div>
          <div className="sm:col-span-2">
            <Area label="Comentarios del evaluador" value={borrador.comentariosEvaluador} onChange={(v) => set("comentariosEvaluador", v)} rows={2} />
          </div>
          <Campo type="date" label="Fecha (firma del evaluador)" value={borrador.fechaEvaluador} onChange={(v) => set("fechaEvaluador", v)} />
          <Campo type="date" label="Fecha (jefe inmediato superior)" value={borrador.fechaJefeSuperior} onChange={(v) => set("fechaJefeSuperior", v)} />
        </div>
      </Tarjeta>

      <Tarjeta titulo="IV. Comunicación de la calificación al evaluado">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Area label="Comentarios del evaluado" value={borrador.comentariosEvaluado} onChange={(v) => set("comentariosEvaluado", v)} rows={2} />
          </div>
          <Campo type="date" label="Fecha (firma del evaluado)" value={borrador.fechaEvaluado} onChange={(v) => set("fechaEvaluado", v)} />
          <div />
          <div className="sm:col-span-2">
            <Area
              label="Acciones acordadas con el empleado para mejorar su desempeño en el próximo periodo, u otras observaciones"
              value={borrador.acciones}
              onChange={(v) => set("acciones", v)}
              rows={4}
            />
          </div>
          <Campo type="date" label="Fecha (firma de acciones acordadas)" value={borrador.fechaAcciones} onChange={(v) => set("fechaAcciones", v)} />
        </div>
      </Tarjeta>

      {/* Barra de acciones */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:left-auto md:w-[calc(100%-var(--sidebar-w,0px))] dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-3">
          <ResumenPuntaje puntaje={puntaje} calificacion={calificacion} compacto />
          {mensaje && <span className="text-xs text-slate-500 dark:text-slate-400">{mensaje}</span>}
          <div className="ml-auto flex gap-2">
            {docId && (
              <button
                type="button"
                onClick={() => setConfirmarEliminar(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                <Trash2 size={15} /> Eliminar
              </button>
            )}
            <button
              type="button"
              onClick={() => setVista(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Eye size={15} /> Vista de impresión
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              <Save size={15} /> {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>

      {confirmarEliminar && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-eliminar">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <h2 id="titulo-eliminar" className="text-base font-bold text-slate-900 dark:text-slate-100">
              ¿Eliminar esta evaluación?
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Se borrará la evaluación de <strong>{borrador.empleadoNombre}</strong> del periodo <strong>{d.periodo}</strong>: letras, puntaje,
              incidentes, comentarios y el respaldo guardado. <strong>No se puede deshacer.</strong>
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Los datos laborales de la persona (DUI, partida, sueldo…) se conservan para la próxima evaluación.
            </p>
            {errorEliminar && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{errorEliminar}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmarEliminar(false)}
                disabled={eliminando}
                autoFocus
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={eliminar}
                disabled={eliminando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
              >
                <Trash2 size={15} /> {eliminando ? "Eliminando…" : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {vista &&
        createPortal(
          <div className="formato-impresion fixed inset-0 z-[220] overflow-y-auto bg-slate-200 print:static print:inset-auto print:overflow-visible print:bg-white dark:bg-slate-950">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white shadow-sm print:hidden dark:border-slate-800 dark:bg-slate-900">
              <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
                <button
                  onClick={() => setVista(false)}
                  className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  <ArrowLeft size={15} /> Volver al formulario
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  <Printer size={14} /> Imprimir / Guardar PDF
                </button>
              </div>
            </div>
            <div className="overflow-x-auto py-6 print:overflow-visible print:py-0">
              <div className="mx-auto w-fit print:w-auto">
                <EvaluacionDesempenoPrintLayout ev={evImprimible} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Volver() {
  return (
    <Link href="/dashboard/evaluacion-desempeno" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline dark:text-blue-400">
      <ArrowLeft size={14} /> Volver a Evaluación de personal
    </Link>
  );
}

function Tarjeta({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">{titulo}</h2>
      {nota && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{nota}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className={etiqueta}>{label}</label>
      <input type={type} className={input} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Area({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <div>
      <label className={etiqueta}>{label}</label>
      <textarea className={input} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ResumenPuntaje({ puntaje, calificacion, compacto }: { puntaje: number; calificacion: string | null; compacto?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${compacto ? "" : "rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700"}`}>
      <span className="text-sm text-slate-500 dark:text-slate-400">Puntaje</span>
      <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
        {puntaje}
        <span className="text-xs font-medium text-slate-400">/{PUNTAJE_MAXIMO}</span>
      </span>
      {calificacion ? (
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
          {calificacion}
        </span>
      ) : (
        <span className="text-xs text-amber-600 dark:text-amber-400">Faltan factores</span>
      )}
    </div>
  );
}

/** Paso inicial de una evaluación nueva: personal ESDOMED vigente + periodo. */
function SelectorPersona({ onElegir }: { onElegir: (p: Persona, periodo: string) => void }) {
  const [personal, setPersonal] = useState<Persona[] | null>(null);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  // Desde el archivo (?periodo=…&empleado=…): llega con el semestre y, si
  // viene de "Faltan por evaluar", con la persona ya elegida.
  const [periodo, setPeriodo] = useState(() => {
    if (typeof window === "undefined") return periodoSemestral();
    const p = new URLSearchParams(window.location.search).get("periodo");
    return p ? armarPeriodo(partirPeriodo(p).semestre, partirPeriodo(p).anio) : periodoSemestral();
  });

  useEffect(() => {
    let cancelado = false;
    getDocs(query(collection(db, "usuarios"), where("role", "in", ["esdomed", "asistente_esdomed", "admin"])))
      .then((snap) => {
        if (cancelado) return;
        const lista = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() }) as Persona)
          // Mismo criterio que Personal de trabajo: admin solo si tiene código; solo vigentes.
          .filter((u) => u.role !== "admin" || Boolean(u.codigoMarcacion?.trim()))
          .filter((u) => u.activo !== false)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        setPersonal(lista);
        const params = new URLSearchParams(window.location.search);
        const elegido = lista.find((p) => p.uid === params.get("empleado"));
        if (elegido) {
          const p = params.get("periodo");
          onElegir(elegido, p ? armarPeriodo(partirPeriodo(p).semestre, partirPeriodo(p).anio) : periodoSemestral());
        }
      })
      .catch(() => {
        if (!cancelado) setError("No se pudo cargar el personal.");
      });
    return () => {
      cancelado = true;
    };
    // Solo al montar: la preselección de la URL se aplica una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
  const visibles = (personal ?? []).filter((p) => {
    const t = normalizar(`${p.nombre} ${p.puesto ?? ""} ${p.codigoMarcacion ?? ""}`);
    return palabras.every((w) => t.includes(w));
  });

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <Volver />
      <div>
        <h1 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100">Nueva evaluación</h1>
        <p className="text-sm text-slate-500">Elige el periodo y a la persona evaluada; sus datos generales se precargan.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[16rem_1fr]">
        <div>
          <label className={etiqueta}>Periodo</label>
          <SelectorSemestre value={periodo} onChange={setPeriodo} />
        </div>
        <div>
          <label className={etiqueta}>Persona evaluada</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, puesto o código" className={`${input} pl-9`} />
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {personal === null && !error ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {visibles.map((p) => (
            <li key={p.uid}>
              <button
                type="button"
                disabled={!periodo.trim()}
                onClick={() => onElegir(p, periodo.trim())}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800/60"
              >
                <UserRound size={16} className="shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{p.nombre}</p>
                  <p className="truncate text-xs text-slate-500">
                    {p.puesto || "Sin puesto"}
                    {p.codigoMarcacion ? ` · ${p.codigoMarcacion}` : ""}
                  </p>
                </div>
              </button>
            </li>
          ))}
          {visibles.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Nadie coincide con la búsqueda.</li>}
        </ul>
      )}
    </div>
  );
}

/** Periodo = uno de los dos semestres fijos del año + el año. */
function SelectorSemestre({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { semestre, anio } = partirPeriodo(value);
  return (
    <div className="grid grid-cols-[1fr_6rem] gap-2">
      <select className={input} value={semestre} onChange={(e) => onChange(armarPeriodo(e.target.value as Semestre, anio))} aria-label="Semestre">
        {SEMESTRES.map((s) => (
          <option key={s} value={s}>
            {s === "ENE - JUN" ? "Enero – Junio" : "Julio – Diciembre"}
          </option>
        ))}
      </select>
      <select className={input} value={anio} onChange={(e) => onChange(armarPeriodo(semestre, Number(e.target.value)))} aria-label="Año">
        {[...new Set([anio, ...aniosEvaluacion()])].sort((a, b) => b - a).map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Globito junto a las casillas de cada factor: por qué se sugiere esa letra
 * (dato de Services + regla). Se abre al pasar el mouse o al tocarlo y NUNCA
 * tapa los literales: sale a la derecha si hay espacio; si no, debajo de la
 * fila completa de casillas.
 */
const ANCHO_GLOBO = 288;

function GloboPorque({ factor, sugerencia, cargado }: { factor: number; sugerencia?: Sugerencia; cargado: boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [fijo, setFijo] = useState(false); // abierto con clic/toque (no solo hover)
  const regla = CRITERIOS_TEXTO.find((c) => c.factor === factor);
  const letra = sugerencia?.letra ?? null;

  const abrir = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const b = btn.getBoundingClientRect();
    if (window.innerWidth - b.right >= ANCHO_GLOBO + 16) {
      setPos({ left: b.right + 8, top: b.top });
    } else {
      const fila = (btn.closest("[data-fila-factor]") as HTMLElement | null)?.getBoundingClientRect() ?? b;
      setPos({ left: Math.max(8, fila.right - ANCHO_GLOBO), top: fila.bottom + 8 });
    }
  };
  const cerrar = () => {
    setPos(null);
    setFijo(false);
  };

  // Posición fija en pantalla: al desplazarse o cambiar el tamaño se cierra.
  useEffect(() => {
    if (!pos) return;
    const fuera = () => cerrar();
    window.addEventListener("scroll", fuera, true);
    window.addEventListener("resize", fuera);
    return () => {
      window.removeEventListener("scroll", fuera, true);
      window.removeEventListener("resize", fuera);
    };
  }, [pos]);

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={abrir}
        onMouseLeave={() => !fijo && setPos(null)}
        onClick={() => {
          if (fijo) cerrar();
          else {
            abrir();
            setFijo(true);
          }
        }}
        onBlur={cerrar}
        onKeyDown={(e) => e.key === "Escape" && cerrar()}
        aria-expanded={!!pos}
        aria-label={`Por qué se sugiere esta evaluación en el factor ${factor}`}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
          letra
            ? "border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300"
            : "border-slate-200 bg-white text-slate-400 hover:text-slate-600 dark:border-slate-700 dark:bg-slate-900"
        }`}
      >
        <MessageCircleQuestion size={17} />
        {letra && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-700 px-1 text-[9px] font-bold text-white">
            {letra}
          </span>
        )}
      </button>
      {pos && (
        <div
          role="tooltip"
          style={{ position: "fixed", left: pos.left, top: pos.top, width: ANCHO_GLOBO }}
          className="z-50 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
            {!cargado ? "¿Por qué esta evaluación?" : letra ? `¿Por qué se sugiere ${letra}?` : "Sin sugerencia automática"}
          </p>
          <p className="mt-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
            {!cargado ? "Carga el respaldo de Services (arriba) para ver el dato que sustenta este factor." : sugerencia?.motivo ?? "Sin datos para este factor."}
          </p>
          {regla && (
            <div className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <p>
                <span className="font-semibold text-slate-600 dark:text-slate-300">Dato:</span> {regla.dato}
              </p>
              <p>
                <span className="font-semibold text-slate-600 dark:text-slate-300">Regla:</span> {regla.regla}
              </p>
            </div>
          )}
          <p className="mt-2 text-[10px] text-slate-400">Es una sugerencia: la letra la decide el evaluador.</p>
        </div>
      )}
    </div>
  );
}
