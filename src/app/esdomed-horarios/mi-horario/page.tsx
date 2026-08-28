"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { FilaPlanTrabajo, PermisoTramitePlan, PlanTrabajo } from "@/types";
import { permisoDelDia } from "@/lib/esdomed/permisos-plan";
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
  COLOR_GRUPO,
} from "@/lib/esdomed/plan";
import { CalendarClock, Clock, LogIn, LogOut, Sun, Plane, HeartPulse, FileText, Star } from "lucide-react";

// Encabezado de la semana — inicia en domingo, igual que el formato oficial.
const SEMANA = ["D", "L", "M", "Mi", "J", "V", "S"];
const SEMANA_LARGA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export default function MiHorarioPage() {
  const { profile } = useAuth();
  const [periodo, setPeriodo] = useState(PERIODO_ACTUAL);
  const [plan, setPlan] = useState<PlanTrabajo | null>(null);
  const [loading, setLoading] = useState(true);
  const [diaSel, setDiaSel] = useState<number | null>(null);

  const periodos = useMemo(() => periodosCercanos(11, 2).reverse(), []);

  useEffect(() => {
    setLoading(true);
    setDiaSel(null);
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
  const primerDow = new Date(anio, mes - 1, 1).getDay(); // 0=Domingo

  const fila: FilaPlanTrabajo | undefined =
    plan && profile ? filaDeUsuario(plan, profile) : undefined;

  const totalHoras = fila ? totalHorasFila(fila.asignaciones) : 0;
  const diasTrabajados = fila ? fila.asignaciones.filter((c) => getHorario(c)).length : 0;
  const diasVac = fila ? contarMarca(fila.asignaciones, "VAC") : 0;
  const diasInc = fila ? contarMarca(fila.asignaciones, "INC") : 0;
  const diasPer = fila ? contarMarca(fila.asignaciones, "PER") : 0;

  // Celdas del calendario: relleno inicial + días del mes, completado a semanas.
  const celdas: (number | null)[] = [
    ...Array(primerDow).fill(null),
    ...dias,
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const diaDetalle = diaSel ?? (esMesActual ? diaHoy : null);

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
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
          {fila?.grupo && COLOR_GRUPO[fila.grupo] && (
            <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${COLOR_GRUPO[fila.grupo].badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${COLOR_GRUPO[fila.grupo].dot}`} />
              {fila.grupo}
            </span>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
            <ResumenCard icon={Clock} label="Horas" valor={totalHoras} color="blue" />
            <ResumenCard icon={CalendarClock} label="Días lab." valor={diasTrabajados} color="slate" />
            <ResumenCard icon={Plane} label="Vacaciones" valor={diasVac} color="amber" />
            <ResumenCard icon={HeartPulse} label="Incap./perm." valor={diasInc + diasPer} color="rose" />
          </div>

          {/* Detalle del día seleccionado / hoy */}
          {diaDetalle && (
            <DetalleDia
              anio={anio}
              mes={mes}
              dia={diaDetalle}
              celda={fila.asignaciones[diaDetalle - 1] ?? ""}
              esHoy={diaDetalle === diaHoy}
              permiso={permisoDelDia(fila, diaDetalle)}
            />
          )}

          {/* Calendario */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 sm:p-3">
            {/* Cabecera de días de la semana */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1 sm:mb-1.5">
              {SEMANA.map((d, i) => (
                <div
                  key={d}
                  className={`text-center text-[10px] sm:text-xs font-semibold uppercase tracking-wide py-1 ${
                    i === 0 || i === 6 ? "text-rose-500 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Celdas */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {celdas.map((dia, idx) => {
                if (dia === null) return <div key={`x-${idx}`} className="aspect-square sm:aspect-auto sm:min-h-[78px]" />;
                const dow = (primerDow + dia - 1) % 7;
                return (
                  <CalendarCell
                    key={dia}
                    dia={dia}
                    finde={dow === 0 || dow === 6}
                    celda={fila.asignaciones[dia - 1] ?? ""}
                    esHoy={dia === diaHoy}
                    seleccionado={dia === diaSel}
                    permiso={permisoDelDia(fila, dia)}
                    onClick={() => setDiaSel(dia === diaSel ? null : dia)}
                  />
                );
              })}
            </div>
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500/80" /> Turno</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Vacaciones</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Incapacidad</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> Permiso</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Asueto</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-slate-300 dark:border-slate-600" /> Descanso</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Estilos de celda por tipo de asignación ──────────────────────────────────
function tipoCelda(celda: string): "trabajo" | "VAC" | "INC" | "PER" | "ASU" | "LIC" | "MAT" | "descanso" {
  const v = celda.trim().toUpperCase();
  if (!v) return "descanso";
  if (getHorario(v)) return "trabajo";
  if (v === "VAC" || v === "INC" || v === "PER" || v === "ASU" || v === "LIC" || v === "MAT") return v;
  return "trabajo";
}

const ESTILO_CELDA: Record<ReturnType<typeof tipoCelda>, { cell: string; code: string }> = {
  trabajo: {
    cell: "bg-blue-50 border-blue-200/70 dark:bg-[var(--color-institutional-navy)]/45 dark:border-[#c9a892]/20",
    code: "text-[#1c1e4d] dark:text-[#c9a892]",
  },
  VAC: {
    cell: "bg-amber-50 border-amber-200 dark:bg-amber-950/45 dark:border-amber-900/50",
    code: "text-amber-700 dark:text-amber-300",
  },
  INC: {
    cell: "bg-rose-50 border-rose-200 dark:bg-rose-950/45 dark:border-rose-900/50",
    code: "text-rose-700 dark:text-rose-300",
  },
  PER: {
    cell: "bg-slate-100 border-slate-200 dark:bg-slate-800/70 dark:border-slate-700",
    code: "text-slate-600 dark:text-slate-300",
  },
  ASU: {
    cell: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/45 dark:border-emerald-900/50",
    code: "text-emerald-700 dark:text-emerald-300",
  },
  LIC: {
    cell: "bg-slate-100 border-slate-200 dark:bg-slate-800/70 dark:border-slate-700",
    code: "text-slate-600 dark:text-slate-300",
  },
  MAT: {
    cell: "bg-cyan-50 border-cyan-200 dark:bg-cyan-950/45 dark:border-cyan-900/50",
    code: "text-cyan-700 dark:text-cyan-300",
  },
  descanso: {
    cell: "bg-white border-slate-100 dark:bg-slate-900 dark:border-slate-800",
    code: "text-slate-300 dark:text-slate-600",
  },
};

function CalendarCell({
  dia,
  finde,
  celda,
  esHoy,
  seleccionado,
  permiso,
  onClick,
}: {
  dia: number;
  finde: boolean;
  celda: string;
  esHoy: boolean;
  seleccionado: boolean;
  permiso?: PermisoTramitePlan;
  onClick: () => void;
}) {
  const tipo = tipoCelda(celda);
  const estilo = ESTILO_CELDA[tipo];
  const horario = getHorario(celda);
  const valor = celda.trim().toUpperCase();
  const permisoParcial = permiso?.parcial && valor === permiso.codigoTurno;

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center text-center rounded-lg border transition-all
        aspect-square sm:aspect-auto sm:min-h-[78px] lg:min-h-[92px] p-0.5 sm:p-1.5
        ${estilo.cell}
        ${seleccionado ? "ring-2 ring-[#1c1e4d] dark:ring-[#c9a892]" : esHoy ? "ring-2 ring-blue-400 dark:ring-blue-500" : "hover:brightness-95 dark:hover:brightness-110"}`}
    >
      {/* Número del día */}
      <span
        className={`absolute top-0.5 left-1 text-[9px] sm:text-[11px] font-semibold tabular-nums leading-none
          ${esHoy ? "text-blue-600 dark:text-blue-300" : finde ? "text-rose-400 dark:text-rose-400/80" : "text-slate-400 dark:text-slate-500"}`}
      >
        {dia}
      </span>

      {/* Permiso parcial aprobado sobre el turno de este día */}
      {permisoParcial && (
        <span
          className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400"
          title={`Permiso parcial de ${permiso?.horas} h aprobado`}
        />
      )}

      {/* Contenido */}
      {tipo === "descanso" ? (
        <Sun size={13} className="text-slate-300 dark:text-slate-700 mt-1.5" />
      ) : (
        <div className="mt-2 sm:mt-1 flex flex-col items-center leading-tight">
          <span className={`text-[10px] sm:text-sm font-bold tabular-nums ${estilo.code}`}>{valor}</span>
          {horario && (
            <span className="hidden sm:block text-[9px] lg:text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {horario.entrada}
              <span className="hidden lg:inline"> – {horario.salida}</span>
            </span>
          )}
        </div>
      )}
    </button>
  );
}

function DetalleDia({
  anio,
  mes,
  dia,
  celda,
  esHoy,
  permiso,
}: {
  anio: number;
  mes: number;
  dia: number;
  celda: string;
  esHoy: boolean;
  permiso?: PermisoTramitePlan;
}) {
  const dow = new Date(anio, mes - 1, dia).getDay();
  const horario = getHorario(celda);
  const marca = esMarcaEspecial(celda);
  const descanso = !celda.trim();
  const valor = celda.trim().toUpperCase();
  const permisoParcial = permiso?.parcial && valor === permiso.codigoTurno;
  const permisoCompleto = permiso && !permiso.parcial && valor === "PER";

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {esHoy ? "Hoy" : "Día seleccionado"}
          </p>
          <p className="text-base font-bold text-slate-900 dark:text-white">
            {SEMANA_LARGA[dow]} {dia} de {MESES[mes - 1]}
          </p>
        </div>
        {(horario || marca) && (
          <span className={`shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums ${
            horario
              ? "bg-blue-100 text-[#1c1e4d] dark:bg-[var(--color-institutional-navy)] dark:text-[#c9a892]"
              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          }`}>
            {valor}
          </span>
        )}
      </div>

      <div className="mt-3">
        {horario ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
              <LogIn size={15} className="text-blue-600 dark:text-blue-300" /> {horario.entrada}
              <span className="text-slate-300 dark:text-slate-600">→</span>
              <LogOut size={15} className="text-amber-600 dark:text-amber-400" /> {horario.salida}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{horario.horas} h · {horario.tipo}</span>
          </div>
        ) : marca ? (
          <div className="flex items-center gap-2">
            {valor === "VAC" ? (
              <Plane size={16} className="text-amber-500" />
            ) : valor === "INC" ? (
              <HeartPulse size={16} className="text-rose-500" />
            ) : valor === "ASU" ? (
              <Star size={16} className="text-emerald-500" />
            ) : (
              <FileText size={16} className="text-slate-500" />
            )}
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{labelMarca(celda)}</span>
          </div>
        ) : descanso ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
            <Sun size={16} /> Día de descanso
          </div>
        ) : (
          <span className="text-sm text-slate-600 dark:text-slate-300">{describirCelda(celda)}</span>
        )}

        {permisoParcial && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <FileText size={13} /> Permiso parcial aprobado: {permiso?.horas} h de este turno
          </p>
        )}
        {permisoCompleto && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <FileText size={13} /> Permiso aprobado por trámite (cubría el turno {permiso?.codigoTurno})
          </p>
        )}
      </div>
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
