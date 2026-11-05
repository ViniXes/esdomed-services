"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BedDouble, Download, RefreshCw } from "lucide-react";
import { collection, getDocs, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useServicios } from "@/contexts/ServiciosContext";
import { UltimaSincronizacionSis } from "@/components/esdomed/UltimaSincronizacionSis";
import { DateField } from "@/components/ui/DateField";
import { armarOcupacion, type FilaReporte, type PacienteEnCama } from "@/lib/reportes/ocupacionCamas";
import {
  extrasDisponibles,
  generarOcupacionXlsx,
  ocupacionFila,
  totalesOcupacion,
} from "@/lib/reportes/ocupacionCamasXlsx";
import type { Paciente } from "@/types";

const PLANTILLA = "/plantillas/ocupacion-camas-hnes.xlsx";
const ZONA = "America/El_Salvador";

type Ajustes = Record<number, Partial<Pick<FilaReporte, "ocupadas" | "ocupadasExtra">>>;

const hoyEnElSalvador = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());

const jornadaActual = () =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: ZONA, hour: "numeric", hourCycle: "h23" }).format(new Date())) < 12
    ? "AM"
    : "PM";

const porcentaje = (valor: number) => `${(valor * 100).toFixed(2)} %`;

function descargar(contenido: Uint8Array, nombre: string) {
  const blob = new Blob([contenido as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

export default function OcupacionCamasPage() {
  const { profile, loading: authLoading } = useAuth();
  const { lista } = useServicios();
  const router = useRouter();
  const puedeVer = profile?.role === "esdomed" || profile?.role === "admin";

  const [activos, setActivos] = useState<PacienteEnCama[]>([]);
  const [ajustes, setAjustes] = useState<Ajustes>({});
  const [fecha, setFecha] = useState(hoyEnElSalvador);
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && profile && !puedeVer) router.replace("/dashboard");
  }, [authLoading, profile, puedeVer, router]);

  const cargar = useCallback(async () => {
    if (!puedeVer) return;
    setCargando(true);
    setError(null);
    try {
      const snap = await getDocs(query(collection(db, "pacientes"), where("estado", "==", "activo")));
      setActivos(snap.docs.map((d) => {
        const data = d.data() as Paciente;
        return { servicio: (data.servicioActual ?? "").trim(), cama: data.camaActual };
      }));
      setAjustes({});
    } catch (e) {
      setError(`No se pudo cargar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setCargando(false);
    }
  }, [puedeVer]);

  useEffect(() => {
    const t = setTimeout(() => { cargar(); }, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  const { filas, fuera } = useMemo(() => {
    const base = armarOcupacion(lista, activos);
    return { ...base, filas: base.filas.map((f) => ({ ...f, ...ajustes[f.fila] })) };
  }, [lista, activos, ajustes]);

  const totales = useMemo(() => totalesOcupacion(filas), [filas]);
  const excedidas = filas.filter((f) => f.ocupadas > f.oficiales);
  const totalFuera = fuera.reduce((n, s) => n + s.total, 0);

  const ajustar = (fila: number, campo: "ocupadas" | "ocupadasExtra", valor: string) => {
    const numero = Math.max(0, Math.trunc(Number(valor)) || 0);
    setAjustes((a) => ({ ...a, [fila]: { ...a[fila], [campo]: numero } }));
  };

  const generar = async () => {
    setGenerando(true);
    setError(null);
    try {
      const respuesta = await fetch(PLANTILLA);
      if (!respuesta.ok) throw new Error("no se encontró la plantilla");
      const plantilla = new Uint8Array(await respuesta.arrayBuffer());
      const [anio, mes, dia] = fecha.split("-");
      descargar(
        generarOcupacionXlsx(plantilla, filas, fecha),
        `OCUPACION CAMAS HNES ${dia}-${mes}-${anio} ${jornadaActual()}.xlsx`,
      );
    } catch (e) {
      setError(`No se pudo generar: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setGenerando(false);
    }
  };

  if (authLoading || !puedeVer) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
            <BedDouble size={17} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Ocupación de camas</h1>
            <p className="text-xs text-slate-500">Reporte diario para Dirección, en el formato oficial</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40">
            <DateField value={fecha} onChange={setFecha} />
          </div>
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={cargando ? "animate-spin" : ""} />
            Actualizar
          </button>
          <button
            onClick={generar}
            disabled={generando || cargando || !fecha}
            className="flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
          >
            <Download size={15} />
            {generando ? "Generando..." : "Descargar Excel"}
          </button>
        </div>
      </div>

      <UltimaSincronizacionSis />

      {error && (
        <Aviso tono="error">{error}</Aviso>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Indicador etiqueta="Ocupación hospitalización" valor={porcentaje(totales.ocupacionHospitalizacion)} />
            <Indicador etiqueta="Ocupación UCI + UCINT" valor={porcentaje(totales.ocupacionCriticos)} />
          </div>

          {excedidas.length > 0 && (
            <Aviso tono="advertencia">
              Más pacientes que camas oficiales en: {excedidas.map((f) => f.ambiente).join(", ")}.
              Revisa si alguno está en una cama extra.
            </Aviso>
          )}
          {totalFuera > 0 && (
            <Aviso tono="advertencia">
              {totalFuera} paciente{totalFuera !== 1 ? "s" : ""} activo{totalFuera !== 1 ? "s" : ""} fuera
              del formulario: {fuera.map((s) => `${s.servicio} (${s.total})`).join(", ")}.
            </Aviso>
          )}

          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                    <th colSpan={2} />
                    <th colSpan={2} className="px-2 pt-2.5 font-semibold">Camas censables</th>
                    <th colSpan={2} className="px-2 pt-2.5 font-semibold">Camas extra</th>
                    <th colSpan={2} className="px-2 pt-2.5 font-semibold">Camas no censables</th>
                    <th />
                  </tr>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2 text-left font-semibold">Especialidad</th>
                    <th className="px-3 py-2 text-left font-semibold">Ambiente</th>
                    {["Disponibles", "Ocupadas", "Disponibles", "Ocupadas", "Disponibles", "Ocupadas"].map((t, i) => (
                      <th key={i} className="px-2 py-2 text-center font-semibold">{t}</th>
                    ))}
                    <th className="px-3 py-2 text-center font-semibold">Ocupación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filas.map((f) => (
                    <tr key={f.fila} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{f.especialidad}</td>
                      <td className="px-3 py-1.5 font-medium text-slate-800 dark:text-slate-200 min-w-64">{f.ambiente}</td>
                      {f.tipo === "censable" ? (
                        <>
                          <Numero valor={f.oficiales} />
                          <Editable
                            etiqueta={`Ocupadas en ${f.ambiente}`}
                            valor={f.ocupadas}
                            excedida={f.ocupadas > f.oficiales}
                            onChange={(v) => ajustar(f.fila, "ocupadas", v)}
                          />
                          <Numero valor={extrasDisponibles(f) || null} />
                          {f.extras > 0 ? (
                            <Editable
                              etiqueta={`Ocupadas en extras de ${f.ambiente}`}
                              valor={f.ocupadasExtra}
                              onChange={(v) => ajustar(f.fila, "ocupadasExtra", v)}
                            />
                          ) : <Numero valor={null} />}
                          <Numero valor={null} />
                          <Numero valor={null} />
                        </>
                      ) : (
                        <>
                          <Numero valor={null} />
                          <Numero valor={null} />
                          <Numero valor={null} />
                          <Numero valor={null} />
                          <Numero valor={f.oficiales} />
                          <Editable
                            etiqueta={`Ocupadas en ${f.ambiente}`}
                            valor={f.ocupadas}
                            excedida={f.ocupadas > f.oficiales}
                            onChange={(v) => ajustar(f.fila, "ocupadas", v)}
                          />
                        </>
                      )}
                      <td className="px-3 py-1.5 text-center font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {porcentaje(ocupacionFila(f))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-semibold text-slate-900 dark:text-slate-100">
                    <td colSpan={2} className="px-3 py-2.5">Total</td>
                    {[
                      totales.camasCensables, totales.ocupadasCensables,
                      totales.extrasDisponibles, totales.ocupadasExtra,
                      totales.camasNoCensables, totales.ocupadasNoCensables,
                    ].map((v, i) => <td key={i} className="px-2 py-2.5 text-center tabular-nums">{v}</td>)}
                    <td className="px-3 py-2.5 text-center tabular-nums">{porcentaje(totales.ocupacionHospitalizacion)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
          <p className="text-xs text-slate-500">
            Las ocupadas vienen de los pacientes activos. Puedes corregirlas aquí antes de descargar; el cambio
            solo afecta este Excel y se pierde al actualizar.
          </p>
        </>
      )}
    </div>
  );
}

function Indicador({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3">
      <p className="text-xs text-slate-500">{etiqueta}</p>
      <p className="text-2xl font-bold tabular-nums text-blue-700 dark:text-blue-300 font-heading">{valor}</p>
    </div>
  );
}

function Numero({ valor }: { valor: number | null }) {
  return (
    <td className="px-2 py-1.5 text-center tabular-nums text-slate-700 dark:text-slate-300">
      {valor ?? ""}
    </td>
  );
}

function Editable({ etiqueta, valor, excedida = false, onChange }: {
  etiqueta: string;
  valor: number;
  excedida?: boolean;
  onChange: (valor: string) => void;
}) {
  return (
    <td className="px-2 py-1 text-center">
      <input
        type="number"
        min={0}
        aria-label={etiqueta}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={`w-16 rounded-lg border px-1.5 py-1 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          excedida
            ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            : "border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        }`}
      />
    </td>
  );
}

function Aviso({ tono, children }: { tono: "error" | "advertencia"; children: React.ReactNode }) {
  const color = tono === "error"
    ? "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400"
    : "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300";
  return (
    <div className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-sm ${color}`}>
      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}
