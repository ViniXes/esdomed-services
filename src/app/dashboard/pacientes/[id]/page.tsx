"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft, BedDouble, MapPin, IdCard, User2, Stethoscope,
  Clock, Calendar, ArrowRightLeft, LogOut as LogOutIcon, HeartPulse, Pencil, Save, Users,
  FileUp, Loader2, AlertTriangle, X as XIcon,
} from "lucide-react";
import type { Paciente, MovimientoPaciente, DiagnosticoCIE } from "@/types";
import { CIE10Combobox } from "@/components/ui/CIE10Combobox";
import { parsearCertificadoDefuncion } from "@/lib/pacientes/pdfParser";
import {
  CIRCUNSTANCIA_LABEL, ESTADO_BADGE, ESTADO_LABEL, GENERO_LABEL,
  calcularEdad, diasEstancia, formatFecha, formatFechaHora, nombreCompleto, toDate,
} from "@/lib/pacientes/helpers";

type Tab = "datos" | "movimientos" | "egreso";

export default function PacienteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("datos");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "pacientes", id), (snap) => {
      if (!snap.exists()) {
        setPaciente(null);
        setLoading(false);
        return;
      }
      const data = snap.data();
      setPaciente({
        id: snap.id,
        ...data,
        fechaIngreso: toDate(data.fechaIngreso) ?? new Date(),
        fechaEgreso: toDate(data.fechaEgreso),
        fechaNacimiento: toDate(data.fechaNacimiento),
        creadoEn: toDate(data.creadoEn) ?? new Date(),
        movimientos: (data.movimientos ?? []).map((m: MovimientoPaciente & { fecha: unknown }) => ({
          ...m,
          fecha: toDate(m.fecha) ?? new Date(),
        })),
      } as Paciente);
      setLoading(false);
    });
    return unsub;
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!paciente) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center">
          <p className="text-sm text-slate-500">Paciente no encontrado.</p>
          <Link href="/dashboard/pacientes" className="inline-block mt-3 text-sm text-blue-600 hover:underline">
            ← Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  const edad = calcularEdad(paciente.fechaNacimiento);
  const dias = diasEstancia(paciente.fechaIngreso, paciente.fechaEgreso);
  const esActivo = paciente.estado === "activo";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-3">
        <div className="flex items-start gap-3 min-w-0 lg:flex-1">
          <button
            onClick={() => router.push("/dashboard/pacientes")}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors flex-shrink-0"
            aria-label="Volver"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[11px] text-slate-400 font-medium uppercase tracking-widest">Expediente</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${ESTADO_BADGE[paciente.estado]}`}>
                {ESTADO_LABEL[paciente.estado]}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5 break-words">
              {paciente.expediente}
            </h1>
            <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 font-medium break-words">
              {nombreCompleto(paciente)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 break-words">
              {edad !== null ? `${edad} años` : "Edad no registrada"}
              {paciente.genero && <> · {GENERO_LABEL[paciente.genero]}</>}
              {paciente.dui && <> · DUI {paciente.dui}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap lg:justify-end">
          <Link
            href={`/dashboard/pacientes/${paciente.id}/editar-persona`}
            className="flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            <Users size={14} />
            Editar datos del paciente
          </Link>
          <Link
            href={`/dashboard/pacientes/${paciente.id}/editar-ingreso`}
            className="flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            <Pencil size={14} />
            Editar este ingreso
          </Link>
          {esActivo && (
            <Link
              href={`/dashboard/pacientes/${paciente.id}/egreso`}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              <LogOutIcon size={14} />
              Registrar egreso
            </Link>
          )}
        </div>
      </div>

      {/* Estado banner si fallecido */}
      {paciente.estado === "alta_fallecido" && (
        <div className="bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 rounded-xl px-4 py-3 flex items-center gap-3">
          <HeartPulse size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-rose-700 dark:text-rose-400">Paciente fallecido</p>
            {paciente.fechaEgreso && (
              <p className="text-xs text-rose-600 dark:text-rose-500 mt-0.5">
                {formatFechaHora(paciente.fechaEgreso)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Calendar} label="Fecha de ingreso"
          value={formatFecha(paciente.fechaIngreso)} />
        <Stat icon={Clock} label={esActivo ? "Estancia actual" : "Días de estancia"}
          value={`${dias} ${dias === 1 ? "día" : "días"}`} />
        <Stat icon={BedDouble} label="Servicio actual"
          value={paciente.servicioActual} sub={paciente.camaActual ? `Cama ${paciente.camaActual}` : undefined} />
        <Stat icon={ArrowRightLeft} label="Movimientos"
          value={`${paciente.movimientos?.length ?? 0}`} />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        {([
          { id: "datos",       label: "Datos del paciente" },
          { id: "movimientos", label: "Movimientos" },
          { id: "egreso",      label: paciente.estado === "activo" ? "Egreso (pendiente)" : "Egreso" },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "datos" && <TabDatos paciente={paciente} />}
      {tab === "movimientos" && <TabMovimientos paciente={paciente} />}
      {tab === "egreso" && <TabEgreso paciente={paciente} pacienteId={id} />}
    </div>
  );
}

// ─── Stat card ──────────────────────────────────────────────────────────────

function Stat({
  icon: Icon, label, value, sub,
}: {
  icon: typeof BedDouble; label: string; value: string; sub?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5">
      <div className="flex items-center gap-1.5 text-slate-500 mb-1.5">
        <Icon size={12} />
        <p className="text-[11px] font-medium uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Tab: Datos ─────────────────────────────────────────────────────────────

function TabDatos({ paciente }: { paciente: Paciente }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card icon={IdCard} title="Identidad">
        <Row label="Apellidos" value={paciente.apellidos} />
        <Row label="Nombres" value={paciente.nombres} />
        <Row label="Fecha de nacimiento" value={formatFecha(paciente.fechaNacimiento)} />
        <Row label="Estado familiar" value={paciente.estadoFamiliar} />
        <Row label="Ocupación" value={paciente.ocupacion} />
        <Row label="Nacionalidad" value={paciente.nacionalidad} />
        <Row label="DUI" value={paciente.dui} mono />
        <Row label="Nº Afiliación" value={paciente.numeroAfiliacion} mono />
      </Card>

      <Card icon={MapPin} title="Domicilio y contacto">
        <Row label="Dirección" value={paciente.direccion} />
        <Row label="Departamento" value={paciente.departamento} />
        <Row label="Municipio" value={paciente.municipio} />
        <Row label="Cantón" value={paciente.canton} />
        <Row label="Área" value={paciente.area ? paciente.area.charAt(0).toUpperCase() + paciente.area.slice(1) : undefined} />
        <Row label="Teléfono" value={paciente.telefono} mono />
        <Row label="Otros números" value={paciente.otrosNumeros} mono />
      </Card>

      <Card icon={User2} title="Responsable">
        {paciente.responsable ? (
          <>
            <Row label="Nombre" value={paciente.responsable.nombre} />
            <Row label="Parentesco" value={paciente.responsable.parentesco} />
            <Row label="Documento" value={paciente.responsable.documento} mono />
            <Row label="Teléfono" value={paciente.responsable.telefono} mono />
            <Row label="Dirección" value={paciente.responsable.direccion} />
          </>
        ) : (
          <p className="text-xs text-slate-500 italic">Sin responsable registrado.</p>
        )}
      </Card>

      <Card icon={Stethoscope} title="Datos de ingreso">
        <Row label="Fecha y hora" value={formatFechaHora(paciente.fechaIngreso)} />
        <Row label="Servicio" value={paciente.servicioIngreso} />
        <Row label="Cama actual" value={paciente.camaActual} />
        <Row
          label="Circunstancia"
          value={paciente.circunstanciaIngreso ? CIRCUNSTANCIA_LABEL[paciente.circunstanciaIngreso] : undefined}
        />
        <Row label="Procedencia" value={paciente.establecimientoProcedencia} />
        <Row label="Médico" value={paciente.medicoIngresoNombre} />
        {paciente.diagnosticoIngreso && (
          <Row
            label="Diagnóstico"
            value={
              <span>
                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded mr-2">
                  {paciente.diagnosticoIngreso.codigo}
                </span>
                {paciente.diagnosticoIngreso.descripcion}
              </span>
            }
          />
        )}
      </Card>
    </div>
  );
}

// ─── Tab: Movimientos ───────────────────────────────────────────────────────

function TabMovimientos({ paciente }: { paciente: Paciente }) {
  const movimientos = paciente.movimientos ?? [];
  return (
    <Card icon={ArrowRightLeft} title="Ruta de movimientos">
      <div className="relative">
        {/* Línea vertical */}
        <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />

        {/* Ingreso */}
        <TimelineItem
          color="bg-emerald-500"
          fecha={paciente.fechaIngreso}
          titulo={`Ingreso a ${paciente.servicioIngreso}`}
          subtitulo={paciente.medicoIngresoNombre ? `Dr. ${paciente.medicoIngresoNombre}` : undefined}
        />

        {/* Movimientos intermedios */}
        {movimientos.map((m, idx) => (
          <TimelineItem
            key={idx}
            color="bg-blue-500"
            fecha={m.fecha}
            titulo={`${m.servicioOrigen} ${m.camaOrigen ? `(Cama ${m.camaOrigen}) ` : ""}→ ${m.servicioDestino} ${m.camaDestino ? `(Cama ${m.camaDestino})` : ""}`}
            subtitulo={[
              m.medicoMovimiento ? `Dr. ${m.medicoMovimiento}` : null,
              m.registradoPorNombre ? `Registrado por ${m.registradoPorNombre}` : null,
              m.trasladoId ? "Vía módulo Traslados" : null,
            ].filter(Boolean).join(" · ") || undefined}
          />
        ))}

        {/* Egreso */}
        {paciente.fechaEgreso && (
          <TimelineItem
            color={paciente.estado === "alta_fallecido" ? "bg-rose-500" : "bg-slate-500"}
            fecha={paciente.fechaEgreso}
            titulo={`Egreso: ${ESTADO_LABEL[paciente.estado]}`}
            subtitulo={paciente.medicoEgresoNombre ? `Dr. ${paciente.medicoEgresoNombre}` : undefined}
            ultimo
          />
        )}

        {paciente.estado === "activo" && (
          <p className="text-xs text-slate-400 italic mt-3 ml-8">
            Paciente actualmente hospitalizado · {diasEstancia(paciente.fechaIngreso)} días de estancia
          </p>
        )}
      </div>
    </Card>
  );
}

function TimelineItem({
  color, fecha, titulo, subtitulo, ultimo,
}: {
  color: string; fecha?: Date; titulo: string; subtitulo?: string; ultimo?: boolean;
}) {
  return (
    <div className={`relative pl-8 ${ultimo ? "" : "pb-4"}`}>
      <div className={`absolute left-2 top-1 w-2.5 h-2.5 rounded-full ring-4 ring-white dark:ring-slate-900 ${color}`} />
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{titulo}</p>
      <p className="text-xs text-slate-500 mt-0.5">{formatFechaHora(fecha)}</p>
      {subtitulo && <p className="text-xs text-slate-400 mt-0.5">{subtitulo}</p>}
    </div>
  );
}

// ─── Tab: Egreso ────────────────────────────────────────────────────────────

function TabEgreso({ paciente, pacienteId }: { paciente: Paciente; pacienteId: string }) {
  if (paciente.estado === "activo") {
    return (
      <Card icon={LogOutIcon} title="Egreso pendiente">
        <p className="text-sm text-slate-500 mb-4">
          El paciente sigue hospitalizado. Cuando reciba el alta, registra el egreso aquí.
        </p>
        <Link
          href={`/dashboard/pacientes/${paciente.id}/egreso`}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <LogOutIcon size={14} />
          Registrar egreso
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href={`/dashboard/pacientes/${pacienteId}/egreso`}
          className="flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          <Pencil size={14} /> Editar datos de egreso
        </Link>
      </div>
      <Card icon={LogOutIcon} title="Datos de egreso">
        <Row label="Condición de egreso" value={ESTADO_LABEL[paciente.estado]} />
        <Row label="Fecha y hora" value={formatFechaHora(paciente.fechaEgreso)} />
        <Row label="Días de estancia" value={paciente.diasEstancia !== undefined ? `${paciente.diasEstancia} días` : undefined} />
        <Row label="Médico responsable" value={paciente.medicoEgresoNombre} />
        <Row label="JVPM" value={paciente.medicoEgresoJvpm} mono />
        {paciente.diagnosticoEgreso && (
          <Row
            label="Diagnóstico principal"
            value={
              <span>
                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded mr-2">
                  {paciente.diagnosticoEgreso.codigo}
                </span>
                {paciente.diagnosticoEgreso.descripcion}
              </span>
            }
          />
        )}
        {paciente.diagnosticosComplementarios && paciente.diagnosticosComplementarios.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1.5">Diagnósticos complementarios</p>
            <ul className="space-y-1">
              {paciente.diagnosticosComplementarios.map((d, i) => (
                <li key={i} className="text-sm text-slate-700 dark:text-slate-300 flex gap-2">
                  <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{d.codigo}</span>
                  <span>{d.descripcion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {paciente.causaExterna && (
          <Row
            label="Causa externa"
            value={
              <span>
                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded mr-2">
                  {paciente.causaExterna.codigo}
                </span>
                {paciente.causaExterna.descripcion}
              </span>
            }
          />
        )}
        {paciente.procedimientos && paciente.procedimientos.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1.5">Procedimientos</p>
            <ul className="text-sm text-slate-700 dark:text-slate-300 list-disc pl-5 space-y-0.5">
              {paciente.procedimientos.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}
      </Card>

      {paciente.estado === "alta_fallecido" && (
        <CausasDefuncionEditor pacienteId={pacienteId} paciente={paciente} />
      )}
    </div>
  );
}

// ─── Causas de defunción (ESDOMED) ──────────────────────────────────────────

const emptyDx = (): DiagnosticoCIE => ({ codigo: "", descripcion: "" });

// Normaliza valores legacy: si Firestore devuelve un string en lugar de DiagnosticoCIE
const normDx = (v: unknown): DiagnosticoCIE => {
  if (!v) return emptyDx();
  if (typeof v === "string") return { codigo: "", descripcion: v };
  return v as DiagnosticoCIE;
};

function CausasDefuncionEditor({
  pacienteId,
  paciente,
}: {
  pacienteId: string;
  paciente: Paciente;
}) {
  const { profile } = useAuth();
  const puedeEditar = profile?.role === "esdomed" || profile?.role === "asistente_esdomed" || profile?.role === "admin";

  const snapshot = () => ({
    causaMuerteD: paciente.causaMuerteD ?? emptyDx(),
    causaMuerteC: paciente.causaMuerteC ?? emptyDx(),
    causaMuerteB: paciente.causaMuerteB ?? emptyDx(),
    causaMuerteA: paciente.causaMuerteA ?? emptyDx(),
    estadoI:  normDx(paciente.estadoPatologicoI),
    estadoII: normDx(paciente.estadoPatologicoII),
    causaExterna: paciente.causaExterna ?? emptyDx(),
  });

  const [editando,  setEditando]  = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [form,      setForm]      = useState(snapshot);
  const [sincronizadoCon, setSincronizadoCon] = useState({ paciente, editando });

  // ── Carga desde Certificado de Defunción (PDF, numeral 13) ──
  const fileRef = useRef<HTMLInputElement>(null);
  const [cargandoPdf, setCargandoPdf] = useState(false);
  const [pdfMsg, setPdfMsg] = useState<{ tipo: "ok" | "warn" | "error"; texto: string } | null>(null);

  const cargarCertificado = async (file: File) => {
    setPdfMsg(null);
    setCargandoPdf(true);
    try {
      const c = await parsearCertificadoDefuncion(file);
      const dxs = [c.causaMuerteA, c.causaMuerteB, c.causaMuerteC, c.causaMuerteD, c.estadoPatologicoI, c.estadoPatologicoII];
      const n = dxs.filter(Boolean).length;
      setForm((prev) => ({
        ...prev,
        ...(c.causaMuerteA && { causaMuerteA: c.causaMuerteA }),
        ...(c.causaMuerteB && { causaMuerteB: c.causaMuerteB }),
        ...(c.causaMuerteC && { causaMuerteC: c.causaMuerteC }),
        ...(c.causaMuerteD && { causaMuerteD: c.causaMuerteD }),
        ...(c.estadoPatologicoI && { estadoI: c.estadoPatologicoI }),
        ...(c.estadoPatologicoII && { estadoII: c.estadoPatologicoII }),
      }));
      setEditando(true);
      if (!c.esCertificado) {
        setPdfMsg({ tipo: "warn", texto: "El PDF no parece un Certificado de Defunción. Revisa los campos antes de guardar." });
      } else if (n === 0) {
        setPdfMsg({ tipo: "warn", texto: "No se detectaron causas en el numeral 13. Complétalas manualmente." });
      } else {
        setPdfMsg({ tipo: "ok", texto: `Se cargaron ${n} causa(s) del certificado. Revisa y guarda. (La causa externa se ingresa manual.)` });
      }
    } catch (e) {
      setPdfMsg({ tipo: "error", texto: `No se pudo leer el PDF: ${e instanceof Error ? e.message : "error"}` });
    } finally {
      setCargandoPdf(false);
    }
  };

  // Resincroniza el formulario con el documento del paciente cuando NO se está
  // editando (llega una actualización por onSnapshot o se cancela la edición).
  // Patrón "ajustar estado en render" recomendado por React, en lugar de un efecto.
  if (sincronizadoCon.paciente !== paciente || sincronizadoCon.editando !== editando) {
    setSincronizadoCon({ paciente, editando });
    if (!editando) setForm(snapshot());
  }

  const setDx = (
    k: "causaMuerteD" | "causaMuerteC" | "causaMuerteB" | "causaMuerteA" | "estadoI" | "estadoII" | "causaExterna",
    v: DiagnosticoCIE,
  ) => setForm((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await updateDoc(doc(db, "pacientes", pacienteId), {
        causaMuerteD: form.causaMuerteD.descripcion ? form.causaMuerteD : null,
        causaMuerteC: form.causaMuerteC.descripcion ? form.causaMuerteC : null,
        causaMuerteB: form.causaMuerteB.descripcion ? form.causaMuerteB : null,
        causaMuerteA: form.causaMuerteA.descripcion ? form.causaMuerteA : null,
        estadoPatologicoI:  form.estadoI.descripcion  ? form.estadoI  : null,
        estadoPatologicoII: form.estadoII.descripcion ? form.estadoII : null,
        causaExterna: form.causaExterna.descripcion ? form.causaExterna : null,
        actualizadoEn: Timestamp.now(),
      });
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    }
    setGuardando(false);
  };

  const hayDatos =
    !!(paciente.causaMuerteA?.descripcion || paciente.causaMuerteB?.descripcion ||
       paciente.causaMuerteC?.descripcion || paciente.causaMuerteD?.descripcion ||
       normDx(paciente.estadoPatologicoI).descripcion ||
       normDx(paciente.estadoPatologicoII).descripcion ||
       paciente.causaExterna?.descripcion);

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">
          <HeartPulse size={15} className="text-rose-400" />
          Causas de defunción
        </h3>
        {puedeEditar && (
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) cargarCertificado(f); e.target.value = ""; }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={cargandoPdf}
              className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
            >
              {cargandoPdf ? <Loader2 size={11} className="animate-spin" /> : <FileUp size={11} />}
              {cargandoPdf ? "Leyendo..." : "Cargar certificado (PDF)"}
            </button>
            {!editando && (
              <button
                onClick={() => setEditando(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-slate-300 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                <Pencil size={11} />
                {hayDatos ? "Editar" : "Registrar"}
              </button>
            )}
          </div>
        )}
      </div>

      {pdfMsg && (
        <div
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs mb-4 ${
            pdfMsg.tipo === "ok"
              ? "bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400"
              : pdfMsg.tipo === "warn"
                ? "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400"
                : "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400"
          }`}
        >
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">{pdfMsg.texto}</span>
          <button onClick={() => setPdfMsg(null)} className="flex-shrink-0 opacity-60 hover:opacity-100"><XIcon size={12} /></button>
        </div>
      )}

      {editando ? (
        <div className="space-y-4">
          {/* Parte I */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              Parte I — Cadena causal de defunción
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">D. Causa básica (subyacente)</label>
              <CIE10Combobox value={form.causaMuerteD} onChange={(v) => setDx("causaMuerteD", v)} placeholder="Enfermedad o estado que inició la cadena..." />
            </div>
            <CausalArrow />
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">C.</label>
              <CIE10Combobox value={form.causaMuerteC} onChange={(v) => setDx("causaMuerteC", v)} />
            </div>
            <CausalArrow />
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">B.</label>
              <CIE10Combobox value={form.causaMuerteB} onChange={(v) => setDx("causaMuerteB", v)} />
            </div>
            <CausalArrow />
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">A. Causa directa / inmediata</label>
              <CIE10Combobox value={form.causaMuerteA} onChange={(v) => setDx("causaMuerteA", v)} placeholder="Causa que produjo directamente la muerte..." />
            </div>
          </div>

          {/* Parte II */}
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              Parte II — Otros estados patológicos significativos
            </p>
            <p className="text-[11px] text-slate-400">
              Que contribuyeron a la muerte pero no relacionados con la enfermedad que la produjo.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Estado I</label>
              <CIE10Combobox value={form.estadoI} onChange={(v) => setDx("estadoI", v)} placeholder="Buscar estado patológico..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Estado II</label>
              <CIE10Combobox value={form.estadoII} onChange={(v) => setDx("estadoII", v)} placeholder="Buscar estado patológico..." />
            </div>
          </div>

          {/* Causa externa */}
          <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Causa externa</p>
            <CIE10Combobox value={form.causaExterna} onChange={(v) => setDx("causaExterna", v)} placeholder="Buscar causa externa..." />
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => { setEditando(false); setError(null); }}
              className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
            >
              <Save size={13} />
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      ) : hayDatos ? (
        <div className="space-y-4">
          {/* Parte I lectura */}
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
              Parte I — Cadena causal
            </p>
            <div className="space-y-1">
              {(
                [
                  { label: "D. Causa básica", dx: paciente.causaMuerteD },
                  { label: "C.",               dx: paciente.causaMuerteC },
                  { label: "B.",               dx: paciente.causaMuerteB },
                  { label: "A. Causa directa", dx: paciente.causaMuerteA },
                ] as { label: string; dx?: DiagnosticoCIE }[]
              )
                .filter((r) => r.dx?.descripcion)
                .map(({ label, dx }, i, arr) => (
                  <div key={label}>
                    <div className="flex gap-3 text-sm">
                      <span className="text-xs text-slate-500 font-medium w-28 flex-shrink-0 pt-0.5">{label}</span>
                      <span className="text-slate-800 dark:text-slate-200 flex-1 flex items-baseline gap-2 flex-wrap">
                        {dx?.codigo && (
                          <span className="font-mono text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded shrink-0">
                            {dx.codigo}
                          </span>
                        )}
                        {dx?.descripcion}
                      </span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="flex items-center gap-1 ml-28 mt-0.5 mb-0.5">
                        <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 ml-2" />
                        <span className="text-[10px] text-slate-400 ml-1">debida a ↑</span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>

          {(normDx(paciente.estadoPatologicoI).descripcion || normDx(paciente.estadoPatologicoII).descripcion) && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                Parte II — Otros estados patológicos
              </p>
              <div className="space-y-2">
                {normDx(paciente.estadoPatologicoI).descripcion && (() => {
                  const dx = normDx(paciente.estadoPatologicoI);
                  return (
                    <div className="flex gap-3 text-sm">
                      <span className="text-xs text-slate-500 font-medium w-28 flex-shrink-0 pt-0.5">Estado I</span>
                      <span className="text-slate-800 dark:text-slate-200 flex-1 flex items-baseline gap-2 flex-wrap">
                        {dx.codigo && (
                          <span className="font-mono text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded shrink-0">
                            {dx.codigo}
                          </span>
                        )}
                        {dx.descripcion}
                      </span>
                    </div>
                  );
                })()}
                {normDx(paciente.estadoPatologicoII).descripcion && (() => {
                  const dx = normDx(paciente.estadoPatologicoII);
                  return (
                    <div className="flex gap-3 text-sm">
                      <span className="text-xs text-slate-500 font-medium w-28 flex-shrink-0 pt-0.5">Estado II</span>
                      <span className="text-slate-800 dark:text-slate-200 flex-1 flex items-baseline gap-2 flex-wrap">
                        {dx.codigo && (
                          <span className="font-mono text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded shrink-0">
                            {dx.codigo}
                          </span>
                        )}
                        {dx.descripcion}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {paciente.causaExterna?.descripcion && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                Causa externa
              </p>
              <div className="flex items-baseline gap-2 text-sm flex-wrap">
                {paciente.causaExterna.codigo && (
                  <span className="font-mono text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded shrink-0">
                    {paciente.causaExterna.codigo}
                  </span>
                )}
                <span className="text-slate-800 dark:text-slate-200">{paciente.causaExterna.descripcion}</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">
          {puedeEditar
            ? 'Sin causas de defunción registradas. Pulsa "Registrar" para completarlas.'
            : "Sin causas de defunción registradas."}
        </p>
      )}
    </section>
  );
}

function CausalArrow() {
  return (
    <div className="flex items-center gap-1.5 ml-2 my-0.5">
      <div className="flex flex-col items-center text-slate-300 dark:text-slate-600">
        <div className="w-px h-2 bg-current" />
        <span className="text-[9px] leading-none">▲</span>
      </div>
      <span className="text-[10px] text-slate-400">debida a</span>
    </div>
  );
}

// ─── Card y Row reusables ───────────────────────────────────────────────────

function Card({
  icon: Icon, title, children,
}: {
  icon: typeof IdCard; title: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 font-heading">
        <Icon size={15} className="text-slate-400" />
        {title}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Row({
  label, value, mono,
}: {
  label: string; value?: React.ReactNode; mono?: boolean;
}) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-slate-500 text-xs pt-0.5 font-medium w-32 flex-shrink-0">{label}</span>
      <span className={`text-slate-800 dark:text-slate-200 flex-1 min-w-0 break-words ${mono ? "font-mono text-xs" : ""}`}>
        {value || <span className="text-slate-400 italic text-xs">—</span>}
      </span>
    </div>
  );
}
