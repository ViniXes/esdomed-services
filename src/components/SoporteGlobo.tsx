"use client";

import { useState } from "react";
import { X } from "lucide-react";

export function SoporteGlobo() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-64 animate-in slide-in-from-bottom-5 fade-in duration-200">
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
        onClick={() => setIsOpen(!isOpen)}
        className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 shadow-2xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center hover:scale-105 hover:shadow-blue-500/20 active:scale-95 transition-all"
        title="Soporte"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src="/vault-tec.png" 
          alt="Soporte" 
          className="w-full h-full object-cover"
        />
      </button>
    </div>
  );
}
