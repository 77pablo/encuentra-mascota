import { GUIA_ROBADA } from '../../src/data/guiaRobada';

const leer = (rel: string) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', rel), 'utf8');

describe('datos de la guía robada', () => {
  it('tiene los temas clave: denuncia, no negociar, pruebas', () => {
    const texto = GUIA_ROBADA.map((p) => `${p.titulo} ${p.detalle}`).join(' ').toLowerCase();
    expect(texto).toMatch(/carabineros|denunci|pdi/);
    expect(texto).toMatch(/no.*(pagu|negoci)/);
    expect(texto).toMatch(/chip|prueba|vacun/);
  });

  it('cada acción apunta solo a rutas existentes (no navega a lo que no existe)', () => {
    for (const paso of GUIA_ROBADA) {
      if (paso.accion) {
        expect(['Publicar', 'Explorar', 'Ayuda']).toContain(paso.accion.ruta);
      }
    }
  });
});

describe('registro de GuiaRobada', () => {
  it('está registrada en el stack raíz con header y su componente', () => {
    const nav = leer('navigation/RootNavigator.tsx');
    expect(nav).toMatch(/name="GuiaRobada"/);
    expect(nav).toMatch(/GuiaRobadaScreen/);
    expect(nav).toMatch(/headerShown:\s*true[\s\S]{0,120}Robada|GuiaRobada[\s\S]{0,160}headerShown:\s*true/);
  });

  it('la ficha ofrece la guía con navegación anidada absoluta (no nombre pelado)', () => {
    const ficha = leer('screens/PetDetailScreen.tsx');
    expect(ficha).toMatch(/GuiaRobada/);
  });
});
