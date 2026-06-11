"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection, query, where, onSnapshot, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ubicacionLabel } from "@/lib/servicios";
import { toDate } from "@/lib/pacientes/helpers";
import type { NotificacionPrealta, ResultadoConfirmacion } from "@/types";
import {
  CheckCircle2, Clock, Ban, PackageOpen, CalendarDays, Printer, Search,
  ArrowLeft, X, RotateCcw, AlertTriangle, CheckCheck,
} from "lucide-react";

// ── Estilos ───────────────────────────────────────────────────────────────────
const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition";

const RESULTADO_CFG: Record<ResultadoConfirmacion, { label: string; c: string; icon: typeof Clock }> = {
  por_confirmar: { label: "Por confirmar",   c: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900",       icon: Clock },
  confirmada:    { label: "Alta confirmada", c: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900", icon: CheckCircle2 },
  suspendida:    { label: "Suspendida",      c: "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-900",             icon: Ban },
  deposito:      { label: "Depósito",        c: "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950 border-violet-200 dark:border-violet-900",   icon: PackageOpen },
};

// ── Utilidades de fecha ─────────────────────────────────────────────────────────
function fechaStr(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}
function hoyStr(): string { return fechaStr(new Date()); }
function addDays(fecha: string, n: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + n);
  return fechaStr(dt);
}
function fmtFechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("es-SV", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}
function fmtHora(d?: Date): string {
  if (!d) return "—";
  return d.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function generoLetra(g?: string): string {
  if (g === "masculino") return "M";
  if (g === "femenino") return "F";
  return "—";
}
function confDe(r: NotificacionPrealta): ResultadoConfirmacion {
  return r.confirmacion ?? "por_confirmar";
}

type Feedback = { id: number; tipo: "success" | "error"; mensaje: string };

// ── Página ────────────────────────────────────────────────────────────────────
export default function ConfirmacionAltaPage() {
  const { profile } = useAuth();
  const puedeConfirmar = profile?.role === "trabajo_social" || profile?.role === "admin";

  const [fecha, setFecha] = useState(hoyStr());
  const [registros, setRegistros] = useState<NotificacionPrealta[]>([]);
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<"por_confirmar" | "todos">("por_confirmar");

  const [deposito, setDeposito] = useState<NotificacionPrealta | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);

  const feedbackId = useRef(0);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const notify = useCallback((tipo: "success" | "error", mensaje: string) => {
    const id = ++feedbackId.current;
    setFeedbacks(f => [...f, { id, tipo, mensaje }]);
  }, []);
  const dismiss = useCallback((id: number) => setFeedbacks(f => f.filter(x => x.id !== id)), []);

  useEffect(() => {
    const q = query(collection(db, "notificaciones_prealta"), where("fecha", "==", fecha));
    return onSnapshot(q, s => {
      const docs = s.docs.map(d => {
        const data = d.data();
        return {
          id: d.id, ...data,
          horaNotificacion: toDate(data.horaNotificacion),
          confirmadoEn: toDate(data.confirmadoEn),
          creadoEn: toDate(data.creadoEn) ?? new Date(),
        } as NotificacionPrealta;
      });
      docs.sort((a, b) => (a.creadoEn?.getTime() ?? 0) - (b.creadoEn?.getTime() ?? 0));
      setRegistros(docs);
    });
  }, [fecha]);

  const conteos = useMemo(() => {
    const c = { por_confirmar: 0, confirmada: 0, suspendida: 0, deposito: 0 } as Record<ResultadoConfirmacion, number>;
    registros.forEach(r => { c[confDe(r)]++; });
    return c;
  }, [registros]);

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return registros.filter(r => {
      if (filtro === "por_confirmar" && confDe(r) !== "por_confirmar") return false;
      if (!t) return true;
      return (
        r.pacienteExpediente?.toLowerCase().includes(t) ||
        r.pacienteNombre?.toLowerCase().includes(t) ||
        r.servicio?.toLowerCase().includes(t) ||
        (r.cama ?? "").toLowerCase().includes(t) ||
        (r.familiarNombre ?? "").toLowerCase().includes(t)
      );
    });
  }, [registros, texto, filtro]);

  const resolver = async (r: NotificacionPrealta, resultado: ResultadoConfirmacion) => {
    if (!r.id || !profile) return;
    try {
      // Si se revierte un depósito, eliminar la copia reprogramada que se generó
      // (solo si sigue sin confirmar, para no borrar algo ya resuelto en otro día).
      if (confDe(r) === "deposito" && resultado === "por_confirmar") {
        const copias = await getDocs(query(collection(db, "notificaciones_prealta"), where("reprogramadaDe", "==", r.id)));
        await Promise.all(
          copias.docs
            .filter(d => (d.data().confirmacion ?? "por_confirmar") === "por_confirmar")
            .map(d => deleteDoc(doc(db, "notificaciones_prealta", d.id)))
        );
      }
      await updateDoc(doc(db, "notificaciones_prealta", r.id), {
        confirmacion: resultado,
        motivoConfirmacion: null,
        reprogramadaA: null,
        confirmadoEn: resultado === "por_confirmar" ? null : Timestamp.now(),
        confirmadoPorId: resultado === "por_confirmar" ? null : profile.uid,
        confirmadoPorNombre: resultado === "por_confirmar" ? null : profile.nombre,
        actualizadoEn: Timestamp.now(),
      });
      notify("success", resultado === "por_confirmar" ? "Confirmación revertida" : `Marcada como ${RESULTADO_CFG[resultado].label.toLowerCase()}`);
    } catch {
      notify("error", "No se pudo guardar");
    }
  };

  // Depósito: marca la de hoy y copia el cuadro a la nueva fecha como "por confirmar".
  const reprogramar = async (r: NotificacionPrealta, nuevaFecha: string, motivo: string) => {
    if (!r.id || !profile) return;
    try {
      await updateDoc(doc(db, "notificaciones_prealta", r.id), {
        confirmacion: "deposito",
        reprogramadaA: nuevaFecha,
        motivoConfirmacion: motivo.trim() || null,
        confirmadoEn: Timestamp.now(),
        confirmadoPorId: profile.uid,
        confirmadoPorNombre: profile.nombre,
        actualizadoEn: Timestamp.now(),
      });
      await addDoc(collection(db, "notificaciones_prealta"), {
        fecha: nuevaFecha,
        pacienteId: r.pacienteId,
        pacienteExpediente: r.pacienteExpediente,
        pacienteNombre: r.pacienteNombre,
        genero: r.genero,
        servicio: r.servicio,
        cama: r.cama ?? "",
        edad: r.edad ?? null,
        observacionesPaciente: r.observacionesPaciente ?? null,
        familiarNombre: r.familiarNombre ?? null,
        observacionesFamiliar: r.observacionesFamiliar ?? null,
        estado: r.estado,
        horaNotificacion: r.horaNotificacion ? Timestamp.fromDate(r.horaNotificacion) : Timestamp.now(),
        confirmacion: "por_confirmar",
        reprogramadaDe: r.id,
        creadoEn: Timestamp.now(),
        creadoPorId: profile.uid,
        creadoPorNombre: profile.nombre,
      });
      notify("success", `Reprogramada para ${nuevaFecha}`);
      setDeposito(null);
    } catch {
      notify("error", "No se pudo reprogramar");
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl flex items-center justify-center border border-emerald-200 dark:border-emerald-900">
          <CheckCheck size={17} className="text-emerald-700 dark:text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Confirmación de Alta</h1>
          <p className="text-xs text-slate-500 mt-0.5">Resultado del día: confirma qué prealtas se concretaron — control interno de Trabajo Social</p>
        </div>
      </div>

      {/* Barra: fecha + buscador + imprimir */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <CalendarDays size={15} />
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>
        {fecha !== hoyStr() && (
          <button onClick={() => setFecha(hoyStr())} className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-500">Hoy</button>
        )}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Filtrar por paciente, expediente, servicio, cama o familiar…"
            className={inputCls + " pl-9"} />
        </div>
        <button onClick={() => setImprimiendo(true)} disabled={registros.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors">
          <Printer size={15} /> Imprimir reporte
        </button>
      </div>

      {/* Contadores + filtro */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFiltro("por_confirmar")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${filtro === "por_confirmar" ? "bg-amber-600 text-white border-amber-600" : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
          Por confirmar ({conteos.por_confirmar})
        </button>
        <button onClick={() => setFiltro("todos")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${filtro === "todos" ? "bg-slate-700 text-white border-slate-700" : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
          Todos ({registros.length})
        </button>
        <div className="flex items-center gap-3 text-xs text-slate-500 ml-1">
          <span className="inline-flex items-center gap-1"><CheckCircle2 size={13} className="text-emerald-600" /> {conteos.confirmada}</span>
          <span className="inline-flex items-center gap-1"><Ban size={13} className="text-rose-600" /> {conteos.suspendida}</span>
          <span className="inline-flex items-center gap-1"><PackageOpen size={13} className="text-violet-600" /> {conteos.deposito}</span>
        </div>
      </div>

      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">{fmtFechaLarga(fecha)}</p>

      {/* Tabla */}
      {visibles.length === 0 ? (
        <p className="text-sm text-slate-400 py-12 text-center">
          {registros.length === 0
            ? "No hay prealtas programadas para esta fecha."
            : filtro === "por_confirmar"
              ? "No quedan prealtas por confirmar en esta fecha."
              : "Ningún registro coincide con el filtro."}
        </p>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  {["N°", "Ubicación", "Paciente", "Familiar", "Resultado", ...(puedeConfirmar ? ["Acción"] : [])].map((h, i) => (
                    <th key={i} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibles.map((r, i) => {
                  const conf = confDe(r);
                  const cfg = RESULTADO_CFG[conf];
                  const Icon = cfg.icon;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 align-top">
                      <td className="px-3 py-3 text-slate-500">{i + 1}</td>
                      <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-600 dark:text-slate-400 break-words" title={r.servicio}>{ubicacionLabel(r.servicio, r.cama)}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{r.pacienteNombre}</p>
                        <p className="text-xs text-slate-500">Exp. {r.pacienteExpediente} · {generoLetra(r.genero)}{r.edad != null ? ` · ${r.edad} años` : ""}</p>
                        {r.reprogramadaDe && <p className="text-[11px] text-violet-600 dark:text-violet-400 mt-0.5">Reprogramada de un depósito anterior</p>}
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{r.familiarNombre || "—"}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border whitespace-nowrap ${cfg.c}`}>
                          <Icon size={12} /> {cfg.label}
                        </span>
                        {conf === "deposito" && r.reprogramadaA && (
                          <p className="text-[11px] text-violet-600 dark:text-violet-400 mt-1">→ reprogramada para {r.reprogramadaA}</p>
                        )}
                        {r.motivoConfirmacion && <p className="text-[11px] text-slate-500 mt-0.5">{r.motivoConfirmacion}</p>}
                        {conf !== "por_confirmar" && r.confirmadoPorNombre && (
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">por {r.confirmadoPorNombre} · {fmtHora(r.confirmadoEn)}</p>
                        )}
                      </td>
                      {puedeConfirmar && (
                        <td className="px-3 py-3">
                          {conf === "por_confirmar" ? (
                            <div className="flex flex-wrap gap-1.5">
                              <button onClick={() => resolver(r, "confirmada")} title="Se fue de alta"
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md text-white bg-emerald-600 hover:bg-emerald-500 transition-colors">
                                <CheckCircle2 size={12} /> Confirmar
                              </button>
                              <button onClick={() => resolver(r, "suspendida")} title="Se descompensó / no apto"
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 transition-colors">
                                <Ban size={12} /> Suspender
                              </button>
                              <button onClick={() => setDeposito(r)} title="De alta pero sin quién lo retire"
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-900 hover:bg-violet-100 transition-colors">
                                <PackageOpen size={12} /> Depósito
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => resolver(r, "por_confirmar")} title="Revertir"
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                              <RotateCcw size={12} /> Revertir
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deposito && (
        <DepositoModal registro={deposito} fechaActual={fecha} onCancel={() => setDeposito(null)} onConfirm={reprogramar} />
      )}

      {imprimiendo && (
        <ReporteConfirmacionPrint fecha={fecha} registros={registros} onClose={() => setImprimiendo(false)} />
      )}

      <FeedbackStack items={feedbacks} onDismiss={dismiss} />
    </div>
  );
}

// ── Modal: depósito → reprogramar ───────────────────────────────────────────────
function DepositoModal({ registro, fechaActual, onCancel, onConfirm }: {
  registro: NotificacionPrealta;
  fechaActual: string;
  onCancel: () => void;
  onConfirm: (r: NotificacionPrealta, nuevaFecha: string, motivo: string) => Promise<void>;
}) {
  const [nuevaFecha, setNuevaFecha] = useState(addDays(fechaActual, 1));
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const confirmar = async () => {
    if (!nuevaFecha || nuevaFecha <= fechaActual) return;
    setGuardando(true);
    try { await onConfirm(registro, nuevaFecha, motivo); }
    finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-[210] bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <PackageOpen size={18} className="text-violet-600" /> Depósito — reprogramar
          </h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
            <p className="font-medium text-slate-800 dark:text-slate-200">{registro.pacienteNombre}</p>
            <p className="text-xs text-slate-500">Exp. {registro.pacienteExpediente} · {registro.servicio} · Cama {registro.cama || "—"}</p>
          </div>
          <p className="text-xs text-slate-500">
            El paciente está de alta pero no hay quién lo retire. Hoy queda marcada como <strong>Depósito</strong> y se copia su cuadro a la nueva fecha como <strong>por confirmar</strong>.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Nueva fecha de alta</label>
            <input type="date" min={addDays(fechaActual, 1)} value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Motivo (opcional)</label>
            <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. familiar vive lejos, no pudo venir hoy" className={inputCls} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onCancel} className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
            <button onClick={confirmar} disabled={guardando || !nuevaFecha || nuevaFecha <= fechaActual}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 transition-colors">
              {guardando ? "Reprogramando…" : "Reprogramar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reporte imprimible ──────────────────────────────────────────────────────────
function ReporteConfirmacionPrint({ fecha, registros, onClose }: {
  fecha: string; registros: NotificacionPrealta[]; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[220] bg-slate-200 overflow-y-auto print:bg-white print:static print:inset-auto print:overflow-visible">
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors">
            <ArrowLeft size={15} /> Volver
          </button>
          <p className="text-xs text-slate-500">Vista previa del reporte</p>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Printer size={14} /> Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      <div className="py-6 px-4 print:p-0">
        <div id="reporte-print" className="bg-white shadow-lg max-w-[27cm] mx-auto p-6 print:shadow-none print:max-w-none print:p-3" style={{ color: "#0f172a" }}>
          <div className="flex items-center justify-between gap-4 border-b-2 border-slate-300 pb-3 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo_hnes.png" alt="Hospital El Salvador" className="h-12 w-auto object-contain" />
            <div className="text-center">
              <h1 className="text-base font-bold uppercase tracking-wide">Confirmación de altas — Trabajo Social</h1>
              <p className="text-sm text-slate-600 capitalize">{fmtFechaLarga(fecha)}</p>
            </div>
            <div className="text-[10px] font-semibold uppercase text-slate-500 text-right w-16">Trabajo Social</div>
          </div>

          <table className="w-full border-collapse" style={{ fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#dcfce7" }}>
                {["N°", "Servicio", "Exp.", "Paciente", "Familiar", "Resultado", "Observación"].map((h, i) => (
                  <th key={i} className="border border-slate-400 px-1.5 py-1 text-left font-bold uppercase" style={{ fontSize: "9px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {registros.map((r, i) => {
                const conf = confDe(r);
                return (
                  <tr key={r.id} style={{ pageBreakInside: "avoid" }}>
                    <td className="border border-slate-400 px-1.5 py-1 text-center">{i + 1}</td>
                    <td className="border border-slate-400 px-1.5 py-1 whitespace-nowrap font-semibold">{ubicacionLabel(r.servicio, r.cama)}</td>
                    <td className="border border-slate-400 px-1.5 py-1 whitespace-nowrap">{r.pacienteExpediente}</td>
                    <td className="border border-slate-400 px-1.5 py-1 font-semibold">{r.pacienteNombre}</td>
                    <td className="border border-slate-400 px-1.5 py-1">{r.familiarNombre || "—"}</td>
                    <td className="border border-slate-400 px-1.5 py-1 whitespace-nowrap font-semibold">
                      {RESULTADO_CFG[conf].label}
                      {conf === "deposito" && r.reprogramadaA ? ` → ${r.reprogramadaA}` : ""}
                    </td>
                    <td className="border border-slate-400 px-1.5 py-1">{r.motivoConfirmacion || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-right text-slate-500 mt-2" style={{ fontSize: "9px" }}>Total: {registros.length} paciente(s)</p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          #reporte-print, #reporte-print * { visibility: visible !important; }
          #reporte-print { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; box-shadow: none !important; }
          html, body { background: #fff !important; }
          @page { size: landscape; margin: 8mm; }
        }
      `}</style>
    </div>
  );
}

// ── Feedback (toasts) ─────────────────────────────────────────────────────────
function FeedbackStack({ items, onDismiss }: { items: Feedback[]; onDismiss: (id: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[230] flex flex-col gap-2 items-center pointer-events-none">
      {items.map(f => <FeedbackToast key={f.id} f={f} onDismiss={() => onDismiss(f.id)} />)}
    </div>
  );
}
function FeedbackToast({ f, onDismiss }: { f: Feedback; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  const ok = f.tipo === "success";
  return (
    <div className={`pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-xl text-sm font-medium bg-white dark:bg-slate-800 border-l-4 ${ok ? "border-l-emerald-500" : "border-l-rose-500"} border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100`}>
      {ok ? <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" /> : <AlertTriangle size={16} className="text-rose-500 flex-shrink-0" />}
      <span>{f.mensaje}</span>
      <button onClick={onDismiss} className="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={13} /></button>
    </div>
  );
}
