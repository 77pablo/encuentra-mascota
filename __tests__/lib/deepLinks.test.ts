import { esRutaDeLinkPublico, rutasDeLinkPublico } from '../../src/lib/deepLinks';
import { linkingScreens } from '../../src/navigation/linkingConfig';

// Las rutas se derivan del MISMO config que usa el NavigationContainer: si se
// agrega una pantalla publica nueva al linking, queda cubierta sola. Por eso
// aca se importa el config real y no una copia.
const RUTAS = rutasDeLinkPublico(linkingScreens);

describe('rutasDeLinkPublico', () => {
  it('deriva los prefijos de las cuatro rutas publicas actuales', () => {
    expect(RUTAS).toEqual(expect.arrayContaining(['mascota', 'collar', 'adopcion', 'cuadrilla']));
  });

  it('no deja prefijos vacios aunque un path empiece raro', () => {
    expect(rutasDeLinkPublico({ X: '/:id', Y: '' })).toEqual([]);
  });
});

describe('esRutaDeLinkPublico', () => {
  it.each([
    ['/mascota/abc123', true],
    ['/collar/tok', true],
    ['/adopcion/9f0', true],
    ['/cuadrilla/tok', true],
  ])('%s es link publico', (ruta, esperado) => {
    expect(esRutaDeLinkPublico(ruta, RUTAS)).toBe(esperado);
  });

  it.each([
    ['/', false],
    ['', false],
    ['/mascotas-x/abc', false], // prefijo parecido NO cuenta: segmento completo
    ['/App/Inicio', false],
    ['/privacidad', false],
  ])('%s NO es link publico', (ruta, esperado) => {
    expect(esRutaDeLinkPublico(ruta, RUTAS)).toBe(esperado);
  });

  it('ignora query y hash', () => {
    expect(esRutaDeLinkPublico('/mascota/abc?x=1#y', RUTAS)).toBe(true);
  });

  it('nunca lanza con basura', () => {
    expect(esRutaDeLinkPublico(undefined as any, RUTAS)).toBe(false);
    expect(esRutaDeLinkPublico(null as any, RUTAS)).toBe(false);
  });
});

// Guardas de FORMA sobre RootNavigator (mismo criterio que vectorFoto.test.ts:
// jest-expo no puede montar el navigator entero baratos, asi que se ata el
// cableado en el fuente).
describe('RootNavigator cablea el salteo', () => {
  const fuente = () =>
    require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'src', 'navigation', 'RootNavigator.tsx'),
      'utf8',
    );

  it('el gate del onboarding exige NO haber llegado por link', () => {
    expect(fuente()).toMatch(/!onboardingVisto && !recovering && !llegoPorLink/);
  });

  it('el linking del contenedor sale del mismo modulo que miran los tests', () => {
    expect(fuente()).toMatch(/from '\.\/linkingConfig'/);
  });

  it('llegar por link NO marca el onboarding como visto', () => {
    // setOnboardingVisto solo lo llama la pantalla de onboarding, no el navigator.
    expect(fuente()).not.toMatch(/setOnboardingVisto\(/);
  });
});
