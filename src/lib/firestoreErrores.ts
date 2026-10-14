// Errores de consultas de Firestore presentables al usuario.

export interface ErrorConsulta { mensaje: string; enlaceIndice?: string }

/** Si falta un índice compuesto, el mensaje de Firestore trae el enlace para crearlo. */
export function describirError(e: unknown): ErrorConsulta {
  const msg = e instanceof Error ? e.message : String(e);
  const enlaceIndice = msg.match(/https:\/\/console\.firebase\.google\.com\/\S+/)?.[0];
  if (enlaceIndice) {
    return { mensaje: "Falta un índice de Firestore para esta consulta. Un administrador debe crearlo una sola vez.", enlaceIndice };
  }
  return { mensaje: "No se pudo consultar. Verifica tu conexión e intenta de nuevo." };
}
