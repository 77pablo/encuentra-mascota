import { resolverUrlFoto } from './fotoAdjuntaChat';

describe('resolverUrlFoto — subir o reusar la foto adjunta del chat', () => {
  it('sin foto adjunta: no hay nada que subir', async () => {
    const subir = jest.fn();

    const url = await resolverUrlFoto(null, null, subir);

    expect(url).toBeUndefined();
    expect(subir).not.toHaveBeenCalled();
  });

  it('con foto adjunta y sin subir todavía: sube la uri local', async () => {
    const subir = jest.fn(async (uri: string) => `https://cdn/${uri}.jpg`);

    const url = await resolverUrlFoto('file:///local.jpg', null, subir);

    expect(subir).toHaveBeenCalledWith('file:///local.jpg');
    expect(subir).toHaveBeenCalledTimes(1);
    expect(url).toBe('https://cdn/file:///local.jpg.jpg');
  });

  it('reintento: ya hay una URL subida, se reusa y NO se vuelve a subir', async () => {
    // Este es el caso del bug original: `sendMessage` falló después de que
    // la foto ya se había subido. El reintento no debe volver a llamar a
    // `subir` (evita el archivo huérfano en Storage) ni pasarle la URL
    // remota a `uploadPetPhoto`, que espera una uri local.
    const subir = jest.fn();

    const url = await resolverUrlFoto('file:///local.jpg', 'https://cdn/ya-subida.jpg', subir);

    expect(url).toBe('https://cdn/ya-subida.jpg');
    expect(subir).not.toHaveBeenCalled();
  });

  it('si la subida falla, el error se propaga (para que el llamador lo capture)', async () => {
    const subir = jest.fn(async () => {
      throw new Error('sin conexión');
    });

    await expect(resolverUrlFoto('file:///local.jpg', null, subir)).rejects.toThrow('sin conexión');
  });
});
