"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Ambulance, ChevronRight, Stethoscope, Sun, Users, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { doc, getDoc } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import type { FilaPlanTrabajo, PlanTrabajo } from "@/types";
import { compararFilasPlan, labelPeriodo, ordenGrupo } from "@/lib/esdomed/plan";
import { normalizarCodigoMarcacion } from "@/lib/esdomed/catalogo-plan";
import {
  MIN_DIA,
  buscarFila,
  estadoFilaEnDia,
  estadoPersonaEn,
  etiquetaSinTurno,
  fechaPlan,
  minutosDelDia,
  momentoTurno,
  sigueDesdeAyer,
  sumarDias,
  type EstadoDia,
  type MomentoTurno,
  type PlanesPorPeriodo,
  type RefPersona,
} from "@/lib/esdomed/turnos-dia";

// "Tu equipo" del inicio de ESDOMED: el turno propio, quién de tu grupo viene
// (y a qué hora, o si tiene permiso) y quién cubre emergencia, apoyo diurno y
// consulta externa, para hoy y los próximos 6 días. Todo sale del plan de trabajo del mes
// (planes_trabajo/{YYYY-MM}): 1 lectura, 2 si la semana cruza de mes, con
// caché de 5 min para no releer al volver al inicio.

const GRUPO_EMERGENCIA = "Equipo de emergencia";
const GRUPO_APOYO = "Equipo de apoyo diurno / emergencia";
const GRUPO_CONSULTA_EXTERNA = "Consulta Externa";
const GRUPOS_ROTATIVOS = ["Grupo 1", "Grupo 2", "Grupo 3", "Grupo 4"];

const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIA_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// ── Carga del plan ───────────────────────────────────────────────────────────

const VIGENCIA_CACHE_MS = 5 * 60_000;
const cachePlanes = new Map<string, { plan: PlanTrabajo | null; leidoEn: number }>();

async function leerPlan(periodo: string): Promise<PlanTrabajo | null> {
  const enCache = cachePlanes.get(periodo);
  if (enCache && Date.now() - enCache.leidoEn < VIGENCIA_CACHE_MS) return enCache.plan;
  const snap = await getDoc(doc(db, "planes_trabajo", periodo));
  const plan = snap.exists() ? ({ id: snap.id, ...snap.data() } as PlanTrabajo) : null;
  cachePlanes.set(periodo, { plan, leidoEn: Date.now() });
  return plan;
}

/** Hora actual que avanza cada minuto (para "en turno ahora"). */
function useAhora(): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

export interface Jornada {
  ahora: Date;
  hoy: Date;
  /** Hoy y los 6 días siguientes. */
  dias: Date[];
  planes: PlanesPorPeriodo;
  cargando: boolean;
  error: boolean;
}

export function useJornadaEquipo(habilitado: boolean): Jornada {
  const ahora = useAhora();
  const claveHoy = `${ahora.getFullYear()}-${ahora.getMonth()}-${ahora.getDate()}`;
  const hoy = useMemo(() => {
    const [a, m, d] = claveHoy.split("-").map(Number);
    return new Date(a, m, d);
  }, [claveHoy]);
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i)), [hoy]);
  // Ayer también: un turno de 24 h o nocturno que empezó ayer sigue corriendo hoy.
  const clavePeriodos = useMemo(
    () => [...new Set([sumarDias(hoy, -1), ...dias].map((f) => fechaPlan(f).periodo))].join(","),
    [hoy, dias],
  );

  const [leido, setLeido] = useState<{ clave: string; planes: PlanesPorPeriodo; error: boolean } | null>(null);

  useEffect(() => {
    if (!habilitado) return;
    let vigente = true;
    const periodos = clavePeriodos.split(",");
    Promise.all(
      periodos.map(async (p) => {
        try {
          return { p, plan: await leerPlan(p), fallo: false };
        } catch {
          return { p, plan: null, fallo: true };
        }
      }),
    ).then((res) => {
      if (!vigente) return;
      const periodoHoy = fechaPlan(hoy).periodo;
      setLeido({
        clave: clavePeriodos,
        planes: Object.fromEntries(res.map((r) => [r.p, r.plan])),
        error: res.some((r) => r.fallo && r.p === periodoHoy),
      });
    });
    return () => {
      vigente = false;
    };
  }, [habilitado, clavePeriodos, hoy]);

  const actual = leido?.clave === clavePeriodos ? leido : null;
  return {
    ahora,
    hoy,
    dias,
    planes: actual?.planes ?? {},
    cargando: habilitado && !actual,
    error: actual?.error ?? false,
  };
}

// ── Helpers de presentación ──────────────────────────────────────────────────

function inicialesNombre(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase();
}

function esLaPersona(fila: FilaPlanTrabajo, ref: RefPersona): boolean {
  if (ref.uid && fila.uid === ref.uid) return true;
  const codigo = normalizarCodigoMarcacion(ref.codigoMarcacion);
  return codigo !== "" && normalizarCodigoMarcacion(fila.codigoMarcacion) === codigo;
}

/** "mañana", "lunes 19" (relativo a hoy). */
function diaRelativo(fecha: Date, hoy: Date): string {
  if (fechaPlan(fecha).fecha.getTime() === sumarDias(hoy, 1).getTime()) return "mañana";
  return `${DIA_LARGO[fecha.getDay()]} ${fecha.getDate()}`;
}

function fechaLarga(fecha: Date): string {
  return `${DIA_LARGO[fecha.getDay()]} ${fecha.getDate()} de ${MES_LARGO[fecha.getMonth()]}`;
}

/** Ausencias: ámbar = aviso (no viene); la incapacidad va en rose como en Mi horario. */
function claseAusencia(codigo: string): string {
  return codigo === "INC"
    ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900"
    : "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900";
}

// Una persona en el día elegido.
type Momento = MomentoTurno | "desde_ayer" | null;

interface PersonaDia {
  fila: FilaPlanTrabajo;
  estado: EstadoDia;
  momento: Momento;
  /** Turno de ayer que aún corre (momento "desde_ayer"). */
  estadoAyer?: EstadoDia;
}

function rangoOrden(p: PersonaDia): number {
  if (p.momento === "en_turno" || p.momento === "desde_ayer") return 0;
  if (p.estado.tipo === "turno") return p.momento === "terminado" ? 2 : 1;
  return p.estado.tipo === "ausencia" ? 3 : 4;
}

function compararPersonas(a: PersonaDia, b: PersonaDia): number {
  const r = rangoOrden(a) - rangoOrden(b);
  if (r !== 0) return r;
  const ia = a.estado.inicio ?? MIN_DIA;
  const ib = b.estado.inicio ?? MIN_DIA;
  if (ia !== ib) return ia - ib;
  return compararFilasPlan(a.fila, b.fila);
}

function personasDelGrupo(
  plan: PlanTrabajo | null | undefined,
  grupo: string,
  fecha: Date,
  planes: PlanesPorPeriodo,
  ahoraMin: number | null,
): PersonaDia[] {
  if (!plan || !grupo) return [];
  const { dia } = fechaPlan(fecha);
  const ayer = sumarDias(fecha, -1);
  return plan.filas
    .filter((f) => (f.grupo?.trim() || "") === grupo)
    .map((fila): PersonaDia => {
      const estado = estadoFilaEnDia(fila, dia);
      if (ahoraMin === null) return { fila, estado, momento: null };
      const momento = momentoTurno(estado, ahoraMin);
      // Si su turno de hoy no ha empezado, quizá sigue en el de ayer (24 h / nocturno).
      if (momento === null || momento === "por_entrar") {
        const estadoAyer = estadoPersonaEn(planes, { uid: fila.uid, codigoMarcacion: fila.codigoMarcacion }, ayer);
        if (sigueDesdeAyer(estadoAyer, ahoraMin) && estadoAyer) return { fila, estado, momento: "desde_ayer", estadoAyer };
      }
      return { fila, estado, momento };
    })
    .sort(compararPersonas);
}

function hayTurno(plan: PlanTrabajo | null | undefined, grupo: string, dia: number): boolean {
  return !!plan?.filas.some((f) => (f.grupo?.trim() || "") === grupo && estadoFilaEnDia(f, dia).tipo === "turno");
}

// ── Turno propio (va dentro del hero del inicio) ─────────────────────────────

export function TurnoDeHoy({ jornada, persona, esPersonalPlan }: {
  jornada: Jornada;
  persona: RefPersona;
  /** Debería estar en el plan (personal ESDOMED): si no aparece, se avisa. */
  esPersonalPlan: boolean;
}) {
  const { planes, hoy, dias, ahora, cargando, error } = jornada;

  if (cargando) {
    return <div className="h-[6.5rem] w-full rounded-2xl border border-white/15 bg-white/10 md:w-72 animate-pulse" aria-hidden="true" />;
  }
  if (error) return null;

  const periodoHoy = fechaPlan(hoy).periodo;
  const estadoHoy = estadoPersonaEn(planes, persona, hoy);
  if (!estadoHoy) {
    if (!esPersonalPlan) return null;
    return (
      <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 text-sm text-cyan-50/90 md:w-72">
        {planes[periodoHoy]
          ? `Aún no apareces en el plan de ${labelPeriodo(periodoHoy).toLowerCase()}.`
          : `El plan de ${labelPeriodo(periodoHoy).toLowerCase()} aún no está publicado.`}
      </div>
    );
  }

  const ahoraMin = minutosDelDia(ahora);
  const momento = momentoTurno(estadoHoy, ahoraMin);
  const estadoAyer = estadoPersonaEn(planes, persona, sumarDias(hoy, -1));
  const desdeAyer = (momento === null || momento === "por_entrar") && sigueDesdeAyer(estadoAyer, ahoraMin);

  // Próximo turno: el de hoy si aún no termina; si no, el siguiente de la semana.
  const hoyCuenta = momento === "por_entrar" || momento === "en_turno";
  const proximo = dias
    .slice(1)
    .map((f) => ({ fecha: f, estado: estadoPersonaEn(planes, persona, f) }))
    .find((d) => d.estado?.tipo === "turno");

  return (
    <div className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 md:w-72">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-cyan-100/80">Tu turno hoy</p>
        {(momento === "en_turno" || desdeAyer) && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden="true" /> En turno
          </span>
        )}
      </div>

      {desdeAyer && estadoAyer?.horario ? (
        <>
          <p className="mt-1 font-heading text-xl font-bold tabular-nums">Sales a las {estadoAyer.horario.salida}</p>
          <p className="mt-0.5 text-sm text-cyan-50/80">Turno {estadoAyer.codigo} que empezó ayer</p>
        </>
      ) : estadoHoy.tipo === "turno" && estadoHoy.horario ? (
        <>
          <p className="mt-1 font-heading text-xl font-bold tabular-nums">
            {estadoHoy.horario.entrada} – {estadoHoy.horario.salida}
          </p>
          <p className="mt-0.5 text-sm text-cyan-50/80">
            {estadoHoy.codigo} · {estadoHoy.horario.horas} h
            {momento === "terminado" && " · terminado"}
          </p>
          {estadoHoy.permisoParcial && (
            <p className="mt-1.5 inline-flex rounded-md bg-amber-300/20 px-2 py-0.5 text-xs font-semibold text-amber-100">
              Permiso de {estadoHoy.permisoParcial.horas} h
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 font-heading text-xl font-bold">
          {estadoHoy.tipo === "ausencia" ? etiquetaSinTurno(estadoHoy) : estadoHoy.codigo === "ASU" ? "Asueto" : "Descansas"}
        </p>
      )}

      {!hoyCuenta && !desdeAyer && (
        <p className="mt-2 text-xs text-cyan-50/80">
          {proximo?.estado?.horario
            ? `Próximo turno: ${diaRelativo(proximo.fecha, hoy)}, ${proximo.estado.horario.entrada}`
            : "Sin turnos en los próximos 6 días"}
        </p>
      )}
    </div>
  );
}

/** Grupo de la persona en el plan del mes en curso ("" si no aparece). */
export function grupoActual(jornada: Jornada, persona: RefPersona): string {
  return buscarFila(jornada.planes[fechaPlan(jornada.hoy).periodo], persona)?.grupo?.trim() || "";
}

// ── Sección "Tu equipo" ──────────────────────────────────────────────────────

export function EquipoDelDia({ jornada, persona, children }: {
  jornada: Jornada;
  persona: RefPersona;
  /** Contenido extra de la columna derecha (p. ej. trámites de personal). */
  children?: ReactNode;
}) {
  const { planes, dias, ahora, cargando, error } = jornada;
  const [diaSel, setDiaSel] = useState(0);
  const [grupoElegido, setGrupoElegido] = useState<string | null>(null);

  const fechaSel = dias[diaSel] ?? dias[0];
  const { periodo, dia } = fechaPlan(fechaSel);
  const plan = planes[periodo];
  const esHoy = diaSel === 0;
  const ahoraMin = esHoy ? minutosDelDia(ahora) : null;

  const gruposPresentes = useMemo(() => {
    if (!plan) return [];
    const set = new Set(plan.filas.map((f) => f.grupo?.trim() || "").filter(Boolean));
    return [...set].sort((a, b) => ordenGrupo(a) - ordenGrupo(b));
  }, [plan]);

  const miGrupo = buscarFila(plan, persona)?.grupo?.trim() || "";
  const grupoDeTurno = GRUPOS_ROTATIVOS.find((g) => hayTurno(plan, g, dia)) ?? "";
  const grupoVista =
    grupoElegido && gruposPresentes.includes(grupoElegido)
      ? grupoElegido
      : miGrupo || grupoDeTurno || gruposPresentes[0] || "";

  const miembros = personasDelGrupo(plan, grupoVista, fechaSel, planes, ahoraMin);

  // Siguiente día de la semana en que entra el grupo que se está viendo.
  const siguienteDiaGrupo = dias.findIndex((f, i) => {
    if (i <= diaSel) return false;
    const fp = fechaPlan(f);
    return hayTurno(planes[fp.periodo], grupoVista, fp.dia);
  });

  // Cobertura: emergencia, apoyo diurno, consulta externa y el grupo rotativo de turno (sin repetir el que se ve a la izquierda).
  const bloques: { grupo: string; titulo: string; icono: LucideIcon }[] = [
    { grupo: GRUPO_EMERGENCIA, titulo: "Emergencia", icono: Ambulance },
    { grupo: GRUPO_APOYO, titulo: "Apoyo diurno", icono: Sun },
    { grupo: GRUPO_CONSULTA_EXTERNA, titulo: "Consulta externa", icono: Stethoscope },
    ...GRUPOS_ROTATIVOS.filter((g) => hayTurno(plan, g, dia)).map((g) => ({ grupo: g, titulo: `${g} de turno`, icono: Users })),
  ].filter((b) => b.grupo !== grupoVista && gruposPresentes.includes(b.grupo));

  const sinPlan = !cargando && !error && !plan;

  return (
    <section aria-labelledby="titulo-equipo">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 id="titulo-equipo" className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Tu equipo
        </h2>
        <Link
          prefetch={false}
          href="/esdomed-horarios/mi-grupo"
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-600 dark:text-cyan-300 dark:hover:text-cyan-200"
        >
          Plan completo <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <TiraDias
        jornada={jornada}
        persona={persona}
        diaSel={diaSel}
        onElegir={setDiaSel}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {cargando ? (
            <Esqueleto filas={4} />
          ) : error ? (
            <Aviso titulo="No se pudo cargar el plan de trabajo" detalle="Vuelve a abrir el inicio en unos minutos." />
          ) : sinPlan ? (
            <Aviso
              titulo={`El plan de ${labelPeriodo(periodo).toLowerCase()} aún no está publicado`}
              detalle="Cuando el asistente lo publique, aquí verás quién viene cada día."
            />
          ) : (
            <PanelGrupo
              grupo={grupoVista}
              miGrupo={miGrupo}
              grupos={gruposPresentes}
              onCambiarGrupo={setGrupoElegido}
              fecha={fechaSel}
              esHoy={esHoy}
              ahoraMin={ahoraMin}
              miembros={miembros}
              persona={persona}
              siguienteDia={siguienteDiaGrupo > 0 ? { indice: siguienteDiaGrupo, fecha: dias[siguienteDiaGrupo] } : null}
              onVerDia={setDiaSel}
              hoy={jornada.hoy}
            />
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          {cargando ? (
            <Esqueleto filas={2} />
          ) : (
            plan && bloques.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                  <h3 className="font-heading font-semibold text-slate-800 dark:text-slate-100">Cobertura del día</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{esHoy ? "Hoy" : fechaLarga(fechaSel)}</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {bloques.map((b) => (
                    <BloqueCobertura
                      key={b.grupo}
                      titulo={b.titulo}
                      icono={b.icono}
                      personas={personasDelGrupo(plan, b.grupo, fechaSel, planes, ahoraMin)}
                      persona={persona}
                    />
                  ))}
                </div>
              </div>
            )
          )}
          {children}
        </div>
      </div>
    </section>
  );
}

// ── Piezas ───────────────────────────────────────────────────────────────────

function TiraDias({ jornada, persona, diaSel, onElegir }: {
  jornada: Jornada;
  persona: RefPersona;
  diaSel: number;
  onElegir: (i: number) => void;
}) {
  const { dias, planes, cargando } = jornada;
  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="group" aria-label="Elegir día">
      {dias.map((fecha, i) => {
        const { periodo, dia } = fechaPlan(fecha);
        const estado = cargando ? null : estadoPersonaEn(planes, persona, fecha);
        // Sin fila propia (p. ej. admin), la tira muestra qué grupo rotativo está de turno.
        const grupoTurno = !estado && !cargando ? GRUPOS_ROTATIVOS.find((g) => hayTurno(planes[periodo], g, dia)) : undefined;
        const sel = i === diaSel;
        let pie = "—";
        let clasePie = sel ? "text-white/80 dark:text-blue-950/70" : "text-slate-400 dark:text-slate-500";
        if (estado?.tipo === "turno") {
          pie = estado.codigo;
          clasePie = sel ? "text-white dark:text-blue-950" : "text-blue-700 dark:text-cyan-300";
        } else if (estado?.tipo === "ausencia") {
          pie = estado.codigo;
          clasePie = sel ? "text-white dark:text-blue-950" : estado.codigo === "INC" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400";
        } else if (estado) {
          pie = estado.codigo === "ASU" ? "Asueto" : "Libre";
        } else if (grupoTurno) {
          pie = grupoTurno.replace("Grupo ", "G");
        }
        return (
          <button
            key={fecha.getTime()}
            type="button"
            onClick={() => onElegir(i)}
            aria-pressed={sel}
            aria-label={`${i === 0 ? "Hoy, " : ""}${fechaLarga(fecha)}`}
            className={`flex min-w-0 flex-col items-center rounded-xl border px-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${
              sel
                ? "border-blue-600 bg-blue-600 text-white shadow-sm dark:border-cyan-400 dark:bg-cyan-400 dark:text-blue-950"
                : "border-slate-200 bg-white text-slate-700 hover:border-cyan-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-800"
            }`}
          >
            <span className={`text-[11px] font-medium ${sel ? "" : "text-slate-500 dark:text-slate-400"}`}>
              {i === 0 ? "Hoy" : DIA_CORTO[fecha.getDay()]}
            </span>
            <span className="font-heading text-lg font-bold leading-tight tabular-nums">{fecha.getDate()}</span>
            <span className={`max-w-full truncate text-[10px] font-bold leading-tight ${clasePie}`}>{pie}</span>
          </button>
        );
      })}
    </div>
  );
}

function PanelGrupo({
  grupo, miGrupo, grupos, onCambiarGrupo, fecha, esHoy, ahoraMin, miembros, persona, siguienteDia, onVerDia, hoy,
}: {
  grupo: string;
  miGrupo: string;
  grupos: string[];
  onCambiarGrupo: (g: string) => void;
  fecha: Date;
  esHoy: boolean;
  ahoraMin: number | null;
  miembros: PersonaDia[];
  persona: RefPersona;
  siguienteDia: { indice: number; fecha: Date } | null;
  onVerDia: (i: number) => void;
  hoy: Date;
}) {
  const visibles = miembros.filter((m) => m.estado.tipo !== "descanso" || m.momento === "desde_ayer");
  const descansan = miembros.filter((m) => m.estado.tipo === "descanso" && m.momento !== "desde_ayer");
  const conBarra = visibles.some((m) => m.estado.tipo === "turno" || m.momento === "desde_ayer");

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-slate-800">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-heading font-semibold text-slate-800 dark:text-slate-100">
            <UsersRound size={17} className="shrink-0 text-blue-600 dark:text-cyan-300" aria-hidden="true" />
            <span className="truncate">{grupo || "Sin grupos"}</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {grupo === miGrupo && miGrupo ? "Tu grupo" : "Grupo"} · {esHoy ? "hoy" : fechaLarga(fecha)}
          </p>
        </div>
        {grupos.length > 1 && (
          // El título ya nombra el grupo: el selector solo ofrece cambiarlo.
          <select
            value=""
            onChange={(e) => e.target.value && onCambiarGrupo(e.target.value)}
            aria-label="Ver otro grupo"
            className="max-w-[9.5rem] shrink-0 truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="" disabled>Ver otro grupo</option>
            {grupos.map((g) => (
              <option key={g} value={g} disabled={g === grupo}>
                {g}{g === miGrupo ? " (tu grupo)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {visibles.length === 0 ? (
        <div className="px-5 py-9 text-center">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {miembros.length === 0 ? "Este grupo no tiene personas este mes" : `Nadie de ${grupo} trabaja ${esHoy ? "hoy" : "este día"}`}
          </p>
          {siguienteDia && (
            <button
              type="button"
              onClick={() => onVerDia(siguienteDia.indice)}
              className="mt-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:text-cyan-300 dark:hover:bg-blue-950"
            >
              Entran {diaRelativo(siguienteDia.fecha, hoy)} <ChevronRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 pb-1 pt-3 sm:px-5">
          {conBarra && <EscalaHoras />}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibles.map((m) => (
              <FilaPersona key={m.fila.uid || m.fila.codigoMarcacion || m.fila.nombre} p={m} esYo={esLaPersona(m.fila, persona)} ahoraMin={ahoraMin} conBarra />
            ))}
          </ul>
        </div>
      )}

      {descansan.length > 0 && visibles.length > 0 && (
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 sm:px-5 dark:border-slate-800 dark:text-slate-400">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Descansan:</span>{" "}
          {descansan.map((m) => m.fila.nombre).join(", ")}
        </p>
      )}
    </div>
  );
}

/** Regla de 24 h alineada con las barras de cada persona (avatar 36 px + gap 12 px). */
function EscalaHoras() {
  const marcas = [
    { pos: 0, label: "12 am" },
    { pos: 25, label: "6 am" },
    { pos: 50, label: "12 pm" },
    { pos: 75, label: "6 pm" },
    { pos: 100, label: "12 am" },
  ];
  return (
    <div className="relative ml-12 h-4 text-[10px] tabular-nums text-slate-400 dark:text-slate-500" aria-hidden="true">
      {marcas.map((m) => (
        <span
          key={m.pos}
          className={`absolute top-0 whitespace-nowrap ${m.pos === 0 ? "" : m.pos === 100 ? "-translate-x-full" : "-translate-x-1/2"}`}
          style={{ left: `${m.pos}%` }}
        >
          {m.label}
        </span>
      ))}
    </div>
  );
}

function FilaPersona({ p, esYo, ahoraMin, conBarra = false, compacta = false }: {
  p: PersonaDia;
  esYo: boolean;
  ahoraMin: number | null;
  conBarra?: boolean;
  compacta?: boolean;
}) {
  const { fila, estado, momento, estadoAyer } = p;
  const desdeAyer = momento === "desde_ayer" && estadoAyer?.horario;
  const horario = desdeAyer ? estadoAyer!.horario! : estado.horario;
  const terminado = momento === "terminado";

  let detalle: ReactNode;
  if (desdeAyer) {
    detalle = `Desde ayer · sale ${horario!.salida}`;
  } else if (estado.tipo === "turno" && horario) {
    detalle = `${horario.entrada} – ${horario.salida} · ${horario.horas} h`;
  } else {
    detalle = fila.puesto || fila.codigoMarcacion || "";
  }

  return (
    <li className={compacta ? "py-2" : "py-3"}>
      <div className="flex items-center gap-3">
        <div
          className={`flex shrink-0 items-center justify-center rounded-full font-bold ${compacta ? "h-8 w-8 text-[11px]" : "h-9 w-9 text-xs"} ${
            esYo
              ? "bg-blue-600 text-white dark:bg-cyan-400 dark:text-blue-950"
              : "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-cyan-300"
          } ${terminado ? "opacity-60" : ""}`}
          aria-hidden="true"
        >
          {inicialesNombre(fila.nombre)}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`flex items-center gap-1.5 text-sm font-semibold leading-tight ${terminado ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-100"}`}>
            <span className="truncate" title={fila.nombre}>{fila.nombre}</span>
            {esYo && (
              <span className="shrink-0 rounded-full bg-blue-600 px-1.5 py-px text-[9px] font-bold text-white dark:bg-cyan-400 dark:text-blue-950">TÚ</span>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
            <span className="truncate">{detalle}</span>
            {estado.permisoParcial && !desdeAyer && (
              <span className="rounded bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                Permiso {estado.permisoParcial.horas} h
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {estado.tipo === "ausencia" && !desdeAyer ? (
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${claseAusencia(estado.codigo)}`}>
              {etiquetaSinTurno(estado)}
            </span>
          ) : (
            <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-blue-700 dark:bg-blue-950 dark:text-cyan-300">
              {desdeAyer ? estadoAyer!.codigo : estado.codigo}
            </span>
          )}
          <EtiquetaMomento momento={momento} estado={estado} estadoAyer={estadoAyer} />
        </div>
      </div>
      {conBarra && (estado.tipo === "turno" || desdeAyer) && (
        <BarraTurno p={p} ahoraMin={ahoraMin} />
      )}
    </li>
  );
}

function EtiquetaMomento({ momento, estado, estadoAyer }: { momento: Momento; estado: EstadoDia; estadoAyer?: EstadoDia }) {
  if (momento === "en_turno" || (momento === "desde_ayer" && estadoAyer)) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> En turno
      </span>
    );
  }
  if (momento === "por_entrar" && estado.horario) {
    return <span className="text-[11px] text-slate-500 dark:text-slate-400">Entra {estado.horario.entrada}</span>;
  }
  if (momento === "terminado") {
    return <span className="text-[11px] text-slate-400 dark:text-slate-500">Terminó</span>;
  }
  return null;
}

/**
 * Barra del turno sobre las 24 h del día elegido. Un extremo recto indica que
 * el turno sigue más allá del día (amanece mañana o viene de ayer).
 */
function BarraTurno({ p, ahoraMin }: { p: PersonaDia; ahoraMin: number | null }) {
  let inicio: number;
  let fin: number;
  if (p.momento === "desde_ayer" && p.estadoAyer?.fin != null) {
    inicio = 0;
    fin = p.estadoAyer.fin - MIN_DIA;
  } else if (p.estado.inicio != null && p.estado.fin != null) {
    inicio = p.estado.inicio;
    fin = p.estado.fin;
  } else {
    return null;
  }
  const desdeAntes = p.momento === "desde_ayer";
  const sigue = fin > MIN_DIA;
  const izq = (Math.max(0, inicio) / MIN_DIA) * 100;
  const der = (Math.min(MIN_DIA, fin) / MIN_DIA) * 100;
  const color =
    p.momento === "en_turno" || p.momento === "desde_ayer"
      ? "bg-blue-600 dark:bg-cyan-400"
      : p.momento === "terminado"
        ? "bg-slate-300 dark:bg-slate-600"
        : "bg-blue-400/70 dark:bg-cyan-700";

  return (
    <div className="relative ml-12 mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
      <div
        className={`absolute inset-y-0 ${color} ${desdeAntes ? "" : "rounded-l-full"} ${sigue ? "" : "rounded-r-full"}`}
        style={{ left: `${izq}%`, width: `${Math.max(der - izq, 1)}%` }}
      />
      {ahoraMin !== null && (
        <div className="absolute -inset-y-1 w-px bg-slate-800/70 dark:bg-white/70" style={{ left: `${(ahoraMin / MIN_DIA) * 100}%` }} />
      )}
    </div>
  );
}

function BloqueCobertura({ titulo, icono: Icono, personas, persona }: {
  titulo: string;
  icono: LucideIcon;
  personas: PersonaDia[];
  persona: RefPersona;
}) {
  const trabajan = personas.filter((m) => m.estado.tipo === "turno" || m.momento === "desde_ayer");
  const ausentes = personas.filter((m) => m.estado.tipo === "ausencia" && m.momento !== "desde_ayer");
  return (
    <div className="px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <Icono size={14} className="text-blue-600 dark:text-cyan-300" aria-hidden="true" /> {titulo}
      </p>
      {trabajan.length === 0 ? (
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">Nadie programado.</p>
      ) : (
        <ul className="mt-0.5">
          {trabajan.map((m) => (
            <FilaPersona key={m.fila.uid || m.fila.codigoMarcacion || m.fila.nombre} p={m} esYo={esLaPersona(m.fila, persona)} ahoraMin={null} compacta />
          ))}
        </ul>
      )}
      {ausentes.length > 0 && (
        <ul className="mt-1 space-y-1">
          {ausentes.map((m) => (
            <li key={m.fila.uid || m.fila.codigoMarcacion || m.fila.nombre} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-slate-600 dark:text-slate-300" title={m.fila.nombre}>{m.fila.nombre}</span>
              <span className={`shrink-0 rounded-md px-1.5 py-px text-[11px] font-semibold ring-1 ring-inset ${claseAusencia(m.estado.codigo)}`}>
                {etiquetaSinTurno(m.estado)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Esqueleto({ filas }: { filas: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-hidden="true">
      <div className="h-4 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: filas }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
            <div className="h-3 flex-1 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Aviso({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{titulo}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">{detalle}</p>
    </div>
  );
}
