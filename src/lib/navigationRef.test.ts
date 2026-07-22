import { guardarDestinoPendiente, consumirDestinoPendiente } from './navigationRef';
import type { DestinoRuta } from './rutaANavegacion';

// Destino pendiente de un push tocado antes de que el NavigationContainer
// esté listo (arranque en frío): ver navigationRef.ts. Funciones puras, sin
// depender de React Navigation montado.
describe('destino pendiente (push tocado en frío)', () => {
  const destino: DestinoRuta = { name: 'AdopcionDetail', params: { id: '11111111-2222-3333-4444-555555555555' } };
  const otroDestino: DestinoRuta = { name: 'MascotaPublica', params: { id: '99999999-8888-7777-6666-555555555555' } };

  // Limpia cualquier resto dejado por otro test, para que el orden de
  // ejecución no importe.
  beforeEach(() => {
    consumirDestinoPendiente();
  });

  it('sin nada guardado, consumir devuelve null', () => {
    expect(consumirDestinoPendiente()).toBeNull();
  });

  it('guarda un destino y lo devuelve al consumirlo', () => {
    guardarDestinoPendiente(destino);
    expect(consumirDestinoPendiente()).toEqual(destino);
  });

  it('consumir limpia el pendiente: la segunda vez ya no hay nada', () => {
    guardarDestinoPendiente(destino);
    expect(consumirDestinoPendiente()).toEqual(destino);
    expect(consumirDestinoPendiente()).toBeNull();
  });

  it('guardar de nuevo sin haber consumido reemplaza al destino anterior', () => {
    guardarDestinoPendiente(destino);
    guardarDestinoPendiente(otroDestino);
    expect(consumirDestinoPendiente()).toEqual(otroDestino);
  });
});
