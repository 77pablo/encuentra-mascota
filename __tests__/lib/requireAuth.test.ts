import { MENSAJES, mensajeDe, AccionProtegida } from '../../src/lib/requireAuth';

// Se derivan del propio mapa en vez de repetirlas a mano: asi una accion nueva
// queda cubierta sola (una lista escrita aca no probaria nada de lo que se
// agregue despues, que es justo lo que paso con 'bloquear').
const ACCIONES = Object.keys(MENSAJES) as AccionProtegida[];

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

describe('acciones que tienen que existir', () => {
  it('cubre bloquear (el texto vivia repetido a mano en las pantallas)', () => {
    expect(ACCIONES).toContain('bloquear');
    expect(mensajeDe('bloquear')).toBe('Creá tu cuenta para bloquear a esta persona');
  });

  it('ninguna accion se quedo sin texto', () => {
    expect(ACCIONES.length).toBeGreaterThanOrEqual(11);
    ACCIONES.forEach((a) => expect(mensajeDe(a).trim().length).toBeGreaterThan(0));
  });
});
