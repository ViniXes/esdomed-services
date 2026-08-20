"use client";

import { useEffect, useState } from "react";
import {
  collection, query, where, orderBy, limit, onSnapshot, getDocs, addDoc, updateDoc, doc, serverTimestamp,
} from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BuscadorIngresoPorExpediente } from "@/components/pacientes/BuscadorIngresoPorExpediente";
import {
  TIPOS_CASO, TIPO_CASO_LABEL, TIPO_CASO_CHIP,
  SOLICITUD_ESTADO_LABEL, SOLICITUD_ESTADO_CHIP, SOLICITUD_ORIGEN_LABEL, SOLICITUD_NOTA_MAX,
} from "@/lib/conapinaFgr";
import {
  Megaphone, ShieldAlert, Car, HeartCrack, X, CheckCircle2, AlertCircle, AlertTriangle,
  Info, Ban, ArrowLeft, Clock3, Send,
} from "lucide-react";
import type { Paciente, TipoCasoConapinaFgr, NotificacionConapinaFgr, SolicitudNotificacionLesion } from "@/types";

// Difusión al área médica: el comité pide aquí que un caso se notifique. La
// solicitud aparece en la bandeja CONAPINA/FGR de TODOS los médicos (con globo
// de aviso) y se cierra sola cuando alguno envía la notificación del mismo
// expediente. Entra cualquier ingreso — aunque su diagnóstico no sea de lesión:
// para eso es la búsqueda directa, además del botón del informe de tamizaje.

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500 transition";
const thCls = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap";

const ICONO_CASO = { violencia: ShieldAlert, accidente_transito: Car, intento_suicida: HeartCrack } as const;

// Techo de la lista: el histórico completo vive en Firestore; aquí interesa lo
// reciente y lo pendiente.
const MAX_LISTA = 100;

// El servidor resuelve creadoEn; mientras la escritura está pendiente llega
// null → esos documentos son los más nuevos.
const msDe = (v: unknown) => (v as { toDate?: () => Date })?.toDate?.()?.getTime() ?? Number.MAX_SAFE_INTEGER;

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

export default function SolicitudesNotificacionPage() {
  const { profile } = useAuth();

  const [solicitudes, setSolicitudes] = useState<SolicitudNotificacionLesion[]>([]);

  // Nueva solicitud
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [categoria, setCategoria] = useState<TipoCasoConapinaFgr | "">("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errCrear, setErrCrear] = useState<string | null>(null);
  const [creada, setCreada] = useState<string | null>(null);   // mensaje de éxito
  // Avisos ya registrados del expediente elegido: si el caso ya se notificó no
  // hay nada que pedir. Se consulta al seleccionar (1 consulta pequeña).
  const [avisosExistentes, setAvisosExistentes] = useState<NotificacionConapinaFgr[] | null>(null);

  // Cancelación
  const [cancelando, setCancelando] = useState<SolicitudNotificacionLesion | null>(null);
  const [motivoCancel, setMotivoCancel] = useState("");
  const [cancelandoSave, setCancelandoSave] = useState(false);
  const [errCancel, setErrCancel] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "solicitudes_notificacion_lesion"), orderBy("creadoEn", "desc"), limit(MAX_LISTA));
    return onSnapshot(q, s => {
      const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudNotificacionLesion));
      docs.sort((a, b) => msDe(b.creadoEn) - msDe(a.creadoEn));
      setSolicitudes(docs);
    });
  }, []);

  // Al elegir un ingreso se revisa si el expediente ya tiene avisos (para no
  // pedir lo que ya está notificado). El reset a null se hace al seleccionar
  // (en onSelect / limpiarFormulario), no aquí: el efecto solo consulta.
  useEffect(() => {
    if (!paciente?.expediente) return;
    let cancel = false;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, "notificaciones_conapina_fgr"),
          where("pacienteExpediente", "==", paciente.expediente),
        ));
        if (cancel) return;
        setAvisosExistentes(
          snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionConapinaFgr)).filter(n => n.estado !== "anulado"),
        );
      } catch {
        if (!cancel) setAvisosExistentes([]);
      }
    })();
    return () => { cancel = true; };
  }, [paciente?.expediente]);

  const notaLimpia = nota.trim();
  const errorNota = notaLimpia.length > SOLICITUD_NOTA_MAX
    ? `La nota no puede pasar de ${SOLICITUD_NOTA_MAX} caracteres.`
    : null;

  // Duplicado contra la lista ya cargada: 0 lecturas extra.
  const pendienteDelExpediente = paciente
    ? solicitudes.find(s => s.estado === "pendiente"
        && s.expediente.trim().toLowerCase() === paciente.expediente.trim().toLowerCase())
    : undefined;

  const limpiarFormulario = () => {
    setPaciente(null);
    setCategoria("");
    setNota("");
    setErrCrear(null);
    setAvisosExistentes(null);
  };

  const crear = async () => {
    if (!paciente || !profile || errorNota || pendienteDelExpediente) return;
    setGuardando(true);
    setErrCrear(null);
    try {
      await addDoc(collection(db, "solicitudes_notificacion_lesion"), {
        pacienteId: paciente.id ?? null,
        expediente: paciente.expediente,
        pacienteNombre: `${paciente.apellidos}, ${paciente.nombres}`,
        servicio: paciente.servicioActual || paciente.servicioIngreso || "",
        origen: "manual",
        categoriaSugerida: categoria || null,
        nota: notaLimpia || null,
        estado: "pendiente",
        creadoPor: profile.uid,
        creadoPorNombre: profile.nombre,
        // Las reglas exigen creadoEn == request.time: la solicitud no se antedata.
        creadoEn: serverTimestamp(),
      });
      setCreada(`${paciente.apellidos}, ${paciente.nombres} · Exp. ${paciente.expediente}`);
      limpiarFormulario();
    } catch (err) {
      setErrCrear(err instanceof Error ? err.message : "No se pudo enviar la solicitud.");
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = async () => {
    if (!cancelando?.id || !profile) return;
    setCancelandoSave(true);
    setErrCancel(null);
    try {
      await updateDoc(doc(db, "solicitudes_notificacion_lesion", cancelando.id), {
        estado: "cancelado",
        canceladoPor: profile.uid,
        canceladoPorNombre: profile.nombre,
        canceladoEn: serverTimestamp(),
        motivoCancelacion: motivoCancel.trim() || null,
      });
      setCancelando(null);
      setMotivoCancel("");
    } catch (err) {
      setErrCancel(err instanceof Error ? err.message : "No se pudo cancelar la solicitud.");
    } finally {
      setCancelandoSave(false);
    }
  };

  const pendientes = solicitudes.filter(s => s.estado === "pendiente").length;
  const notificadas = solicitudes.filter(s => s.estado === "notificado").length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950">
          <Megaphone size={17} className="text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Solicitudes al área médica</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Difunda un caso pendiente de notificación: aparece en la bandeja CONAPINA/FGR de todos los médicos
          </p>
        </div>
      </div>

      {/* Nueva solicitud */}
      <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-5">
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-300">Nueva solicitud</p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">Pedir la notificación de un expediente</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Sirve para cualquier ingreso, aunque su diagnóstico no sea de lesión. La solicitud se cierra sola cuando un
            médico notifica el expediente.
          </p>
        </div>

        {!paciente ? (
          <BuscadorIngresoPorExpediente value={paciente} onSelect={p => { setAvisosExistentes(null); setPaciente(p); }} />
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 dark:border-orange-900/60 dark:bg-orange-950/20">
              <p className="font-semibold text-slate-900 dark:text-slate-100">{paciente.apellidos}, {paciente.nombres}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-mono font-medium">Exp. {paciente.expediente}</span>
                {(paciente.servicioActual || paciente.servicioIngreso) && (
                  <span>· {paciente.servicioActual || paciente.servicioIngreso}</span>
                )}
                <span>· Ingresó el {formatDia(paciente.fechaIngreso)}</span>
              </p>
              <button type="button" onClick={limpiarFormulario}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-orange-700 transition-colors hover:text-orange-900 dark:text-orange-300 dark:hover:text-orange-100">
                <ArrowLeft size={13} /> Buscar otro expediente
              </button>
            </div>

            {pendienteDelExpediente && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">
                  <strong className="font-semibold">Este expediente ya tiene una solicitud pendiente</strong>{" "}
                  (de {pendienteDelExpediente.creadoPorNombre}, del {formatDia(pendienteDelExpediente.creadoEn)}).
                  Los médicos ya la ven en su bandeja; no hace falta pedirla otra vez.
                </p>
              </div>
            )}

            {!pendienteDelExpediente && avisosExistentes && avisosExistentes.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
                <Info size={15} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="min-w-0 text-xs leading-5 text-blue-800 dark:text-blue-200">
                  <p className="font-semibold">
                    Este expediente ya tiene {avisosExistentes.length === 1 ? "un aviso registrado" : `${avisosExistentes.length} avisos registrados`}.
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {avisosExistentes.slice(0, 3).map(n => (
                      <li key={n.id}>
                        · {TIPO_CASO_LABEL[n.tipoCaso]} — notificado por {n.medicoNombre} el {formatDia(n.creadoEn)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1">Revise si el caso que va a pedir es realmente otro hecho.</p>
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 block text-xs font-medium text-slate-500">
                Tipo de caso que se sospecha <span className="font-normal text-slate-400">(opcional — orienta al médico)</span>
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {TIPOS_CASO.map(t => {
                  const Icono = ICONO_CASO[t];
                  const activo = categoria === t;
                  return (
                    <button key={t} type="button" onClick={() => setCategoria(activo ? "" : t)}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition-all ${
                        activo
                          ? "border-orange-500 bg-orange-600 text-white"
                          : "border-slate-300 bg-white text-slate-600 hover:border-orange-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      }`}>
                      <Icono size={13} /> {TIPO_CASO_LABEL[t]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <label className="text-xs font-medium text-slate-500">
                  Nota para el área médica <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <span className={`text-[11px] tabular-nums ${notaLimpia.length > SOLICITUD_NOTA_MAX ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-400"}`}>
                  {notaLimpia.length}/{SOLICITUD_NOTA_MAX}
                </span>
              </div>
              <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} maxLength={SOLICITUD_NOTA_MAX + 100}
                className={`${inputCls} resize-none`}
                placeholder="Por qué se pide la notificación: qué se detectó, de dónde salió el caso..." />
              {errorNota && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" /> {errorNota}
                </p>
              )}
            </div>

            {errCrear && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span className="text-xs">{errCrear}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={crear} disabled={guardando || !!errorNota || !!pendienteDelExpediente}
                className="flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-600/25 transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50">
                <Send size={15} /> {guardando ? "Enviando..." : "Enviar a los médicos"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Historial */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-800 md:px-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Seguimiento</p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">Solicitudes enviadas</h2>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
              <Clock3 size={12} /> {pendientes} pendientes
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 font-medium text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
              <CheckCircle2 size={12} /> {notificadas} notificadas
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-800/50">
              <tr>
                <th className={thCls}>Expediente</th>
                <th className={thCls}>Paciente</th>
                <th className={thCls}>Sospecha</th>
                <th className={thCls}>Origen</th>
                <th className={thCls}>Solicitada</th>
                <th className={thCls}>Estado</th>
                <th className={thCls}>Cierre</th>
                <th className={thCls}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {solicitudes.map(sol => (
                <tr key={sol.id} className={sol.estado === "cancelado" ? "opacity-60" : ""}>
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs text-slate-700 dark:text-slate-300">{sol.expediente}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{sol.pacienteNombre}</span>
                    {sol.servicio && <span className="mt-0.5 block text-[11px] text-slate-400">{sol.servicio}</span>}
                    {sol.nota && (
                      <span className="mt-0.5 line-clamp-2 block max-w-[280px] text-[11px] italic text-slate-500">{sol.nota}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {sol.categoriaSugerida ? (
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TIPO_CASO_CHIP[sol.categoriaSugerida]}`}>
                        {TIPO_CASO_LABEL[sol.categoriaSugerida]}
                      </span>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">{SOLICITUD_ORIGEN_LABEL[sol.origen]}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                    {formatDia(sol.creadoEn)}
                    <span className="block text-[11px] text-slate-400">{sol.creadoPorNombre}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SOLICITUD_ESTADO_CHIP[sol.estado]}`}>
                      {SOLICITUD_ESTADO_LABEL[sol.estado]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                    {sol.estado === "notificado" ? (
                      <>
                        {formatFecha(sol.notificadoEn)}
                        <span className="block text-[11px] text-emerald-700 dark:text-emerald-400">{sol.notificadoPorNombre}</span>
                      </>
                    ) : sol.estado === "cancelado" ? (
                      <>
                        {formatFecha(sol.canceladoEn)}
                        <span className="block text-[11px] text-slate-400">
                          {sol.canceladoPorNombre}{sol.motivoCancelacion ? ` · ${sol.motivoCancelacion}` : ""}
                        </span>
                      </>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    {sol.estado === "pendiente" && (
                      <button onClick={() => { setCancelando(sol); setMotivoCancel(""); setErrCancel(null); }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-300">
                        <Ban size={12} /> Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {solicitudes.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-500">Aún no se ha enviado ninguna solicitud.</p>
        )}
        {solicitudes.length >= MAX_LISTA && (
          <p className="border-t border-slate-200 px-4 py-2.5 text-[11px] text-slate-400 dark:border-slate-800">
            Se muestran las {MAX_LISTA} solicitudes más recientes.
          </p>
        )}
      </section>

      {/* Éxito */}
      {creada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10">
              <Megaphone size={26} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">Solicitud enviada</p>
              <p className="mt-1 text-sm text-slate-500">{creada}</p>
              <p className="mt-2 text-xs text-slate-400">
                Ya aparece en la bandeja CONAPINA/FGR de todos los médicos. Se marcará sola cuando alguno la notifique.
              </p>
            </div>
            <button onClick={() => setCreada(null)}
              className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-500">
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Modal de cancelación */}
      {cancelando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
              <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 font-heading">
                <Ban size={16} className="text-rose-500" /> Cancelar solicitud
              </h2>
              <button onClick={() => setCancelando(null)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <p className="text-xs leading-5 text-slate-500">
                Se retirará de la bandeja de los médicos la solicitud de{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-300">{cancelando.pacienteNombre}</span>{" "}
                (Exp. <span className="font-mono">{cancelando.expediente}</span>). No se borra: queda registrada como cancelada.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Motivo <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <textarea value={motivoCancel} onChange={e => setMotivoCancel(e.target.value)} rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder="Ej.: se pidió el expediente equivocado" />
              </div>
              {errCancel && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span className="text-xs">{errCancel}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <button onClick={() => setCancelando(null)} disabled={cancelandoSave}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                Volver
              </button>
              <button onClick={cancelar} disabled={cancelandoSave}
                className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50">
                <Ban size={14} /> {cancelandoSave ? "Cancelando..." : "Cancelar solicitud"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
