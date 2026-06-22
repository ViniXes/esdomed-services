// Utilidades para el DUI (Documento Único de Identidad de El Salvador).
// Formato canónico: 8 dígitos, guion y 1 dígito verificador → "########-#".

// Deja solo dígitos y, si hay 9, inserta el guion antes del último.
export function normalizarDui(raw: unknown): string {
  const digitos = String(raw ?? "").replace(/\D/g, "").slice(0, 9);
  if (digitos.length <= 8) return digitos;
  return `${digitos.slice(0, 8)}-${digitos.slice(8)}`;
}

export function duiValido(dui: string): boolean {
  return /^\d{8}-\d$/.test(dui);
}
