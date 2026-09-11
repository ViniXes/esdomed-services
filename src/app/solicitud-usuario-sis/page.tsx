"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, FilePlus2 } from "lucide-react";
import { normalizarDui } from "@/lib/dui";
import { CARGOS_USUARIO_SIS, ESPECIALIDADES_SIS, JEFATURAS_AUTORIZADORAS_SIS, normalizarNombrePersona, RESPUESTAS_SI_NO, TIPOS_DOCUMENTO_SIS } from "@/lib/solicitudesUsuarioSis";
import { useServicios } from "@/contexts/ServiciosContext";

const inputCls = "w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent transition";
const labelCls = "block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide";

const EMPTY = {
  nombre: "", tipoDocumento: "", numeroDocumento: "", correo: "", telefono: "", cargo: "", numeroJunta: "", yaTuvoUsuario: "",
  especialidad: "", esResidente: "", servicio: "", autorizadoPor: "",
};

export default function SolicitudUsuarioSisPage() {
  return <Suspense fallback={null}><SolicitudUsuarioSisFormulario /></Suspense>;
}

function SolicitudUsuarioSisFormulario() {
  const searchParams = useSearchParams();
  const { servicios, loading: cargandoServicios } = useServicios();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const vistaPrevia = searchParams.get("vista") === "confirmacion";
  const set = (field: keyof typeof EMPTY, value: string) => setForm((prev) => ({ ...prev, [field]: value }));
  const esMedicoInterno = form.cargo === "medico_interno";
  const cambiarCargo = (cargo: string) => setForm((prev) => ({
    ...prev,
    cargo,
    // SIS no asigna especialidad al médico interno.
    especialidad: cargo === "medico_interno" ? "" : prev.especialidad,
  }));

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/solicitudes-usuarios-sis", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudo enviar la solicitud.");
      setEnviada(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la solicitud.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 px-4 py-10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8 flex flex-col items-center">
          <Image src="/logo_hnes.png" alt="Hospital Nacional El Salvador" width={130} height={65} className="object-contain dark:brightness-0 dark:invert dark:opacity-90" priority />
          <div className="mt-4 flex items-center gap-2"><div className="h-px w-8 bg-slate-300 dark:bg-slate-700" /><p className="text-[11px] uppercase tracking-widest text-slate-500">Solicitud de usuario SIS</p><div className="h-px w-8 bg-slate-300 dark:bg-slate-700" /></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-black/10 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          {enviada || vistaPrevia ? (
            <div className="mx-auto max-w-md py-4 text-center">
              <CheckCircle2 size={42} className="mx-auto mb-3 text-emerald-500" />
              <h1 className="mb-2 text-lg font-bold text-slate-900 dark:text-slate-100">Solicitud registrada</h1>
              <p className="text-sm text-slate-500">Tus datos fueron enviados para la creación de usuario en SIS.</p>
              <div className="my-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left dark:border-amber-900 dark:bg-amber-950/40">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Paso obligatorio para dar seguimiento</p>
                <p className="mt-1 text-sm leading-relaxed text-amber-800 dark:text-amber-300">Después de enviar esta solicitud, acércate a ESDOMED para darle seguimiento y terminar el proceso de creación de tu usuario en SIS (Sistema Integrado de Salud). Sin este paso no se dará seguimiento a la solicitud.</p>
              </div>
              <p className="mb-6 text-xs text-slate-500">Este formulario no crea una cuenta de acceso a ESDOMED.</p>
              <Link prefetch={false} href="/login" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600"><ArrowLeft size={16} />Volver</Link>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a4e70] to-[#2b8ca8] text-white"><FilePlus2 size={21} /></span><div><h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Solicitud de creación de usuario SIS</h1><p className="mt-1 text-xs text-slate-500">Después de enviar tu solicitud, acércate a ESDOMED para finalizar con la creación de tu usuario.</p></div></div><Link prefetch={false} href="/login" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-blue-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-300"><ArrowLeft size={14} />Volver</Link></div>
              <form onSubmit={enviar} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <Campo label="Institución" className="lg:col-span-6"><input value="Hospital Nacional El Salvador" readOnly className={`${inputCls} cursor-not-allowed opacity-70`} /></Campo>
                <Campo label="Nombre completo según DUI o documento" className="lg:col-span-6"><input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} onBlur={(e) => set("nombre", normalizarNombrePersona(e.target.value))} required minLength={5} autoComplete="name" className={inputCls} placeholder="Nombres y apellidos completos" /><p className="mt-1.5 text-[11px] text-slate-500">Escríbelo exactamente como aparece en el DUI o documento de identidad.</p></Campo>
                <Campo label="Tipo de documento" className="lg:col-span-2"><select value={form.tipoDocumento} onChange={(e) => set("tipoDocumento", e.target.value)} required className={inputCls}><option value="">Seleccionar...</option>{TIPOS_DOCUMENTO_SIS.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}</select></Campo>
                <Campo label={form.tipoDocumento === "dui" ? "DUI (9 dígitos)" : "N° de documento"} className="lg:col-span-2"><input value={form.numeroDocumento} onChange={(e) => set("numeroDocumento", form.tipoDocumento === "dui" ? normalizarDui(e.target.value) : e.target.value.toUpperCase())} required disabled={!form.tipoDocumento} inputMode={form.tipoDocumento === "dui" ? "numeric" : "text"} className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-60`} placeholder={form.tipoDocumento === "dui" ? "00000000-0" : "Escribe el número de documento"} /></Campo>
                <Campo label="Correo electrónico" className="lg:col-span-2"><input value={form.correo} onChange={(e) => set("correo", e.target.value)} required type="email" autoComplete="email" className={inputCls} placeholder="nombre@correo.com" /></Campo>
                <Campo label="Teléfono" className="lg:col-span-2"><input value={form.telefono} onChange={(e) => set("telefono", e.target.value.replace(/\D/g, "").slice(0, 8))} required inputMode="tel" className={inputCls} placeholder="00000000" /></Campo>
                <Campo label="Tipo de empleado" className="lg:col-span-3"><select value={form.cargo} onChange={(e) => cambiarCargo(e.target.value)} required className={inputCls}><option value="">Seleccionar...</option>{CARGOS_USUARIO_SIS.map((cargo) => <option key={cargo.value} value={cargo.value}>{cargo.label}</option>)}</select></Campo>
                <Campo label="Número de junta médica / registro profesional (si aplica)" className="lg:col-span-3"><input value={form.numeroJunta} onChange={(e) => set("numeroJunta", e.target.value.toUpperCase())} className={inputCls} placeholder="Ej. 19711" /></Campo>
                <Campo label="¿Ya ha tenido usuario en SIS?" className="lg:col-span-3"><select value={form.yaTuvoUsuario} onChange={(e) => set("yaTuvoUsuario", e.target.value)} required className={inputCls}><option value="">Seleccionar...</option>{RESPUESTAS_SI_NO.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Campo>
                <Campo label="¿Es médico residente?" className="lg:col-span-3"><select value={form.esResidente} onChange={(e) => set("esResidente", e.target.value)} required className={inputCls}><option value="">Seleccionar...</option>{RESPUESTAS_SI_NO.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Campo>
                {esMedicoInterno ? <div className="lg:col-span-3 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-sm text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-200"><p className="font-medium">Especialidad no aplica</p><p className="mt-0.5 text-xs">Selecciona únicamente el servicio asignado.</p></div> : <Campo label="Especialidad con la que trabajará" className="lg:col-span-3"><select value={form.especialidad} onChange={(e) => set("especialidad", e.target.value)} required className={inputCls}><option value="">Seleccionar especialidad...</option>{ESPECIALIDADES_SIS.map((especialidad) => <option key={especialidad} value={especialidad}>{especialidad}</option>)}</select></Campo>}
                <Campo label="Servicio al que será asignado" className="lg:col-span-3">
                  <select value={form.servicio} onChange={(e) => set("servicio", e.target.value)} required disabled={cargandoServicios} className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-60`}>
                    <option value="">{cargandoServicios ? "Cargando servicios habilitados..." : "Seleccionar servicio..."}</option>
                    {servicios.map((servicio) => <option key={servicio} value={servicio}>{servicio}</option>)}
                  </select>
                </Campo>
                <Campo label="Jefatura que autoriza" className="lg:col-span-3"><select value={form.autorizadoPor} onChange={(e) => set("autorizadoPor", e.target.value)} required className={inputCls}><option value="">Seleccionar jefatura...</option>{JEFATURAS_AUTORIZADORAS_SIS.map((jefatura) => <option key={jefatura} value={jefatura}>{jefatura}</option>)}</select></Campo>
                {error && <div className="lg:col-span-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</div>}
                <div className="lg:col-span-6"><button disabled={submitting} type="submit" className="w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50">{submitting ? "Enviando solicitud..." : "Enviar solicitud"}</button></div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({ label, className, children }: { label: string; className: string; children: React.ReactNode }) {
  return <div className={className}><label className={labelCls}>{label}</label>{children}</div>;
}
