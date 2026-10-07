// Primera etapa de HON: vista previa a partir del censo, sin registrar pagos.
// El diseño original calcula al recibir el pago de un paquete mensual.
// Aquí la base es el censo cerrado; no representa dinero recibido del ISBM.
export interface CensoParaHonorarios {
  id: number;
  medico_tratante_nombre: string | null;
  total_cobrable_dia: number | null;
}

export interface ParticipacionMedico {
  nombre: string;
  dias: number; // Días-paciente: cada fila de censo cuenta una participación.
  porcentaje: number;
  estimadoCentavos: number | null;
}

export function resumirHonorarios(censos: CensoParaHonorarios[]) {
  const baseCentavos = censos.reduce((total, c) => total + Math.round((c.total_cobrable_dia ?? 0) * 100), 0);
  const profesionalesCentavos = Math.round(baseCentavos * 30 / 100);
  const hospitalCentavos = baseCentavos - profesionalesCentavos;
  const conteo = new Map<string, { nombre: string; dias: number }>();
  let sinMedico = 0;
  let sinTotal = 0;
  for (const censo of censos) {
    if (censo.total_cobrable_dia === null) sinTotal++;
    const nombre = censo.medico_tratante_nombre?.trim().replace(/\s+/g, " ");
    if (!nombre) { sinMedico++; continue; }
    // El censo actual guarda nombres, no el uid del médico. Solo agrupamos
    // variantes de mayúsculas/espacios; no unimos nombres con otra ortografía.
    const clave = nombre.toLocaleLowerCase("es");
    const fila = conteo.get(clave) ?? { nombre, dias: 0 };
    fila.dias++;
    conteo.set(clave, fila);
  }
  const diasIdentificados = censos.length - sinMedico;
  const completo = censos.length > 0 && sinMedico === 0 && sinTotal === 0;
  const medicos: ParticipacionMedico[] = [...conteo.values()]
    .sort((a,b) => b.dias - a.dias || a.nombre.localeCompare(b.nombre, "es"))
    .map(m => ({ ...m, porcentaje: m.dias / diasIdentificados * 100, estimadoCentavos: completo ? Math.floor(profesionalesCentavos * m.dias / diasIdentificados) : null }));
  if (completo) {
    // Distribuir centavos restantes por mayor residuo evita que el reparto
    // exceda el fondo o produzca una línea negativa con importes pequeños.
    const residuos = medicos.map((m, i) => ({ i, resto: profesionalesCentavos * m.dias % diasIdentificados }))
      .sort((a,b) => b.resto - a.resto || a.i - b.i);
    const faltan = profesionalesCentavos - medicos.reduce((s,m) => s + (m.estimadoCentavos ?? 0), 0);
    for (let i = 0; i < faltan; i++) medicos[residuos[i].i].estimadoCentavos!++;
  }
  return { baseCentavos, profesionalesCentavos, hospitalCentavos, medicos, sinMedico, sinTotal, diasIdentificados, diasCenso: censos.length, completo };
}
