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
    ctx: { duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [], prefs: {} },
  },
  {
    nombre: 'pista del propio dueño (no se auto-avisa)',
    evento: { id: 'e2', tipo: 'pista', petId: 'p1', actorId: 'dueno', datos: { extracto: 'lo vi' } },
    ctx: { duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [], prefs: {} },
  },
  {
    nombre: 'reporte nuevo con zonas cerca y lejos',
    evento: {
      id: 'e3', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
      datos: { lat: -33.45, lng: -70.66, especie: 'perro' },
    },
    ctx: {
      duenoPetId: 'autor', nombrePet: null, prefs: {},
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
      duenoPetId: 'autor', nombrePet: null, prefs: {},
      zonas: [{ userId: 'cerca', lat: -33.45, lng: -70.66, radioKm: 5 }],
    },
  },
  {
    nombre: 'interruptor de tipo apagado',
    evento: { id: 'e5', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} },
    ctx: {
      duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [],
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
      duenoPetId: 'dueno', nombrePet: null, zonas: [],
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
      duenoPetId: 'autor', nombrePet: null, prefs: {},
      zonas: [{ userId: 'ana', lat: -33.4505, lng: -70.6605, radioKm: 2 }],
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
