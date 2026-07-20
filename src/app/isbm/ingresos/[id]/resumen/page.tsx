"use client";

// Ficha "Resumen de Cargos" por paciente — réplica de la vista estilo Excel
// del convenio (la misma agrupación en secciones numeradas del libro que
// manejaba la Unidad): 7 secciones color-coded por tipo de cargo, filtro por
// estancia completa / día / rango, subtotales por sección y total general.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import {
  cargosDeIngreso,
  obtenerIngreso,
  type IngresoConAfiliacion,
} from "@/lib/isbm/api";
import {
  CONDICION_EGRESO_LABEL,
  MOTIVO_NO_FACTURABLE_LABEL,
  formatoDolares,
  type CargoConArancel,
  type SeccionConsolidadoIsbm,
} from "@/lib/isbm/types";

type ModoFecha = "estancia" | "dia" | "rango";

interface SeccionDef {
  id: string;
  titulo: string;
  subtitulo?: string;
  seccion: SeccionConsolidadoIsbm;
  color: { border: string; headerBg: string; headerText: string; badge: string };
}

// Mismas secciones y orden del libro Excel del convenio (sistema anterior).
// Cada cargo cae en la sección que dicta su arancel (seccion_consolidado),
// no el rubro: interconsultas y fisioterapias viven en el rubro OTROS.
const SECCIONES: SeccionDef[] = [
  {
    id: "dia_cama",
    titulo: "1. DÍA CAMA",
    seccion: "DIA_CAMA",
    color: { border: "border-l-sky-500", headerBg: "bg-sky-500/10", headerText: "text-sky-800 dark:text-sky-300", badge: "text-sky-700 dark:text-sky-400" },
  },
  {
    id: "laboratorio",
    titulo: "2. EXÁMENES DE LABORATORIO",
    seccion: "LABORATORIO",
    color: { border: "border-l-violet-500", headerBg: "bg-violet-500/10", headerText: "text-violet-800 dark:text-violet-300", badge: "text-violet-700 dark:text-violet-400" },
  },
  {
    id: "radiologia",
    titulo: "3. ESTUDIOS RADIOLÓGICOS O IMÁGENES",
    seccion: "RADIOLOGIA",
    color: { border: "border-l-teal-500", headerBg: "bg-teal-500/10", headerText: "text-teal-800 dark:text-teal-300", badge: "text-teal-700 dark:text-teal-400" },
  },
  {
    id: "medicamentos",
    titulo: "4. MEDICAMENTOS",
    seccion: "MEDICAMENTOS",
    color: { border: "border-l-emerald-500", headerBg: "bg-emerald-500/10", headerText: "text-emerald-800 dark:text-emerald-300", badge: "text-emerald-700 dark:text-emerald-400" },
  },
  {
    id: "quirurgico",
    titulo: "5. OTROS SERVICIOS",
    seccion: "OTROS_SERVICIOS",
    color: { border: "border-l-amber-500", headerBg: "bg-amber-500/10", headerText: "text-amber-800 dark:text-amber-300", badge: "text-amber-700 dark:text-amber-400" },
  },
  {
    id: "interconsultas",
    titulo: "6. INTERCONSULTAS",
    subtitulo: "detallar la especialidad y el nombre del médico",
    seccion: "INTERCONSULTAS",
    color: { border: "border-l-indigo-500", headerBg: "bg-indigo-500/10", headerText: "text-indigo-800 dark:text-indigo-300", badge: "text-indigo-700 dark:text-indigo-400" },
  },
  {
    id: "fisioterapia",
    titulo: "7. FISIOTERAPIA",
    subtitulo: "detallar el nombre de quien la realizó",
    seccion: "FISIOTERAPIA",
    color: { border: "border-l-rose-500", headerBg: "bg-rose-500/10", headerText: "text-rose-800 dark:text-rose-300", badge: "text-rose-700 dark:text-rose-400" },
  },
];

export default function ResumenIngresoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ingreso, setIngreso] = useState<IngresoConAfiliacion | null>(null);
  const [cargos, setCargos] = useState<CargoConArancel[] | null>(null);
  const [error, setError] = useState("");
  const [mostrarAnulados, setMostrarAnulados] = useState(false);

  const [modoFecha, setModoFecha] = useState<ModoFecha>("estancia");
  const [fechaDia, setFechaDia] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const cargar = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const [ing, cgs] = await Promise.all([obtenerIngreso(id), cargosDeIngreso(id)]);
      if (!ing) throw new Error("No se encontró el ingreso");
      setIngreso(ing);
      setCargos(cgs);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  // Diferido: regla react-hooks/set-state-in-effect.
  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  const enRango = useCallback(
    (fecha: string) => {
      if (modoFecha === "dia") return !fechaDia || fecha === fechaDia;
      if (modoFecha === "rango") {
        if (fechaDesde && fecha < fechaDesde) return false;
        if (fechaHasta && fecha > fechaHasta) return false;
        return true;
      }
      return true; // estancia completa
    },
    [modoFecha, fechaDia, fechaDesde, fechaHasta]
  );

  const visibles = useMemo(
    () => (cargos ?? []).filter((c) => enRango(c.fecha) && (mostrarAnulados || !c.anulado)),
    [cargos, enRango, mostrarAnulados]
  );

  const totales = useMemo(() => {
    const vivos = visibles.filter((c) => !c.anulado);
    return {
      servicio: vivos.reduce((s, c) => s + c.costo_total, 0),
      cobrable: vivos.reduce((s, c) => s + c.monto_facturable, 0),
    };
  }, [visibles]);

  const etiquetaPeriodo =
    modoFecha === "estancia"
      ? "Estancia completa"
      : modoFecha === "dia"
        ? fechaDia || "Elige el día"
        : `${fechaDesde || "…"} → ${fechaHasta || "…"}`;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={15} /> Volver
      </button>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
      )}

      {!ingreso || !cargos ? (
        <div className="p-12 flex justify-center">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Encabezado del paciente ── */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex-1 min-w-[220px]">
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Resumen de cargos</p>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
                {ingreso.paciente_nombre}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Exp. <span className="font-mono">{ingreso.expediente}</span>
                {ingreso.afiliacion?.numero_afiliacion_isbm && ` · Afiliación ${ingreso.afiliacion.numero_afiliacion_isbm}`}
                {" · "}Ingreso {ingreso.fecha_ingreso}
                {ingreso.fecha_egreso
                  ? ` · Egreso ${ingreso.fecha_egreso} (${CONDICION_EGRESO_LABEL[ingreso.condicion_egreso]})`
                  : " · Activo"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Total servicio</p>
              <p className="text-base font-bold tabular-nums text-slate-700 dark:text-slate-300">{formatoDolares(totales.servicio)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Total cobrable</p>
              <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{formatoDolares(totales.cobrable)}</p>
            </div>
          </div>

          {/* ── Filtros ── */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
              {([["estancia", "Estancia completa"], ["dia", "Día"], ["rango", "Rango"]] as [ModoFecha, string][]).map(([m, l]) => (
                <button
                  key={m}
                  onClick={() => setModoFecha(m)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    modoFecha === m
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {modoFecha === "dia" && (
              <div className="w-40"><DateField value={fechaDia} onChange={setFechaDia} ariaLabel="Día" placeholder="Día" /></div>
            )}
            {modoFecha === "rango" && (
              <>
                <div className="w-40"><DateField value={fechaDesde} onChange={setFechaDesde} ariaLabel="Desde" placeholder="Desde" /></div>
                <div className="w-40"><DateField value={fechaHasta} onChange={setFechaHasta} ariaLabel="Hasta" placeholder="Hasta" /></div>
              </>
            )}
            <button
              onClick={() => setMostrarAnulados((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              {mostrarAnulados ? <EyeOff size={13} /> : <Eye size={13} />}
              {mostrarAnulados ? "Ocultar anulados" : "Ver anulados"}
            </button>
            <span className="text-xs text-slate-400 ml-auto">{etiquetaPeriodo} · {visibles.length} cargo{visibles.length !== 1 ? "s" : ""}</span>
          </div>

          {/* ── Secciones ── */}
          <div className="space-y-3">
            {SECCIONES.map((s) => (
              <SeccionTabla key={s.id} seccion={s} cargos={visibles} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tabla de una sección ─────────────────────────────────────────────────────

function SeccionTabla({ seccion, cargos }: { seccion: SeccionDef; cargos: CargoConArancel[] }) {
  const items = cargos.filter((c) => c.arancel.seccion_consolidado === seccion.seccion);
  const vivos = items.filter((c) => !c.anulado);
  const totalCosto = vivos.reduce((s, c) => s + c.costo_total, 0);
  const totalFacturable = vivos.reduce((s, c) => s + c.monto_facturable, 0);

  const esInterconsulta = seccion.id === "interconsultas";
  const esFisioterapia = seccion.id === "fisioterapia";
  const extraCol = esInterconsulta || esFisioterapia;

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 border-l-4 bg-white dark:bg-slate-900 ${seccion.color.border}`}>
      <div className={`flex items-baseline justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-2 ${seccion.color.headerBg}`}>
        <div>
          <span className={`text-[11px] font-extrabold tracking-widest uppercase ${seccion.color.headerText}`}>
            {seccion.titulo}
          </span>
          {seccion.subtitulo && (
            <span className="ml-2 text-[10px] italic text-slate-400">({seccion.subtitulo})</span>
          )}
        </div>
        {vivos.length > 0 && (
          <span className={`text-xs font-bold tabular-nums ${seccion.color.badge}`}>{formatoDolares(totalFacturable)}</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <th className="w-24 px-3 py-1.5 font-semibold">Fecha</th>
              <th className="px-3 py-1.5 font-semibold">Descripción del servicio / medicamento</th>
              {extraCol && (
                <th className="w-48 px-3 py-1.5 font-semibold">
                  {esInterconsulta ? "Especialidad / Médico" : "Realizado por"}
                </th>
              )}
              <th className="w-12 px-3 py-1.5 font-semibold text-right">Cant.</th>
              <th className="w-24 px-3 py-1.5 font-semibold text-right">P. Unitario</th>
              <th className="w-24 px-3 py-1.5 font-semibold text-right">Total</th>
              <th className="w-24 px-3 py-1.5 font-semibold text-right">Facturable</th>
              <th className="w-20 px-3 py-1.5 font-semibold text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={extraCol ? 8 : 7} className="px-3 py-3.5 text-center text-[11px] text-slate-400">
                  — Sin cargos registrados —
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr key={c.id} className={`border-b border-slate-50 dark:border-slate-800/60 last:border-0 ${c.anulado ? "opacity-40" : ""}`}>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">{c.fecha}</td>
                  <td className={`px-3 py-1.5 text-slate-800 dark:text-slate-200 ${c.anulado ? "line-through" : ""}`}>
                    {c.arancel.descripcion}
                    {c.arancel.es_bolson && (
                      <span
                        title="Medicamento adicional a cuadro básico (bolsón): se cobra aparte"
                        className="ml-1.5 inline-block rounded-full border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-px text-[9px] font-semibold uppercase text-indigo-700 dark:text-indigo-300 align-middle"
                      >
                        Adicional a cuadro
                      </span>
                    )}
                  </td>
                  {extraCol && (
                    <td className="px-3 py-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                      {esInterconsulta
                        ? [c.especialidad_interconsulta?.replaceAll("_", " "), c.comentarios].filter(Boolean).join(" — ") || "—"
                        : c.comentarios || "—"}
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-right font-mono text-slate-500">{Number(c.cantidad)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatoDolares(c.precio_unitario)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatoDolares(c.costo_total)}</td>
                  <td
                    className={`px-3 py-1.5 text-right font-mono font-semibold ${
                      c.anulado
                        ? "text-slate-400 line-through"
                        : c.monto_facturable < c.costo_total
                          ? "text-red-600 dark:text-red-400"
                          : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {formatoDolares(c.monto_facturable)}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {c.pendiente_revision && !c.anulado && (
                      <Estado texto="⏳ Obs." tono="ambar" titulo="En observación: pendiente de confirmar que se realizó" />
                    )}{" "}
                    {c.anulado ? (
                      <Estado texto="Anulado" tono="rojo" />
                    ) : c.monto_facturable === 0 ? (
                      <Estado texto="No fact." tono="ambar" titulo={c.motivo_no_facturable ? MOTIVO_NO_FACTURABLE_LABEL[c.motivo_no_facturable] : undefined} />
                    ) : c.monto_facturable < c.costo_total ? (
                      <Estado texto="Parcial" tono="ambar" titulo={c.motivo_no_facturable ? MOTIVO_NO_FACTURABLE_LABEL[c.motivo_no_facturable] : undefined} />
                    ) : (
                      <Estado texto="✓ OK" tono="verde" />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {vivos.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-semibold">
                <td colSpan={extraCol ? 5 : 4} className="px-3 py-1.5 text-right text-[10px] uppercase tracking-wider text-slate-400">
                  Subtotal sección:
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{formatoDolares(totalCosto)}</td>
                <td className={`px-3 py-1.5 text-right font-mono font-bold ${seccion.color.badge}`}>{formatoDolares(totalFacturable)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function Estado({ texto, tono, titulo }: { texto: string; tono: "verde" | "ambar" | "rojo"; titulo?: string }) {
  const cls =
    tono === "verde"
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
      : tono === "ambar"
        ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
        : "text-red-600 dark:text-red-400 bg-red-500/10";
  return (
    <span title={titulo} className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${cls}`}>
      {texto}
    </span>
  );
}
