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
];

describe('el espejo de notifyTargets no se desincroniza', () => {
  it('exporta los mismos valores por defecto', () => {
    expect(edge.PREFS_POR_DEFECTO).toEqual(app.PREFS_POR_DEFECTO);
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
