"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, IdCard, Loader2, RefreshCw, Search, X } from "lucide-react";
import { ESPECIALIDADES_CE, especialidadPorId } from "@/lib/consultaExterna/especialidades";
import { ETIQUETA_ESTADO, normalizarEstado, type EstadoCitaCE } from "@/lib/consultaExterna/circuito";
import { filtrarTarjetas, type OrdenTarjetas, type TarjetaCE } from "@/lib/consultaExterna/tarjetas";
import { leerCatalogoTarjetas, leerCitasDeExpediente } from "@/lib/consultaExterna/tarjetasDatos";
import type { CitaCEConId } from "@/lib/consultaExterna/tipos";

// Catálogo de tarjetas (pedido del usuario, 2026-11-19): todos los pacientes
// que han aparecido con DUI en una agenda cargada del SIS, de cualquier fecha.
// Con DUI en el SIS = ya se le hizo tarjeta. El catálogo se llena solo al
// cargar las agendas (tarjetasDatos.ts).
//
// Lecturas: a lo más 20 al abrir (un documento por fragmento; se guardan 10
// minutos en memoria al ir y volver de otra página) y, al abrir la ficha de
// un paciente, una por cada cita suya.
//
// Las lecturas entran por props para poder ver la pantalla con datos falsos,
// sin Firestore; la página usa las de siempre.

const PAGINA = 50;
const VIGENTE_MS = 10 * 60_000;

export type CatalogoLeido = { tarjetas: TarjetaCE[]; actualizadoEn: Date | null };
type Catalogo = CatalogoLeido;
type LeerCatalogo = () => Promise<Catalogo>;

// Solo se guarda en memoria lo leído de Firestore (no los datos de una prueba).
let enMemoria: { datos: Catalogo; ms: number } | null = null;
const vigente = (leer: LeerCatalogo) =>
  leer === leerCatalogoTarjetas && !!enMemoria && Date.now() - enMemoria.ms < VIGENTE_MS;

async function traerCatalogo(leer: LeerCatalogo): Promise<Catalogo> {
  const datos = await leer();
  if (leer === leerCatalogoTarjetas) enMemoria = { datos, ms: Date.now() };
  return datos;
}

const ERROR_LECTURA = "No se pudo leer el catálogo. Revise la conexión e intente de nuevo.";

const tarjeta = "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";

function fechaCorta(iso: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-SV", { day: "numeric", month: "short", year: "numeric" });
}

const nombresEspecialidades = (ids: string[]) =>
  ESPECIALIDADES_CE.filter((e) => ids.includes(e.id)).map((e) => e.nombre);

interface Props {
  leerCatalogo?: LeerCatalogo;
  leerCitas?: (expediente: string) => Promise<CitaCEConId[]>;
}

export function CatalogoTarjetas({ leerCatalogo = leerCatalogoTarjetas, leerCitas = leerCitasDeExpediente }: Props) {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(() => (vigente(leerCatalogo) ? enMemoria!.datos : null));
  const [cargando, setCargando] = useState(() => !vigente(leerCatalogo));
  const [error, setError] = useState("");
  const [consulta, setConsulta] = useState("");
  const [especialidadId, setEspecialidadId] = useState("");
  const [orden, setOrden] = useState<OrdenTarjetas>("nombre");
  const [limite, setLimite] = useState(PAGINA);
  const [abierta, setAbierta] = useState("");

  // Al abrir: lo que quedó en memoria (si es reciente ya está en el estado inicial) o una lectura.
  useEffect(() => {
    if (vigente(leerCatalogo)) return;
    let vivo = true;
    traerCatalogo(leerCatalogo)
      .then((datos) => { if (vivo) setCatalogo(datos); })
      .catch((e) => {
        console.error("No se pudo leer el catálogo de tarjetas", e);
        if (vivo) setError(ERROR_LECTURA);
      })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [leerCatalogo]);

  const actualizar = async () => {
    setCargando(true);
    setError("");
    try {
      setCatalogo(await traerCatalogo(leerCatalogo));
    } catch (e) {
      console.error("No se pudo leer el catálogo de tarjetas", e);
      setError(ERROR_LECTURA);
    } finally {
      setCargando(false);
    }
  };

  const q = useDeferredValue(consulta);
  const resultados = catalogo ? filtrarTarjetas(catalogo.tarjetas, q, { especialidadId, orden }) : [];
  const visibles = resultados.slice(0, limite);
  const total = catalogo?.tarjetas.length ?? 0;
  const filtrando = q.trim().length >= 2 || !!especialidadId;

  const conteoPorEspecialidad = (id: string) => catalogo?.tarjetas.filter((t) => t.especialidades.includes(id)).length ?? 0;

  // Cambiar la búsqueda o los filtros vuelve a la primera página.
  const cambiarConsulta = (v: string) => { setConsulta(v); setLimite(PAGINA); };
  const cambiarEspecialidad = (id: string) => { setEspecialidadId(id); setLimite(PAGINA); };
  const cambiarOrden = (o: OrdenTarjetas) => { setOrden(o); setLimite(PAGINA); };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
            <IdCard size={17} className="text-blue-600 dark:text-cyan-300" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">Catálogo de tarjetas</h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Pacientes con DUI en las agendas cargadas del SIS, de cualquier fecha
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {catalogo && (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold tabular-nums text-blue-700 dark:bg-blue-950 dark:text-cyan-300">
              {total.toLocaleString("es-SV")} {total === 1 ? "paciente" : "pacientes"}
            </span>
          )}
          <button
            type="button"
            onClick={() => void actualizar()}
            disabled={cargando}
            title={catalogo?.actualizadoEn ? `Actualizado: ${catalogo.actualizadoEn.toLocaleString("es-SV")}` : undefined}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-white disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw size={14} className={cargando ? "animate-spin" : ""} aria-hidden="true" />
            Actualizar
          </button>
        </div>
      </div>

      <section className={`${tarjeta} space-y-4 p-4 md:p-5`}>
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={consulta}
            onChange={(e) => cambiarConsulta(e.target.value)}
            placeholder="Expediente, DUI o nombre"
            aria-label="Buscar por expediente, DUI o nombre"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-11 text-base text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white [&::-webkit-search-cancel-button]:hidden"
          />
          {consulta && (
            <button
              type="button"
              onClick={() => cambiarConsulta("")}
              aria-label="Borrar la búsqueda"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por especialidad">
          <Chip activo={!especialidadId} onClick={() => cambiarEspecialidad("")}>
            Todas
          </Chip>
          {ESPECIALIDADES_CE.map((e) => {
            const n = conteoPorEspecialidad(e.id);
            if (!n) return null;
            return (
              <Chip key={e.id} activo={especialidadId === e.id} onClick={() => cambiarEspecialidad(especialidadId === e.id ? "" : e.id)}>
                {e.nombre} <span className="tabular-nums opacity-70">{n}</span>
              </Chip>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {!catalogo ? (
        !error && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            Leyendo el catálogo…
          </div>
        )
      ) : total === 0 ? (
        <div className={`${tarjeta} px-6 py-12 text-center`}>
          <IdCard size={28} className="mx-auto text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">El catálogo aún está vacío</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Se llena solo al cargar las agendas del SIS: cada paciente que trae DUI entra aquí.
          </p>
        </div>
      ) : (
        <section aria-live="polite">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {filtrando
                ? `${resultados.length.toLocaleString("es-SV")} de ${total.toLocaleString("es-SV")} pacientes`
                : `${total.toLocaleString("es-SV")} pacientes`}
            </p>
            <div className="inline-flex flex-shrink-0 rounded-xl bg-slate-200/60 p-1 dark:bg-slate-800" role="group" aria-label="Ordenar">
              {([
                ["nombre", "Por apellido"],
                ["reciente", "Última cita"],
              ] as const).map(([o, etiqueta]) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={orden === o}
                  onClick={() => cambiarOrden(o)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                    orden === o
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>

          {resultados.length === 0 ? (
            <div className={`${tarjeta} px-6 py-10 text-center`}>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Ningún paciente con tarjeta coincide</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Si en el SIS el paciente no tiene DUI, aún no tiene tarjeta y no aparece aquí.
              </p>
            </div>
          ) : (
            <ul className={`${tarjeta} divide-y divide-slate-100 overflow-hidden dark:divide-slate-800`}>
              {visibles.map((t) => (
                <FilaTarjeta
                  key={t.expediente}
                  t={t}
                  abierta={abierta === t.expediente}
                  onAlternar={() => setAbierta((a) => (a === t.expediente ? "" : t.expediente))}
                  leerCitas={leerCitas}
                />
              ))}
            </ul>
          )}

          {resultados.length > limite && (
            <button
              type="button"
              onClick={() => setLimite((l) => l + PAGINA)}
              className="mt-3 w-full rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Mostrar {Math.min(PAGINA, resultados.length - limite)} más · quedan {(resultados.length - limite).toLocaleString("es-SV")}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        activo
          ? "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-500"
          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function FilaTarjeta({
  t, abierta, onAlternar, leerCitas,
}: {
  t: TarjetaCE;
  abierta: boolean;
  onAlternar: () => void;
  leerCitas: (expediente: string) => Promise<CitaCEConId[]>;
}) {
  const idDetalle = `tarjeta-${t.expediente}`;
  return (
    <li>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        aria-controls={idDetalle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        {/* En el celular el expediente va bajo el nombre, para que el nombre quepa completo. */}
        <span className="hidden w-24 flex-shrink-0 font-mono text-sm font-bold text-blue-700 dark:text-cyan-300 sm:block">{t.expediente}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug text-slate-900 dark:text-white sm:truncate">{t.paciente}</span>
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400 sm:truncate">
            <span className="font-mono font-bold text-blue-700 dark:text-cyan-300 sm:hidden">{t.expediente} · </span>
            DUI <span className="font-mono">{t.dui}</span>
            {t.especialidades.length > 0 && <> · {nombresEspecialidades(t.especialidades).join(", ")}</>}
          </span>
        </span>
        <span className="hidden flex-shrink-0 text-right sm:block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Última cita</span>
          <span className="block text-sm tabular-nums text-slate-700 dark:text-slate-200">{fechaCorta(t.ultima)}</span>
        </span>
        <ChevronDown
          size={16}
          className={`flex-shrink-0 text-slate-400 transition-transform ${abierta ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {abierta && <DetalleTarjeta id={idDetalle} t={t} leerCitas={leerCitas} />}
    </li>
  );
}

const TONO_ESTADO: Record<EstadoCitaCE, string> = {
  citado: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  espera: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-cyan-300",
  llamado: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-cyan-300",
  atendido: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  no_respondio: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
};

/** Ficha del paciente: sus citas cargadas (se leen al abrirla). */
function DetalleTarjeta({
  id, t, leerCitas,
}: {
  id: string;
  t: TarjetaCE;
  leerCitas: (expediente: string) => Promise<CitaCEConId[]>;
}) {
  const [citas, setCitas] = useState<CitaCEConId[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerCitas(t.expediente)
      .then((c) => { if (vivo) setCitas(c); })
      .catch((e) => {
        console.error("No se pudieron leer las citas del paciente", e);
        if (vivo) setError(true);
      });
    return () => { vivo = false; };
  }, [t.expediente, leerCitas]);

  return (
    <div id={id} className="border-t border-slate-100 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/30">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        {[
          ["Expediente", t.expediente],
          ["DUI", t.dui],
          ["Primera cita cargada", fechaCorta(t.primera)],
          ["Última cita cargada", fechaCorta(t.ultima)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{k}</dt>
            <dd className="font-medium tabular-nums text-slate-800 dark:text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Citas cargadas</h3>
      {error ? (
        <p className="text-sm text-rose-700 dark:text-rose-300">No se pudieron leer las citas. Intente de nuevo.</p>
      ) : !citas ? (
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Buscando sus citas…
        </p>
      ) : citas.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No quedan citas cargadas de este expediente.</p>
      ) : (
        <ul className="divide-y divide-slate-200/70 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {citas.map((c) => {
            const estado = normalizarEstado(c.estado);
            return (
              // Celular: fecha y estado arriba, especialidad y médico abajo. Desde sm, en una línea.
              <li
                key={c.id}
                className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[7rem_1fr_auto]"
              >
                <span className="col-start-1 row-start-1 tabular-nums font-medium text-slate-800 dark:text-slate-100">{fechaCorta(c.fecha)}</span>
                <span className="col-span-2 row-start-2 min-w-0 text-slate-600 dark:text-slate-300 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  {especialidadPorId(c.especialidadId)?.nombre ?? c.especialidad}
                  {c.medico ? ` · ${c.medico}` : ""}
                  {c.primeraVez ? " · Primera vez" : ""}
                </span>
                <span
                  className={`col-start-2 row-start-1 justify-self-end rounded-full px-2 py-0.5 text-xs font-semibold sm:col-start-3 ${TONO_ESTADO[estado] ?? TONO_ESTADO.citado}`}
                >
                  {ETIQUETA_ESTADO[estado] ?? c.estado}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
