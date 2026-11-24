"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { ActualizacionCE, CitaRegistradaCE, RegistroExpedienteCE } from "@/lib/consultaExterna/productividad";

/**
 * Lee la productividad de Consulta Externa del mes (GET /api/productividad/expedientes-ce)
 * cuando la pestaña está activa, una vez por mes; `recargar()` vuelve a pedirla.
 */
export function useProductividadCE(mes: string, activa: boolean) {
  const { user } = useAuth();
  const [registros, setRegistros] = useState<RegistroExpedienteCE[]>([]);
  const [actualizaciones, setActualizaciones] = useState<ActualizacionCE[]>([]);
  const [citas, setCitas] = useState<CitaRegistradaCE[]>([]);
  const [mesCargado, setMesCargado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async (forzar = false) => {
    if (!user || (!forzar && mesCargado === mes)) return;
    setCargando(true); setError("");
    try {
      const r = await fetch(`/api/productividad/expedientes-ce?mes=${encodeURIComponent(mes)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "No se pudo cargar la productividad de Consulta Externa.");
      setRegistros(data.registros ?? []);
      setActualizaciones(data.actualizaciones ?? []);
      setCitas(data.citas ?? []);
      setMesCargado(mes);
    } catch (e) {
      setRegistros([]);
      setActualizaciones([]);
      setCitas([]);
      setError(e instanceof Error ? e.message : "No se pudo cargar la productividad de Consulta Externa.");
    } finally { setCargando(false); }
  }, [user, mes, mesCargado]);

  useEffect(() => {
    if (!activa || mesCargado === mes) return;
    const t = window.setTimeout(() => { void cargar(); }, 0);
    return () => window.clearTimeout(t);
  }, [activa, mes, mesCargado, cargar]);

  return { registros, actualizaciones, citas, cargando, error, recargar: () => cargar(true) };
}
