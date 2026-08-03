// La lógica de targeting vive duplicada: `src/lib/notifyTargets.ts` la usa la app
// y `supabase/functions/send-notifications/notifyTargets.ts` la usa la Edge Function
// (el runtime de Deno solo empaqueta la carpeta de la función). Sin esta prueba, las
// dos copias pueden separarse en silencio y la app diría una cosa y el correo otra.
import * as app from '../../src/lib/notifyTargets';
import * as edge from '../../supabase/functions/send-notifications/notifyTargets';

const CASOS: { nombre: string; evento: app.EventoAviso; ctx: app.Contexto }[] = [
  {
    nombre: 'avistamiento al dueño',
    evento: { id: 'e1', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} },
    ctx: { duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [], prefs: {}, seguidoresComuna: [] },
  },
  {
    nombre: 'pista del propio dueño (no se auto-avisa)',
    evento: { id: 'e2', tipo: 'pista', petId: 'p1', actorId: 'dueno', datos: { extracto: 'lo vi' } },
    ctx: { duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [], prefs: {}, seguidoresComuna: [] },
  },
  {
    nombre: 'reporte nuevo con zonas cerca y lejos',
    evento: {
      id: 'e3', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
      datos: { lat: -33.45, lng: -70.66, especie: 'perro' },
    },
    ctx: {
      duenoPetId: 'autor', nombrePet: null, prefs: {}, seguidoresComuna: [],
      zonas: [
        { userId: 'cerca', lat: -33.451, lng: -70.661, radioKm: 5 },
        { userId: 'lejos', lat: -34.9, lng: -71.9, radioKm: 5 },
        { userId: 'cerca', lat: -33.452, lng: -70.662, radioKm: 10 },
      ],
    },
  },
  {
    nombre: 'reporte nuevo sin coordenadas',
    evento: { id: 'e4', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor', datos: {} },
    ctx: {
      duenoPetId: 'autor', nombrePet: null, prefs: {}, seguidoresComuna: [],
      zonas: [{ userId: 'cerca', lat: -33.45, lng: -70.66, radioKm: 5 }],
    },
  },
  {
    nombre: 'interruptor de tipo apagado',
    evento: { id: 'e5', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} },
    ctx: {
      duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [], seguidoresComuna: [],
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: false, pistas: true,
                 coincidencias: true, canalEmail: true, canalPush: true },
      },
    },
  },
  {
    nombre: 'un solo canal encendido',
    evento: { id: 'e6', tipo: 'pista', petId: 'p1', actorId: 'vecino', datos: { extracto: 'andaba solo' } },
    ctx: {
      duenoPetId: 'dueno', nombrePet: null, zonas: [], seguidoresComuna: [],
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: true, pistas: true,
                 coincidencias: true, canalEmail: false, canalPush: true },
      },
    },
  },
  {
    nombre: 'gato perdido cerca',
    evento: {
      id: 'e7', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
      datos: { lat: -33.45, lng: -70.66, especie: 'gato' },
    },
    ctx: {
      duenoPetId: 'autor', nombrePet: null, prefs: {}, seguidoresComuna: [],
      zonas: [{ userId: 'ana', lat: -33.4505, lng: -70.6605, radioKm: 2 }],
    },
  },
  {
    // Camino por comuna (Tanda 3 · C): unión zona + seguidores, dedup, opt-in sin
    // filtro de `zona`, y el actor excluido aunque siga la comuna. El espejo debe
    // resolver esto idéntico en las dos copias.
    nombre: 'reporte nuevo con seguidores de comuna (unión + dedup + opt-in)',
    evento: {
      id: 'e8', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
      datos: { lat: -33.45, lng: -70.66, especie: 'perro', comuna: 'Maipú' },
    },
    ctx: {
      duenoPetId: 'autor', nombrePet: null,
      // 'ana' entra por zona; 'ana' y 'siguezona' siguen la comuna; 'autor' (actor)
      // también la sigue pero nunca recibe.
      zonas: [{ userId: 'ana', lat: -33.451, lng: -70.661, radioKm: 5 }],
      seguidoresComuna: ['ana', 'siguezona', 'autor'],
      prefs: {
        // 'siguezona' tiene `zona` apagada: igual recibe por ser opt-in de comuna.
        siguezona: { userId: 'siguezona', zona: false, avistamientos: true, pistas: true,
                     coincidencias: true, canalEmail: true, canalPush: false },
      },
    },
  },
  {
    // Coincidencia (func. 1): destinatario = dueño del reporte de referencia; el
    // título depende de match_estado y la ruta apunta al match. Las dos copias
    // deben resolverlo idéntico.
    nombre: 'coincidencia (match encontrado) al dueño del reporte de referencia',
    evento: {
      id: 'e9', tipo: 'coincidencia', petId: 'p1', actorId: 'quienPublico',
      datos: { match_pet_id: 'p2', match_estado: 'encontrada', match_especie: 'perro' },
    },
    ctx: {
      duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [], prefs: {}, seguidoresComuna: [],
    },
  },
  {
    // Escaneo de collar (Función 2): destinatario = targetUserId, sin interruptor
    // de tipo, ruta a /mis-mascotas, nota en el cuerpo. El espejo debe resolverlo
    // idéntico en las dos copias.
    nombre: 'escaneo de collar con nota (destinatario dirigido)',
    evento: {
      id: 's1', tipo: 'escaneo_collar', petId: '', actorId: null,
      targetUserId: 'dueno', datos: { nombre_mascota: 'Pelusa', nota: 'La vi en la plaza' },
    },
    ctx: {
      duenoPetId: 'otro', nombrePet: 'Pelusa', zonas: [], seguidoresComuna: [],
      prefs: {
        dueno: { userId: 'dueno', zona: false, avistamientos: false, pistas: false,
                 coincidencias: false, canalEmail: true, canalPush: true },
      },
    },
  },
  {
    // Búsqueda guardada (Función 2): destinatario = targetUserId, sin
    // interruptor de tipo ni filtro de zona (opt-in explícito), ruta a
    // /mascota/:id con el estado/comuna/especie/nombre del reporte que calzó.
    nombre: 'búsqueda guardada que calza con un reporte nuevo (destinatario dirigido)',
    evento: {
      id: 'g1', tipo: 'busqueda_guardada', petId: 'p1', actorId: 'quienPublico',
      targetUserId: 'buscador', datos: { estado: 'perdida', especie: 'gato', comuna: 'Ñuñoa', nombre: 'Luna' },
    },
    ctx: {
      duenoPetId: 'otro', nombrePet: null, zonas: [], seguidoresComuna: [],
      prefs: {
        buscador: { userId: 'buscador', zona: false, avistamientos: false, pistas: false,
                    coincidencias: false, canalEmail: true, canalPush: false },
      },
    },
  },
  {
    // Avistamiento anónimo (Tanda 11, migración 0050): lo encola alguien SIN
    // cuenta desde la pantalla pública; actorId es null siempre. La copia de la
    // Edge Function es la que arma el correo que le llega al dueño: si se
    // separan, la app promete un texto y el correo dice otro.
    nombre: 'avistamiento anónimo con nota (sin cuenta, actor null)',
    evento: {
      id: 'an1', tipo: 'avistamiento_anonimo', petId: 'p1', actorId: null,
      targetUserId: 'dueno', datos: { nota: 'está en la plaza', lat: -33.45, lng: -70.66 },
    },
    ctx: {
      duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [], prefs: {}, seguidoresComuna: [],
    },
  },
  {
    nombre: 'avistamiento anónimo sin nota y con el interruptor de avistamientos apagado',
    evento: {
      id: 'an2', tipo: 'avistamiento_anonimo', petId: 'p1', actorId: null,
      targetUserId: 'dueno', datos: {},
    },
    ctx: {
      duenoPetId: 'dueno', nombrePet: null, zonas: [], seguidoresComuna: [],
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: false, pistas: true,
                 coincidencias: true, canalEmail: true, canalPush: true },
      },
    },
  },
  {
    // Bloqueo (0022): quien tiene bloqueo con el actor no recibe el aviso. Las
    // dos copias tienen que filtrarlo igual — si una se olvida, el bloqueado le
    // sigue haciendo sonar el teléfono a quien lo bloqueó desde la Edge Function.
    nombre: 'bloqueo con el actor: el dueño no recibe el avistamiento',
    evento: { id: 'x1', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} },
    ctx: {
      duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [], prefs: {}, seguidoresComuna: [],
      bloqueadosConActor: ['dueno'],
    },
  },
  {
    // El opt-in de comuna NO puede saltear el bloqueo, en ninguna de las copias.
    nombre: 'bloqueo con el actor: ni el opt-in de comuna lo saltea',
    evento: {
      id: 'x2', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
      datos: { lat: -33.45, lng: -70.66, especie: 'perro', comuna: 'Maipú' },
    },
    ctx: {
      duenoPetId: 'autor', nombrePet: null, prefs: {},
      zonas: [{ userId: 'ana', lat: -33.451, lng: -70.661, radioKm: 5 }],
      seguidoresComuna: ['ana', 'bloqueada'],
      bloqueadosConActor: ['bloqueada'],
    },
  },
  {
    // Destinatario dirigido: tampoco lo esquiva.
    nombre: 'bloqueo con el actor: el escaneo de collar dirigido tampoco pasa',
    evento: {
      id: 'x3', tipo: 'escaneo_collar', petId: '', actorId: 'quienEscaneo',
      targetUserId: 'dueno', datos: { nombre_mascota: 'Pelusa' },
    },
    ctx: {
      duenoPetId: 'otro', nombrePet: 'Pelusa', zonas: [], prefs: {}, seguidoresComuna: [],
      bloqueadosConActor: ['dueno'],
    },
  },
  {
    // LA EXCEPCIÓN: 'coincidencia' atraviesa el bloqueo. Si una de las dos
    // copias se quedara con el filtro viejo, la app diría "te avisamos" y el
    // correo/push no saldría (o al revés). Es justo el tipo de divergencia que
    // este archivo existe para atrapar.
    nombre: 'coincidencia con bloqueo: el aviso llega IGUAL (la excepción)',
    evento: {
      id: 'x4', tipo: 'coincidencia', petId: 'p1', actorId: 'quienPublico',
      datos: { match_pet_id: 'p2', match_estado: 'encontrada', match_especie: 'perro' },
    },
    ctx: {
      duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [], prefs: {}, seguidoresComuna: [],
      bloqueadosConActor: ['dueno'],
    },
  },
  {
    // La excepción no pisa el interruptor de tipo, en ninguna de las copias.
    nombre: 'coincidencia con bloqueo pero con el interruptor `coincidencias` apagado',
    evento: {
      id: 'x5', tipo: 'coincidencia', petId: 'p1', actorId: 'quienPublico',
      datos: { match_pet_id: 'p2', match_estado: 'perdida' },
    },
    ctx: {
      duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [], seguidoresComuna: [],
      bloqueadosConActor: ['dueno'],
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: true, pistas: true,
                 coincidencias: false, canalEmail: true, canalPush: true },
      },
    },
  },
  {
    // Reencuentro con seguimiento (Tanda 13 · D, migración 0061): el correo
    // del seguidor anónimo va DIRECTO desde index.ts, nunca por acá — pero
    // las dos copias tienen que devolver lo mismo (vacío) igual, y componer
    // el mismo texto: si se separan, index.ts arma un correo distinto según
    // qué copia haya quedado desactualizada.
    nombre: 'reencuentro con seguimiento: no resuelve destinatarios, compone el mismo texto',
    evento: {
      id: 'r1', tipo: 'reencuentro_seguimiento', petId: 'p1', actorId: null,
      datos: { correo: 'vecino@mail.cl', nombre: 'Luna' },
    },
    ctx: {
      duenoPetId: '', nombrePet: null, zonas: [], prefs: {}, seguidoresComuna: [],
    },
  },
  {
    // Denuncia nueva (Tanda 13 · C, migración 0060): destinatario DIRIGIDO
    // (el admin de targetUserId), sin pasar por el interruptor de tipo —
    // mismo criterio que 'escaneo_collar'/'busqueda_guardada'. `datos` NO
    // lleva el detalle libre del denunciante (solo tipo_denuncia/motivo, de
    // listas cerradas), y el texto apunta a la bandeja de Moderación, nunca
    // al contenido denunciado (F14: este caso faltaba entero en CASOS).
    nombre: 'denuncia nueva al admin destinatario (dirigido, sin interruptor de tipo)',
    evento: {
      id: 'd1', tipo: 'denuncia_nueva', petId: '', actorId: null,
      targetUserId: 'admin-1', datos: { tipo_denuncia: 'reporte', motivo: 'spam' },
    },
    ctx: {
      duenoPetId: 'otro', nombrePet: null, zonas: [], seguidoresComuna: [],
      prefs: {
        // 'pistas' apagada a propósito: 'denuncia_nueva' no pasa por
        // `quiereEsteTipo`, así que este interruptor no debe apagarla.
        'admin-1': { userId: 'admin-1', zona: true, avistamientos: true, pistas: false,
                     coincidencias: true, canalEmail: true, canalPush: true },
      },
    },
  },
];

// Todos los tipos del union, con exhaustividad REAL: `Record<TipoEvento, true>`
// no compila si a `TipoEvento` se le agrega un miembro y no se lo suma acá
// (TS tira "falta la propiedad"), a diferencia de un array literal —que
// acepta cualquier subconjunto sin quejarse— como este mismo archivo tenía
// antes (F14: el comentario viejo prometía esa exhaustividad y no era cierto).
const TODOS_LOS_TIPOS_MAPA: Record<app.TipoEvento, true> = {
  reporte_nuevo: true,
  avistamiento: true,
  pista: true,
  coincidencia: true,
  escaneo_collar: true,
  busqueda_guardada: true,
  avistamiento_anonimo: true,
  denuncia_nueva: true,
  reencuentro_seguimiento: true,
};
const TODOS_LOS_TIPOS = Object.keys(TODOS_LOS_TIPOS_MAPA) as app.TipoEvento[];

describe('el espejo de notifyTargets no se desincroniza', () => {
  it('exporta los mismos valores por defecto', () => {
    expect(edge.PREFS_POR_DEFECTO).toEqual(app.PREFS_POR_DEFECTO);
  });

  it('coincide en a qué tipos les apaga el aviso el bloqueo', () => {
    for (const tipo of TODOS_LOS_TIPOS) {
      expect([tipo, edge.elBloqueoApagaElAviso(tipo as never)]).toEqual([
        tipo,
        app.elBloqueoApagaElAviso(tipo),
      ]);
    }
  });

  CASOS.forEach(({ nombre, evento, ctx }) => {
    it(`resuelve los mismos destinatarios: ${nombre}`, () => {
      expect(edge.resolverDestinatarios(evento as never, ctx as never)).toEqual(
        app.resolverDestinatarios(evento, ctx),
      );
    });

    it(`compone el mismo aviso: ${nombre}`, () => {
      expect(edge.componerAviso(evento as never, ctx as never)).toEqual(
        app.componerAviso(evento, ctx),
      );
    });
  });
});

// Los casos de arriba comparan las dos copias entre sí: si LAS DOS se olvidaran
// del filtro de bloqueo, seguirían dando igual y el test pasaría igual. Esto lo
// cierra: se le exige a la copia de la Edge Function —la que despacha de verdad
// los correos y los push— un resultado concreto, no solo "lo mismo que la otra".
describe('la copia de la Edge Function filtra bloqueados de verdad', () => {
  it('deja fuera al destinatario bloqueado y adentro al que no lo está', () => {
    const evento = {
      id: 'z1', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
      datos: { lat: -33.45, lng: -70.66 },
    };
    const ctx = {
      duenoPetId: 'autor', nombrePet: null, prefs: {}, seguidoresComuna: [],
      zonas: [
        { userId: 'ana', lat: -33.451, lng: -70.661, radioKm: 5 },
        { userId: 'beto', lat: -33.451, lng: -70.661, radioKm: 5 },
      ],
      bloqueadosConActor: ['beto'],
    };
    expect(edge.resolverDestinatarios(evento as never, ctx as never).map((d) => d.userId)).toEqual([
      'ana',
    ]);
  });

  // El contrapunto del anterior, y por el mismo motivo: si las DOS copias se
  // quedaran con el filtro viejo sobre 'coincidencia', la comparación de arriba
  // seguiría en verde. Acá se le exige a la copia que despacha de verdad un
  // resultado concreto: el aviso SALE.
  it('pero deja pasar la coincidencia aunque haya bloqueo', () => {
    const evento = {
      id: 'z2', tipo: 'coincidencia', petId: 'p1', actorId: 'quienPublico',
      datos: { match_pet_id: 'p2', match_estado: 'encontrada' },
    };
    const ctx = {
      duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [], prefs: {}, seguidoresComuna: [],
      bloqueadosConActor: ['dueno'],
    };
    expect(edge.resolverDestinatarios(evento as never, ctx as never).map((d) => d.userId)).toEqual([
      'dueno',
    ]);
  });
});
