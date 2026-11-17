"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CalendarPlus,
  CheckCircle2,
  Download,
  Loader2,
  RotateCcw,
  Search,
  Settings2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  ANIO_PROGRAMACION,
  NOMBRE_DIA,
  NOMBRE_ESTADO,
  diaSemanaDeISO,
  diasQueAtiende,
  especialidadesDelCatalogo,
  esFechaDelAnio,
  expedienteConFormaUsual,
  franjasDelDia,
  medicosDeEspecialidad,
  normalizarExpediente,
  ocupacionPorFranja,
  textoFranja,
  type EstadoCitaProgramada,
  type FranjaCatalogo,
  type TipoCitaProgramada,
} from "@/lib/consultaExterna/citasProgramadas";
import {
  anularCitaProgramada,
  buscarPacientePorExpediente,
  citasDeMedicoEnFecha,
  citasDelExpediente,
  citasDelMes,
  ultimasCitasRegistradas,
  MAX_RECIENTES,
  crearCitaProgramada,
  leerCatalogoCitas,
  marcarRegistradasSis,
  volverAPendiente,
  type CatalogoGuardado,
  type CitaProgramadaConId,
  type PacienteEncontrado,
} from "@/lib/consultaExterna/citasProgramadasDatos";

// Programación de citas 2027. Todo lo que irá al SIS sale de listas cerradas
// (especialidad, médico, franja y consultorio del catálogo), para que al pasar
// las citas los nombres coincidan. Solo el expediente y, si services no lo
// conoce, el nombre del paciente se escriben.

const tarjeta = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const etiqueta = "block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5";
const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800";
const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
const td = "px-3 py-2 text-slate-700 dark:text-slate-200 align-top";
const boton =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

// "recientes" = en el orden en que se registraron en services (la más nueva arriba).
const RECIENTES = "recientes";
const leerVista = (v: string) => (v === RECIENTES ? ultimasCitasRegistradas() : citasDelMes(v));

const MESES = Array.from({ length: 12 }, (_, i) => {
  const mes = `${ANIO_PROGRAMACION}-${String(i + 1).padStart(2, "0")}`;
  const nombre = new Date(ANIO_PROGRAMACION, i, 1).toLocaleDateString("es-SV", { month: "long" });
  return { mes, nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1) };
});

const COLOR_ESTADO: Record<EstadoCitaProgramada, string> = {
  pendiente: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  registrada_sis: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  anulada: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function Citas2027Page() {
  const { user, profile } = useAuth();
  const usuario = useMemo(
    () => (user ? { uid: user.uid, nombre: profile?.nombre ?? user.email ?? "" } : null),
    [user, profile],
  );

  const [catalogo, setCatalogo] = useState<CatalogoGuardado | null | undefined>(undefined);
  const [errorCatalogo, setErrorCatalogo] = useState("");

  // ── Formulario ──
  const [especialidad, setEspecialidad] = useState("");
  const [medicoId, setMedicoId] = useState("");
  const [fecha, setFecha] = useState("");
  const [franjaId, setFranjaId] = useState("");
  const [expediente, setExpediente] = useState("");
  const [paciente, setPaciente] = useState("");
  const [encontrado, setEncontrado] = useState<PacienteEncontrado | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState("");
  const [otrasCitas, setOtrasCitas] = useState<CitaProgramadaConId[]>([]);
  const [tipo, setTipo] = useState<TipoCitaProgramada | "">("");
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

  // ── Lista ──
  const [mes, setMes] = useState(RECIENTES);
  const [citas, setCitas] = useState<CitaProgramadaConId[] | null>(null);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [filtroEsp, setFiltroEsp] = useState("");
  const [filtroMedico, setFiltroMedico] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoCitaProgramada | "">("pendiente");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [accionando, setAccionando] = useState(false);

  useEffect(() => {
    leerCatalogoCitas()
      .then(setCatalogo)
      .catch((e) => {
        console.error("No se pudo leer el catálogo de citas", e);
        setErrorCatalogo("No se pudo leer el catálogo. Revise la conexión y recargue.");
        setCatalogo(null);
      });
  }, []);

  const especialidades = useMemo(() => (catalogo ? especialidadesDelCatalogo(catalogo) : []), [catalogo]);
  const medicos = useMemo(
    () => (catalogo && especialidad ? medicosDeEspecialidad(catalogo, especialidad) : []),
    [catalogo, especialidad],
  );
  const medico = medicos.find((m) => m.id === medicoId);
  const fechaValida = esFechaDelAnio(fecha);
  const franjas: FranjaCatalogo[] = useMemo(
    () => (catalogo && medicoId && fechaValida ? franjasDelDia(catalogo, medicoId, fecha) : []),
    [catalogo, medicoId, fecha, fechaValida],
  );
  const franja = franjas.find((f) => f.id === franjaId);
  const diasMedico = catalogo && medicoId ? diasQueAtiende(catalogo, medicoId) : [];

  // Ocupación del médico ese día (1 consulta cada vez que cambia médico o fecha).
  // Se guarda con su clave: si cambió el médico o la fecha, aún no se sabe.
  const claveOcupacion = medicoId && fechaValida ? `${medicoId}|${fecha}` : "";
  const [ocupacion, setOcupacion] = useState<{ clave: string; mapa: Map<string, number> } | null>(null);
  const [versionOcupacion, setVersionOcupacion] = useState(0);
  const ocupadas = ocupacion && ocupacion.clave === claveOcupacion ? ocupacion.mapa : null;

  useEffect(() => {
    if (!claveOcupacion) return;
    let vivo = true;
    const [m, f] = claveOcupacion.split("|");
    citasDeMedicoEnFecha(m, f)
      .then((lista) => { if (vivo) setOcupacion({ clave: claveOcupacion, mapa: ocupacionPorFranja(lista) }); })
      .catch((e) => console.error("No se pudo leer la ocupación", e));
    return () => { vivo = false; };
  }, [claveOcupacion, versionOcupacion]);

  const expNormal = normalizarExpediente(expediente);

  const buscarExpediente = async () => {
    if (!expNormal || expNormal === buscado) return;
    setBuscando(true);
    setEncontrado(null);
    setOtrasCitas([]);
    try {
      const [p, otras] = await Promise.all([buscarPacientePorExpediente(expNormal), citasDelExpediente(expNormal)]);
      setBuscado(expNormal);
      setEncontrado(p);
      setOtrasCitas(otras);
      setPaciente(p?.nombre ?? "");
    } catch (e) {
      console.error("No se pudo buscar el expediente", e);
      setBuscado(expNormal);
      setMensaje({ tono: "error", texto: "No se pudo buscar el expediente. Puede escribir el nombre a mano." });
    } finally {
      setBuscando(false);
    }
  };

  const cupoLleno = franja && ocupadas ? (ocupadas.get(franja.inicio) ?? 0) >= franja.cupo : false;
  const listo =
    !!usuario && !!medico && !!franja && fechaValida && !!expNormal && buscado === expNormal && !!paciente.trim() && !!tipo;

  const limpiarPaciente = () => {
    setExpediente("");
    setPaciente("");
    setEncontrado(null);
    setBuscado("");
    setOtrasCitas([]);
    setTipo("");
    setObservaciones("");
  };

  const guardar = async () => {
    if (!listo || !medico || !franja || !usuario || !tipo) return;
    if (cupoLleno && !window.confirm(`La franja ${textoFranja(franja.inicio, franja.fin)} ya tiene su cupo de ${franja.cupo}. ¿Agregar la cita como sobrecupo?`)) {
      return;
    }
    setGuardando(true);
    setMensaje(null);
    try {
      await crearCitaProgramada(
        {
          fecha,
          especialidad: medico.especialidad,
          medicoId: medico.id,
          medico: medico.nombre,
          consultorio: franja.consultorio || medico.consultorioFijo,
          franjaInicio: franja.inicio,
          franjaFin: franja.fin,
          expediente: expNormal,
          paciente,
          tipo,
          observaciones,
        },
        encontrado && encontrado.nombre === paciente ? "services" : "manual",
        usuario,
      );
      setMensaje({ tono: "ok", texto: `Cita registrada: ${expNormal}, ${fechaCorta(fecha)} ${textoFranja(franja.inicio, franja.fin)} con ${medico.nombre}.` });
      limpiarPaciente();
      setVersionOcupacion((v) => v + 1);
      if (citas && (mes === RECIENTES || fecha.slice(0, 7) === mes)) void cargarLista(mes);
    } catch (e) {
      console.error("No se pudo guardar la cita", e);
      setMensaje({ tono: "error", texto: e instanceof Error ? e.message : "No se pudo guardar la cita." });
    } finally {
      setGuardando(false);
    }
  };

  // ── Lista del mes ──
  const cargarLista = useCallback(async (m: string) => {
    setCargandoLista(true);
    setSeleccion(new Set());
    try {
      setCitas(await leerVista(m));
    } catch (e) {
      console.error("No se pudieron leer las citas del mes", e);
      setCitas([]);
    } finally {
      setCargandoLista(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    leerVista(mes)
      .then((l) => { if (vivo) setCitas(l); })
      .catch((e) => {
        console.error("No se pudieron leer las citas del mes", e);
        if (vivo) setCitas([]);
      });
    return () => { vivo = false; };
  }, [mes]);

  const visibles = useMemo(
    () =>
      (citas ?? []).filter(
        (c) =>
          (!filtroEsp || c.especialidad === filtroEsp) &&
          (!filtroMedico || c.medicoId === filtroMedico) &&
          (!filtroEstado || c.estado === filtroEstado),
      ),
    [citas, filtroEsp, filtroMedico, filtroEstado],
  );
  const medicosFiltro = useMemo(
    () => (catalogo && filtroEsp ? medicosDeEspecialidad(catalogo, filtroEsp, true) : []),
    [catalogo, filtroEsp],
  );
  const pendientesVisibles = visibles.filter((c) => c.estado === "pendiente");
  const conteo = useMemo(() => {
    const c = { pendiente: 0, registrada_sis: 0, anulada: 0 };
    for (const x of citas ?? []) c[x.estado]++;
    return c;
  }, [citas]);

  const alternar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const marcarSis = async () => {
    if (!usuario || !seleccion.size) return;
    if (!window.confirm(`¿Marcar ${seleccion.size} cita(s) como ya registradas en el SIS?`)) return;
    setAccionando(true);
    try {
      await marcarRegistradasSis([...seleccion], usuario);
      await cargarLista(mes);
    } catch (e) {
      console.error("No se pudieron marcar las citas", e);
      window.alert("No se pudieron marcar las citas. Intente de nuevo.");
    } finally {
      setAccionando(false);
    }
  };

  const anular = async (c: CitaProgramadaConId) => {
    if (!usuario) return;
    const motivo = window.prompt(`Motivo para anular la cita de ${c.paciente} (${fechaCorta(c.fecha)}):`);
    if (!motivo?.trim()) return;
    setAccionando(true);
    try {
      await anularCitaProgramada(c.id, motivo, usuario);
      await cargarLista(mes);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo anular la cita.");
    } finally {
      setAccionando(false);
    }
  };

  const reabrir = async (c: CitaProgramadaConId) => {
    if (!usuario) return;
    if (!window.confirm(`¿Devolver la cita de ${c.paciente} a "Pendiente de pasar al SIS"?`)) return;
    setAccionando(true);
    try {
      await volverAPendiente(c.id, usuario);
      await cargarLista(mes);
    } finally {
      setAccionando(false);
    }
  };

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const filas = visibles.map((c) => ({
      Fecha: fechaCorta(c.fecha),
      Día: NOMBRE_DIA[diaSemanaDeISO(c.fecha)],
      Especialidad: c.especialidad,
      Médico: c.medico,
      Consultorio: c.consultorio,
      Horario: textoFranja(c.franjaInicio, c.franjaFin),
      Expediente: c.expediente,
      "Nombre del paciente": c.paciente,
      "Tipo de cita": c.tipo,
      Estado: NOMBRE_ESTADO[c.estado],
      Observaciones: c.observaciones ?? "",
      "Registrada por": c.creadaPorNombre,
      "Registrada el": c.creadaEn ? c.creadaEn.toDate().toLocaleString("es-SV") : "",
      "Nombre del paciente tomado de": c.origenNombre === "manual" ? "Escrito a mano" : "services",
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Citas");
    XLSX.writeFile(libro, mes === RECIENTES ? "citas-2027-ultimas-registradas.xlsx" : `citas-${mes}.xlsx`);
  };

  // ── Render ──
  if (catalogo === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={26} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-900 dark:text-white">Citas {ANIO_PROGRAMACION}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Registre aquí las citas mientras se abren las agendas del SIS. Médico, consultorio y horario salen del catálogo,
            escritos igual que en el SIS.
          </p>
        </div>
        <Link
          href="/consulta-externa/citas-2027/catalogo"
          className={`${boton} border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800`}
        >
          <Settings2 size={16} /> Catálogo
        </Link>
      </div>

      {errorCatalogo && <p className="text-sm text-rose-600">{errorCatalogo}</p>}

      {!catalogo ? (
        <div className={`${tarjeta} text-sm text-slate-600 dark:text-slate-300`}>
          Todavía no hay catálogo de médicos, consultorios y horarios.{" "}
          <Link href="/consulta-externa/citas-2027/catalogo" className="font-semibold text-blue-600 underline">
            Créelo desde el libro de agendas
          </Link>{" "}
          antes de registrar citas.
        </div>
      ) : (
        <section className={tarjeta}>
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
            <CalendarPlus size={18} className="text-blue-600" /> Nueva cita
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className={etiqueta} htmlFor="esp">Especialidad</label>
              <select
                id="esp"
                className={campo}
                value={especialidad}
                onChange={(e) => {
                  setEspecialidad(e.target.value);
                  setMedicoId("");
                  setFranjaId("");
                }}
              >
                <option value="">Elija…</option>
                {especialidades.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={etiqueta} htmlFor="med">Médico</label>
              <select id="med" className={campo} value={medicoId} disabled={!especialidad} onChange={(e) => {
                  setMedicoId(e.target.value);
                  setFranjaId("");
                }}>
                <option value="">Elija…</option>
                {medicos.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
              {medicoId && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {diasMedico.length ? `Atiende: ${diasMedico.map((d) => NOMBRE_DIA[d]).join(", ")}` : "Sin horario en el catálogo."}
                </p>
              )}
            </div>
            <div>
              <label className={etiqueta} htmlFor="fecha">Fecha</label>
              <input
                id="fecha"
                type="date"
                className={campo}
                min={`${ANIO_PROGRAMACION}-01-01`}
                max={`${ANIO_PROGRAMACION}-12-31`}
                value={fecha}
                disabled={!medicoId}
                onChange={(e) => {
                  setFecha(e.target.value);
                  setFranjaId("");
                }}
              />
              {fecha && !fechaValida && <p className="mt-1 text-xs text-rose-600">La fecha debe ser de {ANIO_PROGRAMACION}.</p>}
            </div>
          </div>

          {medicoId && fechaValida && (
            <div className="mt-4">
              <p className={etiqueta}>Horario</p>
              {franjas.length === 0 ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {medico?.nombre} no atiende los {NOMBRE_DIA[diaSemanaDeISO(fecha)].toLowerCase()} según el catálogo.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {franjas.map((f) => {
                    const usadas = ocupadas?.get(f.inicio) ?? 0;
                    const lleno = usadas >= f.cupo;
                    const activo = f.id === franjaId;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFranjaId(f.id)}
                        className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                          activo
                            ? "border-blue-600 bg-blue-600 text-white"
                            : lleno
                              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                              : "border-slate-300 text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:text-slate-200"
                        }`}
                      >
                        <span className="block font-semibold">{textoFranja(f.inicio, f.fin)}</span>
                        <span className={`block text-xs ${activo ? "text-blue-100" : "opacity-75"}`}>
                          {f.consultorio || medico?.consultorioFijo} · {ocupadas ? `${usadas} de ${f.cupo}` : `cupo ${f.cupo}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div>
              <label className={etiqueta} htmlFor="exp">Expediente</label>
              <div className="flex gap-2">
                <input
                  id="exp"
                  className={campo}
                  placeholder="12345-26"
                  value={expediente}
                  onChange={(e) => {
                    setExpediente(e.target.value);
                    if (normalizarExpediente(e.target.value) !== buscado) {
                      setEncontrado(null);
                      setPaciente("");
                      setOtrasCitas([]);
                    }
                  }}
                  onBlur={() => void buscarExpediente()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void buscarExpediente();
                  }}
                />
                <button
                  type="button"
                  onClick={() => void buscarExpediente()}
                  className={`${boton} border border-slate-300 px-3 dark:border-slate-700`}
                  aria-label="Buscar expediente"
                  disabled={!expNormal || buscando}
                >
                  {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                </button>
              </div>
              {expNormal && !expedienteConFormaUsual(expNormal) && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Revise el expediente: el SIS los escribe como 12345-26.</p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className={etiqueta} htmlFor="pac">Nombre del paciente (Apellidos, Nombres)</label>
              <input
                id="pac"
                className={campo}
                value={paciente}
                disabled={!expNormal || buscado !== expNormal || !!encontrado}
                placeholder={buscado === expNormal && !encontrado ? "No está en services: escríbalo como en el SIS" : ""}
                onChange={(e) => setPaciente(e.target.value)}
              />
              {encontrado && (
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                  Encontrado en services ({encontrado.fuente}).{" "}
                  <button type="button" className="underline" onClick={() => setEncontrado(null)}>Corregir</button>
                </p>
              )}
            </div>
          </div>

          {otrasCitas.length > 0 && (
            <div className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                Este expediente ya tiene {otrasCitas.length} cita(s) {ANIO_PROGRAMACION}:{" "}
                {otrasCitas.slice(0, 4).map((c) => `${fechaCorta(c.fecha)} ${c.especialidad} (${c.medico})`).join("; ")}
                {otrasCitas.length > 4 ? "…" : "."}
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <p className={etiqueta}>Tipo de cita</p>
              <div className="flex gap-2">
                {(["Primera Vez", "Subsecuente"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                      tipo === t
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className={etiqueta} htmlFor="obs">Observaciones (opcional)</label>
              <input id="obs" className={campo} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={200} />
            </div>
          </div>

          {mensaje && (
            <p className={`mt-4 text-sm ${mensaje.tono === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600"}`}>
              {mensaje.texto}
            </p>
          )}

          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => void guardar()} disabled={!listo || guardando} className={`${boton} bg-blue-600 text-white hover:bg-blue-700`}>
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {cupoLleno ? "Guardar como sobrecupo" : "Guardar cita"}
            </button>
          </div>
        </section>
      )}

      <section className={tarjeta}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={etiqueta} htmlFor="mes">Ver</label>
            <select id="mes" className={campo} value={mes} onChange={(e) => {
                setMes(e.target.value);
                setCitas(null);
                setSeleccion(new Set());
              }}>
              <option value={RECIENTES}>Últimas registradas</option>
              {MESES.map((m) => (
                <option key={m.mes} value={m.mes}>Citas de {m.nombre.toLowerCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={etiqueta} htmlFor="fesp">Especialidad</label>
            <select
              id="fesp"
              className={campo}
              value={filtroEsp}
              onChange={(e) => {
                setFiltroEsp(e.target.value);
                setFiltroMedico("");
              }}
            >
              <option value="">Todas</option>
              {especialidades.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={etiqueta} htmlFor="fmed">Médico</label>
            <select id="fmed" className={campo} value={filtroMedico} disabled={!filtroEsp} onChange={(e) => setFiltroMedico(e.target.value)}>
              <option value="">Todos</option>
              {medicosFiltro.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={etiqueta} htmlFor="fest">Estado</label>
            <select id="fest" className={campo} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as EstadoCitaProgramada | "")}>
              <option value="">Todos</option>
              {(Object.keys(NOMBRE_ESTADO) as EstadoCitaProgramada[]).map((k) => (
                <option key={k} value={k}>{NOMBRE_ESTADO[k]}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => void exportar()} disabled={!visibles.length} className={`${boton} border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200`}>
              <Download size={16} /> Excel
            </button>
            <button type="button" onClick={() => void marcarSis()} disabled={!seleccion.size || accionando} className={`${boton} bg-emerald-600 text-white hover:bg-emerald-700`}>
              <CheckCircle2 size={16} /> Registradas en SIS ({seleccion.size})
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {mes === RECIENTES
            ? `Las últimas ${MAX_RECIENTES} registradas, la más nueva arriba. Para pasar al SIS, elija el mes de la cita: se ordena por fecha, médico y horario. `
            : "En el mes: "}
          {conteo.pendiente} pendientes · {conteo.registrada_sis} registradas en SIS · {conteo.anulada} anuladas
        </p>

        <div className="mt-3 overflow-x-auto">
          {cargandoLista || citas === null ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="animate-spin text-blue-500" /></div>
          ) : !visibles.length ? (
            <p className="py-6 text-center text-sm text-slate-500">No hay citas con estos filtros.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className={th}>
                    <input
                      type="checkbox"
                      aria-label="Seleccionar pendientes"
                      checked={pendientesVisibles.length > 0 && pendientesVisibles.every((c) => seleccion.has(c.id))}
                      onChange={(e) => setSeleccion(e.target.checked ? new Set(pendientesVisibles.map((c) => c.id)) : new Set())}
                    />
                  </th>
                  <th className={th}>Fecha</th>
                  <th className={th}>Médico · consultorio</th>
                  <th className={th}>Horario</th>
                  <th className={th}>Paciente</th>
                  <th className={th}>Tipo</th>
                  <th className={th}>Estado</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibles.map((c) => (
                  <tr key={c.id} className={c.estado === "anulada" ? "opacity-60" : ""}>
                    <td className={td}>
                      {c.estado === "pendiente" && (
                        <input type="checkbox" aria-label={`Seleccionar ${c.expediente}`} checked={seleccion.has(c.id)} onChange={() => alternar(c.id)} />
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {fechaCorta(c.fecha)}
                      <span className="block text-xs text-slate-500">{NOMBRE_DIA[diaSemanaDeISO(c.fecha)]}</span>
                    </td>
                    <td className={td}>
                      {c.medico}
                      <span className="block text-xs text-slate-500">{c.consultorio}</span>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{textoFranja(c.franjaInicio, c.franjaFin)}</td>
                    <td className={td}>
                      <span className="font-medium">{c.expediente}</span> {c.paciente}
                      {c.observaciones && <span className="block text-xs text-slate-500">{c.observaciones}</span>}
                      <span className="block text-xs text-slate-400">
                        Registrada {c.creadaEn ? c.creadaEn.toDate().toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" }) : "ahora"} por {c.creadaPorNombre}
                        {c.origenNombre === "manual" ? " · nombre escrito a mano" : ""}
                      </span>
                      {c.estado === "anulada" && c.motivoAnulacion && (
                        <span className="block text-xs text-slate-500">Anulada: {c.motivoAnulacion}</span>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{c.tipo}</td>
                    <td className={td}>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO[c.estado]}`}>
                        {c.estado === "pendiente" ? "Pendiente" : NOMBRE_ESTADO[c.estado]}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap text-right`}>
                      {c.estado === "pendiente" ? (
                        <button type="button" disabled={accionando} onClick={() => void anular(c)} className="text-slate-500 hover:text-rose-600" title="Anular">
                          <Ban size={16} />
                        </button>
                      ) : (
                        <button type="button" disabled={accionando} onClick={() => void reabrir(c)} className="text-slate-500 hover:text-blue-600" title="Volver a pendiente">
                          <RotateCcw size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
