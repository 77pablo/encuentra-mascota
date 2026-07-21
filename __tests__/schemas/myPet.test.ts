import { myPetSchema } from '../../src/schemas/myPet';

const base = { nombre: 'Pelusa', especie: 'perro' };

describe('myPetSchema', () => {
  it('acepta una ficha mínima válida (nombre + especie)', () => {
    expect(myPetSchema.safeParse(base).success).toBe(true);
  });

  it('acepta raza, señas y chip opcionales', () => {
    expect(
      myPetSchema.safeParse({ ...base, raza: 'quiltro', senas: 'mancha en la oreja', chip: '981000012345678' })
        .success,
    ).toBe(true);
  });

  it('acepta los opcionales como cadena vacía', () => {
    expect(myPetSchema.safeParse({ ...base, raza: '', senas: '', chip: '' }).success).toBe(true);
  });

  it('rechaza nombre vacío', () => {
    expect(myPetSchema.safeParse({ ...base, nombre: '' }).success).toBe(false);
    expect(myPetSchema.safeParse({ ...base, nombre: '   ' }).success).toBe(false);
  });

  it('rechaza especie inválida', () => {
    expect(myPetSchema.safeParse({ ...base, especie: 'dinosaurio' }).success).toBe(false);
  });

  it('rechaza nombre demasiado largo (>60)', () => {
    expect(myPetSchema.safeParse({ ...base, nombre: 'x'.repeat(61) }).success).toBe(false);
  });

  it('rechaza señas demasiado largas (>1000)', () => {
    expect(myPetSchema.safeParse({ ...base, senas: 'x'.repeat(1001) }).success).toBe(false);
  });
});
