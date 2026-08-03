import {
  resolverDestinatarios,
  componerAviso,
  elBloqueoApagaElAviso,
  EventoAviso,
  Contexto,
  TipoEvento,
} from '../../src/lib/notifyTargets';

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

// Coincidencia proactiva (func. 1): al publicarse un reporte, se avisa al dueno
// del reporte de referencia (pet_id del evento) sobre el reporte que calza (el
// match). Se resuelve igual que avistamiento/pista: destinatario unico = dueno,
// excluye al actor, filtra por la preferencia `coincidencias` y por canales.
describe('resolverDestinatarios - coincidencia', () => {
  it('avisa al dueno del reporte de referencia', () => {
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

  it('respeta los canales del dueno', () => {
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

describe('componerAviso - coincidencia', () => {
  const base = (datos: EventoAviso['datos']): EventoAviso => ({
    id: 'k', tipo: 'coincidencia', petId: 'p1', actorId: 'x', datos,
  });

  it('apunta la ruta al reporte que calza (el otro), no al propio', () => {
    const aviso = componerAviso(base({ match_pet_id: 'otro-999', match_estado: 'encontrada' }), ctxBase);
    expect(aviso.ruta).toBe('/mascota/otro-999');
  });

  it('cuando el match es un encontrado, el titulo habla de un encontrado', () => {
    const aviso = componerAviso(base({ match_pet_id: 'p2', match_estado: 'encontrada' }), ctxBase);
    expect(aviso.titulo).toContain('encontrado');
    expect(aviso.titulo).toContain('Pelusa');
  });

  it('cuando el match es un perdido, el titulo habla de un perdido', () => {
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

// Escaneo de collar (Funcion 2): aviso dirigido a UNA persona (el dueno de la
// ficha), no a un reporte. El destinatario sale de evento.targetUserId, no del
// dueno del reporte, porque puede no haber reporte activo.
describe('resolverDestinatarios - escaneo_collar', () => {
  const evEscaneo: EventoAviso = {
    id: 's1', tipo: 'escaneo_collar', petId: '', actorId: null,
    targetUserId: 'dueno', datos: { nombre_mascota: 'Pelusa' },
  };

  it('avisa al dueno de la ficha (targetUserId), no al dueno del reporte', () => {
    const ctx: Contexto = { ...ctxBase, duenoPetId: 'otro' };
    expect(resolverDestinatarios(evEscaneo, ctx)).toEqual([
      { userId: 'dueno', canales: ['email', 'push'] },
    ]);
  });

  it('siempre envia: no hay interruptor de tipo dedicado para escaneo', () => {
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        dueno: { userId: 'dueno', zona: false, avistamientos: false, pistas: false,
                 coincidencias: false, canalEmail: true, canalPush: true },
      },
    };
    expect(resolverDestinatarios(evEscaneo, ctx)).toEqual([
      { userId: 'dueno', canales: ['email', 'push'] },
    ]);
  });

  it('respeta el filtro de canales del dueno', () => {
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: true, pistas: true,
                 coincidencias: true, canalEmail: false, canalPush: true },
      },
    };
    expect(resolverDestinatarios(evEscaneo, ctx)[0].canales).toEqual(['push']);
  });

  it('no envia si el dueno apago los dos canales', () => {
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: true, pistas: true,
                 coincidencias: true, canalEmail: false, canalPush: false },
      },
    };
    expect(resolverDestinatarios(evEscaneo, ctx)).toEqual([]);
  });

  it('sin targetUserId no hay a quien avisar (defensivo)', () => {
    const sinTarget: EventoAviso = { ...evEscaneo, targetUserId: null };
    expect(resolverDestinatarios(sinTarget, ctxBase)).toEqual([]);
  });
});

describe('componerAviso - escaneo_collar', () => {
  it('titulo con el nombre de la mascota y ruta a /mis-mascotas', () => {
    const ev: EventoAviso = {
      id: 's2', tipo: 'escaneo_collar', petId: '', actorId: null,
      targetUserId: 'dueno', datos: { nombre_mascota: 'Pelusa' },
    };
    const aviso = componerAviso(ev, { ...ctxBase, nombrePet: 'Pelusa' });
    expect(aviso.titulo).toContain('la placa de Pelusa');
    expect(aviso.ruta).toBe('/mis-mascotas');
  });

  it('incluye la nota en el cuerpo cuando viene', () => {
    const ev: EventoAviso = {
      id: 's3', tipo: 'escaneo_collar', petId: '', actorId: null,
      targetUserId: 'dueno', datos: { nombre_mascota: 'Pelusa', nota: 'La vi en la plaza' },
    };
    const aviso = componerAviso(ev, ctxBase);
    expect(aviso.cuerpo).toContain('La vi en la plaza');
  });

  it('funciona sin nota (cuerpo generico, sin huecos)', () => {
    const ev: EventoAviso = {
      id: 's4', tipo: 'escaneo_collar', petId: '', actorId: null,
      targetUserId: 'dueno', datos: { nombre_mascota: 'Pelusa' },
    };
    const aviso = componerAviso(ev, ctxBase);
    expect(aviso.cuerpo.length).toBeGreaterThan(0);
    expect(aviso.cuerpo).not.toContain('undefined');
    expect(aviso.cuerpo).not.toContain('null');
  });
});

// Avistamiento anónimo (Tanda 11 · Tarea 2, migración 0050): lo encola alguien
// SIN CUENTA desde la pantalla pública del reporte. Es el único tipo con
// actorId siempre en null, y el que más depende de que el TEXTO diga la verdad:
// no hay fila en `sightings` que mirar, así que lo que se sepa tiene que viajar
// en el propio aviso.
describe('resolverDestinatarios - avistamiento_anonimo', () => {
  const evAnonimo: EventoAviso = {
    id: 'an1', tipo: 'avistamiento_anonimo', petId: 'p1', actorId: null,
    targetUserId: 'dueno', datos: { nota: 'está en la plaza', lat: -33.45, lng: -70.66 },
  };

  it('le avisa al dueño del reporte', () => {
    expect(resolverDestinatarios(evAnonimo, ctxBase)).toEqual([
      { userId: 'dueno', canales: ['email', 'push'] },
    ]);
  });

  it('respeta el interruptor de avistamientos: es un avistamiento', () => {
    // Quien apagó "avistamientos" pidió no recibir esto. Que el aviso venga de
    // alguien sin cuenta no lo convierte en otra cosa. Si cayera en el
    // `return p.pistas` del final —que es lo que hace hoy el dispatcher
    // desplegado con un tipo que no conoce— miraría el interruptor equivocado.
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: false, pistas: true,
                 coincidencias: true, canalEmail: true, canalPush: true },
      },
    };
    expect(resolverDestinatarios(evAnonimo, ctx)).toEqual([]);
  });

  it('respeta el filtro de canales', () => {
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: true, pistas: true,
                 coincidencias: true, canalEmail: false, canalPush: true },
      },
    };
    expect(resolverDestinatarios(evAnonimo, ctx)[0].canales).toEqual(['push']);
  });
});

describe('componerAviso - avistamiento_anonimo', () => {
  it('dice que alguien la vio y lleva al reporte, con la nota adentro', () => {
    const ev: EventoAviso = {
      id: 'an2', tipo: 'avistamiento_anonimo', petId: 'p1', actorId: null,
      targetUserId: 'dueno', datos: { nota: 'está en la plaza, tranquila' },
    };
    // Sin "Entrá a ver dónde fue", a diferencia del avistamiento normal: este
    // no crea fila en `sightings`, así que el dueño llegaría a un mapa idéntico
    // al que ya tenía. En cambio se dice de dónde salió, porque es el único
    // texto que entra a la app sin ninguna cuenta detrás.
    expect(componerAviso(ev, ctxBase)).toEqual({
      titulo: 'Alguien vio a Pelusa',
      cuerpo:
        '"está en la plaza, tranquila" · Lo escribió alguien sin cuenta, desde el link público.',
      ruta: '/mascota/p1',
    });
  });

  it('sin nota no deja huecos ni promete un detalle que no tiene', () => {
    const ev: EventoAviso = {
      id: 'an3', tipo: 'avistamiento_anonimo', petId: 'p1', actorId: null,
      targetUserId: 'dueno', datos: {},
    };
    const aviso = componerAviso(ev, ctxBase);
    expect(aviso.cuerpo).not.toContain('undefined');
    expect(aviso.cuerpo).not.toContain('null');
    expect(aviso.cuerpo).not.toContain('""');
    expect(aviso.ruta).toBe('/mascota/p1');
  });

  it('NO se compone como una pista: el texto de pista sería mentira', () => {
    // Sin su propio branch, este tipo cae en el `return` final de componerAviso
    // y sale "Dejaron una pista sobre Pelusa" con la nota perdida. Nadie dejó
    // una pista: alguien está parado al lado del animal.
    const ev: EventoAviso = {
      id: 'an4', tipo: 'avistamiento_anonimo', petId: 'p1', actorId: null,
      targetUserId: 'dueno', datos: { nota: 'la tengo conmigo' },
    };
    expect(componerAviso(ev, ctxBase).titulo).not.toContain('pista');
    expect(componerAviso(ev, ctxBase).cuerpo).toContain('la tengo conmigo');
  });

  it('sin nombre habla de "tu mascota", nunca de un hueco', () => {
    const ev: EventoAviso = {
      id: 'an5', tipo: 'avistamiento_anonimo', petId: 'p1', actorId: null,
      targetUserId: 'dueno', datos: {},
    };
    expect(componerAviso(ev, { ...ctxBase, nombrePet: null }).titulo).toBe(
      'Alguien vio a tu mascota',
    );
  });
});

// Búsqueda guardada (Función 2): aviso dirigido a UNA persona (quien guardó la
// búsqueda), igual que escaneo_collar: el destinatario sale de targetUserId,
// no del dueño de un reporte, y no pasa por ningún interruptor de tipo.
describe('resolverDestinatarios - busqueda_guardada', () => {
  const evBusqueda: EventoAviso = {
    id: 'b1', tipo: 'busqueda_guardada', petId: 'p1', actorId: 'quienPublico',
    targetUserId: 'buscador', datos: { estado: 'perdida', especie: 'gato', comuna: 'Ñuñoa', nombre: 'Luna' },
  };

  it('avisa a quien guardó la búsqueda (targetUserId), no al actor', () => {
    const ctx: Contexto = { ...ctxBase, duenoPetId: 'otro' };
    expect(resolverDestinatarios(evBusqueda, ctx)).toEqual([
      { userId: 'buscador', canales: ['email', 'push'] },
    ]);
  });

  it('excluye al actor aunque targetUserId coincidiera con él (defensivo)', () => {
    const ev: EventoAviso = { ...evBusqueda, targetUserId: 'quienPublico' };
    expect(resolverDestinatarios(ev, ctxBase)).toEqual([]);
  });

  it('siempre envía: no hay interruptor de tipo ni filtro de zona (opt-in explícito)', () => {
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        buscador: { userId: 'buscador', zona: false, avistamientos: false, pistas: false,
                    coincidencias: false, canalEmail: true, canalPush: true },
      },
    };
    expect(resolverDestinatarios(evBusqueda, ctx)).toEqual([
      { userId: 'buscador', canales: ['email', 'push'] },
    ]);
  });

  it('respeta el filtro de canales (canal_email=false)', () => {
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        buscador: { userId: 'buscador', zona: true, avistamientos: true, pistas: true,
                    coincidencias: true, canalEmail: false, canalPush: true },
      },
    };
    expect(resolverDestinatarios(evBusqueda, ctx)[0].canales).toEqual(['push']);
  });

  it('no envía si apagó los dos canales', () => {
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        buscador: { userId: 'buscador', zona: true, avistamientos: true, pistas: true,
                    coincidencias: true, canalEmail: false, canalPush: false },
      },
    };
    expect(resolverDestinatarios(evBusqueda, ctx)).toEqual([]);
  });

  it('sin targetUserId no hay a quien avisar (defensivo)', () => {
    const sinTarget: EventoAviso = { ...evBusqueda, targetUserId: null };
    expect(resolverDestinatarios(sinTarget, ctxBase)).toEqual([]);
  });
});

describe('componerAviso - busqueda_guardada', () => {
  it('arma el texto con estado, comuna, especie y nombre; ruta a /mascota/:id', () => {
    const ev: EventoAviso = {
      id: 'b2', tipo: 'busqueda_guardada', petId: 'p9', actorId: 'x',
      targetUserId: 'buscador', datos: { estado: 'perdida', especie: 'perro', comuna: 'Maipú', nombre: 'Luna' },
    };
    const aviso = componerAviso(ev, ctxBase);
    expect(aviso.cuerpo).toContain('PERDIDA');
    expect(aviso.cuerpo).toContain('Maipú');
    expect(aviso.cuerpo).toContain('perro');
    expect(aviso.cuerpo).toContain('«Luna»');
    expect(aviso.ruta).toBe('/mascota/p9');
  });

  it('funciona sin nombre de reporte (sin huecos)', () => {
    const ev: EventoAviso = {
      id: 'b3', tipo: 'busqueda_guardada', petId: 'p9', actorId: 'x',
      targetUserId: 'buscador', datos: { estado: 'encontrada', especie: 'gato', comuna: 'Ñuñoa' },
    };
    const aviso = componerAviso(ev, ctxBase);
    expect(aviso.cuerpo).toContain('ENCONTRADA');
    expect(aviso.cuerpo).not.toContain('undefined');
    expect(aviso.cuerpo).not.toContain('null');
    expect(aviso.cuerpo).not.toContain('«');
  });
});

// Denuncia nueva (Tanda 13 · C, migración 0060): aviso dirigido a UN admin (el
// que encoló el trigger de la 0060), igual que escaneo_collar/busqueda_guardada:
// el destinatario sale de targetUserId, no pasa por ningún interruptor de tipo
// (ni siquiera el de 'pistas', donde caería por descarte). El cuerpo apunta a
// la bandeja de Moderación y nunca lleva el texto libre del denunciante: ese
// dato no viaja en el evento (ver 0060), a propósito.
describe('resolverDestinatarios - denuncia_nueva', () => {
  const evDenuncia: EventoAviso = {
    id: 'd1', tipo: 'denuncia_nueva', petId: '', actorId: null,
    targetUserId: 'admin-1', datos: {},
  };

  it('va SOLO al admin destinatario, sin pasar por el interruptor de pistas', () => {
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        'admin-1': { userId: 'admin-1', zona: true, avistamientos: true, pistas: false,
                     coincidencias: true, canalEmail: true, canalPush: true },
      },
    };
    expect(resolverDestinatarios(evDenuncia, ctx)).toEqual([
      { userId: 'admin-1', canales: ['email', 'push'] },
    ]);
  });

  it('sin targetUserId no hay a quien avisar (defensivo)', () => {
    const sinTarget: EventoAviso = { ...evDenuncia, targetUserId: null };
    expect(resolverDestinatarios(sinTarget, ctxBase)).toEqual([]);
  });
});

describe('componerAviso - denuncia_nueva', () => {
  it('compone un aviso que apunta a la bandeja, sin texto del denunciante', () => {
    const ev: EventoAviso = {
      id: 'd2', tipo: 'denuncia_nueva', petId: '', actorId: null,
      targetUserId: 'admin-1',
      datos: { tipo_denuncia: 'reporte', motivo: 'spam' } as EventoAviso['datos'],
    };
    const aviso = componerAviso(ev, ctxBase);
    expect(aviso.titulo).toBe('Entró una denuncia nueva');
    expect(aviso.cuerpo).toContain('Perfil → Moderación');
    expect(aviso.cuerpo).not.toContain('spam-detalle-libre');
  });
});

// Reencuentro con seguimiento (Tanda 13 · D, migración 0061): lo encola el
// trigger cuando la mascota de un seguimiento anónimo se reencuentra. El
// correo del seguidor viaja en datos.correo, de FINALIDAD ÚNICA — nunca hay
// cuenta detrás, así que jamás resuelve destinatarios: index.ts manda el
// correo directo a datos.correo y nada más (sin push, sin prefs).
describe('resolverDestinatarios - reencuentro_seguimiento', () => {
  it('no resuelve destinatarios con cuenta: va por correo directo', () => {
    const ev: EventoAviso = {
      id: 'r1', tipo: 'reencuentro_seguimiento', petId: 'p1', actorId: null,
      targetUserId: null, datos: { correo: 'vecino@mail.cl', nombre: 'Luna' },
    };
    expect(resolverDestinatarios(ev, ctxBase)).toEqual([]);
  });
});

describe('componerAviso - reencuentro_seguimiento', () => {
  it('el aviso del reencuentro agradece, dice que es el único correo, y no pide nada', () => {
    const ev: EventoAviso = {
      id: 'r2', tipo: 'reencuentro_seguimiento', petId: 'p1', actorId: null,
      datos: { correo: 'x@x.cl', nombre: 'Luna' },
    };
    const aviso = componerAviso(ev, ctxBase);
    expect(aviso.titulo).toBe('¡Luna volvió a casa!');
    expect(aviso.cuerpo).toContain('Gracias por parar');
    expect(aviso.cuerpo).toContain('único correo');
    expect(aviso.ruta).toBe('/mascota/p1');
  });

  it('sin nombre no deja un hueco en el título', () => {
    const ev: EventoAviso = {
      id: 'r3', tipo: 'reencuentro_seguimiento', petId: 'p1', actorId: null,
      datos: { correo: 'x@x.cl' },
    };
    expect(componerAviso(ev, ctxBase).titulo).toBe('¡Volvió a casa!');
  });

  it('sin petId la ruta cae a inicio, no a un deep link roto', () => {
    const ev: EventoAviso = {
      id: 'r4', tipo: 'reencuentro_seguimiento', petId: '', actorId: null,
      datos: { correo: 'x@x.cl', nombre: 'Luna' },
    };
    expect(componerAviso(ev, ctxBase).ruta).toBe('/');
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

// ------------------------------------------------------------
// BLOQUEO (0022): un aviso es más invasivo que un mensaje. Quien tiene un
// bloqueo con el actor —en cualquier dirección— no recibe nada.
// ------------------------------------------------------------
describe('resolverDestinatarios - bloqueo con el actor', () => {
  it('no le avisa al dueño que tiene bloqueo con quien dejó el avistamiento', () => {
    const ev: EventoAviso = { id: 'b1', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} };
    const ctx: Contexto = { ...ctxBase, bloqueadosConActor: ['dueno'] };
    expect(resolverDestinatarios(ev, ctx)).toEqual([]);
  });

  it('sigue avisando a quien NO está en la lista de bloqueos', () => {
    const ev: EventoAviso = { id: 'b2', tipo: 'pista', petId: 'p1', actorId: 'vecino', datos: {} };
    const ctx: Contexto = { ...ctxBase, bloqueadosConActor: ['otroCualquiera'] };
    expect(resolverDestinatarios(ev, ctx)).toEqual([
      { userId: 'dueno', canales: ['email', 'push'] },
    ]);
  });

  it('saca del reporte nuevo solo a los bloqueados, no a los demás vecinos', () => {
    const ev: EventoAviso = {
      id: 'b3', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
      datos: { lat: -33.45, lng: -70.66 },
    };
    const ctx: Contexto = {
      ...ctxBase,
      zonas: [
        { userId: 'ana', lat: -33.451, lng: -70.661, radioKm: 5 },
        { userId: 'beto', lat: -33.451, lng: -70.661, radioKm: 5 },
      ],
      bloqueadosConActor: ['beto'],
    };
    expect(resolverDestinatarios(ev, ctx).map((d) => d.userId)).toEqual(['ana']);
  });

  it('el opt-in de comuna NO saltea el bloqueo (seguir la comuna no es aceptar al acosador)', () => {
    const ev: EventoAviso = {
      id: 'b4', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
      datos: { lat: -33.45, lng: -70.66, comuna: 'Maipú' },
    };
    const ctx: Contexto = {
      ...ctxBase,
      zonas: [],
      seguidoresComuna: ['sigueComuna', 'bloqueada'],
      bloqueadosConActor: ['bloqueada'],
    };
    expect(resolverDestinatarios(ev, ctx).map((d) => d.userId)).toEqual(['sigueComuna']);
  });

  it('tampoco pasa por el destinatario dirigido de escaneo_collar', () => {
    const ev: EventoAviso = {
      id: 'b5', tipo: 'escaneo_collar', petId: '', actorId: 'quienEscaneo',
      targetUserId: 'dueno', datos: { nombre_mascota: 'Pelusa' },
    };
    const ctx: Contexto = { ...ctxBase, bloqueadosConActor: ['dueno'] };
    expect(resolverDestinatarios(ev, ctx)).toEqual([]);
  });

  it('tampoco pasa por el destinatario dirigido de busqueda_guardada', () => {
    const ev: EventoAviso = {
      id: 'b6', tipo: 'busqueda_guardada', petId: 'p1', actorId: 'quienPublico',
      targetUserId: 'buscador', datos: { estado: 'perdida', especie: 'gato', comuna: 'Ñuñoa' },
    };
    const ctx: Contexto = { ...ctxBase, bloqueadosConActor: ['buscador'] };
    expect(resolverDestinatarios(ev, ctx)).toEqual([]);
  });

  it('sin el campo (contexto viejo o consulta caída) avisa como siempre: degrada, no corta', () => {
    const ev: EventoAviso = { id: 'b7', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} };
    const { bloqueadosConActor: _omitido, ...sinCampo } = { ...ctxBase, bloqueadosConActor: [] };
    expect(resolverDestinatarios(ev, sinCampo as Contexto)).toEqual([
      { userId: 'dueno', canales: ['email', 'push'] },
    ]);
  });
});

// ------------------------------------------------------------
// LA EXCEPCIÓN: 'coincidencia' llega IGUAL aunque haya bloqueo.
//
// Un reporte de mascota es el pedido de auxilio de un animal, no contenido
// dirigido contra una persona; y los reportes son públicos (se ven sin cuenta),
// así que callar el aviso no protege a nadie: solo le hace perder la pista de
// su mascota a quien la busca. Es la misma decisión que ya regía en las listas
// (bloquear NO esconde los reportes del bloqueado).
// ------------------------------------------------------------
describe('elBloqueoApagaElAviso', () => {
  it('exceptúa solo a coincidencia', () => {
    expect(elBloqueoApagaElAviso('coincidencia')).toBe(false);
  });

  it('sigue apagando todos los demás tipos', () => {
    const resto: TipoEvento[] = [
      'reporte_nuevo',
      'avistamiento',
      'pista',
      'escaneo_collar',
      'busqueda_guardada',
      'avistamiento_anonimo',
    ];
    for (const tipo of resto) expect(elBloqueoApagaElAviso(tipo)).toBe(true);
  });
});

describe('resolverDestinatarios - la coincidencia atraviesa el bloqueo', () => {
  const evCoincidencia: EventoAviso = {
    id: 'c1', tipo: 'coincidencia', petId: 'p1', actorId: 'quienPublico',
    datos: { match_pet_id: 'p2', match_estado: 'encontrada' },
  };

  it('le avisa al dueño aunque tenga bloqueo con quien publicó el reporte que calza', () => {
    const ctx: Contexto = { ...ctxBase, bloqueadosConActor: ['dueno'] };
    expect(resolverDestinatarios(evCoincidencia, ctx)).toEqual([
      { userId: 'dueno', canales: ['email', 'push'] },
    ]);
  });

  it('da exactamente el mismo resultado con bloqueo que sin bloqueo', () => {
    const conBloqueo: Contexto = { ...ctxBase, bloqueadosConActor: ['dueno'] };
    expect(resolverDestinatarios(evCoincidencia, conBloqueo)).toEqual(
      resolverDestinatarios(evCoincidencia, ctxBase),
    );
  });

  it('la excepción NO se contagia: el mismo par bloqueado sigue sin recibir el avistamiento', () => {
    const ev: EventoAviso = { id: 'c2', tipo: 'avistamiento', petId: 'p1', actorId: 'quienPublico', datos: {} };
    const ctx: Contexto = { ...ctxBase, bloqueadosConActor: ['dueno'] };
    expect(resolverDestinatarios(ev, ctx)).toEqual([]);
  });

  it('la excepción NO pisa el interruptor `coincidencias`: si lo apagó, no recibe', () => {
    const ctx: Contexto = {
      ...ctxBase,
      bloqueadosConActor: ['dueno'],
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: true, pistas: true,
                 coincidencias: false, canalEmail: true, canalPush: true },
      },
    };
    expect(resolverDestinatarios(evCoincidencia, ctx)).toEqual([]);
  });

  it('la excepción NO pisa el filtro de canales: con los dos apagados no hay por dónde', () => {
    const ctx: Contexto = {
      ...ctxBase,
      bloqueadosConActor: ['dueno'],
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: true, pistas: true,
                 coincidencias: true, canalEmail: false, canalPush: false },
      },
    };
    expect(resolverDestinatarios(evCoincidencia, ctx)).toEqual([]);
  });

  it('la excepción NO hace que el actor se auto-avise', () => {
    const ev: EventoAviso = { ...evCoincidencia, id: 'c3', actorId: 'dueno' };
    const ctx: Contexto = { ...ctxBase, bloqueadosConActor: ['dueno'] };
    expect(resolverDestinatarios(ev, ctx)).toEqual([]);
  });
});
