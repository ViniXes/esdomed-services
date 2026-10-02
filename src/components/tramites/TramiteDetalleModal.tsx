"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, FileImage, FileText, MessageSquareText,
  CalendarRange, Clock, Paperclip, Pencil, RefreshCw, Route, X, XCircle,
} from "lucide-react";
import type { EstadoTramitePersonal, TramitePersonal } from "@/types";
import { toDate } from "@/lib/pacientes/helpers";
import { esPermisoDeUnTurno } from "@/lib/esdomed/permisos-plan";
import {
  ESTADO_TRAMITE_LABEL, ESTADO_TRAMITE_PILL, docsDeTramite, fechaLegible, partesCategoria,
  type ConflictoPermisoGrupo,
} from "@/lib/tramitesPersonal";

// Ficha de un trámite de personal: resumen, recorrido (quién y cuándo),
// adjuntos y la respuesta de administración. Si el trámite está pendiente,
// trae el formulario de resolución.

export interface ResolucionTramite {
  accion: "aprobado" | "rechazado";
  onAccion: (accion: "aprobado" | "rechazado") => void;
  comentario: string;
  onComentario: (comentario: string) => void;
  advertencias: ConflictoPermisoGrupo[];
  conflictos: ConflictoPermisoGrupo[];
  revisando: boolean;
  saving: boolean;
  onSubmit: (e: FormEvent) => void;
}

/** Solo el admin: corrige las horas de un permiso por solicitud verbal del colaborador. */
export interface AjusteHorasProps {
  guardando: boolean;
  error: string | null;
  /** Devuelve true si se guardó (el formulario se cierra). */
  onGuardar: (horas: number, justificacion: string) => Promise<boolean>;
}

const MIN_JUSTIFICACION = 10;

function AjusteHoras({ t, ajuste }: { t: TramitePersonal; ajuste: AjusteHorasProps }) {
  const [abierto, setAbierto] = useState(false);
  const [horas, setHoras] = useState(String(t.horas ?? ""));
  const [justificacion, setJustificacion] = useState("");
  const horasNum = Number(horas);
  const justificacionLimpia = justificacion.trim();
  const valido = horasNum > 0 && horasNum <= 24 && horasNum !== t.horas && justificacionLimpia.length >= MIN_JUSTIFICACION;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!valido || ajuste.guardando) return;
    if (await ajuste.onGuardar(horasNum, justificacionLimpia)) {
      setAbierto(false);
      setJustificacion("");
    }
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => { setHoras(String(t.horas ?? "")); setAbierto(true); }}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <Pencil size={13} /> Ajustar horas
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
        Úsalo cuando el colaborador pide por vía verbal añadir o quitar tiempo a un permiso ya presentado.
        {t.estado === "aprobado" && " El plan de trabajo se actualiza con las nuevas horas."}
      </p>
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <div>
          <label htmlFor="ajuste-horas" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Horas del permiso</label>
          <input
            id="ajuste-horas"
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0.5"
            max="24"
            value={horas}
            onChange={(e) => setHoras(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <p className="mt-1 text-[11px] text-slate-400 tabular-nums">Actual: {t.horas ?? "—"} h</p>
        </div>
        <div>
          <label htmlFor="ajuste-justificacion" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Justificación del cambio <span className="font-normal text-rose-500">(obligatoria)</span>
          </label>
          <textarea
            id="ajuste-justificacion"
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            rows={3}
            placeholder="Ej: El colaborador solicitó verbalmente una hora más por cita médica."
            className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
      </div>
      {ajuste.error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{ajuste.error}</p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setAbierto(false)}
          disabled={ajuste.guardando}
          className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!valido || ajuste.guardando}
          className="inline-flex min-w-[8rem] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ajuste.guardando
            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            : "Guardar ajuste"}
        </button>
      </div>
    </form>
  );
}

const fechaHora = (d: Date) =>
  d.toLocaleString("es-SV", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function Seccion({ titulo, icon: Icon, children }: { titulo: string; icon: typeof FileText; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-blue-900 dark:text-cyan-300/90">
        <Icon size={13} strokeWidth={2.25} className="text-cyan-700 dark:text-cyan-300" />
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/** Día grande + mes/año, día de la semana y hora: se lee como la hoja de un calendario. */
function HojaFecha({ etiqueta, fecha }: { etiqueta: string; fecha: Date }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="font-heading text-4xl font-bold leading-none tabular-nums text-blue-900 dark:text-white">
        {fecha.getDate()}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{etiqueta}</p>
        <p className="text-sm font-semibold capitalize text-slate-800 dark:text-slate-100">
          {fecha.toLocaleDateString("es-SV", { month: "short", year: "numeric" })}
        </p>
        <p className="text-xs capitalize text-slate-500 dark:text-slate-400 tabular-nums">
          {fecha.toLocaleDateString("es-SV", { weekday: "long" })} · {fecha.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: false })}
        </p>
      </div>
    </div>
  );
}

type Paso = { titulo: string; detalle?: string; por?: string; tono: "azul" | "ambar" | "verde" | "rose"; hecho: boolean };

const PUNTO: Record<Paso["tono"], string> = {
  azul: "bg-blue-600 ring-blue-100 dark:bg-cyan-400 dark:ring-cyan-950",
  ambar: "bg-white ring-amber-300 dark:bg-slate-900 dark:ring-amber-700",
  verde: "bg-emerald-500 ring-emerald-100 dark:ring-emerald-950",
  rose: "bg-rose-500 ring-rose-100 dark:ring-rose-950",
};

/** Recorrido del trámite: presentado → (rechazo previo y reenvío) → revisión o resolución. */
function pasosDe(t: TramitePersonal): Paso[] {
  const creado = toDate(t.creadoEn);
  const revisado = toDate(t.revisadoEn);
  const actualizado = toDate(t.actualizadoEn);
  const pasos: Paso[] = [
    { titulo: t.estado === "subido" ? "Subido" : "Presentado", detalle: creado ? fechaHora(creado) : undefined, por: t.empleadoNombre, tono: "azul", hecho: true },
  ];
  if (t.estado === "aprobado" || t.estado === "rechazado") {
    pasos.push({
      titulo: t.estado === "aprobado" ? "Aprobado" : "Rechazado",
      detalle: revisado ? fechaHora(revisado) : undefined,
      por: t.revisadoPorNombre,
      tono: t.estado === "aprobado" ? "verde" : "rose",
      hecho: true,
    });
  } else if (t.estado === "pendiente") {
    // Un pendiente con revisión es uno que se rechazó y el empleado reenvió
    // (un aprobado no vuelve a revisión).
    if (revisado) {
      pasos.push({ titulo: "Rechazado", detalle: fechaHora(revisado), por: t.revisadoPorNombre, tono: "rose", hecho: true });
      if (actualizado && actualizado > revisado) pasos.push({ titulo: "Reenviado", detalle: fechaHora(actualizado), por: t.empleadoNombre, tono: "azul", hecho: true });
    }
    pasos.push({ titulo: "En revisión", tono: "ambar", hecho: false });
  }
  return pasos;
}

function Recorrido({ pasos }: { pasos: Paso[] }) {
  return (
    <ol className="relative space-y-4">
      {pasos.map((p, i) => (
        <li key={`${p.titulo}-${i}`} className="relative flex gap-3">
          {i < pasos.length - 1 && (
            <span aria-hidden className="absolute left-[5px] top-4 h-[calc(100%+0.25rem)] w-px bg-slate-200 dark:bg-slate-700" />
          )}
          <span aria-hidden className={`relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ${PUNTO[p.tono]} ${p.hecho ? "" : "border-2 border-amber-400"}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{p.titulo}</p>
            {(p.detalle || p.por) && (
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {[p.detalle, p.por].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

const RESPUESTA_TONO: Record<"aprobado" | "rechazado", { caja: string; icono: string; titulo: string }> = {
  aprobado: {
    caja: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/30",
    icono: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    titulo: "text-emerald-900 dark:text-emerald-200",
  },
  rechazado: {
    caja: "border-rose-200 bg-rose-50/70 dark:border-rose-900/70 dark:bg-rose-950/30",
    icono: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
    titulo: "text-rose-900 dark:text-rose-200",
  },
};

function RespuestaAdministracion({ t, anterior }: { t: TramitePersonal; anterior: boolean }) {
  // La resolución vigente; o, en un pendiente reenviado, la del rechazo previo.
  const resultado: "aprobado" | "rechazado" = anterior ? "rechazado" : (t.estado as "aprobado" | "rechazado");
  const tono = RESPUESTA_TONO[resultado];
  const revisado = toDate(t.revisadoEn);
  const Icono = resultado === "aprobado" ? CheckCircle2 : XCircle;
  return (
    <div className={`rounded-2xl border p-4 ${tono.caja}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tono.icono}`}>
          <Icono size={18} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${tono.titulo}`}>
            {anterior ? "Rechazado anteriormente" : resultado === "aprobado" ? "Aprobado" : "Rechazado"}
            {t.revisadoPorNombre && <span className="font-normal"> por {t.revisadoPorNombre}</span>}
          </p>
          {revisado && <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{fechaHora(revisado)}</p>}
          {t.comentariosRevision ? (
            <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-slate-800 dark:text-slate-100">{t.comentariosRevision}</p>
          ) : (
            <p className="mt-2 text-sm italic text-slate-500 dark:text-slate-400">Sin comentario.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AvisoPermisos({ tono, titulo, texto, items }: { tono: "ambar" | "rose"; titulo: string; texto: string; items: ConflictoPermisoGrupo[] }) {
  const cls = tono === "ambar"
    ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100"
    : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100";
  return (
    <div className={`rounded-xl border p-4 text-sm ${cls}`}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={17} className={`mt-0.5 shrink-0 ${tono === "ambar" ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`} />
        <div>
          <p className="font-semibold">{titulo}</p>
          <p className="mt-1 text-xs leading-5 opacity-90">{texto}</p>
          <ul className="mt-2 space-y-1 text-xs font-medium">
            {items.map((c) => (
              <li key={`${c.fecha}-${c.grupo}-${c.empleadoNombre}`}>{fechaLegible(c.fecha)} · {c.grupo} · {c.empleadoNombre}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const esImagen = (nombre: string) => /\.(png|jpe?g|webp|gif|heic)$/i.test(nombre);

export function TramiteDetalleModal({
  tramite: t, onClose, resolucion, ajusteHoras,
}: {
  tramite: TramitePersonal;
  onClose: () => void;
  /** Solo para trámites pendientes: formulario para aprobar o rechazar. */
  resolucion?: ResolucionTramite;
  /** Solo admin, permiso de un día pendiente o aprobado: permite ajustar las horas. */
  ajusteHoras?: AjusteHorasProps;
}) {
  const tituloId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const saving = (resolucion?.saving ?? false) || (ajusteHoras?.guardando ?? false);
  const { codigo, nombre } = partesCategoria(t.categoria);
  const creado = toDate(t.creadoEn);
  const inicio = toDate(t.fechaInicio);
  const fin = toDate(t.fechaFin) ?? inicio;
  const docs = docsDeTramite(t);
  const resuelto = t.estado === "aprobado" || t.estado === "rechazado";
  const rechazoPrevio = t.estado === "pendiente" && !!t.revisadoEn;
  // Un turno que amanece cruza la medianoche pero sigue siendo un solo día de permiso.
  const dias = inicio && fin
    ? esPermisoDeUnTurno(t) ? 1 : Math.round((new Date(fin.getFullYear(), fin.getMonth(), fin.getDate()).getTime() - new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()).getTime()) / 86400000) + 1
    : 0;

  // Escape cierra (salvo mientras guarda); el foco entra al diálogo al abrir y
  // vuelve al elemento que lo abrió al cerrar. Montaje único: onClose/saving
  // se leen de refs para no re-enfocar en cada render.
  const cerrarRef = useRef(onClose);
  const savingRef = useRef(saving);
  useEffect(() => {
    cerrarRef.current = onClose;
    savingRef.current = saving;
  });
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !savingRef.current) cerrarRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previo?.focus?.();
    };
  }, []);

  const estado: EstadoTramitePersonal = t.estado;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-[2px] sm:items-center sm:p-4 animate-[dialogo-fondo-in_160ms_ease-out] motion-reduce:animate-none"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 outline-none sm:rounded-3xl dark:border-slate-800 dark:bg-slate-900 animate-[dialogo-panel-in_220ms_cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none"
      >
        {/* Encabezado: código del trámite como sello, nombre, quién y cuándo. */}
        <header className="flex items-start gap-4 border-b border-slate-100 px-5 py-5 sm:px-6 dark:border-slate-800">
          <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-blue-50 text-blue-900 ring-1 ring-blue-100 dark:bg-blue-950 dark:text-cyan-100 dark:ring-blue-900">
            <span className="font-heading text-lg font-bold leading-none">{codigo}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${ESTADO_TRAMITE_PILL[estado]}`}>
                {ESTADO_TRAMITE_LABEL[estado]}
              </span>
              {t.tipoSolicitud && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${
                  t.tipoSolicitud === "diferido"
                    ? "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900"
                    : "bg-blue-50 text-blue-800 ring-blue-100 dark:bg-blue-950 dark:text-cyan-200 dark:ring-blue-900"
                }`}>
                  {t.tipoSolicitud === "diferido" ? "Diferida" : "Ordinaria"}
                </span>
              )}
            </div>
            <h2 id={tituloId} className="mt-1.5 font-heading text-lg font-bold leading-snug text-slate-900 sm:text-xl dark:text-white">
              {nombre}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{t.empleadoNombre}</span>
              {creado && <span className="tabular-nums"> · {fechaHora(creado)}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="grid gap-6 px-5 py-5 sm:px-6 md:grid-cols-[1fr_13rem]">
            <div className="min-w-0 space-y-6">
              {inicio && fin && (
                <Seccion titulo="Periodo" icon={CalendarRange}>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <HojaFecha etiqueta="Desde" fecha={inicio} />
                      <ArrowRight size={18} className="text-slate-300 dark:text-slate-600" aria-hidden />
                      <HojaFecha etiqueta="Hasta" fecha={fin} />
                    </div>
                    {(t.horas || dias > 1) && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
                        {t.horas ? (
                          <span className="rounded-lg bg-white px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200 tabular-nums dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                            {t.horas} h
                          </span>
                        ) : null}
                        {dias > 1 && (
                          <span className="rounded-lg bg-white px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200 tabular-nums dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                            {dias} días
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {ajusteHoras && <AjusteHoras key={t.horas} t={t} ajuste={ajusteHoras} />}
                  {!!t.ajustesHoras?.length && (
                    <ul className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                      {t.ajustesHoras.map((a, i) => {
                        const en = toDate(a.en);
                        return (
                          <li key={i} className="text-xs leading-5 text-amber-900 dark:text-amber-100">
                            <p className="flex items-center gap-1.5 font-semibold">
                              <Clock size={12} className="shrink-0" />
                              <span className="tabular-nums">{a.horasAnteriores} h → {a.horasNuevas} h</span>
                              <span className="font-normal opacity-80">· {a.porNombre}{en ? ` · ${fechaHora(en)}` : ""}</span>
                            </p>
                            <p className="mt-0.5 whitespace-pre-line pl-[18px]">{a.justificacion}</p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Seccion>
              )}

              {t.notas && (
                <Seccion titulo="Notas del empleado" icon={MessageSquareText}>
                  <p className="whitespace-pre-line rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                    {t.notas}
                  </p>
                </Seccion>
              )}

              <Seccion titulo={`Adjuntos${docs.length ? ` (${docs.length})` : ""}`} icon={Paperclip}>
                {docs.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Sin adjuntos.</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {docs.map((d, i) => {
                      const Icono = esImagen(d.nombre) ? FileImage : FileText;
                      return (
                        <li key={`${d.url}-${i}`}>
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-cyan-600/40 hover:bg-blue-50/60 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-cyan-500/40 dark:hover:bg-slate-800"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-cyan-300">
                              <Icono size={16} />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200" title={d.nombre}>{d.nombre}</span>
                            <ExternalLink size={14} className="shrink-0 text-slate-300 transition-colors group-hover:text-cyan-600 dark:text-slate-600 dark:group-hover:text-cyan-300" aria-hidden />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Seccion>

              {(resuelto || rechazoPrevio) && (
                <Seccion titulo={rechazoPrevio ? "Respuesta anterior" : "Respuesta de administración"} icon={MessageSquareText}>
                  <RespuestaAdministracion t={t} anterior={rechazoPrevio} />
                </Seccion>
              )}
            </div>

            <aside className="md:border-l md:border-slate-100 md:pl-6 md:dark:border-slate-800">
              <Seccion titulo="Recorrido" icon={Route}>
                <Recorrido pasos={pasosDe(t)} />
              </Seccion>
            </aside>
          </div>

          {resolucion && (
            <form id="form-resolucion-tramite" onSubmit={resolucion.onSubmit} className="space-y-4 border-t border-slate-100 bg-slate-50/60 px-5 py-5 sm:px-6 dark:border-slate-800 dark:bg-slate-950/30">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-blue-900 dark:text-cyan-300/90">Resolución</h3>

              {resolucion.revisando && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
                  <RefreshCw size={15} className="animate-spin" /> Revisando otras solicitudes pendientes del mismo grupo…
                </div>
              )}
              {resolucion.advertencias.length > 0 && (
                <AvisoPermisos
                  tono="ambar"
                  titulo="Hay otra solicitud pendiente para el mismo grupo y fecha"
                  texto="Puedes decidir cuál priorizar; al aprobar una, la otra ya no podrá aprobarse para esa fecha."
                  items={resolucion.advertencias}
                />
              )}

              <div role="radiogroup" aria-label="Resolución" className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/70">
                {([
                  { valor: "aprobado", label: "Aprobar", Icono: CheckCircle2, activo: "bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200 dark:bg-slate-900 dark:text-emerald-300 dark:ring-emerald-900" },
                  { valor: "rechazado", label: "Rechazar", Icono: XCircle, activo: "bg-white text-rose-700 shadow-sm ring-1 ring-rose-200 dark:bg-slate-900 dark:text-rose-300 dark:ring-rose-900" },
                ] as const).map(({ valor, label, Icono, activo }) => (
                  <button
                    key={valor}
                    type="button"
                    role="radio"
                    aria-checked={resolucion.accion === valor}
                    onClick={() => resolucion.onAccion(valor)}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                      resolucion.accion === valor ? activo : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                    }`}
                  >
                    <Icono size={17} /> {label}
                  </button>
                ))}
              </div>

              {resolucion.conflictos.length > 0 && (
                <AvisoPermisos
                  tono="rose"
                  titulo="No se puede aprobar este permiso personal"
                  texto="Ya hay un permiso personal aprobado para el mismo grupo operativo en esa fecha. La regla no aplica al personal administrativo."
                  items={resolucion.conflictos}
                />
              )}

              <div>
                <label htmlFor="respuesta-tramite" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Respuesta al empleado <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <textarea
                  id="respuesta-tramite"
                  value={resolucion.comentario}
                  onChange={(e) => resolucion.onComentario(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </form>
          )}
        </div>

        {resolucion && (
          <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-resolucion-tramite"
              disabled={saving}
              className={`inline-flex min-w-[10rem] items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                resolucion.accion === "aprobado" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500"
              }`}
            >
              {saving
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : resolucion.accion === "aprobado" ? "Aprobar trámite" : "Rechazar trámite"}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
