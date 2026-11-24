"use client";

import { BitacoraTS } from "@/components/consultaExterna/ts/BitacoraTS";
import { ProveedorTS } from "@/components/consultaExterna/ts/contexto";

// La jefatura de Trabajo Social (marca por persona) consulta lo de Consulta
// Externa desde su propio menú, sin registrar.
export default function Pagina() {
  return (
    <ProveedorTS soloConsulta>
      <BitacoraTS />
    </ProveedorTS>
  );
}
