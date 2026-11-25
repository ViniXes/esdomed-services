"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Ban, CircleCheckBig, FileX, Loader2, MessageSquarePlus, Pencil, Phone, RotateCcw, Trash2 } from "lucide-react";
import {
  esAutomatica, labelPoblacion, nombreArea, tituloGestion, validarGestion, validarMotivo, validarNota,
  type DatosNota, type GestionTSCE, type NotaTSCE,
} from "@/lib/consultaExterna/trabajoSocial";
import type { FichaGuardada } from "@/lib/consultaExterna/trabajoSocialDirectorio";
import { AdjuntosGestion } from "./Adjuntos";
import { CamposGestion, CamposNota, CamposPoblacion, ComoQueda, gestionABorrador, gestionVacia, notaVacia, type BorradorGestion } from "./Campos";
import { RUTAS_TS, mensaje, useTS } from "./contexto";
import { Evolucion } from "./Evolucion";
import { IconoTipo } from "./iconos";
import {
  Aviso, Cargando, Estado, Vacio, botonPrimario, botonSecundario, botonTexto, entrada, fechaCorta, inputCls, preguntaCls, tarjeta,
} from "./ui";

// Seguimiento de una gestión: aquí se le agregan las notas y se cierra. Es el
// único lugar donde una gestión cambia; las listas solo traen hasta aquí.
// Cualquiera del equipo agrega notas, la cierra o la reabre; corregirla o
// borrarla es de quien la registró.
//
// Primero se lee (ficha y evolución) y luego se actúa: cada acción abre su
// panel, uno a la vez.

type Panel = "" | "nota" | "finalizar" | "no_procede" | "corregir" | "borrar";
interface Datos { hoy: string; gestion: GestionTSCE; notas: NotaTSCE[] }

export function DetalleGestion({ id }: { id: string }) {
  const { llamar, uid, esAdmin, registra } = useTS();
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [errorLectura, setErrorLectura] = useState("");
  const [panel, setPanel] = useState<Panel>("");
  const [borrador, setBorrador] = useState<BorradorGestion>(gestionVacia);
  const [nota, setNota] = useState<DatosNota | null>(null);
  const [finalizada, setFinalizada] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [contacto, setContacto] = useState<{ ficha: FichaGuardada | null } | null>(null);

  useEffect(() => {
    let vivo = true;
    llamar<Datos>(`/gestiones/${encodeURIComponent(id)}`)
      .then((r) => { if (vivo) setDatos(r); })
      .catch((e) => { if (vivo) setErrorLectura(mensaje(e)); });
    return () => { vivo = false; };
  }, [id, llamar]);

  // Para dar seguimiento hay que llamar: el teléfono del directorio se trae con la gestión.
  const clavePaciente = datos?.gestion.clave ?? "";
  useEffect(() => {
    if (!clavePaciente || !registra) return;
    let vivo = true;
    llamar<{ ficha: FichaGuardada | null }>(`/directorio?clave=${encodeURIComponent(clavePaciente)}`)
      .then((r) => { if (vivo) setContacto({ ficha: r.ficha }); })
      .catch(() => { /* es una ayuda: la gestión se trabaja igual sin ella */ });
    return () => { vivo = false; };
  }, [clavePaciente, registra, llamar]);

  const volver = (
    <Link prefetch={false} href={RUTAS_TS.seguimiento} className={botonSecundario}><ArrowLeft size={14} aria-hidden="true" />Seguimiento</Link>
  );

  if (!datos) {
    return (
      <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
        <div>{volver}</div>
        {errorLectura ? <Vacio icono={FileX} titulo={errorLectura} /> : <Cargando />}
      </div>
    );
  }

  const { gestion: g, notas, hoy } = datos;
  const enProceso = g.estado === "en_proceso";
  const mia = esAdmin || g.creadoPor === uid;
  // La nota a medio escribir se conserva aunque se abra otro panel.
  const notaActual = nota ?? notaVacia(hoy);

  const abrirPanel = (p: Panel) => {
    setError("");
    setAviso("");
    if (p === "corregir") setBorrador(gestionABorrador(g));
    setPanel(panel === p ? "" : p);
  };

  const hacer = async (accion: () => Promise<void>) => {
    setGuardando(true);
    setError("");
    try {
      await accion();
      setPanel("");
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarGestion = (cuerpo: object, hecho: string) => hacer(async () => {
    const r = await llamar<{ gestion: GestionTSCE }>(`/gestiones/${g.id}`, "PATCH", cuerpo);
    setDatos({ ...datos, gestion: r.gestion });
    setAviso(hecho);
  });

  const guardarNota = () => {
    const v = validarNota(notaActual, g.tipo, hoy);
    if (!v.ok) { setError(v.error); return; }
    void hacer(async () => {
      const r = await llamar<{ nota: NotaTSCE; gestion: GestionTSCE }>("/notas", "POST", { gestionId: g.id, nota: v.datos, finalizar: finalizada });
      setDatos({ hoy, gestion: r.gestion, notas: [...notas, r.nota] });
      setNota(null);
      setFinalizada(false);
      setAviso(r.gestion.estado === "finalizada" ? "Nota guardada. La gestión quedó finalizada." : "Nota guardada.");
    });
  };

  const guardarCorreccion = () => {
    const v = validarGestion(borrador);
    if (!v.ok) { setError(v.error); return; }
    void cambiarGestion({ accion: "corregir", gestion: v.datos }, "Datos corregidos.");
  };

  const marcarNoProcede = () => {
    const v = validarMotivo(motivo);
    if (!v.ok) { setError(v.error); return; }
    void cambiarGestion({ accion: "no_procede", motivo: v.datos }, "Gestión cerrada como «No procede».");
  };

  const borrar = () => hacer(async () => {
    await llamar(`/gestiones/${g.id}`, "DELETE");
    router.replace(RUTAS_TS.seguimiento);
  });

  const alCambiarNotas = (lista: NotaTSCE[]) => setDatos({
    ...datos,
    notas: lista,
    gestion: { ...g, totalNotas: lista.length, ultimaNotaFecha: lista.map((n) => n.fecha).sort().pop() ?? g.fecha },
  });

  const cerrar = () => { setPanel(""); setError(""); };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
      <div>{volver}</div>

      {/* Ficha: de quién es y qué gestión es. */}
      <section className={`${tarjeta} overflow-hidden`}>
        <div className="p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-heading text-xl font-bold leading-snug text-slate-900 dark:text-slate-100">{g.paciente}</h1>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                {g.expediente ? <span className="font-mono font-bold text-blue-700 dark:text-cyan-300">{g.expediente}</span> : "Sin expediente"}
                {g.dui && <> · DUI <span className="font-mono">{g.dui}</span></>}
                {g.origen === "manual" && <> · escrito a mano</>}
              </p>
            </div>
            <Estado estado={g.estado} />
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-xl bg-blue-50/70 px-3 py-2.5 dark:bg-blue-950/30">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-800 text-white"><IconoTipo tipo={g.tipo} size={18} /></span>
            <p className="min-w-0 text-[15px] font-semibold leading-snug text-blue-950 dark:text-blue-100">{tituloGestion(g)}</p>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Dato etiqueta="Registrada" valor={`${fechaCorta(g.fecha)} · ${g.creadoPorNombre}`} />
            <Dato etiqueta="Área" valor={nombreArea(g.area)} />
            {g.medico && <Dato etiqueta="Médico" valor={g.medico} />}
            {g.procedencia === "red" && <Dato etiqueta="Procedencia" valor={g.establecimiento} />}
            {g.poblacion.length > 0 && <Dato etiqueta="Paciente" valor={g.poblacion.map(labelPoblacion).join(", ")} />}
          </dl>
        </div>

        {contacto && <Contacto ficha={contacto.ficha} clave={g.clave} />}

        {registra && mia && (
          <div className="flex justify-end gap-1 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
            {/* La que deja el directorio se corrige en la ficha del paciente, no aquí. */}
            {!esAutomatica(g.tipo) && (
              <button type="button" onClick={() => abrirPanel("corregir")} aria-expanded={panel === "corregir"} className={botonTexto}><Pencil size={13} aria-hidden="true" />Corregir datos</button>
            )}
            <button type="button" onClick={() => abrirPanel("borrar")} aria-expanded={panel === "borrar"} className={botonTexto}><Trash2 size={13} aria-hidden="true" />Borrar</button>
          </div>
        )}
      </section>

      {panel === "corregir" && (
        <Bloque titulo="Corregir datos de la gestión" guardando={guardando} texto="Guardar corrección" onGuardar={guardarCorreccion} onCancelar={cerrar} error={error}>
          <CamposGestion valor={borrador} onChange={setBorrador} paciente={{ especialidadId: g.especialidadId, areaCuenta: g.area }} areaSiempre />
          {borrador.tipo && <CamposPoblacion valor={borrador.poblacion} onChange={(poblacion) => setBorrador({ ...borrador, poblacion })} />}
        </Bloque>
      )}
      {panel === "borrar" && (
        <Bloque titulo="Borrar la gestión" guardando={guardando} texto="Sí, borrar" onGuardar={() => void borrar()} onCancelar={cerrar} error={error} peligro>
          <p className="text-sm text-slate-700 dark:text-slate-200">Se borra la gestión con sus notas, sin dejar rastro. Si solo no corresponde, ciérrela como «No procede».</p>
        </Bloque>
      )}

      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}

      {/* Cerrada: cómo quedó y la salida para reabrirla. */}
      {!enProceso && (
        <section className={`rounded-2xl border p-4 ${g.estado === "finalizada"
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
          : "border-slate-200 bg-slate-100/70 dark:border-slate-700 dark:bg-slate-800/50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`flex items-center gap-2 text-sm font-semibold ${g.estado === "finalizada" ? "text-emerald-900 dark:text-emerald-100" : "text-slate-800 dark:text-slate-100"}`}>
                {g.estado === "finalizada" ? <CircleCheckBig size={16} aria-hidden="true" /> : <Ban size={16} aria-hidden="true" />}
                {g.estado === "finalizada" ? "Finalizada" : "No procede"}{g.fechaCierre && ` el ${fechaCorta(g.fechaCierre)}`}
              </p>
              {g.estado === "no_procede" && g.motivoNoProcede && <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{g.motivoNoProcede}</p>}
            </div>
            {registra && (
              <button type="button" disabled={guardando} onClick={() => void cambiarGestion({ accion: "reabrir" }, "Gestión reabierta.")} className={`${botonSecundario} bg-white dark:bg-slate-900`}>
                {guardando ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />}Reabrir
              </button>
            )}
          </div>
          {error && panel === "" && <div className="mt-3"><Aviso tipo="error">{error}</Aviso></div>}
        </section>
      )}

      {/* En proceso: lo que se le puede hacer. */}
      {enProceso && registra && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]" role="group" aria-label="Acciones de la gestión">
          <button type="button" onClick={() => abrirPanel("nota")} aria-expanded={panel === "nota"} className={`${botonPrimario} col-span-2 py-3 sm:col-span-1`}>
            <MessageSquarePlus size={17} aria-hidden="true" />Agregar nota
          </button>
          <button type="button" onClick={() => abrirPanel("finalizar")} aria-expanded={panel === "finalizar"} className={`${botonSecundario} bg-white py-3 dark:bg-slate-900`}>
            <CircleCheckBig size={16} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />Finalizar
          </button>
          <button type="button" onClick={() => abrirPanel("no_procede")} aria-expanded={panel === "no_procede"} className={`${botonSecundario} bg-white py-3 dark:bg-slate-900`}>
            <Ban size={16} className="text-slate-500 dark:text-slate-400" aria-hidden="true" />No procede
          </button>
        </div>
      )}

      {panel === "nota" && (
        <Bloque titulo="Nueva nota de seguimiento" guardando={guardando} texto={finalizada ? "Guardar nota y finalizar" : "Guardar nota"} onGuardar={guardarNota} onCancelar={cerrar} error={error}>
          <CamposNota valor={notaActual} onChange={(v) => { setNota(v); setError(""); }} tipo={g.tipo} hoy={hoy} desde={g.fecha} />
          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <ComoQueda valor={finalizada} onChange={setFinalizada} />
          </div>
        </Bloque>
      )}
      {panel === "finalizar" && (
        <Bloque titulo="Finalizar la gestión" guardando={guardando} texto="Sí, finalizar" onGuardar={() => void cambiarGestion({ accion: "finalizar" }, "Gestión finalizada.")} onCancelar={cerrar} error={error}>
          <p className="text-sm text-slate-700 dark:text-slate-200">Queda como resuelta con las notas que ya tiene. Si hace falta, se puede reabrir.</p>
        </Bloque>
      )}
      {panel === "no_procede" && (
        <Bloque titulo="Cerrar como «No procede»" guardando={guardando} texto="Cerrar como no procede" onGuardar={marcarNoProcede} onCancelar={cerrar} error={error}>
          <label className="block">
            <span className={preguntaCls}>¿Por qué no procede?</span>
            <textarea value={motivo} onChange={(e) => { setMotivo(e.target.value); setError(""); }} rows={2} maxLength={500} autoFocus className={`${inputCls} resize-y`} />
          </label>
        </Bloque>
      )}

      {/* Los respaldos se pueden anexar en cualquier momento, también con la gestión ya cerrada. */}
      <AdjuntosGestion gestion={g} onCambio={(gestion) => setDatos({ ...datos, gestion })} />

      <section>
        <h2 className="mb-3 font-heading text-sm font-bold text-slate-900 dark:text-slate-100">
          Evolución <span className="font-normal text-slate-500 dark:text-slate-400">· {notas.length} {notas.length === 1 ? "nota" : "notas"}</span>
        </h2>
        <Evolucion gestion={g} notas={notas} hoy={hoy} onNotas={alCambiarNotas} />
      </section>
    </div>
  );
}

const telefono = (t: string) => (
  <a href={`tel:${t.replace(/[^\d+]/g, "")}`} className="font-semibold tabular-nums text-blue-700 underline-offset-2 hover:underline dark:text-cyan-300">{t}</a>
);

/** A quién llamar, tomado del directorio; sin ficha, la salida para completarla. */
function Contacto({ ficha, clave }: { ficha: FichaGuardada | null; clave: string }) {
  const r = ficha?.responsable;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 px-4 py-2.5 text-sm dark:border-slate-800 md:px-5">
      <span className="flex items-center gap-2">
        <Phone size={15} className="shrink-0 text-cyan-700 dark:text-cyan-300" aria-hidden="true" />
        {ficha?.telefono
          ? <>{telefono(ficha.telefono)}{ficha.telefono2 && <> · {telefono(ficha.telefono2)}</>}</>
          : <span className="text-slate-500 dark:text-slate-400">Sin teléfono registrado</span>}
      </span>
      {r?.nombre && (
        <span className="text-slate-600 dark:text-slate-300">
          Responsable: {r.nombre}{r.parentesco && ` · ${r.parentesco}`}{r.telefono && <> · {telefono(r.telefono)}</>}
        </span>
      )}
      <Link prefetch={false} href={RUTAS_TS.directorio(clave)} className={`${botonTexto} ml-auto`}>
        {ficha ? "Ver ficha" : "Completar datos"}<ArrowRight size={13} aria-hidden="true" />
      </Link>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm text-slate-800 dark:text-slate-100">{valor}</dd>
    </div>
  );
}

/** Panel de una acción: se abre debajo de lo que lo abrió, uno a la vez. */
function Bloque({ titulo, children, texto, guardando, onGuardar, onCancelar, error, peligro = false }: {
  titulo: string; children: React.ReactNode; texto: string; guardando: boolean; onGuardar: () => void; onCancelar: () => void; error: string; peligro?: boolean;
}) {
  return (
    <form
      className={`${tarjeta} ${entrada} space-y-5 p-4 md:p-5`}
      onSubmit={(e) => { e.preventDefault(); onGuardar(); }}
    >
      <h2 className="font-heading text-base font-bold text-slate-900 dark:text-slate-100">{titulo}</h2>
      {children}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className={botonSecundario}>Cancelar</button>
        <button type="submit" disabled={guardando} className={peligro ? `${botonPrimario} !bg-rose-600 hover:!bg-rose-700` : botonPrimario}>
          {guardando && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
          {texto}
        </button>
      </div>
    </form>
  );
}
