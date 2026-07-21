import { adoptionSchema } from '../../src/schemas/adoption';

const base = {
  especie: 'perro',
  descripcion: 'Cachorro juguetón, busca familia con patio',
};

describe('adoptionSchema', () => {
  it('acepta una publicación válida mínima', () => {
    expect(adoptionSchema.safeParse(base).success).toBe(true);
  });

  it('rechaza especie faltante', () => {
    const { especie, ...sinEspecie } = base;
    expect(adoptionSchema.safeParse(sinEspecie).success).toBe(false);
  });

  it('rechaza especie inválida', () => {
    expect(adoptionSchema.safeParse({ ...base, especie: 'volando' }).success).toBe(false);
  });

  it('acepta nombre opcional', () => {
    expect(adoptionSchema.safeParse({ ...base, nombre: 'Pelusa' }).success).toBe(true);
  });

  it('rechaza descripción vacía', () => {
    expect(adoptionSchema.safeParse({ ...base, descripcion: '' }).success).toBe(false);
  });

  it('rechaza descripción que excede el largo máximo', () => {
    expect(adoptionSchema.safeParse({ ...base, descripcion: 'a'.repeat(1001) }).success).toBe(false);
  });

  it('acepta descripción en el límite del largo máximo', () => {
    expect(adoptionSchema.safeParse({ ...base, descripcion: 'a'.repeat(1000) }).success).toBe(true);
  });

  it('rechaza descripción faltante', () => {
    const { descripcion, ...sinDescripcion } = base;
    expect(adoptionSchema.safeParse(sinDescripcion).success).toBe(false);
  });

  it.each(['cachorro', 'adulto', 'senior'])('acepta edad válida: %s', (edad) => {
    expect(adoptionSchema.safeParse({ ...base, edad }).success).toBe(true);
  });

  it('acepta edad ausente (opcional)', () => {
    expect(adoptionSchema.safeParse(base).success).toBe(true);
  });

  it('rechaza edad inválida', () => {
    expect(adoptionSchema.safeParse({ ...base, edad: 'bebe' }).success).toBe(false);
  });

  it.each(['chico', 'mediano', 'grande'])('acepta tamaño válido: %s', (tamano) => {
    expect(adoptionSchema.safeParse({ ...base, tamano }).success).toBe(true);
  });

  it('rechaza tamaño inválido', () => {
    expect(adoptionSchema.safeParse({ ...base, tamano: 'gigante' }).success).toBe(false);
  });

  describe('tri-estados si/no/no_se', () => {
    const campos = ['esterilizado', 'convive_ninos', 'convive_perros', 'convive_gatos'] as const;

    campos.forEach((campo) => {
      it.each(['si', 'no', 'no_se'])(`${campo} acepta valor válido: %s`, (valor) => {
        expect(adoptionSchema.safeParse({ ...base, [campo]: valor }).success).toBe(true);
      });

      it(`${campo} acepta undefined (opcional)`, () => {
        expect(adoptionSchema.safeParse(base).success).toBe(true);
      });

      it(`${campo} rechaza valor inválido`, () => {
        expect(adoptionSchema.safeParse({ ...base, [campo]: 'tal_vez' }).success).toBe(false);
      });
    });
  });

  describe('vacunas (tri-estado al_dia/no/no_se)', () => {
    it.each(['al_dia', 'no', 'no_se'])('acepta valor válido: %s', (valor) => {
      expect(adoptionSchema.safeParse({ ...base, vacunas: valor }).success).toBe(true);
    });

    it('acepta undefined (opcional)', () => {
      expect(adoptionSchema.safeParse(base).success).toBe(true);
    });

    it('rechaza valor inválido', () => {
      expect(adoptionSchema.safeParse({ ...base, vacunas: 'si' }).success).toBe(false);
    });
  });

  it('acepta requisitos opcional dentro del largo acotado', () => {
    expect(adoptionSchema.safeParse({ ...base, requisitos: 'Casa con patio, sin niños pequeños' }).success).toBe(true);
  });

  it('acepta requisitos ausente', () => {
    expect(adoptionSchema.safeParse(base).success).toBe(true);
  });

  it('rechaza requisitos que excede el largo máximo (500)', () => {
    expect(adoptionSchema.safeParse({ ...base, requisitos: 'a'.repeat(501) }).success).toBe(false);
  });

  it('acepta requisitos en el límite del largo máximo (500)', () => {
    expect(adoptionSchema.safeParse({ ...base, requisitos: 'a'.repeat(500) }).success).toBe(true);
  });
});
