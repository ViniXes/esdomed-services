import { deleteField, doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { clavePalabra, reglasDeMapa, type ReglaPronunciacion } from "./pronunciacion";

// configuracion/pronunciacion_ce: { reglas: { [clave]: { escrito, leido } } }.
// Un mapa por clave y no un arreglo: agregar o quitar una regla es una
// escritura con merge, sin leer antes ni pisar lo que otro agregó a la vez.
// `configuracion` es de lectura pública, así que la pantalla lo lee con
// cualquier cuenta (también la de una estación).

const REF = () => doc(db, "configuracion", "pronunciacion_ce");

/** En vivo: el documento casi nunca cambia, así que cuesta 1 lectura al abrir. */
export function escucharPronunciacion(
  alCambiar: (reglas: ReglaPronunciacion[]) => void,
  alFallar?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    REF(),
    (snap) => alCambiar(reglasDeMapa(snap.data()?.reglas)),
    (e) => {
      console.error("No se pudo leer el diccionario de pronunciación", e);
      alFallar?.(e);
    },
  );
}

export async function guardarReglaPronunciacion(regla: ReglaPronunciacion, porNombre: string): Promise<void> {
  const escrito = regla.escrito.trim();
  await setDoc(
    REF(),
    {
      reglas: { [clavePalabra(escrito)]: { escrito, leido: regla.leido.replace(/\s+/g, " ").trim() } },
      actualizadoEn: serverTimestamp(),
      actualizadoPorNombre: porNombre,
    },
    { merge: true },
  );
}

export async function quitarReglaPronunciacion(escrito: string, porNombre: string): Promise<void> {
  await setDoc(
    REF(),
    { reglas: { [clavePalabra(escrito)]: deleteField() }, actualizadoEn: serverTimestamp(), actualizadoPorNombre: porNombre },
    { merge: true },
  );
}
