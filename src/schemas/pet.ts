import { z } from 'zod';

export const petSchema = z.object({
  estado: z.enum(['perdida', 'encontrada']),
  especie: z.enum(['perro', 'gato', 'otro']),
  raza: z.string().trim().max(60).optional().or(z.literal('')),
  nombre: z.string().trim().max(60).optional().or(z.literal('')),
  descripcion: z.string().trim().min(1, 'Describe las señas de la mascota').max(1000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  recompensa: z.string().trim().max(100).optional().or(z.literal('')),
});

export type PetInput = z.infer<typeof petSchema>;
