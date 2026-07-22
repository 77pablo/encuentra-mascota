import * as fs from 'fs';
import * as path from 'path';
import { rutaANavegacion } from './rutaANavegacion';

const UUID = '11111111-2222-3333-4444-555555555555';

describe('rutaANavegacion', () => {
  it('/adopcion/<uuid> → AdopcionDetail', () => {
    expect(rutaANavegacion(`/adopcion/${UUID}`)).toEqual({
      name: 'AdopcionDetail',
      params: { id: UUID },
    });
  });

  it('/mascota/<uuid> → MascotaPublica', () => {
    expect(rutaANavegacion(`/mascota/${UUID}`)).toEqual({
      name: 'MascotaPublica',
      params: { id: UUID },
    });
  });

  it('ruta desconocida → null', () => {
    expect(rutaANavegacion('/collar/algo')).toBeNull();
    expect(rutaANavegacion('/adopcion-preguntas/1')).toBeNull();
  });

  it('vacía o ausente → null', () => {
    expect(rutaANavegacion('')).toBeNull();
    expect(rutaANavegacion(null)).toBeNull();
    expect(rutaANavegacion(undefined)).toBeNull();
  });

  it('tipos inesperados (no-string) → null', () => {
    expect(rutaANavegacion(42)).toBeNull();
    expect(rutaANavegacion({ ruta: `/adopcion/${UUID}` })).toBeNull();
    expect(rutaANavegacion(['/adopcion/', UUID])).toBeNull();
  });

  it('id que no es un uuid válido → null', () => {
    expect(rutaANavegacion('/adopcion/no-es-un-uuid')).toBeNull();
    expect(rutaANavegacion('/mascota/123')).toBeNull();
  });

  it('barra final tolerada', () => {
    expect(rutaANavegacion(`/adopcion/${UUID}/`)).toEqual({
      name: 'AdopcionDetail',
      params: { id: UUID },
    });
  });

  it('/mis-mascotas → destino anidado App/Perfil/MyPets (ruta de escaneo_collar)', () => {
    expect(rutaANavegacion('/mis-mascotas')).toEqual({
      name: 'App',
      params: { screen: 'Perfil', params: { screen: 'MyPets' } },
    });
  });

  it('/mis-mascotas con barra final también resuelve', () => {
    expect(rutaANavegacion('/mis-mascotas/')).toEqual({
      name: 'App',
      params: { screen: 'Perfil', params: { screen: 'MyPets' } },
    });
  });
});

// No-tautológico: los nombres de pantalla que arma esta función deben existir
// REALMENTE como pantallas del stack raíz en RootNavigator (no una whitelist
// duplicada acá). Si algún día cambia el nombre registrado, esta prueba
// revienta antes que un push roto en producción.
describe('rutaANavegacion — nombres reales del stack raíz', () => {
  const rootSource = fs.readFileSync(
    path.join(__dirname, '../navigation/RootNavigator.tsx'),
    'utf8',
  );

  it('"AdopcionDetail" está registrado como Stack.Screen del stack raíz', () => {
    expect(rootSource).toMatch(/Stack\.Screen\s+name="AdopcionDetail"/);
  });

  it('"MascotaPublica" está registrado como Stack.Screen del stack raíz', () => {
    expect(rootSource).toMatch(/Stack\.Screen\s+name="MascotaPublica"/);
  });

  // MyPets no vive en el stack raíz: vive dentro del stack de la pestaña
  // Perfil (TabNavigator.tsx). Mismo espíritu no-tautológico: se verifica
  // contra el registro real, no una whitelist duplicada.
  const tabSource = fs.readFileSync(
    path.join(__dirname, '../navigation/TabNavigator.tsx'),
    'utf8',
  );

  it('"MyPets" está registrado dentro del stack de la pestaña Perfil', () => {
    expect(tabSource).toMatch(/ProfileStackNav\.Screen\s+name="MyPets"/);
  });
});
