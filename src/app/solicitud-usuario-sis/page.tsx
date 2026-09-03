"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FilePlus2 } from "lucide-react";
import { normalizarDui } from "@/lib/dui";
import { CARGOS_USUARIO_SIS, ESPECIALIDADES_SIS, JEFATURAS_AUTORIZADORAS_SIS, normalizarNombrePersona, RESPUESTAS_SI_NO, TIPOS_DOCUMENTO_SIS } from "@/lib/solicitudesUsuarioSis";
import { useServicios } from "@/contexts/ServiciosContext";

const inputCls = "w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent transition";
const labelCls = "block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide";

const EMPTY = {
  nombre: "", tipoDocumento: "", numeroDocumento: "", correo: "", telefono: "", cargo: "", otroCargo: "", numeroJunta: "", yaTuvoUsuario: "",
  especialidad: "", otraEspecialidad: "", esResidente: "", servicio: "", autorizadoPor: "",
};

export default function SolicitudUsuarioSisPage() {
  const { servicios, loading: cargandoServicios } = useServicios();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const set = (field: keyof typeof EMPTY, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

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
          {enviada ? (
            <div className="mx-auto max-w-md py-4 text-center"><CheckCircle2 size={42} className="mx-auto mb-3 text-emerald-500" /><h1 className="mb-2 text-lg font-bold text-slate-900 dark:text-slate-100">Solicitud enviada</h1><p className="mb-6 text-sm text-slate-500">Administración revisará los datos y creará el usuario directamente en SIS. No se creó una cuenta de acceso a ESDOMED.</p><Link prefetch={false} href="/login" className="inline-block w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600">Volver a iniciar sesión</Link></div>
          ) : (
            <>
              <div className="mb-6 flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a4e70] to-[#2b8ca8] text-white"><FilePlus2 size={21} /></span><div><h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Solicitud de creación de usuario SIS</h1><p className="mt-1 text-xs text-slate-500">Completa los datos solicitados por SIS. Administración te notificará cuando el usuario esté creado.</p></div></div>
              <form onSubmit={enviar} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <Campo label="Institución" className="lg:col-span-6"><input value="Hospital Nacional El Salvador" readOnly className={`${inputCls} cursor-not-allowed opacity-70`} /></Campo>
                <Campo label="Nombre completo" className="lg:col-span-6"><input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} onBlur={(e) => set("nombre", normalizarNombrePersona(e.target.value))} required autoComplete="name" className={inputCls} placeholder="Nombre completo" /></Campo>
                <Campo label="Tipo de documento" className="lg:col-span-2"><select value={form.tipoDocumento} onChange={(e) => set("tipoDocumento", e.target.value)} required className={inputCls}><option value="">Seleccionar...</option>{TIPOS_DOCUMENTO_SIS.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}</select></Campo>
                <Campo label={form.tipoDocumento === "dui" ? "DUI (9 dígitos)" : "N° de documento"} className="lg:col-span-2"><input value={form.numeroDocumento} onChange={(e) => set("numeroDocumento", form.tipoDocumento === "dui" ? normalizarDui(e.target.value) : e.target.value.toUpperCase())} required disabled={!form.tipoDocumento} inputMode={form.tipoDocumento === "dui" ? "numeric" : "text"} className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-60`} placeholder={form.tipoDocumento === "dui" ? "00000000-0" : "Escribe el número de documento"} /></Campo>
                <Campo label="Correo electrónico" className="lg:col-span-2"><input value={form.correo} onChange={(e) => set("correo", e.target.value)} required type="email" autoComplete="email" className={inputCls} placeholder="nombre@correo.com" /></Campo>
                <Campo label="Teléfono" className="lg:col-span-2"><input value={form.telefono} onChange={(e) => set("telefono", e.target.value.replace(/\D/g, "").slice(0, 8))} required inputMode="tel" className={inputCls} placeholder="00000000" /></Campo>
                <Campo label="Cargo o función" className="lg:col-span-3"><select value={form.cargo} onChange={(e) => set("cargo", e.target.value)} required className={inputCls}><option value="">Seleccionar...</option>{CARGOS_USUARIO_SIS.map((cargo) => <option key={cargo.value} value={cargo.value}>{cargo.label}</option>)}</select></Campo>
                {form.cargo === "otro" && <Campo label="Especifique el cargo o función" className="lg:col-span-3"><input value={form.otroCargo} onChange={(e) => set("otroCargo", e.target.value)} required className={inputCls} placeholder="Cargo o función" /></Campo>}
                <Campo label="Número de junta médica / registro profesional" className="lg:col-span-3"><input value={form.numeroJunta} onChange={(e) => set("numeroJunta", e.target.value.toUpperCase())} required className={inputCls} placeholder="Ej. 19711" /></Campo>
                <Campo label="¿Ya ha tenido usuario en SIS?" className="lg:col-span-3"><select value={form.yaTuvoUsuario} onChange={(e) => set("yaTuvoUsuario", e.target.value)} required className={inputCls}><option value="">Seleccionar...</option>{RESPUESTAS_SI_NO.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Campo>
                <Campo label="¿Es médico residente?" className="lg:col-span-3"><select value={form.esResidente} onChange={(e) => set("esResidente", e.target.value)} required className={inputCls}><option value="">Seleccionar...</option>{RESPUESTAS_SI_NO.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Campo>
                <Campo label="Especialidad con la que trabajará" className="lg:col-span-3"><select value={form.especialidad} onChange={(e) => set("especialidad", e.target.value)} required className={inputCls}><option value="">Seleccionar especialidad...</option>{ESPECIALIDADES_SIS.map((especialidad) => <option key={especialidad} value={especialidad}>{especialidad}</option>)}</select></Campo>
                {form.especialidad === "Otra" && <Campo label="Especifique la especialidad" className="lg:col-span-3"><input value={form.otraEspecialidad} onChange={(e) => set("otraEspecialidad", e.target.value)} required className={inputCls} placeholder="Especialidad" /></Campo>}
                <Campo label="Servicio al que será asignado" className={form.especialidad === "Otra" ? "lg:col-span-6" : "lg:col-span-3"}>
                  <select value={form.servicio} onChange={(e) => set("servicio", e.target.value)} required disabled={cargandoServicios} className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-60`}>
                    <option value="">{cargandoServicios ? "Cargando servicios habilitados..." : "Seleccionar servicio..."}</option>
                    {servicios.map((servicio) => <option key={servicio} value={servicio}>{servicio}</option>)}
                  </select>
                </Campo>
                <Campo label="Jefatura que autoriza" className="lg:col-span-3"><select value={form.autorizadoPor} onChange={(e) => set("autorizadoPor", e.target.value)} required className={inputCls}><option value="">Seleccionar jefatura...</option>{JEFATURAS_AUTORIZADORAS_SIS.map((jefatura) => <option key={jefatura} value={jefatura}>{jefatura}</option>)}</select></Campo>
                {error && <div className="lg:col-span-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</div>}
                <div className="lg:col-span-6"><button disabled={submitting} type="submit" className="w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50">{submitting ? "Enviando solicitud..." : "Enviar solicitud a Administración"}</button><p className="mt-3 text-center text-xs text-slate-500">¿Ya tienes una cuenta ESDOMED? <Link prefetch={false} href="/login" className="font-medium text-blue-600 hover:underline dark:text-blue-400">Iniciar sesión</Link></p></div>
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
