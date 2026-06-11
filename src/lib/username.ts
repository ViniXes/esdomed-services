// Utilidades para el username de inicio de sesión (alias del correo).
// Se guarda siempre normalizado (minúsculas, sin espacios) para que la búsqueda
// y la unicidad sean insensibles a mayúsculas.

export function normalizarUsername(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

// 3 a 30 caracteres: letras, números, punto, guion y guion bajo.
export function usernameValido(u: string): boolean {
  return /^[a-z0-9._-]{3,30}$/.test(u);
}
