"use client";

import { Suspense } from "react";
import { DirectorioTS } from "@/components/consultaExterna/ts/DirectorioTS";
import { ProveedorTS } from "@/components/consultaExterna/ts/contexto";

// Directorio: datos personales y de contacto de los pacientes. La ficha abierta
// va en la dirección (?p=clave); useSearchParams pide un límite de Suspense.
export default function Pagina() {
  return (
    <ProveedorTS>
      <Suspense fallback={null}>
        <DirectorioTS />
      </Suspense>
    </ProveedorTS>
  );
}
