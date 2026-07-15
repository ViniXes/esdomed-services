"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { doc, setDoc, Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { asegurarSesionPublica } from "@/lib/transporte/sesionPublica";
import { CENTROS_COSTOS, generarFolio } from "@/lib/transporte/catalogos";
import { MapaPinDestino } from "@/components/transporte/MapaPinDestino";
import { DateField } from "@/components/ui/DateField";
import { AlertTriangle, Bus, CheckCircle2, ClipboardCopy, Loader2, MapPin, Send } from "lucide-react";

const inputCls =
  "w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";
const selectCls =
  "w-full appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer";
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

const hoyStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};

export default function SolicitarTransportePage() {
  const [nombre, setNombre] = useState("");
  const [dui, setDui] = useState("");
  const [codigoEmpleado, setCodigoEmpleado] = useState("");
  const [telefono, setTelefono] = useState("");
  const [area, setArea] = useState("");
  const [mision, setMision] = useState("");
  const [personal, setPersonal] = useState("");
  const [destino, setDestino] = useState("");
  const [conMapa, setConMapa] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [fecha, setFecha] = useState(hoyStr());
  const [hora, setHora] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [folioCreado, setFolioCreado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const faltantes = () => {
    const f: string[] = [];
    if (nombre.trim().length < 5) f.push("nombre completo");
    if (!dui.trim()) f.push("DUI");
    if (!codigoEmpleado.trim()) f.push("código de empleado");
    if (!area) f.push("área solicitante");
    if (mision.trim().length < 5) f.push("misión a realizar");
    if (destino.trim().length < 3) f.push("destino");
    if (!fecha) f.push("fecha");
    if (!hora) f.push("hora");
    return f;
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = faltantes();
    if (f.length > 0) {
      setError(`Completa: ${f.join(", ")}.`);
      return;
    }
    setError("");
    setEnviando(true);
    try {
      const uid = await asegurarSesionPublica();
      const folio = generarFolio();
      const datos: Record<string, unknown> = {
        folio,
        estado: "pendiente",
        solicitanteUid: uid,
        solicitanteNombre: nombre.trim(),
        solicitanteDui: dui.trim(),
        solicitanteCodigoEmpleado: codigoEmpleado.trim(),
        telefono: telefono.trim() || undefined,
        area,
        mision: mision.trim(),
        personal: personal.trim() || undefined,
        destinoTexto: destino.trim(),
        destinoLat: pin?.lat,
        destinoLng: pin?.lng,
        fechaNecesita: fecha,
        horaNecesita: hora,
        creadoEn: Timestamp.now(),
      };
      const payload = Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined));
      await setDoc(doc(db, "viajes_transporte", folio), payload);
      setFolioCreado(folio);
    } catch {
      setError("No se pudo enviar la solicitud. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  const copiarFolio = async () => {
    if (!folioCreado) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/transporte/solicitud/${folioCreado}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch { /* noop */ }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[var(--color-institutional-dark)]">
      {/* Encabezado institucional */}
      <header className="bg-[#1c1e4d] text-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Image src="/logo_hnes_sidebar.png" alt="HNES" width={40} height={40} className="rounded" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Hospital Nacional El Salvador</p>
            <h1 className="text-lg font-bold font-heading leading-tight">Solicitud de Transporte</h1>
          </div>
          <Bus size={26} className="ml-auto text-white/60 shrink-0" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-16">
        {folioCreado ? (
          /* ── Confirmación con folio ─────────────────────────────────────── */
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
              <CheckCircle2 size={34} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Solicitud enviada</h2>
              <p className="text-sm text-slate-500 mt-1">Guarda tu folio — con él consultas el estado de tu solicitud.</p>
            </div>
            <p className="font-mono text-2xl sm:text-3xl font-bold tracking-wider text-blue-700 dark:text-blue-400 select-all">
              {folioCreado}
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5">
              <Link prefetch={false}
                href={`/transporte/solicitud/${folioCreado}`}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors"
              >
                Ver estado de mi solicitud
              </Link>
              <button
                onClick={copiarFolio}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <ClipboardCopy size={15} /> {copiado ? "¡Copiado!" : "Copiar enlace"}
              </button>
            </div>
            <button
              onClick={() => {
                setFolioCreado(null);
                setMision(""); setPersonal(""); setDestino(""); setPin(null); setHora("");
              }}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
            >
              Enviar otra solicitud
            </button>
          </div>
        ) : (
          /* ── Formulario ─────────────────────────────────────────────────── */
          <form onSubmit={enviar} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-8 space-y-6">
            {/* Solicitante */}
            <fieldset className="space-y-4">
              <legend className="text-sm font-bold text-slate-800 dark:text-slate-200 font-heading">Datos del solicitante</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Nombre completo</label>
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} autoComplete="name" />
                </div>
                <div>
                  <label className={labelCls}>DUI</label>
                  <input value={dui} onChange={(e) => setDui(e.target.value)} className={inputCls} placeholder="00000000-0" inputMode="numeric" />
                </div>
                <div>
                  <label className={labelCls}>Código de empleado</label>
                  <input value={codigoEmpleado} onChange={(e) => setCodigoEmpleado(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Teléfono o extensión <span className="text-slate-400 normal-case font-normal">(opcional)</span></label>
                  <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputCls} inputMode="tel" />
                </div>
                <div>
                  <label className={labelCls}>Área / servicio solicitante</label>
                  <select value={area} onChange={(e) => setArea(e.target.value)} className={selectCls}>
                    <option value="">— Selecciona tu área</option>
                    {CENTROS_COSTOS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </fieldset>

            {/* Misión */}
            <fieldset className="space-y-4">
              <legend className="text-sm font-bold text-slate-800 dark:text-slate-200 font-heading">Misión</legend>
              <div>
                <label className={labelCls}>Misión a realizar</label>
                <textarea value={mision} onChange={(e) => setMision(e.target.value)} rows={2} maxLength={600} className={inputCls + " resize-y"} />
              </div>
              <div>
                <label className={labelCls}>Personal que participa <span className="text-slate-400 normal-case font-normal">(opcional)</span></label>
                <textarea value={personal} onChange={(e) => setPersonal(e.target.value)} rows={2} maxLength={400} className={inputCls + " resize-y"} />
              </div>
              <div>
                <label className={labelCls}>Destino</label>
                <input value={destino} onChange={(e) => setDestino(e.target.value)} maxLength={300} className={inputCls} placeholder="Lugar al que se dirige la misión" />
                <button
                  type="button"
                  onClick={() => setConMapa((v) => !v)}
                  className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                    conMapa || pin
                      ? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                      : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400"
                  }`}
                >
                  <MapPin size={13} />
                  {pin ? "Ubicación marcada en el mapa" : conMapa ? "Ocultar mapa" : "Marcar ubicación en el mapa (opcional)"}
                </button>
                {conMapa && (
                  <div className="mt-2">
                    <MapaPinDestino lat={pin?.lat} lng={pin?.lng} onChange={(lat, lng) => setPin({ lat, lng })} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Fecha en que necesita el transporte</label>
                  <DateField value={fecha} onChange={setFecha} ariaLabel="Fecha en que necesita el transporte" />
                </div>
                <div>
                  <label className={labelCls}>Hora</label>
                  <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputCls} />
                </div>
              </div>
            </fieldset>

            {error && (
              <div className="flex items-start gap-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl transition-colors"
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Enviar solicitud
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
