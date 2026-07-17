import { petSchema } from '../../src/schemas/pet';

const base = {
  estado: 'perdida',
  especie: 'perro',
  descripcion: 'Café, mediano, con collar rojo',
  lat: -33.45,
  lng: -70.66,
};

describe('petSchema', () => {
  it('acepta un reporte válido mínimo', () => {
    expect(petSchema.safeParse(base).success).toBe(true);
  });
  it('acepta raza y recompensa opcionales', () => {
    expect(petSchema.safeParse({ ...base, raza: 'quiltro', recompensa: '$20.000' }).success).toBe(true);
  });
  it('rechaza estado inválido', () => {
    expect(petSchema.safeParse({ ...base, estado: 'volando' }).success).toBe(false);
  });
  it('rechaza descripción vacía', () => {
    expect(petSchema.safeParse({ ...base, descripcion: '' }).success).toBe(false);
  });
  it('rechaza coordenadas fuera de rango', () => {
    expect(petSchema.safeParse({ ...base, lat: 200 }).success).toBe(false);
  });
});
