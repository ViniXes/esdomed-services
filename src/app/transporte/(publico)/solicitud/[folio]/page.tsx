"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { doc, getDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { asegurarSesionPublica } from "@/lib/transporte/sesionPublica";
import type { ViajeTransporte } from "@/types";
import { ESTADO_VIAJE_COLOR, ESTADO_VIAJE_LABEL } from "@/lib/transporte/catalogos";
import { AlertTriangle, Bus, Loader2, Printer, RefreshCw } from "lucide-react";

const fmtFecha = (f?: string) => {
  if (!f) return "—";
  const [y, m, d] = f.split("-");
  return y && m && d ? `${d}/${m}/${y}` : f;
};

// Línea de dato del formato impreso (etiqueta + valor sobre línea).
function CampoPrint({ label, valor, ancho = "" }: { label: string; valor?: string | number | null; ancho?: string }) {
  return (
    <div className={`flex items-end gap-2 ${ancho}`}>
      <span className="font-semibold whitespace-nowrap">{label}:</span>
      <span className="flex-1 border-b border-black min-h-[1.2em] px-1">{valor ?? ""}</span>
    </div>
  );
}

export default function EstadoSolicitudPage() {
  const { folio } = useParams<{ folio: string }>();
  const [viaje, setViaje] = useState<ViajeTransporte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [noEncontrada, setNoEncontrada] = useState(false);

  const cargar = useCallback(async () => {
    if (!folio) return;
    setCargando(true);
    try {
      await asegurarSesionPublica();
      const snap = await getDoc(doc(db, "viajes_transporte", folio));
      if (snap.exists()) {
        setViaje({ id: snap.id, ...snap.data() } as ViajeTransporte);
        setNoEncontrada(false);
      } else {
        setNoEncontrada(true);
      }
    } catch {
      setNoEncontrada(true);
    } finally {
      setCargando(false);
    }
  }, [folio]);

  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
      {/* ── Vista de pantalla ─────────────────────────────────────────────── */}
      <div className="print:hidden">
        <header className="bg-[#1c1e4d] text-white">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
            <Image src="/logo_hnes_sidebar.png" alt="HNES" width={40} height={40} className="rounded" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Hospital Nacional El Salvador</p>
              <h1 className="text-lg font-bold font-heading leading-tight">Estado de solicitud de transporte</h1>
            </div>
            <Bus size={26} className="ml-auto text-white/60 shrink-0" />
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-6 pb-16 space-y-4">
          {cargando ? (
            <div className="py-24 flex items-center justify-center gap-2 text-sm text-slate-400">
              <Loader2 size={16} className="animate-spin" /> Consultando solicitud…
            </div>
          ) : noEncontrada || !viaje ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center space-y-3">
              <AlertTriangle size={32} className="mx-auto text-amber-500" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Solicitud no encontrada</h2>
              <p className="text-sm text-slate-500">Verifica que el folio del enlace sea correcto.</p>
            </div>
          ) : (
            <>
              {/* Estado */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] text-slate-500">{viaje.folio}</p>
                    <span className={`inline-flex items-center text-sm font-bold px-3 py-1 rounded-lg border mt-1 ${ESTADO_VIAJE_COLOR[viaje.estado]}`}>
                      {ESTADO_VIAJE_LABEL[viaje.estado]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={cargar}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <RefreshCw size={13} /> Actualizar
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
                    >
                      <Printer size={13} /> Imprimir orden
                    </button>
                  </div>
                </div>
                {viaje.estado === "rechazado" && viaje.motivoRechazo && (
                  <div className="mt-4 flex items-start gap-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span><strong>Motivo del rechazo:</strong> {viaje.motivoRechazo}</span>
                  </div>
                )}
              </div>

              {/* Datos de la solicitud */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 font-heading mb-3">Solicitud</h2>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                  <div><dt className="text-xs font-semibold text-slate-500 uppercase">Solicitante</dt><dd className="text-slate-800 dark:text-slate-200">{viaje.solicitanteNombre}</dd></div>
                  <div><dt className="text-xs font-semibold text-slate-500 uppercase">Área</dt><dd className="text-slate-800 dark:text-slate-200">{viaje.area}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs font-semibold text-slate-500 uppercase">Misión</dt><dd className="text-slate-800 dark:text-slate-200">{viaje.mision}</dd></div>
                  {viaje.personal && (
                    <div className="sm:col-span-2"><dt className="text-xs font-semibold text-slate-500 uppercase">Personal que participa</dt><dd className="text-slate-800 dark:text-slate-200">{viaje.personal}</dd></div>
                  )}
                  <div><dt className="text-xs font-semibold text-slate-500 uppercase">Destino</dt><dd className="text-slate-800 dark:text-slate-200">{viaje.destinoTexto}</dd></div>
                  <div><dt className="text-xs font-semibold text-slate-500 uppercase">Fecha y hora</dt><dd className="text-slate-800 dark:text-slate-200">{fmtFecha(viaje.fechaNecesita)} · {viaje.horaNecesita}</dd></div>
                </dl>
              </div>

              {/* Asignación / ejecución */}
              {(viaje.vehiculoNombre || viaje.motoristaNombre || viaje.horaSalida) && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6">
                  <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 font-heading mb-3">Asignación</h2>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                    {viaje.vehiculoNombre && <div><dt className="text-xs font-semibold text-slate-500 uppercase">Vehículo</dt><dd className="text-slate-800 dark:text-slate-200">{viaje.vehiculoNombre}</dd></div>}
                    {viaje.motoristaNombre && <div><dt className="text-xs font-semibold text-slate-500 uppercase">Motorista</dt><dd className="text-slate-800 dark:text-slate-200">{viaje.motoristaNombre}</dd></div>}
                    {viaje.horaSalida && <div><dt className="text-xs font-semibold text-slate-500 uppercase">Salida</dt><dd className="text-slate-800 dark:text-slate-200">{viaje.horaSalida}{viaje.kmSalida != null ? ` · Km ${viaje.kmSalida}` : ""}</dd></div>}
                    {viaje.horaEntrada && <div><dt className="text-xs font-semibold text-slate-500 uppercase">Entrada</dt><dd className="text-slate-800 dark:text-slate-200">{viaje.horaEntrada}{viaje.kmEntrada != null ? ` · Km ${viaje.kmEntrada}` : ""}</dd></div>}
                    {viaje.kmRecorrido != null && <div><dt className="text-xs font-semibold text-slate-500 uppercase">Km recorridos</dt><dd className="text-slate-800 dark:text-slate-200">{viaje.kmRecorrido}</dd></div>}
                  </dl>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ── Formato impreso (réplica de la Solicitud de Transporte en papel) ── */}
      {viaje && (
        <div className="hidden print:block bg-white text-black text-[12px] leading-relaxed p-8">
          <div className="border border-black">
            {/* Encabezado */}
            <div className="flex items-center justify-between border-b border-black px-4 py-2">
              <div className="text-[10px] leading-tight">
                <p className="font-bold">MINISTERIO DE SALUD</p>
                <p>GOBIERNO DE EL SALVADOR</p>
              </div>
              <div className="text-center">
                <p className="font-bold">HOSPITAL NACIONAL EL SALVADOR</p>
                <p className="font-bold">DEPARTAMENTO DE SERVICIOS GENERALES / TRANSPORTE</p>
                <p className="font-bold underline">SOLICITUD DE TRANSPORTE</p>
              </div>
              <div className="text-[10px] text-right leading-tight">
                <p className="font-bold">Folio</p>
                <p className="font-mono">{viaje.folio}</p>
              </div>
            </div>

            {/* Uso del área solicitante */}
            <div className="px-4 py-3 space-y-2.5">
              <p className="font-bold underline">USO DEL ÁREA SOLICITANTE:</p>
              <CampoPrint label="Departamento, Unidad y/o Servicio Solicitante" valor={viaje.area} />
              <CampoPrint label="Misión a Realizar" valor={viaje.mision} />
              <CampoPrint label="Nombre del personal que participa en la misión" valor={viaje.personal} />
              <CampoPrint label="Destino" valor={viaje.destinoTexto} />
              <div className="flex gap-6">
                <CampoPrint label="Fecha en que necesita el Transporte" valor={fmtFecha(viaje.fechaNecesita)} ancho="flex-1" />
                <CampoPrint label="Hora" valor={viaje.horaNecesita} ancho="w-48" />
              </div>
            </div>

            {/* Responsable de la solicitud */}
            <div className="px-4 py-3 space-y-2.5 border-t border-black">
              <p className="font-bold underline">RESPONSABLE DE SOLICITUD DE TRANSPORTE:</p>
              <div className="flex gap-6">
                <CampoPrint label="Nombre" valor={viaje.solicitanteNombre} ancho="flex-1" />
                <CampoPrint label="DUI" valor={viaje.solicitanteDui} ancho="w-56" />
              </div>
              <div className="flex gap-6">
                <CampoPrint label="Código de empleado" valor={viaje.solicitanteCodigoEmpleado} ancho="flex-1" />
                <CampoPrint label="Firma" valor="" ancho="w-64" />
              </div>
            </div>

            {/* Exclusivo para transporte */}
            <div className="px-4 py-3 space-y-2.5 border-t border-black">
              <p className="font-bold underline text-center">EXCLUSIVO PARA ÁREA DE TRANSPORTE — AUTORIZACIÓN PARA USO DE VEHÍCULO</p>
              <div className="flex gap-6">
                <CampoPrint label="Vehículo Asignado" valor={viaje.vehiculoNombre} ancho="flex-1" />
                <CampoPrint label="Motorista" valor={viaje.motoristaNombre} ancho="flex-1" />
              </div>
              <div className="flex gap-6">
                <CampoPrint label="Hora de salida" valor={viaje.horaSalida} ancho="flex-1" />
                <CampoPrint label="Kilometraje" valor={viaje.kmSalida} ancho="flex-1" />
              </div>
              <div className="flex gap-6">
                <CampoPrint label="Hora de entrada" valor={viaje.horaEntrada} ancho="flex-1" />
                <CampoPrint label="Kilometraje" valor={viaje.kmEntrada} ancho="flex-1" />
              </div>
              <div className="flex gap-6 pt-6">
                <CampoPrint label="Autorizado por" valor={viaje.autorizadoPorNombre} ancho="flex-1" />
                <CampoPrint label="Firma y sello" valor="" ancho="w-64" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
