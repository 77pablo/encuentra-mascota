import { z } from 'zod';

// Tri-estado genérico 'si'|'no'|'no_se' (esterilizado, convive_*)
const triEstado = z.enum(['si', 'no', 'no_se']);

export const adoptionSchema = z.object({
  especie: z.enum(['perro', 'gato', 'otro']),
  nombre: z.string().trim().max(60).optional().or(z.literal('')),
  descripcion: z.string().trim().min(1, 'Describe a la mascota en adopción').max(1000),
  edad: z.enum(['cachorro', 'adulto', 'senior']).optional(),
  tamano: z.enum(['chico', 'mediano', 'grande']).optional(),
  esterilizado: triEstado.optional(),
  // Único campo con set de valores distinto: 'al_dia'|'no'|'no_se' (spec 0030, tabla adoptions).
  vacunas: z.enum(['al_dia', 'no', 'no_se']).optional(),
  convive_ninos: triEstado.optional(),
  convive_perros: triEstado.optional(),
  convive_gatos: triEstado.optional(),
  requisitos: z.string().trim().max(500).optional().or(z.literal('')),
});

export type AdoptionInput = z.infer<typeof adoptionSchema>;
