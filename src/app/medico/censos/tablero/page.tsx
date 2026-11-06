"use client";

// Tablero de censos de emergencia. Lee un documento de contadores por mes, no los
// censos: ver un mes cuesta 1 lectura aunque tenga miles de atenciones.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import type { ResumenCensoMes, TipoCenso } from "@/types";
import { puedeVerTableroCensos } from "@/lib/accesoTableroCensos";
import { diaDe, mesesDelTablero } from "@/lib/emergencia/resumenCenso";
import {
  buscarDesajustes, cargarResumenes, reconstruirMes, type DesajusteResumen,
} from "@/lib/emergencia/resumenCensoDatos";
import { TableroCensos } from "@/components/emergencia/tablero/TableroCensos";

// Basta con los meses recientes: son los únicos que todavía se editan.
const MESES_REVISADOS = 3;

interface Lectura {
  resumenes: ResumenCensoMes[];
  desajustes: DesajusteResumen[];
  leidoEn: Date;
}

export default function TableroCensosPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const puedeVer = puedeVerTableroCensos(profile);
  const hoy = diaDe(new Date());
  const mesActual = hoy.slice(0, 7);

  const [tipo, setTipo] = useState<TipoCenso>("demanda");
  const [lecturas, setLecturas] = useState<Partial<Record<TipoCenso, Lectura>>>({});
  const [cargando, setCargando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !puedeVer) router.replace("/medico");
  }, [loading, puedeVer, router]);

  const cargar = useCallback(async (t: TipoCenso) => {
    setCargando(true);
    setError(null);
    try {
      const resumenes = await cargarResumenes(t);
      const meses = mesesDelTablero(mesActual).slice(0, MESES_REVISADOS);
      const desajustes = await buscarDesajustes(t, meses, resumenes);
      setLecturas((l) => ({ ...l, [t]: { resumenes, desajustes, leidoEn: new Date() } }));
    } catch (e) {
      setError(`No se pudo cargar el tablero: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setCargando(false);
    }
  }, [mesActual]);

  const leida = !!lecturas[tipo];
  useEffect(() => {
    if (!puedeVer || leida) return;
    const t = setTimeout(() => { cargar(tipo); }, 0);
    return () => clearTimeout(t);
  }, [puedeVer, leida, tipo, cargar]);

  const lectura = lecturas[tipo];

  const recalcular = async () => {
    setRecalculando(true);
    setError(null);
    try {
      for (const d of lectura?.desajustes ?? []) await reconstruirMes(tipo, d.mes);
      await cargar(tipo);
    } catch (e) {
      setError(`No se pudo recalcular: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setRecalculando(false);
    }
  };

  if (!puedeVer) return null;

  return (
    <TableroCensos
      tipo={tipo}
      onTipo={setTipo}
      resumenes={lectura?.resumenes ?? null}
      desajustes={lectura?.desajustes ?? []}
      hoy={hoy}
      cargando={cargando}
      recalculando={recalculando}
      error={error}
      leidoEn={lectura?.leidoEn ?? null}
      onActualizar={() => cargar(tipo)}
      onRecalcular={recalcular}
    />
  );
}
