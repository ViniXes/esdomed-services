"use client";

import { useId, useState } from "react";
import { Building2, CircleCheckBig, Clock3, Hospital, Search } from "lucide-react";
import { BuscadorEstablecimiento } from "@/components/emergencia/BuscadorEstablecimiento";
import { DateField } from "@/components/ui/DateField";
import {
  AREAS_TS_CE, CON_QUIEN, MEDIOS, POBLACIONES, areaSugerida, filtrarTipos, sugeridoPorPaso, tipoGestion,
  type AreaTSCE, type DatosGestion, type DatosNota, type GestionTSCE, type NotaTSCE,
} from "@/lib/consultaExterna/trabajoSocial";
import { IconoMedio, iconoTipo } from "./iconos";
import { Chip, Chips, OpcionTarjeta, TarjetaElegida, botonSecundario, etiquetaCls, inputCls, preguntaCls } from "./ui";

// Campos de una gestión y de una nota. Los usan el asistente de gestión nueva,
// el seguimiento y las correcciones: así se pregunta igual en todos lados.

export type BorradorGestion = Omit<DatosGestion, "area"> & { area: AreaTSCE | "" };

export const gestionVacia = (): BorradorGestion => ({
  tipo: "", detalle: "", area: "", procedencia: "", establecimiento: "", medico: "", poblacion: [],
});

export const gestionABorrador = (g: GestionTSCE): BorradorGestion => ({
  tipo: g.tipo, detalle: g.detalle, area: g.area, procedencia: g.procedencia, establecimiento: g.establecimiento,
  medico: g.medico, poblacion: g.poblacion,
});

export const notaVacia = (hoy: string): DatosNota => ({ fecha: hoy, paso: "", conQuien: "", medio: "presencial", texto: "" });
export const notaABorrador = (n: NotaTSCE): DatosNota => ({ fecha: n.fecha, paso: n.paso, conQuien: n.conQuien, medio: n.medio, texto: n.texto });

/** Lo que el paciente aporta a la gestión: de dónde sale el área y qué médico se sugiere. */
export interface DelPaciente { especialidadId: string; areaCuenta: string; medicoSugerido?: string }

/** Cambia el tipo y arrastra lo que depende de él (detalle, área, procedencia, médico). */
export function conTipo(valor: BorradorGestion, tipo: string, p: DelPaciente): BorradorGestion {
  const nuevo = tipoGestion(tipo);
  return {
    ...valor,
    tipo,
    detalle: "",
    area: tipo ? areaSugerida(tipo, p.especialidadId, p.areaCuenta) : "",
    procedencia: nuevo?.pideProcedencia ? valor.procedencia || "propia" : "",
    establecimiento: nuevo?.pideProcedencia ? valor.establecimiento : "",
    medico: nuevo?.pideMedico ? valor.medico || p.medicoSugerido || "" : "",
  };
}

const opcional = <span className="font-normal text-slate-400">(opcional)</span>;

// ── Gestión ─────────────────────────────────────────────────────────────────

/** Todas las gestiones en tarjetas, las del área de la cuenta primero, con buscador. */
export function SelectorTipo({ areaCuenta, onElegir }: { areaCuenta: string; onElegir: (tipo: string) => void }) {
  const [consulta, setConsulta] = useState("");
  const grupos = filtrarTipos(consulta, areaCuenta);
  const visibles = grupos.flatMap((g) => g.tipos);
  return (
    <div className="space-y-5">
      <div className="relative">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          // Con una sola coincidencia, Enter la elige.
          onKeyDown={(e) => { if (e.key === "Enter" && visibles.length === 1) { e.preventDefault(); onElegir(visibles[0].id); } }}
          placeholder="Buscar gestión"
          aria-label="Buscar gestión"
          autoComplete="off"
          className={`${inputCls} h-11 pl-10`}
        />
      </div>
      {grupos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-300">Ninguna gestión se llama así.</p>
          <button type="button" onClick={() => onElegir("otra")} className={`${botonSecundario} mt-3`}>Registrarla como «Otra gestión»</button>
        </div>
      ) : grupos.map((g) => (
        <section key={g.id} aria-label={g.titulo}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-800 dark:text-blue-300">{g.titulo}</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {g.tipos.map((t) => (
              <OpcionTarjeta key={t.id} activo={false} onClick={() => onElegir(t.id)} icono={iconoTipo(t.id)} titulo={t.label} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Lo que cada tipo pregunta de más. No muestra nada si el tipo no pregunta nada. */
export function DetallesGestion({ valor, onChange, especialidadId, areaSiempre = false }: {
  valor: BorradorGestion;
  onChange: (v: BorradorGestion) => void;
  especialidadId: string;
  /** Al corregir, el área se puede cambiar en cualquier gestión común. */
  areaSiempre?: boolean;
}) {
  const id = useId();
  const tipo = tipoGestion(valor.tipo);
  if (!tipo) return null;
  const cambiar = (c: Partial<BorradorGestion>) => onChange({ ...valor, ...c });
  // El área sale sola del tipo o de la especialidad del paciente; solo se pregunta si no se sabe.
  const conArea = tipo.grupo === "comun" && (areaSiempre || !especialidadId);
  if (!tipo.detalles && !tipo.pideProcedencia && !tipo.pideMedico && !conArea) return null;

  return (
    <div className="space-y-5">
      {tipo.detalles && (
        <div>
          <p className={preguntaCls}>¿Qué se gestionó?</p>
          <Chips opciones={tipo.detalles} valor={valor.detalle} onChange={(detalle) => cambiar({ detalle })} etiqueta="Qué se gestionó" />
        </div>
      )}

      {tipo.pideProcedencia && (
        <div>
          <p className={preguntaCls}>¿De dónde es el paciente?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <OpcionTarjeta
              activo={valor.procedencia !== "red"}
              onClick={() => cambiar({ procedencia: "propia", establecimiento: "" })}
              icono={Hospital}
              titulo="De este hospital"
            />
            <OpcionTarjeta
              activo={valor.procedencia === "red"}
              onClick={() => cambiar({ procedencia: "red" })}
              icono={Building2}
              titulo="De un hospital de la red"
            />
          </div>
          {valor.procedencia === "red" && (
            <div className="mt-3">
              <p className={etiquetaCls}>Hospital o establecimiento</p>
              <BuscadorEstablecimiento
                value={valor.establecimiento}
                onChange={(establecimiento) => cambiar({ establecimiento })}
                ariaLabel="Hospital o establecimiento de la red"
              />
            </div>
          )}
        </div>
      )}

      {tipo.pideMedico && (
        <div className="sm:max-w-md">
          <label htmlFor={`${id}-medico`} className={preguntaCls}>Médico {opcional}</label>
          <input id={`${id}-medico`} value={valor.medico} maxLength={120} onChange={(e) => cambiar({ medico: e.target.value })} className={inputCls} placeholder="Nombre del médico" />
        </div>
      )}

      {conArea && (
        <div>
          <p className={preguntaCls}>¿De qué área es el paciente?</p>
          <Chips
            opciones={AREAS_TS_CE.map((a) => ({ id: a.id, label: a.nombre }))}
            valor={valor.area}
            onChange={(area) => cambiar({ area: area as AreaTSCE })}
            etiqueta="Área del paciente"
          />
        </div>
      )}
    </div>
  );
}

/** Adulto mayor, privado de libertad: se marcan solo si aplican. */
export function CamposPoblacion({ valor, onChange }: { valor: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <p className={preguntaCls}>El paciente es {opcional}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Condición del paciente">
        {POBLACIONES.map((p) => {
          const marcada = valor.includes(p.id);
          return (
            <Chip key={p.id} activo={marcada} onClick={() => onChange(marcada ? valor.filter((x) => x !== p.id) : [...valor, p.id])}>
              {p.label}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

/** Gestión completa: se elige el tipo y, ya elegido, queda en una tarjeta con sus preguntas debajo. */
export function CamposGestion({ valor, onChange, paciente, areaSiempre = false }: {
  valor: BorradorGestion;
  onChange: (v: BorradorGestion) => void;
  paciente: DelPaciente;
  areaSiempre?: boolean;
}) {
  const tipo = tipoGestion(valor.tipo);
  if (!tipo) return <SelectorTipo areaCuenta={paciente.areaCuenta} onElegir={(t) => onChange(conTipo(valor, t, paciente))} />;
  return (
    <div className="space-y-5">
      <TarjetaElegida icono={iconoTipo(tipo.id)} cintillo="Gestión" titulo={tipo.label} onCambiar={() => onChange(conTipo(valor, "", paciente))} />
      <DetallesGestion valor={valor} onChange={onChange} especialidadId={paciente.especialidadId} areaSiempre={areaSiempre} />
    </div>
  );
}

// ── Nota ────────────────────────────────────────────────────────────────────

export function CamposNota({ valor, onChange, tipo, hoy, desde }: {
  valor: DatosNota;
  onChange: (v: DatosNota) => void;
  tipo: string;
  hoy: string;
  /** Primera fecha permitida (la de la gestión). */
  desde?: string;
}) {
  const id = useId();
  const pasos = tipoGestion(tipo)?.pasos ?? [];
  const cambiar = (c: Partial<DatosNota>) => onChange({ ...valor, ...c });
  const local = (iso: string) => new Date(`${iso}T00:00:00`);

  return (
    <div className="space-y-5">
      {pasos.length > 0 && (
        <div>
          <p className={preguntaCls}>¿Qué se hizo?</p>
          <Chips opciones={pasos} valor={valor.paso} onChange={(paso) => cambiar({ paso, ...sugeridoPorPaso(paso) })} etiqueta="Qué se hizo" limpiar />
        </div>
      )}
      {/* Una pregunta por renglón: lado a lado las opciones se partían en tres filas. */}
      <div>
        <p className={preguntaCls}>¿Por qué medio?</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Medio">
          {MEDIOS.map((m) => (
            <Chip key={m.id} activo={valor.medio === m.id} onClick={() => cambiar({ medio: m.id })}>
              <IconoMedio medio={m.id} size={14} />{m.label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className={preguntaCls}>¿Con quién? {opcional}</p>
        <Chips opciones={CON_QUIEN} valor={valor.conQuien} onChange={(conQuien) => cambiar({ conQuien })} etiqueta="Con quién" limpiar />
      </div>
      <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
        <div>
          <label htmlFor={`${id}-texto`} className={preguntaCls}>
            Nota {valor.paso && tipo !== "otra" && opcional}
          </label>
          <textarea
            id={`${id}-texto`}
            value={valor.texto}
            onChange={(e) => cambiar({ texto: e.target.value })}
            rows={3}
            maxLength={2000}
            className={`${inputCls} resize-y`}
            placeholder="Qué se hizo, qué quedó pendiente…"
          />
        </div>
        <div>
          <p className={preguntaCls}>Fecha</p>
          <DateField
            value={valor.fecha}
            onChange={(fecha) => cambiar({ fecha: fecha || hoy })}
            ariaLabel="Fecha de la nota"
            maxDate={local(hoy)}
            minDate={desde ? local(desde) : undefined}
          />
        </div>
      </div>
    </div>
  );
}

/** Tras cada nota se responde lo mismo: sigue abierta o ya se resolvió. */
export function ComoQueda({ valor, onChange }: { valor: boolean | null; onChange: (finalizada: boolean) => void }) {
  return (
    <div>
      <p className={preguntaCls}>¿Cómo queda la gestión?</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <OpcionTarjeta tono="ambar" activo={valor === false} onClick={() => onChange(false)} icono={Clock3} titulo="En proceso" detalle="Falta algo por hacer" />
        <OpcionTarjeta tono="verde" activo={valor === true} onClick={() => onChange(true)} icono={CircleCheckBig} titulo="Finalizada" detalle="Ya quedó resuelta" />
      </div>
    </div>
  );
}
