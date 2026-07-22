import React from 'react';
import { act, create } from 'react-test-renderer';
import TarjetaCompartir from './TarjetaCompartir';
import { Pet } from '../services/pets';
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
        <TarjetaCompartir pet={pet} />
      </ThemeProvider>,
    );
  });
  const textos = textosDe(tree.toJSON());
  expect(textos).toContain('PERDIDA EN MAIPÚ');
  expect(textos).toContain('Luna');
  expect(textos).toContain('Perro · Quiltro');
  expect(textos).toContain('Encuentra tu Mascota 🐾');
});

test('avisa onListo cuando la tarjeta queda lista', async () => {
  const onListo = jest.fn();
  await act(async () => {
    create(
      <ThemeProvider>
        <TarjetaCompartir pet={{ ...pet, fotos: [] }} onListo={onListo} />
      </ThemeProvider>,
    );
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  expect(onListo).toHaveBeenCalledTimes(1);
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});
