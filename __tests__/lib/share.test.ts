import { buildShareText } from '../../src/lib/share';
import { Pet } from '../../src/services/pets';

function pet(over: Partial<Pet>): Pet {
  return {
    id: 'pet-1',
    user_id: 'u',
    estado: 'perdida',
    especie: 'perro',
    raza: null,
    nombre: null,
    descripcion: 'Manchas negras, collar rojo',
    fotos: [],
    lat: -33.45,
    lng: -70.66,
    recompensa: null,
    activo: true,
    oculto: false,
    creado_en: '2026-07-01T00:00:00Z',
    ...over,
  };
}

describe('buildShareText — comuna', () => {
  it('incluye "en <comuna>" cuando el reporte perdido tiene comuna', () => {
    const texto = buildShareText(pet({ estado: 'perdida', comuna: 'Maipú' }));
    expect(texto).toContain('🔴 PERDIDA en Maipú:');
  });

  it('incluye "en <comuna>" cuando el reporte encontrado tiene comuna', () => {
    const texto = buildShareText(pet({ estado: 'encontrada', comuna: 'Ñuñoa' }));
    expect(texto).toContain('🟢 ENCONTRADA en Ñuñoa:');
  });

  it('recorta los espacios de la comuna', () => {
    const texto = buildShareText(pet({ estado: 'perdida', comuna: '  Providencia  ' }));
    expect(texto).toContain('🔴 PERDIDA en Providencia:');
  });

  // Reportes viejos (anteriores a la Tanda 3) o sin comuna: el texto queda
  // EXACTAMENTE como antes, sin el " en ...".
  it('omite el lugar cuando comuna es null (perdida) — igual que antes', () => {
    const texto = buildShareText(pet({ estado: 'perdida', comuna: null }));
    expect(texto).toContain('🔴 PERDIDA:');
    expect(texto).not.toContain(' en ');
  });

  it('omite el lugar cuando comuna es undefined (encontrada) — igual que antes', () => {
    const texto = buildShareText(pet({ estado: 'encontrada', comuna: undefined }));
    expect(texto).toContain('🟢 ENCONTRADA:');
    expect(texto).not.toContain(' en ');
  });

  it('omite el lugar cuando comuna es cadena vacía o solo espacios', () => {
    expect(buildShareText(pet({ estado: 'perdida', comuna: '' }))).toContain('🔴 PERDIDA:');
    expect(buildShareText(pet({ estado: 'perdida', comuna: '   ' }))).toContain('🔴 PERDIDA:');
  });
});
