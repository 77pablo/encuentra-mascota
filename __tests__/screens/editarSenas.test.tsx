import React from 'react';
import { act, create } from 'react-test-renderer';

// EDITAR LAS SEÑAS Y EL CHIP SIN PERDER NADA.
//
// El chip repite EXACTAMENTE la forma del bug que ya documentó
// `editarNoPierdeDatos.test.tsx` con la seña secreta: el servicio devuelve
// "no se pudo leer" ante cualquier problema (sin migración, sin permiso, red
// caída), eso deja la casilla vacía, y guardar con la casilla vacía significa
// BORRAR. Se abre Editar con mala señal, se corrige una coma de la descripción,
// y el número de chip —el dato más fuerte del motor de coincidencias, y el que
// más cuesta conseguir— desaparece de la base. Sin error y sin aviso.
//
// Por eso `leerChip` devuelve un tercer estado y esta pantalla lo respeta.

jest.setTimeout(30000);

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const mockUpdatePet = jest.fn(async (_id: string, _campos: any) => {});
jest.mock('../../src/services/pets', () => ({
  updatePet: (id: string, campos: any) => mockUpdatePet(id, campos),
}));

jest.mock('../../src/services/senasPrivadas', () => ({
  obtenerSenasPrivadas: async () => ({ sena1: 'cicatriz', sena2: null }),
  guardarSenasPrivadas: async () => true,
}));

let mockLectura: any = { chip: null };
const mockGuardarChip = jest.fn(async (_id: string, _uid: string, _chip: string) => true);
jest.mock('../../src/services/petChip', () => ({
  leerChip: async () => mockLectura,
  guardarChip: (id: string, uid: string, chip: string) => mockGuardarChip(id, uid, chip),
}));

const mockNotify = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  notify: (...a: any[]) => mockNotify(...a),
  confirmAction: () => Promise.resolve(true),
}));

import EditPetScreen from '../../src/screens/EditPetScreen';
import { Button, Chip, Input } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

const PET = {
  id: 'p-1',
  user_id: 'yo',
  estado: 'perdida',
  especie: 'perro',
  raza: 'Quiltro',
  nombre: 'Pelusa',
  descripcion: 'Muy bueno',
  recompensa: null,
  lat: -33.4,
  lng: -70.6,
  fotos: [],
  activo: true,
  oculto: false,
  creado_en: new Date().toISOString(),
};

const montados: any[] = [];

async function montar(pet: any = PET) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <EditPetScreen route={{ params: { pet } }} navigation={{ goBack: jest.fn() }} />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  montados.push(arbol);
  return arbol;
}

async function guardar(arbol: any) {
  await act(async () => {
    arbol.root
      .findAllByType(Button)
      .find((b: any) => b.props.title === 'Guardar cambios')
      .props.onPress();
  });
  await act(async () => {});
}

async function tocar(arbol: any, label: string) {
  const chips = arbol.root.findAllByType(Chip).filter((c: any) => c.props.label === label);
  expect(chips.length).toBeGreaterThan(0);
  await act(async () => {
    chips[0].props.onPress();
  });
  await act(async () => {});
}

function inputCon(arbol: any, placeholder: string) {
  const i = arbol.root.findAllByType(Input).filter((x: any) => x.props.placeholder === placeholder);
  expect(i).toHaveLength(1);
  return i[0];
}

const PLACEHOLDER_CHIP = 'Ej: 985112003456789';

beforeEach(() => {
  mockUpdatePet.mockClear();
  mockGuardarChip.mockClear();
  mockNotify.mockReset();
  mockLectura = { chip: null };
});

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('las señas al editar', () => {
  it('llegan precargadas con lo que tenía el reporte', async () => {
    const arbol = await montar({ ...PET, colores: ['negro'], tamano: 'grande' });
    const activos = arbol.root
      .findAllByType(Chip)
      .filter((c: any) => c.props.active)
      .map((c: any) => c.props.label);
    expect(activos).toContain('Negro');
    expect(activos).toContain('Grande');
  });

  it('lo que se cambia se guarda', async () => {
    const arbol = await montar();
    await tocar(arbol, 'Gris');
    await tocar(arbol, 'Chico');
    await guardar(arbol);
    expect(mockUpdatePet.mock.calls[0][1]).toEqual(
      expect.objectContaining({ colores: ['gris'], tamano: 'chico' }),
    );
  });

  it('soltarlas todas las guarda como null, no como lista vacía', async () => {
    // `{}` y null son dos formas de decir lo mismo, y la base terminaría con
    // las dos. Además el CHECK de la 0054 tolera `{}` justo para que un
    // descuido acá no impida guardar, pero eso no es excusa para mandarlo.
    const arbol = await montar({ ...PET, colores: ['negro'] });
    await tocar(arbol, 'Negro');
    await guardar(arbol);
    expect(mockUpdatePet.mock.calls[0][1].colores).toBeNull();
  });
});

describe('el número de chip al editar', () => {
  it('se precarga y se guarda', async () => {
    mockLectura = { chip: '985112003456789' };
    const arbol = await montar();
    expect(inputCon(arbol, PLACEHOLDER_CHIP).props.value).toBe('985112003456789');
    await guardar(arbol);
    expect(mockGuardarChip).toHaveBeenCalledWith('p-1', 'yo', '985112003456789');
  });

  it('se puede agregar más tarde (es lo normal: lo lee el veterinario)', async () => {
    const arbol = await montar();
    await act(async () => {
      inputCon(arbol, PLACEHOLDER_CHIP).props.onChangeText('985112003456789');
    });
    await guardar(arbol);
    expect(mockGuardarChip).toHaveBeenCalledWith('p-1', 'yo', '985112003456789');
  });

  it('SI NO SE PUDO LEER, guardar NO lo toca', async () => {
    // ES EL TEST QUE IMPORTA DEL ARCHIVO. `leerChip` devuelve null cuando no se
    // pudo saber qué había. Si la pantalla tratara eso como "no hay chip", la
    // casilla vacía se guardaría encima y borraría el número real.
    mockLectura = null;
    const arbol = await montar();
    await guardar(arbol);
    expect(mockGuardarChip).not.toHaveBeenCalled();
    expect(mockUpdatePet).toHaveBeenCalled(); // el resto sí se guarda
  });

  it('y lo dice, en vez de mostrar una casilla vacía que miente', async () => {
    mockLectura = null;
    const arbol = await montar();
    const inputs = arbol.root
      .findAllByType(Input)
      .filter((x: any) => x.props.placeholder === PLACEHOLDER_CHIP);
    expect(inputs).toHaveLength(0);
  });

  it('un chip imposible rebota y no se guarda nada', async () => {
    const arbol = await montar();
    await act(async () => {
      inputCon(arbol, PLACEHOLDER_CHIP).props.onChangeText('12');
    });
    await guardar(arbol);
    expect(mockNotify).toHaveBeenCalled();
    expect(mockUpdatePet).not.toHaveBeenCalled();
    expect(mockGuardarChip).not.toHaveBeenCalled();
  });
});
