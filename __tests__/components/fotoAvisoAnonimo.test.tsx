import React from 'react';
import { act, create } from 'react-test-renderer';
import { Image } from 'react-native';
import FotoAvisoAnonimo from '../../src/components/FotoAvisoAnonimo';

// LA FOTO DEL AVISO ANÓNIMO, SOLO PARA EL DUEÑO (D5, sobre el bucket privado
// `avisos-anonimos` de la 0062).
//
// Este componente vive de una URL FIRMADA de corta vida: `createSignedUrl`
// solo la da si la policy de SELECT del bucket deja pasar a quien la pide (el
// dueño del pet). Y encima puede apuntar a un objeto que nunca se subió (la
// Edge Function `aviso-anonimo-foto` sube DESPUÉS de registrar el aviso, y
// esa subida puede fallar — documentado ahí). Lo que este archivo protege es
// que las DOS formas de fallar degradan sin romper nada y sin quedar mudas.

const mockCreateSignedUrl = jest.fn();
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    storage: {
      from: (...args: any[]) => ({
        createSignedUrl: (...sargs: any[]) => mockCreateSignedUrl(...sargs),
      }),
    },
  },
}));

let warn: jest.SpyInstance;
beforeEach(() => {
  mockCreateSignedUrl.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

async function montar(path: string) {
  let tree: any;
  await act(async () => {
    tree = create(<FotoAvisoAnonimo path={path} />);
  });
  return tree;
}

describe('FotoAvisoAnonimo', () => {
  it('con una URL firmada válida, dibuja la imagen', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://firmada.example/foto.jpg' },
      error: null,
    });

    const tree = await montar('pet-1/abc.jpg');

    expect(mockCreateSignedUrl).toHaveBeenCalledWith('pet-1/abc.jpg', 3600);
    const img = tree.root.findByType(Image);
    expect(img.props.source).toEqual({ uri: 'https://firmada.example/foto.jpg' });
  });

  it('si createSignedUrl contesta con error (no es el dueño, o el path es raro), no dibuja nada y avisa', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    const tree = await montar('otro/abc.jpg');

    expect(tree.toJSON()).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('si createSignedUrl RECHAZA (network, etc.), tampoco crashea y queda escrito en consola', async () => {
    // Sin este manejo, un `.catch(() => {})` sería indistinguible de un bug —
    // exactamente el incidente de `send-push` que documenta
    // `__tests__/lib/sinCatchMudos.test.ts`.
    mockCreateSignedUrl.mockRejectedValue(new Error('Failed to fetch'));

    const tree = await montar('pet-1/abc.jpg');

    expect(tree.toJSON()).toBeNull();
    expect(warn.mock.calls.flat().join(' ')).toEqual(expect.stringContaining('Failed to fetch'));
  });

  it('si la URL firma bien pero la imagen no carga (la subida falló post-aviso), se oculta sin romper', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://firmada.example/nunca-se-subio.jpg' },
      error: null,
    });

    const tree = await montar('pet-1/nunca-se-subio.jpg');
    const img = tree.root.findByType(Image);

    await act(async () => {
      img.props.onError();
    });

    expect(tree.toJSON()).toBeNull();
  });

  it('un path distinto vuelve a pedir la URL firmada', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://firmada.example/uno.jpg' },
      error: null,
    });

    let tree: any;
    await act(async () => {
      tree = create(<FotoAvisoAnonimo path="pet-1/uno.jpg" />);
    });
    await act(async () => {
      tree.update(<FotoAvisoAnonimo path="pet-1/dos.jpg" />);
    });

    expect(mockCreateSignedUrl).toHaveBeenCalledWith('pet-1/uno.jpg', 3600);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('pet-1/dos.jpg', 3600);
  });
});
