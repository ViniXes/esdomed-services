"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download } from "lucide-react";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import {
  AREAS_TS_CE, DIAS_SIN_MOVIMIENTO, ESTADO_GESTION_LABEL, diasSinMovimiento, esMes, labelActividad, labelConQuien, labelDetalle, labelMedio,
  labelPaso, labelPoblacion, labelTipo, nombreArea, resumirTS,
  type ActividadTSCE, type FilaConteo, type GestionTSCE, type NotaTSCE,
} from "@/lib/consultaExterna/trabajoSocial";
import { mensaje, useTS } from "./contexto";
import { TarjetaGestion } from "./TarjetaGestion";
import { Aviso, Cargando, Encabezado, Vacio, botonSecundario, fechaCorta, inputCls, tarjeta } from "./ui";

// Productividad del mes. La ven las dos trabajadoras y la jefatura (solo
// consulta). Gestiones y notas se cuentan aparte, y no hay ranking: son dos
// personas con áreas distintas.

interface DatosMes { hoy: string; gestiones: GestionTSCE[]; notas: NotaTSCE[]; actividades: ActividadTSCE[] }

export function TableroTS() {
  const { llamar } = useTS();
  const [mes, setMes] = useState(() => hoySV().slice(0, 7));
  const [persona, setPersona] = useState("");
  const [area, setArea] = useState("");
  const [datos, setDatos] = useState<(DatosMes & { mes: string }) | null>(null);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    let vivo = true;
    llamar<DatosMes>(`/gestiones?mes=${mes}`)
      .then((r) => { if (vivo) { setDatos({ ...r, mes }); setError(""); } })
      .catch((e) => { if (vivo) setError(mensaje(e)); });
    return () => { vivo = false; };
  }, [mes, llamar]);

  const listo = datos?.mes === mes ? datos : null;
  const personas = useMemo(() => {
    const m = new Map<string, string>();
    listo?.gestiones.forEach((g) => m.set(g.creadoPor, g.creadoPorNombre));
    listo?.notas.forEach((n) => m.set(n.autor, n.autorNombre));
    listo?.actividades.forEach((a) => m.set(a.autor, a.autorNombre));
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [listo]);
  const filtro = useMemo(() => ({ persona: personas.some(([id]) => id === persona) ? persona : "", area }), [personas, persona, area]);
  const r = useMemo(() => (listo ? resumirTS(mes, listo, listo.hoy, filtro) : null), [listo, mes, filtro]);

  const exportar = async () => {
    if (!listo) return;
    setExportando(true);
    try {
      await descargarExcel(mes, listo, filtro);
    } catch (e) {
      console.error(e);
      setError("No se pudo generar el Excel.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <Encabezado icono={BarChart3} titulo="Productividad" detalle="Trabajo Social de Consulta Externa" />

      <div className="flex flex-wrap items-center gap-2">
        <input type="month" aria-label="Mes" value={mes} max={hoySV().slice(0, 7)} onChange={(e) => { if (esMes(e.target.value)) setMes(e.target.value); }} className={`${inputCls} !w-44`} />
        <select aria-label="Persona" value={filtro.persona} onChange={(e) => setPersona(e.target.value)} className={`${inputCls} !w-auto`}>
          <option value="">Todo el equipo</option>
          {personas.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
        <select aria-label="Área" value={area} onChange={(e) => setArea(e.target.value)} className={`${inputCls} !w-auto`}>
          <option value="">Todas las áreas</option>
          {AREAS_TS_CE.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <button type="button" onClick={() => void exportar()} disabled={!listo || exportando} className={`${botonSecundario} ml-auto`}>
          <Download size={14} aria-hidden="true" />{exportando ? "Generando…" : "Matriz en Excel"}
        </button>
      </div>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {!r || !listo ? (!error && <Cargando />) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Cifra etiqueta="Gestiones nuevas" valor={r.nuevas} detalle={r.delDirectorio ? `${r.delDirectorio} por actualizar datos de pacientes` : undefined} />
            <Cifra etiqueta="Notas" valor={r.notas} />
            <Cifra etiqueta="Pacientes" valor={r.pacientes} />
            <Cifra etiqueta="Finalizadas" valor={r.finalizadas} />
            <Cifra etiqueta="No procede" valor={r.noProcede} />
            <Cifra etiqueta="En proceso hoy" valor={r.enProceso} />
            <Cifra etiqueta={`Sin movimiento (${DIAS_SIN_MOVIMIENTO}+ días)`} valor={r.sinMovimiento.length} alerta={r.sinMovimiento.length > 0} />
            <Cifra etiqueta="Actividades sin paciente" valor={r.actividades} detalle={r.asistentes ? `${r.asistentes} asistentes a charlas` : undefined} />
          </dl>

          {r.nuevas + r.notas + r.enProceso + r.actividades + r.finalizadas + r.noProcede === 0 ? (
            <Vacio icono={BarChart3} titulo="Sin registros en este mes" />
          ) : (
            <>
              <section className={`${tarjeta} grid gap-6 p-4 md:p-5 lg:grid-cols-2`}>
                <PorDiaGrafico titulo="Gestiones nuevas por día" dias={r.porDia.map((d) => ({ fecha: d.fecha, n: d.gestiones }))} unidad={["gestión", "gestiones"]} />
                <PorDiaGrafico titulo="Notas por día" dias={r.porDia.map((d) => ({ fecha: d.fecha, n: d.notas }))} unidad={["nota", "notas"]} />
              </section>

              <TablaConteo titulo="Por tipo de gestión" primera="Gestión" filas={r.porTipo} />
              <TablaConteo titulo="Por área" primera="Área" filas={r.porArea} />

              <section className={`${tarjeta} overflow-hidden`}>
                <TituloSeccion titulo="Por persona" detalle="El área es la de la gestión: así se ve cuando una cubre a la otra." />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <Cabecera columnas={["Trabajadora", "Gestiones", "Notas", "Pacientes", "Actividades", "En qué áreas"]} textoUltima />
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {r.porPersona.map((p) => (
                        <tr key={p.uid}>
                          <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{p.nombre}</td>
                          {[p.gestiones, p.notas, p.pacientes, p.actividades].map((n, i) => <Numero key={i} n={n} />)}
                          <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                            {p.areas.map((a) => `${nombreArea(a.area)}: ${a.gestiones} ${a.gestiones === 1 ? "gestión" : "gestiones"}, ${a.notas} ${a.notas === 1 ? "nota" : "notas"}`).join(" · ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="grid gap-5 md:grid-cols-2">
                <Barras titulo="Medio de las notas" filas={r.porMedio} />
                <Barras titulo="Con quién" filas={r.porConQuien} />
                <Barras titulo="Citas y estudios gestionados" filas={r.porDetalle} />
                <Barras titulo="Pacientes de la red, por establecimiento" filas={r.red.map((x) => ({ id: x.establecimiento, label: x.establecimiento, n: x.n }))} />
                <Barras titulo="Población" filas={r.poblacion} />
              </div>

              <ListaGestiones titulo={`Casos sin movimiento (${DIAS_SIN_MOVIMIENTO} días o más)`} detalle="Abiertos hoy, sin una nota reciente." lista={r.sinMovimiento} hoy={listo.hoy} />
              <ListaGestiones titulo="Cerradas como no procede" detalle="Con su motivo al abrirlas." lista={r.noProceden} hoy={listo.hoy} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Cifra({ etiqueta, valor, detalle, alerta = false }: { etiqueta: string; valor: number; detalle?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${alerta
      ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
      : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}>
      <dt className="text-xs text-slate-600 dark:text-slate-300">{etiqueta}</dt>
      <dd className="mt-1 font-heading text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{valor.toLocaleString("es-SV")}</dd>
      {detalle && <dd className="text-xs text-slate-500 dark:text-slate-400">{detalle}</dd>}
    </div>
  );
}

function TituloSeccion({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <h2 className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100">{titulo}</h2>
      {detalle && <p className="text-xs text-slate-500 dark:text-slate-400">{detalle}</p>}
    </div>
  );
}

function Cabecera({ columnas, textoUltima = false }: { columnas: string[]; textoUltima?: boolean }) {
  return (
    <thead>
      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {columnas.map((c, i) => (
          <th key={c} scope="col" className={`px-4 py-2 font-semibold ${i === 0 || (textoUltima && i === columnas.length - 1) ? "text-left" : "text-right"}`}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

const Numero = ({ n }: { n: number }) => (
  <td className={`px-4 py-2.5 text-right tabular-nums ${n ? "text-slate-800 dark:text-slate-100" : "text-slate-300 dark:text-slate-600"}`}>{n}</td>
);

function TablaConteo({ titulo, primera, filas }: { titulo: string; primera: string; filas: FilaConteo[] }) {
  return (
    <section className={`${tarjeta} overflow-hidden`}>
      <TituloSeccion titulo={titulo} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <Cabecera columnas={[primera, "Nuevas", "Notas", "Finalizadas", "No procede", "En proceso", "Días al cierre"]} />
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filas.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{f.label}</td>
                {[f.nuevas, f.notas, f.finalizadas, f.noProcede, f.enProceso].map((n, i) => <Numero key={i} n={n} />)}
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                  {f.diasCierre === null ? "—" : f.diasCierre.toLocaleString("es-SV", { maximumFractionDigits: 1 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Barras horizontales de una sola serie: el valor va al final de cada barra. */
function Barras({ titulo, filas }: { titulo: string; filas: { id: string; label: string; n: number }[] }) {
  if (!filas.length) return null;
  const max = Math.max(...filas.map((f) => f.n));
  return (
    <section className={`${tarjeta} p-4 md:p-5`}>
      <h2 className="mb-3 font-heading text-sm font-bold text-slate-900 dark:text-slate-100">{titulo}</h2>
      <ul className="space-y-2">
        {filas.map((f) => (
          <li key={f.id} title={`${f.label}: ${f.n}`}>
            <p className="text-xs text-slate-600 dark:text-slate-300">{f.label}</p>
            <div className="flex items-center gap-2">
              <div className="h-3 rounded-r bg-cyan-600 dark:bg-cyan-500" style={{ width: `calc(${(f.n / max) * 100}% - ${(f.n / max) * 2.5}rem)`, minWidth: 2 }} />
              <span className="text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100">{f.n}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Columnas por día. Dos gráficos separados: gestiones y notas tienen escalas distintas. */
function PorDiaGrafico({ titulo, dias, unidad }: { titulo: string; dias: { fecha: string; n: number }[]; unidad: [string, string] }) {
  const [sobre, setSobre] = useState<number | null>(null);
  const max = Math.max(1, ...dias.map((d) => d.n));
  const pico = dias.findIndex((d) => d.n === max && d.n > 0);
  const total = dias.reduce((s, d) => s + d.n, 0);
  const visto = sobre === null ? null : dias[sobre];
  return (
    <figure>
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100">{titulo}</span>
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400" aria-live="polite">
          {visto ? `${fechaCorta(visto.fecha)}: ${visto.n} ${visto.n === 1 ? unidad[0] : unidad[1]}` : `${total} en el mes`}
        </span>
      </figcaption>
      <div className="mt-3 flex h-32 items-end border-b border-slate-200 dark:border-slate-700" onMouseLeave={() => setSobre(null)}>
        {dias.map((d, i) => (
          <div
            key={d.fecha}
            tabIndex={d.n ? 0 : -1}
            aria-label={`${fechaCorta(d.fecha)}: ${d.n}`}
            onMouseEnter={() => setSobre(i)}
            onFocus={() => setSobre(i)}
            onBlur={() => setSobre(null)}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end px-px focus:outline-none"
          >
            {i === pico && <span className="text-[10px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{d.n}</span>}
            <div
              className={`w-full max-w-[18px] rounded-t ${sobre === i ? "bg-cyan-800 dark:bg-cyan-300" : "bg-cyan-600 dark:bg-cyan-500"}`}
              style={{ height: d.n ? `${(d.n / max) * 82}%` : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex text-[10px] tabular-nums text-slate-500 dark:text-slate-400" aria-hidden="true">
        {dias.map((d, i) => <span key={d.fecha} className="min-w-0 flex-1 text-center">{i === 0 || (i + 1) % 5 === 0 ? i + 1 : ""}</span>)}
      </div>
    </figure>
  );
}

function ListaGestiones({ titulo, detalle, lista, hoy }: { titulo: string; detalle: string; lista: GestionTSCE[]; hoy: string }) {
  if (!lista.length) return null;
  return (
    <section className={`${tarjeta} overflow-hidden`}>
      <TituloSeccion titulo={`${titulo}: ${lista.length}`} detalle={detalle} />
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {lista.map((g) => <TarjetaGestion key={g.id} gestion={g} hoy={hoy} />)}
      </ul>
    </section>
  );
}

/** La "Matriz de casos atendidos" que antes se hacía a mano. Respeta los filtros. */
async function descargarExcel(mes: string, d: DatosMes, filtro: { persona: string; area: string }) {
  const XLSX = await import("xlsx");
  const porId = new Map(d.gestiones.map((g) => [g.id, g]));
  const areaOk = (a?: string) => !filtro.area || a === filtro.area;
  const notas = d.notas
    .filter((n) => areaOk(porId.get(n.gestionId)?.area) && (!filtro.persona || n.autor === filtro.persona))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creadoEnMs - b.creadoEnMs);
  const conNota = new Set(notas.map((n) => n.gestionId));
  // Casos atendidos en el mes: los nuevos y los que tuvieron notas.
  const casos = d.gestiones
    .filter((g) => areaOk(g.area) && (conNota.has(g.id) || (g.fecha.slice(0, 7) === mes && (!filtro.persona || g.creadoPor === filtro.persona))))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creadoEnMs - b.creadoEnMs);
  const actividades = d.actividades
    .filter((a) => areaOk(a.area) && (!filtro.persona || a.autor === filtro.persona))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const hoja = (filas: Record<string, unknown>[], vacia: string) => {
    const h = XLSX.utils.json_to_sheet(filas.length ? filas : [{ [vacia]: "" }]);
    h["!cols"] = Object.keys(filas[0] ?? { [vacia]: "" }).map((k) => ({
      wch: Math.min(60, Math.max(k.length, ...filas.slice(0, 200).map((f) => String(f[k] ?? "").length)) + 2),
    }));
    return h;
  };
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja(casos.map((g, i) => ({
    "N.º": i + 1,
    Fecha: g.fecha,
    Expediente: g.expediente,
    DUI: g.dui,
    Paciente: g.paciente,
    Área: nombreArea(g.area),
    Gestión: labelTipo(g.tipo),
    Detalle: g.detalle ? labelDetalle(g.tipo, g.detalle) : "",
    Procedencia: g.procedencia === "red" ? g.establecimiento : g.procedencia === "propia" ? "De este hospital" : "",
    Médico: g.medico,
    Población: g.poblacion.map(labelPoblacion).join(", "),
    Estado: ESTADO_GESTION_LABEL[g.estado],
    "Motivo (no procede)": g.motivoNoProcede,
    Cierre: g.fechaCierre,
    "Notas en total": g.totalNotas,
    Adjuntos: g.adjuntos?.length || "",
    "Días sin movimiento": g.estado === "en_proceso" ? diasSinMovimiento(g, d.hoy) : "",
    "Registrada por": g.creadoPorNombre,
  })), "Sin casos"), "Casos atendidos");
  XLSX.utils.book_append_sheet(libro, hoja(notas.map((n) => {
    const g = porId.get(n.gestionId);
    return {
      Fecha: n.fecha,
      Expediente: g?.expediente ?? "",
      Paciente: g?.paciente ?? "",
      Gestión: g ? labelTipo(g.tipo) : "",
      Paso: n.paso ? labelPaso(g?.tipo ?? "", n.paso) : "",
      Medio: labelMedio(n.medio),
      "Con quién": n.conQuien ? labelConQuien(n.conQuien) : "",
      Nota: n.texto,
      Autora: n.autorNombre,
    };
  }), "Sin notas"), "Notas");
  XLSX.utils.book_append_sheet(libro, hoja(actividades.map((a) => ({
    Fecha: a.fecha, Actividad: labelActividad(a.tipo), Detalle: a.detalle, Asistentes: a.asistentes || "", Área: nombreArea(a.area), "Registrada por": a.autorNombre,
  })), "Sin actividades"), "Actividades");
  XLSX.writeFile(libro, `trabajo-social-consulta-externa-${mes}.xlsx`);
}
