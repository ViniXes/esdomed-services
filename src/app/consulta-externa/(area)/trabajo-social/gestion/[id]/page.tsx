"use client";

import { use } from "react";
import { DetalleGestion } from "@/components/consultaExterna/ts/DetalleGestion";
import { ProveedorTS } from "@/components/consultaExterna/ts/contexto";

// Seguimiento de una gestión: sus notas y su cierre.
export default function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <ProveedorTS>
      <DetalleGestion key={id} id={id} />
    </ProveedorTS>
  );
}
