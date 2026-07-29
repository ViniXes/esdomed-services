"use client";

import { useEffect, useState } from "react";
import { X, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { TERMINOS_SIMMOW_VERSION } from "@/lib/simmow/terminosSimmow";

const DIAS_RECORDATORIO = 30;
const CLAVE_LOCALSTORAGE = "simmow_recordatorio_terminos_ultimo";

function aFecha(valor: unknown): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === "object" && "toDate" in (valor as object)) {
    return (valor as { toDate: () => Date }).toDate();
  }
  return null;
}

/**
 * Recordatorio NO bloqueante para releer los términos de SIMMOW cada cierto
 * tiempo — no exige re-aceptar (eso generaría "fatiga de clic": la gente
 * marcaría la casilla por reflejo sin leer, lo que debilitaría el valor de
 * la aceptación como evidencia de que de verdad se leyó). Solo un aviso
 * descartable que reaparece pasados ~30 días desde la aceptación o desde el
 * último descarte, para mantener presente el alcance de la herramienta.
 */
export function RecordatorioTerminosSimmow() {
  const { profile } = useAuth();
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    if (!profile || profile.terminosSimmowAceptados?.version !== TERMINOS_SIMMOW_VERSION) {
      setMostrar(false);
      return;
    }

    const fechaAceptacion = aFecha(profile.terminosSimmowAceptados.fecha);
    let ultimoDescarte = 0;
    try {
      ultimoDescarte = Number(window.localStorage.getItem(CLAVE_LOCALSTORAGE)) || 0;
    } catch {
      /* noop */
    }

    const referencia = Math.max(fechaAceptacion?.getTime() ?? 0, ultimoDescarte);
    const dias = (Date.now() - referencia) / (24 * 60 * 60 * 1000);
    setMostrar(referencia > 0 && dias >= DIAS_RECORDATORIO);
  }, [profile]);

  if (!mostrar) return null;

  const descartar = () => {
    try {
      window.localStorage.setItem(CLAVE_LOCALSTORAGE, String(Date.now()));
    } catch {
      /* noop */
    }
    setMostrar(false);
  };

  return (
    <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg px-3 py-2 mb-4">
      <Info size={14} className="shrink-0" />
      <span className="flex-1">
        Aceptó los términos de uso de esta herramienta hace más de un mes — le recomendamos releerlos con el botón
        &quot;Ver términos de uso&quot; de arriba, para tener siempre presente su alcance.
      </span>
      <button
        onClick={descartar}
        className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 shrink-0"
        title="Descartar por ahora"
      >
        <X size={14} />
      </button>
    </div>
  );
}
