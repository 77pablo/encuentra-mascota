import React from 'react';
import { Share } from 'react-native';
import { act, create } from 'react-test-renderer';

// LA HOJA PREVIA AL AFICHE.
//
// Antes, sin WhatsApp cargado, `crearAfiche` expulsaba directo a Perfil (ver
// A3 en la spec de tanda 13): ese comportamiento muere acá. Esta hoja
// reemplaza ese redirect por una decisión del dueño (número prendido por
// defecto, apagable) y deja el texto de imprenta a mano. Dos toques:
// abrir la hoja y "Descargar afiche".

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

import AficheOpciones from '../../src/components/AficheOpciones';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { Button } from '../../src/ui';
import { Pet } from '../../src/services/pets';

const PET: Pet = {
  id: 'pet-1',
  user_id: 'la-dueña',
  estado: 'perdida',
  especie: 'perro',
  raza: null,
  nombre: 'Rocco',
  descripcion: 'Marrón, collar rojo.',
  fotos: [],
  lat: -33.4,
  lng: -70.6,
  recompensa: null,
  activo: true,
  oculto: false,
  creado_en: new Date().toISOString(),
};

// Mismo andamiaje que __tests__/components/planBusqueda.test.tsx y el
// `textos(arbol)` de __tests__/screens/perfilPropioInstitucion.test.tsx:94-99.
function textos(arbol: any): string[] {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'));
}

async function montar(profile: { telefono: string | null }, onGenerar = jest.fn()) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <AficheOpciones pet={PET} profile={profile} onGenerar={onGenerar} onCerrar={jest.fn()} />
      </ThemeProvider>,
    );
  });
  return arbol;
}

const buscarSwitch = (arbol: any) => arbol.root.findAllByProps({ testID: 'switch-numero' })[0] ?? null;

const apagarSwitch = (arbol: any) => {
  const sw = buscarSwitch(arbol);
  act(() => {
    sw.props.onValueChange(false);
  });
};

const tocarBoton = (arbol: any, title: string) => {
  const b = arbol.root.findAllByType(Button).find((n: any) => n.props.title === title);
  act(() => {
    b!.props.onPress();
  });
};

it('con WhatsApp cargado arranca prendido y avisa el costo de apagarlo', async () => {
  const arbol = await montar({ telefono: '+56911111111' });
  expect(textos(arbol)).toContain('Incluir mi número de WhatsApp');
  apagarSwitch(arbol);
  expect(textos(arbol).join(' ')).toContain('Sin tu número puede avisar menos gente');
});

it('sin WhatsApp no hay interruptor: hay una línea honesta y el afiche sale igual', async () => {
  const arbol = await montar({ telefono: null });
  expect(textos(arbol).join(' ')).toContain('solo con el QR');
  expect(buscarSwitch(arbol)).toBeNull();
});

it('Descargar llama a onGenerar con la decisión del interruptor', async () => {
  const onGenerar = jest.fn();
  const arbol = await montar({ telefono: '+56911111111' }, onGenerar);
  apagarSwitch(arbol);
  tocarBoton(arbol, 'Descargar afiche');
  expect(onGenerar).toHaveBeenCalledWith(false);
});

it('el texto de imprenta se comparte entero', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
  const arbol = await montar({ telefono: '+56911111111' });
  tocarBoton(arbol, 'Copiar texto para la fotocopiadora');
  expect(share.mock.calls[0][0].message).toContain('fluorescente');
});
