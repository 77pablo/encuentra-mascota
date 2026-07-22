import { GUIA_ENCONTRADA, RUTAS_GUIA_ENCONTRADA, type GuiaEncontradaPaso } from '../../src/data/guiaEncontrada';

describe('GUIA_ENCONTRADA (contenido de la guía "encontré una mascota")', () => {
  it('tiene los 7 pasos del espejo de guiaPerdida', () => {
    expect(GUIA_ENCONTRADA.length).toBeGreaterThanOrEqual(6);
  });

  it('todos los ids son únicos', () => {
    const ids = GUIA_ENCONTRADA.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada paso tiene id, título y detalle no vacíos', () => {
    for (const paso of GUIA_ENCONTRADA) {
      expect(typeof paso.id).toBe('string');
      expect(paso.id.trim().length).toBeGreaterThan(0);
      expect(paso.titulo.trim().length).toBeGreaterThan(0);
      expect(paso.detalle.trim().length).toBeGreaterThan(0);
    }
  });

  it('los ids son slugs estables (minúsculas, guiones)', () => {
    for (const paso of GUIA_ENCONTRADA) {
      expect(paso.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('las acciones internas solo apuntan a rutas ya existentes', () => {
    for (const paso of GUIA_ENCONTRADA) {
      if (!paso.accion || paso.accion.url) continue;
      expect(paso.accion.label.trim().length).toBeGreaterThan(0);
      expect(RUTAS_GUIA_ENCONTRADA).toContain(paso.accion.ruta);
    }
  });

  it('al menos un paso ofrece publicar preseleccionado como "encontrada"', () => {
    const publica = GUIA_ENCONTRADA.find((p) => p.accion?.ruta === 'Publicar');
    expect(publica).toBeDefined();
    expect(publica?.accion?.params).toEqual({ estado: 'encontrada' });
  });

  it('el paso del Registro Nacional de Mascotas es un link externo (http/https)', () => {
    const registro = GUIA_ENCONTRADA.find((p) => p.id === 'registro-nacional-de-mascotas');
    expect(registro?.accion?.url).toMatch(/^https?:\/\//);
    expect(registro?.accion?.ruta).toBeUndefined();
  });

  it('el tipo GuiaEncontradaPaso deja la acción opcional', () => {
    const soloTexto: GuiaEncontradaPaso = { id: 'x', titulo: 't', detalle: 'd' };
    expect(soloTexto.accion).toBeUndefined();
  });
});
