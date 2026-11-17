"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { clave, filtrarOpciones } from "@/lib/consultaExterna/citasProgramadas";

// Lista cerrada con búsqueda: se escribe para filtrar (sugiere primero la más
// parecida, "car" → Carlos) y la flecha despliega la lista completa. Solo se
// puede elegir una opción de la lista: lo escrito que no calza se descarta.

export interface OpcionLista {
  valor: string;
  etiqueta: string;
  detalle?: string;
}

interface Props {
  id: string;
  opciones: OpcionLista[];
  valor: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Texto de la opción vacía ("Todas"); sin él, no se ofrece y la X limpia. */
  textoVacio?: string;
  className?: string;
}

export function ListaConBusqueda({ id, opciones, valor, onChange, placeholder, disabled, textoVacio, className }: Props) {
  const seleccionada = opciones.find((o) => o.valor === valor);
  const [texto, setTexto] = useState<string | null>(null); // null = muestra la seleccionada
  const [abierta, setAbierta] = useState(false);
  const [todas, setTodas] = useState(false); // abierta con la flecha: sin filtrar
  const [activa, setActiva] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const conVacio = useMemo(
    () => (textoVacio ? [{ valor: "", etiqueta: textoVacio }, ...opciones] : opciones),
    [opciones, textoVacio],
  );
  const visibles = useMemo(
    () => (todas || texto === null ? conVacio : filtrarOpciones(opciones, texto)),
    [todas, texto, conVacio, opciones],
  );

  const elegir = (o: OpcionLista) => {
    onChange(o.valor);
    setTexto(null);
    setAbierta(false);
    setTodas(false);
  };

  const cerrar = () => {
    // Si lo escrito es una opción (o calza con una sola), se toma; si no, se descarta.
    if (texto !== null) {
      const exacta = opciones.find((o) => clave(o.etiqueta) === clave(texto));
      const unica = texto.trim() ? filtrarOpciones(opciones, texto) : [];
      if (exacta) onChange(exacta.valor);
      else if (unica.length === 1) onChange(unica[0].valor);
      else if (!texto.trim() && textoVacio !== undefined) onChange("");
    }
    setTexto(null);
    setAbierta(false);
    setTodas(false);
  };

  const mostrado = texto ?? (seleccionada?.etiqueta ?? (valor === "" && textoVacio ? textoVacio : ""));

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-expanded={abierta}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder ?? "Escriba para buscar…"}
        value={mostrado}
        onChange={(e) => {
          setTexto(e.target.value);
          setTodas(false);
          setAbierta(true);
          setActiva(0);
        }}
        onFocus={(e) => {
          e.target.select();
          setAbierta(true);
        }}
        onBlur={() => setTimeout(cerrar, 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAbierta(true);
            setActiva((a) => Math.min(a + 1, visibles.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiva((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            if (abierta && visibles[activa]) {
              e.preventDefault();
              elegir(visibles[activa]);
            }
          } else if (e.key === "Escape") {
            setTexto(null);
            setAbierta(false);
          }
        }}
        className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-16 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800"
      />
      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
        {valor && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Limpiar"
            className="rounded p-1 text-slate-400 hover:text-slate-600"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              setTexto(null);
            }}
          >
            <X size={14} />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Ver la lista"
          disabled={disabled}
          className="rounded p-1 text-slate-500 hover:text-slate-700 disabled:opacity-40"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (abierta && todas) {
              setAbierta(false);
              setTodas(false);
            } else {
              setTodas(true);
              setTexto(null);
              setAbierta(true);
              setActiva(Math.max(0, conVacio.findIndex((o) => o.valor === valor)));
              inputRef.current?.focus();
            }
          }}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {abierta && !disabled && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full min-w-[16rem] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {visibles.length === 0 ? (
            <li className="px-3 py-2 text-slate-500">Sin coincidencias</li>
          ) : (
            visibles.map((o, i) => (
              <li
                key={o.valor || "__vacio"}
                role="option"
                aria-selected={o.valor === valor}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiva(i)}
                onClick={() => elegir(o)}
                className={`cursor-pointer px-3 py-1.5 ${
                  i === activa ? "bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200" : "text-slate-700 dark:text-slate-200"
                } ${o.valor === valor ? "font-semibold" : ""}`}
              >
                {o.etiqueta}
                {o.detalle && <span className="block text-xs text-slate-500 dark:text-slate-400">{o.detalle}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
