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
} from "@/lib/firestoreMeter";
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
  compararFilasPlan,
  prepararFilasNuevoPeriodo,
  copiarFilasMesAnterior,
  casillasSugeridasPlan,
  validarAsignacionPlan,
  validarReglasFilasPlan,
  autocompletarAdministrativoSiCorresponde,
  GRUPOS_ESDOMED,
  COLOR_GRUPO,
} from "@/lib/esdomed/plan";
import {
  configPersonalPlan,
  esAdministrativoPlan,
  normalizarMetadatosFilaPlan,
} from "@/lib/esdomed/catalogo-plan";
import { esDiaNoLaboralAdministrativo } from "@/lib/esdomed/calendario-plan";
import { CeldaPicker } from "@/components/esdomed-horarios/CeldaPicker";
import { exportarPlanExcel, type TipoPlan } from "@/lib/esdomed/exportar-plan";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  Save,
  Trash2,
  Users,
  XCircle,
  AlertTriangle,
} from "lucide-react";

type RosterUser = Pick<UserProfile, "uid" | "nombre" | "codigoMarcacion" | "puesto">;

interface BorradorPlanLocal {
  periodo: string;
  actualizadoEn: number;
  filas: FilaPlanTrabajo[];
  numeroHoras: string;
  metaHorasAdmin: number | "";
  metaHorasOperativas: number | "";
}

function parsearBloqueCodigos(texto: string): string[][] {
  const lineas = texto.replace(/\r/g, "").split("\n");
  while (lineas.length > 1 && lineas[lineas.length - 1] === "") lineas.pop();
  return lineas.map((linea) => {
    if (linea.includes("\t")) return linea.split("\t");
    const limpia = linea.trim();
    return limpia ? limpia.split(/[\s,;]+/) : [""];
  });
}

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
  const [prevPlanData, setPrevPlanData] = useState<PlanTrabajo | null>(null);
  const [picker, setPicker] = useState<{ filaIdx: number; diaIdx: number } | null>(null);
  const [modalState, setModalState] = useState<{ tipo: "exito"|"error"|"alerta"; titulo: string; mensaje: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{ tipo: "peligro"|"alerta"; titulo: string; mensaje: string; textoConfirmar: string; onConfirm: () => void } | null>(null);
  const dragRef = useRef<{ filaIdx: number; valor: string; isDragging: boolean; cellsDragged: number; undoGuardado: boolean } | null>(null);
  const filasRef = useRef<FilaPlanTrabajo[]>([]);
  const undoRef = useRef<FilaPlanTrabajo[][]>([]);
  const inicializadoRef = useRef(false);
  const borradorKey = useMemo(() => `plan-trabajo-borrador:${periodo}`, [periodo]);

  useEffect(() => {
    filasRef.current = filas;
  }, [filas]);

  const registrarUndo = useCallback(() => {
    const snapshot = JSON.parse(JSON.stringify(filasRef.current)) as FilaPlanTrabajo[];
    undoRef.current = [...undoRef.current.slice(-29), snapshot];
  }, []);

  const deshacer = useCallback(() => {
    const anterior = undoRef.current.pop();
    if (!anterior) return;
    filasRef.current = anterior;
    setFilas(anterior);
    setGuardado(false);
  }, []);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (undoRef.current.length === 0) return;
      event.preventDefault();
      deshacer();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deshacer]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!inicializadoRef.current || guardado) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [guardado]);

  const cargarRoster = useCallback(async (): Promise<RosterUser[]> => {
    // Incluimos admin además del personal ESDOMED: un superusuario que también es
    // personal de ESDOMED debe aparecer en el plan. Para no traer admins de TI
    // (sin relación con el plan), el admin solo cuenta si tiene código de marcación.
    const snap = await getDocs(
      query(collection(db, "usuarios"), where("role", "in", ["esdomed", "asistente_esdomed", "admin"])),
    );
    const lista = snap.docs
      .filter((d) => {
        const data = d.data();
        return data.role !== "admin" || Boolean(data.codigoMarcacion);
      })
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
    return lista;
  }, []);

  useEffect(() => {
    (async () => {
      inicializadoRef.current = false;
      undoRef.current = [];
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

        let filasBase: FilaPlanTrabajo[];
        let numeroHorasBase = "";
        let metaAdminBase: number | "" = "";
        let metaOperativaBase: number | "" = "";
        if (snap.exists()) {
          const plan = snap.data() as PlanTrabajo;
          numeroHorasBase = plan.numeroHoras ?? "";
          metaAdminBase = plan.metaHorasAdmin ?? "";
          metaOperativaBase = plan.metaHorasOperativas ?? "";
          setCreadoMeta({
            creadoEn: plan.creadoEn,
            creadoPorId: plan.creadoPorId,
            creadoPorNombre: plan.creadoPorNombre,
          });
          // Mezcla con el roster para incluir personal nuevo, conservando lo guardado.
          filasBase = sincronizarFilas(lista, plan.filas ?? [], dias.length);
        } else {
          setCreadoMeta(null);
          const planAnterior = prevSnap.exists() ? prevSnap.data() as PlanTrabajo : null;
          numeroHorasBase = planAnterior?.numeroHoras ?? "";
          metaAdminBase = planAnterior?.metaHorasAdmin ?? "";
          metaOperativaBase = planAnterior?.metaHorasOperativas ?? "";
          filasBase = prepararFilasNuevoPeriodo(lista, planAnterior, anio, mes);
        }

        let borradorRecuperado = false;
        try {
          const raw = window.localStorage.getItem(borradorKey);
          const borrador = raw ? JSON.parse(raw) as BorradorPlanLocal : null;
          if (borrador?.periodo === periodo && Array.isArray(borrador.filas)) {
            filasBase = sincronizarFilas(lista, borrador.filas, dias.length);
            numeroHorasBase = borrador.numeroHoras ?? numeroHorasBase;
            metaAdminBase = borrador.metaHorasAdmin ?? metaAdminBase;
            metaOperativaBase = borrador.metaHorasOperativas ?? metaOperativaBase;
            borradorRecuperado = true;
          }
        } catch {
          window.localStorage.removeItem(borradorKey);
        }

        filasRef.current = filasBase;
        setFilas(filasBase);
        setNumeroHoras(numeroHorasBase);
        setMetaHorasAdmin(metaAdminBase);
        setMetaHorasOperativas(metaOperativaBase);
        setGuardado(snap.exists() && !borradorRecuperado);
        if (borradorRecuperado) {
          setModalState({
            tipo: "alerta",
            titulo: "Borrador recuperado",
            mensaje: "Se recuperaron los cambios locales que estaban pendientes de guardar en este mes.",
          });
        }
        inicializadoRef.current = true;
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  useEffect(() => {
    if (loading || !inicializadoRef.current || guardado) return;
    const timer = window.setTimeout(() => {
      const borrador: BorradorPlanLocal = {
        periodo,
        actualizadoEn: Date.now(),
        filas,
        numeroHoras,
        metaHorasAdmin,
        metaHorasOperativas,
      };
      window.localStorage.setItem(borradorKey, JSON.stringify(borrador));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [borradorKey, filas, guardado, loading, metaHorasAdmin, metaHorasOperativas, numeroHoras, periodo]);

  const setCelda = (filaIdx: number, diaIdx: number, valor: string, guardarUndo = true): boolean => {
    const filaActual = filasRef.current[filaIdx];
    if (!filaActual) return false;
    const restriccion = validarAsignacionPlan(filaActual, diaIdx + 1, valor, anio, mes, prevPlanData);
    if (restriccion) return false;
    if (guardarUndo) registrarUndo();
    setFilas((prev) =>
      prev.map((f, i) =>
        i === filaIdx ? (
          autocompletarAdministrativoSiCorresponde(f, diaIdx + 1, valor, anio, mes) ?? {
            ...f,
            asignaciones: f.asignaciones.map((c, j) => (j === diaIdx ? valor : c)),
          }
        ) : f,
      ),
    );
    setGuardado(false);
    return true;
  };

  const setGrupo = (filaIdx: number, grupo: string) => {
    registrarUndo();
    setFilas((prev) => prev.map((f, i) => (
      i === filaIdx ? normalizarMetadatosFilaPlan({
        ...f,
        grupo,
        tipoJornada:
          configPersonalPlan(f.codigoMarcacion)?.tipoJornada === "Administrativo" || grupo === "Administrativo"
            ? "Administrativo"
            : "Operativo",
      }) : f
    )));
    setGuardado(false);
  };

  const limpiarFila = (filaIdx: number) => {
    registrarUndo();
    setFilas((prev) =>
      prev.map((f, i) =>
        i === filaIdx ? { ...f, asignaciones: f.asignaciones.map(() => "") } : f,
      ),
    );
    setGuardado(false);
  };

  // Mueve una fila arriba/abajo dentro de su mismo grupo. Renumera `orden`
  // según el orden visible actual y luego intercambia con el vecino.
  const moverFila = (filaIdx: number, dir: -1 | 1) => {
    registrarUndo();
    setFilas((prev) => {
      const display = prev.map((f, i) => ({ f, i })).sort((a, b) => compararFilasPlan(a.f, b.f));
      const pos = display.findIndex((d) => d.i === filaIdx);
      if (pos === -1) return prev;
      const destino = pos + dir;
      if (destino < 0 || destino >= display.length) return prev;
      // Solo se reordena dentro del mismo grupo.
      const grupoActual = (display[pos].f.grupo ?? "").trim();
      const grupoVecino = (display[destino].f.grupo ?? "").trim();
      if (grupoActual !== grupoVecino) return prev;
      // Posición de cada fila en el orden visible (orden manual explícito).
      const ordenPorIdx = new Map(display.map((d, idx) => [d.i, idx]));
      ordenPorIdx.set(display[pos].i, destino);
      ordenPorIdx.set(display[destino].i, pos);
      return prev.map((f, i) => ({ ...f, orden: ordenPorIdx.get(i) }));
    });
    setGuardado(false);
  };

  const descargarExcel = (tipo: TipoPlan) => {
    exportarPlanExcel(
      {
        anio,
        mes,
        numeroHoras: numeroHoras.trim(),
        filas: filas.map((f) => ({
          uid: f.uid,
          codigoMarcacion: f.codigoMarcacion ?? "",
          nombre: f.nombre,
          puesto: f.puesto ?? "",
          tipoJornada: f.tipoJornada,
          grupo: f.grupo ?? "",
          asignaciones: f.asignaciones,
          observaciones: f.observaciones ?? "",
          // Firestore no acepta `undefined`; solo guardamos orden si es manual.
          ...(typeof f.orden === "number" ? { orden: f.orden } : {}),
        })),
      },
      tipo,
    );
  };

  const sincronizar = async () => {
    const lista = await cargarRoster();
    registrarUndo();
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
    registrarUndo();
    setFilas((prev) => copiarFilasMesAnterior(prev, prevPlan, anio, mes));
    if (!numeroHoras && prevPlan.numeroHoras) setNumeroHoras(prevPlan.numeroHoras);
    if (metaHorasAdmin === "" && prevPlan.metaHorasAdmin) setMetaHorasAdmin(prevPlan.metaHorasAdmin);
    if (metaHorasOperativas === "" && prevPlan.metaHorasOperativas) setMetaHorasOperativas(prevPlan.metaHorasOperativas);
    setModalState({ tipo: "exito", titulo: "Patrón Copiado", mensaje: `Se han copiado los turnos desde ${labelPeriodo(prevPeriodo)}. Por favor, ajusta los detalles antes de guardar.` });
    setGuardado(false);
  };

  const guardar = () => {
    if (!profile) return;

    const advertencias: string[] = [];
    const reglas = validarReglasFilasPlan(filas, anio, mes, prevPlanData);
    if (reglas.errores.length > 0) {
      setModalState({
        tipo: "error",
        titulo: "Plan con asignaciones inválidas",
        mensaje: `${reglas.errores.slice(0, 12).join("\n")}${reglas.errores.length > 12 ? `\n\nY ${reglas.errores.length - 12} error(es) más.` : ""}`,
      });
      return;
    }
    if (reglas.advertencias.length > 0) {
      advertencias.push(reglas.advertencias.join("\n"));
    }

    const diasIncompletos = conteoOperativosPorDia
      .map((count, idx) => count < 2 ? idx + 1 : null)
      .filter((val): val is number => val !== null);
    if (diasIncompletos.length > 0) {
      advertencias.push(`Días con menos de 2 operativos asignados: ${diasIncompletos.join(", ")}.`);
    }

    // Las vacaciones siempre son un periodo de 15 días: avisar si alguien tiene
    // una cantidad distinta (menos o más).
    const vacIncorrectas = filas
      .map((f) => ({ nombre: f.nombre, vac: contarMarca(f.asignaciones, "VAC") }))
      .filter((x) => x.vac > 0 && x.vac !== 15);
    if (vacIncorrectas.length > 0) {
      advertencias.push(
        "Personal con vacaciones distintas de 15 días (deben ser exactamente 15):\n" +
          vacIncorrectas.map((x) => `  • ${x.nombre}: ${x.vac} día(s) VAC`).join("\n"),
      );
    }

    if (advertencias.length > 0) {
      setConfirmState({
        tipo: "alerta",
        titulo: "Revisa antes de guardar",
        mensaje: `${advertencias.join("\n\n")}\n\n¿Deseas guardar el plan de todas formas?`,
        textoConfirmar: "Guardar igual",
        onConfirm: () => { void ejecutarGuardado(); },
      });
      return;
    }

    void ejecutarGuardado();
  };

  const ejecutarGuardado = async () => {
    if (!profile) return;

    setSaving(true);
    try {
      const ahora = new Date();
      const payload: PlanTrabajo = {
        periodo,
        anio,
        mes,
        numeroHoras: numeroHoras.trim(),
        ...(metaHorasAdmin === "" ? {} : { metaHorasAdmin: Number(metaHorasAdmin) }),
        ...(metaHorasOperativas === "" ? {} : { metaHorasOperativas: Number(metaHorasOperativas) }),
        filas: filas.map((f) => ({
          uid: f.uid,
          codigoMarcacion: f.codigoMarcacion ?? "",
          nombre: f.nombre,
          puesto: f.puesto ?? "",
          ...(f.tipoJornada ? { tipoJornada: f.tipoJornada } : {}),
          grupo: f.grupo ?? "",
          asignaciones: f.asignaciones,
          observaciones: f.observaciones ?? "",
          // Firestore no acepta `undefined`; solo guardamos orden si es manual.
          ...(typeof f.orden === "number" ? { orden: f.orden } : {}),
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
      window.localStorage.removeItem(borradorKey);
      undoRef.current = [];
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

  // Filas ordenadas por grupo y orden manual (con respaldo alfabético),
  // conservando el índice original (para editar).
  const filasOrdenadas = useMemo(
    () =>
      filas
        .map((f, i) => ({ f, i }))
        .sort((a, b) => compararFilasPlan(a.f, b.f)),
    [filas],
  );

  const pegarBloqueCodigos = (
    texto: string,
    inicio: { filaIdx: number; diaIdx: number } | null = picker,
  ) => {
    if (!inicio) return;
    const bloque = parsearBloqueCodigos(texto);
    const display = filasRef.current
      .map((f, i) => ({ f, i }))
      .sort((a, b) => compararFilasPlan(a.f, b.f));
    const inicioFilaVisual = display.findIndex(({ i }) => i === inicio.filaIdx);
    if (inicioFilaVisual < 0) return;

    const siguientes = filasRef.current.map((fila) => ({
      ...fila,
      asignaciones: [...fila.asignaciones],
    }));
    const incidencias: string[] = [];
    let aplicados = 0;
    let fueraDeRango = 0;

    bloque.forEach((filaPegada, desplazamientoFila) => {
      const destinoVisual = display[inicioFilaVisual + desplazamientoFila];
      if (!destinoVisual) {
        fueraDeRango += filaPegada.filter((valor) => valor.trim()).length;
        return;
      }
      const filaDestino = siguientes[destinoVisual.i];
      filaPegada.forEach((valorPegado, desplazamientoDia) => {
        const codigo = valorPegado.trim().toUpperCase();
        if (!codigo) return;
        const diaIdx = inicio.diaIdx + desplazamientoDia;
        if (diaIdx >= filaDestino.asignaciones.length) {
          fueraDeRango++;
          return;
        }
        if (!getHorario(codigo) && !esMarcaEspecial(codigo)) {
          incidencias.push(`${codigo}: código no reconocido`);
          return;
        }
        const restriccion = validarAsignacionPlan(
          filaDestino,
          diaIdx + 1,
          codigo,
          anio,
          mes,
          prevPlanData,
        );
        if (restriccion) {
          incidencias.push(restriccion);
          return;
        }
        filaDestino.asignaciones[diaIdx] = codigo;
        aplicados++;
      });
    });

    if (fueraDeRango > 0) incidencias.push(`${fueraDeRango} código(s) quedaron fuera del mes o de la lista.`);
    if (aplicados > 0) {
      registrarUndo();
      filasRef.current = siguientes;
      setFilas(siguientes);
      setGuardado(false);
    }
    setPicker(null);

    if (incidencias.length > 0 || aplicados === 0) {
      const unicas = [...new Set(incidencias)];
      setModalState({
        tipo: aplicados > 0 ? "alerta" : "error",
        titulo: aplicados > 0 ? "Pegado parcial" : "No se pegaron códigos",
        mensaje: [
          aplicados > 0 ? `Se pegaron ${aplicados} código(s).` : "No se encontró ningún código válido para pegar.",
          ...unicas.slice(0, 5),
          ...(unicas.length > 5 ? [`Y ${unicas.length - 5} incidencia(s) más.`] : []),
        ].join("\n"),
      });
    }
  };

  const conteoOperativosPorDia = new Array(dias.length).fill(0);
  filas.forEach((fila) => {
    fila.asignaciones.forEach((celda, diaIdx) => {
      const horario = getHorario(celda);
      if (horario && (horario.tipo === "Turno Operativo" || horario.tipo === "Turno Hospitalario")) {
        conteoOperativosPorDia[diaIdx]++;
      }
    });
  });

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
          <div className="flex gap-2">
            <Link href={`/esdomed-horarios/planes/${periodo}/imprimir?tipo=institucional`} target="_blank" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <Printer size={14} /> Imprimir Inst.
            </Link>
            <Link href={`/esdomed-horarios/planes/${periodo}/imprimir?tipo=manpower`} target="_blank" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <Printer size={14} /> Imprimir MPW
            </Link>
          </div>
          <div className="flex gap-2">
            <button onClick={() => descargarExcel("institucional")} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
              <FileSpreadsheet size={14} /> Excel Inst.
            </button>
            <button onClick={() => descargarExcel("manpower")} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
              <FileSpreadsheet size={14} /> Excel MPW
            </button>
          </div>
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
            Un clic selecciona cualquier casilla para copiar, pegar o borrar con Backspace/Supr. El selector de códigos se abre siempre con doble clic.
          </p>
          <div className="overflow-auto max-h-[calc(100vh-14rem)] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 min-w-[170px] border-r border-b border-slate-200 dark:border-slate-700">
                    Personal
                  </th>
                  {dias.map((d, i) => {
                    const finde = iniciales[i] === "S" || iniciales[i] === "D";
                    return (
                      <th key={d} className={`sticky top-0 z-20 px-0 py-1 text-center font-semibold w-9 border-b border-slate-200 dark:border-slate-700 ${finde ? "bg-rose-50 dark:bg-rose-950 text-rose-500" : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
                        <div className="text-[9px] leading-none">{iniciales[i]}</div>
                        <div className="text-[11px] tabular-nums">{d}</div>
                      </th>
                    );
                  })}
                  <th className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-center font-semibold text-slate-600 dark:text-slate-300 border-l border-b border-slate-200 dark:border-slate-700">Hrs</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let grupoPrev: string | null = "__init__";
                  return filasOrdenadas.map(({ f: fila, i: filaIdx }, displayIdx) => {
                    const total = totalHorasFila(fila.asignaciones);
                    const vac = contarMarca(fila.asignaciones, "VAC");
                    const grupoActual = fila.grupo?.trim() || "";
                    const isAdministrativo = esAdministrativoPlan(fila);
                    const metaBase = isAdministrativo ? metaHorasAdmin : metaHorasOperativas;
                    // Regla: un operativo con periodo de vacaciones (15 días VAC)
                    // trabaja medio mes, así que su meta de horas baja a la mitad.
                    const metaReducida = !isAdministrativo && vac >= 15;
                    const targetHoras = typeof metaBase === "number" && metaReducida ? metaBase / 2 : metaBase;
                    const metaValida = typeof targetHoras === "number" && targetHoras > 0;
                    const dif = metaValida ? total - targetHoras : 0;

                    // Guía de turnos cada 4 días (solo operativos).
                    const sugerencias = isAdministrativo ? [] : casillasSugeridasPlan(fila, prevPlanData);

                    // ¿Hay vecino del mismo grupo arriba/abajo? (para habilitar mover)
                    const grupoVecino = (di: number) => (filasOrdenadas[di]?.f.grupo?.trim() || "") === grupoActual;
                    const puedeSubir = displayIdx > 0 && grupoVecino(displayIdx - 1);
                    const puedeBajar = displayIdx < filasOrdenadas.length - 1 && grupoVecino(displayIdx + 1);

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
                              <span className="ml-auto shrink-0 flex items-center">
                                <button
                                  onClick={() => moverFila(filaIdx, -1)}
                                  disabled={!puedeSubir}
                                  title="Subir dentro del grupo"
                                  className="p-1 rounded-md text-slate-300 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-600 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                >
                                  <ChevronUp size={13} />
                                </button>
                                <button
                                  onClick={() => moverFila(filaIdx, 1)}
                                  disabled={!puedeBajar}
                                  title="Bajar dentro del grupo"
                                  className="p-1 rounded-md text-slate-300 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-600 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                >
                                  <ChevronDown size={13} />
                                </button>
                                <button
                                  onClick={() => setConfirmState({
                                    tipo: "peligro",
                                    titulo: "Limpiar horarios",
                                    mensaje: `Se borrarán todas las asignaciones de ${fila.nombre} en ${labelPeriodo(periodo)}.\n\nDeberás guardar el plan para que el cambio sea permanente. ¿Continuar?`,
                                    textoConfirmar: "Sí, limpiar",
                                    onConfirm: () => limpiarFila(filaIdx),
                                  })}
                                  title={`Limpiar todos los horarios de ${fila.nombre}`}
                                  className="p-1 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-600 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 transition-colors"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </span>
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
                            const sugerido = sugerencias[diaIdx] === true;
                            return (
                              <td key={d} className={`p-0 text-center ${finde ? "bg-rose-50/40 dark:bg-rose-950/20" : ""}`}>
                                <button
                                  onMouseDown={() => {
                                    dragRef.current = { filaIdx, valor: celda, isDragging: true, cellsDragged: 0, undoGuardado: false };
                                  }}
                                  onMouseEnter={() => {
                                    if (dragRef.current && dragRef.current.isDragging) {
                                      dragRef.current.cellsDragged++;
                                      // El personal administrativo omite fines de semana y asuetos.
                                      const noLaboralAdmin = isAdministrativo && esDiaNoLaboralAdministrativo(anio, mes, d);
                                      if (!noLaboralAdmin) {
                                        if (!dragRef.current.undoGuardado) {
                                          registrarUndo();
                                          dragRef.current.undoGuardado = true;
                                        }
                                        setCelda(filaIdx, diaIdx, dragRef.current.valor, false);
                                      }
                                    }
                                  }}
                                  onDoubleClick={() => {
                                    if (dragRef.current && dragRef.current.cellsDragged > 0) return;
                                    setPicker({ filaIdx, diaIdx });
                                  }}
                                  onPaste={(event) => {
                                    const textoPegado = event.clipboardData.getData("text/plain");
                                    if (!textoPegado.trim()) return;
                                    event.preventDefault();
                                    pegarBloqueCodigos(textoPegado, { filaIdx, diaIdx });
                                  }}
                                  onCopy={(event) => {
                                    if (!celda) return;
                                    event.preventDefault();
                                    event.clipboardData.setData("text/plain", celda.toUpperCase());
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key !== "Backspace" && event.key !== "Delete") return;
                                    if (!celda) return;
                                    event.preventDefault();
                                    setCelda(filaIdx, diaIdx, "");
                                  }}
                                  title={
                                    sugerido
                                      ? "Siguiente turno sugerido; un clic selecciona, Backspace/Supr borra y doble clic abre el selector"
                                      : "Un clic para seleccionar; Backspace/Supr borra y doble clic abre el selector"
                                  }
                                  className={`w-9 h-8 text-[10px] font-bold tabular-nums transition-colors cursor-cell hover:ring-2 hover:ring-blue-400 focus:ring-2 focus:ring-blue-500 focus:outline-none hover:z-10 relative ${
                                    sugerido
                                      ? "bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-inset ring-indigo-400/70 dark:ring-indigo-500/50 text-indigo-400"
                                      : colorCelda(celda)
                                  }`}
                                >
                                  {celda ? celda.toUpperCase() : sugerido ? "•" : ""}
                                </button>
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-center border-l border-slate-200 dark:border-slate-700 min-w-[70px]">
                            <span className="text-[13px] font-bold tabular-nums text-slate-800 dark:text-slate-100 block leading-none">{total}</span>
                            {metaValida && (
                              <div className="mt-1">
                                {dif === 0 ? (
                                  <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded" title={`Meta: ${targetHoras} hrs`}>OK</span>
                                ) : dif > 0 ? (
                                  <span className="text-[9px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/30 px-1.5 py-0.5 rounded" title={`Excede meta (${targetHoras} hrs) por ${dif} hrs`}>+{dif} hrs</span>
                                ) : (
                                  <span className="text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded" title={`Faltan ${Math.abs(dif)} hrs para la meta (${targetHoras} hrs)`}>{dif} hrs</span>
                                )}
                              </div>
                            )}
                            {metaReducida && (
                              <span className="block mt-1 text-[9px] font-bold text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-300 px-1 rounded" title={`Meta reducida a la mitad (${targetHoras} hrs) por periodo de vacaciones`}>META ½</span>
                            )}
                            {vac > 0 && (
                              <span
                                className={`block mt-1 text-[9px] font-semibold px-1 rounded ${
                                  vac !== 15
                                    ? "text-rose-700 bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300 ring-1 ring-rose-300 dark:ring-rose-800"
                                    : "text-amber-500 bg-amber-50 dark:bg-amber-950/30"
                                }`}
                                title={vac !== 15 ? "Las vacaciones deben ser exactamente 15 días" : undefined}
                              >
                                {vac} VAC{vac !== 15 ? " ⚠" : ""}
                              </span>
                            )}
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
          onPasteCodigos={pegarBloqueCodigos}
          onSelect={(codigo) => {
            const restriccion = validarAsignacionPlan(
              filaActiva,
              picker.diaIdx + 1,
              codigo,
              anio,
              mes,
              prevPlanData,
            );
            if (restriccion) {
              setModalState({
                tipo: "error",
                titulo: "Asignación inválida",
                mensaje: restriccion,
              });
              setPicker(null);
              return;
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

      {/* Modal de Confirmación */}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden transform transition-all animate-in zoom-in-95 duration-200">
            <div className={`p-4 border-b ${
              confirmState.tipo === "peligro"
                ? "bg-rose-50 border-rose-100 dark:bg-rose-950/30 dark:border-rose-900/50"
                : "bg-amber-50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/50"
            }`}>
              <div className="flex items-center gap-2">
                {confirmState.tipo === "peligro"
                  ? <Trash2 className="text-rose-600 dark:text-rose-400" size={20} />
                  : <AlertTriangle className="text-amber-600 dark:text-amber-400" size={20} />}
                <h3 className={`font-bold ${
                  confirmState.tipo === "peligro" ? "text-rose-800 dark:text-rose-500" : "text-amber-800 dark:text-amber-500"
                }`}>
                  {confirmState.titulo}
                </h3>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{confirmState.mensaje}</p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmState(null)}
                  className="px-4 py-2 text-sm font-bold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { confirmState.onConfirm(); setConfirmState(null); }}
                  className={`px-4 py-2 text-sm font-bold rounded-xl text-white transition-colors ${
                    confirmState.tipo === "peligro" ? "bg-rose-600 hover:bg-rose-500" : "bg-amber-500 hover:bg-amber-400"
                  }`}
                >
                  {confirmState.textoConfirmar}
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
