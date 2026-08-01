import { getPerfilPublico } from '../../src/services/perfilPublico';

const mockRpc = jest.fn();
jest.mock('../../src/lib/supabase', () => ({
  supabase: { rpc: (...a: any[]) => mockRpc(...a) },
}));

// PERFIL PÚBLICO — el contador de adopciones (migración 0052).
//
// El bug que se arregla: `perfil_publico` (0019) suma `pets`, `sightings` y
// `pet_tips`, y `adoptions` no aparece por ningún lado. Un refugio con 40
// animales publicados en adopción se veía con TODO en cero.
//
// La degradación importa tanto como el contador: mientras la 0052 no esté
// aplicada, la RPC vieja no devuelve la columna `adopciones` y la clave ni
// llega. Ahí `adopciones` queda en `null` — que NO es lo mismo que 0. Decirle
// "0 publicaciones en adopción" a ese mismo refugio es exactamente el bug que
// estamos arreglando, escrito de otra forma.

const FILA = {
  id: 'u1',
  nombre: 'Refugio Ñuñoa',
  foto_perfil: null,
  red_social: null,
  creado_en: '2026-01-01T00:00:00Z',
  reencuentros: 2,
  reportes: 3,
  aportes: 4,
};

beforeEach(() => mockRpc.mockReset());

describe('getPerfilPublico — adopciones', () => {
  it('trae la cuenta de adopciones cuando la 0052 está aplicada', async () => {
    mockRpc.mockResolvedValue({ data: [{ ...FILA, adopciones: 40 }], error: null });
    expect((await getPerfilPublico('u1'))!.adopciones).toBe(40);
  });

  it('normaliza el bigint que PostgREST puede mandar como texto', async () => {
    // Los count() de Postgres son bigint y llegan como string. Sin el Number(),
    // la pantalla haría "40" > 0 con un string y la baldosa mostraría comillas.
    mockRpc.mockResolvedValue({ data: [{ ...FILA, adopciones: '40' }], error: null });
    expect((await getPerfilPublico('u1'))!.adopciones).toBe(40);
  });

  it('un refugio con cero publicaciones da 0, no null', async () => {
    mockRpc.mockResolvedValue({ data: [{ ...FILA, adopciones: 0 }], error: null });
    expect((await getPerfilPublico('u1'))!.adopciones).toBe(0);
  });

  it('sin la 0052 la clave no viene: queda null, NO cero', async () => {
    mockRpc.mockResolvedValue({ data: [FILA], error: null });
    const p = await getPerfilPublico('u1');
    expect(p!.adopciones).toBeNull();
    // y el resto del perfil sigue leyéndose igual que siempre
    expect(p!.reportes).toBe(3);
    expect(p!.nombre).toBe('Refugio Ñuñoa');
  });
});
