"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Send, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  cargarUsuariosConCodigo,
  publicarAlPersonal,
  retirarPublicacion,
  vincularConUsuarios,
} from "@/lib/inconsistenciasMarcacion/personal";
import type { ReporteInconsistenciasMarcacion } from "@/types";
import { Alerta, Dato } from "./CargarReporteModal";
import { etiquetaPeriodo } from "@/lib/inconsistenciasMarcacion/analisis";

type Usuarios = Awaited<ReturnType<typeof cargarUsuariosConCodigo>>;

/**
 * Publicar (o retirar) un mes ya revisado: cada persona del reporte se vincula
 * con el usuario que tiene su código de marcación y recibe su copia, que verá
 * en Mi área → "Mis marcaciones". Quien no tenga usuario no lo verá.
 */
export function PublicarModal({
  reporte,
  onCerrar,
  onHecho,
}: {
  reporte: ReporteInconsistenciasMarcacion;
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const { profile } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuarios | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [confirmarRetiro, setConfirmarRetiro] = useState(false);

  useEffect(() => {
    let cancelado = false;
    cargarUsuariosConCodigo()
      .then((u) => !cancelado && setUsuarios(u))
      .catch((e) => !cancelado && setError(`No se pudieron cargar los usuarios: ${e instanceof Error ? e.message : "error"}`));
    return () => {
      cancelado = true;
    };
  }, []);

  const vinculacion = useMemo(() => (usuarios ? vincularConUsuarios(reporte, usuarios) : null), [reporte, usuarios]);
  const publicado = reporte.publicacion;
  const mes = etiquetaPeriodo(reporte);
  const n = vinculacion?.vinculados.length ?? 0;

  const publicar = async () => {
    if (!vinculacion || !profile) return;
    setTrabajando(true);
    setError(null);
    try {
      await publicarAlPersonal(reporte, vinculacion, profile);
      onHecho(`${mes} publicado: ${n} persona${n === 1 ? "" : "s"} ya lo ven en "Mis marcaciones".`);
    } catch (e) {
      setError(`No se pudo publicar: ${e instanceof Error ? e.message : "error"}`);
      setTrabajando(false);
    }
  };

  const retirar = async () => {
    setTrabajando(true);
    setError(null);
    try {
      await retirarPublicacion(reporte.periodo);
      onHecho(`Se retiró la publicación de ${mes}: el personal ya no lo ve.`);
    } catch (e) {
      setError(`No se pudo retirar: ${e instanceof Error ? e.message : "error"}`);
      setTrabajando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-publicar">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 id="titulo-publicar" className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">Publicar al personal · {mes}</h2>
            <p className="text-xs text-slate-500">Cada persona verá solo sus días y montos en Mi área → Mis marcaciones.</p>
          </div>
          <button type="button" onClick={onCerrar} disabled={trabajando} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {publicado && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              <span>
                Publicado el {publicado.publicadoEn.toLocaleDateString("es-SV")} por {publicado.publicadoPorNombre} a {publicado.personas} persona{publicado.personas === 1 ? "" : "s"}.
                Volver a publicar actualiza los vínculos (por ejemplo, tras asignar un código en Usuarios).
              </span>
            </div>
          )}

          {error && <Alerta tono="error" mensajes={[error]} />}

          {!vinculacion && !error && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin text-blue-600 dark:text-blue-400" />
              Vinculando el reporte con los usuarios…
            </div>
          )}

          {vinculacion && (
            <>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Dato label="Lo verán" valor={String(n)} />
                <Dato label="Sin usuario" valor={String(vinculacion.sinUsuario.length)} />
                <Dato label="Código repetido" valor={String(vinculacion.duplicados.length)} />
              </dl>

              {vinculacion.sinUsuario.length > 0 && (
                <Alerta
                  tono="aviso"
                  titulo="No lo verán: ningún usuario tiene su código (asígnalo en Usuarios y vuelve a publicar)"
                  mensajes={vinculacion.sinUsuario.map((e) => `${e.codigoMarcacion} · ${e.nombre}`)}
                />
              )}
              {vinculacion.duplicados.length > 0 && (
                <Alerta
                  tono="aviso"
                  titulo="Código en más de un usuario: no se publica hasta corregirlo"
                  mensajes={vinculacion.duplicados.map((d) => `${d.empleado.codigoMarcacion} · ${d.empleado.nombre} → ${d.usuarios.join(", ")}`)}
                />
              )}

              {n > 0 && (
                <details className="group rounded-xl border border-slate-200 dark:border-slate-800">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Ver a quién le llega ({n})
                  </summary>
                  <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto border-t border-slate-200 text-xs dark:divide-slate-800 dark:border-slate-800">
                    {vinculacion.vinculados.map(({ empleado, usuarioNombre }) => (
                      <li key={empleado.codigoMarcacion} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                        <span className="min-w-0 text-slate-700 dark:text-slate-300">
                          <span className="font-mono text-slate-500">{empleado.codigoMarcacion}</span> · {empleado.nombre}
                        </span>
                        <span className="shrink-0 text-slate-500">→ {usuarioNombre}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <div>
            {publicado &&
              (confirmarRetiro ? (
                <span className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">¿Retirar?</span>
                  <button type="button" onClick={retirar} disabled={trabajando} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40">
                    Sí, retirar
                  </button>
                  <button type="button" onClick={() => setConfirmarRetiro(false)} disabled={trabajando} className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                    No
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmarRetiro(true)} disabled={trabajando} className="rounded-xl px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40">
                  Retirar publicación
                </button>
              ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onCerrar} disabled={trabajando} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancelar
            </button>
            <button
              type="button"
              onClick={publicar}
              disabled={!vinculacion || n === 0 || trabajando}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {trabajando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {publicado ? "Volver a publicar" : `Publicar a ${n} persona${n === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
