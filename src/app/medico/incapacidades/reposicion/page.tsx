"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  FileClock, ArrowLeft, Clock, CheckCircle2, Send, PenLine, Info,
} from "lucide-react";
import type { SolicitudIncapacidad } from "@/types";
import { formatFecha } from "@/lib/pacientes/helpers";
import { calcularDiasHospitalizacion, mapIncapacidadData } from "@/lib/incapacidades/helpers";

const porCreacion = (a: SolicitudIncapacidad, b: SolicitudIncapacidad) =>
  b.creadoEn.getTime() - a.creadoEn.getTime();

/**
 * Bandeja del médico: reposiciones de incapacidad que ESDOMED cargó desde el
 * FIEH y le asignó. Llegan prellenadas (paciente, ingreso, egreso, diagnóstico
 * sugerido); el médico completa días, tratamiento y el resto y las devuelve.
 */
export default function ReposicionMedicoPage() {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState<SolicitudIncapacidad[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "incapacidades"),
      where("medicoId", "==", user.uid),
      where("origen", "==", "reposicion"),
    );
    return onSnapshot(
      q,
      (snap) => {
        setSolicitudes(snap.docs.map((d) => mapIncapacidadData(d.id, d.data())).sort(porCreacion));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user]);

  const porCompletar = useMemo(() => solicitudes.filter((s) => s.estado === "pendiente_medico"), [solicitudes]);
  const enviadas = useMemo(() => solicitudes.filter((s) => s.estado === "pendiente"), [solicitudes]);
  const emitidas = useMemo(() => solicitudes.filter((s) => s.estado === "emitida"), [solicitudes]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-5 shadow-lg shadow-indigo-950/15 md:px-7 md:py-6">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20">
              <FileClock size={24} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-white md:text-2xl font-heading">Reposición de incapacidad</h1>
              <p className="mt-1 text-sm text-indigo-50/90">
                Constancias de egresos anteriores a la app que ESDOMED le asignó. Complete lo que falta y ESDOMED la emite.
              </p>
            </div>
          </div>
          <Link
            prefetch={false}
            href="/medico/incapacidades"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/25 transition-colors hover:bg-white/20"
          >
            <ArrowLeft size={16} /> Mis incapacidades
          </Link>
        </div>
      </section>

      {/* Resumen */}
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/25">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white"><PenLine size={16} /></span>
          <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{porCompletar.length}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Por completar</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5 dark:border-indigo-900/60 dark:bg-indigo-950/25">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white"><Send size={16} /></span>
          <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{enviadas.length}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Enviadas a ESDOMED</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/25">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white"><CheckCircle2 size={16} /></span>
          <div><p className="text-lg font-bold leading-none text-slate-900 dark:text-white">{emitidas.length}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Emitidas</p></div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : solicitudes.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <FileClock size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500">ESDOMED no le ha asignado reposiciones de incapacidad.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Por completar */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">
              <PenLine size={15} className="text-amber-600 dark:text-amber-400" />
              Por completar
              {porCompletar.length > 0 && (
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-full">
                  {porCompletar.length}
                </span>
              )}
            </h2>
            {porCompletar.length === 0 ? (
              <p className="text-xs text-slate-500 px-1">Nada pendiente de su parte.</p>
            ) : (
              <>
                <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <p>
                    ESDOMED ya cargó los datos del paciente y las fechas desde el FIEH. Solo debe indicar los días
                    adicionales, el tratamiento al alta y revisar el diagnóstico. Al guardar, vuelve a ESDOMED para emitirla.
                  </p>
                </div>
                {porCompletar.map((s) => <TarjetaReposicion key={s.id} s={s} />)}
              </>
            )}
          </section>

          {/* Enviadas a ESDOMED */}
          {enviadas.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">
                <Send size={15} className="text-indigo-600 dark:text-indigo-400" />
                Enviadas a ESDOMED
              </h2>
              {enviadas.map((s) => <TarjetaReposicion key={s.id} s={s} />)}
            </section>
          )}

          {/* Emitidas */}
          {emitidas.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">
                <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
                Emitidas
              </h2>
              {emitidas.map((s) => <TarjetaReposicion key={s.id} s={s} />)}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaReposicion({ s }: { s: SolicitudIncapacidad }) {
  const porCompletar = s.estado === "pendiente_medico";
  const enviada = s.estado === "pendiente";
  const estancia = calcularDiasHospitalizacion(s.fechaDesde, s.fechaAlta);
  const barra = porCompletar ? "bg-amber-400" : enviada ? "bg-indigo-500" : "bg-emerald-500";

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03] transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-950/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800">
      <span className={`absolute bottom-0 left-0 top-0 w-1 ${barra}`} />
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pl-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-semibold text-slate-900 dark:text-slate-100 text-[15px]">{s.pacienteNombre}</p>
            {porCompletar ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-full">
                <PenLine size={10} /> Por completar
              </span>
            ) : enviada ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-900 px-2 py-0.5 rounded-full">
                <Clock size={10} /> Pendiente de emitir
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 px-2 py-0.5 rounded-full">
                <CheckCircle2 size={10} /> Emitida
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Exp. <span className="font-mono">{s.pacienteExpediente}</span>
            {" · "}{s.servicioPaciente}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Ingreso {formatFecha(s.fechaDesde)} → Egreso {formatFecha(s.fechaAlta)}
            {" · "}{estancia} {estancia === 1 ? "día" : "días"} de hospitalización
            {!porCompletar && <> · {s.diasIncapacidad} {s.diasIncapacidad === 1 ? "día" : "días"} en total</>}
          </p>
          {s.diagnosticoEgreso && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 line-clamp-2">
              <span className="font-medium text-slate-500">Dx:</span> {s.diagnosticoEgreso}
            </p>
          )}
          <p className="text-[11px] text-slate-400 mt-1.5">
            Cargada por ESDOMED · {s.reposicion?.creadaPorNombre ?? "—"} · {formatFecha(s.creadoEn)}
            {s.estado === "emitida" && s.emitidaPorNombre && (
              <span className="text-green-700 dark:text-green-400"> · Emitida por {s.emitidaPorNombre}{s.emitidaEn && ` el ${formatFecha(s.emitidaEn)}`}</span>
            )}
          </p>
        </div>
        {(porCompletar || enviada) && (
          <Link
            prefetch={false}
            href={`/medico/incapacidades/${s.id}/editar`}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors flex-shrink-0 ${
              porCompletar
                ? "bg-blue-600 text-white hover:bg-blue-500 shadow-sm"
                : "text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900"
            }`}
          >
            <PenLine size={12} />
            {porCompletar ? "Completar" : "Editar"}
          </Link>
        )}
      </div>
    </article>
  );
}
