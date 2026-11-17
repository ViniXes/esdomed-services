// Voz de los llamados de Consulta Externa. Usa la síntesis de voz del navegador
// (Web Speech API): sin costo y sin backend. La calidad depende del equipo: en
// Windows, Microsoft Edge trae voces "Natural" en español (p. ej. Lorena, de
// El Salvador) que suenan casi humanas; Chrome ofrece "Google español". Esas
// voces naturales dicen en inglés los nombres de origen inglés (Kevin,
// Jennifer…): para eso está el diccionario de pronunciación.ts.
//
// El navegador bloquea el sonido hasta el primer clic en la página, así que la
// pantalla de llamados pide un clic en "Activar sonido" al arrancar (o se abre
// Edge en modo kiosco con autoplay permitido).

export function vozDisponible(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// El Salvador primero: Edge trae voces naturales de aquí (Lorena, Rodrigo).
const PREFERENCIA_REGION = ["es-SV", "es-MX", "es-US", "es-419", "es-GT", "es-HN", "es-ES"];

// Calidad: las "Natural" de Edge suenan casi humanas; las de Google (Chrome)
// son buenas; las de escritorio de Windows (Sabina, Raúl) suenan robóticas.
function puntaje(v: VozBasica): number {
  let p = 0;
  if (/natural|neural/i.test(v.name)) p += 200;
  // Las "Multilingual" cambian de idioma según el texto: con un nombre inglés
  // leerían todo el llamado en inglés.
  if (/multilingual/i.test(v.name)) p -= 150;
  else if (/google/i.test(v.name)) p += 100;
  const region = PREFERENCIA_REGION.indexOf(v.lang);
  p += region >= 0 ? 50 - region * 5 : 0;
  return p;
}

/**
 * Avisa cada vez que cambia la lista de voces: el navegador las va cargando de
 * a poco (las locales primero, las en línea después). Devuelve cómo dejar de escuchar.
 */
export function alCambiarVoces(cb: (voces: SpeechSynthesisVoice[]) => void): () => void {
  if (!vozDisponible()) return () => {};
  const avisar = () => cb(vocesEspanol());
  window.speechSynthesis.addEventListener("voiceschanged", avisar);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", avisar);
}

type VozBasica = Pick<SpeechSynthesisVoice, "name" | "lang">;

/** Solo las voces en español, la más recomendable primero. */
export function ordenarVoces<V extends VozBasica>(voces: V[]): V[] {
  return voces
    .filter((v) => v.lang.toLowerCase().startsWith("es"))
    .sort((a, b) => puntaje(b) - puntaje(a) || a.name.localeCompare(b.name));
}

/** Voces en español del equipo, la más recomendable primero. */
export function vocesEspanol(): SpeechSynthesisVoice[] {
  if (!vozDisponible()) return [];
  return ordenarVoces(window.speechSynthesis.getVoices());
}

/**
 * La voz elegida en este equipo, si sigue disponible; si no, la más
 * recomendable. Nunca una voz que no sea en español: con una en inglés el
 * llamado entero sonaría en inglés.
 */
export function elegirVoz<V extends VozBasica>(vocesOrdenadas: V[], nombreGuardado: string | null | undefined): V | null {
  return vocesOrdenadas.find((v) => v.name === nombreGuardado) ?? vocesOrdenadas[0] ?? null;
}

/** "Microsoft Lorena Online (Natural) - Spanish (El Salvador)" → "Lorena (El Salvador)". */
export function nombreCortoVoz(nombre: string): string {
  const m = String(nombre ?? "").match(/^Microsoft\s+(.+?)(?:\s+Online)?(?:\s+\(Natural\))?\s+-\s+[^(]+\((.+)\)\s*$/);
  return m ? `${m[1]} (${m[2]})` : nombre;
}

/** Dónde guarda cada equipo la voz de su pantalla. */
export const CLAVE_VOZ_PANTALLA = "ce:pantalla:voz-nombre";

/** Las voces llegan después de cargar la página (evento voiceschanged). */
export function esperarVoces(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  if (!vozDisponible()) return Promise.resolve([]);
  const ya = vocesEspanol();
  if (ya.length) return Promise.resolve(ya);
  return new Promise((resolve) => {
    const listo = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", listo);
      clearTimeout(t);
      resolve(vocesEspanol());
    };
    const t = setTimeout(listo, timeoutMs);
    window.speechSynthesis.addEventListener("voiceschanged", listo);
  });
}

const minusculaInicial = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/**
 * Texto que se lee (pedido del usuario, 2026-11-17): expediente, nombre y la
 * estación, sin consultorio. "Expediente 11431 guion 26, María Pilar López
 * Gonzales. Acercarse a estación Cardiología." El guion se dice, para que el
 * número no se lea como una resta. Los llamados anteriores solo traen código:
 * sus letras se separan para que se deletreen ("HE-12" → "hache, e, doce").
 */
export function textoLlamado(l: { paciente?: string; expediente?: string; codigo?: string; destino: string }): string {
  const destino = `Acercarse a ${minusculaInicial(String(l.destino ?? "").trim())}.`;
  if (l.paciente) {
    const expediente = l.expediente ? `Expediente ${l.expediente.replace(/-/g, " guion ")}, ` : "";
    return `${expediente}${l.paciente}. ${destino}`;
  }
  const [letras = "", numero = ""] = String(l.codigo ?? "").split("-");
  const deletreo = letras.split("").join(" ");
  return `Turno ${deletreo} ${Number(numero) || numero}. ${destino}`;
}

// Un solo AudioContext para toda la página: crearlo y cerrarlo en cada llamado
// agregaba demora, sobre todo en el primero.
let ctxCompartido: AudioContext | null = null;
function contextoAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctxCompartido) return ctxCompartido;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  ctxCompartido = Ctx ? new Ctx() : null;
  return ctxCompartido;
}

/**
 * Llamarlo dentro de un clic (activar sonido, activar voz): deja listo el audio
 * y "despierta" la voz con un aviso audible, para que el primer llamado real no
 * tarde (las voces en línea descargan su motor la primera vez que hablan).
 */
export async function prepararSonido(voz?: SpeechSynthesisVoice | null): Promise<void> {
  const ctx = contextoAudio();
  if (ctx?.state === "suspended") await ctx.resume().catch(() => {});
  await tocarAviso();
  await anunciar("Sonido activado.", voz);
}

/** "Din-don" corto antes del anuncio, generado con Web Audio (sin archivo). */
export async function tocarAviso(): Promise<void> {
  const ctx = contextoAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  const nota = (frecuencia: number, inicio: number, duracion: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frecuencia;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + inicio + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracion);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + inicio);
    osc.stop(ctx.currentTime + inicio + duracion);
  };
  nota(880, 0, 0.5); // la
  nota(659.25, 0.35, 0.7); // mi
  await new Promise((r) => setTimeout(r, 1000));
}

/** Veces que se lee cada llamado con un solo clic (pedido del usuario: 2). */
export const REPETICIONES_LLAMADO = 2;
const PAUSA_ENTRE_REPETICIONES_MS = 700;

/** Un llamado completo: un "din-don" y el texto leído REPETICIONES_LLAMADO veces. */
export async function anunciarLlamado(
  texto: string,
  voz?: SpeechSynthesisVoice | null,
  velocidad?: number,
): Promise<void> {
  await tocarAviso();
  for (let i = 0; i < REPETICIONES_LLAMADO; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSA_ENTRE_REPETICIONES_MS));
    await anunciar(texto, voz, velocidad);
  }
}

/** Lee el texto y resuelve al terminar (o si falla, para no trabar la cola). */
export function anunciar(texto: string, voz?: SpeechSynthesisVoice | null, velocidad = 0.9): Promise<void> {
  if (!vozDisponible()) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = voz?.lang ?? "es-MX";
    if (voz) u.voice = voz;
    u.rate = velocidad;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}
