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

// El autoregistro de médicos usa el JVPM como alias de login. Se normaliza a
// minúsculas y se quitan los espacios para que sea un username válido (ej.
// "ABCD 1234" → "abcd1234"). Las letras/números/.-_ se conservan.
export function jvpmAUsername(jvpm: unknown): string {
  return String(jvpm ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

// Correo sintético para médicos que se autoregistran (no tienen correo real;
// inician sesión con su JVPM como usuario).
export function emailSinteticoMedico(username: string): string {
  return `${username}@medico.esdomed.local`;
}
