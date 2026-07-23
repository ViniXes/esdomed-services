"use client";

import { useRef, useState } from "react";
import {
  buscarMedicoPorCodigo,
  buscarMedicos,
  cargarMedicos,
  type MedicoSimmow,
} from "@/lib/simmow/medicos";

interface Props {
  nombre: string;
  codigo: string;
  onChange: (nombre: string, codigo: string) => void;
  codigoClassName?: string;
  nombreClassName?: string;
}

/**
 * Réplica de las dos casillas de "Médico Responsable" tal como aparecen en
 * SIMMOW: primero el CÓDIGO interno (casilla angosta, lo que realmente se
 * digita/pega en SIMMOW), luego el NOMBRE (casilla ancha, de solo lectura en
 * SIMMOW — se autocompleta al validar el código). Acá el nombre es la
 * casilla donde se busca por nombre contra el catálogo real de médicos de
 * SIMMOW (el JVPM del SIS no sirve para este campo); al elegir una opción se
 * rellenan código y nombre juntos. También se puede escribir el código
 * directo en la primera casilla: al salir de ella se busca su nombre en el
 * catálogo, igual que SIMMOW.
 */
export function MedicoCombobox({ nombre, codigo, onChange, codigoClassName, nombreClassName }: Props) {
  const [nombreAnterior, setNombreAnterior] = useState(nombre);
  const [codigoAnterior, setCodigoAnterior] = useState(codigo);
  const [query, setQuery] = useState(nombre);
  const [codigoQuery, setCodigoQuery] = useState(codigo);
  const [entradas, setEntradas] = useState<MedicoSimmow[]>([]);
  const [resultados, setResultados] = useState<MedicoSimmow[]>([]);
  const [open, setOpen] = useState(false);
  const [cargando, setCargando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  if (nombre !== nombreAnterior) {
    setNombreAnterior(nombre);
    setQuery(nombre);
  }
  if (codigo !== codigoAnterior) {
    setCodigoAnterior(codigo);
    setCodigoQuery(codigo);
  }

  const cargarSiNecesario = async () => {
    if (entradas.length > 0) return entradas;
    setCargando(true);
    const data = await cargarMedicos();
    setEntradas(data);
    setCargando(false);
    return data;
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
    setCodigoQuery(m.codigo);
    setOpen(false);
    setResultados([]);
  };

  const handleChangeNombre = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const val = ev.target.value;
    setQuery(val);
    onChange(val, "");
    setCodigoQuery("");
    setOpen(true);
    cargarSiNecesario().then((data) => buscarConDebounce(val, data));
  };

  const handleChangeCodigo = (ev: React.ChangeEvent<HTMLInputElement>) => {
    setCodigoQuery(ev.target.value);
  };

  const handleBlurCodigo = async () => {
    const c = codigoQuery.trim();
    if (!c) {
      onChange("", "");
      return;
    }
    const data = await cargarSiNecesario();
    const encontrado = buscarMedicoPorCodigo(data, c);
    if (encontrado) {
      onChange(encontrado.nombre, encontrado.codigo);
      setQuery(encontrado.nombre);
    } else {
      onChange("", c);
    }
  };

  return (
    <>
      <input
        className={codigoClassName}
        value={codigoQuery}
        onChange={handleChangeCodigo}
        onBlur={handleBlurCodigo}
      />
      <span style={{ position: "relative", display: "inline-block" }}>
        <input
          className={nombreClassName}
          value={query}
          onChange={handleChangeNombre}
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
                Sin coincidencias — puede escribir el código directamente en la casilla anterior.
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
    </>
  );
}
