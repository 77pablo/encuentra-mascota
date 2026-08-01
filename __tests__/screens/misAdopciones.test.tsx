import React from 'react';
import { act, create } from 'react-test-renderer';

// MIS PUBLICACIONES DE ADOPCIÓN.
//
// `listMyAdoptions` existía en `services/adoptions.ts` con CERO llamadores: se
// podía publicar un animal en adopción y después no había ninguna pantalla
// donde ver lo tuyo, ni saber si seguía visible, ni llegar a editarlo. Para
// reportes sí existe ("Mis reportes" en el Perfil); adopción nació coja.
//
// Se prueba lo mismo que en las otras pantallas de listado del repo, porque es
// donde nos equivocamos tres veces: **"no pudimos leerlo" y "no tenés ninguna"
// son estados DISTINTOS**, y el de error tiene que ofrecer reintentar.

jest.setTimeout(30000);

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const mockListMyAdoptions = jest.fn();
const mockRenovarAdopcion = jest.fn();
jest.mock('../../src/services/adoptions', () => ({
  listMyAdoptions: (...a: any[]) => mockListMyAdoptions(...a),
  renovarAdopcion: (...a: any[]) => mockRenovarAdopcion(...a),
}));

let mockUser: any = { id: 'yo' };
jest.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: any) => {
    const React = require('react');
    React.useEffect(() => cb(), []);
  },
  useNavigation: () => ({ navigate: (...a: any[]) => mockNavigate(...a) }),
}));

jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: () => Promise.resolve(true),
}));

import MisAdopcionesScreen from '../../src/screens/MisAdopcionesScreen';
import { Button } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

const UNA = {
  id: 'a-1',
  user_id: 'yo',
  especie: 'perro',
  nombre: 'Rocco',
  descripcion: 'Muy bueno',
  fotos: ['https://x/1.jpg'],
  lat: 0,
  lng: 0,
  activo: true,
  oculto: false,
  creado_en: '2026-07-01T00:00:00Z',
};

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <MisAdopcionesScreen />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  return arbol!;
}

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

beforeEach(() => {
  mockListMyAdoptions.mockReset();
  mockRenovarAdopcion.mockReset();
  mockRenovarAdopcion.mockResolvedValue(undefined);
  mockNavigate.mockReset();
  mockUser = { id: 'yo' };
});

describe('Mis publicaciones de adopción', () => {
  it('lista lo que publicaste', async () => {
    mockListMyAdoptions.mockResolvedValue([UNA]);
    const t = textos(await montar());
    expect(mockListMyAdoptions).toHaveBeenCalledWith('yo');
    expect(t).toContain('Rocco');
  });

  it('marca cuál ya encontró familia', async () => {
    mockListMyAdoptions.mockResolvedValue([
      { ...UNA, id: 'a-2', nombre: 'Luna', adoptada_en: '2026-07-20T00:00:00Z' },
    ]);
    const t = textos(await montar());
    expect(t.toLowerCase()).toContain('familia');
  });

  it('avisa cuál está oculta, que si no parece que se borró', async () => {
    mockListMyAdoptions.mockResolvedValue([{ ...UNA, oculto: true }]);
    expect(textos(await montar()).toLowerCase()).toContain('oculta');
  });

  it('sin publicaciones, invita a publicar', async () => {
    mockListMyAdoptions.mockResolvedValue([]);
    const arbol = await montar();
    const t = textos(arbol).toLowerCase();
    expect(t).toContain('todavía no publicaste');
    expect(t).not.toContain('no pudimos');
    const boton = arbol.root
      .findAllByType(Button)
      .find((b: any) => /publicar/i.test(String(b.props.title ?? '')));
    expect(boton).toBeTruthy();
  });

  it('si falla la lectura NO dice que no publicaste nada, y deja reintentar', async () => {
    mockListMyAdoptions.mockRejectedValue(new Error('se cayó la red'));
    const arbol = await montar();
    const t = textos(arbol).toLowerCase();

    expect(t).toContain('no pudimos');
    expect(t).not.toContain('todavía no publicaste');

    const reintentar = arbol.root
      .findAllByType(Button)
      .find((b: any) => /reintentar/i.test(String(b.props.title ?? '')));
    expect(reintentar).toBeTruthy();

    // y el reintento vuelve a pedir de verdad
    mockListMyAdoptions.mockResolvedValue([UNA]);
    await act(async () => reintentar.props.onPress());
    expect(mockListMyAdoptions).toHaveBeenCalledTimes(2);
  });

  it('el botón de publicar navega ANIDADO a la pestaña Adopción', async () => {
    // `PublicarAdopcion` vive en el stack de la pestaña Adopción y esta pantalla
    // en el del Perfil: con nombre pelado el botón estaría muerto. Es el bug
    // que ya apareció seis veces en el repo.
    mockListMyAdoptions.mockResolvedValue([]);
    const arbol = await montar();
    const boton = arbol.root
      .findAllByType(Button)
      .find((b: any) => /publicar/i.test(String(b.props.title ?? '')));

    await act(async () => boton.props.onPress());

    expect(mockNavigate).toHaveBeenCalledWith('Adopcion', { screen: 'PublicarAdopcion' });
  });

  it('tocar una publicación abre su detalle', async () => {
    mockListMyAdoptions.mockResolvedValue([UNA]);
    const arbol = await montar();
    const fila = arbol.root.find(
      (n: any) => n.props?.accessibilityLabel === 'Ver Rocco' && n.props?.onPress,
    );

    await act(async () => fila.props.onPress());

    expect(mockNavigate).toHaveBeenCalledWith('AdopcionDetail', { id: 'a-1' });
  });

  it('sin sesión no explota ni pide nada', async () => {
    mockUser = null;
    await montar();
    expect(mockListMyAdoptions).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// CICLO DE VIDA (migración 0052).
//
// El auto-archivado perezoso saca del feed lo que nadie renovó en 90 días. Es
// media función: la otra mitad es que el dueño SE ENTERE y pueda traerlo de
// vuelta. Sin esto, la publicación de un refugio desaparecería del feed y en
// "Mis publicaciones" se vería idéntica a las demás — un fantasma que él cree
// publicado y que nadie ve.
// ───────────────────────────────────────────────────────────────────────────
const haceDias = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

describe('publicaciones que se durmieron', () => {
  const dormida = { ...UNA, id: 'a-vieja', nombre: 'Canela', renovado_en: haceDias(120) };

  it('se marca EN PAUSA y se dice que salió del feed', async () => {
    mockListMyAdoptions.mockResolvedValue([dormida]);
    const t = textos(await montar()).toLowerCase();
    expect(t).toContain('pausa');
    // Que no la vean es LO que hay que explicar; "en pausa" solo no dice nada.
    expect(t).toMatch(/no la est[áa]n viendo|sali[óo] del list|dej[óo] de aparecer/);
  });

  it('una publicación reciente no se marca ni ofrece reactivar', async () => {
    mockListMyAdoptions.mockResolvedValue([{ ...UNA, renovado_en: haceDias(2) }]);
    const arbol = await montar();
    expect(textos(arbol).toLowerCase()).not.toContain('pausa');
    expect(
      arbol.root.findAllByType(Button).find((b: any) => /reactivar/i.test(String(b.props.title))),
    ).toBeUndefined();
  });

  it('la que YA encontró familia no se marca en pausa', async () => {
    // Está cerrada con su final feliz, no dormida: pedirle al refugio que
    // "reactive" a un animal que ya tiene casa es un sinsentido.
    mockListMyAdoptions.mockResolvedValue([
      { ...dormida, adoptada_en: haceDias(100) },
    ]);
    expect(textos(await montar()).toLowerCase()).not.toContain('pausa');
  });

  it('sin la 0052 aplicada NO se marca nada, por vieja que sea', async () => {
    // La columna `renovado_en` ni llega, y la RPC vieja tampoco filtra por
    // vigencia: la publicación SIGUE en el feed. Decir "en pausa" sería
    // mentirle al dueño y mandarlo a tocar un botón que no puede funcionar.
    mockListMyAdoptions.mockResolvedValue([{ ...UNA, creado_en: haceDias(900) }]);
    expect(textos(await montar()).toLowerCase()).not.toContain('pausa');
  });

  it('reactivar la manda de vuelta y vuelve a leer la lista', async () => {
    mockListMyAdoptions.mockResolvedValue([dormida]);
    const arbol = await montar();
    const boton = arbol.root
      .findAllByType(Button)
      .find((b: any) => /reactivar/i.test(String(b.props.title)));
    expect(boton).toBeTruthy();

    mockListMyAdoptions.mockResolvedValue([{ ...dormida, renovado_en: haceDias(0) }]);
    await act(async () => boton.props.onPress());

    expect(mockRenovarAdopcion).toHaveBeenCalledWith('a-vieja');
    // Releer no es opcional: si no, la etiqueta EN PAUSA se queda pegada y la
    // persona vuelve a tocar el botón creyendo que no funcionó.
    expect(mockListMyAdoptions.mock.calls.length).toBeGreaterThan(1);
    expect(textos(arbol).toLowerCase()).not.toContain('pausa');
  });

  it('si reactivar falla, se dice, y la etiqueta NO se borra', async () => {
    mockListMyAdoptions.mockResolvedValue([dormida]);
    const arbol = await montar();
    const boton = arbol.root
      .findAllByType(Button)
      .find((b: any) => /reactivar/i.test(String(b.props.title)));

    mockRenovarAdopcion.mockRejectedValue(new Error('no se pudo'));
    await act(async () => boton.props.onPress());

    const { notify } = require('../../src/lib/notify');
    expect(notify).toHaveBeenCalled();
    // Sigue en pausa: fingir que volvió es peor que el error.
    expect(textos(arbol).toLowerCase()).toContain('pausa');
  });
});
