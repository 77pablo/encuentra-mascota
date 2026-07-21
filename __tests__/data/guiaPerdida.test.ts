import { GUIA_PERDIDA, RUTAS_GUIA, type GuiaPaso } from '../../src/data/guiaPerdida';

describe('GUIA_PERDIDA (contenido de la guía "recién se me perdió")', () => {
  it('tiene los pasos suficientes para acompañar la primera hora', () => {
    // El spec pide ~7 pasos; exigimos al menos 6 para no quedar en un folleto.
    expect(GUIA_PERDIDA.length).toBeGreaterThanOrEqual(6);
  });

  it('todos los ids son únicos', () => {
    const ids = GUIA_PERDIDA.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada paso tiene id, título y detalle no vacíos', () => {
    for (const paso of GUIA_PERDIDA) {
      expect(typeof paso.id).toBe('string');
      expect(paso.id.trim().length).toBeGreaterThan(0);
      expect(paso.titulo.trim().length).toBeGreaterThan(0);
      expect(paso.detalle.trim().length).toBeGreaterThan(0);
    }
  });

  it('los ids son slugs estables (minúsculas, guiones)', () => {
    for (const paso of GUIA_PERDIDA) {
      expect(paso.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('las acciones solo apuntan a pantallas que ya existen', () => {
    // Regla de diseño: los pasos que enlazan a otras funciones de la tanda son
    // solo texto; las acciones navegan a pantallas ya existentes en esta rama.
    for (const paso of GUIA_PERDIDA) {
      if (!paso.accion) continue;
      expect(paso.accion.label.trim().length).toBeGreaterThan(0);
      expect(RUTAS_GUIA).toContain(paso.accion.ruta);
    }
  });

  it('al menos un paso ofrece la acción de publicar el reporte', () => {
    const publica = GUIA_PERDIDA.some((p) => p.accion?.ruta === 'Publicar');
    expect(publica).toBe(true);
  });

  it('el tipo GuiaPaso deja la acción opcional', () => {
    // Chequeo de tipos en tiempo de compilación: un paso sin acción es válido.
    const soloTexto: GuiaPaso = { id: 'x', titulo: 't', detalle: 'd' };
    expect(soloTexto.accion).toBeUndefined();
  });
});
