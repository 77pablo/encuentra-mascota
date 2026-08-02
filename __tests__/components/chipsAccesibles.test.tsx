import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';

// LOS CHIPS TIENEN QUE DECIR QUÉ SON Y CUÁL ESTÁ ELEGIDO.
//
// Un chip se distingue de otro por el color de fondo, y el color no viaja: el
// `TouchableOpacity` de react-native-web solo agrega `focusable` y NO inyecta
// ningún rol por su cuenta, así que estos controles salían al DOM como
// `<div tabindex="0">Negro</div>`. Quien no ve la pantalla escuchaba siete
// palabras sueltas —"Negro Blanco Gris Café…"— sin saber que eran controles ni
// cuál acababa de activar. Mientras fueron filtros efímeros molestaba; desde la
// tanda 12 `SelectorSenas` publica con ellos las señas que quedan EN LA BASE.
//
// Acá se mira lo que el componente declara de verdad al montarse, no el texto
// del archivo: que cada chip pulsable lleve rol, que el estado viaje por las
// DOS APIs (`accessibilityState` para VoiceOver/TalkBack, `aria-checked` para
// la web, porque react-native-web 0.21 dejó de traducir la primera en
// silencio), y que el rol diga la verdad sobre lo que promete el grupo.
//
// El reparto de trabajo con los otros guardarraíles:
//   · que esas props LLEGUEN al DOM lo garantiza
//     __tests__/lib/propsQueLaWebIgnora.test.ts, que lee la tabla de la versión
//     instalada de react-native-web;
//   · que nadie escriba un control nuevo con estado y sin rol lo garantiza
//     __tests__/lib/controlesConEstadoAccesible.test.ts.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

// Los cuerpos de Explorar piden a la base; acá interesan los controles de
// arriba, así que se apagan.
jest.mock('../../src/components/ReportesLista', () => () => null);
jest.mock('../../src/components/ReportesMapa', () => () => null);
jest.mock('../../src/components/ComunaPickerModal', () => () => null);
jest.mock('../../src/components/SeguirComunaButton', () => () => null);
jest.mock('../../src/components/GuardarBusquedaButton', () => () => null);
jest.mock('../../src/components/MensajesButton', () => () => null);
jest.mock('../../src/lib/notify', () => ({ notify: jest.fn(), confirmAction: () => Promise.resolve(false) }));

jest.mock('../../src/hooks/useMyLocation', () => ({
  useMyLocation: () => ({ status: 'idle', coords: null, request: jest.fn() }),
}));

/* eslint-disable import/first */
import { Chip } from '../../src/ui';
import { SelectorSenas, SENAS_VACIAS, type Senas } from '../../src/components/SelectorSenas';
import ExplorarScreen from '../../src/screens/ExplorarScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import {
  COLORES,
  COLOR_ETIQUETA,
  ESTERILIZADOS,
  ESTERILIZADO_ETIQUETA,
  SEXOS,
  SEXO_ETIQUETA,
  TAMANOS,
  TAMANO_ETIQUETA,
} from '../../src/lib/senasMascota';
/* eslint-enable import/first */

// Explorar deja un temporizador de tipeo andando; sin desmontar, salta después
// de que jest bajó el entorno y ensucia la corrida entera.
const montados: any[] = [];
afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

async function montar(nodo: React.ReactElement) {
  let arbol: any;
  await act(async () => {
    arbol = create(<ThemeProvider>{nodo}</ThemeProvider>);
  });
  await act(async () => {});
  montados.push(arbol);
  return arbol;
}

/** El elemento pulsable de un chip, o `null` si el chip no es un control. */
function control(chip: any): any {
  const tocables = chip.findAllByType(TouchableOpacity);
  return tocables.length > 0 ? tocables[0] : null;
}

const chips = (arbol: any) => arbol.root.findAllByType(Chip);
const chipPorLabel = (arbol: any, label: string) =>
  chips(arbol).find((c: any) => c.props.label === label);

/** El grupo que envuelve al chip: sube por los padres hasta encontrar un rol. */
function grupoDe(chip: any): any {
  let p = chip.parent;
  while (p) {
    const rol = p.props?.role ?? p.props?.accessibilityRole;
    if (rol === 'radiogroup' || rol === 'group') return p;
    p = p.parent;
  }
  return null;
}

describe('el contrato del chip', () => {
  it('un chip que se toca declara rol y su estado en las DOS APIs', async () => {
    const arbol = await montar(<Chip label="Negro" active onPress={() => {}} />);
    const c = control(chipPorLabel(arbol, 'Negro'));
    expect(c).not.toBeNull();
    // Sin rol, el lector de pantalla lee "Negro" y nada más: ni que es un
    // control ni que está elegido.
    expect(c.props.accessibilityRole).toBeTruthy();
    expect(c.props['aria-checked']).toBe(true);
    expect(c.props.accessibilityState?.checked).toBe(true);
  });

  it('el estado sigue al valor, no está fijo', async () => {
    const arbol = await montar(<Chip label="Negro" active={false} onPress={() => {}} />);
    const c = control(chipPorLabel(arbol, 'Negro'));
    expect(c.props['aria-checked']).toBe(false);
    expect(c.props.accessibilityState?.checked).toBe(false);
  });

  it('"elegí uno" es radio y "prendido o apagado" es casilla: no son lo mismo', async () => {
    const arbol = await montar(
      <>
        <Chip label="Chico" rol="opcion" active onPress={() => {}} />
        <Chip label="Con recompensa" rol="casilla" active={false} onPress={() => {}} />
      </>,
    );
    expect(control(chipPorLabel(arbol, 'Chico')).props.accessibilityRole).toBe('radio');
    expect(control(chipPorLabel(arbol, 'Con recompensa')).props.accessibilityRole).toBe('checkbox');
  });

  it('un chip que solo hace algo es botón y NO finge estado marcado', async () => {
    const arbol = await montar(<Chip label="✕ Quitar" rol="boton" onPress={() => {}} />);
    const c = control(chipPorLabel(arbol, '✕ Quitar'));
    expect(c.props.accessibilityRole).toBe('button');
    // `aria-checked` sobre un botón no es ARIA válido: o lo ignoran o mienten.
    expect(c.props['aria-checked']).toBeUndefined();
    expect(c.props.accessibilityState?.checked).toBeUndefined();
  });

  it('el chip que despliega algo dice si está abierto', async () => {
    const arbol = await montar(
      <Chip label="Filtros" rol="boton" expandido={false} onPress={() => {}} />,
    );
    const c = control(chipPorLabel(arbol, 'Filtros'));
    expect(c.props['aria-expanded']).toBe(false);
    expect(c.props.accessibilityState?.expanded).toBe(false);
  });

  it('un chip SIN onPress no es un control ni una parada de tabulador', async () => {
    // En PetDetailScreen los chips muestran las señas ya publicadas: son texto.
    // Como `TouchableOpacity` la web los dejaba enfocables con Tab sin nada que
    // hacer al llegar (nativo los saca solo; la web no mira el `onPress`).
    const arbol = await montar(<Chip label="Negro" />);
    expect(control(chipPorLabel(arbol, 'Negro'))).toBeNull();
    const json = arbol.toJSON();
    const nodo = Array.isArray(json) ? json[0] : json;
    expect(nodo.props.focusable).toBeFalsy();
    expect(nodo.props.accessibilityRole).toBeUndefined();
    // …pero el texto se sigue leyendo.
    expect(JSON.stringify(nodo)).toContain('Negro');
  });

  it('se puede decir en voz lo que el texto no dice (emojis, "Quitar")', async () => {
    const arbol = await montar(
      <Chip label="🗺 Mapa" rol="opcion" active accessibilityLabel="Ver en el mapa" onPress={() => {}} />,
    );
    expect(control(chipPorLabel(arbol, '🗺 Mapa')).props.accessibilityLabel).toBe('Ver en el mapa');
  });
});

describe('SelectorSenas: el formulario que se guarda en la base', () => {
  const VALOR: Senas = {
    colores: ['negro', 'gris'],
    tamano: 'mediano',
    sexo: null,
    esterilizado: null,
  };

  it('ninguno de los 16 chips sale mudo', async () => {
    const arbol = await montar(<SelectorSenas valor={SENAS_VACIAS} onChange={() => {}} />);
    const todos = chips(arbol);
    // Guarda contra el vacío: si mañana el selector se queda sin chips, los
    // asserts de abajo pasarían por no tener nada que revisar.
    expect(todos.length).toBe(
      COLORES.length + TAMANOS.length + SEXOS.length + ESTERILIZADOS.length,
    );
    for (const chip of todos) {
      const c = control(chip);
      expect(`${chip.props.label}: ${c?.props.accessibilityRole ?? 'SIN ROL'}`).not.toContain(
        'SIN ROL',
      );
      expect(`${chip.props.label}: ${typeof c.props['aria-checked']}`).toBe(
        `${chip.props.label}: boolean`,
      );
    }
  });

  it('los colores son casillas: se pueden marcar varios a la vez', async () => {
    const arbol = await montar(<SelectorSenas valor={VALOR} onChange={() => {}} />);
    for (const color of COLORES) {
      const c = control(chipPorLabel(arbol, COLOR_ETIQUETA[color]));
      expect(`${color}: ${c.props.accessibilityRole}`).toBe(`${color}: checkbox`);
    }
    // Y el grupo lo dice, porque el rótulo "Color (2/3)" de la pantalla no lo
    // escucha quien llega tabulando directo a los chips.
    const grupo = grupoDe(chipPorLabel(arbol, COLOR_ETIQUETA.negro));
    expect(grupo).not.toBeNull();
    expect(grupo.props.role ?? grupo.props.accessibilityRole).toBe('group');
    expect(grupo.props.accessibilityLabel).toBeTruthy();
  });

  it('tamaño, sexo y esterilizado son opciones dentro de su grupo: se elige una', async () => {
    const arbol = await montar(<SelectorSenas valor={VALOR} onChange={() => {}} />);
    const unaSola: [string, string][] = [
      ...TAMANOS.map((t) => [t, TAMANO_ETIQUETA[t]] as [string, string]),
      ...SEXOS.map((s) => [s, SEXO_ETIQUETA[s]] as [string, string]),
      ...ESTERILIZADOS.map((e) => [e, ESTERILIZADO_ETIQUETA[e]] as [string, string]),
    ];
    for (const [clave, etiqueta] of unaSola) {
      const chip = chipPorLabel(arbol, etiqueta);
      expect(`${clave}: ${control(chip).props.accessibilityRole}`).toBe(`${clave}: radio`);
      const grupo = grupoDe(chip);
      expect(`${clave}: ${grupo?.props.role ?? grupo?.props.accessibilityRole ?? 'SIN GRUPO'}`).toBe(
        `${clave}: radiogroup`,
      );
      expect(`${clave}: ${grupo.props.accessibilityLabel ?? 'SIN ETIQUETA'}`).not.toContain(
        'SIN ETIQUETA',
      );
    }
  });

  it('lo marcado es exactamente lo que trae el valor', async () => {
    const arbol = await montar(<SelectorSenas valor={VALOR} onChange={() => {}} />);
    const marcados = chips(arbol)
      .filter((c: any) => control(c).props['aria-checked'] === true)
      .map((c: any) => c.props.label)
      .sort();
    expect(marcados).toEqual(
      [COLOR_ETIQUETA.negro, COLOR_ETIQUETA.gris, TAMANO_ETIQUETA.mediano].sort(),
    );
  });

  it('el estado nativo y el de la web no se separan', async () => {
    const arbol = await montar(<SelectorSenas valor={VALOR} onChange={() => {}} />);
    for (const chip of chips(arbol)) {
      const c = control(chip);
      // Comparar dos `undefined` daría verde sobre el bug: se exige que las dos
      // digan algo Y que digan lo mismo.
      expect(`${chip.props.label}: ${typeof c.props.accessibilityState?.checked}`).toBe(
        `${chip.props.label}: boolean`,
      );
      expect(`${chip.props.label}: ${c.props.accessibilityState?.checked}`).toBe(
        `${chip.props.label}: ${c.props['aria-checked']}`,
      );
    }
  });
});

describe('Explorar: los filtros', () => {
  async function abrirFiltros() {
    const arbol = await montar(
      <ExplorarScreen navigation={{ navigate: jest.fn() }} route={{ params: undefined }} />,
    );
    const filtros = chips(arbol).find((c: any) => String(c.props.label).includes('Filtros'));
    await act(async () => {
      control(filtros).props.onPress();
    });
    await act(async () => {});
    return { arbol, filtros };
  }

  it('el botón de filtros dice si el panel está abierto', async () => {
    const arbol = await montar(
      <ExplorarScreen navigation={{ navigate: jest.fn() }} route={{ params: undefined }} />,
    );
    const filtros = chips(arbol).find((c: any) => String(c.props.label).includes('Filtros'));
    expect(control(filtros).props['aria-expanded']).toBe(false);
    await act(async () => {
      control(filtros).props.onPress();
    });
    await act(async () => {});
    expect(control(filtros).props['aria-expanded']).toBe(true);
  });

  it('ningún chip de la pantalla sale mudo', async () => {
    const { arbol } = await abrirFiltros();
    const todos = chips(arbol);
    expect(todos.length).toBeGreaterThanOrEqual(15);
    for (const chip of todos) {
      const c = control(chip);
      expect(`${chip.props.label}: ${c?.props.accessibilityRole ?? 'SIN ROL'}`).not.toContain(
        'SIN ROL',
      );
    }
  });

  it('los grupos de "elegí uno" son radiogroups con nombre', async () => {
    const { arbol } = await abrirFiltros();
    // Un chip testigo por grupo; si alguno deja de ser radio o se queda sin
    // grupo, se cae acá con el nombre puesto.
    for (const etiqueta of ['Perdidas', 'Gato', 'Café', 'Mediano', 'Última semana', '☰ Lista']) {
      const chip = chipPorLabel(arbol, etiqueta);
      expect(`${etiqueta}: ${control(chip)?.props.accessibilityRole ?? 'SIN ROL'}`).toBe(
        `${etiqueta}: radio`,
      );
      const grupo = grupoDe(chip);
      const rol = grupo?.props.role ?? grupo?.props.accessibilityRole ?? 'SIN GRUPO';
      expect(`${etiqueta}: ${rol}`).toBe(`${etiqueta}: radiogroup`);
      expect(`${etiqueta}: ${grupo.props.accessibilityLabel ?? 'SIN ETIQUETA'}`).not.toContain(
        'SIN ETIQUETA',
      );
    }
  });

  it('un filtro suelto es casilla y no finge ser parte de un grupo', async () => {
    const { arbol } = await abrirFiltros();
    // "Con recompensa" se prende y se apaga sola: no compite con nadie.
    const c = control(chipPorLabel(arbol, 'Con recompensa'));
    expect(c.props.accessibilityRole).toBe('checkbox');
    expect(c.props['aria-checked']).toBe(false);
  });

  it('el chip que abre el selector de comuna es un botón, no una casilla', async () => {
    const { arbol } = await abrirFiltros();
    const c = control(chipPorLabel(arbol, '🏘 Filtrar por comuna'));
    expect(c.props.accessibilityRole).toBe('button');
    expect(c.props['aria-checked']).toBeUndefined();
    // El texto visible arranca con un emoji que el lector deletrea.
    expect(c.props.accessibilityLabel).not.toContain('🏘');
  });

  it('el color acá es "elegí uno" y en el formulario es "hasta tres": el rol lo distingue', async () => {
    const { arbol } = await abrirFiltros();
    const enExplorar = control(chipPorLabel(arbol, COLOR_ETIQUETA.negro)).props.accessibilityRole;
    const formulario = await montar(<SelectorSenas valor={SENAS_VACIAS} onChange={() => {}} />);
    const enFormulario = control(chipPorLabel(formulario, COLOR_ETIQUETA.negro)).props
      .accessibilityRole;
    expect(`${enExplorar} / ${enFormulario}`).toBe('radio / checkbox');
  });
});
