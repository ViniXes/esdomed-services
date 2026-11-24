"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck2, Loader2, NotebookPen, RefreshCw, Trash2, UsersRound } from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import {
  TIPOS_ACTIVIDAD, labelActividad, labelTipo, validarActividad, validarGestion, validarNota,
  type ActividadTSCE, type AreaTSCE, type DatosNota, type GestionTSCE, type NotaTSCE,
} from "@/lib/consultaExterna/trabajoSocial";
import { BuscadorCitado, type Elegido } from "./BuscadorCitado";
import { CamposGestion, CamposNota, gestionVacia, notaVacia, type BorradorGestion } from "./Campos";
import { mensaje, useTS } from "./contexto";
import { TarjetaGestion } from "./TarjetaGestion";
import {
  Aviso, Cargando, Chips, Encabezado, Segmentos, Vacio, botonPrimario, botonSecundario, botonTexto, etiquetaCls, fechaCorta, inputCls, tarjeta,
} from "./ui";

// Registro de gestiones: nueva gestión, las que están en proceso, lo hecho en
// un día y las actividades que no son de un paciente.

type Vista = "nueva" | "proceso" | "dia" | "actividades";
type ListaGestiones = { hoy: string; gestiones: GestionTSCE[] };

export function RegistroGestiones() {
  const { llamar } = useTS();
  const [vista, setVista] = useState<Vista>("nueva");
  const [proceso, setProceso] = useState<ListaGestiones | null>(null);
  const [errorProceso, setErrorProceso] = useState("");

  const leerProceso = useCallback(async () => {
    try {
      setProceso(await llamar<ListaGestiones>("/gestiones?estado=en_proceso"));
      setErrorProceso("");
    } catch (e) {
      setErrorProceso(mensaje(e));
    }
  }, [llamar]);

  useEffect(() => {
    const t = window.setTimeout(() => { void leerProceso(); }, 0);
    return () => window.clearTimeout(t);
  }, [leerProceso]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <Encabezado icono={NotebookPen} titulo="Registro de gestiones" detalle="Trabajo Social de Consulta Externa" />
      <Segmentos<Vista>
        etiqueta="Vista"
        valor={vista}
        onChange={(v) => { setVista(v); if (v === "proceso") void leerProceso(); }}
        opciones={[
          { id: "nueva", label: "Nueva gestión" },
          { id: "proceso", label: "En proceso", n: proceso?.gestiones.length },
          { id: "dia", label: "Por día" },
          { id: "actividades", label: "Sin paciente" },
        ]}
      />
      {/* La gestión a medio llenar no se pierde al mirar otra vista. */}
      <div hidden={vista !== "nueva"}><NuevaGestion onRegistrada={() => void leerProceso()} /></div>
      {vista === "proceso" && (
        <EnProceso datos={proceso} error={errorProceso} onActualizar={() => void leerProceso()} onLista={(gestiones) => setProceso((p) => p && { ...p, gestiones })} />
      )}
      {vista === "dia" && <PorDia />}
      {vista === "actividades" && <Actividades />}
    </div>
  );
}

// ── Nueva gestión ───────────────────────────────────────────────────────────

function NuevaGestion({ onRegistrada }: { onRegistrada: () => void }) {
  const { llamar, area } = useTS();
  const hoy = hoySV();
  const [elegido, setElegido] = useState<Elegido | null>(null);
  const [gestion, setGestion] = useState<BorradorGestion>(gestionVacia);
  const [nota, setNota] = useState<DatosNota>(() => notaVacia(hoy));
  const [finalizada, setFinalizada] = useState(false);
  const [abiertas, setAbiertas] = useState<{ clave: string; gestiones: GestionTSCE[]; notas: NotaTSCE[] } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const arriba = useRef<HTMLDivElement>(null);

  // Si el paciente ya tiene gestiones abiertas, se muestran: quizá lo que toca es una nota.
  const leerAbiertas = async (clave: string) => {
    try {
      const r = await llamar<{ gestiones: GestionTSCE[]; notas: NotaTSCE[] }>(`/gestiones?paciente=${encodeURIComponent(clave)}`);
      setAbiertas({ clave, gestiones: r.gestiones.filter((g) => g.estado === "en_proceso"), notas: r.notas });
    } catch {
      setAbiertas(null); // solo es una ayuda: no impide registrar
    }
  };

  const elegir = (e: Elegido | null) => {
    setElegido(e);
    setExito("");
    setError("");
    setAbiertas(null);
    // El área y el médico se sugieren según el paciente.
    setGestion((g) => ({ ...gestionVacia(), poblacion: e ? g.poblacion : [] }));
    if (e) void leerAbiertas(e.paciente.clave);
  };

  const limpiar = () => {
    setGestion(gestionVacia());
    setNota(notaVacia(hoySV()));
    setFinalizada(false);
  };

  const guardar = async () => {
    if (!elegido) { setError("Elija el paciente."); return; }
    const g = validarGestion(gestion);
    if (!g.ok) { setError(g.error); return; }
    const n = validarNota(nota, g.datos.tipo, hoySV());
    if (!n.ok) { setError(n.error); return; }
    setGuardando(true);
    setError("");
    try {
      const p = elegido.paciente;
      await llamar("/gestiones", "POST", {
        ...(elegido.manual ? { manual: { expediente: p.expediente, dui: p.dui, paciente: p.paciente } } : { clave: p.clave }),
        gestion: g.datos,
        nota: n.datos,
        finalizada,
      });
      setExito(`${labelTipo(g.datos.tipo)} registrada para ${p.paciente}.`);
      limpiar();
      void leerAbiertas(p.clave);
      onRegistrada();
      arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  const otras = elegido && abiertas?.clave === elegido.paciente.clave ? abiertas.gestiones : [];
  return (
    <div ref={arriba} className="scroll-mt-4 space-y-4">
      {exito && (
        <Aviso tipo="exito">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{exito}</span>
            <button type="button" onClick={() => elegir(null)} className={botonSecundario}>Otro paciente</button>
          </div>
        </Aviso>
      )}

      <Paso titulo="Paciente">
        <BuscadorCitado elegido={elegido} onElegir={elegir} />
        {otras.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {otras.length === 1 ? "Ya tiene una gestión en proceso" : `Ya tiene ${otras.length} gestiones en proceso`}
              <span className="ml-1.5 font-normal text-slate-500 dark:text-slate-400">Si es la misma, agréguele la nota aquí.</span>
            </p>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {otras.map((g) => (
                <TarjetaGestion
                  key={g.id}
                  gestion={g}
                  hoy={hoy}
                  mostrarPaciente={false}
                  notas={abiertas?.notas.filter((n) => n.gestionId === g.id)}
                  onCambio={(x) => {
                    setAbiertas((a) => a && { ...a, gestiones: x ? a.gestiones.map((y) => (y.id === x.id ? x : y)) : a.gestiones.filter((y) => y.id !== g.id) });
                    onRegistrada();
                  }}
                />
              ))}
            </ul>
          </div>
        )}
      </Paso>

      {elegido && (
        <Paso titulo="Gestión">
          <CamposGestion
            key={elegido.paciente.clave}
            valor={gestion}
            onChange={(g) => {
              if (g.tipo !== gestion.tipo) setNota((n) => ({ ...n, paso: "" }));
              setGestion(g);
              setExito("");
            }}
            especialidadId={elegido.paciente.especialidadId}
            areaCuenta={area}
            medicoSugerido={elegido.paciente.medico}
          />
        </Paso>
      )}

      {elegido && gestion.tipo && (
        <Paso titulo="Primera nota">
          <CamposNota valor={nota} onChange={setNota} tipo={gestion.tipo} hoy={hoy} />
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <p className={etiquetaCls}>La gestión queda</p>
            <Chips
              opciones={[{ id: "en_proceso", label: "En proceso" }, { id: "finalizada", label: "Finalizada" }]}
              valor={finalizada ? "finalizada" : "en_proceso"}
              onChange={(v) => setFinalizada(v === "finalizada")}
              etiqueta="Estado en que queda"
            />
          </div>
        </Paso>
      )}

      {error && <Aviso tipo="error">{error}</Aviso>}
      {elegido && gestion.tipo && (
        <div className="flex justify-end">
          <button type="button" onClick={() => void guardar()} disabled={guardando} className={`${botonPrimario} w-full px-6 sm:w-auto`}>
            {guardando && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            Registrar gestión
          </button>
        </div>
      )}
    </div>
  );
}

function Paso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className={`${tarjeta} p-4 md:p-5`}>
      <h2 className="mb-3 font-heading text-sm font-bold text-slate-900 dark:text-slate-100">{titulo}</h2>
      {children}
    </section>
  );
}

// ── En proceso ──────────────────────────────────────────────────────────────

function EnProceso({ datos, error, onActualizar, onLista }: {
  datos: ListaGestiones | null; error: string; onActualizar: () => void; onLista: (g: GestionTSCE[]) => void;
}) {
  const { uid } = useTS();
  const [mias, setMias] = useState(false);
  const [filtro, setFiltro] = useState("");

  if (error && !datos) return <Aviso tipo="error">{error}</Aviso>;
  if (!datos) return <Cargando />;
  const k = filtro.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visibles = datos.gestiones.filter((g) =>
    (!mias || g.creadoPor === uid)
    && (!k || `${g.paciente} ${g.expediente} ${labelTipo(g.tipo)}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(k)));
  return (
    <div className="space-y-3">
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por paciente, expediente o gestión" aria-label="Filtrar" className={`${inputCls} min-w-[14rem] flex-1`} />
        <Segmentos
          etiqueta="De quién"
          valor={mias ? "mias" : "todas"}
          onChange={(v) => setMias(v === "mias")}
          opciones={[{ id: "todas", label: "Del equipo" }, { id: "mias", label: "Mías" }]}
        />
        <button type="button" onClick={onActualizar} className={botonSecundario}><RefreshCw size={14} aria-hidden="true" />Actualizar</button>
      </div>
      {visibles.length === 0 ? (
        <Vacio icono={NotebookPen} titulo={datos.gestiones.length ? "Nada con ese filtro" : "No hay gestiones en proceso"} />
      ) : (
        <>
          <p className="px-1 text-xs text-slate-500 dark:text-slate-400">Primero las que llevan más tiempo sin una nota.</p>
          <ul className={`${tarjeta} divide-y divide-slate-100 overflow-hidden dark:divide-slate-800`}>
            {visibles.map((g) => (
              <TarjetaGestion
                key={g.id}
                gestion={g}
                hoy={datos.hoy}
                onCambio={(x) => onLista(x
                  ? datos.gestiones.map((y) => (y.id === x.id ? x : y))
                  : datos.gestiones.filter((y) => y.id !== g.id))}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ── Por día ─────────────────────────────────────────────────────────────────

function PorDia() {
  const { llamar } = useTS();
  const [fecha, setFecha] = useState(() => hoySV());
  const [datos, setDatos] = useState<(ListaGestiones & { fecha: string; notas: NotaTSCE[] }) | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    llamar<ListaGestiones & { notas: NotaTSCE[] }>(`/gestiones?fecha=${fecha}`)
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
          {datos.gestiones.map((g) => (
            <TarjetaGestion
              key={g.id}
              gestion={g}
              hoy={datos.hoy}
              onCambio={(x) => setDatos((d) => d && { ...d, gestiones: x ? d.gestiones.map((y) => (y.id === x.id ? x : y)) : d.gestiones.filter((y) => y.id !== g.id) })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Actividades sin paciente ────────────────────────────────────────────────

function Actividades() {
  const { llamar, area, uid, esAdmin } = useTS();
  const hoy = hoySV();
  const [mes] = useState(() => hoy.slice(0, 7));
  const [lista, setLista] = useState<ActividadTSCE[] | null>(null);
  const [tipo, setTipo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [asistentes, setAsistentes] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [porBorrar, setPorBorrar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  useEffect(() => {
    let vivo = true;
    llamar<{ actividades: ActividadTSCE[] }>(`/actividades?mes=${mes}`)
      .then((r) => { if (vivo) setLista(r.actividades); })
      .catch((e) => { if (vivo) setError(mensaje(e)); });
    return () => { vivo = false; };
  }, [llamar, mes]);

  const t = TIPOS_ACTIVIDAD.find((x) => x.id === tipo);
  const guardar = async () => {
    const v = validarActividad({ tipo, detalle, asistentes: asistentes === "" ? 0 : Number(asistentes), area: (area || "otra") as AreaTSCE, fecha }, hoySV());
    if (!v.ok) { setError(v.error); return; }
    setGuardando(true);
    setError("");
    try {
      const r = await llamar<{ actividad: ActividadTSCE }>("/actividades", "POST", { actividad: v.datos });
      if (r.actividad.fecha.slice(0, 7) === mes) setLista((l) => [r.actividad, ...(l ?? [])]);
      setExito(`${labelActividad(v.datos.tipo)} registrada.`);
      setTipo(""); setDetalle(""); setAsistentes(""); setFecha(hoySV());
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (a: ActividadTSCE) => {
    setError("");
    try {
      await llamar(`/actividades/${a.id}`, "DELETE");
      setLista((l) => (l ?? []).filter((x) => x.id !== a.id));
      setPorBorrar("");
    } catch (e) {
      setError(mensaje(e));
    }
  };

  return (
    <div className="space-y-4">
      {exito && <Aviso tipo="exito">{exito}</Aviso>}
      <Paso titulo="Actividad que no es de un paciente">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
          <Chips opciones={TIPOS_ACTIVIDAD} valor={tipo} onChange={(v) => { setTipo(v); setExito(""); }} etiqueta="Tipo de actividad" />
          {t && (
            <>
              <label className="block">
                <span className={etiquetaCls}>{t.pregunta}</span>
                <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={2} maxLength={500} className={`${inputCls} resize-y`} />
              </label>
              <div className="flex flex-wrap items-end gap-4">
                {t.asistentes && (
                  <label className="w-32">
                    <span className={etiquetaCls}>Asistentes</span>
                    <input value={asistentes} inputMode="numeric" onChange={(e) => setAsistentes(e.target.value.replace(/\D/g, "").slice(0, 4))} className={inputCls} />
                  </label>
                )}
                <div className="w-44">
                  <p className={etiquetaCls}>Fecha</p>
                  <DateField value={fecha} onChange={(f) => setFecha(f || hoy)} ariaLabel="Fecha de la actividad" maxDate={new Date(`${hoy}T00:00:00`)} />
                </div>
                <button type="submit" disabled={guardando} className={`${botonPrimario} ml-auto`}>
                  {guardando && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}Registrar actividad
                </button>
              </div>
            </>
          )}
        </form>
      </Paso>
      {error && <Aviso tipo="error">{error}</Aviso>}

      {!lista ? (!error && <Cargando />) : lista.length === 0 ? (
        <Vacio icono={UsersRound} titulo="Sin actividades este mes" />
      ) : (
        <ul className={`${tarjeta} divide-y divide-slate-100 overflow-hidden dark:divide-slate-800`}>
          {lista.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{labelActividad(a.tipo)}</p>
                <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{a.detalle}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {fechaCorta(a.fecha)} · {a.autorNombre}{a.asistentes > 0 && ` · ${a.asistentes} asistentes`}
                </p>
              </div>
              {(esAdmin || a.autor === uid) && (porBorrar === a.id ? (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => setPorBorrar("")} className={botonTexto}>Cancelar</button>
                  <button type="button" onClick={() => void borrar(a)} className={`${botonTexto} text-rose-700 dark:text-rose-300`}>Sí, borrar</button>
                </span>
              ) : (
                <button type="button" aria-label="Borrar la actividad" onClick={() => setPorBorrar(a.id)} className={botonTexto}><Trash2 size={13} /></button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
