"use client";

// Buscador de establecimientos de los censos de emergencia: arriba los
// frecuentes con su nombre corto (DoctorSV primero) y, al escribir, el catálogo
// completo de SIMMOW (UCSF, ISSS, privados…), que se descarga la primera vez que
// se abre. Reglas y catálogo en lib/emergencia/establecimientosCenso.ts.
// La lista va en portal porque Seccion recorta su contenido (overflow-hidden).

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { cargarEstablecimientos, type EstablecimientoSimmow } from "@/lib/simmow/establecimientos";
import {
  GRUPOS_ESTABLECIMIENTO, OTRO_ESTABLECIMIENTO, buscarEstablecimientosCenso, claveEstablecimiento,
  detalleEstablecimiento, establecimientoFrecuente, nombreEstablecimiento,
} from "@/lib/emergencia/establecimientosCenso";
import { inputCls, posicionLista, type PosicionLista } from "@/components/emergencia/censoUi";

type Opcion = { valor: string; detalle?: string };

// Más alto que el de personal: las filas de frecuentes llevan dos líneas.
const ALTO_LISTA = 440;

export function BuscadorEstablecimiento({
  value, onChange, ariaLabel, placeholder = "Buscar hospital, UCSF, ISSS o privado…",
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [cursor, setCursor] = useState(-1);
  const [posicion, setPosicion] = useState<PosicionLista | null>(null);
  const [catalogo, setCatalogo] = useState<EstablecimientoSimmow[] | null>(null);
  const [errorCatalogo, setErrorCatalogo] = useState(false);

  const cargando = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const idLista = useId();

  const resultado = useMemo(() => buscarEstablecimientosCenso(busqueda, catalogo ?? []), [busqueda, catalogo]);
  const grupos = [
    ...GRUPOS_ESTABLECIMIENTO.map((g) => ({
      titulo: g.titulo,
      opciones: resultado.frecuentes
        .filter((e) => e.grupo === g.grupo)
        .map((e): Opcion => ({ valor: e.nombre, detalle: detalleEstablecimiento(e) })),
    })),
    { titulo: "Catálogo de SIMMOW", opciones: resultado.catalogo.map((e): Opcion => ({ valor: e.nombre })) },
  ].filter((g) => g.opciones.length > 0);
  const opciones = grupos.flatMap((g) => g.opciones);
  const activo = Math.min(cursor, opciones.length - 1);

  const claveValor = claveEstablecimiento(value);
  const detalleValor = (() => {
    const f = establecimientoFrecuente(value);
    return f ? detalleEstablecimiento(f) : undefined;
  })();
  const buscando = busqueda.trim().length > 0;

  useEffect(() => {
    if (!abierto) return;
    const mover = (e: Event) => {
      if (listaRef.current?.contains(e.target as Node)) return;
      if (inputRef.current) setPosicion(posicionLista(inputRef.current, ALTO_LISTA));
    };
    const tocarFuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!inputRef.current?.contains(t) && !listaRef.current?.contains(t)) inputRef.current?.blur();
    };
    window.addEventListener("scroll", mover, true);
    window.addEventListener("resize", mover);
    window.visualViewport?.addEventListener("resize", mover);
    document.addEventListener("pointerdown", tocarFuera);
    return () => {
      window.removeEventListener("scroll", mover, true);
      window.removeEventListener("resize", mover);
      window.visualViewport?.removeEventListener("resize", mover);
      document.removeEventListener("pointerdown", tocarFuera);
    };
  }, [abierto]);

  useEffect(() => {
    if (activo >= 0) listaRef.current?.querySelector('[data-activo="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  const cargarCatalogo = () => {
    if (catalogo || cargando.current) return;
    cargando.current = true;
    setErrorCatalogo(false);
    cargarEstablecimientos()
      .then(setCatalogo)
      .catch(() => setErrorCatalogo(true))
      .finally(() => { cargando.current = false; });
  };

  const abrir = (e: React.FocusEvent<HTMLInputElement>) => {
    setPosicion(posicionLista(e.currentTarget, ALTO_LISTA));
    setBusqueda("");
    setCursor(-1);
    setAbierto(true);
    cargarCatalogo();
  };

  const elegir = (valor: string) => {
    onChange(nombreEstablecimiento(valor));
    inputRef.current?.blur();
  };

  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(Math.min(activo + 1, opciones.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(Math.max(activo - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (opciones[activo]) elegir(opciones[activo].valor);
    } else if (e.key === "Escape") {
      inputRef.current?.blur();
    }
  };

  let indice = -1;

  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && activo >= 0 ? `${idLista}-${activo}` : undefined}
        autoComplete="off"
        title={value ? [value, detalleValor].filter(Boolean).join(" — ") : undefined}
        value={abierto ? busqueda : value}
        placeholder={(abierto && value) || placeholder}
        onChange={(e) => { setBusqueda(e.target.value); setCursor(e.target.value.trim() ? 0 : -1); }}
        onFocus={abrir}
        onBlur={() => setAbierto(false)}
        onKeyDown={teclas}
        className={`${inputCls} pl-9 pr-8 truncate`}
      />
      {value ? (
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onChange(""); setBusqueda(""); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          aria-label={`Quitar ${value}`}
        >
          <X size={13} />
        </button>
      ) : (
        <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      )}

      {abierto && posicion && createPortal(
        <div
          ref={listaRef}
          style={{ position: "fixed", ...posicion }}
          onMouseDown={(e) => e.preventDefault()} // el foco se queda en el input
          className="z-[80] flex flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"
        >
          <div id={idLista} role="listbox" aria-label={ariaLabel} className="min-h-0 flex-1 overflow-y-auto py-1">
            {grupos.map((g) => (
              <div key={g.titulo} role="group" aria-label={g.titulo}>
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {g.titulo}
                </p>
                {g.opciones.map((o) => {
                  indice += 1;
                  const i = indice;
                  const elegido = claveEstablecimiento(o.valor) === claveValor;
                  return (
                    <button
                      key={`${g.titulo}-${o.valor}`}
                      id={`${idLista}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={elegido}
                      data-activo={i === activo}
                      tabIndex={-1}
                      onClick={() => elegir(o.valor)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-800 dark:text-slate-200 transition-colors ${
                        i === activo ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block">{o.valor}</span>
                        {o.detalle && <span className="block text-[11px] leading-snug text-slate-500 dark:text-slate-400">{o.detalle}</span>}
                      </span>
                      {elegido && <Check size={14} className="shrink-0 text-blue-700 dark:text-cyan-300" />}
                    </button>
                  );
                })}
              </div>
            ))}
            {opciones.length === 0 && (
              <p className="px-3 py-3 text-xs text-slate-500">
                {catalogo || errorCatalogo ? "Sin coincidencias." : "Buscando…"}
              </p>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
            {!buscando ? (
              <p>Escriba para buscar en todo el catálogo de SIMMOW: UCSF, unidades del ISSS, hospitales privados…</p>
            ) : errorCatalogo ? (
              <p className="text-red-600 dark:text-red-400">
                No se pudo cargar el catálogo de SIMMOW; solo aparecen los frecuentes.{" "}
                <button type="button" tabIndex={-1} onClick={cargarCatalogo} className="font-semibold underline">Reintentar</button>
              </p>
            ) : !catalogo ? (
              <p className="flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Cargando el catálogo de SIMMOW…</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p>
                  {resultado.totalCatalogo > resultado.catalogo.length
                    ? `Se muestran ${resultado.catalogo.length} de ${resultado.totalCatalogo} del catálogo; siga escribiendo para afinar.`
                    : "¿No está en el catálogo?"}
                </p>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => elegir(OTRO_ESTABLECIMIENTO)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Elegir «Otro»
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
