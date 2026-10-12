"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  ArrowDown, ArrowRight, ArrowRightLeft, BedDouble, Building2, CalendarClock,
  ClipboardList, FileText, MessageSquare, RefreshCw, Stethoscope, Undo2,
  UserCheck, UserRound, X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { SolicitudTraslado } from "@/types";

type Props = {
  solicitud: SolicitudTraslado;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
};

export function DetalleSolicitudTraslado({ solicitud: t, busy, onClose, children, footer }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const intercambio = t.tipoTraslado === "intercambio";
  const interno = t.tipoTraslado === "interno";
  const destino = interno ? t.servicioOrigen : (t.servicioDestino || t.servicioOrigen);
  const TipoIcon = intercambio ? RefreshCw : interno ? ArrowRightLeft : Building2;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm open:flex dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6 dark:border-slate-800">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300">
            <TipoIcon size={21} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">ESDOMED · Detalle de solicitud</p>
            <h2 id={titleId} className="font-heading text-lg font-semibold tracking-tight sm:text-xl">
              {intercambio ? "Intercambio de pacientes" : "Solicitud de traslado"}
            </h2>
            <p id={descriptionId} className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {intercambio ? "Dos pacientes intercambian su servicio y cama." : interno ? "Cambio de cama dentro del mismo servicio." : "Movimiento de paciente entre servicios."}
            </p>
          </div>
        </div>
        <button type="button" autoFocus onClick={onClose} disabled={busy} aria-label="Cerrar detalle de solicitud"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800">
          <X size={19} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <CalendarClock size={15} aria-hidden="true" />
            <span>Solicitado el {formatFechaHora(t.creadoEn)}</span>
          </div>
          <Badge estado={t.estado} />
        </div>

        <section aria-label={intercambio ? "Pacientes y recorridos del intercambio" : "Paciente y recorrido del traslado"} className="space-y-3">
          <RecorridoPaciente nombre={t.pacienteNombre} expediente={t.pacienteExpediente} label={intercambio ? "Paciente A" : "Paciente"}
            origen={t.servicioOrigen} camaOrigen={t.camaOrigen} destino={destino} camaDestino={t.camaDestino} />
          {intercambio && (
            <RecorridoPaciente nombre={t.pacienteBNombre} expediente={t.pacienteBExpediente} label="Paciente B"
              origen={destino} camaOrigen={t.camaDestino} destino={t.servicioOrigen} camaDestino={t.camaOrigen} />
          )}
        </section>

        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <TituloSeccion icon={ClipboardList}>Motivo del traslado</TituloSeccion>
          <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{t.motivoTraslado || "Sin motivo registrado."}</p>
        </section>

        <section aria-label="Datos de la solicitud" className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><Stethoscope size={17} aria-hidden="true" /></div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">Médico solicitante</p>
              <p className="mt-1 break-words text-sm font-medium">Dr. {t.medicoNombre}</p>
              {t.medicoJvpm && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">JVPM {t.medicoJvpm}</p>}
            </div>
          </div>
          {t.revisadoPorNombre && (
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><UserCheck size={17} aria-hidden="true" /></div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">Procesado por</p>
                <p className="mt-1 break-words text-sm font-medium">{t.revisadoPorNombre}</p>
              </div>
            </div>
          )}
        </section>

        {t.respuestaMedico && (
          <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/40">
            <TituloSeccion icon={MessageSquare} className="text-blue-800 dark:text-blue-300">Respuesta del médico</TituloSeccion>
            <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{t.respuestaMedico}</p>
          </section>
        )}

        {t.reversion && (
          <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
            <TituloSeccion icon={Undo2} className="text-amber-800 dark:text-amber-300">Aprobación revertida</TituloSeccion>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t.reversion.porNombre} · {formatFechaHora(t.reversion.en)}
              {t.reversion.aprobadoPorNombre && <> · Había aprobado: {t.reversion.aprobadoPorNombre}</>}
            </p>
            <p className="break-words whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{t.reversion.motivo}</p>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t.reversion.pacientesRestaurados.length === 0 ? "Sin cambios en el censo."
                : t.reversion.pacientesRestaurados.every(p => p.ubicacionRestaurada) ? "Paciente devuelto a la cama de origen."
                : "Movimiento eliminado; el paciente ya se había movido después, se conservó su ubicación."}
              {t.reversion.fichasReabiertas.length > 0 && " Ficha UCI/UCIN reabierta."}
            </p>
          </section>
        )}

        <div className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-800">{children}</div>
      </div>

      <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6 dark:border-slate-800 dark:bg-slate-800/40">{footer}</footer>
    </dialog>
  );
}

function TituloSeccion({ icon: Icon, children, className = "text-slate-700 dark:text-slate-300" }: {
  icon: typeof FileText; children: ReactNode; className?: string;
}) {
  return <h3 className={`flex items-center gap-2 text-xs font-semibold ${className}`}><Icon size={16} aria-hidden="true" />{children}</h3>;
}

function RecorridoPaciente({ nombre, expediente, label, origen, camaOrigen, destino, camaDestino }: {
  nombre?: string; expediente?: string; label: string; origen: string; camaOrigen: string; destino: string; camaDestino: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"><UserRound size={18} aria-hidden="true" /></div>
          <div className="min-w-0"><p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p><p className="break-words text-sm font-semibold">{nombre || "Nombre no especificado"}</p></div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><FileText size={13} aria-hidden="true" />Exp. <span className="font-semibold tabular-nums">{expediente || "No especificado"}</span></span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <Ubicacion label="Origen" servicio={origen} cama={camaOrigen} />
        <div className="flex justify-center text-slate-400"><ArrowDown className="sm:hidden" size={18} aria-hidden="true" /><ArrowRight className="hidden sm:block" size={20} aria-hidden="true" /></div>
        <Ubicacion label="Destino" servicio={destino} cama={camaDestino} destino />
      </div>
    </div>
  );
}

function Ubicacion({ label, servicio, cama, destino = false }: { label: string; servicio: string; cama: string; destino?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg border p-3 ${destino ? "border-blue-200 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/40" : "border-slate-200 dark:border-slate-800"}`}>
      <p className={`mb-2 text-[10px] font-semibold uppercase tracking-wider ${destino ? "text-blue-700 dark:text-blue-300" : "text-slate-500 dark:text-slate-400"}`}>{label}</p>
      <p className="flex items-start gap-2 text-sm font-medium"><Building2 size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" /><span className="break-words">{servicio || "Servicio no especificado"}</span></p>
      <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><BedDouble size={15} className="shrink-0" aria-hidden="true" /><span>Cama <strong className="font-semibold text-slate-700 dark:text-slate-200">{cama || "No especificada"}</strong></span></p>
    </div>
  );
}

function formatFechaHora(ts: unknown) {
  if (!ts) return "—";
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return d.toLocaleString("es-HN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}
