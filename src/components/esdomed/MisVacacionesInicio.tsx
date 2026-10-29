"use client";

import { useEffect, useState } from "react";
import { Plane } from "lucide-react";
import type { VacacionProgramada } from "@/types";
import { NOMBRES_MES } from "@/lib/esdomed/plan";
import { cargarProgramacionVacaciones, proximaVacacionDe, rangoQuincena } from "@/lib/esdomed/vacaciones";

type Programa = { anio: number; asignaciones: VacacionProgramada[] };

const DIA_MS = 86_400_000;

// La programación cambia pocas veces al año: se guarda en la sesión del día
// para no volver a leerla cada vez que se regresa al Inicio.
async function programaDelAnio(anio: number): Promise<Programa> {
  const clave = `vacaciones-programadas:${anio}`;
  const dia = new Date().toDateString();
  try {
    const raw = window.sessionStorage.getItem(clave);
    const guardado = raw ? (JSON.parse(raw) as { dia: string; asignaciones: VacacionProgramada[] }) : null;
    if (guardado?.dia === dia && Array.isArray(guardado.asignaciones)) return { anio, asignaciones: guardado.asignaciones };
  } catch { /* sin caché */ }
  const programa = await cargarProgramacionVacaciones(anio);
  const asignaciones = programa?.asignaciones ?? [];
  try {
    window.sessionStorage.setItem(clave, JSON.stringify({ dia, asignaciones }));
  } catch { /* sin caché */ }
  return { anio, asignaciones };
}

/**
 * Aviso de la vacación programada (en curso o la próxima) de quien entra.
 * No dibuja nada si la persona no tiene vacaciones por delante, así el Inicio
 * de los demás queda igual. "hero" va dentro del encabezado azul del panel;
 * "tarjeta" sobre fondo claro (Inicio de Horarios).
 */
export function MisVacacionesInicio({
  persona,
  variante = "hero",
}: {
  persona: { uid?: string; codigoMarcacion?: string };
  variante?: "hero" | "tarjeta";
}) {
  const [programas, setProgramas] = useState<Programa[] | null>(null);

  useEffect(() => {
    let vivo = true;
    const hoy = new Date();
    // Desde octubre ya puede estar armada la del año siguiente.
    const anios = hoy.getMonth() >= 9 ? [hoy.getFullYear(), hoy.getFullYear() + 1] : [hoy.getFullYear()];
    Promise.all(anios.map(programaDelAnio))
      .then((p) => { if (vivo) setProgramas(p); })
      .catch(() => { /* sin permiso o sin conexión: simplemente no se muestra */ });
    return () => { vivo = false; };
  }, []);

  if (!programas || !persona.uid) return null;
  const hoy = new Date();
  const vacacion = proximaVacacionDe(programas, { uid: persona.uid, codigoMarcacion: persona.codigoMarcacion ?? "" }, hoy);
  if (!vacacion) return null;

  const hoyDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const enCurso = vacacion.desde <= hoyDia;
  const faltan = Math.round((vacacion.desde.getTime() - hoyDia.getTime()) / DIA_MS);
  const otroAnio = vacacion.anio !== hoy.getFullYear() ? ` de ${vacacion.anio}` : "";
  const texto = enCurso
    ? `Estás de vacaciones hasta el ${vacacion.hasta.getDate()} de ${NOMBRES_MES[vacacion.mes - 1].toLowerCase()}`
    : `Tus vacaciones: ${rangoQuincena(vacacion.mes, vacacion.quincena)}${otroAnio}`;
  const detalle = enCurso ? null : faltan === 1 ? "empiezan mañana" : `faltan ${faltan} días`;

  if (variante === "tarjeta") {
    return (
      <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <Plane size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          <span className="font-semibold">{texto}</span>
          {detalle && <span> · {detalle}</span>}
        </span>
      </p>
    );
  }

  return (
    <p className="mt-3 inline-flex max-w-full items-start gap-2 rounded-xl bg-white/15 px-3 py-1.5 text-sm text-white ring-1 ring-white/20">
      <Plane size={14} className="mt-0.5 shrink-0" />
      <span>
        <span className="font-semibold">{texto}</span>
        {detalle && <span className="text-cyan-50/85"> · {detalle}</span>}
      </span>
    </p>
  );
}
