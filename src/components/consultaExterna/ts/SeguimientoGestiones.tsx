"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck2, ListChecks, NotebookPen, Plus, RefreshCw, Search } from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import {
  DIAS_SIN_MOVIMIENTO, claveTexto, diasSinMovimiento, tituloGestion, type GestionTSCE, type NotaTSCE,
} from "@/lib/consultaExterna/trabajoSocial";
import { RUTAS_TS, mensaje, useTS } from "./contexto";
import { FilaGestion } from "./TarjetaGestion";
import { Aviso, Cargando, Chip, Hero, Segmentos, Vacio, botonHero, botonPrimario, botonSecundario, fechaCorta, inputCls, tarjeta } from "./ui";

// Seguimiento: las gestiones que siguen abiertas y lo hecho en un día. Cada
// fila abre la gestión, donde se le agregan las notas y se cierra. Las nuevas
// se registran en el asistente («Nueva gestión»).

type Vista = "proceso" | "dia";
type Lista = { hoy: string; gestiones: GestionTSCE[] };

export function SeguimientoGestiones() {
  const { llamar } = useTS();
  const [vista, setVista] = useState<Vista>("proceso");
  const [proceso, setProceso] = useState<Lista | null>(null);
  const [error, setError] = useState("");
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vivo = true;
    llamar<Lista>("/gestiones?estado=en_proceso")
      .then((r) => { if (vivo) { setProceso(r); setError(""); } })
      .catch((e) => { if (vivo) setError(mensaje(e)); });
    return () => { vivo = false; };
  }, [llamar, vuelta]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <Hero icono={ListChecks} titulo="Seguimiento de gestiones" detalle="Trabajo Social · Consulta Externa">
        <Link prefetch={false} href={RUTAS_TS.nueva} className={botonHero}><Plus size={16} aria-hidden="true" />Nueva gestión</Link>
      </Hero>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmentos<Vista>
          etiqueta="Qué gestiones ver"
          valor={vista}
          onChange={setVista}
          opciones={[
            { id: "proceso", label: "En proceso", n: proceso?.gestiones.length },
            { id: "dia", label: "Por día" },
          ]}
        />
        {vista === "proceso" && (
          <button type="button" onClick={() => setVuelta((v) => v + 1)} className={botonSecundario}><RefreshCw size={14} aria-hidden="true" />Actualizar</button>
        )}
      </div>

      {vista === "proceso" ? <EnProceso datos={proceso} error={error} /> : <PorDia />}
    </div>
  );
}

function EnProceso({ datos, error }: { datos: Lista | null; error: string }) {
  const { uid } = useTS();
  const [mias, setMias] = useState(false);
  const [quietas, setQuietas] = useState(false);
  const [filtro, setFiltro] = useState("");

  if (!datos) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />;
  if (datos.gestiones.length === 0) {
    return (
      <Vacio icono={NotebookPen} titulo="No hay gestiones en proceso">
        <Link prefetch={false} href={RUTAS_TS.nueva} className={botonPrimario}><Plus size={15} aria-hidden="true" />Registrar una gestión</Link>
      </Vacio>
    );
  }

  const esQuieta = (g: GestionTSCE) => diasSinMovimiento(g, datos.hoy) >= DIAS_SIN_MOVIMIENTO;
  const palabras = claveTexto(filtro).split(" ").filter(Boolean);
  const visibles = datos.gestiones.filter((g) =>
    (!mias || g.creadoPor === uid)
    && (!quietas || esQuieta(g))
    && palabras.every((p) => claveTexto(`${g.paciente} ${g.expediente} ${tituloGestion(g)}`).includes(p)));
  const nQuietas = datos.gestiones.filter(esQuieta).length;

  return (
    <div className="space-y-3">
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Paciente, expediente o gestión"
            aria-label="Buscar entre las gestiones en proceso"
            className={`${inputCls} pl-10`}
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros">
          <Chip activo={mias} onClick={() => setMias(!mias)}>Solo las mías</Chip>
          {nQuietas > 0 && <Chip activo={quietas} onClick={() => setQuietas(!quietas)}>Sin movimiento · {nQuietas}</Chip>}
        </div>
      </div>
      {visibles.length === 0 ? (
        <Vacio icono={Search} titulo="Ninguna gestión con ese filtro" />
      ) : (
        <ul className={`${tarjeta} divide-y divide-slate-100 overflow-hidden dark:divide-slate-800`}>
          {visibles.map((g) => <FilaGestion key={g.id} gestion={g} hoy={datos.hoy} />)}
        </ul>
      )}
    </div>
  );
}

/** Lo registrado en un día: gestiones nuevas y gestiones que recibieron nota. Incluye las ya cerradas. */
function PorDia() {
  const { llamar } = useTS();
  const [fecha, setFecha] = useState(() => hoySV());
  const [datos, setDatos] = useState<(Lista & { fecha: string; notas: NotaTSCE[] }) | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    llamar<Lista & { notas: NotaTSCE[] }>(`/gestiones?fecha=${fecha}`)
      .then((r) => { if (vivo) { setDatos({ ...r, fecha }); setError(""); } })
      .catch((e) => { if (vivo) setError(mensaje(e)); });
    return () => { vivo = false; };
  }, [fecha, llamar]);

  const listo = datos?.fecha === fecha;
  const nuevas = listo ? datos.gestiones.filter((g) => g.fecha === fecha).length : 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44"><DateField value={fecha} onChange={(f) => setFecha(f || hoySV())} ariaLabel="Día" maxDate={new Date(`${hoySV()}T00:00:00`)} /></div>
        {listo && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {nuevas} {nuevas === 1 ? "gestión nueva" : "gestiones nuevas"} · {datos.notas.length} {datos.notas.length === 1 ? "nota" : "notas"}
          </p>
        )}
      </div>
      {error ? <Aviso tipo="error">{error}</Aviso> : !listo ? <Cargando /> : datos.gestiones.length === 0 ? (
        <Vacio icono={CalendarCheck2} titulo={`Sin registros el ${fechaCorta(fecha)}`} />
      ) : (
        <ul className={`${tarjeta} divide-y divide-slate-100 overflow-hidden dark:divide-slate-800`}>
          {datos.gestiones.map((g) => <FilaGestion key={g.id} gestion={g} hoy={datos.hoy} conEstado />)}
        </ul>
      )}
    </div>
  );
}
