"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarCheck2, CheckCircle2, ChevronDown, FileSpreadsheet, FileUp, Loader2, RotateCcw, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hoyLocalISO } from "@/lib/esdomed/expedientesProgramados";
import { leerProgramacionCitas, type ProgramacionLeida } from "@/lib/consultaExterna/programacion";
import { prepararCarga, type CargaPreparada, type CitaNumerada } from "@/lib/consultaExterna/agenda";
import { guardarAgendaCE, leerAgendaCE, type ResultadoCargaCE } from "@/lib/consultaExterna/agendaDatos";
import { ESPECIALIDADES_CE, estacionPorId } from "@/lib/consultaExterna/especialidades";
import type { AgendaCE } from "@/lib/consultaExterna/tipos";

// Carga diaria de la "Programación de citas por día" del SIS. Se lee en el
// navegador, se muestra un resumen y al guardar cada cita recibe su código de
// llamado. Lecturas: 1 (resumen del día) + 1 por cita al guardar.

async function leerLibro(file: File): Promise<unknown[][][]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", raw: true });
  return wb.SheetNames.map((n) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: "" }));
}

function fechaLarga(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const s = d.toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const Aviso = ({ tono = "amber", children }: { tono?: "amber" | "rose"; children: React.ReactNode }) => (
  <div
    className={`flex gap-2.5 rounded-xl border px-4 py-3 text-sm ${
      tono === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
        : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    }`}
  >
    <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
    <div className="min-w-0">{children}</div>
  </div>
);

const tarjeta = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
const td = "px-3 py-2 text-slate-700 dark:text-slate-200";

interface Lectura {
  archivo: string;
  programacion: ProgramacionLeida;
  carga: CargaPreparada;
  /** Agenda ya guardada para la fecha del reporte (si existe). */
  existente: AgendaCE | null;
}

export default function CargarCitasPage() {
  const { user, profile } = useAuth();
  const hoy = hoyLocalISO();
  const inputRef = useRef<HTMLInputElement>(null);

  const [agendaHoy, setAgendaHoy] = useState<AgendaCE | null | undefined>(undefined);
  const [arrastrando, setArrastrando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<(ResultadoCargaCE & { fechaISO: string }) | null>(null);

  useEffect(() => {
    let vivo = true;
    leerAgendaCE(hoy)
      .then((a) => { if (vivo) setAgendaHoy(a); })
      .catch(() => { if (vivo) setAgendaHoy(null); });
    return () => { vivo = false; };
  }, [hoy]);

  const reiniciar = () => {
    setLectura(null);
    setResultado(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const manejarArchivo = async (file: File | undefined) => {
    if (!file) return;
    reiniciar();
    setLeyendo(true);
    try {
      const programacion = leerProgramacionCitas(await leerLibro(file));
      if (!programacion.citas.length) {
        setError(`"${file.name}" no parece la Programación de citas por día del SIS. Descárguela de nuevo y súbala sin abrirla en Excel.`);
        return;
      }
      const carga = prepararCarga(programacion);
      if (!carga.fechaISO) {
        setError(`El reporte trae citas de varias fechas (${programacion.fechas.join(", ")}). Descargue un solo día.`);
        return;
      }
      if (carga.fechaISO < hoy) {
        setError(`El reporte es del ${fechaLarga(carga.fechaISO).toLowerCase()}, un día que ya pasó.`);
        return;
      }
      // Solo informa si el día ya tenía citas; si la lectura falla se sigue
      // igual, porque al guardar la transacción no repite las ya cargadas.
      const existente =
        carga.fechaISO === hoy && agendaHoy !== undefined
          ? agendaHoy
          : await leerAgendaCE(carga.fechaISO).catch(() => null);
      setLectura({ archivo: file.name, programacion, carga, existente });
    } catch (e) {
      console.error("No se pudo leer la programación de citas", e);
      setError("No se pudo leer el archivo. Verifique que sea el .xls descargado del SIS.");
    } finally {
      setLeyendo(false);
    }
  };

  const guardar = async () => {
    if (!lectura || !user) return;
    setGuardando(true);
    setError("");
    try {
      const r = await guardarAgendaCE(lectura.carga, { uid: user.uid, nombre: profile?.nombre ?? "" }, lectura.archivo);
      setResultado({ ...r, fechaISO: lectura.carga.fechaISO });
      setLectura(null);
      if (lectura.carga.fechaISO === hoy) setAgendaHoy(await leerAgendaCE(hoy));
    } catch (e) {
      console.error("No se pudo guardar la agenda", e);
      setError(
        e instanceof Error && !/permission|insufficient/i.test(e.message)
          ? e.message
          : "No se pudo guardar la agenda. Revise la conexión e intente de nuevo.",
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
          <FileUp size={17} className="text-blue-600 dark:text-cyan-300" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Cargar citas del SIS</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Programación de citas por día · cada cita recibe su código de llamado</p>
        </div>
      </div>

      <AgendaDelDia agenda={agendaHoy} fechaISO={hoy} />

      {resultado ? (
        <ResultadoCarga resultado={resultado} onOtra={reiniciar} />
      ) : lectura ? (
        <VistaPrevia lectura={lectura} hoy={hoy} guardando={guardando} onGuardar={guardar} onCancelar={reiniciar} />
      ) : (
        <div
          role="button"
          tabIndex={0}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); manejarArchivo(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            inputRef.current?.click();
          }}
          className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors ${
            arrastrando
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
              : "border-slate-300 hover:border-blue-400 hover:bg-white dark:border-slate-700 dark:hover:bg-slate-900"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx,.htm,.html"
            className="hidden"
            onChange={(e) => manejarArchivo(e.target.files?.[0])}
          />
          {leyendo ? (
            <Loader2 size={28} className="mx-auto animate-spin text-blue-500 dark:text-cyan-300" />
          ) : (
            <Upload size={28} className="mx-auto text-blue-500 dark:text-cyan-300" />
          )}
          <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {leyendo ? "Leyendo el reporte…" : "Arrastre aquí el .xls o haga clic para elegirlo"}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            SIS → Programación de citas por día · tal como se descarga, sin abrirlo en Excel
          </p>
        </div>
      )}

      {error && <Aviso tono="rose">{error}</Aviso>}
    </div>
  );
}

// ─── Agenda ya cargada para hoy ─────────────────────────────────────────────

function AgendaDelDia({ agenda, fechaISO }: { agenda: AgendaCE | null | undefined; fechaISO: string }) {
  const ultima = agenda?.cargas?.at(-1);
  return (
    <section className={tarjeta}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <CalendarCheck2 size={18} className="mt-0.5 flex-shrink-0 text-blue-600 dark:text-cyan-300" aria-hidden="true" />
          <div>
            <h2 className="font-heading text-base font-bold text-slate-900 dark:text-slate-100">Agenda de hoy</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{fechaLarga(fechaISO)}</p>
          </div>
        </div>
        {agenda && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            {agenda.totalCitas} citas cargadas
          </span>
        )}
      </div>
      {agenda === undefined ? (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Consultando…</p>
      ) : agenda === null ? (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Aún no se ha cargado la agenda de hoy.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {ESPECIALIDADES_CE.filter((e) => agenda.porEspecialidad?.[e.id]).map((e) => (
              <span key={e.id} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800/60">
                <span className="font-mono text-xs font-bold text-blue-700 dark:text-cyan-300">{e.prefijo}</span>
                <span className="text-slate-700 dark:text-slate-200">{e.nombre}</span>
                <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{agenda.porEspecialidad[e.id]}</span>
              </span>
            ))}
          </div>
          {ultima && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Última carga: {ultima.porNombre || "—"} · {ultima.en?.toDate?.().toLocaleTimeString("es-SV", { hour: "numeric", minute: "2-digit" })} ·{" "}
              {ultima.nuevas} nuevas{agenda.cargas.length > 1 ? ` · ${agenda.cargas.length} cargas en el día` : ""}
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ─── Vista previa antes de guardar ──────────────────────────────────────────

function VistaPrevia({
  lectura, hoy, guardando, onGuardar, onCancelar,
}: {
  lectura: Lectura;
  hoy: string;
  guardando: boolean;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  const { carga, programacion, existente, archivo } = lectura;
  const total = carga.citas.length;
  const primeraVez = carga.citas.filter((c) => c.primeraVez).length;
  const sinDui = carga.citas.filter((c) => !c.dui).length;

  return (
    <section className={`${tarjeta} space-y-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <FileSpreadsheet size={14} aria-hidden="true" />
            {archivo}
          </div>
          <h2 className="mt-1 font-heading text-lg font-bold text-slate-900 dark:text-slate-100">
            {fechaLarga(carga.fechaISO)}
            {carga.fechaISO !== hoy && (
              <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 align-middle text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-cyan-300">
                agenda anticipada
              </span>
            )}
          </h2>
        </div>
        <dl className="flex gap-6 text-right">
          {[
            ["Citas", total],
            ["Primera vez", primeraVez],
            ["Sin DUI", sinDui],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{k}</dt>
              <dd className="font-heading text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {existente && (
        <Aviso>
          Este día ya tiene <strong>{existente.totalCitas} citas</strong> cargadas. Solo se agregarán las que falten, con los
          códigos siguientes; las ya cargadas conservan su código.
        </Aviso>
      )}
      {carga.noReconocidas.length > 0 && (
        <Aviso>
          No se cargarán por no tener estación configurada:{" "}
          {carga.noReconocidas.map((n) => `${n.especialidad} (${n.citas})`).join(", ")}.
        </Aviso>
      )}
      {programacion.repetidas.length > 0 && (
        <Aviso>
          Expedientes repetidos en la misma especialidad (se carga solo la primera cita):{" "}
          {programacion.repetidas.map((r) => r.expediente).join(", ")}.
        </Aviso>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className={th}>Especialidad</th>
              <th className={th}>Estación</th>
              <th className={th}>Prefijo</th>
              <th className={`${th} text-right`}>Médicos</th>
              <th className={`${th} text-right`}>Citas</th>
              <th className={`${th} text-right`}>Primera vez</th>
              <th className={`${th} text-right`}>Sin DUI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {carga.resumen.map((r) => (
              <tr key={r.id}>
                <td className={`${td} font-medium`}>{r.nombre}</td>
                <td className={td}>{estacionPorId(r.estacionId)?.nombre}</td>
                <td className={`${td} font-mono text-xs font-bold text-blue-700 dark:text-cyan-300`}>{r.prefijo}</td>
                <td className={`${td} text-right tabular-nums`}>{r.medicos}</td>
                <td className={`${td} text-right font-semibold tabular-nums`}>{r.citas}</td>
                <td className={`${td} text-right tabular-nums`}>{r.primeraVez}</td>
                <td className={`${td} text-right tabular-nums`}>{r.sinDui}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="group rounded-xl border border-slate-200 dark:border-slate-800">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Agendas por médico ({programacion.agendas.length})
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {programacion.agendas.map((a) => (
            <li key={`${a.especialidad}|${a.medico}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-slate-800 dark:text-slate-100">{a.medico || "Sin médico"}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {a.especialidad} · {a.consultorios.join(", ") || "sin consultorio"} · {a.franjas.join(", ")}
                </p>
              </div>
              <span className="tabular-nums text-slate-600 dark:text-slate-300">{a.citas} {a.citas === 1 ? "cita" : "citas"}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onGuardar}
          disabled={guardando || !total}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
        >
          {guardando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {guardando ? "Guardando…" : `Guardar agenda (${total} citas)`}
        </button>
      </div>
    </section>
  );
}

// ─── Resultado: códigos asignados ───────────────────────────────────────────

function ResultadoCarga({
  resultado, onOtra,
}: {
  resultado: ResultadoCargaCE & { fechaISO: string };
  onOtra: () => void;
}) {
  const { nuevas, yaCargadas, fechaISO } = resultado;
  const porEspecialidad = ESPECIALIDADES_CE.map((e) => ({
    esp: e,
    citas: nuevas.filter((c) => c.especialidadId === e.id).sort((a, b) => a.numero - b.numero),
  })).filter((g) => g.citas.length);

  return (
    <section className={`${tarjeta} space-y-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 size={22} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <div>
            <p className="font-heading text-base font-bold text-slate-900 dark:text-slate-100">
              {nuevas.length ? `${nuevas.length} citas cargadas` : "No había citas nuevas"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {fechaLarga(fechaISO)}
              {yaCargadas ? ` · ${yaCargadas} ya estaban cargadas y conservan su código` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOtra}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RotateCcw size={15} aria-hidden="true" />
          Cargar otro archivo
        </button>
      </div>

      {porEspecialidad.map(({ esp, citas }) => (
        <div key={esp.id}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            {esp.nombre} · {citas.length}
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className={th}>Código</th>
                  <th className={th}>Franja</th>
                  <th className={th}>Expediente</th>
                  <th className={th}>Paciente</th>
                  <th className={th}>Tipo</th>
                  <th className={th}>Médico</th>
                  <th className={th}>Consultorio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {citas.map((c: CitaNumerada) => (
                  <tr key={c.codigo}>
                    <td className={`${td} font-mono font-bold text-blue-700 dark:text-cyan-300`}>{c.codigo}</td>
                    <td className={`${td} tabular-nums whitespace-nowrap`}>{c.franjaInicio}–{c.franjaFin}</td>
                    <td className={`${td} tabular-nums`}>{c.expediente}</td>
                    <td className={td}>{c.paciente}</td>
                    <td className={td}>
                      {c.primeraVez ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-cyan-300">Primera vez</span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">Subsecuente</span>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{c.medico}</td>
                    <td className={`${td} whitespace-nowrap`}>{c.consultorio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {!nuevas.length && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Todas las citas del archivo ya estaban en la agenda de ese día.</p>
      )}
    </section>
  );
}
