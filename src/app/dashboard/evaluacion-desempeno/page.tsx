"use client";

// Evaluación de personal (solo admin): archivo de las evaluaciones del
// desempeño hechas con el formulario MINSAL, guardadas por semestre.
//  - "Por periodo": las del semestre elegido, resumen y quién falta evaluar.
//  - "Por persona": historial de cada quien semestre a semestre.
// Cualquier evaluación se abre para corregirla o se reimprime desde aquí.
// PRIVACIDAD: los listados NO muestran puntajes ni calificaciones (ni promedios
// ni conteos por calificación): esta pantalla se le muestra al personal al
// evaluarlo y no debe ver las notas de los demás. La nota solo se ve al abrir
// la evaluación de cada persona.
// Lecturas: la colección de evaluaciones + el personal ESDOMED (una vez).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange, ClipboardCheck, ClipboardPen, Plus, Printer, Search, UserRound, UsersRound, Vote } from "lucide-react";
import { collection, getDocs, query, where, type Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { UserProfile } from "@/types";
import {
  COLECCION_EVALUACIONES_DESEMPENO,
  factoresCompletos,
  partirPeriodo,
  periodoSemestral,
  type EvaluacionDesempeno,
} from "@/lib/evaluacionDesempeno";
import { esVotante, quienesVotaron } from "@/lib/evaluacionDesempenoVotacion";

type Persona = Pick<UserProfile, "uid" | "nombre" | "puesto" | "codigoMarcacion" | "role" | "activo">;
type Vista = "pendientes" | "evaluadas" | "persona" | "votar";

const aFecha = (v: unknown) => ((v as Timestamp | null | undefined)?.toDate ? (v as Timestamp).toDate() : new Date(0));
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es").trim();

/** Orden cronológico de "ENE - JUN 2026" / "JUL - DIC 2026" (mayor = más reciente). */
const ordenPeriodo = (p: string) => {
  const { semestre, anio } = partirPeriodo(p);
  return anio * 2 + (semestre === "JUL - DIC" ? 1 : 0);
};


export default function EvaluacionPersonalPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const esAdmin = profile?.role === "admin";

  const [lista, setLista] = useState<EvaluacionDesempeno[] | null>(null);
  const [personal, setPersonal] = useState<Persona[]>([]);
  const [error, setError] = useState("");
  const [vista, setVista] = useState<Vista>("pendientes");
  const [periodo, setPeriodo] = useState(periodoSemestral());
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (!authLoading && profile && !esAdmin) router.replace("/dashboard");
  }, [authLoading, profile, esAdmin, router]);

  useEffect(() => {
    if (!esAdmin) return;
    let cancelado = false;
    Promise.all([
      getDocs(collection(db, COLECCION_EVALUACIONES_DESEMPENO)),
      getDocs(query(collection(db, "usuarios"), where("role", "in", ["esdomed", "asistente_esdomed", "admin"]))),
    ])
      .then(([snap, usuarios]) => {
        if (cancelado) return;
        setLista(
          snap.docs.map((d) => {
            const data = d.data();
            return { ...(data as EvaluacionDesempeno), id: d.id, creadoEn: aFecha(data.creadoEn), actualizadoEn: aFecha(data.actualizadoEn) };
          }),
        );
        setPersonal(
          usuarios.docs
            .map((d) => ({ uid: d.id, ...d.data() }) as Persona)
            // Mismo criterio que Personal de trabajo y que el selector de la evaluación.
            .filter((u) => u.role !== "admin" || Boolean(u.codigoMarcacion?.trim()))
            .filter((u) => u.activo !== false)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
        );
      })
      .catch(() => {
        if (!cancelado) setError("No se pudieron cargar las evaluaciones.");
      });
    return () => {
      cancelado = true;
    };
  }, [esAdmin]);

  const periodos = useMemo(() => {
    const set = new Set((lista ?? []).map((e) => e.periodo));
    set.add(periodoSemestral());
    return [...set].sort((a, b) => ordenPeriodo(b) - ordenPeriodo(a));
  }, [lista]);

  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
  const coincide = (texto: string) => {
    const t = normalizar(texto);
    return palabras.every((p) => t.includes(p));
  };

  // Supervisores: evaluaciones en curso de otras personas del periodo, para votar.
  const miUid = profile?.uid ?? "";
  const soyVotante = esVotante(miUid);
  const enVotacion = (lista ?? [])
    .filter((e) => e.periodo === periodo && e.empleadoId !== miUid && !factoresCompletos(e.respuestas ?? {}))
    .sort((a, b) => a.empleadoNombre.localeCompare(b.empleadoNombre, "es"));
  const faltaMiVoto = enVotacion.filter((e) => !quienesVotaron(e.votos, e.empleadoId).includes(miUid)).length;

  if (authLoading || !profile || !esAdmin) return null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2739] via-[#1a4e70] to-[#2b8ca8] px-5 py-6 text-white shadow-lg shadow-cyan-950/15 md:px-7">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/10" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">Administración</p>
            <h1 className="mt-1 text-2xl font-bold font-heading">Evaluación de personal</h1>
            <p className="mt-1 text-sm text-cyan-50/85">
              Cada evaluación queda guardada por semestre: consulta cuánto sacó cada quien y reimprime cuando haga falta.
            </p>
          </div>
          <Link
            href={`/dashboard/evaluacion-desempeno/nueva?periodo=${encodeURIComponent(periodo)}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-800 shadow-sm transition-colors hover:bg-cyan-50"
          >
            <Plus size={16} /> Nueva evaluación
          </Link>
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        {([
          { id: "pendientes", label: "Pendientes", icon: CalendarRange },
          { id: "evaluadas", label: "Evaluadas", icon: ClipboardCheck },
          { id: "persona", label: "Por persona", icon: UsersRound },
          ...(soyVotante ? [{ id: "votar", label: "Por votar", icon: Vote, cuenta: faltaMiVoto }] : []),
        ] as { id: Vista; label: string; icon: typeof CalendarRange; cuenta?: number }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setVista(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              vista === t.id
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <t.icon size={14} /> {t.label}
            {!!t.cuenta && (
              <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">{t.cuenta}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        {vista !== "persona" && (
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            aria-label="Periodo"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          >
            {periodos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {lista === null && !error ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : vista === "pendientes" ? (
        <VistaPendientes lista={lista ?? []} personal={personal} periodo={periodo} coincide={coincide} />
      ) : vista === "votar" && soyVotante ? (
        <VistaPorVotar enVotacion={enVotacion} periodo={periodo} miUid={miUid} coincide={coincide} />
      ) : vista === "evaluadas" ? (
        <VistaEvaluadas lista={lista ?? []} periodo={periodo} coincide={coincide} />
      ) : (
        <VistaPersona lista={lista ?? []} personal={personal} periodos={periodos} coincide={coincide} />
      )}
    </div>
  );
}

// ── Por periodo ──────────────────────────────────────────────────────────────

// Pendientes y Evaluadas van en pestañas separadas para que quien falta no
// comparta pantalla con la lista de quienes ya fueron evaluados.

function VistaPendientes({
  lista,
  personal,
  periodo,
  coincide,
}: {
  lista: EvaluacionDesempeno[];
  personal: Persona[];
  periodo: string;
  coincide: (t: string) => boolean;
}) {
  const evaluados = new Set(lista.filter((e) => e.periodo === periodo).map((e) => e.empleadoId));
  const pendientes = personal.filter((p) => !evaluados.has(p.uid));
  const pendientesVisibles = pendientes.filter((p) => coincide(`${p.nombre} ${p.puesto ?? ""}`));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Resumen label="Evaluados" valor={`${evaluados.size} de ${personal.length || evaluados.size}`} />
        <Resumen label="Faltan" valor={String(pendientes.length)} tono={pendientes.length ? "amber" : undefined} />
      </div>

      {pendientes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <ClipboardCheck size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm text-slate-500">No falta nadie por evaluar en {periodo}.</p>
        </div>
      ) : pendientesVisibles.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Nadie coincide con la búsqueda.</p>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Faltan por evaluar en {periodo}</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {pendientesVisibles.map((p) => (
              <li key={p.uid} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
                <UserRound size={14} className="shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800 dark:text-slate-100">{p.nombre}</p>
                  <p className="truncate text-[11px] text-slate-500">{p.puesto || "Sin puesto"}</p>
                </div>
                <Link
                  href={`/dashboard/evaluacion-desempeno/nueva?empleado=${p.uid}&periodo=${encodeURIComponent(periodo)}`}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/50"
                >
                  Evaluar
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function VistaEvaluadas({ lista, periodo, coincide }: { lista: EvaluacionDesempeno[]; periodo: string; coincide: (t: string) => boolean }) {
  const delPeriodo = lista
    .filter((e) => e.periodo === periodo)
    .sort((a, b) => a.empleadoNombre.localeCompare(b.empleadoNombre, "es"));
  const visibles = delPeriodo.filter((e) => coincide(e.empleadoNombre));

  if (!visibles.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
        <ClipboardPen size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
        <p className="mt-2 text-sm text-slate-500">{delPeriodo.length ? "Nadie coincide con la búsqueda." : `Todavía no hay evaluaciones de ${periodo}.`}</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {visibles.map((e) => (
          <FilaEvaluacion key={e.id} e={e} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Supervisores: evaluaciones en curso (guardadas sin las 7 letras) de otras personas.
 * Al abrir una marcan su letra en cada factor; su voto le sale a quien evalúa solo
 * como sugerencia. Sin notas, igual que el resto de listados.
 */
function VistaPorVotar({
  enVotacion,
  periodo,
  miUid,
  coincide,
}: {
  enVotacion: EvaluacionDesempeno[];
  periodo: string;
  miUid: string;
  coincide: (t: string) => boolean;
}) {
  const visibles = enVotacion.filter((e) => coincide(e.empleadoNombre));
  if (!visibles.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
        <Vote size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
        <p className="mt-2 text-sm text-slate-500">
          {enVotacion.length
            ? "Nadie coincide con la búsqueda."
            : `No hay evaluaciones en curso en ${periodo}. Aparecen aquí cuando quien evalúa guarda una evaluación sin terminar.`}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Abre la evaluación y marca tu letra en cada factor. Tu voto le sale a quien evalúa solo como sugerencia; tú ves solo el tuyo.
      </p>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {visibles.map((e) => {
            const yaVoto = quienesVotaron(e.votos, e.empleadoId).includes(miUid);
            return (
              <li key={e.id}>
                <Link
                  href={`/dashboard/evaluacion-desempeno/${e.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{e.empleadoNombre}</p>
                    <p className="truncate text-xs text-slate-500">
                      {e.periodo} · {e.datos?.cargoNombramiento || "Sin cargo"}
                    </p>
                  </div>
                  {yaVoto ? (
                    <span className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Ya votaste
                    </span>
                  ) : (
                    <span className="whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                      Falta tu voto
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function FilaEvaluacion({ e }: { e: EvaluacionDesempeno }) {
  return (
    <li className="flex items-stretch">
      <Link
        href={`/dashboard/evaluacion-desempeno/${e.id}`}
        className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center dark:hover:bg-slate-800/60"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{e.empleadoNombre}</p>
          <p className="truncate text-xs text-slate-500">
            {e.periodo} · {e.datos?.cargoNombramiento || "Sin cargo"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Estado e={e} />
        </div>
      </Link>
      <Link
        href={`/dashboard/evaluacion-desempeno/${e.id}?imprimir=1`}
        title="Imprimir hoja de evaluación"
        aria-label={`Imprimir evaluación de ${e.empleadoNombre}`}
        className="flex shrink-0 items-center border-l border-slate-100 px-4 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:border-slate-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
      >
        <Printer size={17} />
      </Link>
    </li>
  );
}

/** Estado de la evaluación sin mostrar la nota (privacidad: ver encabezado). */
function Estado({ e }: { e: EvaluacionDesempeno }) {
  return e.calificacion ? (
    <span className="whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
      Evaluada
    </span>
  ) : (
    <span className="whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      Incompleta
    </span>
  );
}

function Resumen({ label, valor, tono }: { label: string; valor: string; tono?: "amber" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${tono === "amber" ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-slate-100"}`}>{valor}</p>
    </div>
  );
}

// ── Por persona ──────────────────────────────────────────────────────────────

function VistaPersona({
  lista,
  personal,
  periodos,
  coincide,
}: {
  lista: EvaluacionDesempeno[];
  personal: Persona[];
  periodos: string[];
  coincide: (t: string) => boolean;
}) {
  // Personal vigente + quien tenga evaluaciones aunque ya no esté (historial).
  const filas = new Map<string, { uid: string; nombre: string; evals: Map<string, EvaluacionDesempeno> }>();
  for (const p of personal) filas.set(p.uid, { uid: p.uid, nombre: p.nombre, evals: new Map() });
  for (const e of lista) {
    if (!filas.has(e.empleadoId)) filas.set(e.empleadoId, { uid: e.empleadoId, nombre: e.empleadoNombre, evals: new Map() });
    const fila = filas.get(e.empleadoId)!;
    const previa = fila.evals.get(e.periodo);
    if (!previa || e.actualizadoEn > previa.actualizadoEn) fila.evals.set(e.periodo, e);
  }
  const visibles = [...filas.values()].filter((f) => coincide(f.nombre)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  if (!visibles.length) {
    return <p className="py-8 text-center text-sm text-slate-500">Nadie coincide con la búsqueda.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800">
            <th className="sticky left-0 bg-white px-4 py-2.5 font-semibold dark:bg-slate-900">Persona</th>
            {periodos.map((p) => (
              <th key={p} className="whitespace-nowrap px-3 py-2.5 text-center font-semibold">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {visibles.map((f) => (
            <tr key={f.uid}>
              <td className="sticky left-0 max-w-[14rem] truncate bg-white px-4 py-2 font-medium text-slate-800 dark:bg-slate-900 dark:text-slate-100">{f.nombre}</td>
              {periodos.map((p) => {
                const e = f.evals.get(p);
                return (
                  <td key={p} className="px-3 py-2 text-center">
                    {e ? (
                      <span className="inline-flex items-center gap-1">
                        <Link href={`/dashboard/evaluacion-desempeno/${e.id}`} title="Abrir evaluación" className="rounded-lg px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                          <Estado e={e} />
                        </Link>
                        <Link
                          href={`/dashboard/evaluacion-desempeno/${e.id}?imprimir=1`}
                          title="Reimprimir"
                          aria-label={`Reimprimir evaluación de ${f.nombre}, ${p}`}
                          className="rounded-md p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
                        >
                          <Printer size={14} />
                        </Link>
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
