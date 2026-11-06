"use client";

// Paneles del tablero, uno por variable de cada formulario. Si el censo gana un
// campo, se agrega aquí y en lib/emergencia/resumenCenso.ts.

import {
  Activity, AlertTriangle, BedDouble, Clock, Cross, FileWarning, HeartPulse, RotateCcw, Wind,
} from "lucide-react";
import type { ConteosCenso } from "@/types";
import {
  DESENLACES_SIN_INGRESO, DESTINO_LABEL, DISPOSITIVOS_O2, TIEMPOS_PERMANENCIA, TIPO_EVALUADOR_LABEL, TURNOS,
} from "@/lib/emergencia/censos";
import {
  FALLECE_EN_EMERGENCIA, NO_APLICA, SIN_DATO, type DeltaMes,
} from "@/lib/emergencia/resumenCenso";
import { claveServicio } from "@/lib/servicios";
import { useServicios } from "@/contexts/ServiciosContext";
import {
  BarraSegmentada, Barras, Evolucion, Kpi, MARCA, MARCA_SIN_DATO, Piramide, RAMPA, Tarjeta, cifra, filasDe,
  porcentaje, type FilaDato,
} from "@/components/emergencia/tablero/piezas";

const VERDE = "bg-emerald-600";
const ROJO = "bg-red-600";
const AMBAR = "bg-amber-400";
// El tema oscuro vuelve beige la familia amber; el triage tiene que seguir siendo amarillo.
const TRIAGE_AMARILLO = "bg-amber-400 dark:bg-yellow-400";
const TEXTO_SOBRE_COLOR = "text-white";
const TEXTO_SOBRE_AMBAR = "text-amber-950";

export interface VistaProps {
  resumen: DeltaMes;
  puntos: { etiqueta: string; valor: number }[];
  subtituloEvolucion: string;
  detalleTotal?: string;
  verPersonal: boolean;
}

const suma = (c: Record<string, number> = {}) => Object.values(c).reduce((s, n) => s + n, 0);

/** Los servicios se comparan por clave y se muestran con el nombre del catálogo vivo. */
function useFilasServicio(conteo: Record<string, number> = {}): FilaDato[] {
  const { servicios } = useServicios();
  const porClave = new Map<string, FilaDato>();
  for (const [nombre, valor] of Object.entries(conteo)) {
    if (nombre === SIN_DATO) continue;
    const clave = claveServicio(nombre);
    const fila = porClave.get(clave);
    if (fila) fila.valor += valor;
    else porClave.set(clave, { etiqueta: servicios.find((s) => claveServicio(s) === clave) ?? nombre, valor });
  }
  return [...porClave.values()].sort((a, b) => b.valor - a.valor);
}

function Turno({ conteos, total }: { conteos: ConteosCenso; total: number }) {
  return (
    <Tarjeta titulo="Turno" subtitulo="Atenciones por horario" className="lg:col-span-4">
      <Barras filas={TURNOS.map((t) => ({ etiqueta: t.label, valor: conteos.turno?.[t.value] ?? 0 }))} total={total} />
    </Tarjeta>
  );
}

function Edades({ conteos }: { conteos: ConteosCenso }) {
  return (
    <Tarjeta titulo="Edad y sexo" subtitulo="Pacientes por grupo de edad" className="lg:col-span-4">
      <Piramide conteo={conteos.edadSexo} sexo={conteos.sexo} />
    </Tarjeta>
  );
}

function Diagnosticos({ conteos, total, titulo }: { conteos: ConteosCenso; total: number; titulo: string }) {
  return (
    <Tarjeta titulo={titulo} subtitulo="CIE-10 · un paciente puede tener varios" className="lg:col-span-6">
      <Barras {...filasDe(conteos.diagnostico)} total={total} />
    </Tarjeta>
  );
}

function Procedimientos({ conteos, total }: { conteos: ConteosCenso; total: number }) {
  const { ninguno = 0, ...conProcedimiento } = conteos.procedimiento ?? {};
  return (
    <Tarjeta titulo="Procedimientos en la Unidad de Emergencia" subtitulo="Un paciente puede tener varios" className="lg:col-span-6">
      <Barras {...filasDe(conProcedimiento)} total={total} />
      {ninguno > 0 && <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">{cifra(ninguno)} sin procedimientos ({porcentaje(ninguno, total)})</p>}
    </Tarjeta>
  );
}

function QuienEvalua({ conteos, total }: { conteos: ConteosCenso; total: number }) {
  const c = conteos.evaluadoPor ?? {};
  const conReevaluacion = total - (conteos.reevaluacion?.[NO_APLICA] ?? 0);
  return (
    <Tarjeta titulo="Quién evalúa" subtitulo="Staff, médico general o especialidad" className="lg:col-span-4">
      <BarraSegmentada
        total={total}
        partes={[
          { etiqueta: TIPO_EVALUADOR_LABEL.staff, valor: c.staff ?? 0, clase: "bg-blue-800 dark:bg-cyan-300" },
          { etiqueta: TIPO_EVALUADOR_LABEL.medico_general, valor: c.medico_general ?? 0, clase: "bg-cyan-600", textoClase: TEXTO_SOBRE_COLOR },
          { etiqueta: TIPO_EVALUADOR_LABEL.especialidad, valor: c.especialidad ?? 0, clase: "bg-blue-400 dark:bg-cyan-700", textoClase: "text-blue-950 dark:text-white" },
          { etiqueta: "Sin dato", valor: c[SIN_DATO] ?? 0, clase: MARCA_SIN_DATO, textoClase: "text-slate-800 dark:text-slate-100" },
        ]}
      />
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        {cifra(conReevaluacion)} con reevaluación ({porcentaje(conReevaluacion, total)})
      </p>
      {suma(conteos.evaluaEspecialidad) > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">Especialidades anotadas</p>
          <Barras {...filasDe(conteos.evaluaEspecialidad)} total={total} maximo={5} />
        </div>
      )}
    </Tarjeta>
  );
}

/** Atenciones por persona: solo para quien tiene ese permiso. */
function DetallePersonal({ conteos, total }: { conteos: ConteosCenso; total: number }) {
  const reevaluacion = { ...conteos.reevaluacion };
  delete reevaluacion[NO_APLICA];
  return (
    <>
      <Tarjeta titulo="Staff que evalúa" subtitulo="Atenciones por persona" className="lg:col-span-4">
        <Barras {...filasDe(conteos.evaluaPersona)} total={total} />
      </Tarjeta>
      <Tarjeta titulo="Reevaluación" subtitulo="Quién reevalúa" className="lg:col-span-4">
        <Barras {...filasDe(reevaluacion)} total={total} />
      </Tarjeta>
      <Tarjeta titulo="Médicos generales del turno" subtitulo="Atenciones en las que aparecen" className="lg:col-span-4">
        <Barras {...filasDe(conteos.medicosTurno)} total={total} />
      </Tarjeta>
    </>
  );
}

const TRIAGE_PARTES = [
  { clave: "rojo", etiqueta: "Rojo", clase: ROJO, textoClase: TEXTO_SOBRE_COLOR },
  { clave: "amarillo", etiqueta: "Amarillo", clase: TRIAGE_AMARILLO, textoClase: TEXTO_SOBRE_AMBAR },
  { clave: "verde", etiqueta: "Verde", clase: VERDE, textoClase: TEXTO_SOBRE_COLOR },
  { clave: SIN_DATO, etiqueta: "Sin dato", clase: MARCA_SIN_DATO, textoClase: "text-slate-800 dark:text-slate-100" },
];

export function VistaDemanda({ resumen, puntos, subtituloEvolucion, detalleTotal, verPersonal }: VistaProps) {
  const { total, conteos } = resumen;
  const ingresos = conteos.destino?.ingreso ?? 0;
  const rojos = conteos.triage?.rojo ?? 0;
  const fallecidos = conteos.condicion?.fallecido ?? 0;
  const ventilados = conteos.ventilacion?.si ?? 0;
  const reconsultas = conteos.consulta48h?.si ?? 0;
  const conReferencia = conteos.traeReferencia?.si ?? 0;
  const isss = conteos.isss?.si ?? 0;
  const empleados = conteos.empleadoHes?.si ?? 0;
  const servicios = useFilasServicio(conteos.servicioIngresar);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi etiqueta="Atenciones" valor={cifra(total)} detalle={detalleTotal} icon={Activity} />
        <Kpi etiqueta="Ingresos" valor={cifra(ingresos)} detalle={porcentaje(ingresos, total)} icon={BedDouble} />
        <Kpi etiqueta="Triage rojo" valor={cifra(rojos)} detalle={porcentaje(rojos, total)} icon={AlertTriangle} />
        <Kpi etiqueta="Fallecidos" valor={cifra(fallecidos)} detalle={porcentaje(fallecidos, total)} icon={Cross} tono={fallecidos ? "critico" : "neutro"} />
        <Kpi etiqueta="Ventilación mecánica" valor={cifra(ventilados)} detalle={porcentaje(ventilados, total)} icon={Wind} />
        <Kpi etiqueta="Consulta de nuevo en < 48 h" valor={cifra(reconsultas)} detalle={porcentaje(reconsultas, total)} icon={RotateCcw} />
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <Tarjeta titulo="Evolución" subtitulo={subtituloEvolucion} className="lg:col-span-8">
          <Evolucion puntos={puntos} />
        </Tarjeta>
        <Tarjeta titulo="Destino del paciente" subtitulo="Salida registrada" className="lg:col-span-4">
          <Barras {...filasDe(conteos.destino, DESTINO_LABEL)} total={total} />
        </Tarjeta>

        <Tarjeta titulo="Triage" subtitulo="Prioridad asignada" className="lg:col-span-4">
          <BarraSegmentada
            total={total}
            partes={TRIAGE_PARTES.map((p) => ({ ...p, valor: conteos.triage?.[p.clave] ?? 0 }))}
          />
        </Tarjeta>
        <Turno conteos={conteos} total={total} />
        <Edades conteos={conteos} />

        <Tarjeta titulo="Especialidad que requiere" className="lg:col-span-6">
          <Barras {...filasDe(conteos.especialidad)} total={total} />
        </Tarjeta>
        <Tarjeta titulo="Servicio a ingresar" subtitulo="Solo pacientes con destino Ingreso" className="lg:col-span-6">
          <Barras filas={servicios} total={ingresos} sinDato={conteos.servicioIngresar?.[SIN_DATO]} />
        </Tarjeta>

        <Diagnosticos conteos={conteos} total={total} titulo="Impresión diagnóstica" />
        <Procedimientos conteos={conteos} total={total} />

        <QuienEvalua conteos={conteos} total={total} />
        <Tarjeta titulo="Referencia de entrada" subtitulo="Pacientes que llegan referidos" className="lg:col-span-4">
          <p className="text-2xl font-bold leading-none text-slate-900 dark:text-slate-100 font-heading">{porcentaje(conReferencia, total)}</p>
          <p className="mt-1 mb-3 text-xs text-slate-500 dark:text-slate-400">{cifra(conReferencia)} traen referencia</p>
          {conReferencia > 0 && <Barras {...filasDe(conteos.lugarReferencia)} total={conReferencia} maximo={6} />}
        </Tarjeta>
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-4">
        <Tarjeta titulo="Referidos a otro centro" subtitulo="Destino Referencia">
          <Barras {...filasDe(conteos.centroRefiere)} total={conteos.destino?.referencia ?? 0} maximo={6} />
        </Tarjeta>

        <Tarjeta titulo="Condición administrativa" className="flex-1">
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-700 dark:text-slate-300">Asegurados ISSS</dt>
              <dd className="tabular-nums text-slate-500 dark:text-slate-400"><span className="font-semibold text-slate-900 dark:text-slate-100">{cifra(isss)}</span> · {porcentaje(isss, total)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-700 dark:text-slate-300">Empleados de HES</dt>
              <dd className="tabular-nums text-slate-500 dark:text-slate-400"><span className="font-semibold text-slate-900 dark:text-slate-100">{cifra(empleados)}</span> · {porcentaje(empleados, total)}</dd>
            </div>
          </dl>
          {empleados > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">Dependencia</p>
              <Barras {...filasDe(conteos.dependencia)} total={empleados} maximo={5} />
            </div>
          )}
        </Tarjeta>
        </div>
        {verPersonal && <DetallePersonal conteos={conteos} total={total} />}
      </div>
    </>
  );
}

const TRES_ESTADOS = (c: Record<string, number> = {}) => [
  { etiqueta: "Sí", valor: c.si ?? 0, clase: AMBAR, textoClase: TEXTO_SOBRE_AMBAR },
  { etiqueta: "No", valor: c.no ?? 0, clase: MARCA },
  { etiqueta: "No aplica", valor: c.no_aplica ?? 0, clase: MARCA_SIN_DATO, textoClase: "text-slate-800 dark:text-slate-100" },
  { etiqueta: "Sin dato", valor: c[SIN_DATO] ?? 0, clase: MARCA_SIN_DATO, textoClase: "text-slate-800 dark:text-slate-100" },
];

export function VistaReferidos({ resumen, puntos, subtituloEvolucion, detalleTotal, verPersonal }: VistaProps) {
  const { total, conteos } = resumen;
  const estables = conteos.condicion?.estable ?? 0;
  const inestables = conteos.condicion?.inestable ?? 0;
  const fallecidos = conteos.servicioIngreso?.[FALLECE_EN_EMERGENCIA] ?? 0;
  const ventilados = conteos.dispositivoO2?.VM ?? 0;
  const tiempos = conteos.tiempoPermanencia ?? {};
  const demorados = Object.entries(tiempos).reduce((s, [k, n]) => (k.startsWith(">") ? s + n : s), 0);
  const sinSis = Object.entries(conteos.clasificacionSis ?? {}).reduce((s, [k, n]) => (k.includes("SIN REF") ? s + n : s), 0);

  const desenlaces = DESENLACES_SIN_INGRESO as readonly string[];
  const ingreso = conteos.servicioIngreso ?? {};
  const servicios = useFilasServicio(Object.fromEntries(Object.entries(ingreso).filter(([k]) => !desenlaces.includes(k))));
  const sinIngreso = desenlaces.filter((d) => ingreso[d]).map((d) => `${d}: ${cifra(ingreso[d])}`).join(" · ");

  let paso = 0;
  const filasTiempo = TIEMPOS_PERMANENCIA.map((t): FilaDato => ({
    etiqueta: t,
    valor: tiempos[t] ?? 0,
    clase: t === "No aplica" ? MARCA_SIN_DATO : RAMPA[paso++],
  }));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi etiqueta="Referidos" valor={cifra(total)} detalle={detalleTotal} icon={Activity} />
        <Kpi etiqueta="Inestables" valor={cifra(inestables)} detalle={porcentaje(inestables, total)} icon={HeartPulse} />
        <Kpi etiqueta="Fallecen en emergencia" valor={cifra(fallecidos)} detalle={porcentaje(fallecidos, total)} icon={Cross} tono={fallecidos ? "critico" : "neutro"} />
        <Kpi etiqueta="Ventilación mecánica" valor={cifra(ventilados)} detalle={porcentaje(ventilados, total)} icon={Wind} />
        <Kpi etiqueta="Más de 1 hora en admisión" valor={cifra(demorados)} detalle={porcentaje(demorados, total)} icon={Clock} />
        <Kpi etiqueta="Sin referencia en SIS" valor={cifra(sinSis)} detalle={porcentaje(sinSis, total)} icon={FileWarning} />
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <Tarjeta titulo="Evolución" subtitulo={subtituloEvolucion} className="lg:col-span-8">
          <Evolucion puntos={puntos} />
        </Tarjeta>
        <Tarjeta titulo="Condición del paciente" subtitulo="Al recibirlo en emergencia" className="lg:col-span-4">
          <BarraSegmentada
            total={total}
            partes={[
              { etiqueta: "Estable", valor: estables, clase: VERDE, textoClase: TEXTO_SOBRE_COLOR },
              { etiqueta: "Inestable", valor: inestables, clase: ROJO, textoClase: TEXTO_SOBRE_COLOR },
              { etiqueta: "Sin dato", valor: conteos.condicion?.[SIN_DATO] ?? 0, clase: MARCA_SIN_DATO, textoClase: "text-slate-800 dark:text-slate-100" },
            ]}
          />
        </Tarjeta>

        <Tarjeta titulo="Tiempo en admisión" subtitulo="Previo al ingreso al servicio" className="lg:col-span-4">
          <Barras filas={filasTiempo} total={total} sinDato={tiempos[SIN_DATO]} />
        </Tarjeta>
        <Turno conteos={conteos} total={total} />
        <Edades conteos={conteos} />

        <Tarjeta titulo="Hospital que refiere" className="lg:col-span-6">
          <Barras {...filasDe(conteos.hospitalReferencia)} total={total} />
        </Tarjeta>
        <Tarjeta titulo="Referencia en SIS" subtitulo="Clasificación según hospital y registro" className="lg:col-span-6">
          <Barras {...filasDe(conteos.clasificacionSis)} total={total} />
        </Tarjeta>

        <Tarjeta titulo="Servicio de ingreso" subtitulo="Servicio que recibe al paciente" className="lg:col-span-6">
          <Barras filas={servicios} total={total} sinDato={ingreso[SIN_DATO]} />
          {sinIngreso && <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">Sin ingreso · {sinIngreso}</p>}
        </Tarjeta>
        <Tarjeta titulo="Razón de demora" subtitulo="Cuando pasa de 1 hora en admisión" className="lg:col-span-6">
          <Barras {...filasDe(conteos.razonDemora)} total={demorados} />
        </Tarjeta>

        <Tarjeta titulo="Dispositivo de oxígeno" subtitulo="Al ingreso" className="lg:col-span-4">
          <Barras
            filas={DISPOSITIVOS_O2.map((d) => ({ etiqueta: d, valor: conteos.dispositivoO2?.[d] ?? 0 }))}
            total={total}
            sinDato={conteos.dispositivoO2?.[SIN_DATO]}
          />
        </Tarjeta>
        <Tarjeta titulo="Calidad de la referencia" className="lg:col-span-4">
          <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">Discrepancia en el diagnóstico</p>
          <BarraSegmentada total={total} partes={TRES_ESTADOS(conteos.discrepancia)} />
          <p className="mt-4 mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">Se modificó el servicio a ingresar</p>
          <BarraSegmentada total={total} partes={TRES_ESTADOS(conteos.modificacion)} />
        </Tarjeta>
        <QuienEvalua conteos={conteos} total={total} />

        <Diagnosticos conteos={conteos} total={total} titulo="Diagnóstico" />
        <Procedimientos conteos={conteos} total={total} />
        {verPersonal && <DetallePersonal conteos={conteos} total={total} />}
      </div>
    </>
  );
}
