// `sendMessage` con imagen opcional (Función 3 — Fotos en el chat, 0038).
// Se mockea `supabase.from(...).insert(...)` para capturar el payload que se
// manda a la base, sin tocar red.

const mockInsert = jest.fn(async () => ({ error: null }));
const mockFrom = jest.fn((_table: string) => ({ insert: mockInsert }));

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (arg: string) => mockFrom(arg) },
}));

import { sendMessage } from '../../services/messages';

describe('sendMessage — foto opcional (0038)', () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockFrom.mockClear();
  });

  it('acepta un mensaje solo-foto: inserta imagen_url y texto null', async () => {
    await sendMessage({ tipo: 'pet', id: 'p1' }, 'a', 'b', '', 'https://x/y.jpg');

    expect(mockFrom).toHaveBeenCalledWith('messages');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        pet_id: 'p1',
        adoption_id: null,
        from_user: 'a',
        to_user: 'b',
        texto: null,
        imagen_url: 'https://x/y.jpg',
      }),
    );
  });

  it('acepta foto + texto: manda los dos', async () => {
    await sendMessage({ tipo: 'pet', id: 'p1' }, 'a', 'b', '  Mirá esto  ', 'https://x/y.jpg');

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ texto: 'Mirá esto', imagen_url: 'https://x/y.jpg' }),
    );
  });

  it('sin texto ni imagen tira error y no llega a insertar', async () => {
    await expect(sendMessage({ tipo: 'pet', id: 'p1' }, 'a', 'b', '')).rejects.toThrow();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('solo texto (sin imagen) sigue funcionando: imagen_url null', async () => {
    await sendMessage({ tipo: 'pet', id: 'p1' }, 'a', 'b', 'hola');

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ texto: 'hola', imagen_url: null }),
    );
  });
});
