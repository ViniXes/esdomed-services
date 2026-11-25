"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { doc, onSnapshot } from "@/lib/firestoreMeter";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { DOC_ESTADO_EVALUACION, type MiEvaluacion } from "@/lib/evaluacionEnLinea";

// Estado de la evaluación en línea para el dashboard: si está abierta (un
// listener a configuracion/evaluacion_en_linea, lectura pública) y, para el
// personal ESDOMED, su evaluación (API). Así quien ya estaba conectado la
// recibe en cuanto el admin la abre, sin recargar.

interface Valor {
  activa: boolean;
  info: MiEvaluacion | null;
  /** Hora del servidor menos la del equipo, para que la cuenta regresiva no dependa del reloj local. */
  desfaseMs: number;
  /** Ve la entrada del menú: el admin siempre (panel) y el personal elegible mientras le toque. */
  veEntrada: boolean;
  pedir: (metodo: "GET" | "POST", cuerpo?: Record<string, unknown>, ruta?: string) => Promise<unknown>;
  recargar: () => Promise<void>;
  /** El admin hace el recorrido completo con su cuenta, sin abrirla a nadie (no cuenta). */
  modoPrueba: boolean;
  cambiarModoPrueba: (valor: boolean) => void;
}

const Ctx = createContext<Valor>({
  activa: false,
  info: null,
  desfaseMs: 0,
  veEntrada: false,
  pedir: async () => null,
  recargar: async () => {},
  modoPrueba: false,
  cambiarModoPrueba: () => {},
});

const CLAVE_MODO_PRUEBA = "evaluacion-en-linea:modo-prueba";

export function EvaluacionEnLineaProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const rol = profile?.role;
  const esAdmin = rol === "admin";
  const esPersonal = rol === "esdomed" || rol === "asistente_esdomed";
  const [activa, setActiva] = useState(false);
  const [info, setInfo] = useState<MiEvaluacion | null>(null);
  const [desfaseMs, setDesfaseMs] = useState(0);
  // Se recuerda en la pestaña para que recargar no saque al admin de su prueba.
  const [modoPruebaGuardado, setModoPruebaGuardado] = useState(() => {
    try {
      return typeof window !== "undefined" && sessionStorage.getItem(CLAVE_MODO_PRUEBA) === "1";
    } catch {
      return false;
    }
  });
  const modoPrueba = esAdmin && modoPruebaGuardado;
  const cambiarModoPrueba = useCallback((valor: boolean) => {
    setModoPruebaGuardado(valor);
    setInfo(null);
    try {
      if (valor) sessionStorage.setItem(CLAVE_MODO_PRUEBA, "1");
      else sessionStorage.removeItem(CLAVE_MODO_PRUEBA);
    } catch { /* nada */ }
  }, []);

  useEffect(() => {
    if (!esAdmin && !esPersonal) return;
    return onSnapshot(
      doc(db, DOC_ESTADO_EVALUACION.coleccion, DOC_ESTADO_EVALUACION.id),
      (s) => setActiva(s.data()?.activa === true),
      () => setActiva(false),
    );
  }, [esAdmin, esPersonal]);

  const pedir = useCallback(async (metodo: "GET" | "POST", cuerpo?: Record<string, unknown>, ruta = "/api/evaluacion-en-linea") => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Sin sesión.");
    const r = await fetch(ruta, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, ...(cuerpo ? { "Content-Type": "application/json" } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      cache: "no-store",
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((datos as { error?: string }).error || "No se pudo completar.");
    if (typeof (datos as { ahoraMs?: number }).ahoraMs === "number") setDesfaseMs((datos as { ahoraMs: number }).ahoraMs - Date.now());
    if (ruta.startsWith("/api/evaluacion-en-linea") && !ruta.includes("panel=1") && typeof (datos as MiEvaluacion).elegible === "boolean") {
      setInfo(datos as MiEvaluacion);
    }
    return datos;
  }, []);

  const recargar = useCallback(async () => {
    if (modoPrueba) await pedir("GET", undefined, "/api/evaluacion-en-linea?prueba=1").catch(() => {});
    else if (esPersonal) await pedir("GET").catch(() => {});
  }, [esPersonal, modoPrueba, pedir]);

  // El personal consulta su evaluación cuando se abre (o al entrar con ella abierta).
  useEffect(() => {
    if (!esPersonal || !user || !activa) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consulta a la API; el estado cambia al responder
    void recargar();
  }, [activa, esPersonal, user, recargar]);

  // Ya entregada (o vencida) o cerrada por el admin, todo vuelve a la normalidad.
  const veEntrada = esAdmin || Boolean(info?.elegible && ((activa && info.estado === "por_iniciar") || info.estado === "en_curso"));

  return (
    <Ctx.Provider value={{ activa, info, desfaseMs, veEntrada, pedir, recargar, modoPrueba, cambiarModoPrueba }}>
      {children}
    </Ctx.Provider>
  );
}

export const useEvaluacionEnLinea = () => useContext(Ctx);
