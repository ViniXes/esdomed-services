"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { BedDouble, CalendarClock, ClipboardList, FileText, Lock, LockOpen, MessageSquareText, X } from "lucide-react";
import type { NotificacionFallecido } from "@/types";
import { Badge } from "@/components/ui/Badge";
import ui from "./FallecidosUi.module.css";

export type VistaDetalleFallecido = "gestion" | "bitacora";

interface Props {
  notificacion: NotificacionFallecido;
  fechaDefuncion: string;
  locked: boolean;
  unlocked: boolean;
  busy: boolean;
  vista: VistaDetalleFallecido;
  onVistaChange: (vista: VistaDetalleFallecido) => void;
  onClose: () => void;
  children: ReactNode;
  resumen: ReactNode;
  bitacora: ReactNode;
  footer: ReactNode;
}

// Contenedor de presentación: las lecturas, escrituras y reglas siguen en la página.
export function FallecidoDetalleModal({
  notificacion: n, fechaDefuncion, locked, unlocked, busy, vista, onVistaChange,
  onClose, children, resumen, bitacora, footer,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      className={ui.detail}
    >
      <header className={ui.detailHeader}>
        <div className={ui.detailHeading}>
          <div className="min-w-0">
            <div className={ui.eyebrow}>ESDOMED <span aria-hidden="true">/</span> Seguimiento de defunción</div>
            <h2 id={titleId}>{n.pacienteNombre || "Paciente sin nombre registrado"}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar detalle" className={ui.iconButton}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className={ui.identity}>
          <span className={ui.expediente}><FileText size={14} aria-hidden="true" /> Exp. <strong>{n.pacienteExpediente}</strong></span>
          <span><BedDouble size={15} aria-hidden="true" /> {n.servicio} · Cama {n.cama}</span>
          <span><CalendarClock size={15} aria-hidden="true" /> {fechaDefuncion}</span>
          <div className={ui.identityStatus}>
            <Badge estado={n.estado} />
            {locked && <span className={ui.lockStatus}><Lock size={12} aria-hidden="true" /> Cerrado</span>}
            {unlocked && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"><LockOpen size={12} aria-hidden="true" /> Desbloqueado</span>}
          </div>
        </div>
        <nav className={ui.detailTabs} aria-label="Vistas del expediente">
          <button type="button" aria-pressed={vista === "gestion"} onClick={() => onVistaChange("gestion")}>
            <ClipboardList size={16} aria-hidden="true" /> Gestión del caso
          </button>
          <button type="button" aria-pressed={vista === "bitacora"} onClick={() => onVistaChange("bitacora")}>
            <MessageSquareText size={16} aria-hidden="true" /> Bitácora
          </button>
        </nav>
      </header>
      <div className={ui.detailScroll}>
        <div className={ui.detailGrid}>
          <div className={ui.detailMain}>{vista === "gestion" ? children : bitacora}</div>
          <aside className={ui.overview} aria-label="Resumen del trámite">{resumen}</aside>
        </div>
      </div>
      <footer className={ui.detailFooter}>{footer}</footer>
    </dialog>
  );
}
