type RawEnv = Record<string, string | undefined>;

export interface AppEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const REQUIRED = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'] as const;

export function validateEnv(raw: RawEnv): AppEnv {
  const missing = REQUIRED.filter((key) => !raw[key] || raw[key]!.trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno requeridas: ${missing.join(', ')}. ` +
        `Revisa tu archivo .env (usa .env.example como guía).`,
    );
  }
  return {
    supabaseUrl: raw.EXPO_PUBLIC_SUPABASE_URL!,
    supabaseAnonKey: raw.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  };
}

// Se ejecuta al importar: si falta algo, la app no arranca.
//
// OJO: hay que nombrar cada variable de forma LITERAL (`process.env.EXPO_PUBLIC_X`).
// Metro reemplaza esas expresiones por su valor al compilar, pero no puede hacerlo
// si le pasamos `process.env` entero: en ese caso el objeto llega vacío al navegador
// y la app muere al arrancar con "Faltan variables de entorno". En desarrollo no se
// nota, porque el servidor de Metro sí inyecta `process.env` — el error aparece
// recién en el sitio compilado. (Nos pasó al desplegar en Cloudflare Pages, jul-2026.)
export const env: AppEnv = validateEnv({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});
