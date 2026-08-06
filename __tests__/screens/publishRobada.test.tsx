const p = () =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'screens', 'PublishScreen.tsx'), 'utf8');

describe('casilla "Me la robaron" en Publicar', () => {
  it('ofrece la casilla y maneja el estado robada', () => {
    expect(p()).toMatch(/Me la robaron/);
    expect(p()).toMatch(/setRobada|robada/);
  });

  it("estado sigue siendo binario 'perdida' | 'encontrada' (robada NO es estado)", () => {
    expect(p()).toMatch(/'perdida'\s*\|\s*'encontrada'/);
  });

  it('robada solo viaja cuando el estado es perdida', () => {
    // El payload no debe mandar robada=true en un reporte "encontrada".
    expect(p()).toMatch(/estado === 'perdida'[\s\S]{0,40}robada|robada[\s\S]{0,40}estado === 'perdida'/);
  });
});
