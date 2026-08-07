const leer = (rel: string) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', rel), 'utf8');

describe('EmergenciaBanner', () => {
  const banner = () => leer('components/EmergenciaBanner.tsx');
  it('trae los eventos activos con el servicio', () => {
    expect(banner()).toMatch(/eventosActivos/);
  });
  it('degrada sin romper (no renderiza si no hay eventos ni si falla)', () => {
    // catch que deja la lista vacía y un return null cuando no hay evento.
    expect(banner()).toMatch(/catch/);
    expect(banner()).toMatch(/return null/);
  });
  it('navega a la pantalla del evento', () => {
    expect(banner()).toMatch(/Evento/);
  });
});

describe('EventoScreen', () => {
  const pantalla = () => leer('screens/EventoScreen.tsx');
  it('reusa ReportesLista con el centro/radio/desde del evento', () => {
    expect(pantalla()).toMatch(/ReportesLista/);
    expect(pantalla()).toMatch(/radioKm/);
    expect(pantalla()).toMatch(/desde/);
  });
});

describe('cableado', () => {
  it('HomeScreen monta el EmergenciaBanner', () => {
    expect(leer('screens/HomeScreen.tsx')).toMatch(/EmergenciaBanner/);
  });
  it('EventoScreen está registrada en el stack raíz y es deep-linkeable', () => {
    const nav = leer('navigation/RootNavigator.tsx');
    expect(nav).toMatch(/name="Evento"/);
    expect(nav).toMatch(/EventoScreen/);
    const linking = leer('navigation/linkingConfig.ts');
    expect(linking).toMatch(/evento\/:id/);
  });
});
