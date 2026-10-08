"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

interface EstadoSincronizacion {
  sincronizadoEn: number | null;
  cargando: boolean;
  error: boolean;
}

const INICIAL: EstadoSincronizacion = { sincronizadoEn: null, cargando: true, error: false };
const Contexto = createContext<EstadoSincronizacion>(INICIAL);

export function SincronizacionSisProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const uid = profile?.uid;
  const permitido = profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";
  const [estado, setEstado] = useState<EstadoSincronizacion & { uid?: string }>(INICIAL);

  useEffect(() => {
    if (!permitido || !uid) return;
    // Un solo documento compartido: una importación refresca Inicio y los avisos
    // de todas las sesiones abiertas sin consultar nuevamente los pacientes.
    return onSnapshot(doc(db, "configuracion", "sincronizacion_pacientes_sis"), snapshot => {
      const valor = snapshot.data()?.sincronizadoEn;
      const fecha = typeof valor?.toMillis === "function" ? valor.toMillis() : undefined;
      const valida = typeof fecha === "number" && Number.isFinite(fecha) && fecha > 0;
      setEstado({ uid, sincronizadoEn: valida ? fecha : null, cargando: false, error: snapshot.exists() && !valida });
    }, () => {
      setEstado({ uid, sincronizadoEn: null, cargando: false, error: true });
    });
  }, [permitido, uid]);

  const valor = permitido && estado.uid === uid ? estado : INICIAL;
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useSincronizacionSis = () => useContext(Contexto);
