"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, ClipboardList, Plus } from "lucide-react";
import { collection, getCountFromServer, getDocs, limit, orderBy, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { TramitePersonal } from "@/types";
import { ESTADO_TRAMITE_LABEL, ESTADO_TRAMITE_PILL, partesCategoria } from "@/lib/tramitesPersonal";
import { toDate } from "@/lib/pacientes/helpers";

// Acceso a Trámites de personal desde el inicio de ESDOMED: el estado de los
// últimos 3 trámites propios (misma consulta que Mis trámites, con límite) y,
// para quien los revisa, cuántos esperan respuesta (conteo por agregación).

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fechaCorta(valor: unknown): string {
  const f = toDate(valor);
  return f ? `${f.getDate()} ${MES_CORTO[f.getMonth()]}` : "";
}

export function TramitesInicio() {
  const { user, profile } = useAuth();
  const revisa = profile?.role === "admin" || profile?.role === "asistente_esdomed";
  const [tramites, setTramites] = useState<TramitePersonal[] | null>(null);
  const [porRevisar, setPorRevisar] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let vigente = true;
    getDocs(query(
      collection(db, "tramites_personal"),
      where("empleadoId", "==", user.uid),
      orderBy("creadoEn", "desc"),
      limit(3),
    ))
      .then((snap) => {
        if (vigente) setTramites(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TramitePersonal)));
      })
      .catch(() => {
        if (vigente) setTramites([]);
      });
    return () => {
      vigente = false;
    };
  }, [user]);

  useEffect(() => {
    if (!revisa) return;
    let vigente = true;
    getCountFromServer(query(collection(db, "tramites_personal"), where("estado", "==", "pendiente")))
      .then((snap) => {
        if (vigente) setPorRevisar(snap.data().count);
      })
      .catch(() => { /* el acceso sigue funcionando sin el conteo */ });
    return () => {
      vigente = false;
    };
  }, [revisa]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-cyan-300">
          <ClipboardList size={18} strokeWidth={1.9} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="font-heading font-semibold text-slate-800 dark:text-slate-100">Trámites de personal</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Permisos, cambios de turno, incapacidades y más.</p>
        </div>
      </div>

      {tramites === null ? (
        <div className="space-y-2 px-4 pb-3" aria-hidden="true">
          <div className="h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          <div className="h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : tramites.length === 0 ? (
        <p className="px-4 pb-3 text-xs text-slate-500 dark:text-slate-400">Todavía no has presentado trámites.</p>
      ) : (
        <ul className="mx-4 mb-3 divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {tramites.map((t) => {
            const { codigo, nombre } = partesCategoria(t.categoria);
            return (
              <li key={t.id} className="flex items-center gap-2.5 px-3 py-2">
                <span className="w-8 shrink-0 text-xs font-bold tabular-nums text-blue-700 dark:text-cyan-300">{codigo}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200" title={nombre}>{nombre}</p>
                  <p className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{fechaCorta(t.fechaInicio ?? t.creadoEn)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${ESTADO_TRAMITE_PILL[t.estado]}`}>
                  {ESTADO_TRAMITE_LABEL[t.estado]}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <Link
          prefetch={false}
          href="/dashboard/mis-tramites?nuevo=1"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          <Plus size={15} aria-hidden="true" /> Nuevo trámite
        </Link>
        <Link
          prefetch={false}
          href="/dashboard/mis-tramites"
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-700 hover:text-blue-600 dark:text-cyan-300 dark:hover:text-cyan-200"
        >
          Mis trámites <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {revisa && (
        <Link
          prefetch={false}
          href="/dashboard/aprobacion-tramites"
          className="group flex items-center gap-2.5 border-t border-slate-100 px-4 py-3 text-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
        >
          <ClipboardCheck size={16} className="shrink-0 text-blue-600 dark:text-cyan-300" aria-hidden="true" />
          <span className="flex-1 font-medium text-slate-700 dark:text-slate-200">Gestión de trámites</span>
          {porRevisar !== null && (
            <span className={`text-xs font-semibold tabular-nums ${porRevisar > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
              {porRevisar} por revisar
            </span>
          )}
          <ChevronRight size={15} className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
