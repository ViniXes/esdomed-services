// Cliente de Supabase del módulo ISBM.
//
// El módulo ISBM guarda sus datos (afiliaciones, censo diario, cargos,
// autorizaciones) en PostgreSQL vía Supabase — no en Firestore — para tener
// constraints, transacciones y SQL reales sobre la facturación del convenio.
// La autenticación sigue siendo Firebase Auth: Supabase acepta el ID token de
// Firebase (third-party auth) y las políticas RLS leen el custom claim
// `isbm_rol` (tecnico | supervisor | jefe) que se asigna con
// scripts/asignar-claims-isbm.mjs. Un usuario sin ese claim no puede leer ni
// escribir ninguna tabla del módulo, aunque esté logueado en la plataforma.
//
// Esquema: supabase/isbm_schema.sql (+ isbm_seed_aranceles.sql).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { auth } from "@/lib/firebase";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local"
    );
  }

  client = createClient(url, anonKey, {
    // El token de Firebase es la credencial ante Supabase. getIdToken()
    // devuelve el token cacheado y lo renueva solo cuando expira.
    accessToken: async () => (await auth.currentUser?.getIdToken()) ?? null,
  });
  return client;
}
