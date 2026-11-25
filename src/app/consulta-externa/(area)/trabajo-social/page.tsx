"use client";

import { SeguimientoGestiones } from "@/components/consultaExterna/ts/SeguimientoGestiones";
import { ProveedorTS } from "@/components/consultaExterna/ts/contexto";

// Seguimiento: la lista de gestiones abiertas. Es la página de entrada de
// Trabajo Social de Consulta Externa.
export default function Pagina() {
  return (
    <ProveedorTS>
      <SeguimientoGestiones />
    </ProveedorTS>
  );
}
