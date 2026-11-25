"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, PencilLine, Search, UserRoundCheck, X } from "lucide-react";
import { especialidadPorId } from "@/lib/consultaExterna/especialidades";
import { nombrePropio } from "@/lib/consultaExterna/nombres";
import { claveDePaciente, validarPacienteManual, type PacienteTSCE } from "@/lib/consultaExterna/trabajoSocial";
import { mensaje, useTS } from "./contexto";
import { Aviso, TarjetaElegida, botonPrimario, botonSecundario, etiquetaCls, fechaCorta, inputCls } from "./ui";

// Paciente de la gestión: se busca entre los citados (cualquier especialidad y
// fecha) por expediente, DUI o nombre. Quien no está citado (p. ej. de un
// hospital de la red) se escribe a mano.

/** El paciente elegido; `manual` si se escribió. */
export type Elegido = { paciente: PacienteTSCE; manual: boolean };

const especialidades = (p: PacienteTSCE) =>
  (p.especialidades ?? []).map((id) => especialidadPorId(id)?.nombre ?? id).join(", ");

export function BuscadorCitado({ elegido, onElegir }: { elegido: Elegido | null; onElegir: (e: Elegido | null) => void }) {
  const { llamar } = useTS();
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<{ q: string; pacientes: PacienteTSCE[] } | null>(null);
  const [error, setError] = useState("");
  const [aMano, setAMano] = useState(false);
  const turno = useRef(0);

  const q = texto.trim();
  useEffect(() => {
    const mio = ++turno.current;
    if (q.length < 2) return;
    const t = window.setTimeout(async () => {
      try {
        const r = await llamar<{ pacientes: PacienteTSCE[] }>(`/pacientes?q=${encodeURIComponent(q)}`);
        if (turno.current === mio) { setResultado({ q, pacientes: r.pacientes }); setError(""); }
      } catch (e) {
        if (turno.current === mio) setError(mensaje(e));
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, llamar]);

  if (elegido) {
    const p = elegido.paciente;
    const esp = especialidades(p);
    return (
      <TarjetaElegida icono={UserRoundCheck} cintillo="Paciente" titulo={p.paciente} onCambiar={() => onElegir(null)} textoCambiar="Cambiar paciente">
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
          {p.expediente ? <span className="font-mono font-bold">{p.expediente}</span> : "Sin expediente"}
          {p.dui && <> · DUI <span className="font-mono">{p.dui}</span></>}
          {esp && <> · {esp}</>}
          {p.ultima && <> · última cita {fechaCorta(p.ultima)}</>}
          {elegido.manual && <> · escrito a mano</>}
          {p.telefono && <> · Tel. <span className="font-semibold tabular-nums">{p.telefono}</span></>}
        </p>
      </TarjetaElegida>
    );
  }

  if (aMano) {
    return (
      <FormularioManual
        inicial={q}
        onCancelar={() => setAMano(false)}
        onListo={(paciente) => { setAMano(false); setTexto(""); onElegir({ paciente, manual: true }); }}
      />
    );
  }

  const alDia = resultado?.q === q;
  const lista = q.length >= 2 ? resultado?.pacientes ?? [] : [];
  return (
    <div>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Expediente, DUI o nombre del paciente citado"
          aria-label="Buscar paciente citado"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-11 text-base text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white [&::-webkit-search-cancel-button]:hidden"
        />
        {q.length >= 2 && !alDia && !error ? (
          <Loader2 size={18} className="absolute right-3.5 top-1/2 -mt-[9px] animate-spin text-slate-400" aria-label="Buscando" />
        ) : texto && (
          <button type="button" onClick={() => setTexto("")} aria-label="Borrar la búsqueda" className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700">
            <X size={16} />
          </button>
        )}
      </div>

      {error && q.length >= 2 && <div className="mt-2"><Aviso tipo="error">{error}</Aviso></div>}

      {lista.length > 0 && (
        <ul className="mt-2 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800" aria-label="Pacientes encontrados">
          {lista.map((p) => (
            <li key={p.clave}>
              <button
                type="button"
                onClick={() => { setTexto(""); onElegir({ paciente: p, manual: false }); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="hidden w-24 flex-shrink-0 font-mono text-sm font-bold text-blue-700 dark:text-cyan-300 sm:block">{p.expediente || "—"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">{p.paciente}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-bold sm:hidden">{p.expediente ? `${p.expediente} · ` : ""}</span>
                    {p.dui ? <>DUI <span className="font-mono">{p.dui}</span></> : "Sin DUI"}
                    {especialidades(p) && <> · {especialidades(p)}</>}
                    {p.telefono && <> · Tel. <span className="tabular-nums">{p.telefono}</span></>}
                  </span>
                </span>
                {p.ultima && <span className="hidden flex-shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400 sm:block">{fechaCorta(p.ultima)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {alDia && q.length >= 2 && !lista.length ? "Nadie con esos datos entre los pacientes citados." : "Busca entre todos los citados, de cualquier especialidad."}
        </p>
        <button type="button" onClick={() => setAMano(true)} className={botonSecundario}>
          <PencilLine size={14} aria-hidden="true" />
          No está citado: escribirlo
        </button>
      </div>
    </div>
  );
}

function FormularioManual({ inicial, onListo, onCancelar }: {
  inicial: string; onListo: (p: PacienteTSCE) => void; onCancelar: () => void;
}) {
  const esNumero = /\d/.test(inicial);
  const [paciente, setPaciente] = useState(esNumero ? "" : nombrePropio(inicial));
  const [expediente, setExpediente] = useState(esNumero ? inicial : "");
  const [dui, setDui] = useState("");
  const [error, setError] = useState("");

  const listo = () => {
    const r = validarPacienteManual({ paciente: nombrePropio(paciente), expediente, dui });
    if (!r.ok) { setError(r.error); return; }
    onListo({
      ...r.datos, clave: claveDePaciente(r.datos), primera: "", ultima: "", especialidades: [], especialidadId: "", medico: "", manual: true,
    });
  };

  return (
    <form className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800" onSubmit={(e) => { e.preventDefault(); listo(); }}>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Paciente que no está citado</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_10rem]">
        <label>
          <span className={etiquetaCls}>Apellidos, Nombres</span>
          <input value={paciente} onChange={(e) => setPaciente(e.target.value)} onBlur={() => setPaciente((v) => nombrePropio(v))} autoFocus className={inputCls} placeholder="Pérez López, María Elena" />
        </label>
        <label>
          <span className={etiquetaCls}>Expediente <span className="font-normal text-slate-400">(si tiene)</span></span>
          <input value={expediente} onChange={(e) => setExpediente(e.target.value)} className={`${inputCls} font-mono`} />
        </label>
        <label>
          <span className={etiquetaCls}>DUI <span className="font-normal text-slate-400">(si tiene)</span></span>
          <input value={dui} inputMode="numeric" onChange={(e) => setDui(e.target.value)} className={`${inputCls} font-mono`} placeholder="00000000-0" />
        </label>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancelar} className={botonSecundario}>Volver a buscar</button>
        <button type="submit" className={botonPrimario}>Usar este paciente</button>
      </div>
    </form>
  );
}
