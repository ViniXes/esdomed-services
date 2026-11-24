"use client";

import { TableroTS } from "@/components/consultaExterna/ts/TableroTS";
import { ProveedorTS } from "@/components/consultaExterna/ts/contexto";

export default function Pagina() {
  return (
    <ProveedorTS>
      <TableroTS />
    </ProveedorTS>
  );
}
