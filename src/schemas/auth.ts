import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export const registerSchema = loginSchema.extend({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(60),
  // Google Play exige que el usuario acepte los Terminos ANTES de poder
  // publicar contenido, y no le sirve el "al continuar aceptas..." en letra
  // chica: tiene que ser un acto explicito. Va en el schema y no solo en la
  // pantalla para que ningun camino de registro se lo pueda saltar.
  aceptaTerminos: z.literal(true, {
    message: 'Para crear tu cuenta tienes que aceptar los Términos',
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
