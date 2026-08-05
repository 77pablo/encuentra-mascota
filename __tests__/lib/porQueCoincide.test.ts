import { porQueCoincide } from '../../src/lib/porQueCoincide';

describe('porQueCoincide', () => {
  it('sin desglose no inventa razones (base vieja: la columna no llega)', () => {
    expect(porQueCoincide(null)).toEqual([]);
    expect(porQueCoincide({})).toEqual([]);
  });

  it('el chip va primero y es el mas fuerte', () => {
    const r = porQueCoincide({ chip: true, color: true, cerca: true });
    expect(r[0]).toMatch(/chip/i);
  });

  it('traduce cada razon a algo que se entiende', () => {
    expect(porQueCoincide({ color: true }).join(' ')).toMatch(/color/i);
    expect(porQueCoincide({ tamano: true }).join(' ')).toMatch(/tamaño/i);
    expect(porQueCoincide({ cerca: true }).join(' ')).toMatch(/cerca/i);
    expect(porQueCoincide({ foto: true }).join(' ')).toMatch(/foto/i);
  });

  it('NO afirma identidad: nunca dice "es tu mascota"', () => {
    const r = porQueCoincide({ chip: true, color: true, tamano: true, cerca: true, foto: true });
    expect(r.join(' ')).not.toMatch(/es tu mascota|es la tuya|seguro que/i);
  });

  it('ignora las claves en false y las desconocidas', () => {
    expect(porQueCoincide({ color: false, inventada: true } as any)).toEqual([]);
  });
});

// GUARDIÁN (B1 → B5): el plan original disparaba el vector automáticamente al
// publicar, contra una Edge Function. B1 lo tumbó: el modelo se baja al
// teléfono de la persona (~40 MB la primera vez), así que no puede colgarse
// del camino de publicar sin avisar — sería bajarle 40 MB a alguien apurado
// subiendo la foto de su perro perdido. El botón vive en la ficha del reporte
// propio (PetDetailScreen), nunca en services/pets.ts. Sin este guardián,
// alguien podría "optimizar" createPet/updatePet re-metiendo el disparo
// automático sin que ningún test se diera cuenta.
describe('vector de foto — no automático (B5, guardián del pivot de B1)', () => {
  it('el vector NO se calcula solo al publicar: bajar 40 MB pide permiso', () => {
    const pets = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'src', 'services', 'pets.ts'), 'utf8');
    expect(pets).not.toMatch(/calcularYGuardar/);
  });
});
