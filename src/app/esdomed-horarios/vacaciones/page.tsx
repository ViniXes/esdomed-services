"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { PlanTrabajo, VacacionProgramada } from "@/types";
import { COLOR_GRUPO, esPersonalPlan, labelPeriodo, NOMBRES_MES } from "@/lib/esdomed/plan";
import { esAdministrativoPlan, normalizarCodigoMarcacion } from "@/lib/esdomed/catalogo-plan";
import {
  bloqueoQuincena,
  cargarProgramacionVacaciones,
  claveQuincena,
  CUPOS_POR_QUINCENA,
  diasQuincena,
  etiquetaCortaQuincena,
  guardarProgramacionVacaciones,
  propagarVacacionesAPlanes,
  QUINCENAS_DEL_ANIO,
  type Quincena,
} from "@/lib/esdomed/vacaciones";
import { ImportarVacacionesModal, type PersonaVacaciones } from "@/components/esdomed-horarios/ImportarVacacionesModal";
import { AlertTriangle, CheckCircle2, ChevronDown, FileSpreadsheet, Lock, Plane, Save, Users, XCircle } from "lucide-react";

interface ProgramaLocal {
  anio: number;
  asignaciones: VacacionProgramada[];
  actualizadoEn: number | null;
  actualizadoPorNombre: string;
  guardado: boolean;
  error?: string;
}

type Aviso = { tipo: "exito" | "error" | "alerta"; titulo: string; mensaje: string };
type Confirmacion = { titulo: string; mensaje: string; textoConfirmar: string; onConfirm: () => void };

const ANIO_HOY = new Date().getFullYear();
// A partir de octubre se programa el año siguiente.
const ANIO_INICIAL = new Date().getMonth() >= 9 ? ANIO_HOY + 1 : ANIO_HOY;
const QUINCENAS: Quincena[] = [1, 2];

const ordenarAsignaciones = (lista: VacacionProgramada[]) =>
  [...lista].sort((a, b) => a.mes - b.mes || a.quincena - b.quincena);

function milisegundos(valor: unknown): number | null {
  if (valor instanceof Date) return valor.getTime();
  if (valor && typeof (valor as { toMillis?: unknown }).toMillis === "function") {
    return (valor as { toMillis: () => number }).toMillis();
  }
  return null;
}

// En el cupo cabe poco: nombre + primer apellido cuando el nombre completo es
// largo ("Gabriela Alejandra Calpaño Rodriguez" → "Gabriela Calpaño"). El
// completo va en el tooltip y en la lista para elegir.
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y"]);
function nombreCorto(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter((p) => !PARTICULAS.has(p.toLowerCase()));
  return palabras.length >= 4 ? `${palabras[0]} ${palabras[2]}` : nombre;
}

export default function VacacionesPage() {
  const { profile } = useAuth();
  const esAdmin = profile?.role === "admin";

  const [anio, setAnio] = useState(ANIO_INICIAL);
  const [personal, setPersonal] = useState<PersonaVacaciones[] | null>(null);
  const [errorPersonal, setErrorPersonal] = useState("");
  const [programa, setPrograma] = useState<ProgramaLocal | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [saving, setSaving] = useState(false);
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  // Personal vigente del plan, con su grupo y jornada del plan más reciente.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      getDocs(query(collection(db, "usuarios"), where("role", "in", ["esdomed", "asistente_esdomed", "admin"]))),
      getDocs(query(collection(db, "planes_trabajo"), orderBy("periodo", "desc"), limit(1))),
    ])
      .then(([usuarios, planes]) => {
        if (!vivo) return;
        const filasPlan = (planes.docs[0]?.data() as PlanTrabajo | undefined)?.filas ?? [];
        const lista = usuarios.docs
          .filter((d) => d.data().activo !== false && esPersonalPlan(d.data().role, d.data().codigoMarcacion))
          .map((d) => {
            const data = d.data();
            const codigo = String(data.codigoMarcacion ?? "");
            const fila = filasPlan.find(
              (f) => (f.uid && f.uid === d.id)
                || (codigo !== "" && normalizarCodigoMarcacion(f.codigoMarcacion) === normalizarCodigoMarcacion(codigo)),
            );
            return {
              uid: d.id,
              nombre: String(data.nombre ?? ""),
              codigoMarcacion: codigo,
              grupo: fila?.grupo?.trim() ?? "",
              administrativo: esAdministrativoPlan(fila ?? { codigoMarcacion: codigo }),
            };
          })
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        setPersonal(lista);
      })
      .catch(() => { if (vivo) setErrorPersonal("No se pudo cargar el personal."); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    let vivo = true;
    cargarProgramacionVacaciones(anio)
      .then((p) => {
        if (!vivo) return;
        setPrograma({
          anio,
          asignaciones: ordenarAsignaciones(p?.asignaciones ?? []),
          actualizadoEn: milisegundos(p?.actualizadoEn),
          actualizadoPorNombre: p?.actualizadoPorNombre ?? "",
          guardado: true,
        });
      })
      .catch(() => {
        if (vivo) setPrograma({ anio, asignaciones: [], actualizadoEn: null, actualizadoPorNombre: "", guardado: true, error: "No se pudo cargar la programación." });
      });
    return () => { vivo = false; };
  }, [anio, recarga]);

  const sinGuardar = !!programa && !programa.guardado;
  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  const cargando = !personal || !programa || programa.anio !== anio;
  const asignaciones = useMemo(() => (programa?.anio === anio ? programa.asignaciones : []), [programa, anio]);
  const operativos = useMemo(() => (personal ?? []).filter((p) => !p.administrativo), [personal]);
  const porUid = useMemo(() => new Map((personal ?? []).map((p) => [p.uid, p])), [personal]);

  const cuposDe = (mes: number, quincena: Quincena) => asignaciones.filter((a) => a.mes === mes && a.quincena === quincena);
  const periodosDe = (uid: string) => asignaciones.filter((a) => a.uid === uid);

  const revision = useMemo(() => {
    const porPersona = new Map<string, VacacionProgramada[]>();
    asignaciones.forEach((a) => porPersona.set(a.uid, [...(porPersona.get(a.uid) ?? []), a]));
    const repetidos = [...porPersona.values()].filter((l) => l.length > 1);
    const sinVacaciones = operativos.filter((p) => !porPersona.has(p.uid));
    const mismoGrupo = QUINCENAS_DEL_ANIO.flatMap(({ mes, quincena }) => {
      const c = asignaciones.filter((a) => a.mes === mes && a.quincena === quincena);
      if (c.length < 2) return [];
      const g1 = porUid.get(c[0].uid)?.grupo;
      const g2 = porUid.get(c[1].uid)?.grupo;
      return g1 && g1 === g2 ? [{ mes, quincena, grupo: g1 }] : [];
    });
    const enBloqueadas = asignaciones.filter((a) => bloqueoQuincena(anio, a.mes, a.quincena));
    const noOperativos = asignaciones.filter((a) => { const p = porUid.get(a.uid); return !p || p.administrativo; });
    return { repetidos, sinVacaciones, mismoGrupo, enBloqueadas, noOperativos };
  }, [asignaciones, operativos, porUid, anio]);

  const asignarCupo = (mes: number, quincena: Quincena, idx: number, uid: string) => {
    setPrograma((p) => {
      if (!p) return p;
      const actuales = p.asignaciones.filter((a) => a.mes === mes && a.quincena === quincena);
      const resto = p.asignaciones.filter((a) => !(a.mes === mes && a.quincena === quincena));
      const nuevas = [...actuales];
      if (!uid) {
        nuevas.splice(idx, 1);
      } else {
        const persona = porUid.get(uid);
        const vacacion: VacacionProgramada = {
          uid,
          codigoMarcacion: persona?.codigoMarcacion ?? "",
          nombre: persona?.nombre ?? "",
          mes,
          quincena,
        };
        if (idx < nuevas.length) nuevas[idx] = vacacion;
        else nuevas.push(vacacion);
      }
      return { ...p, asignaciones: ordenarAsignaciones([...resto, ...nuevas]), guardado: false };
    });
  };

  const cambiarAnio = (nuevo: number) => {
    if (!sinGuardar) { setAnio(nuevo); return; }
    setConfirmacion({
      titulo: "Hay cambios sin guardar",
      mensaje: `Si cambia a ${nuevo}, se pierden los cambios de la programación ${anio}.`,
      textoConfirmar: `Ir a ${nuevo}`,
      onConfirm: () => setAnio(nuevo),
    });
  };

  const aplicarImportacion = (lista: VacacionProgramada[]) => {
    const usar = () => {
      setPrograma((p) => (p ? { ...p, asignaciones: ordenarAsignaciones(lista), guardado: false } : p));
      setImportando(false);
      setAviso({
        tipo: "alerta",
        titulo: "Programación importada",
        mensaje: `Se cargaron ${lista.length} periodo(s). Revise los avisos de arriba y presione Guardar para que quede firme.`,
      });
    };
    if (asignaciones.length === 0) { usar(); return; }
    setConfirmacion({
      titulo: `Reemplazar la programación ${anio}`,
      mensaje: `Ya hay ${asignaciones.length} periodo(s) programados. Lo importado los reemplaza todos.`,
      textoConfirmar: "Reemplazar",
      onConfirm: usar,
    });
  };

  const ejecutarGuardado = async () => {
    if (!profile || !programa) return;
    setSaving(true);
    const lista = ordenarAsignaciones(asignaciones);
    let fecha: Date;
    try {
      fecha = await guardarProgramacionVacaciones(anio, lista, { uid: profile.uid, nombre: profile.nombre });
    } catch (e) {
      setSaving(false);
      setAviso({ tipo: "error", titulo: "No se pudo guardar", mensaje: e instanceof Error ? e.message : "Error desconocido." });
      return;
    }
    setPrograma((p) => (p && p.anio === anio
      ? { ...p, guardado: true, actualizadoEn: fecha.getTime(), actualizadoPorNombre: profile.nombre }
      : p));
    try {
      const actualizados = await propagarVacacionesAPlanes(anio, lista, { uid: profile.uid, nombre: profile.nombre });
      setAviso({
        tipo: "exito",
        titulo: "Programación guardada",
        mensaje: actualizados.length > 0
          ? `Se actualizaron los planes ya guardados de: ${actualizados.map(labelPeriodo).join(", ")}. Los meses que aún no tienen plan marcan las vacaciones al crearse.`
          : "Los planes de cada mes marcarán estas vacaciones al abrirse en el editor.",
      });
    } catch (e) {
      setAviso({
        tipo: "alerta",
        titulo: "Guardada, pero falta pasarla a los planes",
        mensaje: `La programación quedó guardada, pero no se pudieron actualizar los planes ya guardados (${e instanceof Error ? e.message : "error"}). Se aplicará cuando el asistente abra cada mes en el editor.`,
      });
    } finally {
      setSaving(false);
    }
  };

  const guardar = () => {
    if (revision.enBloqueadas.length > 0) {
      setAviso({
        tipo: "error",
        titulo: "Hay vacaciones en quincenas bloqueadas",
        mensaje: revision.enBloqueadas.map((a) => `• ${a.nombre}: ${etiquetaCortaQuincena(a.mes, a.quincena)} (${bloqueoQuincena(anio, a.mes, a.quincena)})`).join("\n") + "\n\nMuévalas a otra quincena antes de guardar.",
      });
      return;
    }
    const advertencias: string[] = [];
    if (revision.repetidos.length > 0) {
      advertencias.push("Con más de un periodo:\n" + revision.repetidos.map((l) => `  • ${l[0].nombre}: ${l.map((a) => etiquetaCortaQuincena(a.mes, a.quincena)).join(", ")}`).join("\n"));
    }
    if (revision.sinVacaciones.length > 0) {
      advertencias.push("Sin vacaciones programadas:\n" + revision.sinVacaciones.map((p) => `  • ${p.nombre}`).join("\n"));
    }
    if (revision.mismoGrupo.length > 0) {
      advertencias.push("Quincenas con las dos personas del mismo grupo:\n" + revision.mismoGrupo.map((q) => `  • ${etiquetaCortaQuincena(q.mes, q.quincena)}: ${q.grupo}`).join("\n"));
    }
    if (revision.noOperativos.length > 0) {
      advertencias.push("Programados que hoy no son personal operativo vigente:\n" + revision.noOperativos.map((a) => `  • ${a.nombre}`).join("\n"));
    }
    if (advertencias.length === 0) { void ejecutarGuardado(); return; }
    setConfirmacion({
      titulo: "Revise antes de guardar",
      mensaje: `${advertencias.join("\n\n")}\n\n¿Guardar de todas formas?`,
      textoConfirmar: "Guardar igual",
      onConfirm: () => { void ejecutarGuardado(); },
    });
  };

  const conVacaciones = operativos.length - revision.sinVacaciones.length;
  const estadoGuardado = sinGuardar
    ? "Cambios sin guardar"
    : programa?.actualizadoEn
      ? `Guardada por ${programa.actualizadoPorNombre} el ${new Date(programa.actualizadoEn).toLocaleString("es-SV", { dateStyle: "medium", timeStyle: "short" })}`
      : "Aún no hay programación guardada para este año";

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-300">
            <Plane size={13} /> Plan de trabajo
          </div>
          <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white sm:text-2xl font-heading">Vacaciones {anio}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            15 días por persona dentro del mes · máximo dos por quincena · solo personal operativo. El plan de cada mes
            las marca como VAC.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={anio} onChange={(e) => cambiarAnio(Number(e.target.value))} aria-label="Año"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {[ANIO_HOY - 1, ANIO_HOY, ANIO_HOY + 1].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {esAdmin && (
            <>
              <button type="button" onClick={() => setImportando(true)} disabled={cargando}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                <FileSpreadsheet size={15} /> Importar Excel
              </button>
              <button type="button" onClick={guardar} disabled={cargando || saving || !sinGuardar}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50">
                <Save size={15} /> {saving ? "Guardando…" : "Guardar"}
              </button>
            </>
          )}
        </div>
      </div>

      {!esAdmin && (
        <p className="mb-4 flex items-start gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <Lock size={13} className="mt-0.5 shrink-0" /> Solo el administrador arma y modifica la programación de vacaciones.
        </p>
      )}

      {errorPersonal || programa?.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
          {errorPersonal || programa?.error}{" "}
          <button type="button" onClick={() => setRecarga((n) => n + 1)} className="font-semibold underline">Reintentar</button>
        </div>
      ) : cargando ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Revisión en una franja: libera el ancho para el calendario. */}
          <section className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {conVacaciones} de {operativos.length} con vacaciones
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              <Indicador ok={revision.sinVacaciones.length === 0}
                texto={revision.sinVacaciones.length === 0 ? "Nadie sin vacaciones" : `${revision.sinVacaciones.length} sin programar`} />
              <Indicador ok={revision.repetidos.length === 0}
                texto={revision.repetidos.length === 0 ? "Nadie repetido" : `Repetido: ${revision.repetidos.map((l) => nombreCorto(l[0].nombre)).join(", ")}`} />
              <Indicador ok={revision.mismoGrupo.length === 0}
                texto={revision.mismoGrupo.length === 0 ? "Ningún grupo con dos fuera" : `${revision.mismoGrupo.length} quincena(s) con dos del mismo grupo`} />
              {revision.noOperativos.length > 0 && (
                <Indicador ok={false} texto={`${revision.noOperativos.length} que no son operativos vigentes`} />
              )}
            </ul>
            <p className={`text-xs sm:ml-auto ${sinGuardar ? "font-semibold text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-slate-400"}`}>
              {estadoGuardado}
            </p>
          </section>

          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_18rem]">
            {/* El año: un mes por fila, las dos quincenas lado a lado. */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="hidden grid-cols-[7rem_minmax(0,1fr)] gap-4 border-b border-slate-200 bg-slate-50/80 px-4 py-2 dark:border-slate-800 dark:bg-slate-800/40 lg:grid">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Mes</span>
                <div className="grid grid-cols-2 gap-4">
                  {QUINCENAS.map((q) => {
                    const { desde, hasta } = diasQuincena(q);
                    return (
                      <span key={q} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        {q === 1 ? "1ra" : "2da"} quincena · del {desde} al {hasta}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {NOMBRES_MES.map((nombreMes, i) => {
                  const mes = i + 1;
                  const disponibles = QUINCENAS.filter((q) => !bloqueoQuincena(anio, mes, q)).length * CUPOS_POR_QUINCENA;
                  const ocupados = QUINCENAS.reduce((n, q) => n + (bloqueoQuincena(anio, mes, q) ? 0 : cuposDe(mes, q).length), 0);
                  return (
                    <div key={mes} className="grid gap-x-4 gap-y-2 px-4 py-2.5 md:grid-cols-[7rem_minmax(0,1fr)] md:items-center">
                      <div className="flex items-baseline justify-between gap-2 md:block">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{nombreMes}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{ocupados} de {disponibles} cupos</p>
                      </div>
                      <div className="grid gap-2 lg:grid-cols-2 lg:gap-4">
                        {QUINCENAS.map((quincena) => {
                          const bloqueo = bloqueoQuincena(anio, mes, quincena);
                          const lista = cuposDe(mes, quincena);
                          const { desde, hasta } = diasQuincena(quincena);
                          const grupoRepetido = revision.mismoGrupo.find((q) => q.mes === mes && q.quincena === quincena);
                          return (
                            <div key={claveQuincena(mes, quincena)} className="min-w-0">
                              <p className="mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 lg:hidden">
                                {quincena === 1 ? "1ra" : "2da"} · del {desde} al {hasta}
                              </p>
                              {bloqueo ? (
                                <div className="flex h-[2.375rem] items-center gap-2 rounded-lg bg-slate-100 px-3 text-xs font-medium text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                                  <Lock size={13} className="shrink-0" />
                                  <span className="truncate">Sin vacaciones · {bloqueo}</span>
                                  {lista.length > 0 && (
                                    <span className="ml-auto shrink-0 font-semibold text-rose-700 dark:text-rose-300" title={lista.map((a) => a.nombre).join(", ")}>
                                      {lista.length} por mover
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-1.5">
                                  {[0, 1].map((idx) => {
                                    const actual = lista[idx];
                                    const persona = actual ? porUid.get(actual.uid) : undefined;
                                    const conAviso = !!actual && (periodosDe(actual.uid).length > 1 || !!grupoRepetido
                                      || !persona || persona.administrativo);
                                    return (
                                      <Cupo key={idx}
                                        actual={actual}
                                        grupo={persona?.grupo ?? ""}
                                        conAviso={conAviso}
                                        editable={esAdmin}
                                        deshabilitado={idx === 1 && lista.length === 0}
                                        ariaLabel={`${nombreMes}, ${quincena === 1 ? "primera" : "segunda"} quincena, cupo ${idx + 1}`}
                                        onChange={(uid) => asignarCupo(mes, quincena, idx, uid)}>
                                        <option value="">— Libre —</option>
                                        {actual && !operativos.some((p) => p.uid === actual.uid) && (
                                          <option value={actual.uid}>{actual.nombre} (no es operativo vigente)</option>
                                        )}
                                        {operativos.map((p) => {
                                          const otras = periodosDe(p.uid).filter((a) => !(a.mes === mes && a.quincena === quincena));
                                          const enEsta = lista.some((a, j) => j !== idx && a.uid === p.uid);
                                          return (
                                            <option key={p.uid} value={p.uid} disabled={enEsta}>
                                              {p.nombre}{p.grupo ? ` · ${p.grupo}` : ""}
                                              {otras.length > 0 ? ` — ya en ${otras.map((o) => etiquetaCortaQuincena(o.mes, o.quincena)).join(", ")}` : ""}
                                            </option>
                                          );
                                        })}
                                      </Cupo>
                                    );
                                  })}
                                </div>
                              )}
                              {grupoRepetido && (
                                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Los dos son de {grupoRepetido.grupo}.</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Personal: al lado solo en pantallas muy anchas; si no, debajo en columnas. */}
            <aside className="2xl:sticky 2xl:top-4 2xl:self-start">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 2xl:max-h-[calc(100vh-2rem)] 2xl:overflow-y-auto">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-800 dark:text-blue-300">
                  <Users size={12} /> Personal operativo · {operativos.length}
                </p>
                <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-1">
                  {operativos.map((p) => {
                    const periodos = periodosDe(p.uid);
                    return (
                      <li key={p.uid} className="flex items-center gap-2 border-b border-slate-100 py-1.5 dark:border-slate-800">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR_GRUPO[p.grupo]?.dot ?? "bg-slate-300 dark:bg-slate-600"}`} title={p.grupo || "Sin grupo"} />
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200" title={p.nombre}>{p.nombre}</span>
                        {periodos.length === 0 ? (
                          <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Sin programar</span>
                        ) : (
                          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                            periodos.length > 1
                              ? "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                              : "bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200"
                          }`}>
                            {periodos.map((a) => etiquetaCortaQuincena(a.mes, a.quincena)).join(" + ")}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            </aside>
          </div>
        </>
      )}

      {importando && (
        <ImportarVacacionesModal anio={anio} operativos={operativos} onCancelar={() => setImportando(false)} onAplicar={aplicarImportacion} />
      )}

      {confirmacion && (
        <Dialogo
          tono="alerta"
          titulo={confirmacion.titulo}
          mensaje={confirmacion.mensaje}
          acciones={
            <>
              <button type="button" onClick={() => setConfirmacion(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                Cancelar
              </button>
              <button type="button" onClick={() => { const c = confirmacion; setConfirmacion(null); c.onConfirm(); }}
                className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600">
                {confirmacion.textoConfirmar}
              </button>
            </>
          }
        />
      )}

      {aviso && (
        <Dialogo
          tono={aviso.tipo}
          titulo={aviso.titulo}
          mensaje={aviso.mensaje}
          acciones={
            <button type="button" onClick={() => setAviso(null)}
              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600">
              Entendido
            </button>
          }
        />
      )}
    </div>
  );
}

/**
 * Un cupo de la quincena: muestra a la persona (nombre corto + grupo) y, para
 * el admin, lleva encima un select nativo transparente para elegir. Así se lee
 * como una ficha pero conserva el teclado y el lector de pantalla del select.
 */
function Cupo({ actual, grupo, conAviso, editable, deshabilitado, ariaLabel, onChange, children }: {
  actual?: VacacionProgramada;
  grupo: string;
  conAviso: boolean;
  editable: boolean;
  deshabilitado: boolean;
  ariaLabel: string;
  onChange: (uid: string) => void;
  children: React.ReactNode;
}) {
  const corto = COLOR_GRUPO[grupo]?.corto;
  return (
    <div title={actual?.nombre}
      className={`relative flex h-[2.375rem] min-w-0 items-center gap-2 rounded-lg border px-2.5 transition-colors ${
        actual
          ? conAviso
            ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
            : "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"
          : "border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
      } ${editable && !deshabilitado ? "focus-within:ring-2 focus-within:ring-blue-500 hover:border-blue-400 dark:hover:border-blue-600" : ""} ${
        deshabilitado ? "opacity-50" : ""
      }`}>
      {actual ? (
        <>
          <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR_GRUPO[grupo]?.dot ?? "bg-slate-300 dark:bg-slate-600"}`} />
          <span className={`min-w-0 flex-1 truncate text-sm font-medium ${conAviso ? "text-amber-950 dark:text-amber-100" : "text-blue-950 dark:text-blue-50"}`}>
            {nombreCorto(actual.nombre)}
          </span>
          {corto && (
            <span className={`shrink-0 text-[10px] font-semibold ${conAviso ? "text-amber-800 dark:text-amber-300" : "text-blue-800 dark:text-blue-300"}`}>{corto}</span>
          )}
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm text-slate-400 dark:text-slate-500">Libre</span>
      )}
      {editable && (
        <>
          <ChevronDown size={14} className={`shrink-0 ${actual ? (conAviso ? "text-amber-700 dark:text-amber-300" : "text-blue-700 dark:text-blue-300") : "text-slate-400"}`} />
          <select value={actual?.uid ?? ""} disabled={deshabilitado} aria-label={ariaLabel}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed">
            {children}
          </select>
        </>
      )}
    </div>
  );
}

function Indicador({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className="flex items-center gap-1.5">
      {ok
        ? <CheckCircle2 size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
        : <AlertTriangle size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />}
      <span className={ok ? "text-slate-600 dark:text-slate-300" : "text-amber-800 dark:text-amber-200"}>{texto}</span>
    </li>
  );
}

function Dialogo({ tono, titulo, mensaje, acciones }: {
  tono: "exito" | "error" | "alerta";
  titulo: string;
  mensaje: string;
  acciones: React.ReactNode;
}) {
  const Icono = tono === "exito" ? CheckCircle2 : tono === "error" ? XCircle : AlertTriangle;
  const color = tono === "exito"
    ? "text-emerald-600 dark:text-emerald-400"
    : tono === "error" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <p className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
          <Icono size={18} className={color} /> {titulo}
        </p>
        <p className="mt-2 max-h-[50vh] overflow-y-auto whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{mensaje}</p>
        <div className="mt-4 flex justify-end gap-2">{acciones}</div>
      </div>
    </div>
  );
}
