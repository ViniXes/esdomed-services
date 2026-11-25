"use client";

import { NuevaGestion } from "@/components/consultaExterna/ts/NuevaGestion";
import { ProveedorTS } from "@/components/consultaExterna/ts/contexto";

// Gestión nueva, paso a paso.
export default function Pagina() {
  return (
    <ProveedorTS>
      <NuevaGestion />
    </ProveedorTS>
  );
}
