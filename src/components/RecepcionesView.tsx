"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { NotificacionFallecido } from "@/types";
import { ArrowLeft, CheckCircle2, Clock, Inbox, Loader2, UserCheck } from "lucide-react";
import ui from "@/components/fallecidos/FallecidosUi.module.css";
import review from "@/components/fallecidos/RevisionFallecidos.module.css";

export default function RecepcionesView() {
  const { profile } = useAuth();
  const [registros, setRegistros] = useState<NotificacionFallecido[]>([]);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, "notificaciones_fallecidos"),
      where("recibeDePsUid", "==", profile.uid)
    );
    return onSnapshot(
      q,
      s => {
        setPermissionError(false);
        const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionFallecido));
        docs.sort((a, b) => {
          const at = (a.creadoEn as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
          const bt = (b.creadoEn as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
          return bt - at;
        });
        setRegistros(docs);
      },
      err => { if (err.code === "permission-denied") setPermissionError(true); }
    );
  }, [profile]);

  const confirmar = async (id: string) => {
    setConfirmando(id);
    await updateDoc(doc(db, "notificaciones_fallecidos", id), {
      recibeDePsConfirmado: true,
      recibeDePsConfirmadoEn: Timestamp.now(),
    });
    setConfirmando(null);
  };

  const formatFecha = (ts: unknown) => {
    if (!ts) return "—";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const pendientes   = registros.filter(r => !r.recibeDePsConfirmado);
  const confirmados  = registros.filter(r => r.recibeDePsConfirmado);

  const areaLabel = profile?.role === "trabajo_social" ? "Trabajo Social" : profile?.role === "psicologia" ? "Psicología" : "Mi área";
  const avisosHref = profile?.role === "psicologia" ? "/psicologia/fallecidos" : "/dashboard/defunciones";

  return (
    <div className={ui.page}>
      <header className={ui.pageHeading}>
        <div>
          <div className={ui.eyebrow}>{areaLabel}<span aria-hidden="true">/</span>Defunciones</div>
          <h1 className="font-heading">Recepción de certificados</h1>
        </div>
        <Link href={avisosHref} prefetch={false} className={ui.secondaryButton}><ArrowLeft size={15} aria-hidden="true" />Ver avisos</Link>
      </header>
      <div className={ui.stats + " " + review.twoStats} aria-label="Mis certificados asignados">
        <div className={ui.stat} data-tone="pending"><span><Inbox size={17} aria-hidden="true" />Por confirmar recepción</span><strong>{pendientes.length}</strong></div>
        <div className={ui.stat}><span><CheckCircle2 size={17} aria-hidden="true" />Recepciones confirmadas</span><strong>{confirmados.length}</strong></div>
      </div>
      {permissionError && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">No tienes permiso para consultar estas recepciones. Contacta al administrador.</p>}
      {pendientes.length > 0 && (
        <section aria-labelledby="recepciones-pendientes" className="mb-8">
          <div className={review.sectionHeading}><h2 id="recepciones-pendientes"><Clock size={16} aria-hidden="true" />Por confirmar</h2><span>{pendientes.length} {pendientes.length === 1 ? "certificado" : "certificados"}</span></div>
          <div className={review.receiptList}>
            {pendientes.map(r => (
              <article key={r.id} className={review.receiptCard}>
                <header className={review.receiptHeader}>
                  <div><strong>Exp. {r.pacienteExpediente}</strong><h3>{r.pacienteNombre}</h3></div>
                  <span className={review.status} data-complete="false"><Clock size={14} aria-hidden="true" />Recepción pendiente</span>
                </header>
                <div className={review.receiptBody}>
                  <dl className={review.receiptMeta}>
                    <div><dt>Servicio / Cama</dt><dd>{r.servicio} · {r.cama}</dd></div>
                    <div><dt>Fecha de defunción</dt><dd>{formatFecha(r.fechaDefuncion)}</dd></div>
                    <div><dt>Entregado por ESDOMED</dt><dd>{r.recibeDePsEntregadoPor || "Sin responsable registrado"}</dd></div>
                    {r.recibeDePsEn && <div><dt>Entrega al área</dt><dd>{formatMomento(r.recibeDePsEn)}</dd></div>}
                  </dl>
                </div>
                <footer className={review.receiptFooter}>
                  <span className={ui.footerState}><UserCheck size={15} aria-hidden="true" />Asignado a {r.recibeDePs || profile?.nombre}</span>
                  <button type="button" onClick={() => confirmar(r.id!)} disabled={confirmando === r.id} className={ui.primaryButton}>
                    {confirmando === r.id ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
                    {confirmando === r.id ? "Confirmando..." : "Confirmar recepción del certificado"}
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </section>
      )}
      {confirmados.length > 0 && (
        <section aria-labelledby="recepciones-confirmadas">
          <div className={review.sectionHeading}><h2 id="recepciones-confirmadas"><CheckCircle2 size={16} aria-hidden="true" />Recepciones confirmadas</h2><span>{confirmados.length} {confirmados.length === 1 ? "certificado" : "certificados"}</span></div>
          <div className={review.tableWrap}>
            <div className="overflow-x-auto">
              <table className={review.table} aria-label="Certificados con recepción confirmada">
                <thead><tr><th>Expediente / Paciente</th><th>Servicio</th><th>Entregado por ESDOMED</th><th>Recepción confirmada</th></tr></thead>
                <tbody>{confirmados.map(r => (
                  <tr key={r.id}>
                    <td><div className={ui.tablePatient}><strong>{r.pacienteExpediente}</strong><span>{r.pacienteNombre}</span></div></td>
                    <td className="text-slate-600 dark:text-slate-300">{r.servicio}</td>
                    <td><p className="text-slate-700 dark:text-slate-200">{r.recibeDePsEntregadoPor || "—"}</p>{r.recibeDePsEn && <span className={review.secondaryLine}>{formatMomento(r.recibeDePsEn)}</span>}</td>
                    <td><span className={review.status} data-complete="true"><CheckCircle2 size={14} aria-hidden="true" />Confirmada</span>{r.recibeDePsConfirmadoEn && <span className={review.secondaryLine}>{formatMomento(r.recibeDePsConfirmadoEn)}</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </section>
      )}
      {registros.length === 0 && !permissionError && <div className={review.empty}><Inbox size={30} strokeWidth={1.5} aria-hidden="true" /><p>No tienes recepciones asignadas</p></div>}
    </div>
  );
}

function formatMomento(ts: unknown) {
  const d = (ts as { toDate?: () => Date } | null)?.toDate?.() ?? (ts ? new Date(ts as string) : null);
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString("es-SV", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : "—";
}
