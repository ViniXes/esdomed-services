"use client";

// Página temporal solo para verificación visual del DateTimeField. Se elimina al terminar.
import { useState } from "react";
import { DateTimeField } from "@/components/ui/DateTimeField";

export default function DevDateTimeFieldPage() {
  const [v, setV] = useState("2026-07-02T01:25");
  return (
    <div className="min-h-screen bg-slate-50 p-10">
      <div className="max-w-sm space-y-4 bg-white border border-slate-200 rounded-2xl p-5">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Fecha y hora de defunción <span className="text-red-500">*</span>
          </label>
          <DateTimeField
            value={v}
            onChange={setV}
            ariaLabel="Fecha y hora de defunción"
            minDate={new Date(2026, 5, 27, 22, 13)}
            maxDate={new Date()}
          />
        </div>
        <p className="text-xs text-slate-400 font-mono">valor: {v}</p>
      </div>
    </div>
  );
}
