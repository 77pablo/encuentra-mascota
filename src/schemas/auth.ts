import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export const registerSchema = loginSchema.extend({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(60),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
