"use client";

// Catálogo vivo del personal médico de los censos de emergencia: las listas
// oficiales de censos.ts más lo que los médicos agregan desde el formulario.
//
// Un documento por entrada, con la clave del nombre como id: dos médicos no
// pueden duplicar un nombre y queda quién lo agregó. Las reglas solo dejan crear;
// borrar es de admin, para que nadie pueda vaciar la lista compartida.

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot, setDoc, Timestamp } from "@/lib/firestoreMeter";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { EntradaCatalogoPersonal, TipoEvaluadorEmergencia } from "@/types";
import { claveCatalogo, combinarCatalogo, nombreParaCatalogo } from "@/lib/emergencia/censos";

const COLECCION = "censo_catalogo_personal";

export type AgregarAlCatalogo = (tipo: TipoEvaluadorEmergencia, texto: string) => Promise<string>;

export function useCatalogoPersonal() {
  const { profile } = useAuth();
  const [extras, setExtras] = useState<EntradaCatalogoPersonal[]>([]);

  useEffect(() => onSnapshot(
    collection(db, COLECCION),
    (snap) => setExtras(snap.docs.map((d) => d.data() as EntradaCatalogoPersonal)),
    // Si no se puede leer, el censo sigue funcionando con las listas oficiales.
    (e) => console.warn("No se pudo leer el catálogo de personal del censo:", e.message),
  ), []);

  const catalogo = useMemo(() => combinarCatalogo(extras), [extras]);

  // Devuelve el nombre tal como quedó en el catálogo.
  const agregar = useCallback<AgregarAlCatalogo>(async (tipo, texto) => {
    if (!profile) throw new Error("La sesión no está disponible.");
    const nombre = nombreParaCatalogo(tipo, texto);
    const ref = doc(db, COLECCION, claveCatalogo(nombre));
    const previo = await getDoc(ref);
    if (previo.exists()) return (previo.data() as EntradaCatalogoPersonal).nombre;
    await setDoc(ref, {
      tipo,
      nombre,
      creadoEn: Timestamp.now(),
      creadoPorId: profile.uid,
      creadoPorNombre: profile.nombre,
    });
    return nombre;
  }, [profile]);

  return { catalogo, agregar };
}
