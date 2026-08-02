import {
  armarAfiche,
  armarSubtitulo,
  armarNombreArchivo,
  faltaWhatsapp,
  normalizarWhatsapp,
  textoImprenta,
} from '../../src/lib/afiche';
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

describe('normalizarWhatsapp', () => {
  it('deja solo dígitos', () => {
    expect(normalizarWhatsapp('+56 9 1234 5678')).toBe('56912345678');
    expect(normalizarWhatsapp(null)).toBe('');
    expect(normalizarWhatsapp('')).toBe('');
  });
});

describe('faltaWhatsapp', () => {
  it('true si no hay teléfono', () => {
    expect(faltaWhatsapp(null)).toBe(true);
    expect(faltaWhatsapp({ telefono: '' })).toBe(true);
    expect(faltaWhatsapp({ telefono: '   ' })).toBe(true);
  });
  it('false si hay dígitos', () => {
    expect(faltaWhatsapp({ telefono: '+56912345678' })).toBe(false);
  });
});

describe('armarSubtitulo', () => {
  it('especie sola cuando no hay raza', () => {
    expect(armarSubtitulo({ especie: 'gato', raza: null })).toBe('Gato');
  });
  it('especie · raza cuando hay raza', () => {
    expect(armarSubtitulo({ especie: 'perro', raza: 'Labrador' })).toBe('Perro · Labrador');
  });
  it('"otro" se muestra como Mascota', () => {
    expect(armarSubtitulo({ especie: 'otro', raza: null })).toBe('Mascota');
  });
});

describe('armarNombreArchivo', () => {
  it('usa el nombre en slug y termina en .png', () => {
    expect(armarNombreArchivo({ nombre: 'Firulais Ñandú', especie: 'perro' })).toBe('afiche-firulais-nandu.png');
  });
  it('cae a la especie si no hay nombre', () => {
    expect(armarNombreArchivo({ nombre: null, especie: 'gato' })).toBe('afiche-gato.png');
  });
  it('cae a "mascota" si el nombre no deja caracteres válidos', () => {
    expect(armarNombreArchivo({ nombre: '🐾', especie: 'perro' })).toBe('afiche-mascota.png');
  });
});

describe('armarAfiche', () => {
  const original = process.env.EXPO_PUBLIC_WEB_URL;
  afterEach(() => {
    process.env.EXPO_PUBLIC_WEB_URL = original;
  });

  it('titular "SE BUSCA" para perdida', () => {
    const c = armarAfiche(pet({ estado: 'perdida' }), { telefono: '+56912345678' });
    expect(c.titular).toBe('SE BUSCA');
  });

  it('titular "¿CONOCÉS A ESTA MASCOTA?" para encontrada', () => {
    const c = armarAfiche(pet({ estado: 'encontrada' }), { telefono: '+56912345678' });
    expect(c.titular).toBe('¿CONOCÉS A ESTA MASCOTA?');
  });

  it('avisa que HAY recompensa, sin llevarse el monto', () => {
    // El monto no viaja al afiche: `hayRecompensa` es un booleano a propósito.
    // El detalle de por qué está en __tests__/lib/recompensaSinMonto.test.ts.
    expect(armarAfiche(pet({ recompensa: '' }), null).hayRecompensa).toBe(false);
    expect(armarAfiche(pet({ recompensa: '$50.000' }), null).hayRecompensa).toBe(true);
  });

  it('toma la primera foto o null', () => {
    expect(armarAfiche(pet({ fotos: ['a.jpg', 'b.jpg'] }), null).foto).toBe('a.jpg');
    expect(armarAfiche(pet({ fotos: [] }), null).foto).toBeNull();
  });

  it('arma waLink desde el teléfono del perfil, o null si no hay', () => {
    expect(armarAfiche(pet({}), { telefono: '+56 9 1234 5678' }).waLink).toBe('https://wa.me/56912345678');
    expect(armarAfiche(pet({}), null).waLink).toBeNull();
  });

  it('url usa EXPO_PUBLIC_WEB_URL cuando está configurada', () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://mascotas.app';
    expect(armarAfiche(pet({ id: 'xyz' }), null).url).toBe('https://mascotas.app/mascota/xyz');
  });

  it('con incluirNumero apagado no queda ni el número, ni los dígitos, ni el link', () => {
    const c = armarAfiche(pet({}), { telefono: '+56912345678' }, { incluirNumero: false });
    expect(c.whatsappDisplay).toBe('');
    expect(c.whatsappDigits).toBe('');
    expect(c.waLink).toBeNull();
  });

  it('sin opciones se comporta como siempre (prendido por defecto)', () => {
    const c = armarAfiche(pet({}), { telefono: '+56912345678' });
    expect(c.whatsappDisplay).toBe('+56912345678');
  });

  it('la url NUNCA es null: sin env cae al dominio nuestro, no a uno ajeno', () => {
    delete process.env.EXPO_PUBLIC_WEB_URL;
    const c = armarAfiche(pet({ id: 'abc' }), null);
    expect(c.url).toBe('https://encuentras-mascota.pages.dev/mascota/abc');
  });

  describe('textoImprenta', () => {
    it('nombra a la mascota y pide papel fluorescente y tamaño grande', () => {
      const t = textoImprenta('Luna');
      expect(t).toContain('Luna');
      expect(t).toContain('fluorescente');
      expect(t).toContain('carta');
    });
    it('sin nombre no queda un hueco raro', () => {
      expect(textoImprenta(null)).not.toContain('undefined');
    });
  });
});
