// Búsqueda de una cita del día para marcar la llegada (estación y recepción):
// por código ("CA-07", "ca7"), expediente, DUI o nombre. Pura y sin imports:
// la prueba scripts/test-consulta-externa.mjs.

interface CitaBuscable {
  codigo: string;
  expediente: string;
  dui: string;
  paciente: string;
}

const plano = (v: string): string =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "CA-07" → "ca7"; "ca 07" → "ca7". Para comparar códigos sin guion ni ceros. */
const codigoPlano = (v: string): string => plano(v).replace(/[\s-]/g, "").replace(/^([a-z]+)0+(\d)/, "$1$2");

export function coincideCita(cita: CitaBuscable, consulta: string): boolean {
  const q = plano(consulta).trim();
  if (q.length < 2) return false;

  if (/^[a-z]{2}[\s-]?\d+$/.test(q)) return codigoPlano(cita.codigo) === codigoPlano(q);

  const digitos = q.replace(/\D/g, "");
  if (digitos && /^[\d\s-]+$/.test(q)) {
    return cita.expediente.replace(/\D/g, "").startsWith(digitos) || cita.dui.replace(/\D/g, "").startsWith(digitos);
  }

  const nombre = plano(cita.paciente).replace(/,/g, " ");
  return q.split(/\s+/).every((palabra) => nombre.includes(palabra));
}

export function buscarCitas<T extends CitaBuscable>(citas: T[], consulta: string, max = 8): T[] {
  return citas.filter((c) => coincideCita(c, consulta)).slice(0, max);
}
