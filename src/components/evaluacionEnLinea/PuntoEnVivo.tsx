/** Punto verde que palpita: la evaluación en línea está en marcha. */
export function PuntoEnVivo({ className = "", etiqueta = "En marcha" }: { className?: string; etiqueta?: string }) {
  return (
    <span className={`relative inline-flex h-2.5 w-2.5 shrink-0 ${className}`} role="img" aria-label={etiqueta} title={etiqueta}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
      <span className="relative inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" />
    </span>
  );
}
