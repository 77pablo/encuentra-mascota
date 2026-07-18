// Traduce los errores de Supabase Auth, que llegan en inglés y en jerga de
// sistema, a algo que un vecino entienda y le diga QUÉ HACER.
//
// Nos pasó en producción: al registrarse con un correo ya usado, la app mostraba
// "User already registered" tal cual. Ese cartel no le sirve a nadie.
//
// La coincidencia es por fragmento y sin distinguir mayúsculas, porque Supabase
// cambia la redacción exacta entre versiones (y a veces mete datos en el medio,
// como los segundos de espera).

type Regla = { contiene: string; mensaje: string };

const REGLAS: Regla[] = [
  {
    contiene: 'user already registered',
    mensaje: 'Ese correo ya está vinculado a una cuenta. Iniciá sesión, o recuperá tu contraseña si no la recordás.',
  },
  {
    contiene: 'invalid login credentials',
    mensaje: 'El correo o la contraseña no coinciden. Revisalos e intentá de nuevo.',
  },
  {
    contiene: 'email not confirmed',
    mensaje: 'Todavía no confirmaste tu correo. Buscá el mail que te mandamos y hacé clic en el enlace.',
  },
  {
    contiene: 'password should be at least',
    mensaje: 'La contraseña es muy corta: necesita al menos 6 caracteres.',
  },
  {
    contiene: 'unable to validate email address',
    mensaje: 'Ese correo no parece estar bien escrito. Revisalo y probá de nuevo.',
  },
  {
    contiene: 'invalid email',
    mensaje: 'Ese correo no parece estar bien escrito. Revisalo y probá de nuevo.',
  },
  {
    contiene: 'for security purposes',
    mensaje: 'Esperá unos segundos antes de volver a intentarlo.',
  },
  {
    contiene: 'rate limit',
    mensaje: 'Hubo demasiados intentos seguidos. Probá de nuevo en un rato.',
  },
  {
    contiene: 'new password should be different',
    mensaje: 'La contraseña nueva tiene que ser distinta de la anterior.',
  },
  {
    contiene: 'same password',
    mensaje: 'La contraseña nueva tiene que ser distinta de la anterior.',
  },
  {
    contiene: 'token has expired',
    mensaje: 'El enlace venció. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".',
  },
  {
    contiene: 'invalid or has expired',
    mensaje: 'El enlace venció o ya se usó. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".',
  },
  {
    contiene: 'failed to fetch',
    mensaje: 'No pudimos conectarnos. Revisá tu internet e intentá de nuevo.',
  },
  {
    contiene: 'network',
    mensaje: 'No pudimos conectarnos. Revisá tu internet e intentá de nuevo.',
  },
];

export const MENSAJE_GENERICO = 'No pudimos completar la acción. Probá de nuevo en un momento.';

// Nunca devuelve el texto original de Supabase: si no lo reconocemos, preferimos
// un mensaje genérico en español antes que jerga en inglés en la cara del usuario.
export function mensajeDeErrorAuth(error: unknown): string {
  const crudo =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message ?? '')
        : '';

  const normalizado = crudo.toLowerCase();
  const regla = REGLAS.find((r) => normalizado.includes(r.contiene));
  return regla ? regla.mensaje : MENSAJE_GENERICO;
}
