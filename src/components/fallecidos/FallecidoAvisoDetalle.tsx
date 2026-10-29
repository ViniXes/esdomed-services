"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { ArrowRight, BedDouble, CalendarClock, CheckCircle2, Clock, Eye, FileText, Inbox, Loader2, ShieldCheck, X } from "lucide-react";
import type { NotificacionFallecido } from "@/types";
import { certificadoEnResguardo, type LecturaConfirmada } from "@/lib/fallecidos";
import ui from "./FallecidosUi.module.css";
import review from "./RevisionFallecidos.module.css";

interface Props {
  notificacion: NotificacionFallecido;
  lectura: LecturaConfirmada | null;
  area: string;
  recepcionesHref: string;
  saving: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function fecha(ts: unknown) {
  const d = (ts as { toDate?: () => Date } | null)?.toDate?.() ?? (ts ? new Date(ts as string) : null);
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString("es-SV", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : "—";
}

function Dato({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

// Solo presenta el aviso. La confirmación conserva el guardado de la vista del área.
export function FallecidoAvisoDetalle({ notificacion: n, lectura, area, recepcionesHref, saving, onConfirm, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const enResguardo = certificadoEnResguardo(n);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  return (
    <dialog ref={dialogRef} className={`${ui.detail} ${review.avisoDetail}`} aria-labelledby={titleId} aria-busy={saving}
      onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
      <header className={`${ui.detailHeader} ${review.avisoHeader}`}>
        <div className={ui.detailHeading}>
          <div className="min-w-0">
            <div className={ui.eyebrow}>{area}<span aria-hidden="true">/</span>Aviso de defunción</div>
            <h2 id={titleId}>{n.pacienteNombre || "Paciente sin nombre registrado"}</h2>
          </div>
          <button type="button" className={ui.iconButton} onClick={onClose} disabled={saving} aria-label="Cerrar aviso">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className={ui.identity}>
          <span className={ui.expediente}><FileText size={14} aria-hidden="true" />Exp. <strong>{n.pacienteExpediente}</strong></span>
          <span><BedDouble size={15} aria-hidden="true" />{n.servicio} · Cama {n.cama}</span>
        </div>
      </header>
      <div className={ui.detailScroll}>
        <div className={review.avisoGrid}>
          <div className={ui.detailMain}>
            <section className={ui.section}>
              <h3 className={ui.sectionTitle}><CalendarClock size={17} aria-hidden="true" />Datos de la defunción</h3>
              <dl className={review.dataGrid}>
                <Dato label="Fecha y hora de defunción" value={fecha(n.fechaDefuncion)} />
                <Dato label="Médico que notifica" value={`Dr. ${n.medicoNombre}`} />
                <Dato label="Fecha del reporte" value={fecha(n.creadoEn)} />
                <Dato label="Servicio / Cama" value={`${n.servicio} · ${n.cama}`} />
                {n.causaMuerte && <div className={review.fullWidth}><dt>Causa de muerte</dt><dd>{n.causaMuerte}</dd></div>}
              </dl>
            </section>
            <section className={ui.section}>
              <h3 className={ui.sectionTitle}><ShieldCheck size={17} aria-hidden="true" />Revisión de ESDOMED</h3>
              <div className={review.recordState} data-tone={n.estado === "confirmado" ? "success" : "pending"}>
                {n.estado === "confirmado" ? <CheckCircle2 size={18} aria-hidden="true" /> : <Clock size={18} aria-hidden="true" />}
                <div>
                  <p>{n.estado === "confirmado" ? "Confirmado por ESDOMED" : "Pendiente de confirmación en ESDOMED"}</p>
                  {n.estado === "confirmado" && n.confirmadoPorNombre && <span>{n.confirmadoPorNombre}{n.confirmadoEn && <> · {fecha(n.confirmadoEn)}</>}</span>}
                </div>
              </div>
              {n.estado === "confirmado" && (
                <dl className={`${review.dataGrid} mt-4`}><Dato label="DUI validado por ESDOMED" value={n.duiValidado ? "Sí" : "No"} /></dl>
              )}
            </section>
            <section className={ui.section}>
              <h3 className={ui.sectionTitle}><Inbox size={17} aria-hidden="true" />Recepción del certificado</h3>
              {enResguardo ? (
                <p className={review.neutralState}>{n.privadoDeLibertad ? "Certificado en custodia interna de ESDOMED" : "Certificado resguardado en archivo interno de ESDOMED"}</p>
              ) : n.recibeDePs ? (
                <>
                  <dl className={review.dataGrid}>
                    <Dato label="Asignado a" value={n.recibeDePs} />
                    {n.recibeDePsEntregadoPor && <Dato label="Entregado por ESDOMED" value={n.recibeDePsEntregadoPor} />}
                    {n.recibeDePsEn && <Dato label="Fecha de entrega al área" value={fecha(n.recibeDePsEn)} />}
                  </dl>
                  <div className={`${review.recordState} mt-4`} data-tone={n.recibeDePsConfirmado ? "success" : "pending"}>
                    {n.recibeDePsConfirmado ? <CheckCircle2 size={17} aria-hidden="true" /> : <Clock size={17} aria-hidden="true" />}
                    <div><p>{n.recibeDePsConfirmado ? "Recepción del certificado confirmada" : "Recepción del certificado por confirmar"}</p>
                      {n.recibeDePsConfirmado && n.recibeDePsConfirmadoEn && <span>{fecha(n.recibeDePsConfirmadoEn)}</span>}
                    </div>
                  </div>
                </>
              ) : <p className={review.neutralState}>Sin asignación de certificado registrada</p>}
              <Link href={recepcionesHref} prefetch={false} className={review.textLink}>Ir a mis recepciones<ArrowRight size={14} aria-hidden="true" /></Link>
            </section>
          </div>
          <aside className={ui.overview} aria-label="Lectura del aviso">
            <h3>Lectura del aviso</h3>
            <div className={review.readingState} data-complete={!!lectura}>
              {lectura ? <CheckCircle2 size={22} aria-hidden="true" /> : <Eye size={22} aria-hidden="true" />}
              <p>{lectura ? "Lectura confirmada" : "Por confirmar lectura"}</p>
            </div>
            {lectura ? (
              <dl className={`${review.dataList} mt-5`}>
                <Dato label="Confirmó" value={lectura.por} />
                {lectura.rol && <Dato label="Área" value={lectura.rol === "trabajo_social" ? "Trabajo Social" : lectura.rol === "psicologia" ? "Psicología" : lectura.rol} />}
                {lectura.en && <Dato label="Fecha y hora" value={fecha(lectura.en)} />}
              </dl>
            ) : <p className={review.readingArea}>{area}</p>}
          </aside>
        </div>
      </div>
      <footer className={ui.detailFooter}>
        <div className={ui.footerActions}>
          <span className={ui.footerState} aria-live="polite">
            {lectura ? <><CheckCircle2 size={15} aria-hidden="true" />Lectura registrada</> : <><Eye size={15} aria-hidden="true" />Lectura pendiente</>}
          </span>
          {!lectura ? (
            <button type="button" className={ui.primaryButton} onClick={onConfirm} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
              {saving ? "Confirmando..." : `Confirmar lectura · ${area}`}
            </button>
          ) : <button type="button" onClick={onClose} className={ui.secondaryButton}>Cerrar aviso</button>}
        </div>
      </footer>
    </dialog>
  );
}
