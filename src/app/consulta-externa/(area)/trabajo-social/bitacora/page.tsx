"use client";

import { BitacoraTS } from "@/components/consultaExterna/ts/BitacoraTS";
import { ProveedorTS } from "@/components/consultaExterna/ts/contexto";

export default function Pagina() {
  return (
    <ProveedorTS>
      <BitacoraTS />
    </ProveedorTS>
  );
}
