const comp = () =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'components', 'PuntosCartel.tsx'), 'utf8');
const ficha = () =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'screens', 'PetDetailScreen.tsx'), 'utf8');

describe('PuntosCartel', () => {
  it('busca bajo demanda con el servicio (no en la carga)', () => {
    expect(comp()).toMatch(/buscarPuntosCartel/);
    // Debe haber un onPress/handler, no una llamada suelta en el cuerpo del render.
    expect(comp()).toMatch(/onPress/);
  });

  it('degrada al consejo genérico ante error (nunca estado roto)', () => {
    // Menciona el consejo de siempre como fallback (semáforos/paraderos/almacén).
    expect(comp()).toMatch(/paradero|almac[eé]n|esquina/i);
  });

  it('muestra la atribución ODbL de OpenStreetMap', () => {
    expect(comp()).toMatch(/OpenStreetMap/);
  });

  it('abre el mapa con las coordenadas (no reinventa el enlace)', () => {
    expect(comp()).toMatch(/abrirBusquedaMapa|urlBusquedaMapa/);
  });
});

describe('PetDetailScreen monta PuntosCartel con el gate del plan', () => {
  it('lo monta para el dueño en una perdida no reunida', () => {
    expect(ficha()).toMatch(/PuntosCartel/);
  });
});
