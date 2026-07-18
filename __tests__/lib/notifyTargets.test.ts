import { resolverDestinatarios, componerAviso, EventoAviso, Contexto } from '../../src/lib/notifyTargets';

const ctxBase: Contexto = { duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [], prefs: {} };

describe('resolverDestinatarios', () => {
  it('avisa al dueño de un avistamiento', () => {
    const ev: EventoAviso = { id: 'e1', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} };
    expect(resolverDestinatarios(ev, ctxBase)).toEqual([
      { userId: 'dueno', canales: ['email', 'push'] },
    ]);
  });

  it('nunca le avisa al actor de su propio evento', () => {
    const ev: EventoAviso = { id: 'e2', tipo: 'pista', petId: 'p1', actorId: 'dueno', datos: {} };
    expect(resolverDestinatarios(ev, ctxBase)).toEqual([]);
  });

  it('avisa a las zonas que cubren el reporte nuevo y no a las lejanas', () => {
    const ev: EventoAviso = {
      id: 'e3', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
      datos: { lat: -33.45, lng: -70.66 },
    };
    const ctx: Contexto = {
      ...ctxBase,
      zonas: [
        { userId: 'cerca', lat: -33.451, lng: -70.661, radioKm: 5 },
        { userId: 'lejos', lat: -34.9, lng: -71.9, radioKm: 5 },
      ],
    };
    expect(resolverDestinatarios(ev, ctx).map((d) => d.userId)).toEqual(['cerca']);
  });

  it('deduplica cuando una persona tiene dos zonas que solapan', () => {
    const ev: EventoAviso = {
      id: 'e4', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
      datos: { lat: -33.45, lng: -70.66 },
    };
    const ctx: Contexto = {
      ...ctxBase,
      zonas: [
        { userId: 'ana', lat: -33.451, lng: -70.661, radioKm: 5 },
        { userId: 'ana', lat: -33.452, lng: -70.662, radioKm: 10 },
      ],
    };
    expect(resolverDestinatarios(ev, ctx)).toHaveLength(1);
  });

  it('respeta el interruptor apagado del tipo', () => {
    const ev: EventoAviso = { id: 'e5', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} };
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: false, pistas: true,
                 coincidencias: true, canalEmail: true, canalPush: true },
      },
    };
    expect(resolverDestinatarios(ev, ctx)).toEqual([]);
  });

  it('devuelve solo los canales encendidos', () => {
    const ev: EventoAviso = { id: 'e6', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} };
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: true, pistas: true,
                 coincidencias: true, canalEmail: true, canalPush: false },
      },
    };
    expect(resolverDestinatarios(ev, ctx)[0].canales).toEqual(['email']);
  });

  it('no devuelve destinatarios si el usuario apagó los dos canales', () => {
    const ev: EventoAviso = { id: 'e7', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} };
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: true, pistas: true,
                 coincidencias: true, canalEmail: false, canalPush: false },
      },
    };
    expect(resolverDestinatarios(ev, ctx)).toEqual([]);
  });
});

describe('componerAviso', () => {
  it('usa el nombre de la mascota cuando lo hay', () => {
    const ev: EventoAviso = { id: 'e8', tipo: 'avistamiento', petId: 'p1', actorId: 'v', datos: {} };
    const aviso = componerAviso(ev, ctxBase);
    expect(aviso.titulo).toContain('Pelusa');
    expect(aviso.ruta).toBe('/mascota/p1');
  });

  it('funciona sin nombre de mascota', () => {
    const ev: EventoAviso = { id: 'e9', tipo: 'avistamiento', petId: 'p1', actorId: 'v', datos: {} };
    const aviso = componerAviso(ev, { ...ctxBase, nombrePet: null });
    expect(aviso.titulo.length).toBeGreaterThan(0);
    expect(aviso.titulo).not.toContain('null');
  });
});
