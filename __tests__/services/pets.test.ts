import { createPet } from '../../src/services/pets';

const mockInsertMock = jest.fn();
const mockSelectMock = jest.fn();
const mockSingleMock = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: mockInsertMock,
      select: mockSelectMock,
    })),
  },
}));

describe('createPet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const insertResult = { data: { id: 'pet-1', estado: 'perdida' }, error: null };
    mockInsertMock.mockReturnValue({ select: mockSelectMock });
    mockSelectMock.mockReturnValue({ single: mockSingleMock });
    mockSingleMock.mockResolvedValue(insertResult);
  });

  it('inserta el reporte con user_id y fotos y devuelve la fila', async () => {
    const input = {
      estado: 'perdida' as const, especie: 'perro' as const,
      descripcion: 'café', lat: -33.4, lng: -70.6,
    };
    const pet = await createPet(input, ['https://foto/1.jpg'], 'user-1');
    expect(mockInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', fotos: ['https://foto/1.jpg'], estado: 'perdida' }),
    );
    expect(pet).toEqual({ id: 'pet-1', estado: 'perdida' });
  });
});
