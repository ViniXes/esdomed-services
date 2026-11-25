"use client";

import { useState } from "react";
import { Ban, CircleCheckBig, Loader2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import {
  labelConQuien, labelMedio, labelPaso, validarNota,
  type CierreTS, type DatosNota, type GestionTSCE, type NotaTSCE,
} from "@/lib/consultaExterna/trabajoSocial";
import { CamposNota, notaABorrador } from "./Campos";
import { mensaje, useTS } from "./contexto";
import { Aviso, botonPrimario, botonSecundario, botonTexto, fechaCorta } from "./ui";

// La evolución de una gestión: sus notas y sus cierres en una sola línea de
// tiempo, lo más reciente arriba. Con `onNotas`, quien escribió una nota puede
// corregirla o borrarla ahí mismo.

type Item =
  | { clase: "nota"; fecha: string; ms: number; nota: NotaTSCE }
  | { clase: "cierre"; fecha: string; ms: number; cierre: CierreTS };

export function Evolucion({ gestion: g, notas, hoy, onNotas }: {
  gestion: GestionTSCE; notas: NotaTSCE[]; hoy: string; onNotas?: (lista: NotaTSCE[]) => void;
}) {
  const { uid, esAdmin, registra } = useTS();
  const items: Item[] = [
    ...notas.map((nota): Item => ({ clase: "nota", fecha: nota.fecha, ms: nota.creadoEnMs, nota })),
    ...g.historial.map((cierre): Item => ({ clase: "cierre", fecha: cierre.enMs ? hoySV(new Date(cierre.enMs)) : "", ms: cierre.enMs, cierre })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.ms - a.ms);

  return (
    <ol className="relative ml-2 space-y-3 border-l-2 border-slate-200 pl-5 dark:border-slate-800" aria-label="Evolución de la gestión">
      {items.map((item) => item.clase === "nota" ? (
        <NotaItem
          key={`n-${item.nota.id}`}
          nota={item.nota}
          gestion={g}
          hoy={hoy}
          editable={!!onNotas && registra && (esAdmin || item.nota.autor === uid)}
          unica={notas.length === 1}
          onCambio={(x) => onNotas?.(notas.map((y) => (y.id === x.id ? x : y)))}
          onBorrada={() => onNotas?.(notas.filter((y) => y.id !== item.nota.id))}
        />
      ) : (
        <CierreItem key={`c-${item.ms}-${item.cierre.accion}`} cierre={item.cierre} />
      ))}
    </ol>
  );
}

const punto = "absolute -left-[1.7rem] flex h-3 w-3 rounded-full ring-4 ring-white dark:ring-slate-900";

function CierreItem({ cierre: c }: { cierre: CierreTS }) {
  const [Icono, texto, tono] = c.accion === "finalizada"
    ? [CircleCheckBig, "Finalizada", "text-emerald-700 dark:text-emerald-300"] as const
    : c.accion === "reabierta"
      ? [RotateCcw, "Reabierta", "text-amber-700 dark:text-amber-300"] as const
      : [Ban, "Cerrada: no procede", "text-slate-600 dark:text-slate-300"] as const;
  return (
    <li className="relative">
      <span className={`${punto} top-1 bg-slate-300 dark:bg-slate-600`} aria-hidden="true" />
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Icono size={13} className={`shrink-0 ${tono}`} aria-hidden="true" />
        <span className={`font-semibold ${tono}`}>{texto}</span>
        <span>
          por {c.porNombre}
          {c.enMs > 0 && <> · {new Date(c.enMs).toLocaleString("es-SV", { dateStyle: "medium", timeStyle: "short" })}</>}
        </span>
      </p>
      {c.motivo && <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">{c.motivo}</p>}
    </li>
  );
}

function NotaItem({ nota: n, gestion: g, hoy, editable, unica, onCambio, onBorrada }: {
  nota: NotaTSCE; gestion: GestionTSCE; hoy: string; editable: boolean; unica: boolean; onCambio: (n: NotaTSCE) => void; onBorrada: () => void;
}) {
  const { llamar } = useTS();
  const [modo, setModo] = useState<"" | "editar" | "borrar">("");
  const [valor, setValor] = useState<DatosNota>(() => notaABorrador(n));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    const v = modo === "editar" ? validarNota(valor, g.tipo, hoy) : null;
    if (v && !v.ok) { setError(v.error); return; }
    setGuardando(true);
    setError("");
    try {
      if (v?.ok) {
        onCambio((await llamar<{ nota: NotaTSCE }>(`/notas/${n.id}`, "PATCH", { nota: v.datos })).nota);
        setModo("");
      } else {
        await llamar(`/notas/${n.id}`, "DELETE");
        onBorrada();
      }
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  const como = [labelMedio(n.medio), n.conQuien && `con ${labelConQuien(n.conQuien).toLowerCase()}`].filter(Boolean).join(" ");
  return (
    <li className="relative">
      <span className={`${punto} top-4 bg-cyan-600 dark:bg-cyan-500`} aria-hidden="true" />
      <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span className="text-slate-800 dark:text-slate-100">{fechaCorta(n.fecha)}</span>{como && ` · ${como}`} · {n.autorNombre}{n.editadoEnMs > 0 && " · corregida"}
            </p>
            {n.paso && <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{labelPaso(g.tipo, n.paso)}</p>}
            {n.texto && <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">{n.texto}</p>}
          </div>
          {editable && modo === "" && (
            <span className="flex flex-shrink-0">
              <button type="button" aria-label="Corregir la nota" onClick={() => { setValor(notaABorrador(n)); setModo("editar"); }} className={botonTexto}><Pencil size={14} /></button>
              {!unica && <button type="button" aria-label="Borrar la nota" onClick={() => setModo("borrar")} className={botonTexto}><Trash2 size={14} /></button>}
            </span>
          )}
        </div>
        {modo !== "" && (
          <form
            className="mt-3 space-y-4 border-t border-slate-100 pt-3 dark:border-slate-800"
            onSubmit={(e) => { e.preventDefault(); void guardar(); }}
          >
            {modo === "editar"
              ? <CamposNota valor={valor} onChange={setValor} tipo={g.tipo} hoy={hoy} desde={g.fecha} />
              : <p className="text-sm text-slate-700 dark:text-slate-200">La nota se borra y no se puede recuperar.</p>}
            {error && <Aviso tipo="error">{error}</Aviso>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setModo(""); setError(""); }} className={botonSecundario}>Cancelar</button>
              <button type="submit" disabled={guardando} className={modo === "borrar" ? `${botonPrimario} !bg-rose-600 hover:!bg-rose-700` : botonPrimario}>
                {guardando && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                {modo === "editar" ? "Guardar nota" : "Sí, borrar la nota"}
              </button>
            </div>
          </form>
        )}
      </div>
    </li>
  );
}
