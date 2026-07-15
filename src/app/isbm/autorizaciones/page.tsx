"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ShieldCheck, X as XIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { aprobarAutorizacion, listarAutorizaciones, rechazarAutorizacion } from "@/lib/isbm/api";
import { RUBRO_LABEL, formatoDolares, type AutorizacionConCargo } from "@/lib/isbm/types";

const TIPO_LABEL: Record<string, string> = {
  LABORATORIO_RADIOLOGIA: "Laboratorio / Radiología",
  PAQUETE_QUIRURGICO: "Paquete quirúrgico",
  MEDICAMENTO: "Medicamento",
  INTERCONSULTA: "Interconsulta",
  OTRO: "Otro",
};

export default function AutorizacionesPage() {
  const { profile } = useAuth();
  const [autorizaciones, setAutorizaciones] = useState<AutorizacionConCargo[] | null>(null);
  const [error, setError] = useState("");
  const [rechazando, setRechazando] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // Técnico solo consulta; supervisor y jefe (y admin) resuelven.
  const puedeResolver =
    profile?.role === "isbm_supervisor" || profile?.role === "isbm_jefe" || profile?.role === "admin";

  const cargar = useCallback(async () => {
    setError("");
    try {
      setAutorizaciones(await listarAutorizaciones());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Diferido: regla react-hooks/set-state-in-effect.
  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  const actor = profile
    ? { uid: profile.uid, nombre: profile.nombre, rol: profile.role }
    : null;

  const aprobar = async (a: AutorizacionConCargo) => {
    if (!actor) return;
    if (!window.confirm(`¿Aprobar "${a.cargo.arancel.descripcion}" por ${formatoDolares(a.monto_solicitado)}?`)) return;
    setOcupado(true);
    try {
      await aprobarAutorizacion(a.id, actor);
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const rechazar = async (a: AutorizacionConCargo) => {
    if (!actor) return;
    setOcupado(true);
    setError("");
    try {
      await rechazarAutorizacion(a, comentario, actor);
      setRechazando(null);
      setComentario("");
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const pendientes = (autorizaciones ?? []).filter((a) => a.estado === "PENDIENTE");
  const resueltas = (autorizaciones ?? []).filter((a) => a.estado !== "PENDIENTE");

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Convenios ISBM</p>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Autorizaciones</h1>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
      )}

      {!autorizaciones ? (
        <div className="p-10 flex justify-center">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Cola de pendientes ── */}
          <section className="space-y-2.5">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Pendientes {pendientes.length > 0 && `(${pendientes.length})`}
            </h2>
            {pendientes.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center">
                <ShieldCheck size={24} className="text-emerald-400 mx-auto mb-1.5" />
                <p className="text-sm text-slate-500">No hay autorizaciones pendientes.</p>
              </div>
            ) : (
              pendientes.map((a) => (
                <div key={a.id} className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded-2xl px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {a.cargo.arancel.descripcion}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {a.cargo.afiliacion?.paciente_nombre ?? a.cargo.expediente} · {a.cargo.fecha}
                        {" · "}{RUBRO_LABEL[a.cargo.arancel.rubro]}
                        {" · "}solicitó {a.solicitado_por_nombre}
                      </p>
                    </div>
                    <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-full px-2.5 py-1">
                      {TIPO_LABEL[a.tipo]} · nivel {a.nivel_requerido === "JEFE" ? "Jefe" : "Supervisor"}
                    </span>
                    <span className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatoDolares(a.monto_solicitado)}
                    </span>
                    {puedeResolver && rechazando !== a.id && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => aprobar(a)}
                          disabled={ocupado}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 transition-colors"
                        >
                          <Check size={13} /> Aprobar
                        </button>
                        <button
                          onClick={() => { setRechazando(a.id); setComentario(""); }}
                          disabled={ocupado}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg disabled:opacity-50 transition-colors"
                        >
                          <XIcon size={13} /> Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                  {rechazando === a.id && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input
                        autoFocus
                        value={comentario}
                        onChange={(e) => setComentario(e.target.value)}
                        placeholder="Motivo del rechazo (mínimo 10 caracteres)"
                        className="flex-1 min-w-[220px] bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <button
                        onClick={() => rechazar(a)}
                        disabled={ocupado || comentario.trim().length < 10}
                        className="px-3 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        Confirmar rechazo
                      </button>
                      <button
                        onClick={() => setRechazando(null)}
                        className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>

          {/* ── Historial ── */}
          {resueltas.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Historial</h2>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                        <th className="px-4 py-2.5 font-medium">Servicio</th>
                        <th className="px-4 py-2.5 font-medium">Paciente</th>
                        <th className="px-4 py-2.5 font-medium text-right">Monto</th>
                        <th className="px-4 py-2.5 font-medium">Resolución</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resueltas.map((a) => (
                        <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                          <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">{a.cargo.arancel.descripcion}</td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                            {a.cargo.afiliacion?.paciente_nombre ?? a.cargo.expediente}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{formatoDolares(a.monto_solicitado)}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${
                                a.estado === "APROBADA"
                                  ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900"
                                  : "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900"
                              }`}
                            >
                              {a.estado === "APROBADA" ? "Aprobada" : "Rechazada"}
                            </span>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {a.resuelto_por_nombre}{a.comentario ? ` — ${a.comentario}` : ""}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
