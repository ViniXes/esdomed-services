"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { SERVICIOS_HOSPITALARIOS, CAMAS_POR_SERVICIO } from "@/lib/servicios";

export type ServicioConfig = { nombre: string; camas: string[] };

const DEFAULT_LISTA: ServicioConfig[] = (SERVICIOS_HOSPITALARIOS as readonly string[]).map(
  (nombre) => ({
    nombre,
    camas: CAMAS_POR_SERVICIO[nombre as keyof typeof CAMAS_POR_SERVICIO] ?? [],
  })
);

interface ServiciosContextValue {
  lista: ServicioConfig[];
  servicios: string[];
  getCamas: (servicio: string) => string[];
  loading: boolean;
}

const ServiciosContext = createContext<ServiciosContextValue>({
  lista: DEFAULT_LISTA,
  servicios: DEFAULT_LISTA.map((s) => s.nombre),
  getCamas: (nombre) => DEFAULT_LISTA.find((s) => s.nombre === nombre)?.camas ?? [],
  loading: true,
});

export function ServiciosProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<ServicioConfig[]>(DEFAULT_LISTA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "configuracion", "servicios"),
      (snap) => {
        if (snap.exists()) {
          const raw = snap.data().lista;
          if (Array.isArray(raw) && raw.length > 0) {
            setLista(raw as ServicioConfig[]);
          }
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  return (
    <ServiciosContext.Provider
      value={{
        lista,
        servicios: lista.map((s) => s.nombre),
        getCamas: (nombre) => lista.find((s) => s.nombre === nombre)?.camas ?? [],
        loading,
      }}
    >
      {children}
    </ServiciosContext.Provider>
  );
}

export function useServicios() {
  return useContext(ServiciosContext);
}
