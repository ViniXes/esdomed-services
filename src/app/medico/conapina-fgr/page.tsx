"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import {
  TIPO_CASO_LABEL, TIPO_CASO_CHIP, ESTADO_LABEL, ESTADO_CHIP, esMenorDeEdad, INSTANCIA_LABEL,
} from "@/lib/conapinaFgr";
import {
  ShieldAlert, Plus, X, CheckCircle2, AlertCircle, Search, ChevronLeft, ChevronRight,
  Car, HeartCrack, Clock3, FileText, StickyNote, Ban, Landmark,
} from "lucide-react";
import type { NotificacionConapinaFgr } from "@/types";

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

const thCls = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap";

const ICONO_CASO = { violencia: ShieldAlert, accidente_transito: Car, intento_suicida: HeartCrack } as const;
const MOTIVO_ANULACION_MIN = 10;
const PAGE_SIZE = 15;

// El servidor resuelve creadoEn (serverTimestamp); mientras la escritura está
// pendiente llega null → esos documentos son los más nuevos, no los más viejos.
const msDe = (v: unknown) => (v as { toDate?: () => Date })?.toDate?.()?.getTime() ?? Number.MAX_SAFE_INTEGER;

export default function MedicoConapinaFgrPage() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [notificaciones, setNotificaciones] = useState<NotificacionConapinaFgr[]>([]);
  const [detalle, setDetalle] = useState<NotificacionConapinaFgr | null>(null);
  const [page, setPage] = useState(1);

  // Anulación
  const [anulando, setAnulando] = useState<NotificacionConapinaFgr | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [anulandoSave, setAnulandoSave] = useState(false);
  const [errAnular, setErrAnular] = useState<string | null>(null);

  // Filtros del historial
  const [busquedaExpediente, setBusquedaExpediente] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  useEffect(() => {
    if (!user) return;
    // Sin orderBy: se ordena en cliente para no exigir índice compuesto.
    const q = query(collection(db, "notificaciones_conapina_fgr"), where("medicoId", "==", user.uid));
    return onSnapshot(q, s => {
      const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionConapinaFgr));
      docs.sort((a, b) => msDe(b.creadoEn) - msDe(a.creadoEn));
      setNotificaciones(docs);
      setDetalle(prev => (prev?.id ? docs.find(d => d.id === prev.id) ?? prev : prev));
    });
  }, [user]);


  const anular = async () => {
    if (!anulando?.id || !user || !profile) return;
    const motivo = motivoAnulacion.trim();
    if (motivo.length < MOTIVO_ANULACION_MIN) {
      setErrAnular(`Explica el motivo con al menos ${MOTIVO_ANULACION_MIN} caracteres.`);
      return;
    }
    setAnulandoSave(true);
    setErrAnular(null);
    try {
      await updateDoc(doc(db, "notificaciones_conapina_fgr", anulando.id), {
        estado: "anulado",
        anuladoPor: user.uid,
        anuladoPorNombre: profile.nombre,
        anuladoEn: serverTimestamp(),
        motivoAnulacion: motivo,
        actualizadoEn: serverTimestamp(),
      });
      setAnulando(null);
      setMotivoAnulacion("");
    } catch (err) {
      setErrAnular(err instanceof Error ? err.message : "No se pudo anular la notificación.");
    } finally {
      setAnulandoSave(false);
    }
  };

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString("es-SV", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  };
  const formatDia = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
  };

  const displayList = notificaciones.filter(n => {
    if (busquedaExpediente) {
      const q = busquedaExpediente.toLowerCase();
      if (!(n.pacienteExpediente?.toLowerCase() ?? "").includes(q) &&
          !(n.pacienteNombre?.toLowerCase() ?? "").includes(q) &&
          !(n.diagnostico?.descripcion?.toLowerCase() ?? "").includes(q) &&
          !(n.diagnostico?.codigo?.toLowerCase() ?? "").includes(q)) return false;
    }
    if (fechaDesde || fechaHasta) {
      const d = ((n.creadoEn as unknown) as { toDate?: () => Date }).toDate?.() ?? (n.creadoEn as Date);
      if (!d) return true;   // escritura recién enviada, aún sin sello del servidor
      if (fechaDesde && d < new Date(fechaDesde + "T00:00:00")) return false;
      if (fechaHasta && d > new Date(fechaHasta + "T23:59:59")) return false;
    }
    return true;
  });

  // Reinicio de paginación al cambiar los filtros (ajuste de estado en render).
  const filtrosKey = `${busquedaExpediente}|${fechaDesde}|${fechaHasta}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(filtrosKey);
  if (filtrosPrevios !== filtrosKey) {
    setFiltrosPrevios(filtrosKey);
    setPage(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const paginaActual = Math.min(page, totalPaginas);
  const paginados = displayList.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  const porRecibir = notificaciones.filter(n => n.estado === "pendiente").length;
  const recibidas = notificaciones.filter(n => n.estado === "confirmado").length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Encabezado de tarea: deja claro qué se notifica y a quién le llega. */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#4a3312] via-amber-700 to-orange-600 px-5 py-5 shadow-lg shadow-amber-950/20 md:px-7 md:py-6">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
              <ShieldAlert size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white md:text-2xl font-heading">Notificación CONAPINA / FGR</h1>
              <p className="mt-1 max-w-xl text-sm text-amber-50/90">
                Deje constancia del aviso que dio a CONAPINA o la Fiscalía. El Comité de Lesiones Intencionales lo recibe y lo lleva al registro que audita el MINSAL.
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push("/medico/conapina-fgr/nueva")}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 shadow-sm transition-all hover:bg-amber-50"
          >
            <Plus size={16} /> Nueva notificación
          </button>
        </div>
      </section>

      {/* Historial y filtros */}
      <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Seguimiento</p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">Mis notificaciones</h2>
            <p className="mt-0.5 text-xs text-slate-500">Consulte el estado de los avisos enviados al comité.</p>
          </div>
          <span className="text-xs font-medium text-slate-500">{displayList.length} {displayList.length === 1 ? "resultado" : "resultados"}</span>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-cyan-100 bg-cyan-50/70 px-3 py-2.5 dark:border-cyan-900/60 dark:bg-cyan-950/25">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-600 text-white"><FileText size={16} /></span>
            <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{notificaciones.length}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Enviadas</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/25">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white"><Clock3 size={16} /></span>
            <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{porRecibir}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Por recibir</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/25">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white"><CheckCircle2 size={16} /></span>
            <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{recibidas}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Recibidas</p></div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="text" placeholder="Buscar por expediente, paciente o diagnóstico..." value={busquedaExpediente} onChange={e => setBusquedaExpediente(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Desde</span>
            <DateField value={fechaDesde} onChange={setFechaDesde} clearable placeholder="Desde" ariaLabel="Fecha desde" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Hasta</span>
            <DateField value={fechaHasta} onChange={setFechaHasta} clearable placeholder="Hasta" ariaLabel="Fecha hasta" />
          </div>
          {(busquedaExpediente || fechaDesde || fechaHasta) && (
            <button onClick={() => { setBusquedaExpediente(""); setFechaDesde(""); setFechaHasta(""); }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
      </section>

      {/* Tabla: lo justo para ubicar el caso; el resto va en el detalle. */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-800/50">
              <tr>
                <th className={thCls}>Expediente</th>
                <th className={thCls}>Paciente</th>
                <th className={thCls}>Motivo</th>
                <th className={thCls}>Hecho</th>
                <th className={thCls}>Aviso dado a</th>
                <th className={thCls}>Enviada</th>
                <th className={thCls}>Estado</th>
                <th className={thCls}><span className="sr-only">Detalle</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginados.map(n => {
                const Icono = ICONO_CASO[n.tipoCaso] ?? ShieldAlert;
                const anulada = n.estado === "anulado";
                return (
                  <tr key={n.id} onClick={() => setDetalle(n)}
                    className={`cursor-pointer transition-colors hover:bg-amber-50/40 dark:hover:bg-slate-800/60 ${anulada ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          n.estado === "confirmado" ? "bg-emerald-500"
                            : anulada ? "bg-slate-300 dark:bg-slate-600"
                            : "bg-amber-400"
                        }`} />
                        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{n.pacienteExpediente}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{n.pacienteNombre}</span>
                        {esMenorDeEdad(n.pacienteEdad) && (
                          <span className="rounded border border-violet-200 bg-violet-100 px-1 py-px text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-800 dark:bg-violet-900/50 dark:text-violet-300">
                            Menor
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TIPO_CASO_CHIP[n.tipoCaso]}`}>
                        <Icono size={11} /> {TIPO_CASO_LABEL[n.tipoCaso]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">{formatDia(n.fechaHecho)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                      {n.avisoInstancia ? INSTANCIA_LABEL[n.avisoInstancia] : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">{formatDia(n.creadoEn)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_CHIP[n.estado]}`}>
                        {ESTADO_LABEL[n.estado]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                        Detalle <ChevronRight size={13} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {displayList.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-500">
            {notificaciones.length === 0
              ? "Aún no ha enviado notificaciones CONAPINA/FGR."
              : "Sin resultados para los filtros aplicados."}
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

      {/* Detalle completo */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="min-w-0">
                <h2 className="truncate font-bold text-slate-900 dark:text-slate-100 font-heading">{detalle.pacienteNombre}</h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono">Exp. {detalle.pacienteExpediente}</span>
                  {typeof detalle.pacienteEdad === "number" && <span>{detalle.pacienteEdad} años</span>}
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_CHIP[detalle.estado]}`}>
                    {ESTADO_LABEL[detalle.estado]}
                  </span>
                </p>
              </div>
              <button onClick={() => setDetalle(null)} aria-label="Cerrar"
                className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-5 p-5 md:grid-cols-2">
              {/* Columna izquierda: el caso */}
              <div className="space-y-4">
                <section>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">El caso</p>
                  <div className="space-y-2">
                    <Dato label="Motivo" valor={
                      <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TIPO_CASO_CHIP[detalle.tipoCaso]}`}>
                        {TIPO_CASO_LABEL[detalle.tipoCaso]}
                      </span>
                    } />
                    <Dato label="Fecha del hecho" valor={formatDia(detalle.fechaHecho)} />
                    <Dato label="Ubicación" valor={`${detalle.servicio || "—"}${detalle.cama ? ` · Cama ${detalle.cama}` : ""}`} />
                    <Dato label="Enviada" valor={formatFecha(detalle.creadoEn)} />
                  </div>
                </section>

                {(detalle.diagnostico?.codigo || detalle.causaExterna?.codigo) && (
                  <section className="space-y-1.5 rounded-xl border border-blue-100 bg-blue-50/70 p-3 dark:border-blue-900/60 dark:bg-blue-950/25">
                    {detalle.diagnostico?.codigo && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Diagnóstico</p>
                        <p className="mt-0.5 text-xs text-slate-800 dark:text-slate-100">
                          <span className="font-mono font-semibold">{detalle.diagnostico.codigo}</span> · {detalle.diagnostico.descripcion}
                        </p>
                      </div>
                    )}
                    {detalle.causaExterna?.codigo && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Causa externa</p>
                        <p className="mt-0.5 text-xs text-slate-800 dark:text-slate-100">
                          <span className="font-mono font-semibold">{detalle.causaExterna.codigo}</span> · {detalle.causaExterna.descripcion}
                        </p>
                      </div>
                    )}
                  </section>
                )}

                {detalle.nota && (
                  <section>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Nota</p>
                    <p className="flex items-start gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs italic leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                      <StickyNote size={12} className="mt-0.5 shrink-0 text-slate-400" />
                      <span className="whitespace-pre-wrap">{detalle.nota}</span>
                    </p>
                  </section>
                )}
              </div>

              {/* Columna derecha: el aviso y su seguimiento */}
              <div className="space-y-4">
                {detalle.avisoInstancia && detalle.estado !== "anulado" && (
                  <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/25">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      <Landmark size={12} /> Aviso dado a {INSTANCIA_LABEL[detalle.avisoInstancia]}
                    </p>
                    <div className="space-y-2">
                      <Dato label="Fecha" valor={formatDia(detalle.avisoFecha)} />
                      <Dato label="Recibió" valor={detalle.avisoRecibidoPor || "—"} />
                      <Dato label="Lugar / sede" valor={detalle.avisoLugar || "—"} />
                      {detalle.avisoObservacion && <Dato label="Observación" valor={<span className="whitespace-pre-wrap italic">{detalle.avisoObservacion}</span>} />}
                    </div>
                  </section>
                )}

                <section>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Seguimiento del comité</p>
                  {detalle.revisadoPorNombre ? (
                    <div className="space-y-2">
                      <Dato label="Recibida por" valor={detalle.revisadoPorNombre} />
                      <Dato label="Fecha" valor={formatFecha(detalle.revisadoEn)} />
                    </div>
                  ) : detalle.estado === "pendiente" ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      El comité todavía no la ha recibido. Mientras tanto puede anularla.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">—</p>
                  )}

                  {detalle.notasComite && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/60 dark:bg-amber-950/35">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Observación del comité</p>
                      <p className="whitespace-pre-wrap text-xs leading-5 text-slate-700 dark:text-slate-300">{detalle.notasComite}</p>
                    </div>
                  )}
                </section>

                {detalle.estado === "anulado" && (
                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Anulada · {formatFecha(detalle.anuladoEn)}
                    </p>
                    <p className="whitespace-pre-wrap text-xs leading-5 text-slate-600 dark:text-slate-400">{detalle.motivoAnulacion}</p>
                  </section>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              {detalle.estado === "pendiente" && (
                <button
                  onClick={() => { setAnulando(detalle); setMotivoAnulacion(""); setErrAnular(null); setDetalle(null); }}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-300">
                  <Ban size={14} /> Anular notificación
                </button>
              )}
              <button onClick={() => setDetalle(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Modal de anulación */}
      {anulando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
              <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 font-heading">
                <Ban size={16} className="text-rose-500" /> Anular notificación
              </h2>
              <button onClick={() => setAnulando(null)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <p className="text-xs leading-5 text-slate-500">
                Se anulará la notificación de <span className="font-semibold text-slate-700 dark:text-slate-300">{anulando.pacienteNombre}</span>{" "}
                (Exp. <span className="font-mono">{anulando.pacienteExpediente}</span>). No se borra: queda registrada como anulada con su motivo.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Motivo <span className="text-red-500">*</span>
                </label>
                <textarea value={motivoAnulacion} onChange={e => setMotivoAnulacion(e.target.value)} rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder="Ej.: se notificó el expediente equivocado" />
                <p className="mt-1 text-[11px] text-slate-400">Mínimo {MOTIVO_ANULACION_MIN} caracteres.</p>
              </div>
              {errAnular && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span className="text-xs">{errAnular}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <button onClick={() => setAnulando(null)} disabled={anulandoSave}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                Cancelar
              </button>
              <button onClick={anular} disabled={anulandoSave || motivoAnulacion.trim().length < MOTIVO_ANULACION_MIN}
                className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50">
                <Ban size={14} /> {anulandoSave ? "Anulando..." : "Anular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 pt-px text-xs font-medium text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-200">{valor}</span>
    </div>
  );
}
