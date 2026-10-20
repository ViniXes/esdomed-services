"use client";

// Bloques de resumen del dashboard de inconsistencias de marcación:
// indicadores del alcance, composición del descuento y trazabilidad de la carga.

import { ArrowDownRight, ArrowUpRight, Clock, FingerprintPattern, Timer, Users, Wallet } from "lucide-react";
import type { ReporteInconsistenciasMarcacion } from "@/types";
import { nombreMes } from "@/lib/inconsistenciasMarcacion/parser";
import {
  desgloseMinutos,
  formatoDinero,
  formatoDuracion,
  turnoCompleto,
  TIPO_INCIDENCIA_LABEL,
  type ResumenAlcance,
} from "@/lib/inconsistenciasMarcacion/analisis";
import { Leyenda, useColoresGrafica } from "./Graficos";

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** { mes: 9, anio: 2026 } → "Septiembre 2026". */
export const etiquetaPeriodo = (r: { mes: number; anio: number }) => `${capitalizar(nombreMes(r.mes))} ${r.anio}`;

// ─── Indicadores ──────────────────────────────────────────────────────────────

export function Indicadores({
  resumen,
  actual,
  anterior,
  meses,
}: {
  resumen: ResumenAlcance;
  actual: ReporteInconsistenciasMarcacion | null;
  anterior: ReporteInconsistenciasMarcacion | null;
  meses: number;
}) {
  const { porTipo } = resumen;
  const olvidadas = porTipo.omision_entrada.eventos + porTipo.omision_salida.eventos;
  const montoOlvidadas = porTipo.omision_entrada.monto + porTipo.omision_salida.monto;
  const pctOlvidadas = resumen.total ? Math.round((montoOlvidadas / resumen.total) * 100) : 0;

  let delta: React.ReactNode = <span>{meses} mes{meses === 1 ? "" : "es"} cargado{meses === 1 ? "" : "s"}</span>;
  if (actual && anterior) {
    const dif = actual.totalGeneral - anterior.totalGeneral;
    const sube = dif > 0;
    const Flecha = sube ? ArrowUpRight : ArrowDownRight;
    delta = (
      <span className={`inline-flex items-center gap-0.5 font-semibold ${sube ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
        <Flecha size={13} />
        {formatoDinero(Math.abs(dif))}
        <span className="ml-1 font-normal text-slate-500">vs {nombreMes(anterior.mes)}</span>
      </span>
    );
  } else if (actual) {
    delta = <span>Primer mes cargado</span>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tarjeta icon={Wallet} label="Total descontado" valor={formatoDinero(resumen.total)} pie={delta} />
      <Tarjeta
        icon={Users}
        label="Personas con descuento"
        valor={String(resumen.personas.length)}
        pie={<span>{resumen.incidencias} días con incidencia</span>}
      />
      <Tarjeta
        icon={FingerprintPattern}
        label="Marcas olvidadas"
        valor={String(olvidadas)}
        pie={
          <span>
            {porTipo.omision_entrada.eventos} de entrada · {porTipo.omision_salida.eventos} de salida
            {olvidadas > 0 && <> · {pctOlvidadas}% del total</>}
          </span>
        }
      />
      <Tarjeta
        icon={Timer}
        label="Minutos descontados"
        valor={formatoDuracion(porTipo.minutos.minutos)}
        pie={<span>{porTipo.minutos.eventos} días con tardanza o salida temprana · {formatoDinero(porTipo.minutos.monto)}</span>}
      />
    </div>
  );
}

function Tarjeta({ icon: Icon, label, valor, pie }: { icon: typeof Clock; label: string; valor: string; pie: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-slate-500 mb-1.5">
        <Icon size={13} className="text-blue-600 dark:text-blue-400" />
        <p className="text-[11px] font-medium uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{pie}</p>
    </div>
  );
}

// ─── ¿De dónde sale el descuento? ─────────────────────────────────────────────

export function Composicion({ resumen }: { resumen: ResumenAlcance }) {
  const c = useColoresGrafica();
  const turno = turnoCompleto(resumen.porTipo);
  const minutos = resumen.porTipo.minutos;
  const base = turno.monto + minutos.monto;
  const pct = (n: number) => (base ? Math.round((n / base) * 100) : 0);
  const pctTurno = base ? (turno.monto / base) * 100 : 0;

  // Desglose estimado de los minutos: cuánto fue llegar tarde y cuánto irse antes.
  let tarde = 0;
  let temprano = 0;
  for (const p of resumen.personas) {
    for (const d of p.dias) {
      const x = desgloseMinutos(d);
      tarde += x.tarde;
      temprano += x.temprano;
    }
  }

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">¿De dónde sale el descuento?</h3>
      <p className="text-xs text-slate-500">
        Si falta una marca, el reloj descuenta el turno completo (8 o 24 h); si están las dos, solo los minutos.
      </p>

      {base > 0 && (
        <div className="mt-3 flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Turno completo ${pct(turno.monto)}%, minutos ${pct(minutos.monto)}%`}>
          {turno.monto > 0 && <div style={{ width: `${pctTurno}%`, background: c.turno }} />}
          {minutos.monto > 0 && <div style={{ width: `${100 - pctTurno}%`, background: c.minutos }} />}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <Leyenda color={c.turno} label="Turno completo descontado" />
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatoDinero(turno.monto)} <span className="font-normal text-slate-500">· {pct(turno.monto)}%</span>
            </p>
          </div>
          <ul className="mt-2 space-y-1.5 border-l border-slate-200 pl-3 dark:border-slate-700">
            {(["omision_entrada", "omision_salida", "sin_marcacion"] as const).map((t) => (
              <FilaTipo
                key={t}
                label={TIPO_INCIDENCIA_LABEL[t]}
                detalle={`${resumen.porTipo[t].eventos} día${resumen.porTipo[t].eventos === 1 ? "" : "s"}`}
                monto={resumen.porTipo[t].monto}
              />
            ))}
          </ul>
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <Leyenda color={c.minutos} label="Descuento por minutos" />
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatoDinero(minutos.monto)} <span className="font-normal text-slate-500">· {pct(minutos.monto)}%</span>
            </p>
          </div>
          <ul className="mt-2 space-y-1.5 border-l border-slate-200 pl-3 dark:border-slate-700">
            <FilaTipo
              label={TIPO_INCIDENCIA_LABEL.minutos}
              detalle={`${minutos.eventos} día${minutos.eventos === 1 ? "" : "s"} · ${formatoDuracion(minutos.minutos)}`}
              monto={minutos.monto}
            />
            {minutos.eventos > 0 && (
              <li className="text-xs text-slate-500">
                Aprox. {formatoDuracion(tarde)} por llegar tarde y {formatoDuracion(temprano)} por salir antes de hora.
              </li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FilaTipo({ label, detalle, monto }: { label: string; detalle: string; monto: number }) {
  return (
    <li className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-slate-600 dark:text-slate-300">
        {label} <span className="text-slate-400">· {detalle}</span>
      </span>
      <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">{formatoDinero(monto)}</span>
    </li>
  );
}

// ─── Trazabilidad de la carga ─────────────────────────────────────────────────

export function MesesCargados({ reportes }: { reportes: ReporteInconsistenciasMarcacion[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800">
      <p className="mb-1.5 font-semibold uppercase tracking-wider text-[11px]">Reportes cargados</p>
      <ul className="space-y-1">
        {[...reportes].reverse().map((r) => (
          <li key={r.periodo}>
            <span className="font-medium text-slate-700 dark:text-slate-300">{etiquetaPeriodo(r)}</span>
            {" · "}{r.archivoNombre}
            {" · "}cargado por {r.cargadoPorNombre} el {r.cargadoEn.toLocaleDateString("es-SV")}
            {r.fechaImpresion && <> · impreso por RRHH el {r.fechaImpresion}</>}
          </li>
        ))}
      </ul>
      <p className="mt-2">
        Montos tal como vienen en el reporte de RRHH (Art. 99 de las Disposiciones Generales de Presupuestos). Volver a subir el PDF de un mes lo reemplaza.
      </p>
    </section>
  );
}
