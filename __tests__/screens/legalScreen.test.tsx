import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, View } from 'react-native';
import LegalScreen from '../../src/screens/LegalScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { darkColors, lightColors } from '../../src/theme';

// Montar una pantalla real con el stack de react-native tarda segundos sueltos
// y mucho más bajo carga: con el default de 5 s de jest esta suite pasa en
// aislamiento y flakea dentro de la suite completa (3ª aparición del mismo
// timeout). Mismo arreglo que los otros tests de pantalla del repo.
jest.setTimeout(30000);

// La pantalla legal se RENDERIZA de verdad acá.
//
// Que compile y que el módulo generado tenga el texto correcto no prueba que la
// pantalla se vea: los bloques vienen de un archivo generado con tablas,
// citas anidadas y listas numeradas que empiezan en 7, y cualquiera de esas
// formas puede reventar en el render sin que TypeScript diga nada.
//
// Esta pantalla además se abre desde el registro (stack raíz, sin sesión) y
// desde el perfil, así que no puede depender de ningún hook de sesión: se monta
// con solo <ThemeProvider> alrededor, que es lo mínimo que hay en los dos
// caminos.

// `@expo/vector-icons` arrastra `expo-font` → `expo-asset`, que no está en el
// node_modules compartido de este repo (y no se puede instalar nada). La
// pantalla no usa íconos; el barrel de `src/ui` sí los importa.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

const mockGetTemaPref = jest.fn(() => Promise.resolve('auto'));
jest.mock('../../src/lib/temaPref', () => ({
  getTemaPref: () => mockGetTemaPref(),
  setTemaPref: jest.fn(() => Promise.resolve()),
}));

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <LegalScreen />
      </ThemeProvider>,
    );
  });
  return arbol;
}

/** Todo el texto que el usuario ve, incluido el de los <Text> anidados. */
function textoVisible(arbol: any): string {
  return arbol.root
    .findAllByType(Text)
    .flatMap((t: any) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c: any) => typeof c === 'string')
    .join(' ');
}

function coloresDeFondo(arbol: any): unknown[] {
  return arbol.root
    .findAllByType(View)
    .map((v: any) => {
      const plano = [v.props.style].flat(Infinity).filter(Boolean);
      return plano.map((s: any) => s && s.backgroundColor).find(Boolean);
    })
    .filter(Boolean);
}

beforeEach(() => {
  mockGetTemaPref.mockReset();
  mockGetTemaPref.mockResolvedValue('auto');
});

describe('LegalScreen se renderiza', () => {
  it('monta sin sesión y sin navegación, como cuando se abre desde el registro', async () => {
    const arbol = await montar();
    expect(arbol.toJSON()).toBeTruthy();
  });

  it('muestra los títulos de los dos documentos', async () => {
    const texto = textoVisible(await montar());
    expect(texto).toContain('Política de privacidad');
    expect(texto).toContain('Términos de uso');
  });

  it('muestra los compromisos concretos, no solo los títulos', async () => {
    const texto = textoVisible(await montar());
    // Uno de cada forma de bloque: cita, tabla, lista numerada y párrafo.
    expect(texto).toMatch(/250\s*metros/); // cita
    expect(texto).toMatch(/Base de licitud/); // encabezado de tabla
    expect(texto).toMatch(/72\s*horas/); // lista numerada
    expect(texto).toMatch(/No los leemos/); // celda de tabla
    expect(texto).toMatch(/tribunales ordinarios de justicia de Chile/); // párrafo
  });

  it('conserva la numeración de las conductas prohibidas (no reinicia en cada subsección)', async () => {
    const texto = textoVisible(await montar());
    expect(texto).toContain('25.');
  });

  it('no le muestra al usuario nada del borrador', async () => {
    const texto = textoVisible(await montar());
    expect(texto).not.toMatch(/\[\[/);
    expect(texto).not.toMatch(/PENDIENTE/);
    expect(texto).not.toMatch(/Pendiente de revisión/);
    expect(texto).not.toMatch(/CORREO DE CONTACTO/);
  });

  it('no promete un correo de contacto, y dice a dónde ir mientras tanto', async () => {
    const texto = textoVisible(await montar());
    expect(texto).not.toMatch(/escríbenos/i);
    expect(texto).not.toContain('@');
    expect(texto).toContain('Perfil → Borrar mi cuenta');
  });
});

describe('LegalScreen sigue el tema', () => {
  it('en claro usa la paleta clara', async () => {
    mockGetTemaPref.mockResolvedValue('claro');
    const fondos = coloresDeFondo(await montar());
    expect(fondos).toContain(lightColors.sky); // el bloque de nota
    expect(fondos).not.toContain(darkColors.sky);
  });

  it('en oscuro usa la paleta oscura', async () => {
    mockGetTemaPref.mockResolvedValue('oscuro');
    const fondos = coloresDeFondo(await montar());
    expect(fondos).toContain(darkColors.sky);
    expect(fondos).not.toContain(lightColors.sky);
  });
});
