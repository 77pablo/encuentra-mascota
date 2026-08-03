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
import { AppText } from '../../src/ui';
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
  // Si se borrara la leyenda del QR, indexOf devolvería -1 y "-1 < indexOf(numero)"
  // pasaría igual sin haber comparado nada: por eso primero se exige que las DOS
  // cosas estén presentes (F15).
  expect(t.indexOf(TEXTO_QR)).toBeGreaterThanOrEqual(0);
  expect(t.indexOf('+56 9 1234 5678')).toBeGreaterThanOrEqual(0);
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

// F1: el presupuesto de altura de AfichePoster.tsx solo cierra con el nombre
// topeado a 1 línea, las señas a 2 y el QR achicado a 180 — si alguno de los
// tres se destopa, el poster vuelve a desbordar la página fija (ver el
// comentario "PRESUPUESTO DE ALTURA" en el propio componente).
describe('F1: el presupuesto de altura no desborda la página fija', () => {
  it('el nombre está topado a 1 línea y las señas a 2', () => {
    const arbol = render(contenido());
    const textos = arbol.root.findAllByType(AppText);
    const nombre = textos.filter((n: any) => n.props.style?.fontSize === 46);
    expect(nombre.length).toBeGreaterThan(0);
    expect(nombre.every((n: any) => n.props.numberOfLines === 1)).toBe(true);
    const senas = textos.filter((n: any) => n.props.style?.fontSize === 26);
    expect(senas.length).toBeGreaterThan(0);
    expect(senas.every((n: any) => n.props.numberOfLines === 2)).toBe(true);
  });

  it('el QR se pide al tamaño reducido que entra en el presupuesto (180, no 210)', () => {
    render(contenido());
    const QrCode = require('../../src/components/QrCode').default;
    expect(QrCode.mock.calls[QrCode.mock.calls.length - 1][0].size).toBe(180);
  });

  // Fix de cierre: un teléfono tipeado a mano no debe poder envolver a 2 líneas
  // y empujarse a sí mismo (y a la marca) fuera del póster. El número cuenta
  // como 1 línea SIEMPRE en el presupuesto (ver el comentario del componente).
  it('el número de WhatsApp está topado a 1 línea', () => {
    const arbol = render(contenido());
    const textos = arbol.root.findAllByType(AppText);
    const numero = textos.filter((n: any) => n.props.style?.fontSize === 44);
    expect(numero.length).toBeGreaterThan(0);
    expect(numero.every((n: any) => n.props.numberOfLines === 1)).toBe(true);
  });

  // Fix de cierre: el titular de "encontrada" ("¿CONOCÉS A ESTA MASCOTA?") envuelve
  // a 2 líneas a 72px — el presupuesto tiene que asumir ese peor caso, no 1 línea.
  // No hay `numberOfLines` en el titular (a propósito: no hay dónde recortarlo sin
  // perder sentido), así que el renderizado con este titular largo, nombre, Y
  // recompensa (el combo más pesado) tiene que seguir montando sin explotar.
  it('el titular largo de "encontrada" (2 líneas) + nombre + recompensa renderiza sin desbordar el árbol', () => {
    const arbol = render(
      contenido({ titular: '¿CONOCÉS A ESTA MASCOTA?', hayRecompensa: true }),
    );
    const t = textos(arbol);
    expect(t).toContain('¿CONOCÉS A ESTA MASCOTA?');
  });
});
