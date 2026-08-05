import React from 'react';
import { act, create } from 'react-test-renderer';
import { useDenunciasPendientes } from '../../src/hooks/useDenunciasPendientes';
import { bandeja as moderacionBandeja } from '../../src/services/moderacionAdmin';

// Deuda tanda 13 (D2 · Step 3): el hermano `useAvisosSinLeer` resetea su
// contador a 0 en el catch; éste no lo hacía y dejaba pegado el valor viejo —
// un badge de "denuncias pendientes" que sigue mostrando denuncias que quizá
// ya no existen.

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const ReactActual = require('react');
    ReactActual.useEffect(() => cb(), [cb]);
  },
}));

jest.mock('../../src/services/moderacionAdmin', () => ({
  bandeja: jest.fn(),
}));

// Sin @testing-library/react-hooks en este repo (ver TarjetaCompartir.test.tsx
// para el mismo problema con `waitFor`): un harness mínimo que monta un
// componente descartable, llama al hook y deja el resultado en un objeto
// legible desde el test.
function renderHook<T>(hook: () => T): { result: { current: T } } {
  const result = {} as { current: T };
  function Harness() {
    result.current = hook();
    return null;
  }
  act(() => {
    create(<Harness />);
  });
  return { result };
}

async function esperarHasta(condicion: () => boolean, timeoutMs = 3000): Promise<void> {
  const inicio = Date.now();
  while (!condicion()) {
    if (Date.now() - inicio > timeoutMs) {
      throw new Error(`esperarHasta: no se cumplió la condición en ${timeoutMs}ms`);
    }
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useDenunciasPendientes', () => {
  it('un error deja el contador en 0 y no el valor viejo', async () => {
    (moderacionBandeja as jest.Mock)
      .mockResolvedValueOnce([{ id: 'd1' }, { id: 'd2' }])
      .mockRejectedValueOnce(new Error('sin red'));
    const { result } = renderHook(() => useDenunciasPendientes(true));
    await esperarHasta(() => result.current.cantidad === 2);
    await act(async () => {
      await result.current.recargar();
    });
    expect(result.current.cantidad).toBe(0);
  });
});
