"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, addDoc, doc, getDoc, Timestamp, serverTimestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { DateField } from "@/components/ui/DateField";
import { BuscadorIngresoPorExpediente } from "@/components/pacientes/BuscadorIngresoPorExpediente";
import { CIE10Combobox } from "@/components/ui/CIE10Combobox";
import {
  calcularEdad, toDate, ESTADO_LABEL as ESTADO_PACIENTE_LABEL, ESTADO_BADGE as ESTADO_PACIENTE_BADGE,
} from "@/lib/pacientes/helpers";
import {
  TIPOS_CASO, TIPO_CASO_LABEL, TIPO_CASO_AYUDA, esMenorDeEdad,
  INSTANCIAS, INSTANCIA_LABEL, INSTANCIA_CHIP, NOTA_MIN_SIN_CIE, NOTA_MAX,
  causaExternaCoincide, CAUSA_EXTERNA_AVISO, validarFechaHecho, validarFechaAviso,
  duplicadosDeExpediente, AVISO_RECIBIDO_POR_MIN, AVISO_LUGAR_MIN,
} from "@/lib/conapinaFgr";
import {
  ShieldAlert, X, CheckCircle2, AlertCircle, AlertTriangle, BedDouble, Car, HeartCrack,
  ChevronLeft, ArrowLeft, ArrowRight, Info, CalendarDays, Copy, MapPin, UserCheck,
  Baby, Scale, StickyNote, ClipboardCheck,
} from "lucide-react";
import type {
  Paciente, DiagnosticoCIE, TipoCasoConapinaFgr, NotificacionConapinaFgr, InstanciaAviso,
} from "@/types";

const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 transition";

const SIN_DIAGNOSTICO: DiagnosticoCIE = { codigo: "", descripcion: "" };
const ICONO_CASO = { violencia: ShieldAlert, accidente_transito: Car, intento_suicida: HeartCrack } as const;

// Cada instancia con su propio icono: compartían uno solo (Landmark) y no se
// distinguían de un vistazo. CONAPINA protege a la primera infancia, niñez y
// adolescencia; la FGR es la vía penal. "Ambos" muestra los dos iconos juntos,
// que es literalmente lo que significa.
const ICONO_INSTANCIA: Record<InstanciaAviso, React.ElementType | null> = {
  conapina: Baby,
  fiscalia: Scale,
  ambos: null,
};

const INSTANCIA_AYUDA: Record<InstanciaAviso, string> = {
  conapina: "Consejo Nacional de la Primera Infancia, Niñez y Adolescencia. Corresponde si el paciente es menor de edad.",
  fiscalia: "Fiscalía General de la República.",
  ambos: "Se dio el aviso a las dos instancias.",
};

const PASOS = [
  { n: 1, l: "Expediente" },
  { n: 2, l: "El caso" },
  { n: 3, l: "El aviso" },
  { n: 4, l: "Confirmar" },
];

const hoyISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const formatDia = (ts: unknown) => {
  if (!ts) return "—";
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
};

export default function NuevaNotificacionConapinaFgrPage() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Notificaciones propias, solo para detectar duplicados sin lecturas extra.
  const [notificaciones, setNotificaciones] = useState<NotificacionConapinaFgr[]>([]);

  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [tipoCaso, setTipoCaso] = useState<TipoCasoConapinaFgr | "">("");
  const [fechaHecho, setFechaHecho] = useState("");
  const [diagnostico, setDiagnostico] = useState<DiagnosticoCIE>(SIN_DIAGNOSTICO);
  const [causaExterna, setCausaExterna] = useState<DiagnosticoCIE>(SIN_DIAGNOSTICO);
  const [nota, setNota] = useState("");

  const [avisoInstancia, setAvisoInstancia] = useState<InstanciaAviso | "">("");
  const [avisoFecha, setAvisoFecha] = useState(hoyISO());
  const [avisoRecibidoPor, setAvisoRecibidoPor] = useState("");
  const [avisoLugar, setAvisoLugar] = useState("");
  const [avisoObservacion, setAvisoObservacion] = useState("");

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "notificaciones_conapina_fgr"), where("medicoId", "==", user.uid));
    return onSnapshot(q, s => setNotificaciones(s.docs.map(d => ({ id: d.id, ...d.data() } as NotificacionConapinaFgr))));
  }, [user]);

  const fechaNacimiento = paciente ? toDate(paciente.fechaNacimiento) ?? null : null;
  const edad = calcularEdad(fechaNacimiento);

  // El diagnóstico que ya trae el expediente se OFRECE, nunca se rellena solo.
  const sugerencia = paciente?.ultimoDiagnostico?.codigo
    ? paciente.ultimoDiagnostico
    : paciente?.diagnosticoIngreso?.codigo
      ? paciente.diagnosticoIngreso
      : null;
  const sugerenciaCausa = paciente?.causaExterna?.codigo ? paciente.causaExterna : null;

  const duplicados = paciente ? duplicadosDeExpediente(notificaciones, paciente.expediente) : [];
  const duplicadosMismoIngreso = paciente?.id ? duplicados.filter(d => d.pacienteId === paciente.id) : [];

  const notaLimpia = nota.trim();
  const errorFechaHecho = validarFechaHecho(fechaHecho, fechaNacimiento);
  const errorNota =
    notaLimpia.length > NOTA_MAX
      ? `La nota no puede pasar de ${NOTA_MAX} caracteres.`
      : !diagnostico.codigo && notaLimpia.length > 0 && notaLimpia.length < NOTA_MIN_SIN_CIE
        ? `Sin código CIE-10 la nota es el único dato clínico: describa el caso con al menos ${NOTA_MIN_SIN_CIE} caracteres.`
        : null;
  const hayDiagnostico = !!diagnostico.codigo || notaLimpia.length >= NOTA_MIN_SIN_CIE;
  const avisoCausaExterna =
    tipoCaso && causaExterna.codigo && !causaExternaCoincide(tipoCaso, causaExterna.codigo)
      ? CAUSA_EXTERNA_AVISO[tipoCaso]
      : null;

  const clasificacionLista = !!tipoCaso && !!fechaHecho && !errorFechaHecho && hayDiagnostico && !errorNota;

  const fechaHechoDate = fechaHecho ? new Date(fechaHecho + "T00:00:00") : null;
  const errorFechaAviso = validarFechaAviso(avisoFecha, fechaHechoDate);
  const avisoListo =
    !!avisoInstancia && !!avisoFecha && !errorFechaAviso
    && avisoRecibidoPor.trim().length >= AVISO_RECIBIDO_POR_MIN
    && avisoLugar.trim().length >= AVISO_LUGAR_MIN;

  const puedeAvanzar = () => {
    if (step === 1) return !!paciente;
    if (step === 2) return clasificacionLista;
    if (step === 3) return avisoListo;
    return !!paciente && clasificacionLista && avisoListo;
  };

  const siguiente = () => { if (puedeAvanzar()) setStep(s => Math.min(4, s + 1)); };
  const anterior = () => setStep(s => Math.max(1, s - 1));

  const enviar = async () => {
    if (!user || !profile || !paciente || !tipoCaso || !avisoInstancia || !puedeAvanzar()) return;
    setSaving(true);
    let servicio = paciente.servicioActual || paciente.servicioIngreso || "";
    let cama = paciente.camaActual ?? "";
    // Condición del paciente para el acta: no se le pregunta al médico, se toma
    // del expediente y queda congelada.
    let condicion: "vivo" | "fallecido" = paciente.estado === "alta_fallecido" ? "fallecido" : "vivo";
    try {
      // Relectura del expediente (1 lectura) para que la ubicación y la condición
      // queden al día. NO bloquea si el paciente egresó: notificar en diferido es
      // un caso normal y el buscador lo ofrece a propósito.
      if (paciente.id) {
        const snap = await getDoc(doc(db, "pacientes", paciente.id));
        const data = snap.data() as Paciente | undefined;
        if (data) {
          servicio = data.servicioActual || data.servicioIngreso || servicio;
          cama = data.camaActual ?? "";
          condicion = data.estado === "alta_fallecido" ? "fallecido" : "vivo";
        }
      }

      await addDoc(collection(db, "notificaciones_conapina_fgr"), {
        medicoId: user.uid,
        medicoNombre: profile.nombre,
        medicoServicio: profile.servicios?.join(" / ") || profile.servicio || "",
        medicoJvpm: profile.jvpm || "",
        pacienteId: paciente.id ?? null,
        pacienteNombre: `${paciente.apellidos}, ${paciente.nombres}`,
        pacienteExpediente: paciente.expediente,
        pacienteEdad: edad,
        servicio,
        cama,
        tipoCaso,
        fechaHecho: Timestamp.fromDate(new Date(fechaHecho + "T00:00:00")),
        diagnostico: diagnostico.codigo ? diagnostico : null,
        causaExterna: causaExterna.codigo ? causaExterna : null,
        nota: notaLimpia || null,
        // El aviso externo que el médico ya dio. Son las columnas del registro
        // que audita el MINSAL; quien lo recibió es la persona de la instancia.
        avisoInstancia,
        avisoFecha: Timestamp.fromDate(new Date(avisoFecha + "T00:00:00")),
        avisoRecibidoPor: avisoRecibidoPor.trim(),
        avisoLugar: avisoLugar.trim(),
        avisoObservacion: avisoObservacion.trim() || null,
        condicionPaciente: condicion,
        estado: "pendiente",
        // serverTimestamp: las reglas exigen creadoEn == request.time para que
        // nadie pueda antedatar una notificación.
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });
      setModal({ type: "success", message: `${paciente.apellidos}, ${paciente.nombres} · Exp. ${paciente.expediente}` });
    } catch (err) {
      setModal({ type: "error", message: err instanceof Error ? err.message : "No se pudo enviar la notificación." });
    } finally {
      setSaving(false);
    }
  };

  const IconoTipo = tipoCaso ? ICONO_CASO[tipoCaso] : null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Encabezado con el recorrido: se ve dónde está y cuánto falta. */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#4a3312] via-amber-700 to-orange-600 px-5 py-5 shadow-lg shadow-amber-950/20 md:px-7 md:py-6">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <div className="absolute bottom-[-5.5rem] right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
                <ShieldAlert size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white md:text-2xl font-heading">Nueva notificación CONAPINA / FGR</h1>
                <p className="mt-1 max-w-xl text-sm text-amber-50/90">
                  Deje constancia del aviso que ya dio. Al final podrá revisarlo todo antes de enviarlo.
                </p>
              </div>
            </div>
            <button onClick={() => router.push("/medico/conapina-fgr")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/25 transition-colors hover:bg-white/20">
              <ChevronLeft size={16} /> Volver
            </button>
          </div>

          <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PASOS.map(({ n, l }) => (
              <li key={n} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors ${
                n === step ? "bg-white/20 text-white ring-1 ring-white/25" : n < step ? "bg-white/10 text-amber-50" : "text-amber-100/75"
              }`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  n < step ? "bg-emerald-400 text-emerald-950" : n === step ? "bg-white text-amber-900" : "bg-white/15 text-white"
                }`}>
                  {n < step ? <CheckCircle2 size={14} /> : n}
                </span>
                <span className="text-xs font-semibold">{l}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 md:p-8">

        {/* Paso 1: el ingreso */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100 font-heading md:text-2xl">
                ¿De qué paciente se trata?
              </h2>
              <p className="text-sm text-slate-500">
                Busque por número de expediente. Sirve también si el paciente ya egresó.
              </p>
            </div>

            {!paciente ? (
              <BuscadorIngresoPorExpediente value={paciente} onSelect={setPaciente} />
            ) : (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-blue-50/80 to-white p-4 dark:border-cyan-800 dark:from-cyan-950/40 dark:via-blue-950/20 dark:to-slate-900">
                  <div className="absolute bottom-0 left-0 top-0 w-1 bg-gradient-to-b from-cyan-500 to-blue-600" />
                  <div className="flex items-start gap-3 pl-1">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm shadow-cyan-600/30"><CheckCircle2 size={19} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300">Ingreso seleccionado</p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{paciente.apellidos}, {paciente.nombres}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <p className="font-mono text-xs font-medium text-slate-600 dark:text-slate-300">Exp. {paciente.expediente}</p>
                        {edad !== null && <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{edad} años</p>}
                        {esMenorDeEdad(edad) && (
                          <span className="rounded border border-violet-200 bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-800 dark:bg-violet-900/50 dark:text-violet-300">
                            Menor de edad
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <CalendarDays size={13} className="shrink-0 text-slate-400" />
                          Ingresó el {formatDia(paciente.fechaIngreso)}
                          {paciente.fechaEgreso ? ` · egresó el ${formatDia(paciente.fechaEgreso)}` : ""}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${ESTADO_PACIENTE_BADGE[paciente.estado] ?? ""}`}>
                          {ESTADO_PACIENTE_LABEL[paciente.estado] ?? paciente.estado}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-sm">
                        <BedDouble size={13} className="shrink-0 text-slate-400" />
                        <span className="text-slate-700 dark:text-slate-300">
                          <span className="font-medium">{paciente.servicioActual || paciente.servicioIngreso || "—"}</span>
                          {paciente.camaActual
                            ? <> — Cama <span className="font-medium">{paciente.camaActual}</span></>
                            : paciente.estado === "activo"
                              // En un ingreso cerrado no tener cama es lo normal.
                              ? <span className="text-amber-600 dark:text-amber-400"> — sin cama asignada</span>
                              : null}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {paciente.estado !== "activo" && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
                    <Info size={15} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                    <p className="text-xs leading-5 text-blue-800 dark:text-blue-200">
                      <strong className="font-semibold">Notificación diferida.</strong> Este ingreso ya cerró
                      ({(ESTADO_PACIENTE_LABEL[paciente.estado] ?? paciente.estado).toLowerCase()}), pero el caso se
                      notifica igual. Use la fecha real del hecho y la fecha real en que dio el aviso.
                    </p>
                  </div>
                )}

                {edad === null && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">
                      El expediente no tiene fecha de nacimiento, así que el comité no podrá ver si el paciente es menor
                      de edad. Puede notificar igual, pero conviene completar el dato en el expediente.
                    </p>
                  </div>
                )}

                {duplicados.length > 0 && (
                  <div className={`flex items-start gap-2.5 rounded-xl border p-3 ${
                    duplicadosMismoIngreso.length > 0
                      ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
                      : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50"
                  }`}>
                    {duplicadosMismoIngreso.length > 0
                      ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      : <Info size={15} className="mt-0.5 shrink-0 text-slate-400" />}
                    <div className={`min-w-0 text-xs leading-5 ${
                      duplicadosMismoIngreso.length > 0 ? "text-amber-800 dark:text-amber-200" : "text-slate-600 dark:text-slate-400"
                    }`}>
                      <p className="font-semibold">
                        {duplicadosMismoIngreso.length > 0
                          ? `Ya notificó este mismo ingreso ${duplicadosMismoIngreso.length > 1 ? `${duplicadosMismoIngreso.length} veces` : "antes"}.`
                          : "Este expediente ya tiene notificaciones suyas, de otro ingreso."}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {duplicados.slice(0, 3).map(d => (
                          <li key={d.id}>
                            · {TIPO_CASO_LABEL[d.tipoCaso]} — {d.fechaHecho ? `hecho del ${formatDia(d.fechaHecho)}` : "sin fecha del hecho"}
                            {" "}(enviada {formatDia(d.creadoEn)})
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <button type="button" onClick={() => setPaciente(null)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 transition-colors hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-100">
                  <ArrowLeft size={13} /> Buscar otro expediente
                </button>
              </div>
            )}
          </div>
        )}

        {/* Paso 2: el caso */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100 font-heading md:text-2xl">
                ¿Qué le ocurrió al paciente?
              </h2>
              <p className="text-sm text-slate-500">
                Elija el motivo y la fecha del hecho. Describa el diagnóstico con un código CIE-10 o en la nota.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TIPOS_CASO.map(t => {
                const Icono = ICONO_CASO[t];
                const activo = tipoCaso === t;
                return (
                  <button key={t} type="button" onClick={() => setTipoCaso(t)}
                    className={`group relative flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                      activo
                        ? "border-amber-300 bg-amber-50 text-amber-900 shadow-sm shadow-amber-950/5 dark:border-amber-700 dark:bg-amber-950/35 dark:text-amber-100"
                        : "border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-amber-800"
                    }`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      activo ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-amber-100 group-hover:text-amber-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-amber-950"
                    }`}>
                      <Icono size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{TIPO_CASO_LABEL[t]}</span>
                      <span className="mt-0.5 block text-xs leading-4 text-slate-500 dark:text-slate-400">{TIPO_CASO_AYUDA[t]}</span>
                    </span>
                    {activo && <CheckCircle2 size={16} className="ml-auto shrink-0 text-amber-600 dark:text-amber-300" />}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/35">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Fecha del hecho <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <CalendarDays size={15} className="shrink-0 text-slate-400" />
                  <DateField value={fechaHecho} onChange={setFechaHecho} clearable
                    placeholder="Fecha del hecho" ariaLabel="Fecha del hecho" maxDate={new Date()} />
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  Cuándo ocurrió el hecho, no cuándo se notifica. Si no se conoce con exactitud, use la fecha aproximada o la de detección.
                </p>
                {errorFechaHecho && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" /> {errorFechaHecho}
                  </p>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Diagnóstico clínico (CIE-10)</label>
                <CIE10Combobox value={diagnostico} onChange={setDiagnostico}
                  placeholder="Buscar diagnóstico o código CIE-10..." />
                {sugerencia && !diagnostico.codigo && (
                  <button type="button" onClick={() => setDiagnostico(sugerencia)}
                    className="mt-2 flex items-start gap-1.5 text-left text-xs text-slate-500 transition-colors hover:text-amber-700 dark:hover:text-amber-400">
                    <Copy size={12} className="mt-0.5 shrink-0 text-slate-400" />
                    <span>
                      Usar el del expediente:{" "}
                      <span className="font-mono font-semibold">{sugerencia.codigo}</span> — {sugerencia.descripcion}
                    </span>
                  </button>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Causa externa (CIE-10) <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <CIE10Combobox value={causaExterna} onChange={setCausaExterna}
                  placeholder="Código del hecho: V01–V99 tránsito, X85–Y09 agresiones..." />
                <p className="mt-1.5 text-xs text-slate-400">
                  El diagnóstico suele ser la lesión (fractura, trauma); este campo guarda el hecho que la causó.
                </p>
                {sugerenciaCausa && !causaExterna.codigo && (
                  <button type="button" onClick={() => setCausaExterna(sugerenciaCausa)}
                    className="mt-2 flex items-start gap-1.5 text-left text-xs text-slate-500 transition-colors hover:text-amber-700 dark:hover:text-amber-400">
                    <Copy size={12} className="mt-0.5 shrink-0 text-slate-400" />
                    <span>
                      Usar la del expediente:{" "}
                      <span className="font-mono font-semibold">{sugerenciaCausa.codigo}</span> — {sugerenciaCausa.descripcion}
                    </span>
                  </button>
                )}
                {avisoCausaExterna && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    {avisoCausaExterna} Revise que el código sea el correcto — puede enviarlo de todos modos.
                  </p>
                )}
              </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <label className="text-xs font-medium text-slate-500">
                    Nota <span className="font-normal text-slate-400">(si no encuentra el código exacto)</span>
                  </label>
                  <span className={`text-[11px] tabular-nums ${notaLimpia.length > NOTA_MAX ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-400"}`}>
                    {notaLimpia.length}/{NOTA_MAX}
                  </span>
                </div>
                <textarea value={nota} onChange={e => setNota(e.target.value)} rows={4} maxLength={NOTA_MAX + 200}
                  className={`${inputCls} resize-none`}
                  placeholder="Describa el hecho o el diagnóstico que no aparece en el catálogo CIE-10..." />
                {errorNota && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" /> {errorNota}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Paso 3: el aviso ya dado */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100 font-heading md:text-2xl">
                ¿A quién le dio el aviso?
              </h2>
              <p className="text-sm text-slate-500">
                Este portal no avisa a la instancia: aquí queda la constancia del aviso que usted ya dio. Es lo que
                audita el MINSAL.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {INSTANCIAS.map(i => {
                const Icono = ICONO_INSTANCIA[i];
                const activo = avisoInstancia === i;
                return (
                  <button key={i} type="button" onClick={() => setAvisoInstancia(i)}
                    className={`group relative flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                      activo
                        ? "border-amber-300 bg-amber-50 text-amber-900 shadow-sm shadow-amber-950/5 dark:border-amber-700 dark:bg-amber-950/35 dark:text-amber-100"
                        : "border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-amber-800"
                    }`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      activo ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-amber-100 group-hover:text-amber-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-amber-950"
                    }`}>
                      {Icono ? <Icono size={18} /> : (
                        // "Ambos" = las dos instancias, y así se dibuja.
                        <span className="flex items-center gap-px"><Baby size={13} /><Scale size={13} /></span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{INSTANCIA_LABEL[i]}</span>
                      <span className="mt-0.5 block text-xs leading-4 text-slate-500 dark:text-slate-400">{INSTANCIA_AYUDA[i]}</span>
                    </span>
                    {activo && <CheckCircle2 size={16} className="ml-auto shrink-0 text-amber-600 dark:text-amber-300" />}
                  </button>
                );
              })}
            </div>

            {esMenorDeEdad(edad) && avisoInstancia === "fiscalia" && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                El paciente es menor de edad: el caso también corresponde a CONAPINA. Si avisó a las dos, marque
                &quot;Ambos&quot;.
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/35">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Fecha del aviso <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <CalendarDays size={15} className="shrink-0 text-slate-400" />
                    <DateField value={avisoFecha} onChange={setAvisoFecha}
                      placeholder="Fecha del aviso" ariaLabel="Fecha del aviso" maxDate={new Date()} />
                  </div>
                  {errorFechaAviso && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" /> {errorFechaAviso}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Persona que recibió el aviso <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <UserCheck size={15} className="shrink-0 text-slate-400" />
                    <input type="text" value={avisoRecibidoPor} onChange={e => setAvisoRecibidoPor(e.target.value)}
                      placeholder="Nombre de quien lo recibió" className={inputCls} />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    La persona de CONAPINA o la Fiscalía que atendió el aviso, no personal de este hospital.
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Lugar / sede <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="shrink-0 text-slate-400" />
                  <input type="text" value={avisoLugar} onChange={e => setAvisoLugar(e.target.value)}
                    placeholder="Sede u oficina donde se dio el aviso" className={inputCls} />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Observación <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <textarea value={avisoObservacion} onChange={e => setAvisoObservacion(e.target.value)} rows={2}
                  className={`${inputCls} resize-none`}
                  placeholder="Número de acta, referencia o cualquier detalle del aviso..." />
              </div>
            </div>
          </div>
        )}

        {/* Paso 4: revisar y enviar */}
        {step === 4 && paciente && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100 font-heading md:text-2xl">
                Revise antes de enviar
              </h2>
              <p className="text-sm text-slate-500">
                Una vez enviada, el contenido no se puede editar: solo anularla mientras el comité no la haya recibido.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="border-b border-amber-200/70 px-4 py-3 dark:border-amber-900/50">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800 dark:text-amber-300">Paciente</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{paciente.apellidos}, {paciente.nombres}</p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-mono">Exp. {paciente.expediente}</span>
                  {edad !== null ? ` · ${edad} años` : ""}
                  {` · ${ESTADO_PACIENTE_LABEL[paciente.estado] ?? paciente.estado}`}
                  {paciente.estado !== "activo" ? " · notificación diferida" : ""}
                </p>
              </div>

              <div className="grid md:grid-cols-2 md:divide-x md:divide-amber-200/70 md:dark:divide-amber-900/50">
              <div className="space-y-2 border-b border-amber-200/70 px-4 py-3 dark:border-amber-900/50 md:border-b-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800 dark:text-amber-300">El caso</p>
                <Dato label="Motivo" valor={
                  <span className="flex items-center gap-1.5">
                    {IconoTipo && <IconoTipo size={13} className="text-amber-700 dark:text-amber-400" />}
                    {tipoCaso ? TIPO_CASO_LABEL[tipoCaso] : "—"}
                  </span>
                } />
                <Dato label="Fecha del hecho" valor={fechaHecho ? formatDia(new Date(fechaHecho + "T00:00:00")) : "—"} />
                <Dato label="Diagnóstico" valor={diagnostico.codigo ? `${diagnostico.codigo} · ${diagnostico.descripcion}` : "Sin código CIE-10"} />
                {causaExterna.codigo && <Dato label="Causa externa" valor={`${causaExterna.codigo} · ${causaExterna.descripcion}`} />}
                {notaLimpia && (
                  <Dato label="Nota" valor={
                    <span className="flex items-start gap-1.5">
                      <StickyNote size={12} className="mt-0.5 shrink-0 text-slate-400" />
                      <span className="whitespace-pre-wrap italic">{notaLimpia}</span>
                    </span>
                  } />
                )}
              </div>

              <div className="space-y-2 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800 dark:text-amber-300">El aviso que usted dio</p>
                <Dato label="Instancia" valor={avisoInstancia ? (
                  <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${INSTANCIA_CHIP[avisoInstancia]}`}>
                    {avisoInstancia === "ambos"
                      ? <span className="flex items-center gap-px"><Baby size={10} /><Scale size={10} /></span>
                      : avisoInstancia === "conapina" ? <Baby size={10} /> : <Scale size={10} />}
                    {INSTANCIA_LABEL[avisoInstancia]}
                  </span>
                ) : "—"} />
                <Dato label="Fecha" valor={avisoFecha ? formatDia(new Date(avisoFecha + "T00:00:00")) : "—"} />
                <Dato label="Recibió" valor={avisoRecibidoPor.trim() || "—"} />
                <Dato label="Lugar / sede" valor={avisoLugar.trim() || "—"} />
                {avisoObservacion.trim() && <Dato label="Observación" valor={avisoObservacion.trim()} />}
              </div>
              </div>
            </div>

            <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-500">
              <Info size={13} className="mt-0.5 shrink-0 text-cyan-600 dark:text-cyan-300" />
              Al enviar, el caso queda en la bandeja del Comité de Lesiones Intencionales, que lo recibirá y lo llevará
              al registro auditado.
            </p>
          </div>
        )}

        {/* Navegación */}
        <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6 dark:border-slate-800">
          <button type="button" onClick={anterior} disabled={step === 1 || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-0 dark:text-slate-300 dark:hover:text-white">
            <ArrowLeft size={16} /> Anterior
          </button>

          {step < 4 ? (
            <button type="button" onClick={siguiente} disabled={!puedeAvanzar()}
              className="flex items-center gap-2 rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-amber-700/20 transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-500 dark:disabled:bg-amber-900">
              Siguiente <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={enviar} disabled={!puedeAvanzar() || saving}
              className="flex items-center gap-2 rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-amber-700/25 transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-500 dark:disabled:bg-amber-900">
              <ClipboardCheck size={16} /> {saving ? "Enviando..." : "Enviar notificación"}
            </button>
          )}
        </div>
      </div>

      {/* Resultado */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            {modal.type === "success" ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10">
                  <CheckCircle2 size={28} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900 dark:text-slate-100">Notificación enviada</p>
                  <p className="mt-1 text-sm text-slate-500">{modal.message}</p>
                </div>
                <button onClick={() => router.replace("/medico/conapina-fgr")}
                  className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-500">
                  Ver mis notificaciones
                </button>
              </>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10">
                  <AlertCircle size={28} className="text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900 dark:text-slate-100">No se pudo enviar</p>
                  <p className="mt-1 text-sm text-slate-500">{modal.message}</p>
                </div>
                <button onClick={() => setModal(null)}
                  className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500">
                  Volver al formulario
                </button>
              </>
            )}
            {modal.type === "error" && (
              <button onClick={() => setModal(null)}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 pt-px text-xs font-medium text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-200">{valor}</span>
    </div>
  );
}
