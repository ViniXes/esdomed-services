"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, query, orderBy, getDocs, getDoc, doc, updateDoc, runTransaction, Timestamp, limit, where, type QueryConstraint } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle, CalendarCheck, CheckCircle2, ChevronRight, Inbox, List, MessageSquareText,
  Paperclip, RefreshCw, Search, X,
} from "lucide-react";
import type { AjusteHorasTramite, FilaPlanTrabajo, PlanTrabajo, TramitePersonal, CategoriaTramitePersonal, EstadoTramitePersonal } from "@/types";
import { toDate } from "@/lib/pacientes/helpers";
import { esAdministrativoPlan } from "@/lib/esdomed/catalogo-plan";
import {
  aplicarPermisoEnFilas,
  esPermisoDeUnTurno,
  esPermisoPersonal,
  fechasDelPermiso,
  periodoDeFecha,
  periodosDelPermiso,
  reaplicarPermisoEnFilas,
} from "@/lib/esdomed/permisos-plan";
import { getHorario } from "@/lib/esdomed/horarios";
import { labelPeriodo, parsePeriodo } from "@/lib/esdomed/plan";
import {
  CATEGORIAS_TRAMITE, ESTADO_TRAMITE_LABEL, ESTADO_TRAMITE_PILL, docsDeTramite, fechaLegible, partesCategoria,
  type ConflictoPermisoGrupo,
} from "@/lib/tramitesPersonal";
import { DateField } from "@/components/ui/DateField";
import { TramiteDetalleModal } from "@/components/tramites/TramiteDetalleModal";

const filaDelEmpleado = (plan: PlanTrabajo | undefined, empleadoId: string): FilaPlanTrabajo | undefined =>
  plan?.filas?.find((fila) => fila.uid === empleadoId);

const grupoOperativo = (plan: PlanTrabajo | undefined, empleadoId: string): string | null => {
  const fila = filaDelEmpleado(plan, empleadoId);
  if (!fila || esAdministrativoPlan(fila)) return null;
  const grupo = fila.grupo?.trim() ?? "";
  return grupo && grupo.toLowerCase() !== "administrativo" ? grupo : null;
};

const msCreado = (t: TramitePersonal) => toDate(t.creadoEn)?.getTime() ?? 0;
const porCreadoDesc = (a: TramitePersonal, b: TramitePersonal) => msCreado(b) - msCreado(a);

type Empleado = { uid: string; nombre: string; baja: boolean };
type Filtros = {
  empleadoId: string;
  categoria: "" | CategoriaTramitePersonal;
  estado: "" | EstadoTramitePersonal;
  desde: string;
  hasta: string;
};
const FILTROS_VACIOS: Filtros = { empleadoId: "", categoria: "", estado: "", desde: "", hasta: "" };
const LIMITE_BUSQUEDA = 300;
const LIMITE_TODOS = 400;

// Cachés a nivel módulo: persisten mientras no se recargue la página (no en F5).
let cachePendientes: TramitePersonal[] | null = null;
let cacheEmpleados: Empleado[] | null = null;

const SELECT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export default function AprobacionTramitesPage() {
  const { user, profile } = useAuth();
  const [vista, setVista] = useState<"pendientes" | "buscar">("pendientes");

  // ── Pendientes: consulta pequeña (solo estado == pendiente) al entrar ──
  const [pendientes, setPendientes] = useState<TramitePersonal[]>(() => cachePendientes ?? []);
  const [cargandoPendientes, setCargandoPendientes] = useState(cachePendientes === null);

  // ── Buscar: filtros que van al servidor; "Consultar todos" trae los más recientes ──
  const [empleados, setEmpleados] = useState<Empleado[]>(() => cacheEmpleados ?? []);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [resultados, setResultados] = useState<TramitePersonal[] | null>(null);
  const [buscando, setBuscando] = useState<"filtros" | "todos" | null>(null);
  const [tope, setTope] = useState<number | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);

  // ── Ficha y resolución ──
  const [detalle, setDetalle] = useState<TramitePersonal | null>(null);
  const [comentarioAdmin, setComentarioAdmin] = useState("");
  const [accionAdmin, setAccionAdmin] = useState<"aprobado" | "rechazado">("aprobado");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultadoPlan, setResultadoPlan] = useState<{ titulo: string; lineas: string[]; tono: "exito" | "alerta" } | null>(null);
  const [conflictosPermiso, setConflictosPermiso] = useState<ConflictoPermisoGrupo[]>([]);
  const [advertenciasPermiso, setAdvertenciasPermiso] = useState<ConflictoPermisoGrupo[]>([]);
  const [revisandoCoincidencias, setRevisandoCoincidencias] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const [errorAjuste, setErrorAjuste] = useState<string | null>(null);

  const leerPendientes = useCallback(async () => {
    const snap = await getDocs(query(collection(db, "tramites_personal"), where("estado", "==", "pendiente"), limit(LIMITE_BUSQUEDA)));
    const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TramitePersonal)).sort(porCreadoDesc);
    cachePendientes = lista;
    return lista;
  }, []);

  useEffect(() => {
    if (cachePendientes !== null) return;
    let vivo = true;
    leerPendientes()
      .then((lista) => { if (vivo) setPendientes(lista); })
      .catch((err) => console.error("No se pudieron cargar los trámites pendientes", err))
      .finally(() => { if (vivo) setCargandoPendientes(false); });
    return () => { vivo = false; };
  }, [leerPendientes]);

  const actualizarPendientes = async () => {
    setCargandoPendientes(true);
    try {
      setPendientes(await leerPendientes());
    } catch (err) {
      console.error("No se pudieron cargar los trámites pendientes", err);
    } finally {
      setCargandoPendientes(false);
    }
  };

  // Personal de ESDOMED para el filtro por empleado: se lee una vez, al abrir Buscar.
  // Incluye a los dados de baja: su historial de trámites sigue siendo consultable.
  useEffect(() => {
    if (vista !== "buscar" || cacheEmpleados) return;
    let vivo = true;
    getDocs(query(collection(db, "usuarios"), where("role", "in", ["esdomed", "asistente_esdomed", "admin"])))
      .then((snap) => {
        const lista = snap.docs
          .map((d) => ({ uid: d.id, nombre: String(d.data().nombre ?? ""), baja: d.data().activo === false }))
          .filter((e) => e.nombre)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        cacheEmpleados = lista;
        if (vivo) setEmpleados(lista);
      })
      .catch((err) => console.error("No se pudo cargar el personal", err));
    return () => { vivo = false; };
  }, [vista]);

  const hayFiltros = Object.values(filtros).some(Boolean);

  // Un solo filtro va al servidor (el más selectivo: empleado > trámite >
  // fechas > estado) para no depender de índices compuestos; el resto se
  // aplica sobre lo que llegó. Así solo se leen los trámites que coinciden.
  const buscar = async () => {
    if (!hayFiltros) return;
    const f = filtros;
    const desde = f.desde ? new Date(`${f.desde}T00:00:00`) : null;
    const hasta = f.hasta ? new Date(`${f.hasta}T23:59:59.999`) : null;
    const restricciones: QueryConstraint[] = f.empleadoId
      ? [where("empleadoId", "==", f.empleadoId)]
      : f.categoria
        ? [where("categoria", "==", f.categoria)]
        : desde || hasta
          ? [
              ...(desde ? [where("creadoEn", ">=", Timestamp.fromDate(desde))] : []),
              ...(hasta ? [where("creadoEn", "<=", Timestamp.fromDate(hasta))] : []),
              orderBy("creadoEn", "desc"),
            ]
          : [where("estado", "==", f.estado)];

    setBuscando("filtros");
    setErrorBusqueda(null);
    try {
      const snap = await getDocs(query(collection(db, "tramites_personal"), ...restricciones, limit(LIMITE_BUSQUEDA)));
      const lista = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as TramitePersonal))
        .filter((t) => {
          if (f.empleadoId && t.empleadoId !== f.empleadoId) return false;
          if (f.categoria && t.categoria !== f.categoria) return false;
          if (f.estado && t.estado !== f.estado) return false;
          const creado = msCreado(t);
          if (desde && creado < desde.getTime()) return false;
          if (hasta && creado > hasta.getTime()) return false;
          return true;
        })
        .sort(porCreadoDesc);
      setResultados(lista);
      setTope(snap.size >= LIMITE_BUSQUEDA ? LIMITE_BUSQUEDA : null);
    } catch (err) {
      console.error("No se pudo buscar", err);
      setErrorBusqueda("No se pudo completar la búsqueda. Intenta de nuevo.");
    } finally {
      setBuscando(null);
    }
  };

  const consultarTodos = async () => {
    setBuscando("todos");
    setErrorBusqueda(null);
    try {
      const snap = await getDocs(query(collection(db, "tramites_personal"), orderBy("creadoEn", "desc"), limit(LIMITE_TODOS)));
      setResultados(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TramitePersonal)));
      setTope(snap.size >= LIMITE_TODOS ? LIMITE_TODOS : null);
    } catch (err) {
      console.error("No se pudo consultar", err);
      setErrorBusqueda("No se pudo completar la consulta. Intenta de nuevo.");
    } finally {
      setBuscando(null);
    }
  };

  const buscarCoincidenciasPermiso = async (
    solicitud: TramitePersonal,
    estadoAComparar: "pendiente" | "aprobado",
  ): Promise<ConflictoPermisoGrupo[]> => {
    if (!esPermisoPersonal(solicitud)) return [];

    const permisosSnap = await getDocs(
      query(collection(db, "tramites_personal"), where("estado", "==", estadoAComparar)),
    );
    const permisos = permisosSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as TramitePersonal))
      .filter((tramite) =>
        tramite.id !== solicitud.id
        && tramite.empleadoId !== solicitud.empleadoId
        && esPermisoPersonal(tramite),
      );
    const fechasSolicitadas = fechasDelPermiso(solicitud);
    const fechasARevisar = new Set(
      permisos.flatMap((permiso) =>
        fechasDelPermiso(permiso).filter((fecha) => fechasSolicitadas.includes(fecha)),
      ),
    );
    if (fechasARevisar.size === 0) return [];

    const planes = new Map<string, PlanTrabajo>();
    await Promise.all(
      [...new Set([...fechasARevisar].map(periodoDeFecha))].map(async (periodo) => {
        const planSnap = await getDoc(doc(db, "planes_trabajo", periodo));
        if (planSnap.exists()) planes.set(periodo, { id: planSnap.id, ...planSnap.data() } as PlanTrabajo);
      }),
    );

    const coincidencias = permisos.flatMap((permiso) => {
      const fechasEnComun = fechasDelPermiso(permiso).filter((fecha) => fechasSolicitadas.includes(fecha));
      return fechasEnComun.flatMap((fecha) => {
        const plan = planes.get(periodoDeFecha(fecha));
        const grupoSolicitante = grupoOperativo(plan, solicitud.empleadoId);
        const grupoExistente = grupoOperativo(plan, permiso.empleadoId);
        if (!grupoSolicitante || grupoSolicitante !== grupoExistente) return [];
        return [{ fecha, grupo: grupoSolicitante, empleadoNombre: permiso.empleadoNombre }];
      });
    });

    return coincidencias.filter((coincidencia, indice, lista) =>
      indice === lista.findIndex((otra) =>
        otra.fecha === coincidencia.fecha && otra.grupo === coincidencia.grupo && otra.empleadoNombre === coincidencia.empleadoNombre,
      ),
    );
  };

  const abrirDetalle = (tramite: TramitePersonal) => {
    setDetalle(tramite);
    setAccionAdmin("aprobado");
    setComentarioAdmin("");
    setConflictosPermiso([]);
    setAdvertenciasPermiso([]);
    setErrorAjuste(null);
    if (tramite.estado !== "pendiente" || !esPermisoPersonal(tramite)) return;

    setRevisandoCoincidencias(true);
    buscarCoincidenciasPermiso(tramite, "pendiente")
      .then(setAdvertenciasPermiso)
      .catch((err) => console.error("No se pudieron revisar permisos pendientes del grupo", err))
      .finally(() => setRevisandoCoincidencias(false));
  };

  const cerrarDetalle = useCallback(() => {
    setDetalle(null);
    setConflictosPermiso([]);
    setAdvertenciasPermiso([]);
  }, []);

  // Refleja el permiso aprobado en el plan de trabajo del/los mes(es) que cubre.
  // Corre en transacción para no pisar ediciones concurrentes del asistente.
  // Si un plan aún no existe, no pasa nada: el editor lo aplica al crearlo.
  const reflejarPermisoEnPlan = async (
    tramite: TramitePersonal,
  ): Promise<{ titulo: string; lineas: string[]; tono: "exito" | "alerta" }> => {
    const periodos = periodosDelPermiso(tramite);
    if (periodos.length === 0) {
      return { titulo: "Permiso aprobado", lineas: ["El trámite no tiene fechas válidas, no se reflejó en el plan de trabajo."], tono: "alerta" };
    }
    const lineas: string[] = [];
    let marcados = 0;
    try {
      await runTransaction(db, async (tx) => {
        lineas.length = 0;
        marcados = 0;
        // Todas las lecturas primero (requisito de las transacciones de Firestore).
        const snaps: { periodo: string; snap: Awaited<ReturnType<typeof tx.get>> }[] = [];
        for (const periodo of periodos) {
          snaps.push({ periodo, snap: await tx.get(doc(db, "planes_trabajo", periodo)) });
        }
        for (const { periodo, snap } of snaps) {
          if (!snap.exists()) {
            lineas.push(`${labelPeriodo(periodo)}: el plan aún no existe; el permiso se aplicará solo al crearlo.`);
            continue;
          }
          const plan = snap.data() as PlanTrabajo;
          const { anio, mes } = parsePeriodo(periodo);
          const r = aplicarPermisoEnFilas(plan.filas ?? [], tramite, anio, mes);
          if (r.sinFila) {
            lineas.push(`${labelPeriodo(periodo)}: ${tramite.empleadoNombre} no tiene fila en el plan; márcalo manualmente.`);
            continue;
          }
          if (!r.cambio) {
            lineas.push(`${labelPeriodo(periodo)}: no había turnos que marcar en esas fechas (días de descanso o permiso ya aplicado).`);
            continue;
          }
          tx.update(doc(db, "planes_trabajo", periodo), {
            filas: r.filas,
            actualizadoEn: Timestamp.now(),
            actualizadoPorId: user?.uid ?? "",
            actualizadoPorNombre: profile?.nombre ?? "",
          });
          marcados += r.completos + r.parciales;
          const partes: string[] = [];
          if (r.completos > 0) partes.push(`${r.completos} día(s) marcados PER`);
          if (r.parciales > 0) partes.push(`${r.parciales} día(s) con fracción de turno anotada`);
          lineas.push(`${labelPeriodo(periodo)}: ${partes.join(" y ")}.`);
        }
      });
    } catch (err) {
      console.error("No se pudo reflejar el permiso en el plan de trabajo", err);
      return {
        titulo: "Permiso aprobado, plan sin actualizar",
        lineas: ["El trámite quedó aprobado, pero no se pudo escribir en el plan de trabajo. Se aplicará automáticamente al abrir el editor del plan."],
        tono: "alerta",
      };
    }
    return {
      titulo: marcados > 0 ? "Permiso reflejado en el plan" : "Permiso aprobado",
      lineas,
      tono: marcados > 0 ? "exito" : "alerta",
    };
  };

  // Ajuste de horas por solicitud verbal (solo admin; las reglas también lo exigen).
  // Una transacción actualiza el trámite y, si ya estaba aprobado, el plan del
  // mes: así nunca queda el trámite con unas horas y el plan con otras.
  const ajustarHoras = async (nuevasHoras: number, justificacion: string): Promise<boolean> => {
    if (!detalle?.id || !user || !profile || profile.role !== "admin") return false;
    const id = detalle.id;
    setAjustando(true);
    setErrorAjuste(null);
    try {
      const ahora = Timestamp.now();
      const lineas: string[] = [];
      let nuevo!: TramitePersonal;
      await runTransaction(db, async (tx) => {
        lineas.length = 0;
        const refTramite = doc(db, "tramites_personal", id);
        const snapTramite = await tx.get(refTramite);
        if (!snapTramite.exists()) throw new Error("El trámite ya no existe.");
        const actual = { id, ...snapTramite.data() } as TramitePersonal;
        if (!esPermisoPersonal(actual) || (actual.estado !== "pendiente" && actual.estado !== "aprobado")) {
          throw new Error("Este trámite ya no admite ajustes de horas.");
        }
        const inicio = toDate(actual.fechaInicio);
        if (!inicio || !esPermisoDeUnTurno(actual)) {
          throw new Error("Solo se pueden ajustar permisos de un solo turno.");
        }
        const horasAnteriores = actual.horas ?? 0;
        if (nuevasHoras === horasAnteriores) throw new Error("Las horas indicadas son las mismas que ya tiene el permiso.");

        // El permiso conserva su inicio; el fin se recorre según las horas nuevas.
        const ajuste: AjusteHorasTramite = {
          horasAnteriores,
          horasNuevas: nuevasHoras,
          justificacion,
          porId: user.uid,
          porNombre: profile.nombre,
          en: ahora.toDate(),
        };
        nuevo = {
          ...actual,
          horas: nuevasHoras,
          fechaFin: new Date(inicio.getTime() + nuevasHoras * 60 * 60 * 1000),
          ajustesHoras: [...(actual.ajustesHoras ?? []), ajuste],
          actualizadoEn: ahora.toDate(),
        };

        // Lecturas del plan antes de cualquier escritura (requisito de las transacciones).
        const planes: { periodo: string; snap: Awaited<ReturnType<typeof tx.get>> }[] = [];
        if (actual.estado === "aprobado") {
          for (const periodo of periodosDelPermiso(actual)) {
            planes.push({ periodo, snap: await tx.get(doc(db, "planes_trabajo", periodo)) });
          }
        }

        const escrituras: { periodo: string; filas: FilaPlanTrabajo[] }[] = [];
        for (const { periodo, snap } of planes) {
          if (!snap.exists()) {
            lineas.push(`${labelPeriodo(periodo)}: el plan aún no existe; se aplicará con las horas nuevas al crearlo.`);
            continue;
          }
          const plan = snap.data() as PlanTrabajo;
          // La fracción no puede exceder el turno que tiene asignado ese día.
          const registro = filaDelEmpleado(plan, actual.empleadoId)?.permisos?.find((p) => p.tramiteId === id);
          const turno = registro ? getHorario(registro.codigoTurno) : undefined;
          if (turno && nuevasHoras > turno.horas) {
            throw new Error(`El turno de ese día (${registro?.codigoTurno}) es de ${turno.horas} horas; el permiso no puede excederlo.`);
          }
          const { anio, mes } = parsePeriodo(periodo);
          const r = reaplicarPermisoEnFilas(plan.filas ?? [], nuevo, anio, mes);
          if (r.sinFila) {
            lineas.push(`${labelPeriodo(periodo)}: ${actual.empleadoNombre} no tiene fila en el plan; ajústalo manualmente.`);
          } else if (r.cambio) {
            escrituras.push({ periodo, filas: r.filas });
            lineas.push(
              r.parciales > 0
                ? `${labelPeriodo(periodo)}: el turno se conserva y se anotan ${nuevasHoras} h de permiso.`
                : `${labelPeriodo(periodo)}: el día queda marcado PER (permiso del turno completo).`,
            );
          } else {
            lineas.push(`${labelPeriodo(periodo)}: no hubo cambios en el plan (la celda ya fue editada a mano).`);
          }
        }

        tx.update(refTramite, {
          horas: nuevo.horas,
          fechaFin: Timestamp.fromDate(nuevo.fechaFin as Date),
          ajustesHoras: nuevo.ajustesHoras,
          actualizadoEn: ahora,
        });
        for (const { periodo, filas } of escrituras) {
          tx.update(doc(db, "planes_trabajo", periodo), {
            filas,
            actualizadoEn: ahora,
            actualizadoPorId: user.uid,
            actualizadoPorNombre: profile.nombre,
          });
        }
      });

      setDetalle(nuevo);
      setPendientes((prev) => prev.map((t) => (t.id === id ? nuevo : t)));
      if (cachePendientes) cachePendientes = cachePendientes.map((t) => (t.id === id ? nuevo : t));
      setResultados((prev) => prev?.map((t) => (t.id === id ? nuevo : t)) ?? prev);
      if (lineas.length > 0) {
        setResultadoPlan({ titulo: "Horas del permiso actualizadas", lineas, tono: "exito" });
      }
      return true;
    } catch (err) {
      console.error("No se pudo ajustar las horas del permiso", err);
      setErrorAjuste(err instanceof Error && !("code" in err)
        ? err.message
        : "No se pudo guardar el ajuste. Intenta de nuevo.");
      return false;
    } finally {
      setAjustando(false);
    }
  };

  const handleResolver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detalle?.id || !user || !profile) return;
    setSaving(true);
    try {
      if (accionAdmin === "aprobado" && esPermisoPersonal(detalle)) {
        // Se consulta al momento de resolver para no depender de la caché de la
        // bandeja: otro administrador pudo aprobar una solicitud recientemente.
        const conflictos = await buscarCoincidenciasPermiso(detalle, "aprobado");

        if (conflictos.length > 0) {
          const primero = conflictos[0];
          setConflictosPermiso(conflictos);
          setAccionAdmin("rechazado");
          setComentarioAdmin((actual) => actual.trim() ||
            `No procede: ya hay un permiso personal aprobado para ${primero.empleadoNombre} del ${primero.grupo} el ${fechaLegible(primero.fecha)}. Por acuerdo del personal operativo, solo puede aprobarse un permiso personal por grupo y día.`,
          );
          return;
        }
      }

      const id = detalle.id;
      const ahora = Timestamp.now();
      const comentario = comentarioAdmin.trim() || undefined;
      await updateDoc(doc(db, "tramites_personal", id), {
        estado: accionAdmin,
        revisadoPorId: user.uid,
        revisadoPorNombre: profile.nombre,
        revisadoEn: ahora,
        comentariosRevision: comentario,
        actualizadoEn: ahora,
      });
      // Actualización optimista: sale de pendientes y se parcha en los
      // resultados de búsqueda, sin volver a leer.
      const resuelto: TramitePersonal = {
        ...detalle,
        estado: accionAdmin,
        revisadoPorId: user.uid,
        revisadoPorNombre: profile.nombre,
        revisadoEn: ahora.toDate(),
        comentariosRevision: comentario,
        actualizadoEn: ahora.toDate(),
      };
      setPendientes((prev) => prev.filter((t) => t.id !== id));
      if (cachePendientes) cachePendientes = cachePendientes.filter((t) => t.id !== id);
      setResultados((prev) => prev?.map((t) => (t.id === id ? resuelto : t)) ?? prev);

      // Permiso personal aprobado → se refleja en el plan de trabajo.
      if (accionAdmin === "aprobado" && esPermisoPersonal(detalle)) {
        setResultadoPlan(await reflejarPermisoEnPlan({ ...detalle, estado: "aprobado" }));
      }

      cerrarDetalle();
      setComentarioAdmin("");
    } catch (err) {
      console.error(err);
      setErrorMsg("No se pudo guardar la resolución. Por favor intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading">Gestión de Trámites</h1>

        {/* Pendientes | Buscar: la bandeja y la búsqueda histórica no se apilan. */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
          {([
            { id: "pendientes", label: "Pendientes", Icono: Inbox },
            { id: "buscar", label: "Buscar", Icono: Search },
          ] as const).map(({ id, label, Icono }) => (
            <button
              key={id}
              type="button"
              onClick={() => setVista(id)}
              aria-pressed={vista === id}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:flex-none ${
                vista === id
                  ? "bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-cyan-300"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Icono size={15} />
              {label}
              {id === "pendientes" && pendientes.length > 0 && (
                <span className="min-w-[1.25rem] rounded-full bg-amber-500 px-1.5 text-[11px] font-bold leading-5 text-white tabular-nums">
                  {pendientes.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {vista === "pendientes" ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {cargandoPendientes ? "Cargando…" : `${pendientes.length} por resolver`}
            </p>
            <button
              type="button"
              onClick={actualizarPendientes}
              disabled={cargandoPendientes}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw size={13} className={cargandoPendientes ? "animate-spin" : ""} /> Actualizar
            </button>
          </div>
          {cargandoPendientes && pendientes.length === 0 ? (
            <Cargando />
          ) : pendientes.length === 0 ? (
            <Vacio icono={CheckCircle2} titulo="Sin trámites pendientes" tono="verde" />
          ) : (
            <TablaTramites items={pendientes} onAbrir={abrirDetalle} />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); void buscar(); }}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Campo label="Empleado">
                <select value={filtros.empleadoId} onChange={(e) => setFiltros((f) => ({ ...f, empleadoId: e.target.value }))} className={SELECT_CLS}>
                  <option value="">Todos</option>
                  {empleados.map((e) => (
                    <option key={e.uid} value={e.uid}>{e.nombre}{e.baja ? " (baja)" : ""}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Trámite">
                <select value={filtros.categoria} onChange={(e) => setFiltros((f) => ({ ...f, categoria: e.target.value as Filtros["categoria"] }))} className={SELECT_CLS}>
                  <option value="">Todos</option>
                  {(Object.keys(CATEGORIAS_TRAMITE) as CategoriaTramitePersonal[]).map((c) => (
                    <option key={c} value={c}>{CATEGORIAS_TRAMITE[c]}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Estado">
                <select value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value as Filtros["estado"] }))} className={SELECT_CLS}>
                  <option value="">Todos</option>
                  {(Object.keys(ESTADO_TRAMITE_LABEL) as EstadoTramitePersonal[]).map((s) => (
                    <option key={s} value={s}>{ESTADO_TRAMITE_LABEL[s]}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Solicitado desde">
                <DateField value={filtros.desde} onChange={(v) => setFiltros((f) => ({ ...f, desde: v }))} ariaLabel="Solicitado desde" clearable />
              </Campo>
              <Campo label="Solicitado hasta">
                <DateField value={filtros.hasta} onChange={(v) => setFiltros((f) => ({ ...f, hasta: v }))} ariaLabel="Solicitado hasta" clearable />
              </Campo>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={!hayFiltros || buscando !== null}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {buscando === "filtros" ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />} Buscar
              </button>
              <button
                type="button"
                onClick={consultarTodos}
                disabled={buscando !== null}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {buscando === "todos" ? <RefreshCw size={15} className="animate-spin" /> : <List size={15} />} Consultar todos
              </button>
              {hayFiltros && (
                <button
                  type="button"
                  onClick={() => setFiltros(FILTROS_VACIOS)}
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <X size={14} /> Limpiar
                </button>
              )}
            </div>
          </form>

          {errorBusqueda && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{errorBusqueda}</p>
          )}

          {resultados !== null && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                  {resultados.length} {resultados.length === 1 ? "trámite" : "trámites"}
                </p>
                {tope && <p className="text-xs text-slate-500 dark:text-slate-400">Se muestran los {tope} más recientes</p>}
              </div>
              {buscando ? (
                <Cargando />
              ) : resultados.length === 0 ? (
                <Vacio icono={Search} titulo="Sin coincidencias" tono="neutro" />
              ) : (
                <TablaTramites items={resultados} onAbrir={abrirDetalle} />
              )}
            </div>
          )}
        </div>
      )}

      {detalle && (
        <TramiteDetalleModal
          tramite={detalle}
          onClose={cerrarDetalle}
          ajusteHoras={
            profile?.role === "admin"
            && esPermisoPersonal(detalle)
            && (detalle.estado === "pendiente" || detalle.estado === "aprobado")
            && esPermisoDeUnTurno(detalle)
              ? { guardando: ajustando, error: errorAjuste, onGuardar: ajustarHoras }
              : undefined
          }
          resolucion={detalle.estado === "pendiente" ? {
            accion: accionAdmin,
            onAccion: setAccionAdmin,
            comentario: comentarioAdmin,
            onComentario: setComentarioAdmin,
            advertencias: advertenciasPermiso,
            conflictos: conflictosPermiso,
            revisando: revisandoCoincidencias,
            saving,
            onSubmit: handleResolver,
          } : undefined}
        />
      )}

      {/* Resultado del reflejo en el plan de trabajo */}
      {resultadoPlan && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className={`p-6 flex flex-col items-center gap-3 ${resultadoPlan.tono === "exito" ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-amber-50 dark:bg-amber-950/30"}`}>
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${resultadoPlan.tono === "exito" ? "bg-emerald-100 dark:bg-emerald-900/50" : "bg-amber-100 dark:bg-amber-900/50"}`}>
                <CalendarCheck size={28} className={resultadoPlan.tono === "exito" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"} />
              </div>
              <h3 className={`text-lg font-bold text-center ${resultadoPlan.tono === "exito" ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}>
                {resultadoPlan.titulo}
              </h3>
              <ul className={`text-sm space-y-1.5 ${resultadoPlan.tono === "exito" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                {resultadoPlan.lineas.map((linea, i) => (
                  <li key={i} className="text-center">{linea}</li>
                ))}
              </ul>
            </div>
            <div className="p-5">
              <button
                type="button"
                onClick={() => setResultadoPlan(null)}
                className={`w-full py-2.5 rounded-xl text-sm font-bold text-white transition-colors ${resultadoPlan.tono === "exito" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-amber-500 hover:bg-amber-600"}`}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error al guardar */}
      {errorMsg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-6 flex flex-col items-center gap-3 bg-rose-50 dark:bg-rose-950/30">
              <div className="w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center">
                <AlertTriangle size={28} className="text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="text-lg font-bold text-rose-800 dark:text-rose-300">No se pudo guardar</h3>
              <p className="text-sm text-center text-rose-700 dark:text-rose-300">{errorMsg}</p>
            </div>
            <div className="p-5">
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

function Cargando() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
    </div>
  );
}

function Vacio({ icono: Icono, titulo, tono }: { icono: typeof Search; titulo: string; tono: "verde" | "neutro" }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
        tono === "verde"
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
          : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
      }`}>
        <Icono size={26} />
      </span>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{titulo}</p>
    </div>
  );
}

/** Tabla de trámites: toda la fila abre la ficha; el botón da el acceso por teclado. */
function TablaTramites({ items, onAbrir }: { items: TramitePersonal[]; onAbrir: (t: TramitePersonal) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60">
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Solicitado</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Empleado</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Trámite</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Estado</th>
            <th className="px-4 py-2.5"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {items.map((t) => {
            const creado = toDate(t.creadoEn);
            const inicio = toDate(t.fechaInicio);
            const { codigo, nombre } = partesCategoria(t.categoria);
            const nDocs = docsDeTramite(t).length;
            const conRespuesta = !!t.comentariosRevision && t.estado !== "subido";
            return (
              <tr key={t.id} onClick={() => onAbrir(t)} className="group cursor-pointer transition-colors hover:bg-blue-50/40 dark:hover:bg-slate-800/40">
                <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-slate-500 tabular-nums dark:text-slate-400">
                  {creado?.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" }) ?? "—"}
                  <span className="block text-[11px] opacity-75">{creado?.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                </td>
                <td className="px-4 py-3 align-top">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.empleadoNombre}</p>
                </td>
                <td className="max-w-sm px-4 py-3 align-top">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 inline-flex h-6 min-w-[2rem] shrink-0 items-center justify-center rounded-md bg-blue-50 px-1.5 font-heading text-[11px] font-bold text-blue-900 ring-1 ring-blue-100 dark:bg-blue-950 dark:text-cyan-200 dark:ring-blue-900">
                      {codigo}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{nombre}</p>
                      {(inicio || t.horas) && (
                        <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                          {inicio?.toLocaleDateString("es-SV", { day: "2-digit", month: "short" })}
                          {inicio && t.horas ? " · " : ""}
                          {t.horas ? `${t.horas} h` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${ESTADO_TRAMITE_PILL[t.estado]}`}>
                    {ESTADO_TRAMITE_LABEL[t.estado]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <div className="flex items-center justify-end gap-3">
                    {nDocs > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400 tabular-nums" title={`${nDocs} adjunto(s)`}>
                        <Paperclip size={13} /> {nDocs}
                      </span>
                    )}
                    {conRespuesta && (
                      <span className="text-slate-400" title="Con respuesta de administración">
                        <MessageSquareText size={14} />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onAbrir(t); }}
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        t.estado === "pendiente"
                          ? "bg-amber-500 text-white hover:bg-amber-600"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      {t.estado === "pendiente" ? "Resolver" : "Ver"}
                      <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

