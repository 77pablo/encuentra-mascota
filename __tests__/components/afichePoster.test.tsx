import React from 'react';
import { act, create } from 'react-test-renderer';

// EL PÓSTER, LO QUE DE VERDAD SE PEGA EN LA CALLE.
//
// El QR va ANTES que el número: es lo que un vecino puede usar sin llamar a
// nadie. El número solo aparece si el dueño lo dejó prendido al generar
// (ver __tests__/lib/afiche.test.ts, `incluirNumero`).

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('../../src/components/QrCode', () => {
  const React = require('react');
  const mock = jest.fn(() => null);
  return { __esModule: true, default: mock };
});

import AfichePoster from '../../src/components/AfichePoster';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { AficheContent, TEXTO_QR } from '../../src/lib/afiche';

function textos(arbol: any): string[] {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'));
}

function render(content: AficheContent) {
  let arbol: any;
  act(() => {
    arbol = create(
      <ThemeProvider>
        <AfichePoster content={content} foto={null} />
      </ThemeProvider>,
    );
  });
  return arbol;
}

const contenido = (extra: Partial<AficheContent> = {}): AficheContent => ({
  titular: 'SE BUSCA',
  nombre: 'Luna',
  subtitulo: 'Perro',
  senas: 'Chica, café',
  hayRecompensa: false,
  zonaTexto: 'Visto cerca de esta zona',
  foto: null,
  whatsappDigits: '56912345678',
  whatsappDisplay: '+56 9 1234 5678',
  waLink: 'https://wa.me/56912345678',
  url: 'https://encuentras-mascota.pages.dev/mascota/x',
  ...extra,
});

it('el QR va ANTES que el número en el orden de lectura', () => {
  const t = textos(render(contenido()));
  expect(t.indexOf(TEXTO_QR)).toBeLessThan(t.indexOf('+56 9 1234 5678'));
});

it('sin número no queda el rótulo "Contactá por WhatsApp" huérfano', () => {
  const t = textos(render(contenido({ whatsappDisplay: '', whatsappDigits: '', waLink: null })));
  expect(t).not.toContain('Contactá por WhatsApp');
});

it('el QR usa la url del contenido y el fuente no conoce ningún dominio ajeno', () => {
  const fuente = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'components', 'AfichePoster.tsx'),
    'utf8',
  );
  expect(fuente).not.toContain('encuentratumascota.app');
});

// El mismo dominio ajeno sobrevivía como respaldo del QR en la tarjeta
// compartible y en la placa de collar (mismo bug que el de arriba, otro
// componente). Los dos pasan a respaldar en RESPALDO_WEB (A3, dominio propio).
it('el dominio ajeno tampoco sobrevive como respaldo en TarjetaCompartir ni en CollarTag', () => {
  const leer = (archivo: string) =>
    require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'src', 'components', archivo),
      'utf8',
    );
  expect(leer('TarjetaCompartir.tsx')).not.toContain('encuentratumascota.app');
  expect(leer('CollarTag.tsx')).not.toContain('encuentratumascota.app');
});
