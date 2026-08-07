"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

// Posición del globo arrastrable, persistida por navegador.
const POS_KEY = "soporte-globo-pos";
const BTN = 80;    // tamaño del botón (w-20 h-20)
const MARGEN = 8;  // margen mínimo contra los bordes de la pantalla

type Pos = { x: number; y: number };

function clampPantalla(p: Pos): Pos {
  return {
    x: Math.min(Math.max(p.x, MARGEN), window.innerWidth - BTN - MARGEN),
    y: Math.min(Math.max(p.y, MARGEN), window.innerHeight - BTN - MARGEN),
  };
}

export function SoporteGlobo() {
  const [isOpen, setIsOpen] = useState(false);
  // null = posición por defecto (abajo a la derecha), sin haberlo movido.
  const [pos, setPos] = useState<Pos | null>(null);
  const drag = useRef<{ dx: number; dy: number; x0: number; y0: number; movido: boolean; ultima?: Pos } | null>(null);
  const fueArrastre = useRef(false);

  // Restaurar la posición guardada y reencuadrar si cambia el tamaño de la ventana.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.x === "number" && typeof p?.y === "number") setPos(clampPantalla(p));
      }
    } catch { /* valor corrupto → posición por defecto */ }
    const onResize = () => setPos(p => (p ? clampPantalla(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, x0: e.clientX, y0: e.clientY, movido: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    // Umbral de 6px para no confundir un tap/click con un arrastre.
    if (!d.movido && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    d.movido = true;
    const destino = clampPantalla({ x: e.clientX - d.dx, y: e.clientY - d.dy });
    d.ultima = destino;
    setPos(destino);
  };

  const onPointerFin = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.movido || !d.ultima) return;
    // El click sintético que sigue al arrastre no debe abrir/cerrar el globo.
    fueArrastre.current = true;
    try { localStorage.setItem(POS_KEY, JSON.stringify(d.ultima)); } catch { /* sin storage */ }
  };

  const toggle = () => {
    if (fueArrastre.current) { fueArrastre.current = false; return; }
    setIsOpen(o => !o);
  };

  // El panel se abre hacia donde haya espacio según dónde quedó el botón.
  const abreAbajo = pos !== null && pos.y < 300;
  const alineaIzquierda = pos !== null && pos.x + BTN / 2 < window.innerWidth / 2;

  return (
    <div
      className={`fixed z-50 ${pos ? "" : "bottom-6 right-6"}`}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
    >
      {isOpen && (
        <div
          className={`absolute ${abreAbajo ? "top-full mt-4 slide-in-from-top-5" : "bottom-full mb-4 slide-in-from-bottom-5"} ${
            alineaIzquierda ? "left-0" : "right-0"
          } w-64 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 animate-in fade-in duration-200`}
        >
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-slate-800 dark:text-slate-100">
              Soporte ESDOMED
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
              <X size={16} />
            </button>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            ¿Necesitas asistencia? Comunícate a las siguientes extensiones:
          </p>
          <div className="flex flex-col gap-2">
            <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-3 py-2 rounded-lg font-mono font-bold text-center border border-blue-200 dark:border-blue-800">
              📞 Ext. 2162
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-3 py-2 rounded-lg font-mono font-bold text-center border border-blue-200 dark:border-blue-800">
              📞 Ext. 2163
            </div>
          </div>
        </div>
      )}

      <button
        onClick={toggle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerFin}
        onPointerCancel={onPointerFin}
        className="w-20 h-20 rounded-full bg-white dark:bg-slate-800 shadow-2xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center hover:scale-105 hover:shadow-blue-500/20 active:scale-95 transition-all touch-none select-none cursor-grab active:cursor-grabbing"
        title="Soporte (arrastralo para moverlo)"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vault-tec.png"
          alt="Soporte"
          draggable={false}
          className="w-full h-full object-cover pointer-events-none"
        />
      </button>
    </div>
  );
}
