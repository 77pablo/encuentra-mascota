// Guardas de FORMA (patrón vectorFoto.test.ts / cierre por lectura del fuente):
// jest-expo no monta baratos estos componentes con react-native, así que se ata
// el cableado leyendo el archivo.
const leer = (rel: string) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', rel), 'utf8');

const comp = () => leer('components/DifundirEnRedes.tsx');
const pantalla = () => leer('screens/PetDetailScreen.tsx');

describe('DifundirEnRedes', () => {
  it('usa armarTextoDifusion y gruposSugeridos, no reinventa', () => {
    expect(comp()).toMatch(/armarTextoDifusion/);
    expect(comp()).toMatch(/gruposSugeridos/);
  });

  it('abre los grupos con Linking.openURL, no navega adentro', () => {
    expect(comp()).toMatch(/Linking\.openURL/);
  });

  it('copia con el portapapeles del navegador (patrón del repo, no expo-clipboard)', () => {
    expect(comp()).toMatch(/navigator\??\.clipboard|clipboard\??\.writeText/);
  });

  it('no filtra el teléfono ni el monto (los arma armarTextoDifusion, que ya lo cuida)', () => {
    // El componente NO debe construir su propio texto con el teléfono; delega.
    expect(comp()).not.toMatch(/telefono|whatsappDigits/);
  });
});

describe('PetDetailScreen ofrece Difundir en redes', () => {
  it('el reporte propio tiene el botón y monta la hoja', () => {
    expect(pantalla()).toMatch(/DifundirEnRedes/);
    expect(pantalla()).toMatch(/Difundir en redes/);
  });
});
