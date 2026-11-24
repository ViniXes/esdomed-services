"use client";

import { useId } from "react";
import { BuscadorEstablecimiento } from "@/components/emergencia/BuscadorEstablecimiento";
import { DateField } from "@/components/ui/DateField";
import {
  AREAS_TS_CE, CON_QUIEN, MEDIOS, POBLACIONES, areaSugerida, gruposDeTipos, sugeridoPorPaso, tipoGestion,
  type AreaTSCE, type DatosGestion, type DatosNota, type GestionTSCE, type NotaTSCE,
} from "@/lib/consultaExterna/trabajoSocial";
import { Chip, Chips, etiquetaCls, inputCls } from "./ui";

// Campos de una gestión y de una nota. Los usan el registro y las correcciones.

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

export function CamposGestion({ valor, onChange, especialidadId, areaCuenta, medicoSugerido = "" }: {
  valor: BorradorGestion;
  onChange: (v: BorradorGestion) => void;
  especialidadId: string;
  areaCuenta: string;
  medicoSugerido?: string;
}) {
  const id = useId();
  const tipo = tipoGestion(valor.tipo);
  const cambiar = (c: Partial<BorradorGestion>) => onChange({ ...valor, ...c });

  const elegirTipo = (t: string) => {
    const nuevo = tipoGestion(t);
    cambiar({
      tipo: t,
      detalle: "",
      area: areaSugerida(t, especialidadId, areaCuenta),
      procedencia: nuevo?.pideProcedencia ? valor.procedencia || "propia" : "",
      establecimiento: nuevo?.pideProcedencia ? valor.establecimiento : "",
      medico: nuevo?.pideMedico ? valor.medico || medicoSugerido : "",
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {gruposDeTipos(areaCuenta).map((g) => (
          <div key={g.id}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{g.titulo}</p>
            <Chips opciones={g.tipos} valor={valor.tipo} onChange={elegirTipo} etiqueta={`Gestiones: ${g.titulo}`} />
          </div>
        ))}
      </div>

      {tipo && (
        <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          {tipo.detalles && (
            <div>
              <p className={etiquetaCls}>¿Qué se gestionó?</p>
              <Chips opciones={tipo.detalles} valor={valor.detalle} onChange={(detalle) => cambiar({ detalle })} etiqueta="Qué se gestionó" />
            </div>
          )}

          {tipo.pideProcedencia && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className={etiquetaCls}>Procedencia</p>
                <Chips
                  opciones={[{ id: "propia", label: "De este hospital" }, { id: "red", label: "De un hospital de la red" }]}
                  valor={valor.procedencia}
                  onChange={(p) => cambiar({ procedencia: p === "red" ? "red" : "propia", establecimiento: p === "red" ? valor.establecimiento : "" })}
                  etiqueta="Procedencia"
                />
              </div>
              {valor.procedencia === "red" && (
                <div>
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

          <div className="grid gap-3 sm:grid-cols-2">
            {tipo.pideMedico && (
              <div>
                <label htmlFor={`${id}-medico`} className={etiquetaCls}>Médico <span className="font-normal text-slate-400">(opcional)</span></label>
                <input id={`${id}-medico`} value={valor.medico} maxLength={120} onChange={(e) => cambiar({ medico: e.target.value })} className={inputCls} placeholder="Nombre del médico" />
              </div>
            )}
            {tipo.grupo === "comun" && (
              <div>
                <label htmlFor={`${id}-area`} className={etiquetaCls}>Área en que cuenta</label>
                <select id={`${id}-area`} value={valor.area} onChange={(e) => cambiar({ area: e.target.value as AreaTSCE })} className={inputCls}>
                  {AREAS_TS_CE.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <p className={etiquetaCls}>El paciente es <span className="font-normal text-slate-400">(si aplica)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {POBLACIONES.map((p) => {
                const marcada = valor.poblacion.includes(p.id);
                return (
                  <Chip key={p.id} activo={marcada} onClick={() => cambiar({ poblacion: marcada ? valor.poblacion.filter((x) => x !== p.id) : [...valor.poblacion, p.id] })}>
                    {p.label}
                  </Chip>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
    <div className="space-y-4">
      {pasos.length > 0 && (
        <div>
          <p className={etiquetaCls}>¿Qué se hizo?</p>
          <Chips opciones={pasos} valor={valor.paso} onChange={(paso) => cambiar({ paso, ...sugeridoPorPaso(paso) })} etiqueta="Qué se hizo" limpiar />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className={etiquetaCls}>Medio</p>
          <Chips opciones={MEDIOS} valor={valor.medio} onChange={(medio) => cambiar({ medio })} etiqueta="Medio" />
        </div>
        <div>
          <p className={etiquetaCls}>Con quién <span className="font-normal text-slate-400">(opcional)</span></p>
          <Chips opciones={CON_QUIEN} valor={valor.conQuien} onChange={(conQuien) => cambiar({ conQuien })} etiqueta="Con quién" limpiar />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div>
          <label htmlFor={`${id}-texto`} className={etiquetaCls}>
            Nota {valor.paso && tipo !== "otra" && <span className="font-normal text-slate-400">(opcional)</span>}
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
          <p className={etiquetaCls}>Fecha</p>
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
