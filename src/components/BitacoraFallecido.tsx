"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection, query, orderBy, limit, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp,
} from "@/lib/firestoreMeter";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { AdjuntoBitacora, EntradaBitacoraFallecido, UserRole } from "@/types";
import {
  Paperclip, Send, Trash2, FileText, Loader2, X, Lock, MessageSquareText, ExternalLink, ImageOff,
} from "lucide-react";

// Bitácora interna del caso de un fallecido (solo ESDOMED / admin). Vive en la
// subcolección notificaciones_fallecidos/{id}/bitacora: el documento padre no
// cambia (lo leen médicos, Psic./T.S., recepciones y productividad) y las reglas
// de la subcolección limitan la lectura a ESDOMED/admin. Las entradas son
// inmutables: se agregan y, a lo sumo, las borra su autor o un admin.
//
// Los archivos van a Storage en fallecidos_bitacora/{uid}/… (carpeta propia,
// igual que impresiones/trámites/CONAPINA). Solo PDF e imágenes, hasta 20 MB,
// máximo 5 por entrada.

const MAX_ADJUNTOS = 5;
const MAX_BYTES = 20 * 1024 * 1024;
// Ventana de lectura: las entradas más recientes de este caso. Un caso rara vez
// pasa de unas decenas; el tope solo evita que un listener crezca sin control.
const MAX_ENTRADAS = 200;

const ROL_LABEL: Partial<Record<UserRole, string>> = {
  esdomed: "ESDOMED",
  asistente_esdomed: "Asistente ESDOMED",
  admin: "Admin",
};

const tsToDate = (ts: unknown): Date | null => {
  if (!ts) return null;
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return isNaN(d.getTime()) ? null : d;
};
const formatFechaHora = (ts: unknown) => {
  const d = tsToDate(ts);
  return d
    ? d.toLocaleString("es-HN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : "ahora";
};
const formatTamano = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Nombre seguro para la ruta de Storage (el nombre original se conserva en el doc).
const nombreSeguro = (nombre: string) => nombre.replace(/[^\w.-]+/g, "_").slice(-120);

const tipoDeArchivo = (file: File): AdjuntoBitacora["tipo"] | null => {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (file.type.startsWith("image/")) return "imagen";
  return null;
};

const iniciales = (nombre: string) =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");

interface Props {
  notificacionId: string;
  /** Trámite cerrado (solo lectura en las demás pestañas). La bitácora sigue
   *  abierta para dejar constancia posterior; solo se avisa. */
  tramiteCerrado?: boolean;
}

export function BitacoraFallecido({ notificacionId, tramiteCerrado }: Props) {
  const { user, profile } = useAuth();

  const [entradas, setEntradas] = useState<EntradaBitacoraFallecido[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [texto, setTexto] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [aBorrar, setABorrar] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  // La página monta este componente con key={notificacionId}: al cambiar de caso
  // se remonta y el borrador, la lista y los errores arrancan limpios sin
  // reinicios manuales dentro de efectos.
  useEffect(() => {
    const q = query(
      collection(db, "notificaciones_fallecidos", notificacionId, "bitacora"),
      orderBy("creadoEn", "desc"),
      limit(MAX_ENTRADAS),
    );
    const unsub = onSnapshot(
      q,
      snap => setEntradas(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<EntradaBitacoraFallecido, "id">) }))),
      () => setErrorCarga("No se pudo cargar la bitácora."),
    );
    return unsub;
  }, [notificacionId]);

  const agregarArchivos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevos = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (!nuevos.length) return;
    setError(null);

    const rechazados: string[] = [];
    const validos = nuevos.filter(f => {
      if (!tipoDeArchivo(f)) { rechazados.push(`${f.name} (solo PDF o imagen)`); return false; }
      if (f.size >= MAX_BYTES) { rechazados.push(`${f.name} (supera 20 MB)`); return false; }
      return true;
    });
    const espacio = MAX_ADJUNTOS - archivos.length;
    if (validos.length > espacio) {
      rechazados.push(`solo caben ${MAX_ADJUNTOS} archivos por entrada`);
    }
    setArchivos(prev => [...prev, ...validos.slice(0, Math.max(0, espacio))]);
    if (rechazados.length) setError(`No se agregó: ${rechazados.join("; ")}.`);
  };

  const quitarArchivo = (idx: number) => setArchivos(prev => prev.filter((_, i) => i !== idx));

  const puedeRegistrar = !subiendo && (texto.trim().length > 0 || archivos.length > 0);

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
        const storagePath = `fallecidos_bitacora/${user.uid}/${Date.now()}_${nombreSeguro(file.name)}`;
        const tarea = uploadBytesResumable(storageRef(storage, storagePath), file, {
          contentType: file.type || (tipoDeArchivo(file) === "pdf" ? "application/pdf" : undefined),
        });
        await new Promise<void>((resolve, reject) => {
          tarea.on("state_changed",
            snap => setProgreso(Math.round(((acumulado + snap.bytesTransferred) / totalBytes) * 100)),
            reject,
            async () => {
              try {
                subidos.push({
                  url: await getDownloadURL(tarea.snapshot.ref),
                  nombre: file.name,
                  tipo: tipoDeArchivo(file) ?? "imagen",
                  tamano: file.size,
                  storagePath,
                });
                acumulado += file.size;
                resolve();
              } catch (err) { reject(err); }
            });
        });
      }

      const entrada: Omit<EntradaBitacoraFallecido, "id" | "creadoEn"> & { creadoEn: unknown } = {
        autorUid: user.uid,
        autorNombre: profile.nombre,
        autorRol: profile.role,
        // serverTimestamp: las reglas exigen creadoEn == request.time (no se antedata).
        creadoEn: serverTimestamp(),
      };
      if (texto.trim()) entrada.texto = texto.trim();
      if (subidos.length) entrada.adjuntos = subidos;

      await addDoc(collection(db, "notificaciones_fallecidos", notificacionId, "bitacora"), entrada);
      setTexto("");
      setArchivos([]);
    } catch (err) {
      // Si falló el registro después de subir archivos, se intentan retirar para
      // no dejar objetos huérfanos en Storage.
      await Promise.all(subidos.map(a => deleteObject(storageRef(storage, a.storagePath)).catch(() => {})));
      setError(err instanceof Error ? err.message : "No se pudo registrar la entrada.");
    } finally {
      setSubiendo(false);
      setProgreso(null);
    }
  };

  const borrar = async (entrada: EntradaBitacoraFallecido) => {
    if (!entrada.id) return;
    setBorrando(entrada.id);
    setError(null);
    try {
      await deleteDoc(doc(db, "notificaciones_fallecidos", notificacionId, "bitacora", entrada.id));
      // Los archivos solo los puede borrar su dueño (carpeta propia en Storage):
      // si admin borra una entrada ajena, el objeto queda huérfano, igual que en
      // los demás módulos con adjuntos.
      await Promise.all((entrada.adjuntos ?? []).map(a =>
        a.storagePath ? deleteObject(storageRef(storage, a.storagePath)).catch(() => {}) : Promise.resolve(),
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la entrada.");
    } finally {
      setBorrando(null);
      setABorrar(null);
    }
  };

  const esAdmin = profile?.role === "admin";
  const puedeBorrar = (e: EntradaBitacoraFallecido) => esAdmin || e.autorUid === user?.uid;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void registrar(); }
  };

  return (
    <div className="space-y-4">
      {tramiteCerrado && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-600 dark:text-slate-400">
          <Lock size={14} className="mt-0.5 shrink-0" />
          <span>El trámite está cerrado. La bitácora sigue abierta para dejar constancia de gestiones posteriores.</span>
        </div>
      )}

      {/* Redactor */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 p-3 space-y-2.5">
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={subiendo}
          rows={3}
          placeholder="Escribe una nota sobre el caso: gestiones, llamadas, observaciones…"
          className="w-full resize-y min-h-[72px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />

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
            {subiendo ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {subiendo ? (progreso !== null ? `Subiendo ${progreso}%` : "Registrando…") : "Registrar"}
          </button>
        </div>

        {error && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </div>

      {/* Entradas */}
      {errorCarga ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">{errorCarga}</p>
      ) : entradas === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" /> Cargando bitácora…
        </div>
      ) : entradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <MessageSquareText size={28} className="text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-500">Sin entradas todavía</p>
          <p className="text-xs text-slate-400 max-w-xs">Las notas y archivos que registres aquí solo los ve el personal de ESDOMED.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entradas.map(e => (
            <li key={e.id} className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold shrink-0">
                  {iniciales(e.autorNombre) || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{e.autorNombre}</span>
                      {ROL_LABEL[e.autorRol] && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          {ROL_LABEL[e.autorRol]}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">· {formatFechaHora(e.creadoEn)}</span>
                    </div>
                    {puedeBorrar(e) && e.id && (
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
                          aria-label="Eliminar entrada">
                          <Trash2 size={14} />
                        </button>
                      )
                    )}
                  </div>

                  {e.texto && (
                    <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{e.texto}</p>
                  )}

                  {!!e.adjuntos?.length && (
                    <ul className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {e.adjuntos.map((a, i) => <AdjuntoCard key={`${a.url}-${i}`} adjunto={a} />)}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdjuntoCard({ adjunto }: { adjunto: AdjuntoBitacora }) {
  const [imgError, setImgError] = useState(false);
  const esImagen = adjunto.tipo === "imagen" && !imgError;

  return (
    <li>
      <a href={adjunto.url} target="_blank" rel="noopener noreferrer"
        className="group block rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800/60 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
        title={adjunto.nombre}>
        {esImagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={adjunto.url} alt={adjunto.nombre} loading="lazy" onError={() => setImgError(true)}
            className="w-full h-24 object-cover bg-slate-100 dark:bg-slate-800" />
        ) : (
          <div className="w-full h-24 flex items-center justify-center text-blue-600 dark:text-blue-400">
            {adjunto.tipo === "pdf" ? <FileText size={28} /> : <ImageOff size={28} />}
          </div>
        )}
        <div className="px-2 py-1.5 flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate flex-1">{adjunto.nombre}</span>
          <span className="text-[10px] text-slate-400 shrink-0">{formatTamano(adjunto.tamano)}</span>
          <ExternalLink size={11} className="text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 shrink-0" />
        </div>
      </a>
    </li>
  );
}
