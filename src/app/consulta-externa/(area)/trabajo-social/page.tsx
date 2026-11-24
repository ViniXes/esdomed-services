"use client";

import { RegistroGestiones } from "@/components/consultaExterna/ts/RegistroGestiones";
import { ProveedorTS } from "@/components/consultaExterna/ts/contexto";

export default function Pagina() {
  return (
    <ProveedorTS>
      <RegistroGestiones />
    </ProveedorTS>
  );
}
