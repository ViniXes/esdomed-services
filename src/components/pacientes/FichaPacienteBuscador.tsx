"use client";

import { useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import {
  AlertCircle,
  ArrowLeft,
  BedDouble,
  CalendarDays,
  IdCard,
  MapPin,
  Phone,
  Search,
  Stethoscope,
  UserRound,
  UserSearch,
  Users,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { CriterioConsultaPaciente, Paciente, Persona } from "@/types";
import {
  calcularEdad,
  diasEstancia,
  ESTADO_BADGE,
  ESTADO_LABEL,
  formatFecha,
  GENERO_LABEL,
  nombreCompleto,
  toDate,
} from "@/lib/pacientes/helpers";

// ── Normalizadores de búsqueda ────────────────────────────────────────────────

function normalizarExpediente(valor: string): string {
  const limpio = valor.trim().toUpperCase().replace(/\s+/g, "");
  if (!limpio) return "";
  if (limpio.includes("-")) return limpio;
  const soloNumeros = limpio.replace(/\D/g, "");
  if (soloNumeros.length >= 4) return `${soloNumeros.slice(0, -2)}-${soloNumeros.slice(-2)}`;
  return limpio;
}

function candidatosExpediente(valor: string): string[] {
  const original = valor.trim().toUpperCase().replace(/\s+/g, "");
  const normalizado = normalizarExpediente(valor);
  return Array.from(new Set([original, normalizado].filter(Boolean))).slice(0, 10);
}

function candidatosDui(valor: string): string[] {
  const raw = valor.trim();
  const soloNumeros = raw.replace(/\D/g, "");
  const formateado =
    soloNumeros.length === 9 ? `${soloNumeros.slice(0, 8)}-${soloNumeros.slice(8)}` : "";
  return Array.from(new Set([raw, soloNumeros, formateado].filter(Boolean))).slice(0, 10);
}

// Resumen ligero de una persona para la lista de resultados.
interface Candidato {
  expediente: string;
  nombres: string;
  apellidos: string;
  dui?: string;
}

function aCandidato(d: { expediente: string; nombres: string; apellidos: string; dui?: string }): Candidato {
  return { expediente: d.expediente, nombres: d.nombres, apellidos: d.apellidos, dui: d.dui };
}

// Datos personales unificados (persona canónica o snapshot del último ingreso).
type DatosPersona = Persona | Paciente;

interface FichaCargada {
  datos: DatosPersona;
  ingresos: Paciente[]; // ordenados por fechaIngreso desc
}

const MODOS: { id: CriterioConsultaPaciente; label: string; placeholder: string }[] = [
  { id: "expediente", label: "Expediente", placeholder: "Ej. 4599-26 o 459926" },
  { id: "dui", label: "DUI", placeholder: "Ej. 01234567-8" },
];

interface Props {
  /** Color de acento del encabezado según el área (médico=blue, TS=teal, psicología=violet). */
  accent?: "blue" | "teal" | "violet";
}

export function FichaPacienteBuscador({ accent = "blue" }: Props) {
  const { user, profile } = useAuth();

  const [modo, setModo] = useState<CriterioConsultaPaciente>("expediente");
  const [termino, setTermino] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [buscado, setBuscado] = useState(false);
  const [resultados, setResultados] = useState<Candidato[]>([]);
  const [ficha, setFicha] = useState<FichaCargada | null>(null);
  const [cargandoFicha, setCargandoFicha] = useState(false);

  const buscar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    setBuscado(false);
    setResultados([]);
    setFicha(null);

    const q = termino.trim();
    if (!q) {
      setError("Escribe un valor para buscar.");
      return;
    }

    setLoading(true);
    try {
      let encontrados: Candidato[] = [];

      if (modo === "expediente") {
        const candidatos = candidatosExpediente(q);
        // 1) Personas canónicas por expediente.
        const personasSnaps = await Promise.all(
          candidatos.map((c) => getDoc(doc(db, "personas", c))),
        );
        encontrados = personasSnaps
          .filter((s) => s.exists())
          .map((s) => aCandidato(s.data() as Persona));
        // 2) Si no hay persona, sintetizar desde ingresos (pacientes ISBM/rastreo).
        if (encontrados.length === 0) {
          const snap = await getDocs(
            query(collection(db, "pacientes"), where("expediente", "in", candidatos), limit(10)),
          );
          encontrados = dedupExpediente(snap.docs.map((d) => aCandidato(d.data() as Paciente)));
        }
      } else if (modo === "dui") {
        const candidatos = candidatosDui(q);
        const snap = await getDocs(
          query(collection(db, "personas"), where("dui", "in", candidatos), limit(10)),
        );
        encontrados = snap.docs.map((d) => aCandidato(d.data() as Persona));
        if (encontrados.length === 0) {
          const snapP = await getDocs(
            query(collection(db, "pacientes"), where("dui", "in", candidatos), limit(10)),
          );
          encontrados = dedupExpediente(snapP.docs.map((d) => aCandidato(d.data() as Paciente)));
        }
      }

      encontrados.sort((a, b) =>
        `${a.apellidos} ${a.nombres}`.localeCompare(`${b.apellidos} ${b.nombres}`),
      );
      setResultados(encontrados);
      setBuscado(true);

      // Si hay exactamente uno, abrir su ficha directamente.
      if (encontrados.length === 1) {
        await abrirFicha(encontrados[0]);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "No se pudo completar la búsqueda.");
    } finally {
      setLoading(false);
    }
  };

  const abrirFicha = async (candidato: Candidato) => {
    if (!user || !profile) {
      setError("No se pudo validar tu usuario para esta consulta.");
      return;
    }
    setCargandoFicha(true);
    setError("");
    try {
      const exp = candidato.expediente;
      const [personaSnap, ingresosSnap] = await Promise.all([
        getDoc(doc(db, "personas", exp)),
        getDocs(query(collection(db, "pacientes"), where("expediente", "==", exp))),
      ]);

      const ingresos = ingresosSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Paciente, "id">) }))
        .sort((a, b) => (toDate(b.fechaIngreso)?.getTime() ?? 0) - (toDate(a.fechaIngreso)?.getTime() ?? 0));

      const datos: DatosPersona | undefined = personaSnap.exists()
        ? ({ id: personaSnap.id, ...(personaSnap.data() as Omit<Persona, "id">) })
        : ingresos[0];

      if (!datos) {
        setError("No se encontraron datos del paciente.");
        return;
      }

      const activo = ingresos.find((i) => i.estado === "activo");
      setFicha({ datos, ingresos });

      // Constancia de la consulta.
      const payload: Record<string, unknown> = {
        usuarioUid: user.uid,
        usuarioNombre: profile.nombre,
        usuarioRole: profile.role,
        criterio: modo,
        termino: termino.trim(),
        expedienteConsultado: exp,
        pacienteNombre: nombreCompleto(datos),
        tieneIngresoActivo: Boolean(activo),
        totalEstancias: ingresos.length,
        creadoEn: serverTimestamp(),
      };
      if (profile.email) payload.usuarioEmail = profile.email;
      if (profile.jvpm) payload.usuarioJvpm = profile.jvpm;
      if (activo?.servicioActual) payload.servicioActual = activo.servicioActual;
      if (activo?.camaActual) payload.camaActual = activo.camaActual;
      await addDoc(collection(db, "consultas_paciente"), payload);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "No se pudo cargar la ficha.");
    } finally {
      setCargandoFicha(false);
    }
  };

  const header = HEADER_ACCENT[accent];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${header.box}`}>
          <UserSearch size={17} className={header.icon} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Buscar Paciente
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Ficha general del paciente: datos, contacto, ingreso activo e historial de estancias
          </p>
        </div>
      </div>

      <form onSubmit={buscar} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {MODOS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { setModo(m.id); setError(""); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                modo === m.id
                  ? "bg-[#1c1e4d] text-white dark:bg-[var(--color-institutional-navy)] dark:ring-1 dark:ring-[#c9a892]/40"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={termino}
            onChange={(e) => setTermino(e.target.value)}
            placeholder={MODOS.find((m) => m.id === modo)!.placeholder}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Search size={15} />
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>

        <p className="text-[11px] text-slate-500">
          Cada consulta de ficha queda registrada automáticamente para auditoría.
        </p>
      </form>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Sin resultados */}
      {buscado && !ficha && resultados.length === 0 && !cargandoFicha && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-2xl px-4 py-4 text-sm text-amber-700 dark:text-amber-400">
          No se encontró ningún paciente con ese criterio.
        </div>
      )}

      {/* Lista de coincidencias (cuando hay más de una) */}
      {!ficha && resultados.length > 1 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          <div className="px-4 py-2.5 text-xs font-semibold text-slate-500 bg-slate-50 dark:bg-slate-800/50">
            {resultados.length} coincidencias — selecciona un paciente
          </div>
          {resultados.map((c) => (
            <button
              key={c.expediente}
              onClick={() => abrirFicha(c)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {nombreCompleto(c)}
                </span>
                <span className="block text-xs text-slate-500 font-mono">Exp. {c.expediente}{c.dui ? ` · DUI ${c.dui}` : ""}</span>
              </span>
              <ArrowLeft size={14} className="rotate-180 text-slate-400 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {cargandoFicha && (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {ficha && <FichaDetalle ficha={ficha} onVolver={resultados.length > 1 ? () => setFicha(null) : undefined} />}
    </div>
  );
}

// ── Detalle de la ficha ───────────────────────────────────────────────────────

function FichaDetalle({ ficha, onVolver }: { ficha: FichaCargada; onVolver?: () => void }) {
  const { datos, ingresos } = ficha;
  const activo = ingresos.find((i) => i.estado === "activo");
  const edad = calcularEdad(toDate(datos.fechaNacimiento) ?? null);
  const responsable = datos.responsable;
  const direccion = [datos.direccion, datos.canton, datos.municipio, datos.departamento]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(", ");

  return (
    <section className="space-y-4">
      {onVolver && (
        <button onClick={onVolver} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
          <ArrowLeft size={13} /> Volver a resultados
        </button>
      )}

      {/* Cabecera */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
              <UserRound size={19} className="text-slate-500" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">{nombreCompleto(datos)}</p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">Exp. {datos.expediente}</p>
            </div>
          </div>
          {activo ? (
            <span className={`text-[11px] font-medium rounded-full px-2.5 py-1 ${ESTADO_BADGE.activo}`}>
              Ingreso activo
            </span>
          ) : (
            <span className="text-[11px] font-medium rounded-full px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Sin ingreso activo
            </span>
          )}
        </div>
      </div>

      {/* Datos personales */}
      <Bloque titulo="Datos personales" icon={IdCard}>
        <Dato label="DUI" value={datos.dui} mono />
        <Dato label="Género" value={GENERO_LABEL[datos.genero]} />
        <Dato label="Fecha de nacimiento" value={datos.fechaNacimiento ? `${formatFecha(toDate(datos.fechaNacimiento))}${edad != null ? ` · ${edad} años` : ""}` : undefined} />
        <Dato label="Estado familiar" value={datos.estadoFamiliar} />
        <Dato label="Nacionalidad" value={datos.nacionalidad} />
        <Dato label="Ocupación" value={datos.ocupacion} />
        <Dato label="N° afiliación ISSS" value={datos.numeroAfiliacion} mono />
      </Bloque>

      {/* Contacto */}
      <Bloque titulo="Contacto" icon={Phone}>
        <Dato label="Teléfono" value={datos.telefono} mono />
        <Dato label="Otros números" value={datos.otrosNumeros} mono />
        <Dato label="Dirección" value={direccion} className="sm:col-span-2" icon={MapPin} />
        <Dato label="Responsable" value={responsable?.nombre} icon={Users} />
        <Dato label="Parentesco" value={responsable?.parentesco} />
        <Dato label="Tel. responsable" value={responsable?.telefono} mono />
        <Dato label="Doc. responsable" value={responsable?.documento} mono />
      </Bloque>

      {/* Ingreso activo */}
      {activo && (
        <Bloque titulo="Ingreso activo" icon={BedDouble}>
          <Dato label="Servicio actual" value={activo.servicioActual} />
          <Dato label="Cama" value={activo.camaActual} mono />
          <Dato label="Fecha de ingreso" value={formatFecha(toDate(activo.fechaIngreso))} icon={CalendarDays} />
          <Dato label="Días de estancia" value={String(diasEstancia(toDate(activo.fechaIngreso) ?? new Date()))} />
          <Dato label="Médico de ingreso" value={activo.medicoIngresoNombre} icon={Stethoscope} />
          <Dato label="Diagnóstico de ingreso" value={activo.diagnosticoIngreso ? `${activo.diagnosticoIngreso.codigo} — ${activo.diagnosticoIngreso.descripcion}` : undefined} className="sm:col-span-2" />
        </Bloque>
      )}

      {/* Historial de estancias */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-500 bg-slate-50 dark:bg-slate-800/50">
          <CalendarDays size={13} />
          Historial de estancias ({ingresos.length})
        </div>
        {ingresos.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">Sin ingresos registrados para este expediente.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {ingresos.map((i) => {
              const ing = toDate(i.fechaIngreso);
              const egr = toDate(i.fechaEgreso);
              const dias = i.diasEstancia ?? (ing ? diasEstancia(ing, egr) : undefined);
              return (
                <div key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {i.servicioActual || i.servicioIngreso || "Servicio no registrado"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatFecha(ing)} → {egr ? formatFecha(egr) : "—"}
                      {dias != null ? ` · ${dias} día${dias === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                  <span className={`text-[11px] font-medium rounded-full px-2.5 py-1 flex-shrink-0 ${ESTADO_BADGE[i.estado]}`}>
                    {ESTADO_LABEL[i.estado]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Piezas de UI ──────────────────────────────────────────────────────────────

function Bloque({ titulo, icon: Icon, children }: { titulo: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
        <Icon size={15} className="text-slate-400" />
        {titulo}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Dato({ label, value, icon: Icon, mono = false, className = "" }: {
  label: string;
  value?: string | null;
  icon?: React.ElementType;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={`bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 ${className}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1">
        {Icon && <Icon size={12} />}
        {label}
      </div>
      <p className={`text-sm font-semibold text-slate-900 dark:text-slate-100 break-words ${mono ? "font-mono" : ""}`}>
        {value?.trim() ? value : <span className="text-slate-400 font-normal">Sin dato</span>}
      </p>
    </div>
  );
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function dedupExpediente(lista: Candidato[]): Candidato[] {
  const vistos = new Set<string>();
  const out: Candidato[] = [];
  for (const c of lista) {
    if (!c.expediente || vistos.has(c.expediente)) continue;
    vistos.add(c.expediente);
    out.push(c);
  }
  return out;
}

const HEADER_ACCENT: Record<NonNullable<Props["accent"]>, { box: string; icon: string }> = {
  blue: {
    box: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900",
    icon: "text-blue-600 dark:text-blue-400",
  },
  teal: {
    box: "bg-teal-50 dark:bg-teal-950 border-teal-200 dark:border-teal-900",
    icon: "text-teal-600 dark:text-teal-400",
  },
  violet: {
    box: "bg-violet-50 dark:bg-violet-950 border-violet-200 dark:border-violet-900",
    icon: "text-violet-600 dark:text-violet-400",
  },
};
