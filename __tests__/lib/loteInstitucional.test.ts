import {
  ofertaTrasPublicar,
  siguienteDelLote,
  type FormularioReporte,
} from '../../src/lib/loteInstitucional';

// CARGA EN LOTE — un refugio con 15 animales no los sube de a uno.
//
// El costo de usar la app para una institución no es la falta de funciones: es
// que el formulario pide 12 veces la misma comuna, el mismo punto del mapa y la
// misma confirmación. La versión mínima es repetir el formulario conservando lo
// COMÚN y limpiando lo que es de ESE animal.
//
// Y lo que se limpia importa más que lo que se conserva. Publicar al animal #2
// con la foto del #1 no es una molestia: es un reporte falso con la cara de
// otro perro, en una app cuyo único activo es que la gente le crea.

const BASE: FormularioReporte = {
  estado: 'encontrada',
  especie: 'perro',
  ambito: 'interior',
  raza: 'quiltro',
  nombre: 'Negro',
  descripcion: 'Manchita blanca en el pecho',
  ofreceRecompensa: true,
  sena1: 'cicatriz en la panza',
  sena2: 'responde a un silbido',
  fotoUris: ['file://negro-1.jpg', 'file://negro-2.jpg'],
  comuna: 'Ñuñoa',
  comunaManual: true,
  comunasAlcance: ['Providencia', 'La Reina'],
  coords: { lat: -33.45, lng: -70.6 },
  confirmado: true,
  origenMyPet: 'ficha-123',
};

describe('siguienteDelLote — lo del animal anterior NO se arrastra', () => {
  const sig = siguienteDelLote(BASE);

  it('LAS FOTOS SE VAN. Es lo único que no puede fallar', () => {
    // Un reporte del animal #2 con la foto del #1 es un reporte falso.
    expect(sig.fotoUris).toEqual([]);
  });

  it('el nombre, la raza y la descripción se vacían', () => {
    expect(sig.nombre).toBe('');
    expect(sig.raza).toBe('');
    expect(sig.descripcion).toBe('');
  });

  it('las señas secretas se vacían', () => {
    // La seña es la defensa antiestafa de UN animal concreto. Heredada, valida
    // a un impostor que describe la cicatriz del perro anterior.
    expect(sig.sena1).toBe('');
    expect(sig.sena2).toBe('');
  });

  it('la recompensa no se hereda', () => {
    expect(sig.ofreceRecompensa).toBe(false);
  });

  it('el ámbito (interior/exterior) no se hereda: es de ese animal', () => {
    expect(sig.ambito).toBeNull();
  });

  it('el vínculo con la ficha "Mi mascota" se corta', () => {
    // Sin esto, el animal #2 queda enganchado a la ficha del #1 y el QR del
    // collar del #1 empieza a decir que está perdido otro perro. Silencioso:
    // nada en la pantalla lo muestra.
    expect(sig.origenMyPet).toBeNull();
  });

  it('la casilla de confirmación se destilda', () => {
    // El texto dice "confirmo que la foto es de la mascota". La foto cambió:
    // la afirmación hay que volver a hacerla. Es un clic por animal, y es el
    // único control de contenido que tiene la app.
    expect(sig.confirmado).toBe(false);
  });
});

describe('siguienteDelLote — lo común SÍ se conserva (para eso existe)', () => {
  const sig = siguienteDelLote(BASE);

  it('conserva estado, especie y comuna', () => {
    expect(sig.estado).toBe('encontrada');
    expect(sig.especie).toBe('perro');
    expect(sig.comuna).toBe('Ñuñoa');
  });

  it('conserva el punto del mapa y las comunas de alcance', () => {
    expect(sig.coords).toEqual({ lat: -33.45, lng: -70.6 });
    expect(sig.comunasAlcance).toEqual(['Providencia', 'La Reina']);
  });

  it('conserva que la comuna se eligió A MANO', () => {
    // Si esto se reseteara, el efecto que auto-sugiere la comuna desde el pin
    // volvería a pisarla en el animal #2: el refugio elige "Santiago" (donde
    // está el animal) con el pin en su sede de Maipú, y a partir del segundo
    // animal todo sale publicado en Maipú sin que nadie toque nada.
    expect(sig.comunaManual).toBe(true);
  });

  it('no muta el formulario anterior', () => {
    const previo = { ...BASE, fotoUris: [...BASE.fotoUris] };
    siguienteDelLote(previo);
    expect(previo.fotoUris).toEqual(['file://negro-1.jpg', 'file://negro-2.jpg']);
    expect(previo.nombre).toBe('Negro');
    expect(previo.confirmado).toBe(true);
  });

  it('las listas que conserva son copias, no la misma referencia', () => {
    const sigue = siguienteDelLote(BASE);
    sigue.comunasAlcance.push('Macul');
    expect(BASE.comunasAlcance).toEqual(['Providencia', 'La Reina']);
  });

  it('conserva "perdida" igual que "encontrada"', () => {
    expect(siguienteDelLote({ ...BASE, estado: 'perdida' }).estado).toBe('perdida');
  });
});

describe('ofertaTrasPublicar — a quién se le ofrece qué', () => {
  it('a una institución se le ofrece cargar otro, no una guía', () => {
    // La guía de "qué hacer ahora" está escrita para el dueño angustiado de una
    // mascota perdida. A un refugio que va por el animal 7 de 15 no le sirve, y
    // encadenar dos confirms seguidos es la forma más rápida de que cierre la app.
    expect(ofertaTrasPublicar({ esInstitucion: true, estado: 'perdida' })).toEqual({ tipo: 'lote' });
    expect(ofertaTrasPublicar({ esInstitucion: true, estado: 'encontrada' })).toEqual({ tipo: 'lote' });
  });

  it('a una persona se le sigue ofreciendo la guía que le toca', () => {
    expect(ofertaTrasPublicar({ esInstitucion: false, estado: 'perdida' })).toEqual({
      tipo: 'guia',
      destino: 'GuiaPerdida',
    });
    expect(ofertaTrasPublicar({ esInstitucion: false, estado: 'encontrada' })).toEqual({
      tipo: 'guia',
      destino: 'GuiaEncontrada',
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LOS NOMBRES DE PANTALLA QUE SE MUDARON ACÁ.
//
// `ofertaTrasPublicar` devuelve 'GuiaPerdida' / 'GuiaEncontrada', que antes
// eran literales dentro de PublishScreen. El guardián de navegación
// (`__tests__/navigation/navegacionDesdeElRaiz.test.ts`) solo mira
// `navigation.navigate('X')` con la cadena escrita ahí mismo: ni antes ni ahora
// cubre un destino que viaja en una variable. Pero ahora esos dos nombres viven
// en un archivo de `lib/`, donde nadie va a mirar cuando renombre una pantalla.
// Esto es el seguro: se leen los navigators DE VERDAD.
// ───────────────────────────────────────────────────────────────────────────
describe('las guías que nombra este archivo existen en el navigator', () => {
  const { readFileSync } = require('fs');
  const { join } = require('path');
  const rootSrc: string = readFileSync(
    join(__dirname, '..', '..', 'src', 'navigation', 'RootNavigator.tsx'),
    'utf8',
  );
  const registradas = new Set<string>(
    [...rootSrc.matchAll(/<\w+\.Screen\b[\s\S]*?name="([^"]+)"/g)].map((m) => m[1]),
  );

  it('el parser lee pantallas de verdad (si no, todo pasa por vacío)', () => {
    expect(registradas.size).toBeGreaterThan(5);
  });

  it('GuiaPerdida y GuiaEncontrada están registradas en el stack raíz', () => {
    for (const estado of ['perdida', 'encontrada'] as const) {
      const oferta = ofertaTrasPublicar({ esInstitucion: false, estado });
      expect(oferta.tipo).toBe('guia');
      expect(registradas.has((oferta as any).destino)).toBe(true);
    }
  });
});
