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
export const env: AppEnv = validateEnv(process.env as RawEnv);
