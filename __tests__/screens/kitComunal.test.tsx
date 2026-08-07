const leer = (rel: string) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', rel), 'utf8');

describe('kit comunal — pantalla y cableado', () => {
  it('la pantalla usa los textos de lib/kitComunal (no los duplica)', () => {
    const s = leer('screens/KitComunalScreen.tsx');
    expect(s).toMatch(/mensajesKit/);
    expect(s).toMatch(/clipboard|writeText/);
  });

  it('el afiche comunal usa paleta CLARA fija (regla de assets imprimibles)', () => {
    const s = leer('components/AficheComunal.tsx');
    expect(s).toMatch(/lightColors/);
    expect(s).not.toMatch(/useColors\(/);
  });

  it('KitComunal está en el stack raíz', () => {
    const nav = leer('navigation/RootNavigator.tsx');
    expect(nav).toMatch(/name="KitComunal"/);
    expect(nav).toMatch(/KitComunalScreen/);
  });

  it('se llega desde Ayuda', () => {
    expect(leer('screens/AyudaScreen.tsx')).toMatch(/navigate\('KitComunal'\)/);
  });

  it('se llega desde Perfil TAMBIÉN como invitado (lección de la T20)', () => {
    const entradas = leer('screens/ProfileScreen.tsx').match(/navigate\('KitComunal'\)/g) ?? [];
    expect(entradas.length).toBeGreaterThanOrEqual(2);
  });
});
