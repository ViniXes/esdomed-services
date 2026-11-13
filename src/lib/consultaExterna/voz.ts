// Voz de los llamados de Consulta Externa. Usa la síntesis de voz del navegador
// (Web Speech API): sin costo y sin backend. La calidad depende del equipo: en
// Windows, Microsoft Edge trae voces "Natural" en español (p. ej. Dalia, de
// México) que suenan casi humanas; Chrome ofrece "Google español".
//
// El navegador bloquea el sonido hasta el primer clic en la página, así que la
// pantalla de llamados pide un clic en "Activar sonido" al arrancar (o se abre
// Edge en modo kiosco con autoplay permitido).

export function vozDisponible(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

const PREFERENCIA_REGION = ["es-MX", "es-US", "es-419", "es-SV", "es-ES"];

// Calidad: las "Natural" de Edge suenan casi humanas; las de Google (Chrome)
// son buenas; las de escritorio de Windows (Sabina, Raúl) suenan robóticas.
function puntaje(v: SpeechSynthesisVoice): number {
  let p = 0;
  if (/natural|neural/i.test(v.name)) p += 200;
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

/** Voces en español del equipo, la más recomendable primero. */
export function vocesEspanol(): SpeechSynthesisVoice[] {
  if (!vozDisponible()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("es"))
    .sort((a, b) => puntaje(b) - puntaje(a) || a.name.localeCompare(b.name));
}

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

/**
 * Texto que se lee: las letras del código separadas para que se deletreen
 * ("HE-12" → "H E 12": "hache, e, doce") y el destino tal cual.
 */
export function textoLlamado(codigo: string, destino: string): string {
  const [letras = "", numero = ""] = codigo.split("-");
  const deletreo = letras.split("").join(" ");
  return `Turno ${deletreo} ${Number(numero) || numero}. Pase a ${destino}.`;
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
