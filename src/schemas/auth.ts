import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

// Edad minima para tener cuenta. 14 es el corte que hace la ley chilena entre
// "niño" (<14) y "adolescente" (14-17): un adolescente puede consentir el
// tratamiento de sus datos no sensibles por si mismo, un niño no. No es 13
// (eso es COPPA, ley de otro pais) ni 18 (nadie lo respetaria y cada cuenta de
// un cabro de 15 seria un incumplimiento nuestro). Ver el spec de la Tanda C.
export const EDAD_MINIMA = 14;

// Calcula los años cumplidos a partir de una fecha 'YYYY-MM-DD'. Devuelve null
// si la fecha no es valida: mal formada, inexistente (31/02, mes 13...) o
// futura. Se calcula en el schema -- y no solo en la pantalla -- para que
// ningun camino de registro pueda saltarse el corte de edad, igual que
// `aceptaTerminos`.
export function calcularEdad(fechaNacimiento: string, hoy: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((fechaNacimiento ?? '').trim());
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  // `new Date` normaliza los desbordes (13/2020 pasa a enero/2021), asi que
  // comparamos las partes para rechazar fechas que no existen de verdad.
  const d = new Date(anio, mes - 1, dia);
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  if (d.getTime() > hoy.getTime()) return null; // no se puede nacer en el futuro
  let edad = hoy.getFullYear() - anio;
  const yaCumplioEsteAnio =
    hoy.getMonth() > mes - 1 || (hoy.getMonth() === mes - 1 && hoy.getDate() >= dia);
  if (!yaCumplioEsteAnio) edad -= 1;
  return edad;
}

export const registerSchema = loginSchema.extend({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(60),
  // Google Play exige que el usuario acepte los Terminos ANTES de poder
  // publicar contenido, y no le sirve el "al continuar aceptas..." en letra
  // chica: tiene que ser un acto explicito. Va en el schema y no solo en la
  // pantalla para que ningun camino de registro se lo pueda saltar.
  aceptaTerminos: z.literal(true, {
    message: 'Para crear tu cuenta tienes que aceptar los Términos',
  }),
  // Fecha de nacimiento real, no una casilla "soy mayor de 14": una casilla no
  // informa nada ni permite saber despues que edad declaro la persona. El
  // objeto `{ message }` en el segundo `.refine` es a proposito: en este
  // proyecto `z.literal(true, { errorMap })` NO aplica el mensaje (sale
  // "Invalid input..." en ingles), asi que se usa la forma con `{ message }`,
  // que si lo hace, tambien aca. Si el que se registra tiene menos de 14, el
  // parseo falla y NO se guarda nada del intento.
  fechaNacimiento: z
    .string({ message: 'Ingresa tu fecha de nacimiento (día, mes y año).' })
    .refine((f) => calcularEdad(f) !== null, {
      message: 'Revisa tu fecha de nacimiento: no parece una fecha válida.',
    })
    .refine((f) => (calcularEdad(f) ?? -1) >= EDAD_MINIMA, {
      message:
        'Tienes que tener al menos 14 años para crear una cuenta. Sin cuenta igual puedes ver los reportes, el mapa y las fotos, y un adulto de tu casa puede publicar por ti.',
    }),
});

export const forgotPasswordSchema = z.object({
  email: loginSchema.shape.email,
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
    confirmPassword: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
