import { validateEnv } from '../../src/lib/env';

describe('validateEnv', () => {
  it('devuelve las variables cuando están todas presentes', () => {
    const result = validateEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-123',
    });
    expect(result).toEqual({
      supabaseUrl: 'https://x.supabase.co',
      supabaseAnonKey: 'anon-123',
      vapidPublicKey: '',
    });
  });

  it('trae vapidPublicKey cuando está presente', () => {
    const result = validateEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-123',
      EXPO_PUBLIC_VAPID_PUBLIC_KEY: 'clave-vapid',
    });
    expect(result.vapidPublicKey).toBe('clave-vapid');
  });

  it('lanza error si falta una variable requerida', () => {
    expect(() =>
      validateEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  });
});
