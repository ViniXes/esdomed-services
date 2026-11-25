"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { RUTA_TRABAJO_SOCIAL_CE, consultaGestionesTSCE, registraGestionesTSCE } from "@/lib/accesoConsultaExterna";

// Sesión y llamadas a la API de Trabajo Social de Consulta Externa. Las
// pantallas las toman de aquí, así se pueden ver con datos falsos (prop `valor`).

const BASE = "/api/consulta-externa/trabajo-social";

/** Rutas de la API (relativas a BASE) que se arman en más de un lugar. */
export const RUTAS_API_TS = {
  adjuntos: (gestionId: string) => `/gestiones/${encodeURIComponent(gestionId)}/adjuntos`,
};

/** Seguimiento es la lista de gestiones; cada gestión abre su propia pantalla. */
export const RUTAS_TS = {
  seguimiento: RUTA_TRABAJO_SOCIAL_CE,
  nueva: `${RUTA_TRABAJO_SOCIAL_CE}/nueva`,
  gestion: (id: string) => `${RUTA_TRABAJO_SOCIAL_CE}/gestion/${encodeURIComponent(id)}`,
  /** La ficha de un paciente en el directorio. */
  directorio: (clave: string) => `${RUTA_TRABAJO_SOCIAL_CE}/directorio?p=${encodeURIComponent(clave)}`,
};

export interface ContextoTS {
  uid: string;
  /** Área de la cuenta; vacía en el admin y la jefatura. */
  area: string;
  esAdmin: boolean;
  /** Registra gestiones (la jefatura solo consulta). */
  registra: boolean;
  llamar: <T>(ruta: string, metodo?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", cuerpo?: unknown) => Promise<T>;
  /** Sube un archivo (multipart) a una ruta de la API. */
  subir: <T>(ruta: string, archivo: File) => Promise<T>;
}

const Ctx = createContext<ContextoTS | null>(null);

export function useTS(): ContextoTS {
  const v = useContext(Ctx);
  if (!v) throw new Error("Falta ProveedorTS");
  return v;
}

export function ContextoTSPrueba({ valor, children }: { valor: ContextoTS; children: React.ReactNode }) {
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** `soloConsulta`: la jefatura, desde su menú. */
export function ProveedorTS({ soloConsulta = false, children }: { soloConsulta?: boolean; children: React.ReactNode }) {
  const { user, profile } = useAuth();

  const llamar = useCallback<ContextoTS["llamar"]>(async (ruta, metodo = "GET", cuerpo) => {
    if (!user) throw new Error("Sesión no iniciada.");
    let r: Response;
    try {
      r = await fetch(BASE + ruta, {
        method: metodo,
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(cuerpo ? { "Content-Type": "application/json" } : {}) },
        ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
      });
    } catch {
      throw new Error("Sin conexión. Revise la red e intente de nuevo.");
    }
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || "No se pudo completar.");
    return datos;
  }, [user]);

  const subir = useCallback<ContextoTS["subir"]>(async (ruta, archivo) => {
    if (!user) throw new Error("Sesión no iniciada.");
    const cuerpo = new FormData();
    cuerpo.append("archivo", archivo, archivo.name);
    let r: Response;
    try {
      // Sin Content-Type: el navegador pone el del formulario con su separador.
      r = await fetch(BASE + ruta, { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}` }, body: cuerpo });
    } catch {
      throw new Error("Sin conexión. Revise la red e intente de nuevo.");
    }
    // El servidor corta las peticiones grandes antes de llegar a la API, sin respuesta legible.
    if (r.status === 413) throw new Error("Pesa demasiado para subirlo.");
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || "No se pudo subir el archivo.");
    return datos;
  }, [user]);

  const valor = useMemo<ContextoTS | null>(() => profile && {
    uid: profile.uid,
    area: profile.areaTSCE ?? "",
    esAdmin: profile.role === "admin",
    registra: !soloConsulta && registraGestionesTSCE(profile),
    llamar,
    subir,
  }, [profile, soloConsulta, llamar, subir]);

  if (!valor) return null;
  if (!consultaGestionesTSCE(profile)) {
    return <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Su cuenta no tiene acceso a esta página.</p>;
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const mensaje = (e: unknown): string => (e instanceof Error ? e.message : "No se pudo completar.");
