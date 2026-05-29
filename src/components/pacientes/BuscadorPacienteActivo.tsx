"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useServicios } from "@/contexts/ServiciosContext";
import { Layers, Hash, BedDouble } from "lucide-react";
import type { Paciente } from "@/types";

type Modo = "servicio" | "expediente" | "cama";

const ACENTOS = {
  teal: {
    sel: "border-teal-500 bg-teal-50 dark:bg-teal-950 ring-1 ring-teal-500/30",
    hover: "hover:border-teal-300 dark:hover:border-teal-800",
    on: "bg-teal-600 text-white border-teal-600",
    spin: "border-teal-500",
  },
  blue: {
    sel: "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-1 ring-blue-500/30",
    hover: "hover:border-blue-300 dark:hover:border-blue-800",
    on: "bg-blue-600 text-white border-blue-600",
    spin: "border-blue-500",
  },
} as const;

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

const MODOS: { m: Modo; label: string; icon: typeof Layers }[] = [
  { m: "servicio",   label: "Servicio",   icon: Layers },
  { m: "expediente", label: "Expediente", icon: Hash },
  { m: "cama",       label: "Cama",       icon: BedDouble },
];

interface Props {
  value: Paciente | null;
  onSelect: (p: Paciente | null) => void;
  accent?: keyof typeof ACENTOS;
}

export function BuscadorPacienteActivo({ value, onSelect, accent = "blue" }: Props) {
  const acc = ACENTOS[accent];
  const { servicios } = useServicios();
  const [modo, setModo] = useState<Modo>("servicio");
  const [servicio, setServicio] = useState("");
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [existeInactivo, setExisteInactivo] = useState(false);

  const cambiarModo = (m: Modo) => {
    if (m === modo) return;
    setModo(m);
    setServicio("");
    setTexto("");
    setResultados([]);
    setBuscado(false);
    setExisteInactivo(false);
    onSelect(null);
  };

  useEffect(() => {
    let cancel = false;
    const correr = async () => {
      const t = texto.trim();
      let q;
      if (modo === "servicio") {
        if (!servicio) { setResultados([]); setBuscado(false); setExisteInactivo(false); return; }
        q = query(collection(db, "pacientes"), where("servicioActual", "==", servicio));
      } else if (modo === "expediente") {
        if (!t) { setResultados([]); setBuscado(false); setExisteInactivo(false); return; }
        q = query(collection(db, "pacientes"), where("expediente", "==", t));
      } else {
        if (!t) { setResultados([]); setBuscado(false); setExisteInactivo(false); return; }
        q = query(collection(db, "pacientes"), where("camaActual", "==", t));
      }
      setLoading(true);
      try {
        const snap = await getDocs(q);
        if (cancel) return;
        let docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Paciente)).filter(p => p.estado === "activo");
        if (modo === "servicio") docs = docs.filter(p => p.camaActual);
        docs.sort((a, b) => (a.camaActual ?? "").localeCompare(b.camaActual ?? "", undefined, { numeric: true }));
        setResultados(docs);
        setExisteInactivo(snap.size > 0 && docs.length === 0);
        setBuscado(true);
      } catch {
        if (!cancel) { setResultados([]); setExisteInactivo(false); setBuscado(true); }
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    const id = window.setTimeout(correr, modo === "servicio" ? 0 : 400);
    return () => { cancel = true; window.clearTimeout(id); };
  }, [modo, servicio, texto]);

  const item = (p: Paciente) => (
    <button
      key={p.id}
      type="button"
      onClick={() => onSelect(p)}
      className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
        value?.id === p.id ? acc.sel : `border-slate-200 dark:border-slate-700 ${acc.hover}`
      }`}
    >
      <span className="inline-block font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 rounded px-1.5 py-0.5 mr-2">
        Cama {p.camaActual ?? "—"}
      </span>
      <span className="font-medium text-slate-800 dark:text-slate-200">{p.apellidos}, {p.nombres}</span>
      <span className="block text-xs text-slate-400 mt-0.5">
        {p.servicioActual} · Exp.&nbsp;{p.expediente}
      </span>
    </button>
  );

  const t = texto.trim();

  return (
    <div className="space-y-3">
      {/* Selector de modo */}
      <div className="flex gap-1.5">
        {MODOS.map(({ m, label, icon: Icon }) => (
          <button
            key={m}
            type="button"
            onClick={() => cambiarModo(m)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-medium transition-all ${
              modo === m ? acc.on : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Entrada según el modo */}
      {modo === "servicio" ? (
        <select value={servicio} onChange={e => setServicio(e.target.value)} className={inputCls}>
          <option value="">Seleccionar servicio...</option>
          {servicios.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      ) : (
        <input
          type="text"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder={modo === "expediente" ? "Número de expediente (ej. 1-26)" : "Cama (ej. MH1-05)"}
          className={inputCls}
        />
      )}

      {/* Resultados / mensajes */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
          <div className={`w-4 h-4 border-2 ${acc.spin} border-t-transparent rounded-full animate-spin`} />
          Buscando...
        </div>
      ) : resultados.length > 0 ? (
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
          {modo !== "servicio" && (
            <p className="text-xs text-slate-500 px-1">
              {modo === "cama"
                ? `Cama ocupada por ${resultados.length > 1 ? `${resultados.length} pacientes activos` : "un paciente activo"}:`
                : "Ingreso activo encontrado:"}
            </p>
          )}
          {resultados.map(item)}
        </div>
      ) : buscado ? (
        <p className="text-sm text-slate-400 py-2 px-1">
          {modo === "servicio" && "No hay pacientes activos en este servicio."}
          {modo === "expediente" && (existeInactivo
            ? `El expediente ${t} existe pero no tiene un ingreso activo.`
            : `No se encontró un ingreso con el expediente ${t}.`)}
          {modo === "cama" && (existeInactivo
            ? `La cama ${t} figura registrada pero sin paciente activo.`
            : `No hay ningún paciente activo en la cama ${t}.`)}
        </p>
      ) : null}
    </div>
  );
}
