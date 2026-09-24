"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp,
} from "@/lib/firestoreMeter";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { AdjuntoBitacora, EvaluacionPersonal } from "@/types";
import { TIPOS_EVALUACION_PERSONAL } from "@/lib/evaluacionesPersonal";
import {
  Paperclip, FilePlus2, Trash2, FileText, Loader2, X, ExternalLink, ImageOff, ClipboardCheck, Download, RefreshCw,
} from "lucide-react";

// Archivero permanente de evaluaciones/amonestaciones de un empleado ESDOMED
// (colección evaluaciones_personal). Solo el admin registra y elimina; el
// dueño del expediente (o el admin) puede consultarlo — las reglas de
// Firestore ya bloquean que un esdomed normal vea las de un compañero, así
// que este componente no necesita repetir esa verificación para leer, solo
// para decidir si muestra el formulario de carga.
//
// Los archivos van a Storage en evaluaciones_personal/{empleadoId}/… (carpeta
// del EVALUADO, no de quien sube), igual de PDF/imagen y 20 MB que el resto
// de adjuntos del sistema.

const MAX_ADJUNTOS = 5;
const MAX_BYTES = 20 * 1024 * 1024;

const nombreSeguro = (nombre: string) => nombre.replace(/[^\w.-]+/g, "_").slice(-120);

const tipoDeArchivo = (file: File): AdjuntoBitacora["tipo"] | null => {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (file.type.startsWith("image/")) return "imagen";
  return null;
};

const formatTamano = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatFecha = (d: Date) =>
  d.toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" });

const toDate = (v: unknown): Date => {
  const d = (v as { toDate?: () => Date })?.toDate?.() ?? new Date(v as string);
  return isNaN(d.getTime()) ? new Date() : d;
};

const hoyInput = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const subirAdjunto = (empleadoId: string, file: File, onBytes: (bytes: number) => void) => {
  const storagePath = `evaluaciones_personal/${empleadoId}/${Date.now()}_${nombreSeguro(file.name)}`;
  const tarea = uploadBytesResumable(storageRef(storage, storagePath), file, {
    contentType: file.type || (tipoDeArchivo(file) === "pdf" ? "application/pdf" : undefined),
  });
  return new Promise<AdjuntoBitacora>((resolve, reject) => {
    tarea.on("state_changed",
      (snap) => onBytes(snap.bytesTransferred),
      reject,
      async () => {
        try {
          resolve({
            url: await getDownloadURL(tarea.snapshot.ref),
            nombre: file.name,
            tipo: tipoDeArchivo(file) ?? "imagen",
            tamano: file.size,
            storagePath,
          });
        } catch (err) { reject(err); }
      });
  });
};

interface Props {
  empleadoId: string;
  empleadoNombre: string;
  /** Solo el admin registra y elimina entradas. */
  puedeGestionar: boolean;
}

export function EvaluacionesPersonal({ empleadoId, empleadoNombre, puedeGestionar }: Props) {
  const { user, profile } = useAuth();

  const [entradas, setEntradas] = useState<EvaluacionPersonal[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [tipo, setTipo] = useState("");
  const [fecha, setFecha] = useState(hoyInput());
  const [notas, setNotas] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [aBorrar, setABorrar] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Sin orderBy en la consulta: where + orderBy exige un índice compuesto
    // que no existe en el proyecto. Son pocas entradas por empleado, así que
    // se ordena aquí.
    const q = query(
      collection(db, "evaluaciones_personal"),
      where("empleadoId", "==", empleadoId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setErrorCarga(null);
        setEntradas(snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            fecha: toDate(data.fecha),
            creadoEn: toDate(data.creadoEn),
          } as EvaluacionPersonal;
        }).sort((a, b) => b.fecha.getTime() - a.fecha.getTime()));
      },
      (err) => {
        console.error("evaluaciones_personal:", err);
        setErrorCarga("No se pudo cargar el archivero de evaluaciones.");
      },
    );
    return unsub;
  }, [empleadoId]);

  const agregarArchivos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevos = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (!nuevos.length) return;
    setError(null);

    const rechazados: string[] = [];
    const validos = nuevos.filter((f) => {
      if (!tipoDeArchivo(f)) { rechazados.push(`${f.name} (solo PDF o imagen)`); return false; }
      if (f.size >= MAX_BYTES) { rechazados.push(`${f.name} (supera 20 MB)`); return false; }
      return true;
    });
    const espacio = MAX_ADJUNTOS - archivos.length;
    if (validos.length > espacio) rechazados.push(`solo caben ${MAX_ADJUNTOS} archivos por entrada`);
    setArchivos((prev) => [...prev, ...validos.slice(0, Math.max(0, espacio))]);
    if (rechazados.length) setError(`No se agregó: ${rechazados.join("; ")}.`);
  };

  const quitarArchivo = (idx: number) => setArchivos((prev) => prev.filter((_, i) => i !== idx));

  const puedeRegistrar = !subiendo && tipo.trim().length > 0 && fecha.length > 0;

  const registrar = async () => {
    if (!puedeRegistrar || !user || !profile) return;
    setSubiendo(true);
    setError(null);
    setProgreso(archivos.length ? 0 : null);

    const subidos: AdjuntoBitacora[] = [];
    try {
      const totalBytes = archivos.reduce((a, f) => a + f.size, 0);
      let acumulado = 0;
      for (const file of archivos) {
        subidos.push(await subirAdjunto(empleadoId, file,
          (bytes) => setProgreso(Math.round(((acumulado + bytes) / totalBytes) * 100))));
        acumulado += file.size;
      }

      const entrada: Record<string, unknown> = {
        empleadoId,
        empleadoNombre,
        tipo: tipo.trim(),
        fecha: Timestamp.fromDate(new Date(`${fecha}T00:00:00`)),
        registradaPorId: user.uid,
        registradaPorNombre: profile.nombre,
        creadoEn: serverTimestamp(),
      };
      if (notas.trim()) entrada.notas = notas.trim();
      if (subidos.length) entrada.archivos = subidos;

      await addDoc(collection(db, "evaluaciones_personal"), entrada);
      setTipo("");
      setNotas("");
      setFecha(hoyInput());
      setArchivos([]);
    } catch (err) {
      await Promise.all(subidos.map((a) => deleteObject(storageRef(storage, a.storagePath)).catch(() => {})));
      setError(err instanceof Error ? err.message : "No se pudo registrar la evaluación.");
    } finally {
      setSubiendo(false);
      setProgreso(null);
    }
  };

  const borrar = async (entrada: EvaluacionPersonal) => {
    if (!entrada.id) return;
    setBorrando(entrada.id);
    setError(null);
    try {
      await deleteDoc(doc(db, "evaluaciones_personal", entrada.id));
      await Promise.all((entrada.archivos ?? []).map((a) =>
        a.storagePath ? deleteObject(storageRef(storage, a.storagePath)).catch(() => {}) : Promise.resolve(),
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la evaluación.");
    } finally {
      setBorrando(null);
      setABorrar(null);
    }
  };

  // Cambia o quita UN adjunto de una entrada ya registrada. Solo toca el
  // arreglo `archivos`: tipo, fecha, notas y quién la registró se conservan.
  // El archivo viejo se borra de Storage solo después de guardar el documento.
  const cambiarAdjunto = async (entrada: EvaluacionPersonal, idx: number, nuevo: File | null) => {
    if (!entrada.id || !entrada.archivos) return;
    const viejo = entrada.archivos[idx];
    if (nuevo) {
      if (!tipoDeArchivo(nuevo)) throw new Error(`${nuevo.name}: solo PDF o imagen.`);
      if (nuevo.size >= MAX_BYTES) throw new Error(`${nuevo.name}: supera 20 MB.`);
    }
    let subido: AdjuntoBitacora | null = null;
    try {
      if (nuevo) subido = await subirAdjunto(empleadoId, nuevo, () => {});
      const archivosNuevos = entrada.archivos.flatMap((a, i) => (i !== idx ? [a] : subido ? [subido] : []));
      await updateDoc(doc(db, "evaluaciones_personal", entrada.id), { archivos: archivosNuevos });
      if (viejo?.storagePath) await deleteObject(storageRef(storage, viejo.storagePath)).catch(() => {});
    } catch (err) {
      if (subido) await deleteObject(storageRef(storage, subido.storagePath)).catch(() => {});
      throw err; // lo muestra la tarjeta del adjunto
    }
  };

  return (
    <div className="space-y-4">
      {puedeGestionar && (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 p-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Tipo</label>
              <input
                list="tipos-evaluacion-personal"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                disabled={subiendo}
                placeholder="Ej. Norma Técnica de Hechos Vitales"
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <datalist id="tipos-evaluacion-personal">
                {TIPOS_EVALUACION_PERSONAL.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={subiendo}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              disabled={subiendo}
              rows={2}
              placeholder="Observaciones, resultado, contexto…"
              className="w-full resize-y min-h-[56px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          {archivos.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {archivos.map((f, i) => (
                <li key={`${f.name}-${i}`}
                  className="flex items-center gap-1.5 max-w-full pl-2 pr-1 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300">
                  {tipoDeArchivo(f) === "pdf" ? <FileText size={12} className="shrink-0 text-blue-600 dark:text-blue-400" /> : <Paperclip size={12} className="shrink-0 text-blue-600 dark:text-blue-400" />}
                  <span className="truncate max-w-[200px]">{f.name}</span>
                  <span className="text-slate-400 shrink-0">{formatTamano(f.size)}</span>
                  <button type="button" onClick={() => quitarArchivo(i)} disabled={subiendo}
                    className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 disabled:opacity-50" aria-label="Quitar archivo">
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {progreso !== null && (
            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progreso}%` }} />
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" multiple accept="application/pdf,image/*" onChange={agregarArchivos} className="hidden" />
              <button type="button" onClick={() => fileRef.current?.click()}
                disabled={subiendo || archivos.length >= MAX_ADJUNTOS}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <Paperclip size={13} /> Adjuntar
                <span className="font-normal text-slate-400">{archivos.length}/{MAX_ADJUNTOS}</span>
              </button>
              <span className="text-[11px] text-slate-400 hidden sm:inline">PDF o imagen · máx. 20 MB c/u</span>
            </div>
            <button type="button" onClick={registrar} disabled={!puedeRegistrar}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
              {subiendo ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}
              {subiendo ? (progreso !== null ? `Subiendo ${progreso}%` : "Registrando…") : "Registrar"}
            </button>
          </div>

          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      )}

      {errorCarga ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">{errorCarga}</p>
      ) : entradas === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" /> Cargando…
        </div>
      ) : entradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <ClipboardCheck size={28} className="text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-500">Sin evaluaciones registradas</p>
          <p className="text-xs text-slate-400 max-w-xs">
            {puedeGestionar
              ? "Las evaluaciones y amonestaciones que registres aquí quedan permanentes en el expediente."
              : "Aquí verás las evaluaciones y amonestaciones que ESDOMED registre en tu expediente."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entradas.map((e) => (
            <li key={e.id} className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                      {e.tipo}
                    </span>
                    <span className="text-xs text-slate-400">{formatFecha(e.fecha)}</span>
                  </div>
                  {e.notas && (
                    <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{e.notas}</p>
                  )}
                  <p className="mt-1.5 text-[11px] text-slate-400">Registrado por {e.registradaPorNombre}</p>
                </div>
                {puedeGestionar && e.id && (
                  aBorrar === e.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-slate-500">¿Eliminar?</span>
                      <button type="button" onClick={() => borrar(e)} disabled={borrando === e.id}
                        className="px-2 py-0.5 text-xs font-semibold rounded-md text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50">
                        {borrando === e.id ? "…" : "Sí"}
                      </button>
                      <button type="button" onClick={() => setABorrar(null)} disabled={borrando === e.id}
                        className="px-2 py-0.5 text-xs font-semibold rounded-md text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700">
                        No
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setABorrar(e.id!)}
                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors shrink-0"
                      aria-label="Eliminar evaluación">
                      <Trash2 size={14} />
                    </button>
                  )
                )}
              </div>

              {!!e.archivos?.length && (
                <ul className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {e.archivos.map((a, i) => (
                    <AdjuntoCard key={`${a.url}-${i}`} adjunto={a} entradaId={e.id!} indice={i}
                      puedeGestionar={puedeGestionar}
                      onReemplazar={(f) => cambiarAdjunto(e, i, f)}
                      onQuitar={() => cambiarAdjunto(e, i, null)} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Miniatura con el visor de PDF del navegador: sin barra ni panel lateral,
// ajustado al ancho. Storage no manda CORS, así que no se puede rasterizar con
// pdfjs; un iframe no lo necesita. El iframe es más ancho que la tarjeta para
// esconder la barra de desplazamiento.
const urlMiniaturaPdf = (url: string) => `${url}#toolbar=0&navpanes=0&view=FitH`;

// Pide a la API una URL firmada que fuerza la descarga (ver
// api/evaluaciones-personal/[id]/descargar).
async function descargarAdjunto(entradaId: string, indice: number) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`/api/evaluaciones-personal/${entradaId}/descargar?i=${indice}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) throw new Error(body.error || "No se pudo descargar el archivo.");
  window.location.href = body.url;
}

interface AdjuntoCardProps {
  adjunto: AdjuntoBitacora;
  entradaId: string;
  indice: number;
  puedeGestionar: boolean;
  onReemplazar: (file: File) => Promise<void>;
  onQuitar: () => Promise<void>;
}

function AdjuntoCard({ adjunto, entradaId, indice, puedeGestionar, onReemplazar, onQuitar }: AdjuntoCardProps) {
  const [imgError, setImgError] = useState(false);
  const [ocupado, setOcupado] = useState<null | "descargar" | "reemplazar" | "quitar">(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const reemplazoRef = useRef<HTMLInputElement>(null);
  const esImagen = adjunto.tipo === "imagen" && !imgError;

  const ejecutar = async (accion: "descargar" | "reemplazar" | "quitar", fn: () => Promise<void>) => {
    setOcupado(accion);
    setErrorDescarga(null);
    try { await fn(); }
    catch (err) { setErrorDescarga(err instanceof Error ? err.message : "No se pudo completar la acción."); }
    finally { setOcupado(null); setConfirmarQuitar(false); }
  };

  const elegirReemplazo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (reemplazoRef.current) reemplazoRef.current.value = "";
    if (file) ejecutar("reemplazar", () => onReemplazar(file));
  };

  const boton = "flex items-center justify-center gap-1 px-1.5 py-1 text-[11px] font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <li className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800/60">
      <a href={adjunto.url} target="_blank" rel="noopener noreferrer" title={`Abrir ${adjunto.nombre} en otra pestaña`}
        className="group block hover:opacity-90 transition-opacity">
        {esImagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={adjunto.url} alt={adjunto.nombre} loading="lazy" onError={() => setImgError(true)}
            className="w-full h-40 object-cover bg-slate-100 dark:bg-slate-800" />
        ) : adjunto.tipo === "pdf" ? (
          // Si el navegador no incrusta PDFs (algunos móviles), queda visible el ícono de atrás.
          <div className="relative w-full h-40 overflow-hidden bg-white">
            <div className="absolute inset-0 flex items-center justify-center text-blue-600">
              <FileText size={28} />
            </div>
            <iframe src={urlMiniaturaPdf(adjunto.url)} title={adjunto.nombre} loading="lazy" tabIndex={-1}
              className="relative h-full w-[calc(100%+20px)] pointer-events-none border-0" />
          </div>
        ) : (
          <div className="w-full h-40 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <ImageOff size={28} />
          </div>
        )}
        <div className="px-2 py-1.5 flex items-center gap-1.5 border-t border-slate-200 dark:border-slate-700">
          <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate flex-1">{adjunto.nombre}</span>
          <span className="text-[10px] text-slate-400 shrink-0">{formatTamano(adjunto.tamano)}</span>
        </div>
      </a>

      <div className="flex gap-1 px-1.5 pb-1.5">
        <a href={adjunto.url} target="_blank" rel="noopener noreferrer"
          className={`${boton} flex-1 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950`}>
          <ExternalLink size={12} /> Ver
        </a>
        <button type="button" disabled={!!ocupado}
          onClick={() => ejecutar("descargar", () => descargarAdjunto(entradaId, indice))}
          className={`${boton} flex-1 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950`}>
          {ocupado === "descargar" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Descargar
        </button>
      </div>

      {puedeGestionar && (
        <div className="flex gap-1 px-1.5 pb-1.5">
          <input ref={reemplazoRef} type="file" accept="application/pdf,image/*" onChange={elegirReemplazo} className="hidden" />
          {confirmarQuitar ? (
            <>
              <span className="flex-1 self-center text-[11px] text-slate-500 text-center">¿Quitar archivo?</span>
              <button type="button" disabled={!!ocupado} onClick={() => ejecutar("quitar", onQuitar)}
                className={`${boton} text-white bg-rose-600 hover:bg-rose-500`}>
                {ocupado === "quitar" ? "…" : "Sí"}
              </button>
              <button type="button" disabled={!!ocupado} onClick={() => setConfirmarQuitar(false)}
                className={`${boton} text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700`}>
                No
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={!!ocupado} onClick={() => reemplazoRef.current?.click()}
                title="Subir el archivo correcto en lugar de este (se conservan fecha y notas)"
                className={`${boton} flex-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800`}>
                {ocupado === "reemplazar" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Reemplazar
              </button>
              <button type="button" disabled={!!ocupado} onClick={() => setConfirmarQuitar(true)}
                className={`${boton} flex-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950`}>
                <Trash2 size={12} /> Quitar
              </button>
            </>
          )}
        </div>
      )}

      {errorDescarga && <p className="px-2 pb-1.5 text-[11px] text-rose-600 dark:text-rose-400">{errorDescarga}</p>}
    </li>
  );
}
