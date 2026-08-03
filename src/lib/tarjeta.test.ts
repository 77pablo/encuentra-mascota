import { tarjetaTextos, datosDeReporte, datosDeAdopcion, datosDeFinalFeliz, diasEntre } from './tarjeta';

// `petUrl`/`adopcionUrl` (src/lib/links.ts) resuelven la URL desde
// `EXPO_PUBLIC_WEB_URL` fuera de web (acá `Platform.OS` es 'ios', el default
// de jest-expo): la fijamos para que las aserciones de `qrUrl` sean estables.
// Guardado/restaurado en beforeAll/afterAll (F12): `process.env` es GLOBAL al
// worker de jest, compartido entre archivos de test que corren en el mismo
// proceso — pisarlo a nivel de módulo, sin restaurar, se le filtraba a
// cualquier otra suite que corriera en el mismo worker después de esta.
const DOMINIO_TEST = 'https://encuentras-mascota.pages.dev';
let envOriginal: string | undefined;

beforeAll(() => {
  envOriginal = process.env.EXPO_PUBLIC_WEB_URL;
  process.env.EXPO_PUBLIC_WEB_URL = DOMINIO_TEST;
});

afterAll(() => {
  if (envOriginal === undefined) delete process.env.EXPO_PUBLIC_WEB_URL;
  else process.env.EXPO_PUBLIC_WEB_URL = envOriginal;
});

const base = {
  id: 'x',
  estado: 'perdida',
  especie: 'perro',
  nombre: 'Luna',
  raza: 'Quiltro',
  comuna: 'Maipú',
  descripcion: '',
  fotos: [],
} as any;

test('perdida con comuna y nombre', () => {
  expect(tarjetaTextos(base)).toEqual({
    banda: 'PERDIDA EN MAIPÚ',
    titulo: 'Luna',
    subtitulo: 'Perro · Quiltro',
    esPerdida: true,
  });
});

test('encontrada sin comuna ni nombre ni raza', () => {
  const t = tarjetaTextos({ ...base, estado: 'encontrada', comuna: null, nombre: null, raza: null });
  expect(t.banda).toBe('ENCONTRADA');
  expect(t.titulo).toBe('¿Es tuya?');
  expect(t.subtitulo).toBe('Perro');
  expect(t.esPerdida).toBe(false);
});

test('perdida sin nombre', () => {
  expect(tarjetaTextos({ ...base, nombre: null }).titulo).toBe('¿La has visto?');
});

test('encontrada con comuna: banda incluye la comuna', () => {
  const t = tarjetaTextos({ ...base, estado: 'encontrada', comuna: 'Ñuñoa' });
  expect(t.banda).toBe('ENCONTRADA EN ÑUÑOA');
});

test('sin raza: subtitulo solo la especie', () => {
  expect(tarjetaTextos({ ...base, raza: null }).subtitulo).toBe('Perro');
});

describe('datosDeReporte', () => {
  const pet = {
    ...base,
    id: 'abc123',
    user_id: 'u1',
    activo: true,
    oculto: false,
    lat: -33.5,
    lng: -70.6,
    recompensa: null,
    creado_en: '2026-01-01T00:00:00Z',
    fotos: ['https://ejemplo.com/foto.jpg'],
  };

  test('mapea 1:1 lo que rinde tarjetaTextos, mas foto/QR/color/nombre de archivo (perdida)', () => {
    expect(datosDeReporte(pet)).toEqual({
      banda: 'PERDIDA EN MAIPÚ',
      bandaColor: '#C62828',
      titulo: 'Luna',
      subtitulo: 'Perro · Quiltro',
      fotoUrl: 'https://ejemplo.com/foto.jpg',
      qrUrl: 'https://encuentras-mascota.pages.dev/mascota/abc123',
      nombreArchivo: 'mascota-abc123.png',
    });
  });

  test('encontrada: color verde', () => {
    expect(datosDeReporte({ ...pet, estado: 'encontrada' }).bandaColor).toBe('#2E7D32');
  });

  test('sin fotos: fotoUrl null', () => {
    expect(datosDeReporte({ ...pet, fotos: [] }).fotoUrl).toBeNull();
  });
});

describe('diasEntre', () => {
  test('mismo dia: null (no cuenta como un dia despues)', () => {
    expect(diasEntre('2026-01-01T09:00:00Z', '2026-01-01T20:00:00Z')).toBeNull();
  });

  test('un dia despues: 1', () => {
    expect(diasEntre('2026-01-01T09:00:00Z', '2026-01-02T10:00:00Z')).toBe(1);
  });

  test('45 dias despues: 45', () => {
    expect(diasEntre('2026-01-01T00:00:00Z', '2026-02-15T00:00:00Z')).toBe(45);
  });

  test('orden invertido (hasta antes que desde): null', () => {
    expect(diasEntre('2026-02-15T00:00:00Z', '2026-01-01T00:00:00Z')).toBeNull();
  });

  test('fechas invalidas: null', () => {
    expect(diasEntre('no-es-fecha', '2026-01-01T00:00:00Z')).toBeNull();
    expect(diasEntre('2026-01-01T00:00:00Z', 'tampoco')).toBeNull();
  });
});

describe('datosDeAdopcion', () => {
  const adopcion = {
    id: 'ad-1',
    nombre: 'Pelusa',
    especie: 'perro' as const,
    edad: 'cachorro' as const,
    tamano: 'mediano' as const,
    comuna: 'Ñuñoa',
    fotos: ['https://ejemplo.com/pelusa.jpg'],
  };

  test('banda con comuna, color de marca, subtitulo especie+edad+tamano, QR de adopcion', () => {
    expect(datosDeAdopcion(adopcion)).toEqual({
      banda: 'BUSCA HOGAR EN ÑUÑOA',
      bandaColor: '#17654B',
      titulo: 'Pelusa',
      subtitulo: 'Perro · Cachorro · Mediano',
      fotoUrl: 'https://ejemplo.com/pelusa.jpg',
      qrUrl: 'https://encuentras-mascota.pages.dev/adopcion/ad-1',
      nombreArchivo: 'adopcion-ad-1.png',
    });
  });

  test('sin comuna: banda sin "en"', () => {
    expect(datosDeAdopcion({ ...adopcion, comuna: null }).banda).toBe('BUSCA HOGAR');
  });

  test('sin nombre: titulo cae a la especie', () => {
    expect(datosDeAdopcion({ ...adopcion, nombre: null }).titulo).toBe('Perro');
  });

  test('sin edad ni tamano: subtitulo solo la especie', () => {
    expect(datosDeAdopcion({ ...adopcion, edad: null, tamano: null }).subtitulo).toBe('Perro');
  });
});

describe('datosDeFinalFeliz', () => {
  const pet = {
    id: 'p1',
    nombre: 'Firulais',
    especie: 'perro' as const,
    fotos: ['https://ejemplo.com/foto.jpg'],
    final_foto: null as string | null,
    creado_en: '2026-01-01T00:00:00Z',
    reunida_en: '2026-01-03T00:00:00Z' as string | null,
  };

  test('banda, color verde, subtitulo "X dias despues", QR de mascota', () => {
    expect(datosDeFinalFeliz(pet)).toEqual({
      banda: '¡VOLVIÓ A CASA!',
      bandaColor: '#1E8A63',
      titulo: 'Firulais',
      subtitulo: '2 días después',
      fotoUrl: 'https://ejemplo.com/foto.jpg',
      qrUrl: 'https://encuentras-mascota.pages.dev/mascota/p1',
      nombreArchivo: 'final-feliz-p1.png',
    });
  });

  test('final_foto tiene prioridad sobre fotos[0]', () => {
    expect(datosDeFinalFeliz({ ...pet, final_foto: 'https://ejemplo.com/feliz.jpg' }).fotoUrl).toBe(
      'https://ejemplo.com/feliz.jpg',
    );
  });

  test('1 dia despues: singular', () => {
    expect(datosDeFinalFeliz({ ...pet, reunida_en: '2026-01-02T00:00:00Z' }).subtitulo).toBe('1 día después');
  });

  test('reencuentro el mismo dia: sin subtitulo', () => {
    expect(datosDeFinalFeliz({ ...pet, reunida_en: '2026-01-01T05:00:00Z' }).subtitulo).toBeNull();
  });

  test('sin reunida_en: sin subtitulo', () => {
    expect(datosDeFinalFeliz({ ...pet, reunida_en: null }).subtitulo).toBeNull();
  });

  test('sin nombre: titulo cae a la especie', () => {
    expect(datosDeFinalFeliz({ ...pet, nombre: null }).titulo).toBe('Perro');
  });
});
