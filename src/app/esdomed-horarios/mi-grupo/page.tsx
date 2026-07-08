"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { FilaPlanTrabajo, PlanTrabajo } from "@/types";
import {
  getHorario,
  esMarcaEspecial,
  totalHorasFila,
} from "@/lib/esdomed/horarios";
import {
  diasDelMesArray,
  inicialesDeMes,
  filaDeUsuario,
  labelPeriodo,
  parsePeriodo,
  periodosCercanos,
  PERIODO_ACTUAL,
  GRUPOS_ESDOMED,
  COLOR_GRUPO,
  ordenGrupo,
} from "@/lib/esdomed/plan";
import { Users, UsersRound } from "lucide-react";

export default function MiGrupoPage() {
  const { profile } = useAuth();
  const [periodo, setPeriodo] = useState(PERIODO_ACTUAL);
  const [plan, setPlan] = useState<PlanTrabajo | null>(null);
  const [loading, setLoading] = useState(true);
  const [grupoSel, setGrupoSel] = useState<string | null>(null);

  const periodos = useMemo(() => periodosCercanos(11, 2).reverse(), []);

  useEffect(() => {
    setLoading(true);
    getDoc(doc(db, "planes_trabajo", periodo))
      .then((snap) => setPlan(snap.exists() ? ({ id: snap.id, ...snap.data() } as PlanTrabajo) : null))
      .catch(() => setPlan(null))
      .finally(() => setLoading(false));
  }, [periodo]);

  const { anio, mes } = parsePeriodo(periodo);
  const dias = diasDelMesArray(anio, mes);
  const iniciales = inicialesDeMes(anio, mes);
  const esMesActual = periodo === PERIODO_ACTUAL;
  const diaHoy = esMesActual ? new Date().getDate() : -1;

  // Grupo propio del usuario en este mes.
  const miFila = plan && profile ? filaDeUsuario(plan, profile) : undefined;
  const miGrupo = miFila?.grupo?.trim() || "";

  // Grupos presentes en el plan (en orden del catálogo).
  const gruposPresentes = useMemo(() => {
    if (!plan) return [];
    const set = new Set(plan.filas.map((f) => f.grupo?.trim() || "").filter(Boolean));
    return [...set].sort((a, b) => ordenGrupo(a) - ordenGrupo(b));
  }, [plan]);

  // Grupo seleccionado por defecto: el del usuario; si no tiene, el primero presente.
  useEffect(() => {
    if (!plan) return;
    setGrupoSel(miGrupo || gruposPresentes[0] || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, miGrupo]);

  const miembros = useMemo(() => {
    if (!plan || !grupoSel) return [];
    return plan.filas
      .filter((f) => (f.grupo?.trim() || "") === grupoSel)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [plan, grupoSel]);

  const estiloGrupo = grupoSel ? COLOR_GRUPO[grupoSel] : null;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892]">
            <UsersRound size={13} /> Mi grupo
          </div>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-heading">
            {labelPeriodo(periodo)}
          </h1>
          {miGrupo && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tu grupo este mes · <span className="font-semibold">{miGrupo}</span>
            </p>
          )}
        </div>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {periodos.map((p) => (
            <option key={p} value={p}>{labelPeriodo(p)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !plan || gruposPresentes.length === 0 ? (
        <EmptyState tienePlan={!!plan} />
      ) : (
        <>
          {/* Selector de grupo */}
          <div className="flex flex-wrap gap-2 mb-5">
            {gruposPresentes.map((g) => {
              const est = COLOR_GRUPO[g];
              const activo = g === grupoSel;
              const esMio = g === miGrupo;
              return (
                <button
                  key={g}
                  onClick={() => setGrupoSel(g)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-all ${
                    activo
                      ? `${est?.badge ?? "bg-slate-200 text-slate-700"} border-transparent ring-2 ring-offset-1 ring-offset-slate-50 dark:ring-offset-[var(--color-institutional-dark)] ring-[#c9a892]`
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${est?.dot ?? "bg-slate-400"}`} />
                  {g}
                  {esMio && <span className="text-[9px] opacity-70">(tú)</span>}
                </button>
              );
            })}
          </div>

          {/* Encabezado del grupo */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-bold ${estiloGrupo?.badge ?? ""}`}>
              <Users size={15} /> {grupoSel}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {miembros.length} {miembros.length === 1 ? "persona" : "personas"}
            </span>
          </div>

          {/* Cuadrícula del grupo: personas × días */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table className="border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60">
                  <th className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 min-w-[160px] border-r border-slate-200 dark:border-slate-700">
                    Persona
                  </th>
                  {dias.map((d, i) => {
                    const finde = iniciales[i] === "S" || iniciales[i] === "D";
                    const hoy = d === diaHoy;
                    return (
                      <th key={d} className={`px-0 py-1 text-center font-semibold w-8 ${hoy ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-200" : finde ? "bg-rose-50 dark:bg-rose-950/40 text-rose-500" : "text-slate-500 dark:text-slate-400"}`}>
                        <div className="text-[9px] leading-none">{iniciales[i]}</div>
                        <div className="text-[11px] tabular-nums">{d}</div>
                      </th>
                    );
                  })}
                  <th className="px-2 py-2 text-center font-semibold text-slate-600 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700">Hrs</th>
                </tr>
              </thead>
              <tbody>
                {miembros.map((fila) => {
                  const total = totalHorasFila(fila.asignaciones);
                  const esYo = fila.uid && fila.uid === profile?.uid;
                  return (
                    <tr
                      key={fila.uid || fila.codigoMarcacion || fila.nombre}
                      className={`border-t border-slate-100 dark:border-slate-800 ${esYo ? "bg-blue-50/50 dark:bg-[var(--color-institutional-navy)]/25" : ""}`}
                    >
                      <td className={`sticky left-0 z-10 px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 min-w-[160px] max-w-[160px] ${esYo ? "bg-blue-50 dark:bg-[var(--color-institutional-navy)]/40" : "bg-white dark:bg-slate-900"}`}>
                        <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 leading-tight truncate" title={fila.nombre}>
                          {fila.nombre}{esYo ? " (tú)" : ""}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate" title={fila.puesto}>
                          {fila.codigoMarcacion && <span className="font-medium text-[#1c1e4d] dark:text-[#c9a892]">{fila.codigoMarcacion}</span>}
                          {fila.puesto ? ` · ${fila.puesto}` : ""}
                        </p>
                      </td>
                      {dias.map((d, i) => {
                        const celda = (fila.asignaciones[i] ?? "").trim();
                        const finde = iniciales[i] === "S" || iniciales[i] === "D";
                        const hoy = d === diaHoy;
                        return (
                          <td key={d} className={`text-center ${hoy ? "ring-1 ring-inset ring-blue-300 dark:ring-blue-700" : finde ? "bg-rose-50/30 dark:bg-rose-950/20" : ""}`}>
                            <span className={`block w-8 h-7 leading-7 text-[10px] font-bold tabular-nums ${colorCelda(celda)}`}>
                              {celda.toUpperCase()}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-center border-l border-slate-200 dark:border-slate-700">
                        <span className="text-[12px] font-bold tabular-nums text-slate-700 dark:text-slate-200">{total}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Roster — tarjetas de los miembros del grupo */}
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Roster</h2>
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {miembros.map((fila) => {
                const esYo = fila.uid && fila.uid === profile?.uid;
                return (
                  <div
                    key={fila.uid || fila.codigoMarcacion || fila.nombre}
                    className={`flex items-center gap-3 rounded-2xl border p-3.5 transition-colors ${
                      esYo
                        ? "border-[#c9a892] dark:border-[#c9a892]/60 bg-blue-50/40 dark:bg-[var(--color-institutional-navy)]/30"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ${estiloGrupo?.badge ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                      {inicialesNombre(fila.nombre)}
                    </div>
                    {/* Datos */}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white leading-tight">
                        <span className="truncate" title={fila.nombre}>{fila.nombre}</span>
                        {esYo && <span className="shrink-0 rounded-full bg-[#1c1e4d] dark:bg-[#c9a892] px-1.5 py-0.5 text-[9px] font-bold text-white dark:text-[var(--color-institutional-dark)]">TÚ</span>}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-[#1c1e4d] dark:text-[#c9a892]">
                        {fila.codigoMarcacion || "Sin código"}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={fila.puesto}>
                        {fila.puesto || "Sin puesto"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-6 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500/80" /> Turno</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Vacaciones</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Incapacidad</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> Permiso</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Asueto</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Desplázate horizontalmente para ver todos los días del mes.</p>
        </>
      )}
    </div>
  );
}

function inicialesNombre(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase();
}

function colorCelda(celda: string): string {
  const v = celda.trim().toUpperCase();
  if (!v) return "text-slate-200 dark:text-slate-700";
  if (getHorario(v)) return "bg-blue-50 text-blue-700 dark:bg-[var(--color-institutional-navy)]/50 dark:text-[#c9a892]";
  if (esMarcaEspecial(v)) {
    if (v === "VAC") return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
    if (v === "INC") return "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300";
    if (v === "ASU") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    return "bg-slate-200 text-slate-700 dark:bg-[var(--color-institutional-charcoal)] dark:text-slate-200";
  }
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

function EmptyState({ tienePlan }: { tienePlan: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
        <UsersRound size={24} />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {tienePlan ? "Aún no hay grupos asignados este mes" : "No hay un plan publicado para este mes"}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
        {tienePlan
          ? "Cuando el asistente administrativo asigne grupos al personal, aquí verás el roster de cada grupo."
          : "Cuando se publique el rol del mes, podrás ver a los compañeros de tu grupo."}
      </p>
    </div>
  );
}
