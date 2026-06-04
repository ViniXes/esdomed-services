"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Save, AlertTriangle, Plus, Trash2, FileUp, Loader2, X as XIcon } from "lucide-react";
import { CIE10Combobox } from "@/components/ui/CIE10Combobox";
import type { DiagnosticoCIE, EstadoPaciente, Paciente } from "@/types";
import { parsearFormularioEgreso } from "@/lib/pacientes/pdfParser";
import {
  ESTADO_LABEL, diasEstancia, nombreCompleto, toDate,
} from "@/lib/pacientes/helpers";

const ESTADOS_EGRESO: EstadoPaciente[] = [
  "alta_vivo", "alta_fallecido", "alta_voluntaria", "fuga", "in_extremis", "referido",
];

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm";

const labelCls = "block text-xs font-medium text-slate-500 mb-1.5";

export default function EgresoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();

  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [condicion, setCondicion] = useState<EstadoPaciente>("alta_vivo");
  const [fechaHora, setFechaHora] = useState(() => toDatetimeLocalInput(new Date()));
  const [dxCodigo, setDxCodigo] = useState("");
  const [dxDescripcion, setDxDescripcion] = useState("");
  const [complementarios, setComplementarios] = useState<DiagnosticoCIE[]>([]);
  const [causaExtCodigo, setCausaExtCodigo] = useState("");
  const [causaExtDescripcion, setCausaExtDescripcion] = useState("");
  const [procedimientos, setProcedimientos] = useState<string[]>([]);
  const [medicoNombre, setMedicoNombre] = useState("");
  const [medicoJvpm, setMedicoJvpm] = useState("");

  // Carga desde el Formulario de Ingreso y Egreso (PDF)
  const fileRef = useRef<HTMLInputElement>(null);
  const [cargandoPdf, setCargandoPdf] = useState(false);
  const [pdfMsg, setPdfMsg] = useState<{ tipo: "ok" | "warn" | "error"; texto: string } | null>(null);

  const cargarFormulario = async (file: File) => {
    setPdfMsg(null);
    setCargandoPdf(true);
    try {
      const r = await parsearFormularioEgreso(file);
      let n = 0;
      if (r.diagnosticoEgreso) {
        setDxCodigo(r.diagnosticoEgreso.codigo);
        setDxDescripcion(r.diagnosticoEgreso.descripcion);
        n++;
      }
      if (r.diagnosticosComplementarios.length) {
        setComplementarios(r.diagnosticosComplementarios);
        n += r.diagnosticosComplementarios.length;
      }
      if (r.causaExterna) {
        setCausaExtCodigo(r.causaExterna.codigo);
        setCausaExtDescripcion(r.causaExterna.descripcion);
      }
      if (r.medicoEgresoNombre) setMedicoNombre(r.medicoEgresoNombre);
      if (r.medicoEgresoJvpm) setMedicoJvpm(r.medicoEgresoJvpm);

      const extras = [
        r.causaExterna ? "la causa externa" : null,
        r.medicoEgresoNombre ? "el médico responsable" : null,
      ].filter(Boolean).join(" y ");

      if (!r.esFormularioEgreso) {
        setPdfMsg({ tipo: "warn", texto: "El PDF no parece un Formulario de Ingreso y Egreso. Revisa los campos antes de guardar." });
      } else if (n === 0 && !r.causaExterna && !r.medicoEgresoNombre) {
        // Útil para afinar las regex contra las etiquetas reales de la hoja.
        console.warn("[egreso] No se detectaron datos de egreso. Texto crudo del PDF:\n", r.textoCrudo);
        setPdfMsg({ tipo: "warn", texto: "No se detectaron datos de egreso en el formulario (revisa la consola del navegador). Complétalos manualmente." });
      } else {
        setPdfMsg({
          tipo: "ok",
          texto: `Se cargaron ${n} diagnóstico(s)${extras ? ` y ${extras}` : ""}. Revisa que coincidan con la hoja antes de guardar.`,
        });
      }
    } catch (e) {
      setPdfMsg({ tipo: "error", texto: `No se pudo leer el PDF: ${e instanceof Error ? e.message : "error"}` });
    } finally {
      setCargandoPdf(false);
    }
  };

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const snap = await getDoc(doc(db, "pacientes", id));
      if (cancelado) return;
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
      } as Paciente);

      // Modo edición: el paciente ya está egresado → precargar sus datos de egreso.
      if (data.estado !== "activo") {
        setCondicion(data.estado as EstadoPaciente);
        const fe = toDate(data.fechaEgreso);
        if (fe) setFechaHora(toDatetimeLocalInput(fe));
        if (data.diagnosticoEgreso) {
          setDxCodigo(data.diagnosticoEgreso.codigo ?? "");
          setDxDescripcion(data.diagnosticoEgreso.descripcion ?? "");
        }
        if (Array.isArray(data.diagnosticosComplementarios)) {
          setComplementarios(
            (data.diagnosticosComplementarios as DiagnosticoCIE[]).map((d) => ({
              codigo: d.codigo ?? "", descripcion: d.descripcion ?? "",
            })),
          );
        }
        if (data.causaExterna) {
          setCausaExtCodigo(data.causaExterna.codigo ?? "");
          setCausaExtDescripcion(data.causaExterna.descripcion ?? "");
        }
        if (Array.isArray(data.procedimientos)) setProcedimientos(data.procedimientos as string[]);
        if (data.medicoEgresoNombre) setMedicoNombre(data.medicoEgresoNombre);
        if (data.medicoEgresoJvpm) setMedicoJvpm(data.medicoEgresoJvpm);
      }

      setLoading(false);
    })();
    return () => { cancelado = true; };
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
        <p className="text-sm text-slate-500">Paciente no encontrado.</p>
        <Link href="/dashboard/pacientes" className="text-sm text-blue-600 hover:underline">
          ← Volver
        </Link>
      </div>
    );
  }

  // Activo → registrar egreso; ya egresado → editar los datos de egreso.
  const modoEdicion = paciente.estado !== "activo";

  const dias = diasEstancia(paciente.fechaIngreso, new Date(fechaHora));

  const agregarComplementario = () =>
    setComplementarios((p) => [...p, { codigo: "", descripcion: "" }]);

  const eliminarComplementario = (idx: number) =>
    setComplementarios((p) => p.filter((_, i) => i !== idx));

  const actualizarComplementario = (idx: number, v: DiagnosticoCIE) =>
    setComplementarios((p) => p.map((d, i) => (i === idx ? v : d)));

  const agregarProcedimiento = () => setProcedimientos((p) => [...p, ""]);
  const eliminarProcedimiento = (idx: number) =>
    setProcedimientos((p) => p.filter((_, i) => i !== idx));
  const actualizarProcedimiento = (idx: number, v: string) =>
    setProcedimientos((p) => p.map((x, i) => (i === idx ? v : x)));

  const guardar = async () => {
    if (!profile || !paciente.id) return;
    if (!fechaHora) { setError("La fecha y hora de egreso es obligatoria."); return; }
    const fechaEgreso = new Date(fechaHora);
    if (fechaEgreso < paciente.fechaIngreso) {
      setError("La fecha de egreso no puede ser anterior a la de ingreso.");
      return;
    }
    if (!medicoNombre.trim()) { setError("El médico responsable del alta es obligatorio."); return; }

    setError(null);
    setGuardando(true);
    try {
      const compLimpios = complementarios
        .filter((d) => d.codigo.trim() || d.descripcion.trim())
        .map((d) => ({ codigo: d.codigo.trim().toUpperCase(), descripcion: d.descripcion.trim() }));
      const procsLimpios = procedimientos.map((p) => p.trim()).filter(Boolean);

      // Se escriben los campos siempre (null cuando van vacíos) para que al editar
      // un egreso ya guardado, quitar un dato realmente lo borre en Firestore.
      const update: Record<string, unknown> = {
        estado: condicion,
        fechaEgreso: Timestamp.fromDate(fechaEgreso),
        diasEstancia: dias,
        medicoEgresoNombre: medicoNombre.trim(),
        medicoEgresoJvpm: medicoJvpm.trim() || null,
        diagnosticoEgreso: (dxCodigo.trim() || dxDescripcion.trim())
          ? { codigo: dxCodigo.trim().toUpperCase(), descripcion: dxDescripcion.trim() }
          : null,
        diagnosticosComplementarios: compLimpios.length ? compLimpios : null,
        causaExterna: (causaExtCodigo.trim() || causaExtDescripcion.trim())
          ? { codigo: causaExtCodigo.trim().toUpperCase(), descripcion: causaExtDescripcion.trim() }
          : null,
        procedimientos: procsLimpios.length ? procsLimpios : null,
        actualizadoEn: Timestamp.now(),
        actualizadoPor: profile.uid,
      };

      await updateDoc(doc(db, "pacientes", paciente.id), update);

      // Solo al registrar el egreso por primera vez: anular las tarjetas de visita
      // activas (conserva el historial; solo deja de estar "activa"). Al editar un
      // egreso ya existente no aplica. No bloquea el egreso si falla.
      if (!modoEdicion) {
        try {
          const snap = await getDocs(
            query(collection(db, "tarjetas_visita"), where("expediente", "==", paciente.expediente))
          );
          await Promise.all(
            snap.docs
              .filter((d) => (d.data() as { estado?: string }).estado === "activa")
              .map((d) => updateDoc(doc(db, "tarjetas_visita", d.id), {
                estado: "anulada",
                actualizadoEn: Timestamp.now(),
              }))
          );
        } catch {
          /* las tarjetas de visita no son críticas para el egreso */
        }
      }

      router.push(`/dashboard/pacientes/${paciente.id}`);
    } catch (e) {
      setError(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
      setGuardando(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/pacientes/${paciente.id}`}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <p className="text-[11px] text-slate-400 uppercase tracking-widest font-medium">
            {modoEdicion ? "Editar datos de egreso" : "Registrar egreso"}
          </p>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
            {nombreCompleto(paciente)} <span className="text-slate-400 font-mono text-sm ml-2">{paciente.expediente}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {paciente.servicioActual}{paciente.camaActual && ` · Cama ${paciente.camaActual}`} · {dias} {dias === 1 ? "día" : "días"} de estancia
          </p>
        </div>
      </div>

      {/* Condición de egreso */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 font-heading">Condición de egreso</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {ESTADOS_EGRESO.map((e) => (
            <button
              key={e}
              onClick={() => setCondicion(e)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                condicion === e
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              {ESTADO_LABEL[e]}
            </button>
          ))}
        </div>
        {condicion === "alta_fallecido" && (
          <p className="text-xs text-rose-600 dark:text-rose-400 mt-3 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
            Si este fallecimiento aún no fue notificado por el médico, regístralo también en el módulo de Fallecidos para activar el flujo administrativo.
          </p>
        )}
      </section>

      {/* Datos clínicos */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-heading">Datos clínicos del egreso</h3>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) cargarFormulario(f); e.target.value = ""; }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={cargandoPdf}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
          >
            {cargandoPdf ? <Loader2 size={12} className="animate-spin" /> : <FileUp size={12} />}
            {cargandoPdf ? "Leyendo..." : "Cargar formulario de egreso (PDF)"}
          </button>
        </div>

        {pdfMsg && (
          <div
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
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

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Fecha y hora de egreso *</label>
            <input
              type="datetime-local"
              value={fechaHora}
              onChange={(e) => setFechaHora(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Días de estancia (calculado)</label>
            <input type="text" value={`${dias} días`} disabled className={`${inputCls} bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed`} />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Diagnóstico principal de egreso</p>
          <CIE10Combobox
            value={{ codigo: dxCodigo, descripcion: dxDescripcion }}
            onChange={(v) => { setDxCodigo(v.codigo); setDxDescripcion(v.descripcion); }}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Diagnósticos complementarios</p>
            <button
              onClick={agregarComplementario}
              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 font-medium"
            >
              <Plus size={12} /> Agregar
            </button>
          </div>
          {complementarios.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Sin diagnósticos complementarios.</p>
          ) : (
            <div className="space-y-2">
              {complementarios.map((d, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <CIE10Combobox
                      value={d}
                      onChange={(v) => actualizarComplementario(idx, v)}
                    />
                  </div>
                  <button
                    onClick={() => eliminarComplementario(idx)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors flex-shrink-0 mt-0.5"
                    aria-label="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Causa externa (opcional)</p>
          <CIE10Combobox
            value={{ codigo: causaExtCodigo, descripcion: causaExtDescripcion }}
            onChange={(v) => { setCausaExtCodigo(v.codigo); setCausaExtDescripcion(v.descripcion); }}
            placeholder="Buscar causa externa..."
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Procedimientos médicos / terapéuticos</p>
            <button
              onClick={agregarProcedimiento}
              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 font-medium"
            >
              <Plus size={12} /> Agregar
            </button>
          </div>
          {procedimientos.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Sin procedimientos registrados.</p>
          ) : (
            <div className="space-y-2">
              {procedimientos.map((p, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={p}
                    onChange={(e) => actualizarProcedimiento(idx, e.target.value)}
                    placeholder="Describir procedimiento"
                    className={inputCls}
                  />
                  <button
                    onClick={() => eliminarProcedimiento(idx)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors flex-shrink-0"
                    aria-label="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Médico responsable */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 font-heading">Médico responsable del alta</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className={labelCls}>Nombre del médico *</label>
            <input
              type="text"
              value={medicoNombre}
              onChange={(e) => setMedicoNombre(e.target.value)}
              className={inputCls}
              placeholder="DR. NOMBRE APELLIDOS"
            />
          </div>
          <div>
            <label className={labelCls}>JVPM</label>
            <input
              type="text"
              value={medicoJvpm}
              onChange={(e) => setMedicoJvpm(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="sticky bottom-0 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50/95 dark:via-slate-950/95 to-transparent pt-4 pb-2">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 mb-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center gap-3 justify-end">
          <Link
            href={`/dashboard/pacientes/${paciente.id}`}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancelar
          </Link>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-colors"
          >
            <Save size={15} />
            {guardando ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Registrar egreso"}
          </button>
        </div>
      </div>
    </div>
  );
}

function toDatetimeLocalInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
