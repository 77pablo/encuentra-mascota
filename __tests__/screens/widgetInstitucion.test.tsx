const leer = (rel: string) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', rel), 'utf8');

describe('WidgetInstitucionScreen', () => {
  const pantalla = () => leer('screens/WidgetInstitucionScreen.tsx');

  it('usa armarCodigoEmbed y el picker de comunas', () => {
    expect(pantalla()).toMatch(/armarCodigoEmbed/);
    expect(pantalla()).toMatch(/ComunaPickerModal/);
  });

  it('copia el código y ofrece ver el preview', () => {
    expect(pantalla()).toMatch(/clipboard|writeText/);
    expect(pantalla()).toMatch(/urlWidget|Linking\.openURL|abrirEnlace/);
  });
});

describe('cableado', () => {
  it('WidgetInstitucion está registrada en el stack raíz con header', () => {
    const nav = leer('navigation/RootNavigator.tsx');
    expect(nav).toMatch(/name="WidgetInstitucion"/);
    expect(nav).toMatch(/WidgetInstitucionScreen/);
  });

  it('se llega desde Perfil', () => {
    expect(leer('screens/ProfileScreen.tsx')).toMatch(/WidgetInstitucion/);
  });

  it('se llega desde Ayuda', () => {
    expect(leer('screens/AyudaScreen.tsx')).toMatch(/navigate\('WidgetInstitucion'\)/);
  });
});
