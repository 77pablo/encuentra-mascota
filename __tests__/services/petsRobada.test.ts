const fuente = () =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'services', 'pets.ts'), 'utf8');
const schema = () =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'schemas', 'pet.ts'), 'utf8');

describe('robada en la capa de datos', () => {
  it('Pet declara robada booleano (opcional, depende de la 0068)', () => {
    expect(fuente()).toMatch(/robada\??\s*:\s*boolean/);
  });

  it('el schema acepta robada opcional', () => {
    expect(schema()).toMatch(/robada/);
  });

  it('robada viaja en el grupo OPCIONAL del insert (la web publica sin la columna)', () => {
    // Debe estar en opcionalesDe y en GRUPOS_OPCIONALES para que grupoFaltante
    // lo pueda soltar si la base no tiene la columna 0068.
    expect(fuente()).toMatch(/extras\.robada/);
    expect(fuente()).toMatch(/\[\s*'robada'\s*\]/);
  });

  it('updatePet puede cambiar robada', () => {
    expect(fuente()).toMatch(/'robada'/);
  });
});
