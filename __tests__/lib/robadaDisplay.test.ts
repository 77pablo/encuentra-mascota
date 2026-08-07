import { armarAfiche } from '../../src/lib/afiche';
import { buildShareText } from '../../src/lib/share';
import type { Pet } from '../../src/services/pets';

const petBase: Pet = {
  id: 'p1',
  user_id: 'u1',
  estado: 'perdida',
  especie: 'perro',
  raza: null,
  nombre: 'Toby',
  descripcion: 'café',
  fotos: [],
  lat: -33.4,
  lng: -70.6,
  recompensa: null,
  activo: true,
  oculto: false,
  creado_en: '2026-08-06T00:00:00Z',
};

describe('afiche con robada', () => {
  it('el titular de una robada suma ROBADA', () => {
    expect(armarAfiche({ ...petBase, robada: true }, null).titular).toMatch(/ROBAD/);
  });
  it('una perdida normal sigue diciendo SE BUSCA sin ROBADA', () => {
    expect(armarAfiche(petBase, null).titular).toBe('SE BUSCA');
  });
  it('una encontrada no se ve afectada', () => {
    expect(armarAfiche({ ...petBase, estado: 'encontrada' }, null).titular).not.toMatch(/ROBAD/);
  });
});

describe('buildShareText con robada', () => {
  it('una robada dice ROBADA en vez de PERDIDA', () => {
    const t = buildShareText({ ...petBase, robada: true });
    expect(t).toMatch(/ROBAD/);
    expect(t).not.toMatch(/PERDIDA/);
  });
  it('una perdida normal dice PERDIDA', () => {
    expect(buildShareText(petBase)).toMatch(/PERDIDA/);
  });
});

// Guardas de forma: el badge ROBADA en las superficies que leen la fila completa.
const leer = (rel: string) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', rel), 'utf8');

describe('badge ROBADA en las pantallas', () => {
  it('PetCard pinta el badge cuando robada', () => {
    expect(leer('components/PetCard.tsx')).toMatch(/robada[\s\S]{0,80}ROBADA|ROBADA[\s\S]{0,80}robada/);
  });
  it('PetDetailScreen pinta el badge cuando robada', () => {
    expect(leer('screens/PetDetailScreen.tsx')).toMatch(/robada[\s\S]{0,80}ROBADA|ROBADA[\s\S]{0,80}robada/);
  });
  it('el mapa marca (robada) en el popup', () => {
    expect(leer('components/ReportesMapa.tsx')).toMatch(/robada/);
  });
});
