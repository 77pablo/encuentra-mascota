import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import AvisoDuenoChat, { TEXTO_AVISO_DUENO } from '../../src/components/AvisoDuenoChat';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const SENA = 'cicatriz chica en la panza';

async function montar(props: React.ComponentProps<typeof AvisoDuenoChat>) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <AvisoDuenoChat {...props} />
      </ThemeProvider>,
    );
  });
  return arbol;
}

// Todo el texto visible del árbol, concatenado.
function textoDe(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.children?.[0] === 'string')
    .map((n: any) => n.children.join(''))
    .join(' | ');
}

describe('AvisoDuenoChat', () => {
  it('sin seña y sin alerta no dibuja NADA', async () => {
    // Esta pantalla la mira alguien esperando noticias de su perro. Un cartel que
    // no aporta es ruido puesto en el peor momento.
    const arbol = await montar({ senas: null });
    expect(arbol.toJSON()).toBeNull();
  });

  it('una fila con las dos señas vacías tampoco dibuja nada', async () => {
    const arbol = await montar({ senas: { sena1: null, sena2: null } });
    expect(arbol.toJSON()).toBeNull();
  });

  it('con seña guardada pide que la describan, y avisa lo del dinero', async () => {
    const arbol = await montar({ senas: { sena1: SENA, sena2: null } });
    const texto = textoDe(arbol);
    expect(texto).toContain(TEXTO_AVISO_DUENO.conSena);
    expect(texto).toContain(TEXTO_AVISO_DUENO.dinero);
  });

  it('LA SEÑA ARRANCA TAPADA', async () => {
    // Es un dato que existe justamente para no estar a la vista, y el chat se lee
    // en la calle, en el metro, con gente al lado.
    const arbol = await montar({ senas: { sena1: SENA, sena2: 'cojea de atrás' } });
    const texto = textoDe(arbol);
    expect(texto).not.toContain(SENA);
    expect(texto).not.toContain('cojea de atrás');
    expect(texto).toContain(TEXTO_AVISO_DUENO.ver);
  });

  it('se revela al tocar "Ver mi seña", y se puede volver a tapar', async () => {
    const arbol = await montar({ senas: { sena1: SENA, sena2: 'cojea de atrás' } });
    const boton = arbol.root
      .findAllByType(TouchableOpacity)
      .find((b: any) => b.props.accessibilityLabel === TEXTO_AVISO_DUENO.ver);
    expect(boton).toBeTruthy();

    await act(async () => boton.props.onPress());
    const abierto = textoDe(arbol);
    expect(abierto).toContain(SENA);
    expect(abierto).toContain('cojea de atrás');
    expect(abierto).toContain(TEXTO_AVISO_DUENO.ocultar);

    await act(async () => boton.props.onPress());
    expect(textoDe(arbol)).not.toContain(SENA);
  });

  it('con alerta de pago avisa, aunque no haya ninguna seña guardada', async () => {
    const arbol = await montar({ senas: null, alertaPago: true });
    expect(arbol.toJSON()).not.toBeNull();
    expect(textoDe(arbol)).toContain(TEXTO_AVISO_DUENO.alerta);
  });

  it('el aviso de pago NO acusa a nadie', async () => {
    // Criterio de tono: la mayoría de la gente que escribe es honesta. El texto
    // tiene que dar una instrucción, no un veredicto sobre la otra persona.
    const t = TEXTO_AVISO_DUENO.alerta.toLowerCase();
    expect(t).toContain('no es prueba de nada');
    for (const acusacion of ['estafador', 'estafa', 'ladron', 'ladrón', 'delincuente', 'miente']) {
      expect(t).not.toContain(acusacion);
    }
  });
});
