import { z } from 'zod';

// Ficha "Mi mascota" (registro permanente, distinto de un reporte). Los mismos
// topes que los CHECK de la migración 0027, para que un usuario normal nunca los
// vea y solo los toque quien escriba por fuera de la app.
export const myPetSchema = z.object({
  nombre: z.string().trim().min(1, 'Ponle un nombre a tu mascota').max(60),
  especie: z.enum(['perro', 'gato', 'otro']),
  raza: z.string().trim().max(60).optional().or(z.literal('')),
  senas: z.string().trim().max(1000).optional().or(z.literal('')),
  chip: z.string().trim().max(40).optional().or(z.literal('')),
});

export type MyPetInput = z.infer<typeof myPetSchema>;
