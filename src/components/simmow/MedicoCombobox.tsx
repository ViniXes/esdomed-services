"use client";

import { useRef, useState } from "react";
import { buscarMedicos, cargarMedicos, type MedicoSimmow } from "@/lib/simmow/medicos";

interface Props {
  nombre: string;
  codigo: string;
  onChange: (nombre: string, codigo: string) => void;
  className?: string;
}

/**
 * Combobox de búsqueda contra el catálogo real de médicos de SIMMOW (código
 * interno + nombre + JVPM). El campo "Médico Responsable" de SIMMOW espera
 * el CÓDIGO interno, no el JVPM del SIS — por eso el nombre no precargaba
 * automáticamente antes. Al elegir una opción se rellenan nombre y código
 * juntos; si se escribe libremente sin elegir, el código queda vacío (mejor
 * pedir que se busque/confirme a mano que mandar un código equivocado).
 */
export function MedicoCombobox({ nombre, codigo, onChange, className }: Props) {
  const [nombreAnterior, setNombreAnterior] = useState(nombre);
  const [query, setQuery] = useState(nombre);
  const [entradas, setEntradas] = useState<MedicoSimmow[]>([]);
  const [resultados, setResultados] = useState<MedicoSimmow[]>([]);
  const [open, setOpen] = useState(false);
  const [cargando, setCargando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  if (nombre !== nombreAnterior) {
    setNombreAnterior(nombre);
    setQuery(nombre);
  }

  const cargarSiNecesario = async () => {
    if (entradas.length > 0) return;
    setCargando(true);
    const data = await cargarMedicos();
    setEntradas(data);
    setCargando(false);
  };

  const buscarConDebounce = (valor: string, catalogo: MedicoSimmow[]) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setResultados(valor.trim() && catalogo.length > 0 ? buscarMedicos(catalogo, valor) : []);
    }, 180);
  };

  const seleccionar = (m: MedicoSimmow) => {
    onChange(m.nombre, m.codigo);
    setQuery(m.nombre);
    setOpen(false);
    setResultados([]);
  };

  const handleChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const val = ev.target.value;
    setQuery(val);
    onChange(val, "");
    setOpen(true);
    buscarConDebounce(val, entradas);
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
      {codigo && (
        <span
          title="Código SIMMOW resuelto"
          style={{ marginLeft: 6, fontSize: "8pt", color: "#047857" }}
        >
          #{codigo}
        </span>
      )}
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
                {r.nombre} <span style={{ color: "#888" }}>(JVPM {r.jvpm || "N/A"})</span>
              </div>
            ))
          )}
        </div>
      )}
    </span>
  );
}
