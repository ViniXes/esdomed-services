export function valorIndicadorGlobal(
  indicadores: ReadonlyArray<{ id: number; valor: number | null }>,
  id: number,
): number | null {
  return indicadores.find(indicador => indicador.id === id)?.valor ?? null;
}
