"use client";

import { useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FileSpreadsheet, FileText, FileType, Image as IconoImagen, Loader2, Paperclip, Trash2 } from "lucide-react";
import type { GestionTSCE } from "@/lib/consultaExterna/trabajoSocial";
import {
  ACEPTA_ADJUNTOS, CLASE_LABEL, FORMATOS_TEXTO, MAX_ADJUNTOS, MAX_ADJUNTO_BYTES, tamanoTexto, validarAdjunto,
  type AdjuntoTS, type ClaseAdjunto,
} from "@/lib/consultaExterna/trabajoSocialAdjuntos";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import { RUTAS_API_TS, mensaje, useTS } from "./contexto";
import { Aviso, botonSecundario, botonTexto, fechaCorta, tarjeta } from "./ui";

// Adjuntos de una gestión: el respaldo de lo que se hizo. Con `onCambio` se
// pueden subir y quitar (pantalla de la gestión); sin él solo se abren
// (bitácora y productividad). Se abren con un enlace que vence en minutos.

const ICONO: Record<ClaseAdjunto, LucideIcon> = { pdf: FileText, imagen: IconoImagen, word: FileType, excel: FileSpreadsheet };

/** Las fotos de celular pesan varios megas: se bajan a un tamaño que se lee bien y sube rápido. */
const LADO_MAXIMO = 2000;
const UMBRAL_REDUCIR = 1024 * 1024;

async function reducirImagen(archivo: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type) || archivo.size <= UMBRAL_REDUCIR) return archivo;
  try {
    const imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    const ctx = lienzo.getContext("2d");
    if (!ctx) return archivo;
    // Fondo blanco: un PNG con transparencia saldría negro al pasar a JPG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    imagen.close();
    const blob = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, "image/jpeg", 0.85));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], `${archivo.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    // Si el navegador no la puede leer, se intenta subir tal cual.
    return archivo;
  }
}

export function AdjuntosGestion({ gestion: g, onCambio }: { gestion: GestionTSCE; onCambio?: (g: GestionTSCE) => void }) {
  const { llamar, subir, uid, esAdmin, registra } = useTS();
  const editable = !!onCambio && registra;
  const [subiendo, setSubiendo] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [porQuitar, setPorQuitar] = useState("");
  const [ocupado, setOcupado] = useState("");
  const selector = useRef<HTMLInputElement>(null);
  const adjuntos = g.adjuntos ?? [];
  const lleno = adjuntos.length >= MAX_ADJUNTOS;

  const alElegir = async (lista: FileList | null) => {
    const elegidos = [...(lista ?? [])];
    if (!elegidos.length || !onCambio) return;
    const fallas: string[] = [];
    let cupo = MAX_ADJUNTOS - adjuntos.length;
    for (const [i, original] of elegidos.entries()) {
      if (cupo <= 0) { fallas.push(`${original.name}: una gestión admite hasta ${MAX_ADJUNTOS} adjuntos.`); continue; }
      setSubiendo(elegidos.length > 1 ? `Subiendo ${i + 1} de ${elegidos.length}…` : "Subiendo…");
      try {
        const archivo = await reducirImagen(original);
        const v = validarAdjunto(archivo.name, archivo.size);
        if (!v.ok) { fallas.push(`${original.name}: ${v.error}`); continue; }
        const r = await subir<{ gestion: GestionTSCE }>(RUTAS_API_TS.adjuntos(g.id), archivo);
        onCambio(r.gestion);
        cupo -= 1;
      } catch (e) {
        fallas.push(`${original.name}: ${mensaje(e)}`);
      }
    }
    setSubiendo("");
    setErrores(fallas);
    if (selector.current) selector.current.value = "";
  };

  const abrir = async (a: AdjuntoTS) => {
    setErrores([]);
    // La pestaña se abre en el clic (después de esperar al servidor, el navegador la bloquearía).
    const pestana = window.open("", "_blank");
    setOcupado(a.id);
    try {
      const r = await llamar<{ url: string }>(`${RUTAS_API_TS.adjuntos(g.id)}?a=${encodeURIComponent(a.id)}`);
      if (pestana) pestana.location.href = r.url;
      else window.location.assign(r.url);
    } catch (e) {
      pestana?.close();
      setErrores([`${a.nombre}: ${mensaje(e)}`]);
    } finally {
      setOcupado("");
    }
  };

  const quitar = async (a: AdjuntoTS) => {
    if (!onCambio) return;
    setErrores([]);
    setOcupado(a.id);
    try {
      const r = await llamar<{ gestion: GestionTSCE }>(`${RUTAS_API_TS.adjuntos(g.id)}?a=${encodeURIComponent(a.id)}`, "DELETE");
      onCambio(r.gestion);
      setPorQuitar("");
    } catch (e) {
      setErrores([`${a.nombre}: ${mensaje(e)}`]);
    } finally {
      setOcupado("");
    }
  };

  if (!editable && adjuntos.length === 0) return null;

  return (
    <section aria-label="Adjuntos de la gestión">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-heading text-sm font-bold text-slate-900 dark:text-slate-100">
          <Paperclip size={15} className="text-cyan-700 dark:text-cyan-300" aria-hidden="true" />
          Adjuntos
          {adjuntos.length > 0 && <span className="font-normal text-slate-500 dark:text-slate-400">· {adjuntos.length}</span>}
        </h2>
        {editable && (
          <>
            <input ref={selector} type="file" multiple accept={ACEPTA_ADJUNTOS} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void alElegir(e.target.files)} />
            <button type="button" disabled={!!subiendo || lleno} onClick={() => selector.current?.click()} className={`${botonSecundario} bg-white dark:bg-slate-900`}>
              {subiendo ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Paperclip size={14} aria-hidden="true" />}
              {subiendo || "Adjuntar archivo"}
            </button>
          </>
        )}
      </div>

      {errores.length > 0 && (
        <div className="mb-3">
          <Aviso tipo="error">
            <ul className="space-y-0.5">{errores.map((e) => <li key={e}>{e}</li>)}</ul>
          </Aviso>
        </div>
      )}

      {adjuntos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {FORMATOS_TEXTO}, hasta {tamanoTexto(MAX_ADJUNTO_BYTES)} cada uno.
        </p>
      ) : (
        <ul className={`${tarjeta} divide-y divide-slate-100 overflow-hidden dark:divide-slate-800`}>
          {adjuntos.map((a) => {
            const Icono = ICONO[a.clase] ?? FileText;
            const mio = esAdmin || a.subidoPor === uid;
            return (
              <li key={a.id} className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  onClick={() => void abrir(a)}
                  disabled={ocupado === a.id}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-slate-800/50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    {ocupado === a.id ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Icono size={17} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{a.nombre}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {CLASE_LABEL[a.clase] ?? "Archivo"} · {tamanoTexto(a.tamano)} · {a.subidoPorNombre}
                      {a.subidoEnMs > 0 && <> · {fechaCorta(hoySV(new Date(a.subidoEnMs)))}</>}
                    </span>
                  </span>
                </button>
                {editable && mio && (porQuitar === a.id ? (
                  <span className="flex flex-shrink-0 items-center gap-1">
                    <button type="button" onClick={() => setPorQuitar("")} className={botonTexto}>Cancelar</button>
                    <button type="button" disabled={ocupado === a.id} onClick={() => void quitar(a)} className={`${botonTexto} text-rose-700 dark:text-rose-300`}>Sí, quitar</button>
                  </span>
                ) : (
                  <button type="button" aria-label={`Quitar ${a.nombre}`} onClick={() => setPorQuitar(a.id)} className={`${botonTexto} flex-shrink-0`}><Trash2 size={14} /></button>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
