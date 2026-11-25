"use client";

import { ActividadesTS } from "@/components/consultaExterna/ts/ActividadesTS";
import { ProveedorTS } from "@/components/consultaExterna/ts/contexto";

// Charlas, reuniones y lo demás que no es de un paciente.
export default function Pagina() {
  return (
    <ProveedorTS>
      <ActividadesTS />
    </ProveedorTS>
  );
}
