"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardCheck, Clock, FileCheck2, Loader2, Lock, Power, RefreshCw, TimerReset, TriangleAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEvaluacionEnLinea } from "@/contexts/EvaluacionEnLineaContext";
import {
  EVALUACION_EN_LINEA, LETRAS_OPCIONES, MINUTOS_DURACION, MINUTOS_PARA_INICIAR,
  type EstadoEvaluacion, type FilaPanelEvaluacion, type MiEvaluacion,
} from "@/lib/evaluacionEnLinea";
import { NOTA_MINIMA_EVALUACION } from "@/lib/evaluacionesPersonal";
import { PuntoEnVivo } from "@/components/evaluacionEnLinea/PuntoEnVivo";
import { mmss, useRestante } from "@/components/evaluacionEnLinea/AvisoEvaluacion";

// Evaluación en línea (ver src/lib/evaluacionEnLinea.ts): el personal operativo
// la hace aquí; el admin la abre/cierra y ve quién la hizo y su nota.

const fechaHora = (ms: number) =>
  new Date(ms).toLocaleString("es-SV", { day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit" });

const hora = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleTimeString("es-SV", { hour: "numeric", minute: "2-digit" }) : "—";

function Encabezado({ activa, derecha }: { activa: boolean; derecha?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <ClipboardCheck size={21} className="text-blue-700 dark:text-blue-300" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 font-heading text-xl font-bold text-slate-900 dark:text-slate-100">
            Evaluación en línea {activa && <PuntoEnVivo />}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {EVALUACION_EN_LINEA.titulo} · {EVALUACION_EN_LINEA.tema}
          </p>
        </div>
        {derecha}
      </div>
    </div>
  );
}

// ─── Personal operativo ────────────────────────────────────────────────────

function Aviso({ icono, titulo, children, tono = "slate" }: { icono: React.ReactNode; titulo: string; children?: React.ReactNode; tono?: "slate" | "amber" | "emerald" }) {
  const tonos = {
    slate: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
    emerald: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
  };
  return (
    <div className={`rounded-2xl border p-6 text-center shadow-sm ${tonos[tono]}`}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center">{icono}</div>
      <p className="mt-2 font-heading text-lg font-bold text-slate-900 dark:text-slate-100">{titulo}</p>
      {children && <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{children}</div>}
    </div>
  );
}

function VistaPersonal() {
  const { user } = useAuth();
  const { activa: abierta, info, desfaseMs, pedir, recargar, modoPrueba } = useEvaluacionEnLinea();
  // En la prueba del admin la evaluación funciona aunque esté cerrada para el personal.
  const activa = abierta || modoPrueba;
  const extra = modoPrueba ? { prueba: true } : {};
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const clave = `evaluacion-en-linea:${modoPrueba ? "prueba:" : ""}${EVALUACION_EN_LINEA.id}:${user?.uid ?? ""}`;
  const [respuestas, setRespuestas] = useState<(number | null)[]>([]);

  useEffect(() => {
    recargar().finally(() => setCargando(false));
  }, [recargar]);

  const preguntas = info?.preguntas;
  const delServidor = info?.guardadas;
  // Lo marcado se guarda en el equipo y en el servidor (cada clic), para no
  // perderlo si se recarga la página y para entregarlo solo si se acaba el tiempo.
  useEffect(() => {
    if (!preguntas) return;
    let locales: (number | null)[] = [];
    try {
      locales = JSON.parse(localStorage.getItem(clave) ?? "[]");
    } catch { /* nada */ }
    const valor = (i: number) =>
      typeof locales[i] === "number" ? locales[i] : typeof delServidor?.[i] === "number" && delServidor[i] >= 0 ? delServidor[i] : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se recupera lo marcado al llegar las preguntas
    setRespuestas(preguntas.map((_, i) => valor(i)));
  }, [preguntas, delServidor, clave]);

  const marcar = (i: number, j: number) => {
    const nuevas = [...respuestas];
    nuevas[i] = j;
    setRespuestas(nuevas);
    try { localStorage.setItem(clave, JSON.stringify(nuevas)); } catch { /* nada */ }
    void pedir("POST", { accion: "guardar", respuestas: nuevas.map((r) => r ?? -1), ...extra }).catch(() => {});
    setConfirmar(false);
  };

  // 15 minutos para responder: al acabarse se entrega sola con lo marcado.
  const restanteRespuesta = useRestante(info?.estado === "en_curso" ? info.finMs : undefined, desfaseMs);
  const autoEntregada = useRef(false);
  const respuestasRef = useRef(respuestas);
  useEffect(() => {
    respuestasRef.current = respuestas;
  }, [respuestas]);

  // Sin entrar todavía: 5 minutos de preparación y, después, sus 15 ya corren.
  const paraEntrar = useRestante(info?.estado === "por_iniciar" ? info.limiteMs : undefined, desfaseMs);
  const restante = useRestante(info?.estado === "por_iniciar" ? info.finMs : undefined, desfaseMs);
  const habilitada = info?.estado === "por_iniciar" && Boolean(info.limiteMs) && paraEntrar <= 0;
  useEffect(() => {
    if (info?.estado === "por_iniciar" && info.finMs && restante <= 0) void recargar();
  }, [info?.estado, info?.finMs, restante, recargar]);
  // Si está en esta página cuando se habilita (o llega ya habilitada), la prueba se abre sola: su tiempo ya corre.
  const autoIniciada = useRef(false);

  const accion = async (cuerpo: Record<string, unknown>) => {
    setTrabajando(true);
    setError("");
    try {
      const r = (await pedir("POST", { ...cuerpo, ...extra })) as MiEvaluacion;
      if (r.estado === "entregada") {
        try { localStorage.removeItem(clave); } catch { /* nada */ }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
      void recargar();
    } finally {
      setTrabajando(false);
      setConfirmar(false);
    }
  };

  useEffect(() => {
    if (!habilitada || !activa || autoIniciada.current || restante <= 0) return;
    autoIniciada.current = true;
    void accion({ accion: "iniciar" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una sola vez, al habilitarse
  }, [habilitada, activa]);

  const seAcabo = info?.estado === "en_curso" && Boolean(info.finMs) && restanteRespuesta <= 0;
  useEffect(() => {
    if (!seAcabo || autoEntregada.current) return;
    autoEntregada.current = true;
    void accion({ accion: "entregar", respuestas: respuestasRef.current.map((r) => r ?? -1) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una sola vez, al acabarse el tiempo
  }, [seAcabo]);

  if (cargando && !info) {
    return <p role="status" className="py-10 text-center text-sm text-slate-500">Cargando…</p>;
  }

  const contestadas = respuestas.filter((r) => r !== null).length;
  const total = preguntas?.length ?? info?.total ?? 10;
  const estado: EstadoEvaluacion | undefined = info?.elegible ? info.estado : undefined;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</p>
      )}

      {!estado && (
        <Aviso icono={<Lock size={30} className="text-slate-400" />} titulo="No hay una evaluación para ti en este momento">
          Cuando la jefatura abra una evaluación, aparecerá aquí.
        </Aviso>
      )}

      {estado === "por_iniciar" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Clave {info?.clave}</p>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <Clock size={14} aria-hidden />
              {paraEntrar > 0
                ? <>Se habilita en: <span className="font-semibold tabular-nums">{mmss(paraEntrar)}</span></>
                : <>Tu tiempo ya corre: <span className="font-semibold tabular-nums">{mmss(restante)}</span></>}
            </p>
          </div>
          <p className="mt-3 font-heading text-lg font-bold text-slate-900 dark:text-slate-100">{paraEntrar > 0 ? "Prepárate" : "Tu prueba está habilitada"}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>{total} preguntas; marca una sola respuesta en cada una. Cada respuesta correcta vale 1 punto.</li>
            <li>Tienes {MINUTOS_PARA_INICIAR} minutos desde que abriste services para prepararte. Al terminar se habilita la prueba y tienes {MINUTOS_DURACION} minutos para responderla; si estás en esta página, se abre sola.</li>
            <li>El tiempo no se detiene aunque recargues o cierres la página; al acabarse se entrega sola con lo que hayas marcado.</li>
            <li>Al entregar verás tu nota, y la hoja queda en tu ficha (Evaluaciones). Ya no se puede cambiar.</li>
          </ul>
          <button
            type="button"
            onClick={() => accion({ accion: "iniciar" })}
            disabled={trabajando || !activa || paraEntrar > 0}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {trabajando && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {paraEntrar > 0 ? `Se habilita en ${mmss(paraEntrar)}` : "Iniciar prueba"}
          </button>
          {!activa && <p className="mt-2 text-xs text-slate-500">La evaluación está cerrada.</p>}
        </div>
      )}

      {estado === "vencida" && (
        <Aviso tono="amber" icono={<TriangleAlert size={30} className="text-amber-600" />} titulo={`Se acabaron tus ${MINUTOS_DURACION} minutos sin que entraras a la prueba`}>
          Si fue un inconveniente, avisa a tu jefatura.
        </Aviso>
      )}

      {estado === "entregada" && (
        <Aviso tono="emerald" icono={<CheckCircle2 size={32} className="text-emerald-600" />} titulo="Evaluación entregada">
          {typeof info?.puntaje === "number" && (
            <p className="mt-2 font-heading text-4xl font-bold text-slate-900 dark:text-slate-100">
              {info.puntaje} <span className="text-xl font-semibold text-slate-500">/ {info.total}</span>
            </p>
          )}
          {typeof info?.puntaje === "number" && info.total ? (
            <p className={`mt-1 text-sm font-semibold ${(info.puntaje * 10) / info.total >= NOTA_MINIMA_EVALUACION ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
              {(info.puntaje * 10) / info.total >= NOTA_MINIMA_EVALUACION ? "Aprobada" : "Reprobada"}
            </p>
          ) : null}
          <p className="mt-2">Entregada a las {hora(info?.entregadaEnMs)}. La hoja queda en tu ficha, pestaña Evaluaciones.</p>
          {user?.uid && (
            <Link href={`/dashboard/personal/${user.uid}`} prefetch={false} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-transparent dark:text-emerald-300 dark:hover:bg-emerald-900/40">
              <FileCheck2 size={15} aria-hidden /> Ver en mi ficha
            </Link>
          )}
        </Aviso>
      )}

      {estado === "en_curso" && preguntas && (
        <>
          <div className="sticky top-0 z-10 -mx-1 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-200">Clave {info?.clave}</span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400" aria-live="polite">{contestadas} de {total} respondidas</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 tabular-nums font-semibold ${restanteRespuesta <= 120_000 ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>
                <Clock size={13} aria-hidden /> {mmss(restanteRespuesta)}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-blue-600 transition-all dark:bg-cyan-500" style={{ width: `${(contestadas / total) * 100}%` }} />
            </div>
          </div>
          <ol className="space-y-3">
            {preguntas.map((p, i) => (
              <li key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <fieldset>
                  <legend className="text-sm font-semibold text-slate-900 dark:text-slate-100">{i + 1}. {p.texto}</legend>
                  <div className="mt-3 space-y-2">
                    {p.opciones.map((o, j) => {
                      const elegida = respuestas[i] === j;
                      return (
                        <label
                          key={j}
                          className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                            elegida
                              ? "border-blue-400 bg-blue-50 text-blue-900 dark:border-cyan-600 dark:bg-blue-950/50 dark:text-cyan-50"
                              : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          }`}
                        >
                          <input type="radio" name={`p${i}`} checked={elegida} onChange={() => marcar(i, j)} className="mt-0.5 h-4 w-4 accent-blue-700" />
                          <span><span className="font-semibold">{LETRAS_OPCIONES[j]})</span> {o}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </li>
            ))}
          </ol>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            {contestadas < total ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">Faltan {total - contestadas} {total - contestadas === 1 ? "pregunta" : "preguntas"} por responder.</p>
            ) : confirmar ? (
              <p className="text-sm text-slate-700 dark:text-slate-200">¿Entregar? Después ya no se puede cambiar.</p>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">Todas respondidas.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={trabajando || contestadas < total}
                onClick={() => (confirmar ? accion({ accion: "entregar", respuestas }) : setConfirmar(true))}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {trabajando && <Loader2 size={16} className="animate-spin" aria-hidden />}
                {confirmar ? "Sí, entregar" : "Entregar evaluación"}
              </button>
              {confirmar && (
                <button type="button" onClick={() => setConfirmar(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                  Revisar
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Panel del admin ───────────────────────────────────────────────────────

const ETIQUETA_ESTADO: Record<FilaPanelEvaluacion["estado"], { texto: string; cls: string }> = {
  sin_abrir: { texto: "Sin abrir", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  por_iniciar: { texto: "Por iniciar", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  en_curso: { texto: "En curso", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-cyan-200" },
  entregada: { texto: "Entregada", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  vencida: { texto: "No la presentó", cls: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" },
};

interface DatosPanel {
  activa: boolean;
  abiertaEnMs: number | null;
  cerradaEnMs: number | null;
  filas: FilaPanelEvaluacion[];
  ahoraMs: number;
}

function PanelAdmin() {
  const { activa, pedir } = useEvaluacionEnLinea();
  const [datos, setDatos] = useState<DatosPanel | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDatos((await pedir("GET", undefined, "/api/evaluacion-en-linea?panel=1")) as DatosPanel);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar.");
    }
  }, [pedir]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consulta a la API; el estado cambia al responder
    void cargar();
  }, [cargar, activa]);

  // Mientras está abierta, el panel se pone al día solo cada 30 s.
  useEffect(() => {
    if (!activa) return;
    const t = setInterval(() => void cargar(), 30_000);
    return () => clearInterval(t);
  }, [activa, cargar]);

  const accion = async (cuerpo: Record<string, unknown>, id: string, pregunta?: string) => {
    if (pregunta && !window.confirm(pregunta)) return;
    setOcupado(id);
    try {
      await pedir("POST", cuerpo);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setOcupado(null);
    }
  };

  const resumen = useMemo(() => {
    const f = datos?.filas ?? [];
    const entregadas = f.filter((x) => x.estado === "entregada");
    const notas = entregadas.map((x) => ((x.puntaje ?? 0) * 10) / x.total);
    return {
      total: f.length,
      abrieron: f.filter((x) => x.estado !== "sin_abrir").length,
      enCurso: f.filter((x) => x.estado === "en_curso").length,
      entregadas: entregadas.length,
      vencidas: f.filter((x) => x.estado === "vencida").length,
      promedio: notas.length ? (notas.reduce((s, n) => s + n, 0) / notas.length).toFixed(1) : "—",
      aprobadas: notas.filter((n) => n >= NOTA_MINIMA_EVALUACION).length,
    };
  }, [datos]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {activa ? <PuntoEnVivo /> : <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />}
          <span className="font-semibold text-slate-900 dark:text-slate-100">{activa ? "En marcha" : "Cerrada"}</span>
          <span className="text-slate-500 dark:text-slate-400">
            {activa && datos?.abiertaEnMs ? `desde las ${hora(datos.abiertaEnMs)}` : !activa && datos?.cerradaEnMs ? `se cerró a las ${hora(datos.cerradaEnMs)}` : ""}
          </span>
          <span className="w-full text-xs text-slate-500 dark:text-slate-400 sm:w-auto">
            {(datos?.ahoraMs ?? 0) < EVALUACION_EN_LINEA.cierreAutomaticoMs
              ? `· Se cierra sola el ${fechaHora(EVALUACION_EN_LINEA.cierreAutomaticoMs)}`
              : "· Ya pasó la hora del cierre automático"}
          </span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void cargar()} aria-label="Actualizar" className="flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <RefreshCw size={15} aria-hidden /> Actualizar
          </button>
          <button
            type="button"
            disabled={ocupado === "estado"}
            onClick={() => accion(
              { accion: activa ? "cerrar" : "abrir" },
              "estado",
              activa
                ? "¿Cerrar la evaluación? Nadie más podrá iniciarla (quien ya la inició sí puede entregarla)."
                : `¿Abrir la evaluación? Al personal operativo le aparecerá el aviso: ${MINUTOS_PARA_INICIAR} minutos para prepararse y ${MINUTOS_DURACION} para responder.`,
            )}
            className={`flex min-h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 ${activa ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
          >
            {ocupado === "estado" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Power size={15} aria-hidden />}
            {activa ? "Cerrar evaluación" : "Abrir evaluación"}
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Personal", resumen.total],
          ["Abrieron", resumen.abrieron],
          ["En curso", resumen.enCurso],
          ["Entregadas", resumen.entregadas],
          ["No la presentaron", resumen.vencidas],
          ["Promedio", `${resumen.promedio}${resumen.entregadas ? ` · ${resumen.aprobadas} aprob.` : ""}`],
        ].map(([t, v]) => (
          <div key={String(t)} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{t}</p>
            <p className="mt-1 font-heading text-xl font-bold text-slate-900 dark:text-slate-100">{v}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Persona</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Clave</th>
              <th className="px-3 py-2">Abrió</th>
              <th className="px-3 py-2">Inició</th>
              <th className="px-3 py-2">Entregó</th>
              <th className="px-3 py-2">Nota</th>
              <th className="px-3 py-2"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {!datos && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">Cargando…</td></tr>
            )}
            {datos?.filas.map((f) => {
              const nota = f.puntaje !== null ? (f.puntaje * 10) / f.total : null;
              return (
                <tr key={f.uid}>
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/personal/${f.uid}`} prefetch={false} className="font-medium text-slate-900 hover:text-blue-700 dark:text-slate-100 dark:hover:text-cyan-300">{f.nombre}</Link>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{f.grupo || "—"}</p>
                  </td>
                  <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA_ESTADO[f.estado].cls}`}>{ETIQUETA_ESTADO[f.estado].texto}</span></td>
                  <td className="px-3 py-2 tabular-nums">{f.clave ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">{hora(f.vistaEnMs)}</td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">{hora(f.iniciadaEnMs)}</td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">{hora(f.entregadaEnMs)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {nota !== null ? (
                      <span className={`font-semibold ${nota >= NOTA_MINIMA_EVALUACION ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                        {f.puntaje}/{f.total}
                      </span>
                    ) : "—"}
                    {f.estado === "entregada" && f.enFicha && <FileCheck2 size={14} className="ml-1.5 inline text-emerald-600" aria-label="En su ficha" />}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {(f.estado === "vencida" || f.estado === "por_iniciar") && (
                      <button
                        type="button"
                        disabled={ocupado === f.uid}
                        onClick={() => accion({ accion: "reabrir", uid: f.uid }, f.uid, `¿Darle tiempo de nuevo a ${f.nombre}? Vuelve a tener ${MINUTOS_PARA_INICIAR} minutos para prepararse y ${MINUTOS_DURACION} para responder.`)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <TimerReset size={13} aria-hidden /> Tiempo de nuevo
                      </button>
                    )}
                    {f.estado === "entregada" && !f.enFicha && (
                      <button
                        type="button"
                        disabled={ocupado === f.uid}
                        onClick={() => accion({ accion: "ficha", uid: f.uid }, f.uid)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-amber-200 px-2.5 text-xs text-amber-800 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/40"
                      >
                        <FileCheck2 size={13} aria-hidden /> Guardar en ficha
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Prueba del admin: hace el mismo recorrido que el personal (aviso, 5 min de
 * preparación, 15 de prueba, nota y hoja en su ficha) sin abrir la evaluación a
 * nadie. No sale en el panel; al terminar se borra con un botón.
 */
function BarraPrueba({ alReiniciar }: { alReiniciar: () => void }) {
  const { modoPrueba, cambiarModoPrueba, pedir } = useEvaluacionEnLinea();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const borrar = async (yVolver: boolean) => {
    if (!window.confirm("¿Borrar tu prueba? Se quitan su registro y la hoja de tu ficha.")) return;
    setOcupado(true);
    setError("");
    try {
      await pedir("POST", { accion: "borrarPrueba" });
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith("evaluacion-en-linea:prueba:")) localStorage.removeItem(k);
      } catch { /* nada */ }
      // Empezar de nuevo: la vista se monta otra vez y pide una prueba nueva.
      cambiarModoPrueba(!yVolver);
      if (!yVolver) alReiniciar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar.");
    } finally {
      setOcupado(false);
    }
  };
  if (!modoPrueba) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-slate-100">Probar como evaluado.</span> Haces el recorrido completo con tu cuenta (aviso, preparación, prueba, nota y hoja en tu ficha) sin abrirla a nadie. No cuenta ni sale en la lista.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => cambiarModoPrueba(true)} className="min-h-10 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500">
            Hacer una prueba
          </button>
          <button type="button" disabled={ocupado} onClick={() => borrar(true)} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            Borrar mi prueba
          </button>
        </div>
        {error && <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
      <p className="text-sm text-amber-900 dark:text-amber-200">
        <span className="font-semibold">Modo prueba.</span> Así lo ve el personal. La evaluación sigue cerrada para todos y esto no cuenta.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => cambiarModoPrueba(false)} className="min-h-10 rounded-xl border border-amber-300 bg-white px-3 text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-900/40">
          Volver al panel
        </button>
        <button type="button" disabled={ocupado} onClick={() => borrar(false)} className="min-h-10 rounded-xl border border-amber-300 bg-white px-3 text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-900/40">
          Borrar y empezar de nuevo
        </button>
      </div>
      {error && <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export default function EvaluacionEnLineaPage() {
  const { profile } = useAuth();
  const { activa, modoPrueba } = useEvaluacionEnLinea();
  const esAdmin = profile?.role === "admin";
  const [intento, setIntento] = useState(0);
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <Encabezado activa={activa} />
      {esAdmin && <BarraPrueba alReiniciar={() => setIntento((n) => n + 1)} />}
      {esAdmin && !modoPrueba ? <PanelAdmin /> : <div className="mx-auto max-w-3xl"><VistaPersonal key={modoPrueba ? `prueba-${intento}` : "real"} /></div>}
    </div>
  );
}
