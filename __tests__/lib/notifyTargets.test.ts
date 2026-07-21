import { resolverDestinatarios, componerAviso, EventoAviso, Contexto } from '../../src/lib/notifyTargets';

const ctxBase: Contexto = {
  duenoPetId: 'dueno',
  nombrePet: 'Pelusa',
  zonas: [],
  prefs: {},
  seguidoresComuna: [],
};

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

// Camino por comuna seguida (Tanda 3 · C): se SUMA al camino por zona GPS.
describe('resolverDestinatarios · seguidores de comuna (reporte_nuevo)', () => {
  const evComuna: EventoAviso = {
    id: 'c1', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
    datos: { lat: -33.45, lng: -70.66, especie: 'perro', comuna: 'Maipú' },
  };

  it('avisa a quien sigue la comuna aunque tenga la preferencia de zona apagada', () => {
    const ctx: Contexto = {
      ...ctxBase,
      duenoPetId: 'autor',
      zonas: [],
      seguidoresComuna: ['sigue'],
      prefs: {
        // zona:false NO lo excluye: seguir la comuna es un opt-in explícito.
        sigue: { userId: 'sigue', zona: false, avistamientos: true, pistas: true,
                 coincidencias: true, canalEmail: true, canalPush: true },
      },
    };
    expect(resolverDestinatarios(evComuna, ctx)).toEqual([
      { userId: 'sigue', canales: ['email', 'push'] },
    ]);
  });

  it('quien matchea por zona Y sigue la comuna recibe un solo aviso (dedup)', () => {
    const ctx: Contexto = {
      ...ctxBase,
      duenoPetId: 'autor',
      // 'ana' cae dentro de la zona...
      zonas: [{ userId: 'ana', lat: -33.451, lng: -70.661, radioKm: 5 }],
      // ...y además sigue la comuna.
      seguidoresComuna: ['ana'],
      prefs: {},
    };
    expect(resolverDestinatarios(evComuna, ctx)).toEqual([
      { userId: 'ana', canales: ['email', 'push'] },
    ]);
  });

  it('nunca le avisa al actor aunque siga la comuna', () => {
    const ctx: Contexto = {
      ...ctxBase,
      duenoPetId: 'autor',
      zonas: [],
      seguidoresComuna: ['autor'],
      prefs: {},
    };
    expect(resolverDestinatarios(evComuna, ctx)).toEqual([]);
  });

  it('respeta los canales de los seguidores de comuna', () => {
    const ctx: Contexto = {
      ...ctxBase,
      duenoPetId: 'autor',
      zonas: [],
      seguidoresComuna: ['sigue'],
      prefs: {
        sigue: { userId: 'sigue', zona: false, avistamientos: true, pistas: true,
                 coincidencias: true, canalEmail: true, canalPush: false },
      },
    };
    expect(resolverDestinatarios(evComuna, ctx)).toEqual([
      { userId: 'sigue', canales: ['email'] },
    ]);
  });

  it('un seguidor que apagó los dos canales no recibe nada', () => {
    const ctx: Contexto = {
      ...ctxBase,
      duenoPetId: 'autor',
      zonas: [],
      seguidoresComuna: ['sigue'],
      prefs: {
        sigue: { userId: 'sigue', zona: true, avistamientos: true, pistas: true,
                 coincidencias: true, canalEmail: false, canalPush: false },
      },
    };
    expect(resolverDestinatarios(evComuna, ctx)).toEqual([]);
  });

  it('combina ambos caminos: por zona (respetando `zona`) y por comuna (opt-in)', () => {
    const ctx: Contexto = {
      ...ctxBase,
      duenoPetId: 'autor',
      zonas: [
        { userId: 'porZona', lat: -33.451, lng: -70.661, radioKm: 5 },
        { userId: 'zonaApagada', lat: -33.452, lng: -70.662, radioKm: 5 },
      ],
      seguidoresComuna: ['porComuna'],
      prefs: {
        // 'zonaApagada' cae en la zona pero apagó la preferencia `zona`: NO recibe.
        zonaApagada: { userId: 'zonaApagada', zona: false, avistamientos: true, pistas: true,
                       coincidencias: true, canalEmail: true, canalPush: true },
      },
    };
    const ids = resolverDestinatarios(evComuna, ctx).map((d) => d.userId).sort();
    expect(ids).toEqual(['porComuna', 'porZona']);
  });

  it('el camino por zona de siempre sigue igual cuando no hay seguidores de comuna', () => {
    const ev: EventoAviso = {
      id: 'c2', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
      datos: { lat: -33.45, lng: -70.66 },
    };
    const ctx: Contexto = {
      ...ctxBase,
      duenoPetId: 'autor',
      seguidoresComuna: [],
      zonas: [
        { userId: 'cerca', lat: -33.451, lng: -70.661, radioKm: 5 },
        { userId: 'lejos', lat: -34.9, lng: -71.9, radioKm: 5 },
      ],
    };
    expect(resolverDestinatarios(ev, ctx).map((d) => d.userId)).toEqual(['cerca']);
  });
});

// Coincidencia proactiva (func. 1): al publicarse un reporte, se avisa al dueño
// del reporte de referencia (pet_id del evento) sobre el reporte que calza (el
// match). Se resuelve igual que avistamiento/pista: destinatario único = dueño,
// excluye al actor, filtra por la preferencia `coincidencias` y por canales.
describe('resolverDestinatarios · coincidencia', () => {
  it('avisa al dueño del reporte de referencia', () => {
    const ev: EventoAviso = {
      id: 'k1', tipo: 'coincidencia', petId: 'p1', actorId: 'quienPublico',
      datos: { match_pet_id: 'p2', match_estado: 'encontrada', match_especie: 'perro' },
    };
    expect(resolverDestinatarios(ev, ctxBase)).toEqual([
      { userId: 'dueno', canales: ['email', 'push'] },
    ]);
  });

  it('nunca le avisa al actor de su propio evento', () => {
    const ev: EventoAviso = {
      id: 'k2', tipo: 'coincidencia', petId: 'p1', actorId: 'dueno',
      datos: { match_pet_id: 'p2', match_estado: 'perdida' },
    };
    expect(resolverDestinatarios(ev, ctxBase)).toEqual([]);
  });

  it('respeta el interruptor de coincidencias apagado', () => {
    const ev: EventoAviso = {
      id: 'k3', tipo: 'coincidencia', petId: 'p1', actorId: 'quienPublico',
      datos: { match_pet_id: 'p2', match_estado: 'encontrada' },
    };
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: true, pistas: true,
                 coincidencias: false, canalEmail: true, canalPush: true },
      },
    };
    expect(resolverDestinatarios(ev, ctx)).toEqual([]);
  });

  it('respeta los canales del dueño', () => {
    const ev: EventoAviso = {
      id: 'k4', tipo: 'coincidencia', petId: 'p1', actorId: 'quienPublico',
      datos: { match_pet_id: 'p2', match_estado: 'perdida' },
    };
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: true, pistas: true,
                 coincidencias: true, canalEmail: false, canalPush: true },
      },
    };
    expect(resolverDestinatarios(ev, ctx)[0].canales).toEqual(['push']);
  });
});

describe('componerAviso · coincidencia', () => {
  const base = (datos: EventoAviso['datos']): EventoAviso => ({
    id: 'k', tipo: 'coincidencia', petId: 'p1', actorId: 'x', datos,
  });

  it('apunta la ruta al reporte que calza (el otro), no al propio', () => {
    const aviso = componerAviso(base({ match_pet_id: 'otro-999', match_estado: 'encontrada' }), ctxBase);
    expect(aviso.ruta).toBe('/mascota/otro-999');
  });

  it('cuando el match es un encontrado, el título habla de un encontrado', () => {
    const aviso = componerAviso(base({ match_pet_id: 'p2', match_estado: 'encontrada' }), ctxBase);
    expect(aviso.titulo).toContain('encontrado');
    expect(aviso.titulo).toContain('Pelusa');
  });

  it('cuando el match es un perdido, el título habla de un perdido', () => {
    const aviso = componerAviso(base({ match_pet_id: 'p2', match_estado: 'perdida' }), ctxBase);
    expect(aviso.titulo).toContain('perdido');
    expect(aviso.titulo).not.toContain('encontrado');
  });

  it('funciona sin nombre de mascota (no muestra "null")', () => {
    const aviso = componerAviso(base({ match_pet_id: 'p2', match_estado: 'encontrada' }),
                                { ...ctxBase, nombrePet: null });
    expect(aviso.titulo).not.toContain('null');
    expect(aviso.titulo.toLowerCase()).toContain('tu mascota');
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
