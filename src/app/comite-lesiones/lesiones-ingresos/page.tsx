"use client";

import { useState } from "react";
import {
  collection, query, where, orderBy, limit, getDocs, setDoc, addDoc, doc, serverTimestamp, Timestamp,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import { calcularEdad, toDate, ESTADO_LABEL as ESTADO_PACIENTE_LABEL, ESTADO_BADGE } from "@/lib/pacientes/helpers";
import {
  TIPOS_CASO, TIPO_CASO_LABEL, TIPO_CASO_CHIP, analizarIngreso, esMenorDeEdad,
  GRUPOS_LESION, GRUPO_LESION_LABEL, SOLICITUD_NOTA_MAX,
  type AnalisisIngreso, type GrupoLesion,
} from "@/lib/conapinaFgr";
import {
  ShieldAlert, Car, HeartCrack, Search, X, Download, AlertTriangle, CheckCircle2,
  Activity, ChevronLeft, ChevronRight, Info, Loader2, CircleSlash, ClipboardCheck,
  RefreshCw, Megaphone, Send, AlertCircle,
} from "lucide-react";
import type {
  Paciente, TipoCasoConapinaFgr, NotificacionConapinaFgr, RevisionLesion, ResultadoRevisionLesion,
  SolicitudNotificacionLesion,
} from "@/types";

const ICONO_CASO = { violencia: ShieldAlert, accidente_transito: Car, intento_suicida: HeartCrack } as const;

// Techo de lectura por consulta. El rango lo elige el usuario, así que hay que
// acotarlo: sin esto un rango de un año podría leer decenas de miles de docs.
const MAX_INGRESOS = 2000;
const MAX_AVISOS = 1000;
const PAGE_SIZE = 20;

type FiltroRevision = "todos" | "pendiente" | "corresponde" | "no_corresponde" | "sin_aviso";

// ── Caché del escaneo de ingresos ───────────────────────────────────────────
// El tamizaje es caro por diseño: hay que leer TODOS los ingresos del periodo
// para filtrar por diagnóstico en el cliente (la causa externa no existe al
// ingresar, así que no hay nada acotable en el servidor). Medido sobre datos
// reales: un mes = ~1,250 ingresos leídos para ~44 candidatos (3.5%).
//
// Por eso el escaneo se guarda en una caché de módulo (sobrevive a la
// navegación SPA, no a un reload) que cubre la UNIÓN de los rangos ya
// consultados, y cada búsqueda solo lee los días que le falten:
//   · mismo rango                → 0 lecturas de pacientes
//   · se corre "Hasta"           → solo los días nuevos del final
//   · se amplía hacia atrás      → solo los días nuevos del inicio
//   · rango más corto            → se recorta el escaneo ya hecho
//   · rango disjunto             → escaneo completo, reemplaza la caché
// El botón "Actualizar" fuerza el escaneo completo del rango pedido.
//
// Los avisos y las revisiones NO se cachean: son decenas de documentos y de
// ellos depende el cruce "Falta el aviso", que debe verse siempre al día.
interface Candidato {
  paciente: Paciente;
  analisis: AnalisisIngreso;
}

interface CacheEscaneo {
  desde: string;
  hasta: string;          // último día realmente escaneado
  candidatos: Candidato[];
  leidos: number;         // ingresos revisados en [desde, hasta]
  tope: boolean;
  escaneadoEn: Date;
}

// La mutación vive a nivel de módulo a propósito: la regla de lint
// `react-hooks/globals` prohíbe reasignar una variable de módulo desde dentro
// del componente.
let cacheEscaneo: CacheEscaneo | null = null;
const getCacheEscaneo = () => cacheEscaneo;
const setCacheEscaneo = (c: CacheEscaneo) => { cacheEscaneo = c; };

const inicioDia = (iso: string) => new Date(iso + "T00:00:00");
const finDia = (iso: string) => new Date(iso + "T23:59:59.999");

const thCls = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap";
const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500";

interface Fila {
  paciente: Paciente;
  analisis: AnalisisIngreso;
  tieneAviso: boolean;
  revision: RevisionLesion | null;
  // Ya hay una solicitud de notificación PENDIENTE para este ingreso: los
  // médicos ya lo ven en su bandeja, no hay que volver a pedirlo.
  solicitada: boolean;
}

const primerDiaDelMes = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
};
const hoyISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function LesionesIngresosPage() {
  const { profile } = useAuth();

  const [fechaDesde, setFechaDesde] = useState(primerDiaDelMes());
  const [fechaHasta, setFechaHasta] = useState(hoyISO());
  const [grupo, setGrupo] = useState<GrupoLesion | "todos">("todos");
  const [filtro, setFiltro] = useState<FiltroRevision>("todos");

  const [filas, setFilas] = useState<Fila[] | null>(null);   // null = aún no se busca
  // Alcance de lo que se está mostrando. `leidos` es null cuando la vista se
  // sirvió de un escaneo más ancho (rango recortado): no se sabe cuántos
  // ingresos hubo solo en el sub-rango sin volver a leerlos.
  const [alcance, setAlcance] = useState<{
    leidos: number | null; tope: boolean; escaneadoEn: Date; desdeCubierto: string; hastaCubierto: string;
  } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [exportando, setExportando] = useState(false);

  // Modal de revisión
  const [revisando, setRevisando] = useState<Fila | null>(null);
  const [resultado, setResultado] = useState<ResultadoRevisionLesion | "">("");
  const [categoria, setCategoria] = useState<TipoCasoConapinaFgr | "">("");
  const [observacion, setObservacion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errGuardar, setErrGuardar] = useState<string | null>(null);

  // Modal de solicitud de notificación al área médica
  const [solicitando, setSolicitando] = useState<Fila | null>(null);
  const [notaSolicitud, setNotaSolicitud] = useState("");
  const [guardandoSolicitud, setGuardandoSolicitud] = useState(false);
  const [errSolicitud, setErrSolicitud] = useState<string | null>(null);

  const buscar = async (forzar = false) => {
    if (!fechaDesde || !fechaHasta) {
      setError("Elige el rango de fechas de ingreso.");
      return;
    }
    if (fechaHasta < fechaDesde) {
      setError("La fecha 'Hasta' no puede ser anterior a 'Desde'.");
      return;
    }
    setBuscando(true);
    setError(null);
    try {
      const desde = Timestamp.fromDate(inicioDia(fechaDesde));
      const hasta = Timestamp.fromDate(finDia(fechaHasta));

      // Qué falta leer de `pacientes`. La caché sirve de base siempre que su
      // rango solape con el pedido: solo se leen los huecos que le falten (a la
      // izquierda si se amplía hacia atrás, a la derecha si se corre "Hasta").
      // Si los rangos son disjuntos no hay nada que reaprovechar y se escanea
      // de cero.
      // Un escaneo truncado por el tope NO sirve de base: Firestore devuelve los
      // más recientes del rango, así que le faltan los días viejos y ampliar
      // hacia atrás dejaría un hueco invisible en medio.
      const cache = forzar ? null : getCacheEscaneo();
      const base = cache && !cache.tope && !(fechaHasta < cache.desde || fechaDesde > cache.hasta) ? cache : null;

      // Rango y orden sobre el MISMO campo → no exige índice compuesto.
      const rango = (
        ini: Timestamp, opIni: ">=" | ">",
        fin: Timestamp, opFin: "<=" | "<",
      ) => query(
        collection(db, "pacientes"),
        where("fechaIngreso", opIni, ini),
        where("fechaIngreso", opFin, fin),
        orderBy("fechaIngreso", "desc"),
        limit(MAX_INGRESOS),
      );

      const huecos: ReturnType<typeof rango>[] = [];
      if (!base) {
        huecos.push(rango(desde, ">=", hasta, "<="));
      } else {
        // Días anteriores a lo ya escaneado (se amplió hacia atrás).
        if (fechaDesde < base.desde) huecos.push(rango(desde, ">=", Timestamp.fromDate(inicioDia(base.desde)), "<"));
        // Días posteriores a lo ya escaneado (se corrió "Hasta").
        if (fechaHasta > base.hasta) huecos.push(rango(Timestamp.fromDate(finDia(base.hasta)), ">", hasta, "<="));
      }

      const [snapsPacientes, snapAvisos, snapRevisiones, snapSolicitudes] = await Promise.all([
        Promise.all(huecos.map(q => getDocs(q))),
        // Los avisos del periodo, sin techo superior: el aviso del médico
        // siempre es posterior al ingreso.
        getDocs(query(
          collection(db, "notificaciones_conapina_fgr"),
          where("creadoEn", ">=", desde),
          orderBy("creadoEn", "desc"),
          limit(MAX_AVISOS),
        )),
        getDocs(query(
          collection(db, "revisiones_lesiones"),
          where("fechaIngreso", ">=", desde),
          where("fechaIngreso", "<=", hasta),
          orderBy("fechaIngreso", "desc"),
          limit(MAX_INGRESOS),
        )),
        // Solicitudes pendientes de notificación (son pocas y sin acotar por
        // fecha a propósito: una vieja sin resolver debe seguirse viendo).
        getDocs(query(
          collection(db, "solicitudes_notificacion_lesion"),
          where("estado", "==", "pendiente"),
        )),
      ]);

      // Candidatos de lo recién leído (solo ingresos con diagnóstico de lesión).
      const nuevos: Candidato[] = [];
      let leidosNuevos = 0;
      let topeNuevo = false;
      for (const snap of snapsPacientes) {
        leidosNuevos += snap.size;
        topeNuevo = topeNuevo || snap.size >= MAX_INGRESOS;
        for (const d of snap.docs) {
          const p = { id: d.id, ...d.data() } as Paciente;
          const analisis = analizarIngreso(p);
          if (analisis) nuevos.push({ paciente: p, analisis });
        }
      }

      // La caché pasa a cubrir la UNIÓN de lo que ya tenía y lo que se pidió.
      const desdeCubierto = base ? (fechaDesde < base.desde ? fechaDesde : base.desde) : fechaDesde;
      const hastaCubierto = base ? (fechaHasta > base.hasta ? fechaHasta : base.hasta) : fechaHasta;
      const candidatos = [...(base?.candidatos ?? []), ...nuevos]
        .sort((a, b) => (toDate(b.paciente.fechaIngreso)?.getTime() ?? 0) - (toDate(a.paciente.fechaIngreso)?.getTime() ?? 0));

      setCacheEscaneo({
        desde: desdeCubierto,
        hasta: hastaCubierto,
        candidatos,
        leidos: (base?.leidos ?? 0) + leidosNuevos,
        tope: (base?.tope ?? false) || topeNuevo,
        // Si no hubo que leer nada, la hora del escaneo sigue siendo la vieja.
        escaneadoEn: huecos.length === 0 && base ? base.escaneadoEn : new Date(),
      });
      const actualizada = getCacheEscaneo()!;

      // Solo se muestra lo pedido, aunque el escaneo cubra un rango más ancho.
      const ini = inicioDia(fechaDesde).getTime();
      const fin = finDia(fechaHasta).getTime();
      const visibles = candidatos.filter(c => {
        const t = toDate(c.paciente.fechaIngreso)?.getTime() ?? 0;
        return t >= ini && t <= fin;
      });

      // El conteo de ingresos revisados solo aplica si lo escaneado coincide
      // con lo pedido; si la caché cubre más, no se sabe cuántos hubo dentro
      // del sub-rango sin volver a leerlos.
      const exacto = fechaDesde === desdeCubierto && fechaHasta === hastaCubierto;

      // El cruce se hace por INGRESO, no por expediente: un paciente con dos
      // estancias puede tener aviso de una sola, y marcarlas ambas dejaría
      // escapar justo el hueco que persigue el comité. Los avisos sin
      // `pacienteId` (si alguno quedara) caen al cruce viejo por expediente,
      // para no reclamar un aviso que en realidad sí se dio.
      const avisos = snapAvisos.docs
        .map(d => d.data() as NotificacionConapinaFgr)
        .filter(n => n.estado !== "anulado");
      const conAvisoPorIngreso = new Set(avisos.map(n => n.pacienteId).filter(Boolean));
      const conAvisoPorExpediente = new Set(
        avisos.filter(n => !n.pacienteId).map(n => (n.pacienteExpediente ?? "").trim().toLowerCase()),
      );
      const tieneAviso = (p: Paciente) =>
        conAvisoPorIngreso.has(p.id) || conAvisoPorExpediente.has((p.expediente ?? "").trim().toLowerCase());
      const revisiones = new Map<string, RevisionLesion>(
        snapRevisiones.docs.map(d => [d.id, { id: d.id, ...d.data() } as RevisionLesion]),
      );

      // Mismo criterio que los avisos: por INGRESO cuando la solicitud lo trae,
      // por expediente si quedara alguna sin pacienteId.
      const solicitudesPend = snapSolicitudes.docs.map(d => d.data() as SolicitudNotificacionLesion);
      const solicitadaPorIngreso = new Set(solicitudesPend.map(s => s.pacienteId).filter(Boolean));
      const solicitadaPorExpediente = new Set(
        solicitudesPend.filter(s => !s.pacienteId).map(s => (s.expediente ?? "").trim().toLowerCase()),
      );
      const estaSolicitada = (p: Paciente) =>
        solicitadaPorIngreso.has(p.id) || solicitadaPorExpediente.has((p.expediente ?? "").trim().toLowerCase());

      setFilas(visibles.map(c => ({
        ...c,
        tieneAviso: tieneAviso(c.paciente),
        revision: revisiones.get(c.paciente.id ?? "") ?? null,
        solicitada: estaSolicitada(c.paciente),
      })));
      setAlcance({
        leidos: exacto ? actualizada.leidos : null,
        tope: actualizada.tope,
        escaneadoEn: actualizada.escaneadoEn,
        desdeCubierto: actualizada.desde,
        hastaCubierto: actualizada.hasta,
      });
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la búsqueda.");
      setFilas([]);
      setAlcance(null);
    } finally {
      setBuscando(false);
    }
  };

  const displayList = (filas ?? []).filter(f => {
    if (grupo !== "todos" && f.analisis.grupo !== grupo) return false;
    if (filtro === "pendiente" && f.revision) return false;
    if (filtro === "corresponde" && f.revision?.resultado !== "corresponde") return false;
    if (filtro === "no_corresponde" && f.revision?.resultado !== "no_corresponde") return false;
    if (filtro === "sin_aviso" && !(f.revision?.resultado === "corresponde" && !f.tieneAviso)) return false;
    return true;
  });

  const filtrosKey = `${grupo}|${filtro}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) {
    setFiltrosPrevios(filtrosKey);
    setPage(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const paginaActual = Math.min(page, totalPaginas);
  const paginados = displayList.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  const todas = filas ?? [];
  const pendientes = todas.filter(f => !f.revision).length;
  const corresponden = todas.filter(f => f.revision?.resultado === "corresponde").length;
  const noCorresponden = todas.filter(f => f.revision?.resultado === "no_corresponde").length;
  // El hueco que importa: se determinó que sí es un caso pero el médico nunca
  // lo notificó, así que no está en la bandeja de avisos.
  const correspondenSinAviso = todas.filter(f => f.revision?.resultado === "corresponde" && !f.tieneAviso).length;

  const formatFecha = (d?: Date | null) =>
    d ? d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const abrirRevision = (f: Fila) => {
    setRevisando(f);
    setResultado(f.revision?.resultado ?? "");
    setCategoria(f.revision?.categoria ?? f.analisis.sugerida ?? "");
    setObservacion(f.revision?.observacion ?? "");
    setErrGuardar(null);
  };

  const puedeGuardar = !!resultado && (resultado === "no_corresponde" || !!categoria);

  const guardarRevision = async () => {
    if (!revisando?.paciente.id || !profile || !puedeGuardar) return;
    setGuardando(true);
    setErrGuardar(null);
    const p = revisando.paciente;
    try {
      const datos = {
        pacienteId: p.id!,
        expediente: p.expediente ?? "",
        pacienteNombre: `${p.apellidos ?? ""}, ${p.nombres ?? ""}`.trim(),
        fechaIngreso: p.fechaIngreso,
        resultado,
        categoria: resultado === "corresponde" ? categoria : null,
        observacion: observacion.trim() || null,
        revisadoPor: profile.uid,
        revisadoPorNombre: profile.nombre,
        // Las reglas exigen revisadoEn == request.time: la revisión no se antedata.
        revisadoEn: serverTimestamp(),
      };
      // El id del documento es el id del INGRESO: revisar dos veces sobrescribe
      // en vez de duplicar, y dos ingresos del mismo expediente van separados.
      await setDoc(doc(db, "revisiones_lesiones", p.id!), datos);

      const local: RevisionLesion = { ...datos, id: p.id!, revisadoEn: new Date() } as RevisionLesion;
      setFilas(prev => prev?.map(f => (f.paciente.id === p.id ? { ...f, revision: local } : f)) ?? prev);
      setRevisando(null);
    } catch (e) {
      setErrGuardar(e instanceof Error ? e.message : "No se pudo guardar la revisión.");
    } finally {
      setGuardando(false);
    }
  };

  const abrirSolicitud = (f: Fila) => {
    setSolicitando(f);
    setNotaSolicitud("");
    setErrSolicitud(null);
  };

  // Difunde el caso a la bandeja CONAPINA/FGR de todos los médicos. La
  // categoría sugerida sale de la revisión (o del código, si aún no se revisó).
  const enviarSolicitud = async () => {
    if (!solicitando || !profile) return;
    const nota = notaSolicitud.trim();
    if (nota.length > SOLICITUD_NOTA_MAX) {
      setErrSolicitud(`La nota no puede pasar de ${SOLICITUD_NOTA_MAX} caracteres.`);
      return;
    }
    setGuardandoSolicitud(true);
    setErrSolicitud(null);
    const p = solicitando.paciente;
    try {
      await addDoc(collection(db, "solicitudes_notificacion_lesion"), {
        pacienteId: p.id ?? null,
        expediente: p.expediente ?? "",
        pacienteNombre: `${p.apellidos ?? ""}, ${p.nombres ?? ""}`.trim(),
        servicio: p.servicioActual || p.servicioIngreso || "",
        origen: "tamizaje",
        categoriaSugerida: solicitando.revision?.categoria ?? solicitando.analisis.sugerida ?? null,
        nota: nota || null,
        estado: "pendiente",
        creadoPor: profile.uid,
        creadoPorNombre: profile.nombre,
        // Las reglas exigen creadoEn == request.time: la solicitud no se antedata.
        creadoEn: serverTimestamp(),
      });
      setFilas(prev => prev?.map(f => (f.paciente.id === p.id ? { ...f, solicitada: true } : f)) ?? prev);
      setSolicitando(null);
    } catch (e) {
      setErrSolicitud(e instanceof Error ? e.message : "No se pudo enviar la solicitud.");
    } finally {
      setGuardandoSolicitud(false);
    }
  };

  const exportar = async () => {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const rows = displayList.map(f => {
        const p = f.paciente;
        return {
          EXPEDIENTE: p.expediente ?? "",
          PACIENTE: `${p.apellidos ?? ""}, ${p.nombres ?? ""}`.trim(),
          EDAD: calcularEdad(toDate(p.fechaNacimiento)) ?? "",
          "FECHA DE INGRESO": formatFecha(toDate(p.fechaIngreso)),
          "SERVICIO": p.servicioActual || p.servicioIngreso || "",
          "GRUPO CIE-10": GRUPO_LESION_LABEL[f.analisis.grupo],
          "CODIGO CIE-10": f.analisis.codigo,
          DIAGNOSTICO: f.analisis.descripcion,
          "TOMADO DE": f.analisis.origen,
          "ESTADO DEL PACIENTE": ESTADO_PACIENTE_LABEL[p.estado] ?? p.estado ?? "",
          REVISION: f.revision ? (f.revision.resultado === "corresponde" ? "Corresponde" : "No corresponde") : "Pendiente",
          "TIPO DE CASO": f.revision?.categoria ? TIPO_CASO_LABEL[f.revision.categoria] : "",
          "OBSERVACION": f.revision?.observacion ?? "",
          "REVISADO POR": f.revision?.revisadoPorNombre ?? "",
          "TIENE AVISO CONAPINA/FGR": f.tieneAviso ? "SI" : "NO",
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ingresos lesiones");
      XLSX.writeFile(wb, `ingresos_lesiones_${fechaDesde}_a_${fechaHasta}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setExportando(false);
    }
  };

  const FILTROS: { label: string; value: FiltroRevision; n?: number }[] = [
    { label: "Todos", value: "todos" },
    { label: "Por revisar", value: "pendiente", n: pendientes },
    { label: "Corresponden", value: "corresponde", n: corresponden },
    { label: "No corresponden", value: "no_corresponde", n: noCorresponden },
    { label: "Falta el aviso", value: "sin_aviso", n: correspondenSinAviso },
  ];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950">
          <Activity size={17} className="text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Ingresos por lesiones intencionales</h1>
          <p className="mt-0.5 text-xs text-slate-500">Tamizaje de expedientes con diagnóstico de lesión, para revisar caso por caso</p>
        </div>
      </div>

      {/* Criterio de búsqueda */}
      <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-5">
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Periodo de ingreso</p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">Buscar ingresos con lesión</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            La lista es de <strong>candidatos</strong>: todo ingreso con diagnóstico de traumatismo, intoxicación o causa
            externa. Revise cada uno para decidir si el hecho fue accidente de tránsito, violencia o autoinfligido.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Desde</span>
            <DateField value={fechaDesde} onChange={setFechaDesde} placeholder="Desde" ariaLabel="Ingreso desde" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Hasta</span>
            <DateField value={fechaHasta} onChange={setFechaHasta} placeholder="Hasta" ariaLabel="Ingreso hasta" maxDate={new Date()} />
          </div>
          <button onClick={() => buscar()} disabled={buscando}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-50">
            {buscando ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            {buscando ? "Buscando…" : "Buscar"}
          </button>
          {filas !== null && (
            <button onClick={exportar} disabled={exportando || displayList.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50">
              <Download size={13} /> {exportando ? "Generando..." : "Excel"}
            </button>
          )}
        </div>

        {/* Alcance de lo mostrado: hasta dónde llegó el escaneo y cuándo se hizo.
            "Actualizar" vuelve a leer el periodo completo — necesario porque el
            diagnóstico de egreso se agrega días después del ingreso y puede
            convertir en candidato a un ingreso ya escaneado. */}
        {alcance && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-slate-400">
            <span>
              Escaneado del{" "}
              <strong className="font-semibold text-slate-500 dark:text-slate-400">{formatFecha(inicioDia(alcance.desdeCubierto))}</strong>
              {" al "}
              <strong className="font-semibold text-slate-500 dark:text-slate-400">{formatFecha(inicioDia(alcance.hastaCubierto))}</strong>
              {" · "}
              {alcance.escaneadoEn.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button onClick={() => buscar(true)} disabled={buscando}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-cyan-700 transition-colors hover:bg-cyan-50 disabled:opacity-50 dark:text-cyan-300 dark:hover:bg-cyan-950/40">
              <RefreshCw size={11} className={buscando ? "animate-spin" : ""} /> Actualizar
            </button>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="text-xs">{error}</span>
          </div>
        )}

        {filas !== null && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Tile n={todas.length} label="Candidatos" icon={Activity} tone="cyan" />
              <Tile n={pendientes} label="Por revisar" icon={ClipboardCheck} tone="amber" />
              <Tile n={corresponden} label="Corresponden" icon={CheckCircle2} tone="emerald" />
              <Tile n={correspondenSinAviso} label="Falta el aviso del médico" icon={AlertTriangle} tone="rose" />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {FILTROS.map(f => (
                <button key={f.value} onClick={() => setFiltro(f.value)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    filtro === f.value
                      ? f.value === "sin_aviso" ? "bg-rose-600 text-white" : "bg-blue-600 text-white"
                      : "border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  }`}>
                  {f.label}
                  {typeof f.n === "number" && f.n > 0 && (
                    <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${filtro === f.value ? "bg-white/25" : "bg-slate-200 dark:bg-slate-700"}`}>{f.n}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Grupo CIE-10:</span>
              {(["todos", ...GRUPOS_LESION] as const).map(g => (
                <button key={g} onClick={() => setGrupo(g)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    grupo === g
                      ? "bg-slate-700 text-white dark:bg-slate-600"
                      : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                  }`}>
                  {g === "todos" ? "Todos" : GRUPO_LESION_LABEL[g]}
                </button>
              ))}
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-slate-500">
              <Info size={13} className="mt-0.5 shrink-0 text-cyan-600 dark:text-cyan-300" />
              {alcance && alcance.leidos !== null
                ? <>Se revisaron {alcance.leidos} ingresos del periodo y {todas.length} tienen diagnóstico de lesión.{" "}</>
                : <>{todas.length} ingresos del periodo tienen diagnóstico de lesión.{" "}</>}
              La causa externa se define hasta el egreso, por eso el tamizaje va por el diagnóstico y hay que
              investigar cada caso. Un ingreso marcado &quot;Corresponde&quot; que no tenga aviso significa que el
              médico no lo notificó.
              {alcance?.tope && <strong className="ml-1 text-amber-700 dark:text-amber-400">Se alcanzó el tope de {MAX_INGRESOS} ingresos: acorta el rango para no perder registros.</strong>}
            </p>
          </>
        )}
      </section>

      {/* Tabla */}
      {filas !== null && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-800/50">
                <tr>
                  <th className={thCls}>Expediente</th>
                  <th className={thCls}>Paciente</th>
                  <th className={thCls}>Edad</th>
                  <th className={thCls}>Ingreso</th>
                  <th className={thCls}>Servicio</th>
                  <th className={thCls}>Diagnóstico</th>
                  <th className={thCls}>Estado</th>
                  <th className={thCls}>Revisión</th>
                  <th className={thCls}>Aviso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginados.map(f => {
                  const p = f.paciente;
                  const edad = calcularEdad(toDate(p.fechaNacimiento));
                  const cat = f.revision?.categoria;
                  const Icono = cat ? ICONO_CASO[cat] : null;
                  const faltaAviso = f.revision?.resultado === "corresponde" && !f.tieneAviso;
                  return (
                    <tr key={p.id} onClick={() => abrirRevision(f)}
                      className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${faltaAviso ? "bg-rose-50/50 dark:bg-rose-950/20" : ""}`}>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">{p.expediente}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">{p.apellidos}, {p.nombres}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {edad !== null ? (
                          <span className="flex items-center gap-1.5">
                            <span className="text-slate-700 dark:text-slate-300">{edad}</span>
                            {esMenorDeEdad(edad) && (
                              <span className="rounded border border-violet-200 bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-800 dark:bg-violet-900/50 dark:text-violet-300">
                                Menor
                              </span>
                            )}
                          </span>
                        ) : <span className="text-slate-400">s/d</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">{formatFecha(toDate(p.fechaIngreso))}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">{p.servicioActual || p.servicioIngreso || "—"}</td>
                      <td className="max-w-[280px] px-3 py-2.5">
                        <span className="flex items-baseline gap-1.5">
                          <span className="shrink-0 font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300">{f.analisis.codigo}</span>
                          <span className="line-clamp-2 text-xs text-slate-700 dark:text-slate-300">{f.analisis.descripcion}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {GRUPO_LESION_LABEL[f.analisis.grupo]} · {f.analisis.origen}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_BADGE[p.estado] ?? ""}`}>
                          {ESTADO_PACIENTE_LABEL[p.estado] ?? p.estado}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {!f.revision ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                            <ClipboardCheck size={12} /> Por revisar
                            {f.analisis.sugerida && (
                              <span title={`Sugerido por el código ${f.analisis.codigo}`}
                                className="ml-1 inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-100 px-1 py-px text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                                {TIPO_CASO_LABEL[f.analisis.sugerida]}
                              </span>
                            )}
                          </span>
                        ) : f.revision.resultado === "no_corresponde" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <CircleSlash size={12} /> No corresponde
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cat ? TIPO_CASO_CHIP[cat] : ""}`}>
                            {Icono && <Icono size={11} />} {cat ? TIPO_CASO_LABEL[cat] : "Corresponde"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {f.tieneAviso ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 size={12} /> Notificado
                          </span>
                        ) : faltaAviso ? (
                          <span className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-400">
                              <AlertTriangle size={11} /> Falta el aviso
                            </span>
                            {f.solicitada ? (
                              <span title="Ya está en la bandeja de los médicos"
                                className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-400">
                                <Megaphone size={11} /> Solicitada
                              </span>
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); abrirSolicitud(f); }}
                                title="Pedir al área médica que lo notifique"
                                className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-2 py-0.5 text-[11px] font-bold text-white transition-colors hover:bg-orange-500">
                                <Megaphone size={11} /> Solicitar
                              </button>
                            )}
                          </span>
                        ) : f.solicitada ? (
                          <span title="Ya está en la bandeja de los médicos"
                            className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-400">
                            <Megaphone size={11} /> Solicitada
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {paginados.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-500">
              No hay ingresos con lesión para estos criterios.
            </p>
          )}

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
              <span className="text-xs text-slate-500">{displayList.length} registros · página {paginaActual} de {totalPaginas}</span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={paginaActual === 1}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:hover:text-slate-100"
                  aria-label="Página anterior">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:hover:text-slate-100"
                  aria-label="Página siguiente">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {filas === null && !buscando && (
        <p className="py-12 text-center text-sm text-slate-400">Elige el periodo de ingreso y pulsa Buscar.</p>
      )}

      {/* Modal de revisión */}
      {revisando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="sticky top-0 flex items-center justify-between rounded-t-2xl border-b border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 font-heading">
                <ClipboardCheck size={16} className="text-cyan-500" /> Revisar ingreso
              </h2>
              <button onClick={() => setRevisando(null)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
            </div>

            <div className="space-y-4 p-5 text-sm">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {revisando.paciente.apellidos}, {revisando.paciente.nombres}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">Exp. {revisando.paciente.expediente}</p>
                <p className="mt-1.5 text-xs text-slate-500">
                  Ingreso {formatFecha(toDate(revisando.paciente.fechaIngreso))} · {revisando.paciente.servicioActual || revisando.paciente.servicioIngreso || "—"}
                </p>
                <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{revisando.analisis.origen}</p>
                  <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                    <span className="font-mono font-semibold text-blue-700 dark:text-blue-300">{revisando.analisis.codigo}</span> · {revisando.analisis.descripcion}
                  </p>
                </div>
                {!revisando.tieneAviso && (
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    Este expediente no tiene aviso registrado por ningún médico.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-slate-500">
                  ¿El hecho corresponde a un caso notificable? <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setResultado("corresponde")}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition-all ${
                      resultado === "corresponde"
                        ? "border-emerald-500 bg-emerald-600 text-white"
                        : "border-slate-300 bg-white text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    }`}>
                    Sí, corresponde
                  </button>
                  <button type="button" onClick={() => { setResultado("no_corresponde"); setCategoria(""); }}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition-all ${
                      resultado === "no_corresponde"
                        ? "border-slate-500 bg-slate-600 text-white"
                        : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    }`}>
                    No corresponde
                  </button>
                </div>
              </div>

              {resultado === "corresponde" && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-slate-500">Tipo de caso <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {TIPOS_CASO.map(t => {
                      const Icono = ICONO_CASO[t];
                      return (
                        <button key={t} type="button" onClick={() => setCategoria(t)}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition-all ${
                            categoria === t
                              ? "border-amber-500 bg-amber-600 text-white"
                              : "border-slate-300 bg-white text-slate-600 hover:border-amber-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          }`}>
                          <Icono size={13} /> {TIPO_CASO_LABEL[t]}
                        </button>
                      );
                    })}
                  </div>
                  {revisando.analisis.sugerida && (
                    <p className="mt-2 text-xs text-slate-500">
                      El código {revisando.analisis.codigo} sugiere {TIPO_CASO_LABEL[revisando.analisis.sugerida]}.
                    </p>
                  )}
                  {!revisando.tieneAviso && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs leading-5 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      Si corresponde, el caso debería estar en la bandeja de avisos. Al guardar quedará marcado como
                      &quot;Falta el aviso&quot; para reclamárselo al médico.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Observación (opcional)</label>
                <textarea value={observacion} onChange={e => setObservacion(e.target.value)} rows={3}
                  placeholder="Qué se investigó y en qué se basó la decisión..." className={`${inputCls} resize-none`} />
              </div>

              {revisando.revision && (
                <p className="text-xs text-slate-400">
                  Revisado antes por {revisando.revision.revisadoPorNombre}. Guardar sobrescribe la revisión.
                </p>
              )}

              {errGuardar && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span className="text-xs">{errGuardar}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <button onClick={() => setRevisando(null)} disabled={guardando}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                Cancelar
              </button>
              <button onClick={guardarRevision} disabled={guardando || !puedeGuardar}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
                <ClipboardCheck size={14} /> {guardando ? "Guardando..." : "Guardar revisión"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: solicitar la notificación al área médica */}
      {solicitando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
              <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 font-heading">
                <Megaphone size={16} className="text-orange-500" /> Solicitar notificación
              </h2>
              <button onClick={() => setSolicitando(null)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 dark:border-orange-900/60 dark:bg-orange-950/20">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {solicitando.paciente.apellidos}, {solicitando.paciente.nombres}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">Exp. {solicitando.paciente.expediente}</p>
                {(solicitando.revision?.categoria ?? solicitando.analisis.sugerida) && (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    Se sugerirá al médico:
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TIPO_CASO_CHIP[(solicitando.revision?.categoria ?? solicitando.analisis.sugerida)!]}`}>
                      {TIPO_CASO_LABEL[(solicitando.revision?.categoria ?? solicitando.analisis.sugerida)!]}
                    </span>
                  </p>
                )}
              </div>
              <p className="text-xs leading-5 text-slate-500">
                El caso aparecerá en la bandeja CONAPINA/FGR de <strong>todos los médicos</strong> con globo de aviso.
                Se marcará solo cuando alguno envíe la notificación de este expediente.
              </p>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <label className="text-xs font-medium text-slate-500">
                    Nota para el área médica <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <span className={`text-[11px] tabular-nums ${notaSolicitud.trim().length > SOLICITUD_NOTA_MAX ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-400"}`}>
                    {notaSolicitud.trim().length}/{SOLICITUD_NOTA_MAX}
                  </span>
                </div>
                <textarea value={notaSolicitud} onChange={e => setNotaSolicitud(e.target.value)} rows={3}
                  maxLength={SOLICITUD_NOTA_MAX + 100}
                  className={`${inputCls} resize-none`}
                  placeholder="Contexto del caso: qué se detectó en la revisión..." />
              </div>
              {errSolicitud && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span className="text-xs">{errSolicitud}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <button onClick={() => setSolicitando(null)} disabled={guardandoSolicitud}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                Cancelar
              </button>
              <button onClick={enviarSolicitud} disabled={guardandoSolicitud || notaSolicitud.trim().length > SOLICITUD_NOTA_MAX}
                className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-500 disabled:opacity-50">
                <Send size={14} /> {guardandoSolicitud ? "Enviando..." : "Enviar a los médicos"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TONOS = {
  cyan: { borde: "border-cyan-100 dark:border-cyan-900/60", fondo: "bg-cyan-50/70 dark:bg-cyan-950/25", icono: "bg-cyan-600" },
  amber: { borde: "border-amber-100 dark:border-amber-900/60", fondo: "bg-amber-50/70 dark:bg-amber-950/25", icono: "bg-amber-500" },
  emerald: { borde: "border-emerald-100 dark:border-emerald-900/60", fondo: "bg-emerald-50/70 dark:bg-emerald-950/25", icono: "bg-emerald-500" },
  rose: { borde: "border-rose-100 dark:border-rose-900/60", fondo: "bg-rose-50/70 dark:bg-rose-950/25", icono: "bg-rose-500" },
} as const;

function Tile({ n, label, icon: Icono, tone }: {
  n: number; label: string; icon: React.ElementType; tone: keyof typeof TONOS;
}) {
  const t = TONOS[tone];
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${t.borde} ${t.fondo}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${t.icono}`}><Icono size={16} /></span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{n}</p>
        <p className="mt-1 truncate text-[11px] font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}
