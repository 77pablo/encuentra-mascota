import React from 'react';
import { act, create } from 'react-test-renderer';
import { PreguntaSiAparecio } from '../../src/components/PreguntaSiAparecio';
import { Button } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// LA TARJETA QUE PREGUNTA "¿APARECIÓ?".
//
// Es la pantalla más delicada de la app: se la lee alguien que puede no haber
// encontrado a su animal. Acá se vigilan tres cosas distintas y todas importan:
//
//  1. QUE NO APAREZCA CUANDO NO CORRESPONDE — y muy en particular con la
//     migración 0049 SIN aplicar, donde los tres botones fallarían al tocarlos.
//  2. QUE LA RESPUESTA LLEGUE ENTERA A LA BASE, y que un fallo se vea en vez de
//     tragarse (el reporte quedó como estaba: hay que poder reintentar).
//  3. EL TONO. Nada de festejos anticipados, y "ya no la busco" no puede estar
//     pintado como una acción destructiva ni sonar a fracaso.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const mockResponder = jest.fn();
jest.mock('../../src/services/cierreCasos', () => ({
  responderEstado: (...args: any[]) => mockResponder(...args),
}));

const mockConfirm = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  confirmAction: (...args: any[]) => mockConfirm(...args),
  notify: jest.fn(),
}));

const AHORA = new Date('2026-08-01T12:00:00Z');
const DIA = 24 * 60 * 60 * 1000;
const haceDias = (n: number) => new Date(AHORA.getTime() - n * DIA).toISOString();

const PET: any = {
  id: 'pet-1',
  user_id: 'u1',
  estado: 'perdida',
  especie: 'perro',
  raza: null,
  nombre: 'Pelusa',
  descripcion: 'Chiquito, blanco',
  fotos: [],
  lat: -33.4,
  lng: -70.6,
  recompensa: null,
  activo: true,
  oculto: false,
  creado_en: haceDias(3),
  renovado_en: haceDias(3),
  reunida_en: null,
  // La clave existe (valor null) = la 0049 está aplicada. Ver el describe de
  // degradación más abajo, donde justamente NO está.
  preguntado_en: null,
};

async function montar(pet: any = PET, onRespondido: any = jest.fn()) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <PreguntaSiAparecio pet={pet} ahora={AHORA} onRespondido={onRespondido} />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  return arbol;
}

function textoDe(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.children?.[0] === 'string')
    .map((n: any) => n.children.join(''))
    .join(' ');
}

function botones(arbol: any) {
  return arbol.root.findAllByType(Button).map((b: any) => b.props);
}

function botonQueDice(arbol: any, fragmento: string) {
  const b = botones(arbol).find((p: any) => p.title.includes(fragmento));
  if (!b) throw new Error(`no hay boton que diga "${fragmento}". Hay: ${botones(arbol).map((p: any) => p.title).join(' / ')}`);
  return b;
}

async function tocar(arbol: any, fragmento: string) {
  await act(async () => {
    await botonQueDice(arbol, fragmento).onPress();
  });
  await act(async () => {});
}

beforeEach(() => {
  mockResponder.mockReset().mockResolvedValue(undefined);
  mockConfirm.mockReset().mockResolvedValue(true);
});

describe('cuándo NO se dibuja', () => {
  it('antes del primer hito no hay tarjeta', async () => {
    expect((await montar({ ...PET, creado_en: haceDias(2) })).toJSON()).toBeNull();
  });

  it('cuando ya volvió a casa, tampoco', async () => {
    expect(
      (await montar({ ...PET, creado_en: haceDias(10), reunida_en: haceDias(1), activo: false })).toJSON(),
    ).toBeNull();
  });

  it('si ya respondió ese hito, se queda callada', async () => {
    expect((await montar({ ...PET, preguntado_en: haceDias(0) })).toJSON()).toBeNull();
  });

  it('en un reporte de mascota ENCONTRADA no pregunta nada', async () => {
    // "¿Apareció tu perro?" no es la pregunta que va: quien publicó encontró un
    // animal ajeno y lo que habría que preguntarle es si dio con su familia.
    // Esa conversación es otra —incluida la tercera salida, que ahí sería "me
    // lo quedé" o "lo llevé a un refugio"— y hasta que exista, mejor callarse
    // que preguntar mal. Mismo criterio que PlanBusqueda y ConsejoRadio.
    expect((await montar({ ...PET, estado: 'encontrada' })).toJSON()).toBeNull();
  });
});

describe('CON LA MIGRACIÓN 0049 SIN APLICAR: la tarjeta no existe', () => {
  // Sin la 0049 la RPC `responder_estado` no está y los tres botones fallarían
  // con PGRST202. El requisito es más duro que "mostrar un error": la tarjeta
  // directamente no se dibuja. Se detecta porque `getPet` lee con select('*') y
  // la fila NO trae la clave `preguntado_en` si la columna no existe.
  const sinMigracion = () => {
    const { preguntado_en, ...resto } = PET;
    return { ...resto, creado_en: haceDias(30) };
  };

  it('un reporte de 30 días sin la columna no muestra nada', async () => {
    expect((await montar(sinMigracion())).toJSON()).toBeNull();
  });

  it('y no llama a la RPC ni una vez', async () => {
    await montar(sinMigracion());
    expect(mockResponder).not.toHaveBeenCalled();
  });
});

describe('lo que dice, y cómo lo dice', () => {
  it('pregunta por su nombre y NO celebra por adelantado', async () => {
    const texto = textoDe(await montar());
    expect(texto).toContain('¿Apareció Pelusa?');
    // El tono es TODA la tarjeta, no solo el título: quien la lee puede no
    // haber encontrado a su animal. Ni un signo de exclamación.
    expect(texto).not.toContain('!');
    expect(texto).not.toContain('¡');
  });

  it('sin nombre cargado pregunta por la especie, no por "la mascota"', async () => {
    expect(textoDe(await montar({ ...PET, nombre: null }))).toContain('¿Apareció tu perro?');
    expect(textoDe(await montar({ ...PET, nombre: '  ', especie: 'gato' }))).toContain(
      '¿Apareció tu gato?',
    );
  });

  it('a las tres semanas avisa que es la última vez que pregunta', async () => {
    const texto = textoDe(await montar({ ...PET, creado_en: haceDias(21) }));
    expect(texto.toLowerCase()).toContain('última vez');
    // Y no a los 3 días, donde todavía quedan dos preguntas por delante.
    expect(textoDe(await montar()).toLowerCase()).not.toContain('última vez');
  });

  it('las tres salidas están, y concuerdan con la especie', async () => {
    const perro = botones(await montar()).map((p: any) => p.title);
    expect(perro).toEqual(['Sí, volvió a casa', 'Sigo buscándolo', 'Ya no lo busco']);
    const otro = botones(await montar({ ...PET, especie: 'otro', nombre: null })).map(
      (p: any) => p.title,
    );
    expect(otro).toEqual(['Sí, volvió a casa', 'Sigo buscándola', 'Ya no la busco']);
  });

  it('"ya no la busco" NO está pintada como una acción destructiva', async () => {
    // Es la decisión más difícil de las tres y tiene que poder tomarse sin que
    // la app la trate como un error. Un botón rojo (variant "danger") le pone
    // encima un juicio que no nos corresponde hacer.
    const arbol = await montar();
    expect(botonQueDice(arbol, 'Ya no lo busco').variant).not.toBe('danger');
    expect(botonQueDice(arbol, 'Sí, volvió a casa').variant ?? 'primary').toBe('primary');
  });
});

describe('la respuesta llega entera a la base', () => {
  it('"volvió a casa" manda `aparecio` y avisa al padre', async () => {
    const onRespondido = jest.fn();
    const arbol = await montar(PET, onRespondido);
    await tocar(arbol, 'Sí, volvió a casa');
    expect(mockResponder).toHaveBeenCalledWith('pet-1', 'aparecio');
    expect(onRespondido).toHaveBeenCalledWith('aparecio');
  });

  it('"sigo buscándolo" manda `sigo_buscando`', async () => {
    const onRespondido = jest.fn();
    const arbol = await montar(PET, onRespondido);
    await tocar(arbol, 'Sigo buscándolo');
    expect(mockResponder).toHaveBeenCalledWith('pet-1', 'sigo_buscando');
    expect(onRespondido).toHaveBeenCalledWith('sigo_buscando');
  });

  it('"ya no lo busco" manda `ya_no_busco`, pero pregunta antes', async () => {
    const onRespondido = jest.fn();
    const arbol = await montar(PET, onRespondido);
    await tocar(arbol, 'Ya no lo busco');
    expect(mockConfirm).toHaveBeenCalled();
    expect(mockResponder).toHaveBeenCalledWith('pet-1', 'ya_no_busco');
    expect(onRespondido).toHaveBeenCalledWith('ya_no_busco');
  });

  it('si se arrepiente en la confirmación, no pasa NADA', async () => {
    // Cerrar el reporte es lo único de acá que no tiene vuelta atrás desde la
    // app: no hay ninguna pantalla que vuelva a poner `activo = true`.
    mockConfirm.mockResolvedValue(false);
    const onRespondido = jest.fn();
    const arbol = await montar(PET, onRespondido);
    await tocar(arbol, 'Ya no lo busco');
    expect(mockResponder).not.toHaveBeenCalled();
    expect(onRespondido).not.toHaveBeenCalled();
  });

  it('la confirmación dice qué pasa con el reporte, sin dramatizarlo', async () => {
    const arbol = await montar();
    await tocar(arbol, 'Ya no lo busco');
    const aviso = mockConfirm.mock.calls[0].join(' ').toLowerCase();
    expect(aviso).toContain('guardado');
    expect(aviso).not.toContain('!');
  });

  it('las otras dos NO piden confirmación: son un solo toque', async () => {
    for (const boton of ['Sí, volvió a casa', 'Sigo buscándolo']) {
      mockConfirm.mockClear();
      await tocar(await montar(), boton);
      expect({ boton, confirmo: mockConfirm.mock.calls.length }).toEqual({ boton, confirmo: 0 });
    }
  });
});

describe('si falla, se ve (y se puede reintentar)', () => {
  const pgrst202 = Object.assign(new Error('Could not find the function public.responder_estado'), {
    code: 'PGRST202',
  });

  it('la tarjeta sigue ahí, con el error y sin avisarle al padre', async () => {
    mockResponder.mockRejectedValue(pgrst202);
    const onRespondido = jest.fn();
    const arbol = await montar(PET, onRespondido);
    await tocar(arbol, 'Sigo buscándolo');
    expect(arbol.toJSON()).not.toBeNull();
    const texto = textoDe(arbol).toLowerCase();
    expect(texto).toContain('no pudimos guardar tu respuesta');
    // Lo que más tranquiliza: que nada se movió. Si la persona cree que su
    // reporte se cerró solo, la pérdida es mucho peor que el error.
    expect(texto).toContain('quedó como estaba');
    expect(onRespondido).not.toHaveBeenCalled();
  });

  it('el reintento vuelve a mandar LA MISMA respuesta', async () => {
    mockResponder.mockRejectedValueOnce(pgrst202).mockResolvedValue(undefined);
    const onRespondido = jest.fn();
    const arbol = await montar(PET, onRespondido);
    await tocar(arbol, 'Sigo buscándolo');
    await tocar(arbol, 'Reintentar');
    expect(mockResponder.mock.calls).toEqual([
      ['pet-1', 'sigo_buscando'],
      ['pet-1', 'sigo_buscando'],
    ]);
    expect(onRespondido).toHaveBeenCalledWith('sigo_buscando');
  });

  it('un error de red también se ve, no solo la migración que falta', async () => {
    mockResponder.mockRejectedValue(new Error('Failed to fetch'));
    const arbol = await montar();
    await tocar(arbol, 'Sí, volvió a casa');
    expect(textoDe(arbol).toLowerCase()).toContain('no pudimos guardar tu respuesta');
  });
});
