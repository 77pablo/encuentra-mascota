import * as fs from 'fs';
import * as path from 'path';
import { resolverNavegacionGuia, TABS_ANIDADOS } from './guiaNavegacion';

// No-tautológico: en vez de comparar contra una whitelist duplicada acá,
// leemos el código FUENTE real de los navigators y confirmamos que los
// nombres que usamos para decidir "esto es un tab, hace falta navegación
// anidada" están efectivamente registrados. Si algún día se renombra un tab o
// una pantalla del stack raíz, esta prueba revienta antes que un botón muerto
// en producción.
const tabSource = fs.readFileSync(path.join(__dirname, '../navigation/TabNavigator.tsx'), 'utf8');
const rootSource = fs.readFileSync(path.join(__dirname, '../navigation/RootNavigator.tsx'), 'utf8');

describe('TABS_ANIDADOS — contra los Tab.Screen REALES de TabNavigator', () => {
  it('cada tab que tratamos como anidado existe de verdad como Tab.Screen', () => {
    for (const tab of TABS_ANIDADOS) {
      expect(tabSource).toMatch(new RegExp(`Tab\\.Screen\\s+name="${tab}"`));
    }
  });
});

describe('resolverNavegacionGuia', () => {
  it('un tab anidado (p.ej. "Publicar") se resuelve como navegación anidada absoluta a "App"', () => {
    expect(resolverNavegacionGuia('Publicar', { estado: 'encontrada' })).toEqual({
      name: 'App',
      params: { screen: 'Publicar', params: { estado: 'encontrada' } },
    });
  });

  it('otro tab anidado ("Explorar"), sin params', () => {
    expect(resolverNavegacionGuia('Explorar')).toEqual({
      name: 'App',
      params: { screen: 'Explorar', params: undefined },
    });
  });

  it('una pantalla hermana del stack raíz ("Ayuda") se navega por nombre pelado', () => {
    expect(rootSource).toMatch(/Stack\.Screen\s+name="Ayuda"/);
    expect(resolverNavegacionGuia('Ayuda')).toEqual({ name: 'Ayuda', params: undefined });
  });
});

describe('registro de "GuiaEncontrada" en el stack raíz', () => {
  it('está registrada como Stack.Screen del stack raíz (hermana de "App")', () => {
    expect(rootSource).toMatch(/Stack\.Screen\s+name="GuiaEncontrada"/);
  });
});
