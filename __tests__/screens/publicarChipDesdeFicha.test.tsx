import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import PublishScreen from '../../src/screens/PublishScreen';
import { Button, Input } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// EL CHIP QUE LA APP YA TIENE Y NO LLEGABA AL REPORTE.
//
// La 0054 lo llama "el dato revelador": `my_pets` (la ficha "Mi mascota", 0027)
// YA guarda el número de chip, y las guías le dicen al dueño que lo tenga a
// mano. Pero al reportar desde una ficha ("Reportar como perdida", que pre-carga
// raza, nombre, descripción y foto) el chip no viajaba. O sea que los ÚNICOS
// usuarios de los que tenemos el chip con certeza publicaban sin él, y el motor
// nuevo arrancaba con su señal más fuerte —1000 puntos contra menos de 100 de
// todo lo demás junto— apagada justo donde el dato ya existía.
//
// Tres cosas se prueban acá, y las tres pueden fallar solas:
//   1. Que el chip de la ficha llegue a `pet_chips` sin que nadie lo escriba.
//   2. Que siga SIN viajar dentro del reporte (`pets`), que es lo que la 0054
//      prohíbe: publicado, el chip deja de servir para probar de quién es el
//      animal porque el estafador lo lee del aviso.
//   3. Que NADA de esto pueda impedir publicar. Una mascota perdida importa más
//      que un extra: ni la lectura caída, ni un texto raro guardado en la ficha.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('../../src/components/PlatformMap', () => ({
  __esModule: true,
  default: ({ children }: any) => children ?? null,
  Marker: () => null,
}));
jest.mock('../../src/components/ComunaPickerModal', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../src/components/TarjetaGenerador', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => Promise.resolve({ status: 'denied' }),
  getCurrentPositionAsync: () => Promise.resolve({ coords: { latitude: 0, longitude: 0 } }),
}));

jest.mock('../../src/lib/pickImage', () => ({
  pickFromLibrary: () => Promise.resolve(['file://foto.jpg']),
  takePhoto: () => Promise.resolve(null),
}));

const mockCreatePet = jest.fn();
jest.mock('../../src/services/pets', () => ({
  createPet: (...a: any[]) => mockCreatePet(...a),
}));
const mockGuardarChip = jest.fn();
jest.mock('../../src/services/petChip', () => ({
  guardarChip: (...a: any[]) => mockGuardarChip(...a),
}));
const mockLeerChipDeFicha = jest.fn();
jest.mock('../../src/services/myPets', () => ({
  leerChipDeFicha: (...a: any[]) => mockLeerChipDeFicha(...a),
}));
jest.mock('../../src/services/senasPrivadas', () => ({
  guardarSenasPrivadas: () => Promise.resolve(true),
  obtenerSenasPrivadas: () => Promise.resolve(null),
}));
jest.mock('../../src/services/storage', () => ({
  uploadPetPhotos: () => Promise.resolve(['https://foto/1.jpg']),
  borrarFotosSubidas: () => Promise.resolve(),
  esRechazoDefinitivo: () => false,
  estoySuspendido: () => Promise.resolve(false),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'yo' }, session: {}, loading: false }),
}));
jest.mock('../../src/hooks/useRequireAuth', () => ({
  useRequireAuth: () => () => true,
}));

const mockNotify = jest.fn();
const mockConfirm = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  notify: (...a: any[]) => mockNotify(...a),
  confirmAction: (...a: any[]) => mockConfirm(...a),
}));

const PLACEHOLDER = 'Ej: 985112003456789';
const CHIP = '985112003456789';

// Lo que manda MyPetsScreen al tocar "Reportar como perdida". El chip NO está
// acá a propósito (ver el guardián del final del archivo).
const DESDE_FICHA = {
  estado: 'perdida',
  especie: 'perro',
  raza: 'Quiltro',
  nombre: 'Pelusa',
  descripcion: 'Mestiza, muy asustadiza, tiene collar azul.',
  origenMyPet: 'ficha-1',
};

const montados: any[] = [];

async function montar(params?: any) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <PublishScreen navigation={{ navigate: jest.fn() }} route={{ params }} />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  montados.push(arbol);
  return arbol;
}

// Vuelve a navegar a la pantalla YA MONTADA con otros params (el tab Publicar es
// persistente: es el caso real, no una rareza del test).
async function volverANavegar(arbol: any, params: any) {
  await act(async () => {
    arbol.update(
      <ThemeProvider>
        <PublishScreen navigation={{ navigate: jest.fn() }} route={{ params }} />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
}

function inputChip(arbol: any) {
  const inputs = arbol.root.findAllByType(Input).filter((i: any) => i.props.placeholder === PLACEHOLDER);
  expect(inputs).toHaveLength(1);
  return inputs[0];
}

async function escribirChip(arbol: any, texto: string) {
  const input = inputChip(arbol);
  await act(async () => {
    input.props.onChangeText(texto);
  });
  await act(async () => {});
}

function textoDe(arbol: any): string {
  return arbol.root
    .findAllByType(Text)
    .flatMap((t: any) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c: any) => typeof c === 'string')
    .join(' ');
}

async function publicar(arbol: any, { esperarRebote = false } = {}) {
  await act(async () => {
    arbol.root
      .findAllByType(Button)
      .find((b: any) => b.props.title === 'Galería')
      .props.onPress();
  });
  await act(async () => {});
  // Por la ETIQUETA y no por `accessibilityRole="checkbox"`: los chips de señas
  // también son casillas para el lector de pantalla, así que buscar por rol
  // agarra el primer color de la lista y la confirmación queda sin marcar.
  const casilla = arbol.root
    .findAllByType(TouchableOpacity)
    .find((n: any) =>
      String(n.props.accessibilityLabel ?? '').startsWith('Confirmo que la foto es de la mascota'),
    );
  expect(casilla).toBeDefined();
  await act(async () => {
    casilla.props.onPress();
  });
  await act(async () => {
    arbol.root
      .findAllByType(Button)
      .find((b: any) => b.props.title === 'Publicar')
      .props.onPress();
  });
  await act(async () => {});
  if (!esperarRebote) expect(mockNotify).not.toHaveBeenCalled();
}

beforeEach(() => {
  mockCreatePet.mockReset();
  mockCreatePet.mockResolvedValue({ id: 'pet-1', estado: 'perdida', especie: 'perro', fotos: [] });
  mockGuardarChip.mockReset();
  mockGuardarChip.mockResolvedValue(true);
  mockLeerChipDeFicha.mockReset();
  mockLeerChipDeFicha.mockResolvedValue({ chip: CHIP });
  mockConfirm.mockReset();
  mockConfirm.mockResolvedValue(false);
  mockNotify.mockReset();
});

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('publicar desde una ficha "Mi mascota"', () => {
  it('EL CHIP DE LA FICHA LLEGA AL REPORTE SIN QUE NADIE LO ESCRIBA', async () => {
    // Es el test que importa del archivo. Antes, el dueño que tenía el chip
    // cargado en su ficha publicaba sin él y no había forma de notarlo: el
    // número nunca vuelve al cliente.
    const arbol = await montar(DESDE_FICHA);
    expect(mockLeerChipDeFicha).toHaveBeenCalledWith('ficha-1');
    expect(inputChip(arbol).props.value).toBe(CHIP);
    await publicar(arbol);
    expect(mockGuardarChip).toHaveBeenCalledWith('pet-1', 'yo', CHIP);
  });

  it('se lo dice, en vez de que el número aparezca de la nada', async () => {
    const arbol = await montar(DESDE_FICHA);
    expect(textoDe(arbol)).toContain('Lo trajimos de la ficha');
  });

  it('lo normaliza igual que si lo hubieran tipeado', async () => {
    // La ficha guarda lo que la persona escribió; el cruce de la 0054 se hace
    // por `chip_norm`. Si el formulario quedara con guiones, el dueño vería un
    // número distinto del que la app compara.
    mockLeerChipDeFicha.mockResolvedValue({ chip: '985-112-003-456-789' });
    const arbol = await montar(DESDE_FICHA);
    expect(inputChip(arbol).props.value).toBe(CHIP);
  });

  it('y NO viaja dentro del reporte, ni siquiera viniendo de la ficha', async () => {
    // La 0054 es tajante: publicado, el chip deja de probar nada (el estafador
    // lo lee del aviso) y se puede intentar re-registrar al animal con él.
    const arbol = await montar(DESDE_FICHA);
    await publicar(arbol);
    const enviado = JSON.stringify(mockCreatePet.mock.calls[0][0]);
    expect(enviado).not.toContain(CHIP);
    expect(enviado).not.toContain('chip');
  });

  it('sin ficha de origen no se lee ninguna ficha', async () => {
    await montar({ estado: 'perdida', especie: 'perro', descripcion: 'Un perro cualquiera.' });
    expect(mockLeerChipDeFicha).not.toHaveBeenCalled();
  });

  it('la ficha sin chip no inventa nada y no dice nada', async () => {
    mockLeerChipDeFicha.mockResolvedValue({ chip: null });
    const arbol = await montar(DESDE_FICHA);
    expect(inputChip(arbol).props.value).toBe('');
    expect(textoDe(arbol)).not.toContain('Lo trajimos de la ficha');
    await publicar(arbol);
    expect(mockGuardarChip).not.toHaveBeenCalled();
  });
});

describe('nada de esto puede impedir publicar', () => {
  it('si la ficha no se pudo leer, el reporte se publica igual', async () => {
    mockLeerChipDeFicha.mockResolvedValue(null);
    const arbol = await montar(DESDE_FICHA);
    await publicar(arbol);
    expect(mockCreatePet).toHaveBeenCalled();
  });

  it('y lo DICE: "no se pudo leer" no es lo mismo que "no tiene chip"', async () => {
    // El tercer estado otra vez, acá al revés que en Editar: la casilla vacía
    // sin explicación la hace publicar convencida de que su chip viajó, y es el
    // dato que más cuesta conseguir (hay que ir al veterinario a que lo lean).
    mockLeerChipDeFicha.mockResolvedValue(null);
    const arbol = await montar(DESDE_FICHA);
    const texto = textoDe(arbol);
    expect(texto).toContain('No pudimos traer el número de chip');
    expect(texto).not.toContain('Lo trajimos de la ficha');
  });

  it('si la lectura TIRA, tampoco se cae la pantalla ni el publicar', async () => {
    mockLeerChipDeFicha.mockRejectedValue(new Error('boom'));
    const arbol = await montar(DESDE_FICHA);
    expect(textoDe(arbol)).toContain('No pudimos traer el número de chip');
    await publicar(arbol);
    expect(mockCreatePet).toHaveBeenCalled();
  });

  it('UN TEXTO QUE NO ES UN CHIP EN LA FICHA NO TRABA PUBLICAR', async () => {
    // `my_pets.chip` nunca se validó (su único control es el CHECK de 40
    // caracteres de la 0027): ahí puede haber "no sé" o el número a medias.
    // Copiado crudo, `validarChip` lo rebota al apretar Publicar y el reporte
    // de una mascota perdida queda trabado por algo que la persona ni escribió.
    mockLeerChipDeFicha.mockResolvedValue({ chip: 'no sé, lo tiene el veterinario' });
    const arbol = await montar(DESDE_FICHA);
    expect(inputChip(arbol).props.value).toBe('');
    await publicar(arbol);
    expect(mockCreatePet).toHaveBeenCalled();
    expect(mockGuardarChip).not.toHaveBeenCalled();
    expect(textoDe(arbol)).toContain('no parece un número de chip');
  });
});

describe('la pre-carga no pisa a la persona ni al animal siguiente', () => {
  it('lo que escribió a mano MANDA sobre lo que traiga la ficha', async () => {
    // La lectura es asíncrona: sin este cuidado, una respuesta lenta le borra
    // encima el número que acababa de tipear (y el suyo es el bueno: lo está
    // leyendo del carnet que tiene en la mano).
    let resolver: (v: any) => void = () => {};
    mockLeerChipDeFicha.mockReturnValue(new Promise((r) => {
      resolver = r;
    }));
    const arbol = await montar(DESDE_FICHA);
    await escribirChip(arbol, '1A2B3C4D5E');
    await act(async () => {
      resolver({ chip: CHIP });
    });
    await act(async () => {});
    expect(inputChip(arbol).props.value).toBe('1A2B3C4D5E');
    await publicar(arbol);
    expect(mockGuardarChip).toHaveBeenCalledWith('pet-1', 'yo', '1A2B3C4D5E');
  });

  it('el cartel de la pre-carga desaparece cuando la persona escribe el suyo', async () => {
    // "No pudimos traer el número de chip de tu ficha… escribilo" con el número
    // ya escrito abajo es un cartel que miente, y en esta pantalla los carteles
    // sobre el chip son lo único que la persona tiene para saber qué pasó.
    mockLeerChipDeFicha.mockResolvedValue(null);
    const arbol = await montar(DESDE_FICHA);
    expect(textoDe(arbol)).toContain('No pudimos traer el número de chip');
    await escribirChip(arbol, CHIP);
    expect(textoDe(arbol)).not.toContain('No pudimos traer el número de chip');
  });

  it('EL CHIP DE OTRO ANIMAL NO SE HEREDA al empezar un reporte nuevo', async () => {
    // El tab Publicar es persistente. Si alguien escribió un chip y después
    // toca "Reportar como perdida" en otra ficha, heredarlo no ensucia un
    // campo: le manda a la familia del PRIMER animal el aviso más fuerte que
    // existe ("casi seguro es tu mascota") apuntando a otro. Y es mudo: el
    // número nunca vuelve al cliente, nadie lo ve nunca.
    mockLeerChipDeFicha.mockResolvedValue({ chip: null });
    const arbol = await montar({ estado: 'perdida', especie: 'perro', descripcion: 'Un perro.' });
    await escribirChip(arbol, CHIP);
    await volverANavegar(arbol, { ...DESDE_FICHA, origenMyPet: 'ficha-2' });
    expect(inputChip(arbol).props.value).toBe('');
    await publicar(arbol);
    expect(mockGuardarChip).not.toHaveBeenCalled();
  });

  it('volver a la MISMA ficha vuelve a traer su chip (no queda la casilla vacía)', async () => {
    // Al limpiar el campo en cada pre-carga hay que reponerlo siempre, también
    // cuando la ficha es la misma de antes: ahí el `origenMyPet` no cambia y es
    // fácil que la reposición no se dispare.
    const arbol = await montar(DESDE_FICHA);
    expect(inputChip(arbol).props.value).toBe(CHIP);
    await volverANavegar(arbol, { ...DESDE_FICHA });
    expect(inputChip(arbol).props.value).toBe(CHIP);
  });
});

describe('el teclado del campo acompaña al validador', () => {
  // Las dos mitades se contradecían: `normalizarChip` limpia con
  // `[^A-Za-z0-9]` y valida de 9 a 15 caracteres —los viejos AVID alfanuméricos
  // son válidos A PROPÓSITO— y el campo pedía `keyboardType="numeric"`. Un
  // teclado numérico no rechaza esos chips: no tiene las teclas. Quien tenga
  // uno no puede escribir su número, no ve ningún error (no hay error que ver) y
  // publica sin el único dato que prueba de quién es el animal.
  const NUMERICOS = ['numeric', 'number-pad', 'decimal-pad', 'phone-pad'];

  it('el campo del chip NO pide un teclado numérico', async () => {
    const arbol = await montar(DESDE_FICHA);
    expect(NUMERICOS).not.toContain(inputChip(arbol).props.keyboardType);
  });

  it('un chip alfanumérico se puede escribir y llega entero a pet_chips', async () => {
    // La otra mitad de la prueba: que el validador de verdad los acepte. Si el
    // día de mañana se decidiera que el chip es solo numérico, este test se cae
    // junto con el de arriba y hay que decidir las dos cosas juntas.
    const arbol = await montar(DESDE_FICHA);
    await escribirChip(arbol, '1A2B3C4D5E');
    await publicar(arbol);
    expect(mockGuardarChip).toHaveBeenCalledWith('pet-1', 'yo', '1A2B3C4D5E');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// EL CHIP NO VIAJA POR LA NAVEGACIÓN
//
// `MyPetsScreen` tiene la ficha entera en memoria, chip incluido: mandarlo en el
// `navigate` era una línea, y por eso este guardián existe. Los params de
// navegación se serializan en la URL en la versión web y quedan en el historial
// del navegador; el dato más sensible del proyecto terminaría escrito en la
// barra de direcciones. Por eso viaja el id de la ficha y el número se lee de
// nuevo, por el mismo camino que la pantalla ya usaba (la tabla, cerrada por RLS).
// ───────────────────────────────────────────────────────────────────────────
describe('MyPetsScreen no manda el chip por params', () => {
  const fuente: string = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'screens', 'MyPetsScreen.tsx'),
    'utf8',
  );
  const desde = fuente.indexOf('const reportarPerdida');
  const cuerpo = fuente.slice(desde, fuente.indexOf('\n  };', desde));

  it('el parser encuentra la función (si no, el guardián pasa por vacío)', () => {
    expect(desde).toBeGreaterThan(-1);
    expect(cuerpo).toContain("navigation.navigate('Publicar'");
    expect(cuerpo).toContain('origenMyPet');
  });

  it('lo que manda no incluye el número de chip', () => {
    expect(cuerpo).not.toMatch(/\bchip\b/i);
  });
});
