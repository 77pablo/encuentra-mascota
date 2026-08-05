jest.mock('../../src/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import { supabase } from '../../src/lib/supabase';
import { listarDestinos, marcarAvisado, agregarPersona, agregarLugar } from '../../src/services/difusion';

const mockFrom = supabase.from as jest.Mock;

describe('listarDestinos', () => {
  it('degrada a no-disponible si la migracion no esta aplicada (PGRST205)', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'not found' } }),
        }),
      }),
    });
    await expect(listarDestinos('p1')).resolves.toEqual({ tipo: 'no-disponible' });
  });

  it('un corte de red NO se disfraza de no-disponible: se propaga', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({ data: null, error: { code: '08006', message: 'network' } }),
        }),
      }),
    });
    await expect(listarDestinos('p1')).rejects.toBeDefined();
  });
});

describe('marcarAvisado - el silencio de la RLS', () => {
  it('lanza si el update no devuelve fila (200 + 0 filas, NO 42501)', async () => {
    // Ojo: la RLS de PostgREST rechaza en silencio. Este test NO mockea 42501
    // a proposito: esa es justo la respuesta que la RLS no da.
    mockFrom.mockReturnValue({
      update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }),
    });
    await expect(marcarAvisado('d1', true)).rejects.toBeDefined();
  });

  it('no lanza cuando volvio la fila', async () => {
    mockFrom.mockReturnValue({
      update: () => ({
        eq: () => ({ select: () => Promise.resolve({ data: [{ id: 'd1' }], error: null }) }),
      }),
    });
    await expect(marcarAvisado('d1', true)).resolves.toBeUndefined();
  });

  it('desmarcar manda avisado_en en null, para no romper el CHECK de coherencia', async () => {
    let enviado: any = null;
    mockFrom.mockReturnValue({
      update: (v: any) => {
        enviado = v;
        return { eq: () => ({ select: () => Promise.resolve({ data: [{ id: 'd1' }], error: null }) }) };
      },
    });
    await marcarAvisado('d1', false);
    expect(enviado).toEqual({ estado: 'pendiente', avisado_en: null });
  });
});

describe('agregarLugar - el indice unico convierte el duplicado en no-op', () => {
  // El indice unico `(pet_id, lugar_id)` de la 0063 hace que agregar el mismo
  // lugar dos veces al mismo tablero choque con 23505 (unique_violation).
  // `agregarLugar` lo traduce a `null` (no-op silencioso), no a un error que
  // asuste a quien solo tocó el botón dos veces.
  it('devuelve null cuando el insert choca con 23505 (lugar ya agregado)', async () => {
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () =>
          Promise.resolve({
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          }),
      }),
    });
    await expect(agregarLugar('p1', 'l1')).resolves.toBeNull();
  });

  it('otros errores SÍ se propagan (no todo se disfraza de duplicado)', async () => {
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => Promise.resolve({ data: null, error: { code: '23503', message: 'fk violation' } }),
      }),
    });
    await expect(agregarLugar('p1', 'l1')).rejects.toBeDefined();
  });

  it('devuelve el destino con el nombre del lugar, tomado del join', async () => {
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () =>
          Promise.resolve({
            data: [
              {
                id: 'd1',
                pet_id: 'p1',
                tipo: 'lugar',
                etiqueta: null,
                lugar_id: 'l1',
                lugar: { nombre: 'Veterinaria Los Robles' },
                institucion_id: null,
                estado: 'pendiente',
                avisado_en: null,
                creado_en: '2026-08-03T00:00:00.000Z',
              },
            ],
            error: null,
          }),
      }),
    });
    const destino = await agregarLugar('p1', 'l1');
    expect(destino?.lugarNombre).toBe('Veterinaria Los Robles');
  });
});

describe('agregarPersona - el espacio duro que btrim() no recorta', () => {
  // `validarEtiqueta` (src/lib/difusion.ts) usa `.trim()` de JS, que recorta
  // TODO espacio Unicode, incluido el espacio duro (NBSP, code point 160). El
  // CHECK de la migracion 0063 usa `btrim()` de Postgres, que con un solo
  // argumento recorta SOLO el espacio ASCII. Una etiqueta de 82 caracteres con
  // NBSP en los bordes pasa la validacion del cliente (JS la deja en 80) pero
  // la base la rechazaria si se insertara cruda. Por eso lo que se manda a
  // `insert` tiene que ser el valor YA recortado con `.trim()` de JS, nunca el
  // crudo: este test ata ese comportamiento para que nadie lo "simplifique" y
  // rompa la insercion de forma criptica.
  const NBSP = String.fromCharCode(160);

  it('inserta la etiqueta recortada con .trim(), no la cruda con NBSP en los bordes', async () => {
    let enviado: any = null;
    mockFrom.mockReturnValue({
      insert: (v: any) => {
        enviado = v;
        return {
          select: () =>
            Promise.resolve({
              data: [
                {
                  id: 'd1',
                  pet_id: 'p1',
                  tipo: 'persona',
                  etiqueta: 'La junta de vecinos',
                  lugar_id: null,
                  institucion_id: null,
                  estado: 'pendiente',
                  avisado_en: null,
                  creado_en: '2026-08-03T00:00:00.000Z',
                },
              ],
              error: null,
            }),
        };
      },
    });

    const crudaConNbsp = NBSP + 'La junta de vecinos' + NBSP;
    await agregarPersona('p1', crudaConNbsp);

    expect(enviado).toEqual({
      pet_id: 'p1',
      tipo: 'persona',
      etiqueta: 'La junta de vecinos',
    });
  });
});
