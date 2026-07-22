"use client";

import { useRef, useState } from "react";
import { Copy, Check, AlertTriangle } from "lucide-react";

interface Props {
  codigo: string;
}

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100";

export function PasoCodigo({ codigo }: Props) {
  const [copiado, setCopiado] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      seleccionar();
    }
  };

  const seleccionar = () => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
          3. Código para la consola de Chrome
        </h2>

        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 mb-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Este código no presiona &quot;Grabar&quot; en SIMMOW. Abra SIMMOW, entre a la pantalla de
            Ingreso/Egreso del paciente, presione F12 para abrir la consola, pegue el código, presione
            Enter, y revise cada campo antes de grabar manualmente.
          </span>
        </div>

        <div className="flex gap-2 mb-3">
          <button
            onClick={copiar}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiado ? "Copiado" : "Copiar código"}
          </button>
          <button
            onClick={seleccionar}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-sm font-medium rounded-lg transition-colors"
          >
            Seleccionar todo
          </button>
        </div>

        <textarea
          ref={textareaRef}
          readOnly
          value={codigo}
          className={inputCls + " font-mono h-64 resize-y"}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
    </div>
  );
}
