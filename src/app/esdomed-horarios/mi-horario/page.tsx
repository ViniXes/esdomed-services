"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { FilaPlanTrabajo, PlanTrabajo } from "@/types";
import {
  describirCelda,
  getHorario,
  esMarcaEspecial,
  labelMarca,
  totalHorasFila,
  contarMarca,
} from "@/lib/esdomed/horarios";
import {
  diasDelMesArray,
  filaDeUsuario,
  labelPeriodo,
  parsePeriodo,
  periodosCercanos,
  PERIODO_ACTUAL,
} from "@/lib/esdomed/plan";
import { CalendarClock, Clock, LogIn, LogOut, Sun, Plane, HeartPulse, FileText, Star } from "lucide-react";

const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function MiHorarioPage() {
  const { profile } = useAuth();
  const [periodo, setPeriodo] = useState(PERIODO_ACTUAL);
  const [plan, setPlan] = useState<PlanTrabajo | null>(null);
  const [loading, setLoading] = useState(true);

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
  const hoy = new Date();
  const esMesActual = periodo === PERIODO_ACTUAL;
  const diaHoy = esMesActual ? hoy.getDate() : -1;

  const fila: FilaPlanTrabajo | undefined =
    plan && profile ? filaDeUsuario(plan, profile) : undefined;

  const totalHoras = fila ? totalHorasFila(fila.asignaciones) : 0;
  const diasTrabajados = fila
    ? fila.asignaciones.filter((c) => getHorario(c)).length
    : 0;
  const diasVac = fila ? contarMarca(fila.asignaciones, "VAC") : 0;
  const diasInc = fila ? contarMarca(fila.asignaciones, "INC") : 0;
  const diasPer = fila ? contarMarca(fila.asignaciones, "PER") : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1c1e4d] dark:text-[#c9a892]">
            <CalendarClock size={13} /> Mi horario
          </div>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-heading">
            {labelPeriodo(periodo)}
          </h1>
          {profile?.codigoMarcacion && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Código de marcación · {profile.codigoMarcacion}
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
      ) : !fila ? (
        <EmptyState tienePlan={!!plan} tieneCodigo={!!profile?.codigoMarcacion} />
      ) : (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
            <ResumenCard icon={Clock} label="Horas" valor={totalHoras} color="blue" />
            <ResumenCard icon={CalendarClock} label="Días lab." valor={diasTrabajados} color="slate" />
            <ResumenCard icon={Plane} label="Vacaciones" valor={diasVac} color="amber" />
            <ResumenCard icon={HeartPulse} label="Incap./perm." valor={diasInc + diasPer} color="rose" />
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500/80" /> Turno</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Vacaciones</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Incapacidad</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> Permiso</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Asueto</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-slate-300 dark:border-slate-600" /> Descanso</span>
          </div>

          {/* Días — fluyen en columnas para aprovechar el ancho */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2">
            {dias.map((dia) => {
              const celda = fila.asignaciones[dia - 1] ?? "";
              const dow = new Date(anio, mes - 1, dia).getDay();
              const finde = dow === 0 || dow === 6;
              const esHoy = dia === diaHoy;
              return (
                <DiaRow
                  key={dia}
                  dia={dia}
                  dow={dow}
                  celda={celda}
                  finde={finde}
                  esHoy={esHoy}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ResumenCard({
  icon: Icon,
  label,
  valor,
  color,
}: {
  icon: typeof Clock;
  label: string;
  valor: number;
  color: "blue" | "slate" | "amber" | "rose";
}) {
  const colors = {
    blue: "text-[#1c1e4d] dark:text-[#c9a892] bg-blue-50 dark:bg-[var(--color-institutional-navy)]",
    slate: "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800",
    amber: "text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60",
    rose: "text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60",
  }[color];
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${colors}`}>
        <Icon size={15} />
      </div>
      <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white tabular-nums leading-none">{valor}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function DiaRow({
  dia,
  dow,
  celda,
  finde,
  esHoy,
}: {
  dia: number;
  dow: number;
  celda: string;
  finde: boolean;
  esHoy: boolean;
}) {
  const horario = getHorario(celda);
  const marca = esMarcaEspecial(celda);
  const descanso = !celda.trim();

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
        esHoy
          ? "border-blue-400 dark:border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-1 ring-blue-200 dark:ring-blue-800"
          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
      }`}
    >
      {/* Fecha */}
      <div className={`flex w-11 flex-col items-center justify-center rounded-lg py-1 ${finde ? "bg-slate-100 dark:bg-slate-800" : "bg-slate-50 dark:bg-slate-800/50"}`}>
        <span className="text-base font-bold leading-none text-slate-900 dark:text-white tabular-nums">{dia}</span>
        <span className={`text-[10px] uppercase ${finde ? "text-rose-500 dark:text-rose-400" : "text-slate-400"}`}>
          {DIAS_LARGOS[dow].slice(0, 3)}
        </span>
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        {horario ? (
          <>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
              <LogIn size={13} className="text-blue-600 dark:text-blue-300" /> {horario.entrada}
              <span className="text-slate-300 dark:text-slate-600">→</span>
              <LogOut size={13} className="text-amber-600 dark:text-amber-400" /> {horario.salida}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {celda.trim().toUpperCase()} · {horario.horas} h · {horario.tipo}
            </p>
          </>
        ) : marca ? (
          <div className="flex items-center gap-2">
            {celda.trim().toUpperCase() === "VAC" ? (
              <Plane size={15} className="text-amber-500" />
            ) : celda.trim().toUpperCase() === "INC" ? (
              <HeartPulse size={15} className="text-rose-500" />
            ) : celda.trim().toUpperCase() === "ASU" ? (
              <Star size={15} className="text-emerald-500" />
            ) : (
              <FileText size={15} className="text-slate-500" />
            )}
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{labelMarca(celda)}</span>
          </div>
        ) : descanso ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
            <Sun size={15} /> Descanso
          </div>
        ) : (
          <span className="text-sm text-slate-600 dark:text-slate-300">{describirCelda(celda)}</span>
        )}
      </div>

      {/* Código grande a la derecha */}
      {(horario || marca) && (
        <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold tabular-nums ${
          horario
            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200"
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        }`}>
          {celda.trim().toUpperCase()}
        </span>
      )}
    </div>
  );
}

function EmptyState({ tienePlan, tieneCodigo }: { tienePlan: boolean; tieneCodigo: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
        <CalendarClock size={24} />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {!tienePlan
          ? "Aún no hay un plan publicado para este mes"
          : !tieneCodigo
            ? "Tu usuario no tiene código de marcación"
            : "No apareces en el plan de este mes"}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
        {!tienePlan
          ? "Cuando el asistente administrativo publique el rol del mes, aquí verás tus turnos."
          : !tieneCodigo
            ? "Pídele al administrador que registre tu código de marcación para vincular tu horario."
            : "Verifica con el asistente administrativo que tu fila esté incluida en el plan."}
      </p>
    </div>
  );
}
