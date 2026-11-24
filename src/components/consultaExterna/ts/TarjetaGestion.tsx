"use client";

import { useState } from "react";
import { ChevronDown, Loader2, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import {
  diasSinMovimiento, labelConQuien, labelDetalle, labelMedio, labelPaso, labelPoblacion, labelTipo, nombreArea, validarGestion, validarMotivo,
  validarNota, type DatosNota, type GestionTSCE, type NotaTSCE,
} from "@/lib/consultaExterna/trabajoSocial";
import { CamposGestion, CamposNota, gestionABorrador, notaABorrador, notaVacia } from "./Campos";
import { mensaje, useTS } from "./contexto";
import { Aviso, Estado, botonPrimario, botonSecundario, botonTexto, fechaCorta, haceDias, inputCls } from "./ui";

// Una gestión con sus notas. Cerrada muestra lo esencial; abierta, las notas y
// las acciones. Cualquiera del equipo agrega notas, la cierra o la reabre;
// corregirla, o corregir una nota, es de quien la escribió.

type Panel = "" | "nota" | "no_procede" | "corregir" | "borrar" | "finalizar";

interface Props {
  gestion: GestionTSCE;
  hoy: string;
  /** Notas ya leídas (bitácora); si no, se leen al abrir. */
  notas?: NotaTSCE[];
  abiertaInicial?: boolean;
  mostrarPaciente?: boolean;
  onCambio: (g: GestionTSCE | null) => void;
}

export function TarjetaGestion({ gestion: g, hoy, notas: notasIniciales, abiertaInicial = false, mostrarPaciente = true, onCambio }: Props) {
  const { llamar, uid, esAdmin, registra } = useTS();
  const [abierta, setAbierta] = useState(abiertaInicial);
  const [leidas, setLeidas] = useState<NotaTSCE[] | null>(notasIniciales ?? null);
  const [leyendo, setLeyendo] = useState(false);
  const [panel, setPanel] = useState<Panel>("");
  const [nota, setNota] = useState<DatosNota>(() => notaVacia(hoy));
  const [borrador, setBorrador] = useState(() => gestionABorrador(g));
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const enProceso = g.estado === "en_proceso";
  const mia = esAdmin || g.creadoPor === uid;
  const dias = diasSinMovimiento(g, hoy);

  const leerNotas = async () => {
    setLeyendo(true);
    setError("");
    try {
      setLeidas((await llamar<{ notas: NotaTSCE[] }>(`/notas?gestion=${encodeURIComponent(g.id)}`)).notas);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setLeyendo(false);
    }
  };

  const alternar = () => {
    if (!abierta && !leidas) void leerNotas();
    setAbierta(!abierta);
  };

  const abrirPanel = (p: Panel) => {
    setError("");
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

  const cambiarGestion = (cuerpo: object) => hacer(async () => {
    const r = await llamar<{ gestion: GestionTSCE }>(`/gestiones/${g.id}`, "PATCH", cuerpo);
    onCambio(r.gestion);
  });

  const guardarNota = () => {
    const v = validarNota(nota, g.tipo, hoy);
    if (!v.ok) { setError(v.error); return; }
    void hacer(async () => {
      const r = await llamar<{ nota: NotaTSCE }>("/notas", "POST", { gestionId: g.id, nota: v.datos });
      setLeidas((l) => [...(l ?? []), r.nota]);
      setNota(notaVacia(hoy));
      onCambio({ ...g, totalNotas: g.totalNotas + 1, ultimaNotaFecha: r.nota.fecha > g.ultimaNotaFecha ? r.nota.fecha : g.ultimaNotaFecha });
    });
  };

  const guardarCorreccion = () => {
    const v = validarGestion(borrador);
    if (!v.ok) { setError(v.error); return; }
    void cambiarGestion({ accion: "corregir", gestion: v.datos });
  };

  const marcarNoProcede = () => {
    const v = validarMotivo(motivo);
    if (!v.ok) { setError(v.error); return; }
    void cambiarGestion({ accion: "no_procede", motivo: v.datos });
  };

  const borrar = () => hacer(async () => {
    await llamar(`/gestiones/${g.id}`, "DELETE");
    onCambio(null);
  });

  const cambioDeNotas = (lista: NotaTSCE[]) => {
    setLeidas(lista);
    onCambio({ ...g, totalNotas: lista.length, ultimaNotaFecha: lista.map((n) => n.fecha).sort().pop() ?? g.fecha });
  };

  const ordenadas = [...(leidas ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEnMs - a.creadoEnMs);
  const titulo = g.detalle ? `${labelTipo(g.tipo)}: ${labelDetalle(g.tipo, g.detalle)}` : labelTipo(g.tipo);

  return (
    <li>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierta}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <span className="min-w-0 flex-1">
          {mostrarPaciente && (
            <span className="block text-[15px] font-semibold leading-snug text-slate-900 dark:text-white">
              {g.paciente}
              {g.expediente && <span className="ml-2 font-mono text-xs font-bold text-blue-700 dark:text-cyan-300">{g.expediente}</span>}
            </span>
          )}
          <span className={`block ${mostrarPaciente ? "text-sm text-slate-700 dark:text-slate-200" : "text-[15px] font-semibold text-slate-900 dark:text-white"}`}>{titulo}</span>
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
            {fechaCorta(g.fecha)} · {g.creadoPorNombre} · {g.totalNotas} {g.totalNotas === 1 ? "nota" : "notas"}
            {enProceso && <> · último movimiento {haceDias(dias)}</>}
            {!enProceso && g.fechaCierre && <> · cerrada {fechaCorta(g.fechaCierre)}</>}
          </span>
        </span>
        <Estado estado={g.estado} />
        <ChevronDown size={16} className={`mt-1 flex-shrink-0 text-slate-400 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {abierta && (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/30">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold">Área:</span> {nombreArea(g.area)}
            {g.medico && <> · <span className="font-semibold">Médico:</span> {g.medico}</>}
            {g.procedencia === "red" && <> · <span className="font-semibold">Procedencia:</span> {g.establecimiento}</>}
            {g.poblacion.length > 0 && <> · {g.poblacion.map(labelPoblacion).join(", ")}</>}
            {g.origen === "manual" && <> · paciente escrito a mano</>}
          </p>

          {g.estado === "no_procede" && <Aviso tipo="alerta"><span className="font-semibold">No procede:</span> {g.motivoNoProcede}</Aviso>}

          {leyendo && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" aria-hidden="true" />Leyendo las notas…</p>}
          {leidas && (
            <ol className="space-y-2" aria-label="Notas de la gestión">
              {ordenadas.map((n) => (
                <NotaFila
                  key={n.id}
                  nota={n}
                  gestion={g}
                  hoy={hoy}
                  editable={registra && (esAdmin || n.autor === uid)}
                  unica={ordenadas.length === 1}
                  onCambio={(x) => cambioDeNotas(ordenadas.map((y) => (y.id === x.id ? x : y)))}
                  onBorrada={() => cambioDeNotas(ordenadas.filter((y) => y.id !== n.id))}
                />
              ))}
            </ol>
          )}

          {g.historial.length > 0 && (
            <ul className="space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
              {g.historial.map((h, i) => (
                <li key={i}>
                  {h.accion === "reabierta" ? "Reabierta" : h.accion === "finalizada" ? "Finalizada" : "Cerrada: no procede"} por {h.porNombre}
                  {h.enMs > 0 && <> · {new Date(h.enMs).toLocaleString("es-SV", { dateStyle: "medium", timeStyle: "short" })}</>}
                  {h.motivo && <> · {h.motivo}</>}
                </li>
              ))}
            </ul>
          )}

          {registra && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-800">
              {enProceso ? (
                <>
                  <button type="button" onClick={() => abrirPanel("nota")} aria-expanded={panel === "nota"} className={botonPrimario}>
                    <MessageSquarePlus size={15} aria-hidden="true" />Agregar nota
                  </button>
                  <button type="button" onClick={() => abrirPanel("finalizar")} aria-expanded={panel === "finalizar"} className={botonSecundario}>Finalizar</button>
                  <button type="button" onClick={() => abrirPanel("no_procede")} aria-expanded={panel === "no_procede"} className={botonSecundario}>No procede</button>
                </>
              ) : (
                <button type="button" disabled={guardando} onClick={() => void cambiarGestion({ accion: "reabrir" })} className={botonSecundario}>Reabrir</button>
              )}
              {mia && (
                <span className="ml-auto flex gap-1">
                  <button type="button" onClick={() => abrirPanel("corregir")} aria-expanded={panel === "corregir"} className={botonTexto}><Pencil size={13} aria-hidden="true" />Corregir</button>
                  <button type="button" onClick={() => abrirPanel("borrar")} aria-expanded={panel === "borrar"} className={botonTexto}><Trash2 size={13} aria-hidden="true" />Borrar</button>
                </span>
              )}
            </div>
          )}

          {panel === "nota" && (
            <Bloque guardando={guardando} texto="Guardar nota" onGuardar={guardarNota} onCancelar={() => setPanel("")}>
              <CamposNota valor={nota} onChange={setNota} tipo={g.tipo} hoy={hoy} desde={g.fecha} />
            </Bloque>
          )}
          {panel === "finalizar" && (
            <Bloque guardando={guardando} texto="Sí, finalizar" onGuardar={() => void cambiarGestion({ accion: "finalizar" })} onCancelar={() => setPanel("")}>
              <p className="text-sm text-slate-700 dark:text-slate-200">La gestión queda terminada. Si hace falta, se puede reabrir.</p>
            </Bloque>
          )}
          {panel === "no_procede" && (
            <Bloque guardando={guardando} texto="Cerrar como no procede" onGuardar={marcarNoProcede} onCancelar={() => setPanel("")}>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">¿Por qué no procede?</span>
                <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={500} autoFocus className={`${inputCls} resize-y`} />
              </label>
            </Bloque>
          )}
          {panel === "corregir" && (
            <Bloque guardando={guardando} texto="Guardar corrección" onGuardar={guardarCorreccion} onCancelar={() => setPanel("")}>
              <CamposGestion valor={borrador} onChange={setBorrador} especialidadId={g.especialidadId} areaCuenta={g.area} />
            </Bloque>
          )}
          {panel === "borrar" && (
            <Bloque guardando={guardando} texto="Sí, borrar" onGuardar={() => void borrar()} onCancelar={() => setPanel("")} peligro>
              <p className="text-sm text-slate-700 dark:text-slate-200">Se borra la gestión con sus notas, sin dejar rastro. Si solo no corresponde, ciérrela como «No procede».</p>
            </Bloque>
          )}
          {error && <Aviso tipo="error">{error}</Aviso>}
        </div>
      )}
    </li>
  );
}

function Bloque({ children, texto, guardando, onGuardar, onCancelar, peligro = false }: {
  children: React.ReactNode; texto: string; guardando: boolean; onGuardar: () => void; onCancelar: () => void; peligro?: boolean;
}) {
  return (
    <form
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
      onSubmit={(e) => { e.preventDefault(); onGuardar(); }}
    >
      {children}
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

function NotaFila({ nota: n, gestion: g, hoy, editable, unica, onCambio, onBorrada }: {
  nota: NotaTSCE; gestion: GestionTSCE; hoy: string; editable: boolean; unica: boolean; onCambio: (n: NotaTSCE) => void; onBorrada: () => void;
}) {
  const { llamar } = useTS();
  const [modo, setModo] = useState<"" | "editar" | "borrar">("");
  const [valor, setValor] = useState<DatosNota>(() => notaABorrador(n));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    const v = modo === "editar" ? validarNota(valor, g.tipo, hoy) : null;
    if (v && !v.ok) { setError(v.error); return; }
    setGuardando(true);
    setError("");
    try {
      if (v?.ok) {
        onCambio((await llamar<{ nota: NotaTSCE }>(`/notas/${n.id}`, "PATCH", { nota: v.datos })).nota);
        setModo("");
      } else {
        await llamar(`/notas/${n.id}`, "DELETE");
        onBorrada();
      }
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  const datos = [labelMedio(n.medio), n.conQuien && `con ${labelConQuien(n.conQuien).toLowerCase()}`].filter(Boolean).join(" ");
  return (
    <li className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {n.paso && <p className="text-sm font-semibold text-slate-900 dark:text-white">{labelPaso(g.tipo, n.paso)}</p>}
          {n.texto && <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{n.texto}</p>}
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {fechaCorta(n.fecha)} · {datos} · {n.autorNombre}{n.editadoEnMs > 0 && " · corregida"}
          </p>
        </div>
        {editable && modo === "" && (
          <span className="flex flex-shrink-0">
            <button type="button" aria-label="Corregir la nota" onClick={() => { setValor(notaABorrador(n)); setModo("editar"); }} className={botonTexto}><Pencil size={13} /></button>
            {!unica && <button type="button" aria-label="Borrar la nota" onClick={() => setModo("borrar")} className={botonTexto}><Trash2 size={13} /></button>}
          </span>
        )}
      </div>
      {modo !== "" && (
        <div className="mt-3">
          <Bloque
            guardando={guardando}
            texto={modo === "editar" ? "Guardar nota" : "Sí, borrar la nota"}
            peligro={modo === "borrar"}
            onGuardar={() => void guardar()}
            onCancelar={() => { setModo(""); setError(""); }}
          >
            {modo === "editar"
              ? <CamposNota valor={valor} onChange={setValor} tipo={g.tipo} hoy={hoy} desde={g.fecha} />
              : <p className="text-sm text-slate-700 dark:text-slate-200">La nota se borra y no se puede recuperar.</p>}
          </Bloque>
          {error && <div className="mt-2"><Aviso tipo="error">{error}</Aviso></div>}
        </div>
      )}
    </li>
  );
}
