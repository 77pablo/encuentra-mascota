import { tarjetaTextos } from './tarjeta';

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
