import React from 'react';
import { act, create } from 'react-test-renderer';

// EDITAR UN REPORTE NO PUEDE PERDER DATOS EN SILENCIO.
//
// Dos pérdidas distintas, las dos encontradas por la revisión final de la
// tanda 10, las dos con la misma forma: escribir vacío encima de algo real.
//
// 1. LA SEÑA SECRETA. `obtenerSenasPrivadas` devuelve `null` ante CUALQUIER
//    problema (sin fila, sin migración, red caída). Eso dejaba las casillas
//    vacías, y dos vacías significan "borrala" para el servicio. O sea: se abría
//    Editar con mala señal, se corregía una coma de la descripción, y la seña
//    desaparecía de la base. Sin error y sin aviso. El dueño seguía creyendo que
//    tenía con qué verificar a quien lo llamara — que es exactamente lo que esa
//    función existe para evitar. Misma trampa que el perfil degradado que
//    guardaba '' encima del teléfono real.
//
// 2. EL MONTO DE LA RECOMPENSA. La vista dejó de mostrar la cifra a propósito
//    (atrae estafadores), pero el formulario la REESCRIBÍA con el centinela
//    'sí' en cada guardado, así que la cifra se perdía de la base para siempre.
//    Sacarla de la vista es la decisión de producto; borrarla a espaldas del
//    dueño, no.

jest.setTimeout(30000);

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const mockUpdatePet = jest.fn(async (_id: string, _campos: any) => {});
jest.mock('../../src/services/pets', () => ({
  updatePet: (id: string, campos: any) => mockUpdatePet(id, campos),
}));

const mockObtener = jest.fn(async (_id: string) => null as any);
const mockGuardar = jest.fn(async (_id: string, _uid: string, _s1: string, _s2: string) => true);
jest.mock('../../src/services/senasPrivadas', () => ({
  obtenerSenasPrivadas: (id: string) => mockObtener(id),
  guardarSenasPrivadas: (id: string, uid: string, s1: string, s2: string) =>
    mockGuardar(id, uid, s1, s2),
}));

jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: () => Promise.resolve(true),
}));

import EditPetScreen from '../../src/screens/EditPetScreen';
import { Button } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

const PET_CON_MONTO = {
  id: 'p-1',
  user_id: 'yo',
  estado: 'perdida',
  especie: 'perro',
  raza: 'Quiltro',
  nombre: 'Pelusa',
  descripcion: 'Muy bueno',
  recompensa: '$50.000',
  lat: -33.4,
  lng: -70.6,
  fotos: [],
  activo: true,
  creado_en: '2026-07-01T00:00:00Z',
};

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

async function montar(pet: any = PET_CON_MONTO) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <EditPetScreen route={{ params: { pet } }} navigation={navigation} />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  return arbol!;
}

function guardar(arbol: any) {
  return arbol.root
    .findAllByType(Button)
    .find((b: any) => /guardar/i.test(String(b.props.title ?? '')));
}

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

beforeEach(() => {
  mockUpdatePet.mockClear();
  mockGuardar.mockClear();
  mockObtener.mockReset();
});

describe('la seña secreta', () => {
  it('si NO se pudo leer, guardar no la toca', async () => {
    mockObtener.mockResolvedValue(null); // red caída / sin migración / sin fila
    const arbol = await montar();

    await act(async () => guardar(arbol).props.onPress());

    expect(mockUpdatePet).toHaveBeenCalled(); // el reporte sí se guarda
    expect(mockGuardar).not.toHaveBeenCalled(); // la seña NO se toca
    await act(async () => arbol.unmount());
  });

  it('y lo DICE, en vez de mostrar dos casillas vacías', async () => {
    mockObtener.mockResolvedValue(null);
    const arbol = await montar();
    expect(textos(arbol).toLowerCase()).toContain('no pudimos leer tu seña');
    await act(async () => arbol.unmount());
  });

  it('si se leyó bien, guardar la conserva', async () => {
    mockObtener.mockResolvedValue({ sena1: 'cicatriz en la panza', sena2: '' });
    const arbol = await montar();

    await act(async () => guardar(arbol).props.onPress());

    expect(mockGuardar).toHaveBeenCalledWith('p-1', 'yo', 'cicatriz en la panza', '');
    await act(async () => arbol.unmount());
  });

  it('vaciarla a propósito SÍ la borra (el camino legítimo sigue vivo)', async () => {
    // Devolver una fila con las dos vacías = la leímos y están vacías.
    mockObtener.mockResolvedValue({ sena1: '', sena2: '' });
    const arbol = await montar();

    await act(async () => guardar(arbol).props.onPress());

    expect(mockGuardar).toHaveBeenCalledWith('p-1', 'yo', '', '');
    await act(async () => arbol.unmount());
  });
});

describe('el monto de la recompensa', () => {
  it('no se pisa al guardar un reporte viejo que lo tenía', async () => {
    mockObtener.mockResolvedValue({ sena1: '', sena2: '' });
    const arbol = await montar(PET_CON_MONTO);

    await act(async () => guardar(arbol).props.onPress());

    const [, campos] = mockUpdatePet.mock.calls[0] as any;
    expect(campos.recompensa).toBe('$50.000');
    await act(async () => arbol.unmount());
  });

  it('un reporte sin recompensa sigue guardando vacío', async () => {
    mockObtener.mockResolvedValue({ sena1: '', sena2: '' });
    const arbol = await montar({ ...PET_CON_MONTO, recompensa: '' });

    await act(async () => guardar(arbol).props.onPress());

    const [, campos] = mockUpdatePet.mock.calls[0] as any;
    expect(campos.recompensa).toBe('');
    await act(async () => arbol.unmount());
  });
});
