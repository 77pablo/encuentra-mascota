import React from 'react';
import { act, create } from 'react-test-renderer';
import TarjetaCompartir from './TarjetaCompartir';
import { Pet } from '../services/pets';
import { datosDeReporte } from '../lib/tarjeta';
import { ThemeProvider } from '../theme/ThemeProvider';

// TarjetaCompartir usa `lightColors` fijo (regla de assets compartibles), pero
// `AppText` (de `../ui/AppText`) siempre llama `useColors()` internamente, así
// que igual necesita un `<ThemeProvider>` ancestro para renderizar en el test
// (en la app real siempre lo tiene, es la raíz de App.tsx).

const pet: Pet = {
  id: 'abc123',
  user_id: 'u1',
  estado: 'perdida',
  especie: 'perro',
  raza: 'Quiltro',
  nombre: 'Luna',
  descripcion: 'Se perdió cerca de la plaza',
  fotos: ['https://ejemplo.com/foto.jpg'],
  lat: -33.5,
  lng: -70.7,
  recompensa: null,
  activo: true,
  oculto: false,
  creado_en: '2026-01-01T00:00:00Z',
  comuna: 'Maipú',
  comunas_alcance: [],
};

// Sin @testing-library/react-native (no está en el node_modules compartido de
// este worktree) no hay `waitFor`. Este poll manual le da a React chances
// explícitas, de a poco, de flushear el efecto async (la promesa de
// `fotoParaCaptura` + el `setTimeout` de aviso) en vez de un único sleep
// largo, que resultó frágil con `act()`.
async function esperarHasta(condicion: () => boolean, timeoutMs = 3000): Promise<void> {
  const inicio = Date.now();
  while (!condicion()) {
    if (Date.now() - inicio > timeoutMs) {
      throw new Error(`esperarHasta: no se cumplió la condición en ${timeoutMs}ms`);
    }
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }
}

function textosDe(nodo: any): string[] {
  const encontrados: string[] = [];
  const recorrer = (n: any) => {
    if (n == null) return;
    if (typeof n === 'string') {
      encontrados.push(n);
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(recorrer);
      return;
    }
    if (n.children) recorrer(n.children);
  };
  recorrer(nodo);
  return encontrados;
}

test('renderiza banda, título y subtítulo del reporte perdido', async () => {
  let tree: any;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <TarjetaCompartir datos={datosDeReporte(pet)} />
      </ThemeProvider>,
    );
  });
  const textos = textosDe(tree.toJSON());
  expect(textos).toContain('PERDIDA EN MAIPÚ');
  expect(textos).toContain('Luna');
  expect(textos).toContain('Perro · Quiltro');
  expect(textos).toContain('Encuentra tu Mascota 🐾');
  // Con foto, el componente deja un timeout de "red de seguridad" de 2.5s
  // corriendo (por si `onLoad`/`onError` de la imagen nunca disparan, algo
  // que en este test renderer no ocurre). Desmontar lo cancela (el efecto
  // limpia con `clearTimeout`) para no dejarlo colgado entre tests.
  act(() => {
    tree.unmount();
  });
});

test('avisa onListo cuando la tarjeta queda lista', async () => {
  // Timers REALES a propósito: los timers falsos de Jest chocan con el
  // scheduler de React (act() puede quedarse colgado hasta su timeout de
  // 5s de forma intermitente). Sin foto, TarjetaCompartir avisa a los 400ms;
  // esperamos un poco más con un timer real.
  const onListo = jest.fn();
  let tree: any;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <TarjetaCompartir datos={datosDeReporte({ ...pet, fotos: [] })} onListo={onListo} />
      </ThemeProvider>,
    );
  });
  await esperarHasta(() => onListo.mock.calls.length > 0);
  expect(onListo).toHaveBeenCalledTimes(1);
  act(() => {
    tree.unmount();
  });
}, 10000);
