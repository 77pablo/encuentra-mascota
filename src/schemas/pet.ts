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
  // Comuna "casa" del reporte + comunas de alcance (vecinas). Opcionales en el
  // schema para no romper EditPet (que reusa este schema y no toca la comuna);
  // PublishScreen exige la comuna por su cuenta antes de publicar.
  comuna: z.string().trim().min(1).max(80).optional(),
  comunas_alcance: z.array(z.string()).optional(),
});

export type PetInput = z.infer<typeof petSchema>;
