"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarCheck, Loader2, Megaphone, PencilLine } from "lucide-react";
import {
  destinoDelLlamado,
  destinoEstacion,
  ETIQUETA_ESTADO,
  limpiarExpediente,
  nombreParaLlamado,
  type LlamadoPantalla,
} from "@/lib/consultaExterna/circuito";
import type { EstacionCEId } from "@/lib/consultaExterna/especialidades";
import { publicarLlamadoManual, quitarLlamadoDePantalla } from "@/lib/consultaExterna/estacionDatos";
import type { CitaCEConId } from "@/lib/consultaExterna/tipos";
import { SelectorConsultorio } from "@/components/consultaExterna/SelectorConsultorio";

// Llamado escrito a mano en la estación: la enfermera escribe el nombre (y el
// expediente, que es opcional) y lo manda a las pantallas, que lo llaman a
// esta estación (o al consultorio que ella elija). Sirve para
// el paciente que no está en la agenda del día (o un día sin agenda cargada).
// No mueve ninguna cita: quien sí tiene cita se llama desde su tarjeta, para
// que su atención quede registrada.
//
// Los llamados escritos hoy se guardan en este navegador para poder volver a
// llamarlos o quitarlos de la pantalla (p. ej. si el nombre salió mal escrito).

const MAX_RECIENTES = 15;

/** Lo que se guarda en este navegador: el llamado y el consultorio elegido, para "Volver a llamar". */
type Reciente = LlamadoPantalla & { consultorioElegido?: string };

const claveRecientes = (estacionId: EstacionCEId, fechaISO: string) => `ce:llamados-manuales:${estacionId}:${fechaISO}`;

function leerRecientes(clave: string): Reciente[] {
  try {
    const v = JSON.parse(localStorage.getItem(clave) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function guardarRecientes(clave: string, lista: Reciente[]) {
  try { localStorage.setItem(clave, JSON.stringify(lista)); } catch { /* sin almacenamiento */ }
}

const horaCorta = (ms: number) => new Date(ms).toLocaleTimeString("es-SV", { hour: "numeric", minute: "2-digit" });

const etiqueta = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300";
const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const btnPrincipal =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-600 dark:hover:bg-cyan-500";
const btnSecundario =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
const btnEnlace =
  "rounded px-1.5 py-1 text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline disabled:opacity-60 dark:text-slate-400 dark:hover:text-white";

interface Props {
  fechaISO: string;
  estacionId: EstacionCEId;
  /** Citas del día de la estación: avisan si el paciente sí tiene cita. */
  citas: CitaCEConId[];
  /** Consultorios de la agenda de hoy, para "Llamar a". */
  consultorios: string[];
  /** Quién atiende la estación; queda en el llamado. */
  porNombre: string;
}

export function LlamadoManual({ fechaISO, estacionId, citas, consultorios, porNombre }: Props) {
  const clave = claveRecientes(estacionId, fechaISO);
  const [expediente, setExpediente] = useState("");
  const [nombre, setNombre] = useState("");
  // Se conserva entre llamados: un día sin agenda, todos los de un médico van al mismo.
  const [consultorio, setConsultorio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [recientes, setRecientes] = useState<Reciente[]>([]);
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const refExpediente = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Llamados escritos hoy en este navegador (no existe en SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecientes(leerRecientes(clave));
  }, [clave]);

  const cambiarRecientes = (cambiar: (prev: Reciente[]) => Reciente[]) =>
    setRecientes((prev) => {
      const lista = cambiar(prev).slice(0, MAX_RECIENTES);
      guardarRecientes(clave, lista);
      return lista;
    });

  // "Estación Cardiología" → "estación Cardiología", para usarlo dentro de una frase.
  const aLaEstacion = destinoEstacion(estacionId).replace(/^E/, "e");
  const destino = destinoDelLlamado(estacionId, consultorio);
  const expLimpio = limpiarExpediente(expediente);
  const nombreVista = nombreParaLlamado(nombre);
  // El expediente es opcional; si se escribe, debe llevar números.
  const expedienteMal = expLimpio !== "" && !/\d/.test(expLimpio);
  const listo = nombreVista.length >= 3 && !expedienteMal;
  const enAgenda = expLimpio.length >= 3 ? citas.find((c) => limpiarExpediente(c.expediente) === expLimpio) : undefined;

  const marcar = (citaId: string, si: boolean) =>
    setOcupados((s) => {
      const n = new Set(s);
      if (si) n.add(citaId);
      else n.delete(citaId);
      return n;
    });

  const llamar = async (datos: { expediente: string; paciente: string; consultorio: string }) => {
    const l = await publicarLlamadoManual(fechaISO, { ...datos, estacionId }, porNombre);
    const reciente: Reciente = datos.consultorio.trim() ? { ...l, consultorioElegido: datos.consultorio } : l;
    cambiarRecientes((prev) => [reciente, ...prev.filter((r) => r.citaId !== l.citaId)]);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo || enviando) return;
    setError("");
    setEnviando(true);
    try {
      await llamar({ expediente: expLimpio, paciente: nombre, consultorio });
      setExpediente("");
      setNombre("");
      refExpediente.current?.focus();
    } catch (err) {
      console.error("No se pudo enviar el llamado a la pantalla", err);
      setError("No se pudo enviar a la pantalla. Revise la conexión e intente de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  // Al mismo lugar que la vez anterior.
  const volverALlamar = async (r: Reciente) => {
    setError("");
    marcar(r.citaId, true);
    try {
      await llamar({ expediente: r.expediente ?? "", paciente: r.paciente ?? "", consultorio: r.consultorioElegido ?? "" });
    } catch (err) {
      console.error("No se pudo volver a llamar", err);
      setError("No se pudo volver a llamar. Revise la conexión e intente de nuevo.");
    } finally {
      marcar(r.citaId, false);
    }
  };

  const quitar = async (r: Reciente) => {
    setError("");
    marcar(r.citaId, true);
    try {
      await quitarLlamadoDePantalla(fechaISO, r.citaId);
      cambiarRecientes((prev) => prev.filter((x) => x.citaId !== r.citaId));
    } catch (err) {
      console.error("No se pudo quitar el llamado de la pantalla", err);
      setError("No se pudo quitar de la pantalla. Revise la conexión e intente de nuevo.");
    } finally {
      marcar(r.citaId, false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-start gap-2.5">
        <PencilLine size={16} className="mt-0.5 flex-shrink-0 text-blue-600 dark:text-cyan-300" aria-hidden="true" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Llamar escribiendo los datos</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Para un paciente que no está en la agenda de hoy. La pantalla lo llama a la {aLaEstacion}, o al consultorio que elija.
            El expediente es opcional: sin él, se llama solo por el nombre.
          </p>
        </div>
      </div>

      <form onSubmit={enviar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <label className="block">
            <span className={etiqueta}>
              Expediente <span className="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
            </span>
            <input
              ref={refExpediente}
              value={expediente}
              onChange={(e) => setExpediente(e.target.value)}
              placeholder="Ej.: 11431-26"
              maxLength={20}
              autoComplete="off"
              className={`${campo} font-mono`}
            />
          </label>
          <label className="block">
            <span className={etiqueta}>Nombre del paciente</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombres y apellidos"
              maxLength={80}
              autoComplete="off"
              className={campo}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-60">
            <SelectorConsultorio
              valor={consultorio}
              onCambiar={setConsultorio}
              opciones={consultorios}
              estacion={destinoEstacion(estacionId)}
            />
          </div>
          <button type="submit" disabled={!listo || enviando} className={btnPrincipal}>
            {enviando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Megaphone size={16} aria-hidden="true" />}
            Llamar
          </button>
        </div>

        {enAgenda && (
          <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-cyan-100">
            <CalendarCheck size={15} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p>
                Tiene cita hoy: <strong>{enAgenda.paciente}</strong> · {enAgenda.medico} · {enAgenda.franjaInicio} ·{" "}
                {ETIQUETA_ESTADO[enAgenda.estado]}.
              </p>
              <p className="mt-0.5 text-blue-800/80 dark:text-cyan-100/80">Llámelo desde su tarjeta en la cola para que su atención quede registrada.</p>
            </div>
            {!nombre.trim() && (
              <button
                type="button"
                onClick={() => setNombre(nombreParaLlamado(enAgenda.paciente))}
                className="rounded-lg px-2 py-1 font-semibold text-blue-700 hover:bg-blue-100 dark:text-cyan-300 dark:hover:bg-blue-900/60"
              >
                Usar su nombre
              </button>
            )}
          </div>
        )}

        {(nombre.trim() || expediente.trim()) && (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            En pantalla:{" "}
            {expLimpio && !expedienteMal && (
              <>
                Exp. <span className="font-mono font-semibold text-slate-900 dark:text-white">{expLimpio}</span>
                {" · "}
              </>
            )}
            <strong className="text-slate-900 dark:text-white">{nombreVista || "—"}</strong>
            {!expLimpio && nombreVista && " (solo por nombre)"}
            {" · "}Acercarse a {destino.replace(/^[EC]/, (l) => l.toLowerCase())}
          </p>
        )}

        {expedienteMal && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            El expediente lleva números. Déjelo vacío para llamar solo por el nombre.
          </p>
        )}

        {error && (
          <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </form>

      {recientes.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Escritos hoy en este equipo</p>
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {recientes.map((r) => {
              const ocupado = ocupados.has(r.citaId);
              return (
                <li key={r.citaId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{r.paciente}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {r.expediente ? (
                        <>
                          Exp. <span className="font-mono">{r.expediente}</span>
                        </>
                      ) : (
                        "Solo por nombre"
                      )}
                      {" · "}{horaCorta(r.enMs)} · {r.destino}
                    </p>
                  </div>
                  <button type="button" disabled={ocupado} onClick={() => volverALlamar(r)} className={btnSecundario}>
                    {ocupado && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                    Volver a llamar
                  </button>
                  <button type="button" disabled={ocupado} onClick={() => quitar(r)} className={btnEnlace}>
                    Quitar de la pantalla
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
