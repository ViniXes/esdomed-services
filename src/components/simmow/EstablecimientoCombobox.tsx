"use client";

import { useEffect, useRef, useState } from "react";
import {
  buscarEstablecimientos,
  cargarEstablecimientos,
  type EstablecimientoSimmow,
} from "@/lib/simmow/establecimientos";

interface Props {
  value: string;
  onChange: (nombre: string) => void;
  className?: string;
}

/**
 * Combobox de búsqueda contra el catálogo real de establecimientos de SIMMOW
 * (1743 nombres extraídos de la página real). El campo sigue siendo texto
 * libre editable — buscar y elegir una opción solo la rellena con el nombre
 * EXACTO que espera SIMMOW, para que el script generado ya no tenga que
 * adivinar por fuzzy-match dentro de la consola.
 */
export function EstablecimientoCombobox({ value, onChange, className }: Props) {
  const [query, setQuery] = useState(value);
  const [entradas, setEntradas] = useState<EstablecimientoSimmow[]>([]);
  const [resultados, setResultados] = useState<EstablecimientoSimmow[]>([]);
  const [open, setOpen] = useState(false);
  const [cargando, setCargando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const cargarSiNecesario = async () => {
    if (entradas.length > 0) return;
    setCargando(true);
    const data = await cargarEstablecimientos();
    setEntradas(data);
    setCargando(false);
  };

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setResultados(query.trim() && entradas.length > 0 ? buscarEstablecimientos(entradas, query) : []);
    }, 180);
    return () => clearTimeout(debounceRef.current);
  }, [query, entradas]);

  const seleccionar = (e: EstablecimientoSimmow) => {
    onChange(e.nombre);
    setQuery(e.nombre);
    setOpen(false);
    setResultados([]);
  };

  const handleChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const val = ev.target.value;
    setQuery(val);
    onChange(val);
    setOpen(true);
    cargarSiNecesario();
  };

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <input
        className={className}
        value={query}
        onChange={handleChange}
        onFocus={() => {
          setOpen(true);
          cargarSiNecesario();
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && query.trim() && (
        <div
          style={{
            position: "absolute",
            zIndex: 50,
            left: 0,
            top: "100%",
            background: "#ffffff",
            color: "#000000",
            border: "1px solid #777",
            maxHeight: 180,
            overflowY: "auto",
            minWidth: 300,
            fontSize: "8pt",
            fontFamily: "Arial, Tahoma, Verdana, Helvetica, sans-serif",
            boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
          }}
        >
          {cargando ? (
            <div style={{ padding: "4px 6px", color: "#666" }}>Cargando catálogo...</div>
          ) : resultados.length === 0 ? (
            <div style={{ padding: "4px 6px", color: "#666", fontStyle: "italic" }}>
              Sin coincidencias — puede escribir libremente.
            </div>
          ) : (
            resultados.map((r) => (
              <div
                key={r.codigo}
                onMouseDown={() => seleccionar(r)}
                style={{ padding: "3px 6px", cursor: "pointer", borderBottom: "1px solid #eee" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#e0e8ff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "";
                }}
              >
                {r.nombre}
              </div>
            ))
          )}
        </div>
      )}
    </span>
  );
}
