import React from 'react';
import { act, create } from 'react-test-renderer';

// EL PLAN CON RELOJ, EN PANTALLA.
//
// La lógica pura está cubierta en __tests__/lib/planBusqueda.test.ts. Acá se
// verifica lo que sólo se rompe en la UI: que se abra la ventana que toca AHORA
// y no otra, que el paso que sigue venga desplegado, que marcarlo se guarde, y
// que lo que el dueño responde sobre su mascota cambie de verdad lo que ve.

const mem: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (k: string) => (k in mem ? mem[k] : null),
  setItem: (k: string, v: string) => {
    mem[k] = v;
  },
  removeItem: (k: string) => {
    delete mem[k];
  },
};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => (k in mem ? mem[k] : null)),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mem[k] = v;
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

import { PlanBusqueda } from '../../src/components/PlanBusqueda';
import { CLAVE_PLAN, getEstadoPlan } from '../../src/lib/planLocal';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { Button, Chip } from '../../src/ui';

const AHORA = new Date('2026-08-01T18:00:00Z');
const hs = (n: number) => new Date(AHORA.getTime() - n * 3600 * 1000).toISOString();

const PERRO = { id: 'pet-1', especie: 'perro' as const, creado_en: hs(1) };
const GATO = { id: 'pet-gato', especie: 'gato' as const, creado_en: hs(1) };

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

async function montar(props: any) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <PlanBusqueda ahora={AHORA} {...props} />
      </ThemeProvider>,
    );
  });
  // el estado guardado llega asíncrono
  await act(async () => {});
  return arbol;
}

const casilla = (arbol: any, titulo: string) =>
  arbol.root.find(
    (n: any) => n.props.accessibilityRole === 'checkbox' && n.props.accessibilityLabel?.startsWith(titulo),
  );

const boton = (arbol: any, title: string) =>
  arbol.root.findAllByType(Button).find((n: any) => n.props.title === title);

/** Toca el título de un paso plegado para desplegarlo. */
const abrirPaso = async (arbol: any, titulo: string) => {
  const fila = arbol.root.find(
    (n: any) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === titulo,
  );
  await act(async () => {
    fila.props.onPress();
  });
};

const chip = (arbol: any, label: string) =>
  arbol.root.findAllByType(Chip).find((n: any) => n.props.label === label);

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
});

describe('la ventana que toca ahora', () => {
  it('a la hora de perderse abre las próximas 2 horas y no las demás', async () => {
    const arbol = await montar({ pet: PERRO });
    const t = textos(arbol);
    expect(t).toContain('Las próximas 2 horas');
    // el paso de la primera ventana está a la vista…
    expect(t).toContain('No lo persigas');
    // …y el del día 5 no, aunque su ventana figure en la lista
    expect(t).toContain('Del día 5 en adelante');
    expect(t).not.toContain('Volvé en persona, con el afiche en la mano');
  });

  it('a las 40 horas la ventana abierta es la del día 2, no la primera', async () => {
    const arbol = await montar({ pet: { ...PERRO, creado_en: hs(40) } });
    const t = textos(arbol);
    expect(t).toContain('Ampliá el radio');
    expect(t).not.toContain('No lo persigas');
  });

  it('dice cuánto hace que se perdió, sin adornos', async () => {
    const arbol = await montar({ pet: { ...PERRO, creado_en: hs(40) } });
    expect(textos(arbol)).toContain('Hace 1 día');
  });
});

describe('el paso que sigue', () => {
  it('viene desplegado y los que van después, no', async () => {
    const arbol = await montar({ pet: PERRO });
    const t = textos(arbol);
    // el primero pendiente muestra el detalle entero
    expect(t).toContain('Es el error más común y el que más caro sale.');
    // el segundo de la misma ventana está listado, pero plegado
    expect(t).toContain('Si lo ves, agachate y esperá');
    expect(t).not.toContain('Sentate o agachate de costado');
  });

  it('marcar el primero corre el destacado al siguiente, y queda guardado', async () => {
    const arbol = await montar({ pet: PERRO });
    await act(async () => {
      casilla(arbol, 'No lo persigas').props.onPress();
    });
    await act(async () => {});

    const t = textos(arbol);
    expect(t).not.toContain('Es el error más común y el que más caro sale.');
    expect(t).toContain('Sentate o agachate de costado');

    const guardado = await getEstadoPlan(PERRO.id);
    expect(guardado.hechos).toEqual(['no-lo-persigas']);
    expect(mem[CLAVE_PLAN(PERRO.id)]).toBeDefined();
  });

  it('lo que ya venía marcado de antes aparece marcado', async () => {
    mem[CLAVE_PLAN(PERRO.id)] = JSON.stringify({ hechos: ['no-lo-persigas'] });
    const arbol = await montar({ pet: PERRO });
    expect(casilla(arbol, 'No lo persigas').props['aria-checked']).toBe(true);
    // y el destacado ya no es ese
    expect(textos(arbol)).toContain('Sentate o agachate de costado');
  });

  it('cada casilla declara su estado en las dos APIs (react-native-web ignora una)', async () => {
    const arbol = await montar({ pet: PERRO });
    const c = casilla(arbol, 'No lo persigas');
    expect(c.props.accessibilityState).toEqual({ checked: false });
    expect(c.props['aria-checked']).toBe(false);
  });
});

describe('lo que el dueño responde cambia el plan que ve', () => {
  it('un perro que se acerca a la gente no recibe la maniobra de agacharse', async () => {
    const arbol = await montar({ pet: PERRO });
    expect(textos(arbol)).toContain('Si lo ves, agachate y esperá');

    await act(async () => {
      chip(arbol, 'Se acerca').props.onPress();
    });
    await act(async () => {});

    expect(textos(arbol)).not.toContain('Si lo ves, agachate y esperá');
    expect(await getEstadoPlan(PERRO.id)).toMatchObject({ temperamento: 'sociable' });
  });

  it('un gato que salía solo arranca por su ronda; uno de adentro, por los 100 m', async () => {
    const arbol = await montar({ pet: GATO });
    expect(textos(arbol)).toContain('No se fue lejos');

    await act(async () => {
      chip(arbol, 'Salía solo').props.onPress();
    });
    await act(async () => {});

    const t = textos(arbol);
    expect(t).toContain('Empezá por su ronda de siempre');
    expect(t).not.toContain('No se fue lejos');
  });

  it('a una mascota que no es perro ni gato no se le hace una pregunta que no aplica', async () => {
    const arbol = await montar({ pet: { ...PERRO, especie: 'otro' as const } });
    const t = textos(arbol);
    expect(t).not.toContain('se esconde o se acerca');
    expect(t).not.toContain('Salía solo a la calle');
    expect(t).toContain('Volvé al punto exacto');
  });
});

describe('los enganches con lo que ya existe en la app', () => {
  it('el paso del afiche llama al generador de la ficha, no a una pantalla', async () => {
    const onAfiche = jest.fn();
    const arbol = await montar({ pet: { ...PERRO, creado_en: hs(5) }, onAfiche });

    // A las 5 horas el destacado es otro: este paso viene plegado y hay que
    // abrirlo. Que se abra al tocarlo es justamente lo que hace que quepan
    // varios pasos sin abrumar a nadie.
    expect(textos(arbol)).not.toContain('papel fluorescente');
    await abrirPaso(arbol, 'Pegá afiches grandes en las esquinas');
    expect(textos(arbol)).toContain('papel fluorescente');

    await act(async () => {
      boton(arbol, 'Crear el afiche')!.props.onPress();
    });
    expect(onAfiche).toHaveBeenCalled();
  });

  it('el paso de las veterinarias abre la pantalla de Ayuda que ya existe', async () => {
    const navigation = { navigate: jest.fn() };
    const arbol = await montar({ pet: { ...PERRO, creado_en: hs(5) }, navigation });
    // el destacado a las 5 horas es el primero de la ventana "hoy"
    const b = boton(arbol, 'Ver veterinarias y refugios');
    expect(b).toBeDefined();
    await act(async () => {
      b!.props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('Ayuda', undefined);
  });

  it('sin quien atienda la acción, no se dibuja un botón que no hace nada', async () => {
    const arbol = await montar({ pet: { ...PERRO, creado_en: hs(5) } });
    await abrirPaso(arbol, 'Pegá afiches grandes en las esquinas');
    expect(boton(arbol, 'Crear el afiche')).toBeUndefined();
    expect(boton(arbol, 'Ver veterinarias y refugios')).toBeUndefined();
  });
});

describe('el tono en pantalla', () => {
  it('no hay porcentajes de progreso ni celebraciones', async () => {
    const arbol = await montar({ pet: PERRO });
    const t = textos(arbol);
    expect(t).not.toMatch(/\d+\s*%/);
    expect(t).not.toMatch(/completad|felicitac|¡/i);
  });

  it('avisa que lo marcado no sale del teléfono', async () => {
    const arbol = await montar({ pet: PERRO });
    expect(textos(arbol)).toContain('sólo en este teléfono');
  });
});
