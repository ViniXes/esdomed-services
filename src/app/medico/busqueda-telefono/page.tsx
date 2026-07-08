"use client";

import { useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from "@/lib/firestoreMeter";
import { AlertCircle, CheckCircle2, Phone, Search, UserRound } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { BusquedaTelefono, Paciente } from "@/types";
import { ESTADO_BADGE, ESTADO_LABEL, nombreCompleto } from "@/lib/pacientes/helpers";

const inputCls =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm";

function normalizarExpediente(valor: string): string {
  const limpio = valor.trim().toUpperCase().replace(/\s+/g, "");
  if (!limpio) return "";
  if (limpio.includes("-")) return limpio;
  const soloNumeros = limpio.replace(/\D/g, "");
  if (soloNumeros.length >= 4) {
    return `${soloNumeros.slice(0, -2)}-${soloNumeros.slice(-2)}`;
  }
  return limpio;
}

function candidatosExpediente(valor: string): string[] {
  const original = valor.trim().toUpperCase().replace(/\s+/g, "");
  const normalizado = normalizarExpediente(valor);
  return Array.from(new Set([original, normalizado].filter(Boolean))).slice(0, 10);
}

function pacienteNombre(paciente: Paciente): string {
  return nombreCompleto(paciente) || [paciente.apellidos, paciente.nombres].filter(Boolean).join(", ");
}

export default function BusquedaTelefonoPage() {
  const { user, profile } = useAuth();
  const [expediente, setExpediente] = useState("");
  const [resultado, setResultado] = useState<Paciente | null>(null);
  const [buscado, setBuscado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const buscar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    setResultado(null);
    setBuscado(false);

    const expedienteNormalizado = normalizarExpediente(expediente);
    const candidatos = candidatosExpediente(expediente);

    if (!user || !profile || (profile.role !== "medico" && profile.role !== "admin")) {
      setError("No se pudo validar tu usuario para esta busqueda.");
      return;
    }
    if (!expedienteNormalizado || candidatos.length === 0) {
      setError("Ingresa un numero de expediente valido.");
      return;
    }

    setLoading(true);
    try {
      const q = query(
        collection(db, "pacientes"),
        where("expediente", "in", candidatos),
        limit(5)
      );
      const snap = await getDocs(q);
      const pacientes = snap.docs.map(d => ({ id: d.id, ...d.data() } as Paciente));
      const encontrado = pacientes.find(p => p.estado === "activo") ?? pacientes[0] ?? null;

      await addDoc(collection(db, "busquedas_telefono"), {
        usuarioUid: user.uid,
        usuarioNombre: profile.nombre,
        usuarioEmail: profile.email,
        usuarioRole: profile.role,
        ...(profile.jvpm ? { usuarioJvpm: profile.jvpm } : {}),
        expedienteBuscado: expediente.trim(),
        expedienteNormalizado,
        encontrado: Boolean(encontrado),
        ...(encontrado ? {
          pacienteId: encontrado.id,
          pacienteExpediente: encontrado.expediente,
          pacienteNombre: pacienteNombre(encontrado),
          pacienteEstado: encontrado.estado,
          pacienteServicio: encontrado.servicioActual,
          ...(encontrado.camaActual ? { pacienteCama: encontrado.camaActual } : {}),
        } : {}),
        creadoEn: serverTimestamp(),
      } satisfies Omit<BusquedaTelefono, "id" | "creadoEn"> & { creadoEn: unknown });

      setResultado(encontrado);
      setBuscado(true);
      setExpediente(expedienteNormalizado);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "No se pudo completar la busqueda.");
    } finally {
      setLoading(false);
    }
  };

  const responsable = resultado?.responsable;
  const telefono = responsable?.telefono || resultado?.telefono || resultado?.otrosNumeros || "";

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-900">
          <Phone size={17} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            Busqueda de telefono
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Consulta el telefono del responsable por numero de expediente
          </p>
        </div>
      </div>

      <form onSubmit={buscar} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Expediente
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={expediente}
              onChange={e => setExpediente(e.target.value)}
              placeholder="Ej. 4599-26 o 459926"
              className={inputCls}
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
        </div>

        <p className="text-[11px] text-slate-500">
          Cada busqueda queda registrada automaticamente para auditoria administrativa.
        </p>
      </form>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {buscado && resultado && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 bg-green-50 dark:bg-green-950 rounded-xl flex items-center justify-center border border-green-200 dark:border-green-900 flex-shrink-0">
                <CheckCircle2 size={19} className="text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {pacienteNombre(resultado)}
                </p>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Exp. {resultado.expediente}
                </p>
              </div>
            </div>
            <span className={`text-[11px] font-medium rounded-full px-2.5 py-1 ${ESTADO_BADGE[resultado.estado]}`}>
              {ESTADO_LABEL[resultado.estado]}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoCard label="Responsable" value={responsable?.nombre || "Sin dato"} icon={UserRound} />
            <InfoCard label="Telefono" value={telefono || "Sin dato"} icon={Phone} mono />
            <InfoCard label="Servicio actual" value={resultado.servicioActual || "Sin dato"} />
            <InfoCard label="Cama actual" value={resultado.camaActual || "Sin dato"} mono />
          </div>
        </section>
      )}

      {buscado && !resultado && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-2xl px-4 py-4 text-sm text-amber-700 dark:text-amber-400">
          No se encontro un paciente con ese expediente.
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, icon: Icon, mono = false }: {
  label: string;
  value: string;
  icon?: React.ElementType;
  mono?: boolean;
}) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
        {Icon && <Icon size={13} />}
        {label}
      </div>
      <p className={`text-sm font-semibold text-slate-900 dark:text-slate-100 ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}
