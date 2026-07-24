"use client";

import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { doc, deleteDoc, serverTimestamp, updateDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { fechaCuidadosCriticos } from "@/lib/fechasCuidadosCriticos";
import { aplicarCalculosBasicos, camposMatrizPorTipo, fichaPendienteCierreCuidadosCriticos, VALOR_NO_REGISTRADO, valorComoTexto, type DatosMatrizCuidadosCriticos } from "@/lib/matrizCuidadosCriticos";
import type { FichaCuidadosCriticos, TipoMedicoCuidadosCriticos } from "@/types";

interface Props {
  tipo?: TipoMedicoCuidadosCriticos;
  datos?: DatosMatrizCuidadosCriticos;
  fichas?: FichaCuidadosCriticos[];
  expedienteHref?: (ficha: FichaCuidadosCriticos) => string | undefined;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshLabel?: string;
  // Se pasan solo cuando la pantalla que envuelve este lienzo quiere permitir
  // eliminar/solicitar eliminación de fichas (dashboard admin y "Mis registros"
  // del médico). Si se omiten, la columna de acciones no se muestra.
  onFichaEliminada?: (id: string) => void;
  onFichaActualizada?: (ficha: FichaCuidadosCriticos) => void;
}

const PAGE_SIZE_OPTIONS = [100, 200, 300] as const;
const DEFAULT_PAGE_SIZE = 200;

export function LienzoMatrizCuidadosCriticos({
  tipo = "ucin",
  datos,
  fichas,
  expedienteHref,
  onRefresh,
  refreshing = false,
  refreshLabel = "Actualizar matriz",
  onFichaEliminada,
  onFichaActualizada,
}: Props) {
  const { user, profile } = useAuth();
  const puedeGestionarAcciones = Boolean((onFichaEliminada || onFichaActualizada) && (profile?.role === "admin" || profile?.role === "medico"));
  const [modoAcciones, setModoAcciones] = useState(false);
  const mostrarAcciones = puedeGestionarAcciones && modoAcciones;
  const [exportando, setExportando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const campos = useMemo(() => camposMatrizPorTipo(tipo), [tipo]);
  const fichasOriginales = useMemo(
    () => fichas ?? (datos ? [{ id: "vista", datos } as FichaCuidadosCriticos] : []),
    [datos, fichas],
  );
  const filas = useMemo(() => fichasOriginales.map(ficha => ({
    ...ficha,
    datos: aplicarCalculosBasicos(ficha.datos ?? {}),
  })), [fichasOriginales]);
  const busquedaNormalizada = normalizarBusqueda(busqueda);
  const filasFiltradas = useMemo(() => {
    if (!busquedaNormalizada) return filas;
    return filas.filter(fila => textoBusquedaFila(fila, campos).includes(busquedaNormalizada));
  }, [busquedaNormalizada, campos, filas]);
  const totalPaginas = Math.max(1, Math.ceil(filasFiltradas.length / pageSize));
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * pageSize;
  const fin = Math.min(inicio + pageSize, filasFiltradas.length);
  const filasPagina = filasFiltradas.slice(inicio, fin);

  useEffect(() => {
    setPagina(1);
  }, [busquedaNormalizada, pageSize]);

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const exportarExcel = async () => {
    if (filasFiltradas.length === 0 || exportando) return;

    try {
      setExportando(true);
      const XLSX = await import("xlsx");
      const registros = filasFiltradas.map(fila =>
        Object.fromEntries(campos.map(campo => [campo.label, valorCampo(fila, campo.key)]))
      );
      const hoja = XLSX.utils.json_to_sheet(registros);
      hoja["!cols"] = campos.map(campo => ({ wch: Math.min(Math.max(campo.label.length + 2, 14), 38) }));

      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, "Matriz UCI UCIN");
      XLSX.writeFile(libro, `matriz-${tipo}-${fechaArchivo()}.xlsx`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-64 flex-1">
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400" htmlFor="buscar-matriz-cuidados">
            Buscar en matriz
          </label>
          <div className="relative max-w-xl">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="buscar-matriz-cuidados"
              value={busqueda}
              onChange={event => setBusqueda(event.target.value)}
              placeholder="Expediente, nombre, servicio, diagnostico o cualquier dato..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pl-9 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title={refreshLabel}
              aria-label={refreshLabel}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-300"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </button>
          )}

          <button
            type="button"
            onClick={exportarExcel}
            disabled={filasFiltradas.length === 0 || exportando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download size={14} />
            {exportando ? "Generando..." : "Descargar Excel"}
          </button>

          {puedeGestionarAcciones && (
            <button
              type="button"
              onClick={() => setModoAcciones(prev => !prev)}
              title={modoAcciones ? "Ocultar acciones de eliminación" : "Mostrar acciones de eliminación"}
              aria-pressed={modoAcciones}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                modoAcciones
                  ? "border-rose-600 bg-rose-600 text-white hover:bg-rose-500"
                  : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Trash2 size={14} />
              Eliminar
            </button>
          )}
        </div>
      </div>

      <div className="scrollbar-matriz-cuidados overflow-x-auto">
        <table className="min-w-max border-collapse text-xs">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              {mostrarAcciones && (
                <th className="sticky left-0 z-20 w-10 bg-white px-1 py-2 dark:bg-slate-900" aria-hidden="true" />
              )}
              {campos.map((campo, campoIndex) => {
                const esPrimera = campoIndex === 0;
                const esUltima = campoIndex === campos.length - 1;
                return (
                  <th
                    key={campo.key}
                    className={`max-w-56 border-t border-r border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 ${
                      esPrimera ? "border-l rounded-tl-xl" : ""
                    } ${esUltima ? "rounded-tr-xl" : ""}`}
                  >
                    {campo.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filasPagina.map((fila, index) => {
              const esUltimaFila = index === filasPagina.length - 1;
              return (
              <tr key={fila.id ?? `fila-${inicio + index}`}>
                {mostrarAcciones && (
                  <td className="sticky left-0 z-10 w-10 bg-white px-1 py-2 align-top dark:bg-slate-900">
                    {profile?.role === "admin" ? (
                      <AccionesAdmin ficha={fila} onEliminada={onFichaEliminada} onActualizada={onFichaActualizada} />
                    ) : profile?.role === "medico" ? (
                      <AccionesMedico ficha={fila} uid={user?.uid} nombre={profile?.nombre} onActualizada={onFichaActualizada} />
                    ) : null}
                  </td>
                )}
                {campos.map((campo, campoIndex) => {
                  const valor = valorCampo(fila, campo.key);
                  const href = campo.key === "registro" ? expedienteHref?.(fila) : undefined;
                  const expedientePendiente = href && fichaPendienteCierreCuidadosCriticos(fila);
                  const esPrimera = campoIndex === 0;
                  const esUltima = campoIndex === campos.length - 1;
                  return (
                    <td
                      key={campo.key}
                      className={`max-w-56 border-r border-t border-slate-200 bg-white px-3 py-2 align-top text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 ${
                        esPrimera ? `border-l${esUltimaFila ? " rounded-bl-xl" : ""}` : ""
                      } ${esUltima && esUltimaFila ? "rounded-br-xl" : ""}`}
                    >
                      {href ? (
                        <Link prefetch={false}
                          href={href}
                          className={`block max-h-20 overflow-hidden whitespace-pre-wrap font-semibold underline-offset-2 hover:underline ${
                            expedientePendiente
                              ? "text-rose-500 dark:text-rose-300"
                              : "text-blue-600 dark:text-blue-300"
                          }`}
                        >
                          {valor}
                        </Link>
                      ) : (
                        <span className="block max-h-20 overflow-hidden whitespace-pre-wrap">{valor}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
              );
            })}
            {filasFiltradas.length === 0 && (
              <tr>
                <td colSpan={campos.length + (mostrarAcciones ? 1 : 0)} className="rounded-b-xl border-x border-b border-t border-slate-200 bg-white px-4 py-8 text-center text-slate-400 dark:border-slate-700 dark:bg-slate-900">
                  {filas.length === 0 ? "Aun no hay fichas registradas." : "No hay filas que coincidan con la busqueda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Filas
          <select
            value={pageSize}
            onChange={event => setPageSize(Number(event.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            {PAGE_SIZE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>

        <Paginacion
          pagina={paginaActual}
          totalPaginas={totalPaginas}
          inicio={filasFiltradas.length === 0 ? 0 : inicio + 1}
          fin={fin}
          total={filasFiltradas.length}
          totalOriginal={filas.length}
          onAnterior={() => setPagina(actual => Math.max(1, actual - 1))}
          onSiguiente={() => setPagina(actual => Math.min(totalPaginas, actual + 1))}
        />
      </div>
    </div>
  );
}

function Paginacion({
  pagina,
  totalPaginas,
  inicio,
  fin,
  total,
  totalOriginal,
  onAnterior,
  onSiguiente,
}: {
  pagina: number;
  totalPaginas: number;
  inicio: number;
  fin: number;
  total: number;
  totalOriginal: number;
  onAnterior: () => void;
  onSiguiente: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span className="whitespace-nowrap">
        {inicio}-{fin} de {total}{total !== totalOriginal ? ` filtradas (${totalOriginal} total)` : ""}
      </span>
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
        <button
          type="button"
          onClick={onAnterior}
          disabled={pagina <= 1}
          className="inline-flex h-8 w-8 items-center justify-center text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Pagina anterior"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="inline-flex h-8 min-w-20 items-center justify-center border-x border-slate-300 px-2 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
          {pagina} / {totalPaginas}
        </span>
        <button
          type="button"
          onClick={onSiguiente}
          disabled={pagina >= totalPaginas}
          className="inline-flex h-8 w-8 items-center justify-center text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Pagina siguiente"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ─── Admin: eliminar directo, o revisar/aprobar/rechazar una solicitud ───────

function AccionesAdmin({
  ficha,
  onEliminada,
  onActualizada,
}: {
  ficha: FichaCuidadosCriticos;
  onEliminada?: (id: string) => void;
  onActualizada?: (ficha: FichaCuidadosCriticos) => void;
}) {
  const { user, profile } = useAuth();
  const [modal, setModal] = useState<"cerrado" | "confirmar" | "revisar">("cerrado");
  const [confirmacion, setConfirmacion] = useState("");
  const [notaRechazo, setNotaRechazo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const solicitud = ficha.solicitudEliminacion;
  const pendiente = solicitud?.estado === "pendiente";
  const fechaSolicitud = solicitud ? fechaCuidadosCriticos(solicitud.solicitadoEn) : null;
  const puedeConfirmarDirecto = confirmacion.trim() === ficha.pacienteExpediente;

  const cerrar = () => {
    setModal("cerrado");
    setConfirmacion("");
    setNotaRechazo("");
    setError(null);
  };

  const eliminar = async () => {
    if (!ficha.id) return;
    setProcesando(true);
    setError(null);
    try {
      await deleteDoc(doc(db, "fichas_cuidados_criticos", ficha.id));
      onEliminada?.(ficha.id);
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar la ficha.");
      setProcesando(false);
    }
  };

  const rechazar = async () => {
    if (!ficha.id || !user || !profile || !solicitud) return;
    setProcesando(true);
    setError(null);
    try {
      await updateDoc(doc(db, "fichas_cuidados_criticos", ficha.id), {
        solicitudEliminacion: {
          ...solicitud,
          estado: "rechazada",
          resueltoPorId: user.uid,
          resueltoPorNombre: profile.nombre,
          resueltoEn: serverTimestamp(),
          notaRechazo: notaRechazo.trim() || null,
        },
        actualizadoPorId: user.uid,
        actualizadoPorNombre: profile.nombre,
        actualizadoEn: serverTimestamp(),
      });
      onActualizada?.({
        ...ficha,
        solicitudEliminacion: {
          ...solicitud,
          estado: "rechazada",
          resueltoPorId: user.uid,
          resueltoPorNombre: profile.nombre,
          resueltoEn: new Date(),
          notaRechazo: notaRechazo.trim() || undefined,
        },
        actualizadoPorId: user.uid,
        actualizadoPorNombre: profile.nombre,
        actualizadoEn: new Date(),
      });
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo rechazar la solicitud.");
      setProcesando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setModal(pendiente ? "revisar" : "confirmar")}
        title={pendiente ? `Solicitud de eliminación pendiente: ${solicitud?.motivo}` : "Eliminar ficha"}
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
          pendiente
            ? "border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
            : "border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-400"
        }`}
      >
        <Trash2 size={13} />
      </button>

      {modal !== "cerrado" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${modal === "revisar" ? "bg-amber-100 dark:bg-amber-950" : "bg-rose-100 dark:bg-rose-950"}`}>
                <AlertTriangle size={18} className={modal === "revisar" ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"} />
              </div>
              <div className="min-w-0">
                <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-slate-100">
                  {modal === "revisar" ? "Solicitud de eliminación" : "Eliminar ficha UCI/UCIN"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Expediente <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{ficha.pacienteExpediente}</span> — {ficha.pacienteNombre}
                </p>
              </div>
            </div>

            {modal === "revisar" && solicitud ? (
              <>
                <div className="mb-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm dark:border-amber-900 dark:bg-amber-950/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Motivo de {solicitud.solicitadoPorNombre}{fechaSolicitud ? ` · ${fechaSolicitud.toLocaleDateString("es-SV")}` : ""}
                  </p>
                  <p className="text-slate-700 dark:text-slate-300">{solicitud.motivo}</p>
                </div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Nota al rechazar (opcional)
                </label>
                <textarea
                  value={notaRechazo}
                  onChange={e => setNotaRechazo(e.target.value)}
                  rows={2}
                  placeholder="Por que no procede la eliminacion..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-slate-700 dark:bg-slate-800"
                />
                {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button onClick={cerrar} disabled={procesando} className="rounded-lg px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800">
                    Cancelar
                  </button>
                  <button
                    onClick={rechazar}
                    disabled={procesando}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Rechazar solicitud
                  </button>
                  <button
                    onClick={eliminar}
                    disabled={procesando}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {procesando ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Aprobar y eliminar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  Esta accion es permanente y borra el registro completo de la matriz UCI/UCIN, no solo su cierre.
                </div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Escribe el expediente <span className="font-mono text-slate-700 dark:text-slate-300">{ficha.pacienteExpediente}</span> para confirmar
                </label>
                <input
                  type="text"
                  value={confirmacion}
                  onChange={e => setConfirmacion(e.target.value)}
                  autoFocus
                  placeholder={ficha.pacienteExpediente}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/40 dark:border-slate-700 dark:bg-slate-800"
                />
                {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button onClick={cerrar} disabled={procesando} className="rounded-lg px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800">
                    Cancelar
                  </button>
                  <button
                    onClick={eliminar}
                    disabled={!puedeConfirmarDirecto || procesando}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {procesando ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Eliminar ficha
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Médico autor: solicitar eliminación de su propia ficha ─────────────────

function AccionesMedico({
  ficha,
  uid,
  nombre,
  onActualizada,
}: {
  ficha: FichaCuidadosCriticos;
  uid?: string;
  nombre?: string;
  onActualizada?: (ficha: FichaCuidadosCriticos) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ficha.creadoPorId !== uid) {
    return <span className="inline-block h-7 w-7 shrink-0" aria-hidden="true" />;
  }

  const solicitud = ficha.solicitudEliminacion;
  const pendiente = solicitud?.estado === "pendiente";
  const rechazada = solicitud?.estado === "rechazada";
  const interactivo = !pendiente;

  const enviar = async () => {
    if (!ficha.id || !uid || !nombre || !motivo.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      await updateDoc(doc(db, "fichas_cuidados_criticos", ficha.id), {
        solicitudEliminacion: {
          motivo: motivo.trim(),
          solicitadoPorId: uid,
          solicitadoPorNombre: nombre,
          solicitadoEn: serverTimestamp(),
          estado: "pendiente",
        },
        actualizadoPorId: uid,
        actualizadoPorNombre: nombre,
        actualizadoEn: serverTimestamp(),
      });
      onActualizada?.({
        ...ficha,
        solicitudEliminacion: {
          motivo: motivo.trim(),
          solicitadoPorId: uid,
          solicitadoPorNombre: nombre,
          solicitadoEn: new Date(),
          estado: "pendiente",
        },
        actualizadoPorId: uid,
        actualizadoPorNombre: nombre,
        actualizadoEn: new Date(),
      });
      setAbierto(false);
      setMotivo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la solicitud.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => interactivo && setAbierto(true)}
        disabled={!interactivo}
        title={
          pendiente
            ? `Solicitud enviada, pendiente de revision: ${solicitud?.motivo}`
            : rechazada
              ? `Solicitud anterior rechazada${solicitud?.notaRechazo ? `: ${solicitud.notaRechazo}` : ""}. Click para volver a solicitar.`
              : "Solicitar eliminación"
        }
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
          pendiente
            ? "border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
            : "border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-400"
        }`}
      >
        <Trash2 size={13} />
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950">
                <AlertTriangle size={18} className="text-rose-600 dark:text-rose-400" />
              </div>
              <div className="min-w-0">
                <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-slate-100">
                  Solicitar eliminación de esta ficha
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Expediente <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{ficha.pacienteExpediente}</span> — {ficha.pacienteNombre}. Un administrador revisa el motivo antes de borrarla.
                </p>
              </div>
            </div>

            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Motivo <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Por que se debe eliminar este registro (ej. se ingreso por error, expediente duplicado...)"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/40 dark:border-slate-700 dark:bg-slate-800"
            />
            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => { setAbierto(false); setMotivo(""); setError(null); }}
                disabled={enviando}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={enviar}
                disabled={!motivo.trim() || enviando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {enviando ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Enviar solicitud
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function valorCampo(fila: FichaCuidadosCriticos, key: string) {
  const directo = valorComoTexto(fila.datos?.[key]);
  if (directo) return directo;
  if (key === "registro") return fila.pacienteExpediente;
  if (key === "nombres") return fila.pacienteNombre.split(",").slice(1).join(",").trim();
  if (key === "apellidos") return fila.pacienteNombre.split(",")[0]?.trim() ?? "";
  return VALOR_NO_REGISTRADO;
}

function textoBusquedaFila(fila: FichaCuidadosCriticos, campos: ReturnType<typeof camposMatrizPorTipo>) {
  const valores = campos.map(campo => valorCampo(fila, campo.key));
  valores.push(fila.pacienteExpediente, fila.pacienteNombre, fila.servicio, fila.cama ?? "");
  return normalizarBusqueda(valores.join(" "));
}

function normalizarBusqueda(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function fechaArchivo() {
  return new Date().toISOString().slice(0, 10);
}
