import { MENSAJES, mensajeDe, AccionProtegida } from '../../src/lib/requireAuth';

const ACCIONES: AccionProtegida[] = ['contactar', 'publicar', 'guardar', 'dejar_pista',
  'avistamiento', 'novedad', 'denunciar', 'reencuentro', 'guardar_busqueda'];

describe('mensajes del portero', () => {
  it('tiene un mensaje para cada acción protegida', () => {
    ACCIONES.forEach((a) => expect(typeof MENSAJES[a]).toBe('string'));
  });
  it('todos los mensajes invitan a crear cuenta', () => {
    ACCIONES.forEach((a) => expect(MENSAJES[a].toLowerCase()).toContain('cuenta'));
  });
  it('los mensajes son distintos entre sí', () => {
    expect(new Set(ACCIONES.map((a) => MENSAJES[a])).size).toBe(ACCIONES.length);
  });
  it('mensajeDe devuelve el texto de la acción', () => {
    expect(mensajeDe('contactar')).toBe(MENSAJES.contactar);
  });
});
