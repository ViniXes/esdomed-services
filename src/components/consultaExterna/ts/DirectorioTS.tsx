"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, BookUser, ChevronRight, FileX, Globe, House, IdCard, Loader2, MapPin, Pencil, Phone, UsersRound } from "lucide-react";
import { DateField } from "@/components/ui/DateField";
import { DEPARTAMENTOS_SV, municipiosDe } from "@/lib/divisionPolitica";
import { PARENTESCOS } from "@/lib/parentescos";
import { hoySV } from "@/lib/consultaExterna/actualizaciones";
import { especialidadPorId } from "@/lib/consultaExterna/especialidades";
import { nombrePropio } from "@/lib/consultaExterna/nombres";
import { normalizarDui, type PacienteTSCE } from "@/lib/consultaExterna/trabajoSocial";
import {
  NACIONALIDADES, NACIONALIDAD_SV, PAISES, SEXOS, TIPOS_DOCUMENTO, ZONAS, camposCambiados, domicilioTexto, edadDe, fichaSugerida, labelDocumento,
  labelSexo, labelZona, municipioDeDistrito, normalizarTelefono, validarFicha, type FichaDirectorio, type FichaGuardada,
} from "@/lib/consultaExterna/trabajoSocialDirectorio";
import { BuscadorCitado, type Elegido } from "./BuscadorCitado";
import { RUTAS_TS, mensaje, useTS } from "./contexto";
import {
  Aviso, Cargando, Chips, Encabezado, OpcionTarjeta, Vacio, botonPrimario, botonSecundario, entrada, etiquetaCls, fechaCorta, inputCls,
  preguntaCls, tarjeta,
} from "./ui";

// Directorio: los datos personales y de contacto de cada paciente. Lo que trae
// la cita (nombre, expediente, DUI) se ve y no se edita; lo demás lo completan
// las trabajadoras y lo comparten entre las dos. La ficha abierta va en la
// dirección (?p=clave), así se puede llegar a ella desde una gestión.

const PAGINA = 50;
interface Datos { hoy: string; paciente: PacienteTSCE; ficha: FichaGuardada | null }
/** Lo que responde guardar: si quedó como gestión nueva, sumó a la de hoy o no había nada que cambiar. */
type Guardado = Datos & { cuenta: "nueva" | "misma" | "sin_cambios"; gestionId: string };
interface AvisoGuardado { texto: string; gestionId: string }

const SIN_CAMBIOS: AvisoGuardado = { texto: "No había cambios que guardar.", gestionId: "" };
const avisoDe = (r: Guardado): AvisoGuardado => (r.cuenta === "sin_cambios" ? SIN_CAMBIOS : {
  texto: r.cuenta === "nueva" ? "Datos guardados. Quedó como una gestión de hoy." : "Datos guardados. Ya contaba como gestión de hoy.",
  gestionId: r.gestionId,
});

const especialidades = (p: PacienteTSCE) => (p.especialidades ?? []).map((id) => especialidadPorId(id)?.nombre ?? id).join(", ");

export function DirectorioTS() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Paciente escrito a mano que aún no se guarda: todavía no tiene ficha que leer.
  const [manual, setManual] = useState<PacienteTSCE | null>(null);
  // El aviso de un paciente recién agregado a mano: su ficha se vuelve a abrir ya con su dirección.
  const [recien, setRecien] = useState<{ clave: string; aviso: AvisoGuardado } | null>(null);
  const clave = params.get("p") ?? "";

  const ruta = (c: string | null) => {
    const q = new URLSearchParams(params.toString());
    if (c) q.set("p", c); else q.delete("p");
    const s = q.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  if (manual) {
    return (
      <FichaPaciente
        key="manual"
        manual={manual}
        onVolver={() => setManual(null)}
        onGuardada={(c, aviso) => { setRecien({ clave: c, aviso }); setManual(null); router.replace(ruta(c)); }}
      />
    );
  }
  if (clave) {
    return <FichaPaciente key={clave} clave={clave} avisoInicial={recien?.clave === clave ? recien.aviso : null} onVolver={() => router.push(ruta(null))} />;
  }
  return <ListaDirectorio onAbrir={(e) => (e.manual ? setManual(e.paciente) : router.push(ruta(e.paciente.clave)))} />;
}

// ── Lista ───────────────────────────────────────────────────────────────────

function ListaDirectorio({ onAbrir }: { onAbrir: (e: Elegido) => void }) {
  const { llamar } = useTS();
  const [lista, setLista] = useState<PacienteTSCE[] | null>(null);
  const [error, setError] = useState("");
  const [limite, setLimite] = useState(PAGINA);

  useEffect(() => {
    let vivo = true;
    llamar<{ pacientes: PacienteTSCE[] }>("/pacientes?directorio=1")
      .then((r) => { if (vivo) setLista(r.pacientes); })
      .catch((e) => { if (vivo) setError(mensaje(e)); });
    return () => { vivo = false; };
  }, [llamar]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <Encabezado icono={BookUser} titulo="Directorio de pacientes" detalle="Trabajo Social de Consulta Externa" />

      <section className={`${tarjeta} p-4 md:p-5`}>
        <BuscadorCitado elegido={null} onElegir={(e) => { if (e) onAbrir(e); }} />
      </section>

      <section>
        <h2 className="mb-3 font-heading text-sm font-bold text-slate-900 dark:text-slate-100">
          Con datos completados
          {lista && lista.length > 0 && <span className="font-normal text-slate-500 dark:text-slate-400"> · {lista.length.toLocaleString("es-SV")}</span>}
        </h2>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!lista ? (!error && <Cargando />) : lista.length === 0 ? (
          <Vacio icono={BookUser} titulo="Aún no hay pacientes con datos completados" />
        ) : (
          <>
            <ul className={`${tarjeta} divide-y divide-slate-100 overflow-hidden dark:divide-slate-800`}>
              {lista.slice(0, limite).map((p) => (
                <li key={p.clave}>
                  <button
                    type="button"
                    onClick={() => onAbrir({ paciente: p, manual: false })}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <span className="hidden w-24 flex-shrink-0 font-mono text-sm font-bold text-blue-700 dark:text-cyan-300 sm:block">{p.expediente || "—"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold leading-snug text-slate-900 dark:text-white">{p.paciente}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono sm:hidden">{p.expediente ? `${p.expediente} · ` : ""}</span>
                        {p.telefono ? <>Tel. <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{p.telefono}</span></> : "Sin teléfono"}
                        {especialidades(p) && <> · {especialidades(p)}</>}
                      </span>
                    </span>
                    <ChevronRight size={16} className="flex-shrink-0 text-slate-400" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            {lista.length > limite && (
              <button type="button" onClick={() => setLimite((l) => l + PAGINA)} className={`${botonSecundario} mt-3 w-full`}>
                Mostrar más · quedan {(lista.length - limite).toLocaleString("es-SV")}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ── Ficha de un paciente ────────────────────────────────────────────────────

function FichaPaciente({ clave = "", manual, avisoInicial = null, onVolver, onGuardada }: {
  clave?: string; manual?: PacienteTSCE; avisoInicial?: AvisoGuardado | null; onVolver: () => void;
  onGuardada?: (clave: string, aviso: AvisoGuardado) => void;
}) {
  const { llamar } = useTS();
  const [datos, setDatos] = useState<Datos | null>(() => (manual ? { hoy: hoySV(), paciente: manual, ficha: null } : null));
  const [errorLectura, setErrorLectura] = useState("");
  // Con borrador se está editando; sin él, se lee la ficha.
  const [borrador, setBorrador] = useState<FichaDirectorio | null>(() => (manual ? fichaSugerida(manual) : null));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState<AvisoGuardado | null>(avisoInicial);

  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    llamar<Datos>(`/directorio?clave=${encodeURIComponent(clave)}`)
      .then((r) => {
        if (!vivo) return;
        setDatos(r);
        // Sin ficha todavía, se abre lista para llenar.
        if (!r.ficha) setBorrador(fichaSugerida(r.paciente));
      })
      .catch((e) => { if (vivo) setErrorLectura(mensaje(e)); });
    return () => { vivo = false; };
  }, [clave, llamar]);

  const volver = <button type="button" onClick={onVolver} className={botonSecundario}><ArrowLeft size={14} aria-hidden="true" />Directorio</button>;
  if (!datos) {
    return (
      <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
        <div>{volver}</div>
        {errorLectura ? <Vacio icono={FileX} titulo={errorLectura} /> : <Cargando />}
      </div>
    );
  }

  const { paciente: p, ficha, hoy } = datos;

  const guardar = async () => {
    if (!borrador) return;
    const v = validarFicha(borrador, hoy, { previa: ficha, duiDeCita: p.dui });
    if (!v.ok) { setError(v.error); return; }
    // Guardar sin haber tocado nada no escribe ni cuenta como gestión.
    if (ficha && camposCambiados(ficha, v.datos, p.dui).length === 0) { setBorrador(null); setAviso(SIN_CAMBIOS); return; }
    setGuardando(true);
    setError("");
    try {
      const r = await llamar<Guardado>("/directorio", "PUT", {
        ...(manual ? { manual: { expediente: p.expediente, dui: p.dui, paciente: p.paciente } } : { clave: p.clave }),
        ficha: v.datos,
      });
      setDatos({ hoy: r.hoy, paciente: r.paciente, ficha: r.ficha });
      setBorrador(null);
      setAviso(avisoDe(r));
      if (manual) onGuardada?.(r.paciente.clave, avisoDe(r));
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  const esp = especialidades(p);
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
      <div>{volver}</div>

      {/* Lo que ya se sabe del paciente por su cita. */}
      <section className={`${tarjeta} flex flex-wrap items-start justify-between gap-3 p-4 md:p-5`}>
        <div className="min-w-0">
          <h1 className="font-heading text-xl font-bold leading-snug text-slate-900 dark:text-slate-100">{p.paciente}</h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            {p.expediente ? <span className="font-mono font-bold text-blue-700 dark:text-cyan-300">{p.expediente}</span> : "Sin expediente"}
            {p.dui && <> · DUI <span className="font-mono">{p.dui}</span></>}
            {esp && <> · {esp}</>}
          </p>
          {(p.ultima || p.medico || p.manual) && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {[p.ultima && `Última cita ${fechaCorta(p.ultima)}`, p.medico, p.manual && "Escrito a mano, sin cita cargada"].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {ficha && !borrador && (
          <button type="button" onClick={() => { setBorrador(ficha); setAviso(null); setError(""); }} className={botonSecundario}>
            <Pencil size={14} aria-hidden="true" />Editar datos
          </button>
        )}
      </section>

      {aviso && !borrador && (
        <Aviso tipo="exito">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span>{aviso.texto}</span>
            {aviso.gestionId && (
              <Link prefetch={false} href={RUTAS_TS.gestion(aviso.gestionId)} className="font-semibold underline underline-offset-2">Ver la gestión</Link>
            )}
          </div>
        </Aviso>
      )}

      {borrador ? (
        <form noValidate className={`space-y-5 ${entrada}`} onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
          {/* noValidate: los avisos son los nuestros (el del navegador sale en otro idioma y no dice qué falta). */}
          <Formulario valor={borrador} onChange={(v) => { setBorrador(v); setError(""); }} hoy={hoy} />
          {/* Siempre a la vista: para anotar solo el teléfono no hay que bajar hasta el final. */}
          <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-[var(--color-institutional-dark)] md:-mx-6 md:px-6">
            {error && <Aviso tipo="error">{error}</Aviso>}
            <div className="flex justify-end gap-2">
              {ficha && <button type="button" onClick={() => { setBorrador(null); setError(""); }} className={botonSecundario}>Cancelar</button>}
              <button type="submit" disabled={guardando} className={`${botonPrimario} px-6`}>
                {guardando && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                Guardar datos
              </button>
            </div>
          </div>
        </form>
      ) : ficha && <Lectura ficha={ficha} hoy={hoy} />}
    </div>
  );
}

// ── Lectura ─────────────────────────────────────────────────────────────────

const telefonoLink = (t: string) => (
  <a href={`tel:${t.replace(/[^\d+]/g, "")}`} className="font-semibold tabular-nums text-blue-700 underline-offset-2 hover:underline dark:text-cyan-300">{t}</a>
);

function Lectura({ ficha: f, hoy }: { ficha: FichaGuardada; hoy: string }) {
  const edad = edadDe(f, hoy);
  const domicilio = domicilioTexto(f);
  const r = f.responsable;
  const nacimiento = f.fechaNacimiento
    ? `${fechaCorta(f.fechaNacimiento)} · ${edad?.anios} años`
    : edad ? `${edad.anios} años, aproximadamente` : "";
  return (
    <div className={`space-y-3 ${entrada}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <Bloque icono={Phone} titulo="Contacto" vacio={!f.telefono && !f.correo}>
          {f.telefono && <Dato etiqueta="Teléfono" grande>{telefonoLink(f.telefono)}</Dato>}
          {f.telefono2 && <Dato etiqueta="Otro teléfono">{telefonoLink(f.telefono2)}</Dato>}
          {f.correo && (
            <Dato etiqueta="Correo">
              <a href={`mailto:${f.correo}`} className="break-all text-blue-700 underline-offset-2 hover:underline dark:text-cyan-300">{f.correo}</a>
            </Dato>
          )}
        </Bloque>
        <Bloque icono={UsersRound} titulo="Responsable" vacio={!r.nombre}>
          <Dato etiqueta="Nombre">{r.nombre}{r.parentesco && <span className="text-slate-500 dark:text-slate-400"> · {r.parentesco}</span>}</Dato>
          {r.telefono && <Dato etiqueta="Teléfono">{telefonoLink(r.telefono)}</Dato>}
        </Bloque>
        <Bloque icono={IdCard} titulo="Datos personales" vacio={!f.documentoNumero && !f.sexo && !nacimiento && !f.nacionalidad}>
          {f.documentoNumero && <Dato etiqueta={labelDocumento(f.documentoTipo)}><span className="font-mono">{f.documentoNumero}</span></Dato>}
          {nacimiento && <Dato etiqueta={f.fechaNacimiento ? "Nacimiento" : "Edad"}>{nacimiento}</Dato>}
          {f.sexo && <Dato etiqueta="Sexo">{labelSexo(f.sexo)}</Dato>}
          {f.nacionalidad && <Dato etiqueta="Nacionalidad">{f.nacionalidad}</Dato>}
        </Bloque>
        <Bloque icono={MapPin} titulo="Domicilio" vacio={!domicilio && !f.zona}>
          {domicilio && <Dato etiqueta={f.residencia === "exterior" ? "Vive fuera del país" : "Dirección"}>{domicilio}</Dato>}
          {f.zona && <Dato etiqueta="Zona">{labelZona(f.zona)}</Dato>}
        </Bloque>
      </div>
      {f.actualizadoEnMs > 0 && (
        <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
          Actualizado por {f.actualizadoPorNombre} · {new Date(f.actualizadoEnMs).toLocaleString("es-SV", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
    </div>
  );
}

function Bloque({ icono: Icono, titulo, vacio, children }: { icono: LucideIcon; titulo: string; vacio: boolean; children: React.ReactNode }) {
  return (
    <section className={`${tarjeta} p-4`}>
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-800 dark:text-blue-300">
        <Icono size={14} aria-hidden="true" />{titulo}
      </h2>
      {vacio ? <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">Sin datos</p> : <dl className="mt-3 space-y-2.5">{children}</dl>}
    </section>
  );
}

function Dato({ etiqueta, grande = false, children }: { etiqueta: string; grande?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{etiqueta}</dt>
      <dd className={`${grande ? "text-lg" : "text-sm"} text-slate-900 dark:text-slate-100`}>{children}</dd>
    </div>
  );
}

// ── Formulario ──────────────────────────────────────────────────────────────

function Formulario({ valor: v, onChange, hoy }: { valor: FichaDirectorio; onChange: (v: FichaDirectorio) => void; hoy: string }) {
  const id = useId();
  const cambiar = (c: Partial<FichaDirectorio>) => onChange({ ...v, ...c });
  const responsable = (c: Partial<FichaDirectorio["responsable"]>) => cambiar({ responsable: { ...v.responsable, ...c } });
  // Quien no sabe la fecha de nacimiento anota la edad.
  const [soloEdad, setSoloEdad] = useState(v.edad !== null && !v.fechaNacimiento);
  const edad = edadDe(v, hoy);
  const esDui = v.documentoTipo === "dui";
  const extranjera = v.nacionalidad !== NACIONALIDAD_SV;
  const sinDomicilioSV = !v.zona && !v.departamento && !v.direccion;

  /** Al salir del campo el teléfono queda con su guion; uno mal escrito se deja para que el aviso lo señale. */
  const alSalirTelefono = (t: string, poner: (t: string) => void) => {
    const n = normalizarTelefono(t);
    if (n !== null && n !== t) poner(n);
  };

  return (
    <>
      <Seccion icono={Phone} titulo="Contacto">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Teléfono" htmlFor={`${id}-tel`}>
            <input id={`${id}-tel`} type="tel" inputMode="tel" autoComplete="off" value={v.telefono} maxLength={20} placeholder="0000-0000"
              onChange={(e) => cambiar({ telefono: e.target.value })} onBlur={() => alSalirTelefono(v.telefono, (telefono) => cambiar({ telefono }))} className={`${inputCls} tabular-nums`} />
          </Campo>
          <Campo etiqueta="Otro teléfono" htmlFor={`${id}-tel2`}>
            <input id={`${id}-tel2`} type="tel" inputMode="tel" autoComplete="off" value={v.telefono2} maxLength={20} placeholder="0000-0000"
              onChange={(e) => cambiar({ telefono2: e.target.value })} onBlur={() => alSalirTelefono(v.telefono2, (telefono2) => cambiar({ telefono2 }))} className={`${inputCls} tabular-nums`} />
          </Campo>
        </div>
        <Campo etiqueta="Correo electrónico" htmlFor={`${id}-correo`}>
          <input id={`${id}-correo`} type="email" inputMode="email" autoComplete="off" spellCheck={false} value={v.correo} maxLength={120}
            placeholder="nombre@correo.com" onChange={(e) => cambiar({ correo: e.target.value })} className={`${inputCls} sm:max-w-md`} />
        </Campo>
      </Seccion>

      <Seccion icono={IdCard} titulo="Datos personales">
        <div>
          <p className={preguntaCls}>Documento de identidad</p>
          <Chips opciones={TIPOS_DOCUMENTO} valor={v.documentoTipo} onChange={(documentoTipo) => cambiar({ documentoTipo })} etiqueta="Tipo de documento" limpiar />
          {v.documentoTipo && (
            <div className="mt-3 sm:max-w-xs">
              <label htmlFor={`${id}-doc`} className={etiquetaCls}>{v.documentoTipo === "otro" ? "Número del documento" : `Número de ${esDui ? "DUI" : labelDocumento(v.documentoTipo).toLowerCase()}`}</label>
              <input
                id={`${id}-doc`}
                value={v.documentoNumero}
                maxLength={30}
                autoComplete="off"
                spellCheck={false}
                inputMode={esDui ? "numeric" : undefined}
                placeholder={esDui ? "00000000-0" : ""}
                onChange={(e) => cambiar({ documentoNumero: e.target.value })}
                // Al salir queda como se guardará: el DUI con su guion, lo demás en mayúsculas.
                onBlur={() => cambiar({ documentoNumero: esDui ? normalizarDui(v.documentoNumero) || v.documentoNumero : v.documentoNumero.trim().toUpperCase() })}
                className={`${inputCls} font-mono`}
              />
            </div>
          )}
        </div>

        <div>
          <p className={preguntaCls}>Nacimiento</p>
          <Chips
            opciones={[{ id: "fecha", label: "Fecha de nacimiento" }, { id: "edad", label: "Solo la edad" }]}
            valor={soloEdad ? "edad" : "fecha"}
            onChange={(m) => { setSoloEdad(m === "edad"); cambiar(m === "edad" ? { fechaNacimiento: "" } : { edad: null }); }}
            etiqueta="Qué se sabe del nacimiento"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {soloEdad ? (
              <>
                <input
                  value={v.edad ?? ""}
                  inputMode="numeric"
                  aria-label="Edad en años"
                  onChange={(e) => { const n = e.target.value.replace(/\D/g, "").slice(0, 3); cambiar({ edad: n === "" ? null : Number(n) }); }}
                  className={`${inputCls} !w-24 tabular-nums`}
                />
                <span className="text-sm text-slate-600 dark:text-slate-300">años</span>
              </>
            ) : (
              <>
                <div className="w-52">
                  <DateField value={v.fechaNacimiento} onChange={(fechaNacimiento) => cambiar({ fechaNacimiento })} ariaLabel="Fecha de nacimiento"
                    placeholder="Fecha de nacimiento" fromYear={1900} maxDate={new Date(`${hoy}T00:00:00`)} clearable />
                </div>
                {v.fechaNacimiento && edad && <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{edad.anios} años</span>}
              </>
            )}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className={preguntaCls}>Sexo</p>
            <Chips opciones={SEXOS} valor={v.sexo} onChange={(sexo) => cambiar({ sexo })} etiqueta="Sexo" limpiar />
          </div>
          <div>
            <p className={preguntaCls}>Nacionalidad</p>
            <Chips
              opciones={[{ id: "sv", label: NACIONALIDAD_SV }, { id: "otra", label: "Otra" }]}
              valor={extranjera ? "otra" : "sv"}
              onChange={(n) => cambiar(n === "sv"
                ? { nacionalidad: NACIONALIDAD_SV }
                // Un extranjero suele vivir fuera: se propone, si aún no se le anotó domicilio aquí.
                : { nacionalidad: extranjera ? v.nacionalidad : "", ...(sinDomicilioSV ? { residencia: "exterior" as const } : {}) })}
              etiqueta="Nacionalidad"
            />
            {extranjera && (
              <>
                <input value={v.nacionalidad} maxLength={60} list={`${id}-nacionalidades`} aria-label="Cuál nacionalidad" placeholder="Hondureña, guatemalteca…"
                  onChange={(e) => cambiar({ nacionalidad: e.target.value })} onBlur={() => cambiar({ nacionalidad: nombrePropio(v.nacionalidad) })} className={`${inputCls} mt-3`} />
                <datalist id={`${id}-nacionalidades`}>{NACIONALIDADES.map((n) => <option key={n} value={n} />)}</datalist>
              </>
            )}
          </div>
        </div>
      </Seccion>

      <Seccion icono={MapPin} titulo="Domicilio">
        <div>
          <p className={preguntaCls}>¿Dónde vive?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <OpcionTarjeta activo={v.residencia === "sv"} onClick={() => cambiar({ residencia: "sv" })} icono={House} titulo="En El Salvador" />
            <OpcionTarjeta activo={v.residencia === "exterior"} onClick={() => cambiar({ residencia: "exterior" })} icono={Globe} titulo="En otro país" />
          </div>
        </div>
        {v.residencia === "sv" ? (
          <>
            <div>
              <p className={preguntaCls}>Zona</p>
              <Chips opciones={ZONAS} valor={v.zona} onChange={(zona) => cambiar({ zona })} etiqueta="Zona" limpiar />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Departamento" htmlFor={`${id}-depto`}>
                <select id={`${id}-depto`} value={v.departamento} onChange={(e) => cambiar({ departamento: e.target.value, municipio: "", distrito: "" })} className={inputCls}>
                  <option value="">Elija el departamento</option>
                  {DEPARTAMENTOS_SV.map((d) => <option key={d.nombre} value={d.nombre}>{d.nombre}</option>)}
                </select>
              </Campo>
              {/* Se busca por el nombre de siempre (Soyapango): el municipio nuevo sale solo. */}
              <Campo etiqueta="Municipio y distrito" htmlFor={`${id}-distrito`}>
                <select
                  id={`${id}-distrito`}
                  value={v.distrito}
                  disabled={!v.departamento}
                  onChange={(e) => cambiar({ distrito: e.target.value, municipio: municipioDeDistrito(v.departamento, e.target.value) })}
                  className={`${inputCls} disabled:opacity-50`}
                >
                  <option value="">{v.departamento ? "Elija el distrito" : "Primero el departamento"}</option>
                  {municipiosDe(v.departamento).map((m) => (
                    <optgroup key={m.nombre} label={m.nombre}>
                      {m.distritos.map((d) => <option key={d} value={d}>{d}</option>)}
                    </optgroup>
                  ))}
                </select>
                {v.municipio && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Municipio: <span className="font-semibold text-slate-700 dark:text-slate-200">{v.municipio}</span></p>}
              </Campo>
            </div>
            <Campo etiqueta="Dirección" htmlFor={`${id}-dir`}>
              <input id={`${id}-dir`} value={v.direccion} maxLength={240} autoComplete="off" placeholder="Colonia, calle, número de casa"
                onChange={(e) => cambiar({ direccion: e.target.value })} className={inputCls} />
            </Campo>
          </>
        ) : (
          <>
            <Campo etiqueta="País" htmlFor={`${id}-pais`}>
              <input id={`${id}-pais`} value={v.pais} maxLength={60} list={`${id}-paises`} autoComplete="off"
                onChange={(e) => cambiar({ pais: e.target.value })} onBlur={() => cambiar({ pais: nombrePropio(v.pais) })} className={`${inputCls} sm:max-w-xs`} />
              <datalist id={`${id}-paises`}>{PAISES.map((n) => <option key={n} value={n} />)}</datalist>
            </Campo>
            <Campo etiqueta="Dirección completa" htmlFor={`${id}-dir`}>
              <input id={`${id}-dir`} value={v.direccion} maxLength={240} autoComplete="off" placeholder="En una sola línea: calle, ciudad, estado o provincia"
                onChange={(e) => cambiar({ direccion: e.target.value })} className={inputCls} />
            </Campo>
          </>
        )}
      </Seccion>

      <Seccion icono={UsersRound} titulo="Responsable">
        <Campo etiqueta="Nombre" htmlFor={`${id}-resp`}>
          <input id={`${id}-resp`} value={v.responsable.nombre} maxLength={160} autoComplete="off"
            onChange={(e) => responsable({ nombre: e.target.value })} onBlur={() => responsable({ nombre: nombrePropio(v.responsable.nombre) })} className={inputCls} />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Parentesco" htmlFor={`${id}-parentesco`}>
            <select id={`${id}-parentesco`} value={v.responsable.parentesco} onChange={(e) => responsable({ parentesco: e.target.value })} className={inputCls}>
              <option value="">Elija el parentesco</option>
              {PARENTESCOS.map((x) => <option key={x} value={x}>{x}</option>)}
              {/* Un parentesco guardado que ya no esté en la lista no se pierde. */}
              {v.responsable.parentesco && !(PARENTESCOS as readonly string[]).includes(v.responsable.parentesco) && <option value={v.responsable.parentesco}>{v.responsable.parentesco}</option>}
            </select>
          </Campo>
          <Campo etiqueta="Teléfono" htmlFor={`${id}-resp-tel`}>
            <input id={`${id}-resp-tel`} type="tel" inputMode="tel" autoComplete="off" value={v.responsable.telefono} maxLength={20} placeholder="0000-0000"
              onChange={(e) => responsable({ telefono: e.target.value })} onBlur={() => alSalirTelefono(v.responsable.telefono, (telefono) => responsable({ telefono }))} className={`${inputCls} tabular-nums`} />
          </Campo>
        </div>
      </Seccion>
    </>
  );
}

function Seccion({ icono: Icono, titulo, children }: { icono: LucideIcon; titulo: string; children: React.ReactNode }) {
  return (
    <section className={`${tarjeta} p-4 md:p-5`}>
      <h2 className="flex items-center gap-2 font-heading text-base font-bold text-slate-900 dark:text-slate-100">
        <Icono size={18} className="text-cyan-700 dark:text-cyan-300" aria-hidden="true" />{titulo}
      </h2>
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}

function Campo({ etiqueta, htmlFor, children }: { etiqueta: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={preguntaCls}>{etiqueta}</label>
      {children}
    </div>
  );
}
