"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, setDoc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ArrowLeft, Save, UserPlus, CreditCard, Building, Mail, Phone, Hash, DollarSign
} from "lucide-react";

const inputCls = "w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors";
const labelCls = "block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider";

export default function NuevoEmpleadoPage() {
  const router = useRouter();

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [genero, setGenero] = useState("");
  const [cargo, setCargo] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState("");
  
  const [dui, setDui] = useState("");
  const [nit, setNit] = useState("");
  const [isss, setIsss] = useState("");
  const [nup, setNup] = useState("");
  const [afp, setAfp] = useState("");
  
  const [celular, setCelular] = useState("");
  const [email, setEmail] = useState("");
  
  const [sueldoBasico, setSueldoBasico] = useState("");
  const [estadoPlaza, setEstadoPlaza] = useState("Ocupada");

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cod = codigo.trim().toUpperCase();
    if (!cod) { setError("El código de plaza es obligatorio."); return; }
    if (!nombre.trim()) { setError("El nombre del empleado es obligatorio."); return; }

    setGuardando(true);
    try {
      const ref = doc(db, "empleados", cod);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setError(`Ya existe un empleado con el código de plaza ${cod}.`);
        setGuardando(false);
        return;
      }

      const data = {
        codigo: cod,
        nombre: nombre.trim(),
        activo: true,
        creadoEn: Timestamp.now(),
        actualizadoEn: Timestamp.now(),
      } as Record<string, any>;

      if (genero) data.genero = genero;
      if (cargo.trim()) data.cargo = cargo.trim();
      if (departamento.trim()) data.departamento = departamento.trim();
      if (fechaIngreso) data.fechaIngreso = Timestamp.fromDate(new Date(`${fechaIngreso}T00:00:00`));
      
      if (dui.trim()) data.dui = dui.trim();
      if (nit.trim()) data.nit = nit.trim();
      if (isss.trim()) data.isss = isss.trim();
      if (nup.trim()) data.nup = nup.trim();
      if (afp) data.afp = afp;
      
      if (celular.trim()) data.celular = celular.trim();
      if (email.trim()) data.email = email.trim();
      
      if (sueldoBasico) data.sueldoBasico = parseFloat(sueldoBasico);
      if (estadoPlaza.trim()) data.estadoPlaza = estadoPlaza.trim();

      await setDoc(ref, data);
      router.push(`/rrhh/empleados/${encodeURIComponent(cod)}`);
    } catch (err) {
      setError(`Error al guardar: ${err instanceof Error ? err.message : "desconocido"}`);
      setGuardando(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/rrhh/empleados" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors" aria-label="Volver">
          <ArrowLeft size={16} />
        </Link>
        <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-800">
          <UserPlus size={20} className="text-blue-600 dark:text-blue-400" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Agregar empleado</h1>
      </div>

      <form onSubmit={guardar} className="space-y-6">
        
        {/* 1. Datos Generales */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
            <Building size={16} className="text-slate-400" /> Datos Generales e Institucionales
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Código de Plaza <span className="text-red-500">*</span></label>
              <input type="text" value={codigo} onChange={e => setCodigo(e.target.value)} required placeholder="Ej. A-002" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Nombre Completo <span className="text-red-500">*</span></label>
              <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} required placeholder="Nombres y Apellidos" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Género</label>
              <select value={genero} onChange={e => setGenero(e.target.value)} className={inputCls}>
                <option value="">Seleccionar...</option>
                <option value="femenino">Femenino</option>
                <option value="masculino">Masculino</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Fecha de Ingreso</label>
              <input type="date" value={fechaIngreso} onChange={e => setFechaIngreso(e.target.value)} className={`${inputCls} [color-scheme:light] dark:[color-scheme:dark]`} />
            </div>
            <div>
              <label className={labelCls}>Cargo / Puesto</label>
              <input type="text" value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Ej. Auxiliar de Farmacia" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Departamento / Unidad</label>
              <input type="text" value={departamento} onChange={e => setDepartamento(e.target.value)} placeholder="Ej. Farmacia" className={inputCls} />
            </div>
          </div>
        </section>

        {/* 2. Documentos y Previsión */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
            <CreditCard size={16} className="text-slate-400" /> Documentos y Previsión Social
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>DUI</label>
              <input type="text" value={dui} onChange={e => setDui(e.target.value)} placeholder="00000000-0" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>NIT</label>
              <input type="text" value={nit} onChange={e => setNit(e.target.value)} placeholder="0000-000000-000-0" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>ISSS</label>
              <input type="text" value={isss} onChange={e => setIsss(e.target.value)} placeholder="Número de ISSS" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>AFP</label>
                <select value={afp} onChange={e => setAfp(e.target.value)} className={inputCls}>
                  <option value="">Seleccionar...</option>
                  <option value="CONFIA">Confía</option>
                  <option value="CRECER">Crecer</option>
                  <option value="INPEP">INPEP</option>
                  <option value="IPSFA">IPSFA</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>NUP</label>
                <input type="text" value={nup} onChange={e => setNup(e.target.value)} placeholder="Número NUP" className={inputCls} />
              </div>
            </div>
          </div>
        </section>

        {/* 3. Contacto y Presupuesto */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
            <Hash size={16} className="text-slate-400" /> Contacto y Presupuesto
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className={labelCls}><Phone size={11} className="inline mr-1"/> Celular</label>
              <input type="tel" value={celular} onChange={e => setCelular(e.target.value)} placeholder="0000-0000" className={inputCls} />
            </div>
            <div className="lg:col-span-2">
              <label className={labelCls}><Mail size={11} className="inline mr-1"/> Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" className={inputCls} />
            </div>
            <div className="lg:col-span-2">
              <label className={labelCls}><DollarSign size={11} className="inline mr-1"/> Sueldo Básico</label>
              <input type="number" step="0.01" value={sueldoBasico} onChange={e => setSueldoBasico(e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
            <div className="lg:col-span-2">
              <label className={labelCls}>Estado de Plaza</label>
              <input type="text" value={estadoPlaza} onChange={e => setEstadoPlaza(e.target.value)} placeholder="Ej. Ocupada" className={inputCls} />
            </div>
          </div>
        </section>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Link href="/rrhh/empleados" className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={guardando}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl disabled:opacity-50 transition-colors"
          >
            <Save size={16} />
            {guardando ? "Guardando..." : "Guardar Empleado"}
          </button>
        </div>
      </form>
    </div>
  );
}
